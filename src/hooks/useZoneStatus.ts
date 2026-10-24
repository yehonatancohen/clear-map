import { useEffect, useMemo, useState } from "react";
import type { ActiveAlert } from "@/types";
import type { PolygonLookup } from "./usePolygons";
import { useLiveSnapshot } from "./useLiveState";
import { useNotificationSettings } from "./useNotificationSettings";

export type ZoneState = "alert" | "uav" | "terrorist" | "pre_alert" | "after_alert" | "clear" | "quiet";

export interface ZoneStatus {
  state: ZoneState;
  /** ms: when the current alert state started (alerts) or Oref announced the end (clear) */
  at?: number;
}

/** Backend keeps clearance records for 30 min; don't show older ones even if cached. */
const CLEAR_SHOW_MS = 30 * 60 * 1000;

export const ZONE_META: Record<ZoneState, { label: string; hint: string; color: string; severity: number }> = {
  alert: { label: "צבע אדום", hint: "היכנסו למרחב המוגן", color: "#FF2A2A", severity: 0 },
  terrorist: { label: "חדירת מחבלים", hint: "היכנסו למבנה ונעלו את הדלת", color: "#FF0055", severity: 0 },
  uav: { label: "כלי טיס עוין", hint: "היכנסו למרחב המוגן", color: "#E040FB", severity: 0 },
  pre_alert: { label: "התרעה מוקדמת", hint: "היו בקרבת מרחב מוגן", color: "#FF6A00", severity: 1 },
  after_alert: { label: "להישאר במרחב המוגן", hint: "עד להודעת פיקוד העורף על סיום האירוע", color: "#FF7A7A", severity: 2 },
  clear: { label: "ניתן לצאת מהמרחב המוגן", hint: "פיקוד העורף הודיע על סיום האירוע", color: "#34D399", severity: 3 },
  quiet: { label: "אין התרעה פעילה", hint: "", color: "#9CA3AF", severity: 4 },
};

const ALERT_STATES = new Set(["alert", "uav", "terrorist", "pre_alert", "after_alert"]);

/**
 * Status of any Oref zone. "clear" only comes from an official Oref
 * "event ended" message; a zone that merely timed out off the map is "quiet",
 * never "you can leave".
 */
export function useZoneStatusLookup(alerts: ActiveAlert[]): (city: string) => ZoneStatus {
  const { clears } = useLiveSnapshot();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const byCity = new Map(alerts.map((a) => [a.city_name_he, a]));
    const clearedAt = new Map<string, number>();
    for (const c of Object.values(clears ?? {})) {
      if (c?.source === "oref" && c.city_name_he && now - c.ts < CLEAR_SHOW_MS) clearedAt.set(c.city_name_he, c.ts);
    }
    return (city: string): ZoneStatus => {
      const a = byCity.get(city);
      if (a && ALERT_STATES.has(a.status)) return { state: a.status as ZoneState, at: a.timestamp };
      const ts = clearedAt.get(city);
      if (ts) return { state: "clear", at: ts };
      return { state: "quiet" };
    };
  }, [alerts, clears, now]);
}

function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lati, lngi] = ring[i];
    const [latj, lngj] = ring[j];
    if ((lngi > lng) !== (lngj > lng) && lat < ((latj - lati) * (lng - lngi)) / (lngj - lngi) + lati) {
      inside = !inside;
    }
  }
  return inside;
}

/** The Oref zone containing a GPS position, if any. */
export function zoneAt(polygons: PolygonLookup | null, coords: [number, number] | null): string | null {
  if (!polygons || !coords) return null;
  const [lat, lng] = coords;
  for (const [name, entry] of Object.entries(polygons)) {
    const ring = entry.polygon;
    if (ring?.length > 2 && pointInRing(lat, lng, ring)) return name;
  }
  return null;
}

/** Zones that are "mine": where I am right now, plus the zones I picked for alerts. */
export function useMyZones(polygons: PolygonLookup | null): { locationZone: string | null; zones: string[] } {
  const { settings, userCoords } = useNotificationSettings();
  // Re-run the polygon search only when the position moves ~100 m
  const roundedKey = userCoords ? `${userCoords[0].toFixed(3)},${userCoords[1].toFixed(3)}` : "";
  const locationZone = useMemo(
    () => zoneAt(polygons, roundedKey ? (roundedKey.split(",").map(Number) as [number, number]) : null),
    [polygons, roundedKey],
  );
  const zones = useMemo(() => {
    const list = locationZone ? [locationZone] : [];
    if (!settings.allIsrael) {
      for (const c of settings.selectedCities) if (!list.includes(c)) list.push(c);
    }
    return list;
  }, [locationZone, settings.allIsrael, settings.selectedCities]);
  return { locationZone, zones };
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
}

export function formatSince(ms: number, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - ms) / 60_000));
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  return `לפני ${Math.floor(mins / 60)} שע׳`;
}
