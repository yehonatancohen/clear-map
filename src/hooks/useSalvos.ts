"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActiveAlert, ClearEvent } from "@/types";
import type { SortedAlert } from "./useTimelineHistory";
import { detectSalvos, type Salvo, type SalvoEvent, type SalvoGeo } from "@/lib/salvos";

let geoCache: Promise<SalvoGeo> | null = null;

function loadGeo(): Promise<SalvoGeo> {
  geoCache ??= Promise.all([
    fetch("/data/city-centroids.json").then((r) => r.json()),
    fetch("/data/city-regions.json").then((r) => r.json()),
  ])
    .then(([centroids, regions]) => ({ centroids, regions }))
    .catch((err) => {
      geoCache = null;
      throw err;
    });
  return geoCache;
}

export function useSalvoGeo(enabled = true): SalvoGeo | null {
  const [geo, setGeo] = useState<SalvoGeo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadGeo().then((g) => alive && setGeo(g)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);
  return geo;
}

/** Forget what this tab saw after a while; salvos don't last hours. */
const LIVE_MEMORY_MS = 2 * 60 * 60_000;

/**
 * Every status transition this tab has seen (module-level: it outlives the
 * components and needs no React state). The live state only holds each zone's
 * CURRENT status, so a zone that went early-warning → alert no longer shows it
 * was warned; this memory is what tells long-range fire apart from border fire.
 */
const liveMemory = new Map<string, SalvoEvent>();
/** zone|status pairs in the previous snapshot: a pair that (re)appears is a new event. */
let liveActive = new Set<string>();

function rememberLive(alerts: ActiveAlert[], clears: Record<string, ClearEvent> | null): SalvoEvent[] {
  // "Now" = newest thing we know of, so this depends only on its inputs.
  const now = Math.max(0, ...alerts.map((a) => a.timestamp || 0), ...Object.values(clears ?? {}).map((c) => c?.ts || 0));
  for (const [k, e] of liveMemory) if (now - e.ts > LIVE_MEMORY_MS) liveMemory.delete(k);
  const active = new Set<string>();
  for (const a of alerts) {
    const status = a.status === "after_alert" ? "alert" : a.status;
    if (status !== "alert" && status !== "pre_alert") continue;
    const k = `${a.city_name_he}|${status}`;
    active.add(k);
    // Only on appearance: later after_alert/refresh timestamps move forward.
    if (!liveActive.has(k)) liveMemory.set(k, { city: a.city_name_he, status, ts: a.timestamp || now });
  }
  liveActive = active;
  for (const c of Object.values(clears ?? {})) {
    if (c?.city_name_he) liveMemory.set(`${c.city_name_he}|clear|${c.ts}`, { city: c.city_name_he, status: "clear", ts: c.ts });
  }
  return [...liveMemory.values()];
}

/** Salvos that are on the map right now. (Opened mid-salvo, the source falls back to geography.) */
export function useLiveSalvos(alerts: ActiveAlert[], clears: Record<string, ClearEvent> | null): Salvo[] {
  const geo = useSalvoGeo(alerts.length > 0);
  const events = useMemo(() => rememberLive(alerts, clears), [alerts, clears]);

  return useMemo(() => {
    if (!geo) return [];
    const active = new Set(alerts.filter((a) => a.status === "alert" || a.status === "after_alert").map((a) => a.city_name_he));
    if (active.size === 0) return [];
    return detectSalvos(events, geo).filter((s) => s.alertCities.some((c) => active.has(c)));
  }, [geo, events, alerts]);
}

function rowStatus(a: SortedAlert): string {
  if (a.status) return a.status;
  return Number(a.category) === 1 ? "alert" : "other";
}

/** Salvos in the loaded history, newest first. */
export function useHistorySalvos(rows: SortedAlert[], enabled: boolean): Salvo[] {
  const geo = useSalvoGeo(enabled);
  return useMemo(() => {
    if (!geo || !enabled) return [];
    return detectSalvos(
      rows.map((a) => ({ city: a.data, status: rowStatus(a), ts: a._ts })),
      geo,
    );
  }, [geo, rows, enabled]);
}
