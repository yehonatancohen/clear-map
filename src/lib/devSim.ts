import type { ActiveAlert, ClearEvent, Heartbeat } from "@/types";

/**
 * Development-only fake backend. Holds alerts / clears / UAV tracks / health
 * in localStorage so every tab (main map, /embed, /broadcast) sees the same
 * simulated state. Only imported behind `process.env.NODE_ENV === "development"`.
 */

export type DevSource = "sim" | "firebase" | "poll";
export type SimHealth = "ok" | "stale" | "source_down";

/** Same shape the backend writes to /public_state/history. */
export interface SimHistoryEntry {
  status: string;
  cities: string[];
  timestamp: number;
}

export interface SimState {
  alerts: Record<string, ActiveAlert>;
  clears: Record<string, ClearEvent>;
  uavTracks: Record<string, unknown>;
  health: SimHealth;
  history: SimHistoryEntry[];
}

const STATE_KEY = "clearmap-dev-sim";
const SOURCE_KEY = "clearmap-dev-source";
const EMPTY: SimState = { alerts: {}, clears: {}, uavTracks: {}, health: "ok", history: [] };
/** Backend keeps a bounded history too; the UI reads the newest entries. */
const HISTORY_MAX = 500;

function withHistory(history: SimHistoryEntry[], status: string, cities: string[], timestamp = Date.now()): SimHistoryEntry[] {
  if (cities.length === 0) return history;
  return [...history, { status, cities, timestamp }].slice(-HISTORY_MAX);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getDevSource(): DevSource {
  const param = typeof location !== "undefined" ? new URLSearchParams(location.search).get("source") : null;
  if (param === "sim" || param === "firebase" || param === "poll") return param;
  return read<DevSource>(SOURCE_KEY, "sim");
}

export function setDevSource(source: DevSource) {
  try {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(source));
  } catch {}
}

let state: SimState = typeof window !== "undefined" ? { ...EMPTY, ...read(STATE_KEY, EMPTY) } : EMPTY;
const listeners = new Set<() => void>();

export function getSim(): SimState {
  return state;
}

export function subscribeSim(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STATE_KEY) return;
    state = { ...EMPTY, ...read(STATE_KEY, EMPTY) };
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function commit(next: SimState) {
  state = next;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function simHeartbeat(health: SimHealth): Heartbeat {
  if (health === "stale") return { ts: Date.now() - 60_000, oref_ok: true };
  return { ts: Date.now() - 1000, oref_ok: health !== "source_down" };
}

// ── mutations ────────────────────────────────────────────────────────────────

/** Firebase keys can't contain . # $ [ ] / — same rule as the backend. */
const key = (city: string) => city.replace(/[.#$[\]/]/g, "_");

export function setAlerts(cities: string[], status: string) {
  const alerts = { ...state.alerts };
  const clears = { ...state.clears };
  const now = Date.now();
  // Like the backend: a history event per new/changed zone; after_alert is never logged.
  const logged = status === "after_alert" ? [] : cities.filter((c) => alerts[key(c)]?.status !== status);
  for (const city of cities) {
    const prev = alerts[key(city)];
    alerts[key(city)] = {
      id: prev && prev.status === status ? prev.id : `sim_${status}_${key(city)}_${now}`,
      city_name: city,
      city_name_he: city,
      timestamp: now,
      is_double: false,
      status,
    };
    delete clears[key(city)];
  }
  commit({ ...state, alerts, clears, history: withHistory(state.history, status, logged, now) });
}

/** Official Oref "event ended": zone leaves the map AND gets a clear record. */
export function clearCities(cities: string[]) {
  const alerts = { ...state.alerts };
  const clears = { ...state.clears };
  const logged = cities.filter((c) => alerts[key(c)]);
  for (const city of cities) {
    delete alerts[key(city)];
    clears[key(city)] = { city_name_he: city, ts: Date.now(), source: "oref" };
  }
  commit({ ...state, alerts, clears, history: withHistory(state.history, "clear", logged) });
}

/** Back-dated history only (the live map is untouched) — fills the salvo log instantly. */
export function addPastHistory(entries: SimHistoryEntry[]) {
  const history = [...state.history, ...entries].sort((a, b) => a.timestamp - b.timestamp).slice(-HISTORY_MAX);
  commit({ ...state, history });
}

/** Zone silently times out (no official clear) — must NOT say "you can leave". */
export function removeCities(cities: string[]) {
  const alerts = { ...state.alerts };
  for (const city of cities) delete alerts[key(city)];
  commit({ ...state, alerts });
}

export function setHealth(health: SimHealth) {
  commit({ ...state, health });
}

export function setUavTrack(id: string, observed: [number, number][], predicted: [number, number][], heading: number) {
  commit({
    ...state,
    uavTracks: {
      ...state.uavTracks,
      [id]: { track_id: id, observed, predicted, heading_deg: heading, speed_kmh: 180, last_updated: Date.now() / 1000 },
    },
  });
}

export function resetSim() {
  stopScenario();
  commit({ ...EMPTY });
}

// ── scenarios ────────────────────────────────────────────────────────────────

let timers: ReturnType<typeof setTimeout>[] = [];

export function stopScenario() {
  timers.forEach(clearTimeout);
  timers = [];
}

/** Run steps at offsets (seconds). A new scenario cancels the previous one. */
export function runSteps(steps: [number, () => void][]) {
  stopScenario();
  timers = steps.map(([sec, fn]) => setTimeout(fn, sec * 1000));
}
