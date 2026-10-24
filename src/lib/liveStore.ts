import { ref, onValue, type Unsubscribe } from "firebase/database";
import { getLiveDb } from "./firebase";
import type { ActiveAlert, ClearEvent, Heartbeat } from "@/types";

/**
 * Single shared source of live alert state for the whole page.
 *
 * "realtime" (main site): Firebase websocket, falling back to polling the
 * CDN-cached /api/live when the socket can't connect (e.g. the RTDB instance
 * hit its connection limit during a surge).
 * "poll" (embeds): /api/live only, so a news-site embed can never eat into
 * the main site's websocket capacity.
 */

export type LiveMode = "realtime" | "poll";
export type LiveHealth = "ok" | "connecting" | "stale" | "source_down" | "offline";

export interface LiveSnapshot {
  alerts: Record<string, ActiveAlert> | null;
  uavTracks: Record<string, unknown> | null;
  clears: Record<string, ClearEvent> | null;
  heartbeat: Heartbeat | null;
  /** serverNow ≈ Date.now() + serverOffset */
  serverOffset: number;
  connected: boolean;
  source: "none" | "firebase" | "poll";
}

const POLL_INTERVAL_MS = 3000;
const FALLBACK_AFTER_MS = 8000;
/** Backend writes a heartbeat every 5s; allow for jitter and CDN cache age. */
const HEARTBEAT_STALE_MS = 25000;

const EMPTY: LiveSnapshot = {
  alerts: null,
  uavTracks: null,
  clears: null,
  heartbeat: null,
  serverOffset: 0,
  connected: false,
  source: "none",
};

let mode: LiveMode = "realtime";
let snapshot: LiveSnapshot = EMPTY;
const listeners = new Set<() => void>();
let stopFns: (() => void)[] = [];
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
let firebaseFailed = false;

function emit(patch: Partial<LiveSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

/** Must be called before the first component subscribes (embeds use "poll"). */
export function configureLive(nextMode: LiveMode) {
  mode = nextMode;
}

export function subscribeLive(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function getLiveSnapshot(): LiveSnapshot {
  return snapshot;
}

export function getServerLiveSnapshot(): LiveSnapshot {
  return EMPTY;
}

export function computeHealth(s: LiveSnapshot, now = Date.now()): LiveHealth {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (s.source === "none") return "connecting";
  // No heartbeat yet means a backend that predates it: don't raise false alarms.
  if (!s.heartbeat?.ts) return "ok";
  if (now + s.serverOffset - s.heartbeat.ts > HEARTBEAT_STALE_MS) return "stale";
  if (s.heartbeat.oref_ok === false) return "source_down";
  return "ok";
}

// ── lifecycle ────────────────────────────────────────────────────────────────

function start() {
  if (process.env.NODE_ENV === "development") {
    // Dev server: the DevPanel picks simulation, live Firebase, or /api/live polling.
    void import("./devSim").then((sim) => {
      if (listeners.size === 0) return;
      const source = sim.getDevSource();
      if (source === "sim") startSim(sim);
      else startTransport(source === "poll");
    });
    return;
  }
  startTransport(false);
}

function startTransport(forcePoll: boolean) {
  if (mode === "realtime" && !firebaseFailed && !forcePoll) startFirebase();
  else startPolling();

  const onVisibility = () => {
    if (document.visibilityState === "visible" && polling) pollNow();
  };
  document.addEventListener("visibilitychange", onVisibility);
  stopFns.push(() => document.removeEventListener("visibilitychange", onVisibility));
}

function stop() {
  stopFns.forEach((fn) => fn());
  stopFns = [];
  stopPolling();
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
  snapshot = EMPTY;
}

function startFirebase() {
  const db = getLiveDb();
  const onCancel = (err: Error) => {
    console.warn("[live] Firebase listener cancelled, switching to polling:", err.message);
    firebaseFailed = true;
    startPolling();
  };
  const listen = (path: string, cb: (val: unknown) => void): Unsubscribe =>
    onValue(ref(db, path), (snap) => cb(snap.val()), onCancel);

  stopFns.push(
    listen("public_state/active_alerts", (v) =>
      emit({ alerts: (v as LiveSnapshot["alerts"]) ?? {}, source: "firebase" }),
    ),
    listen("public_state/uav_tracks", (v) => emit({ uavTracks: (v as LiveSnapshot["uavTracks"]) ?? {} })),
    listen("public_state/clears", (v) => emit({ clears: (v as LiveSnapshot["clears"]) ?? {} })),
    listen("public_state/heartbeat", (v) => emit({ heartbeat: (v as Heartbeat | null) ?? null })),
    onValue(ref(db, ".info/serverTimeOffset"), (snap) => emit({ serverOffset: Number(snap.val()) || 0 })),
    onValue(ref(db, ".info/connected"), (snap) => {
      const connected = snap.val() === true;
      emit({ connected });
      if (connected) {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = null;
        // A cancelled listener (e.g. permission/quota) never delivers again; keep polling then.
        if (!firebaseFailed) stopPolling();
      } else if (!firebaseFailed) {
        scheduleFallback();
      }
    }),
  );
  scheduleFallback();
}

function startSim(sim: typeof import("./devSim")) {
  const push = () => {
    const s = sim.getSim();
    emit({
      alerts: s.alerts,
      uavTracks: s.uavTracks,
      clears: s.clears,
      heartbeat: sim.simHeartbeat(s.health),
      serverOffset: 0,
      connected: true,
      source: "firebase",
    });
  };
  push();
  // Re-emit so the fake heartbeat keeps ticking (alert objects keep their identity).
  const id = setInterval(push, 3000);
  stopFns.push(sim.subscribeSim(push), () => clearInterval(id));
}

function scheduleFallback() {
  if (fallbackTimer || polling) return;
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null;
    if (!snapshot.connected) startPolling();
  }, FALLBACK_AFTER_MS);
}

// ── polling ──────────────────────────────────────────────────────────────────

function startPolling() {
  if (polling) return;
  polling = true;
  pollNow();
}

function stopPolling() {
  polling = false;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

/** Keep the previous object when a polled node is unchanged, so memoized work
 * downstream (polygon unions!) doesn't redo itself every 3 seconds. */
function same<T>(prev: T | null, next: T): T {
  return prev !== null && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

async function pollNow() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (!polling) return;
  // Hidden tabs don't need updates; visibilitychange restarts the loop.
  if (document.visibilityState === "hidden") return;
  try {
    const res = await fetch("/api/live", { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      if (polling) {
        emit({
          alerts: same(snapshot.alerts, body.alerts ?? {}),
          uavTracks: same(snapshot.uavTracks, body.uav_tracks ?? {}),
          clears: same(snapshot.clears, body.clears ?? {}),
          heartbeat: body.heartbeat ?? null,
          serverOffset: typeof body.server_now === "number" ? body.server_now - Date.now() : snapshot.serverOffset,
          source: "poll",
        });
      }
    }
  } catch {
    // Keep the last good data; the heartbeat age will surface a long outage.
  }
  if (polling) pollTimer = setTimeout(pollNow, POLL_INTERVAL_MS);
}
