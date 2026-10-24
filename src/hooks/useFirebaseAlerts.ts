import { useEffect, useMemo, useState, useRef } from "react";
import { ActiveAlert } from "@/types";
import { useNotificationSettings } from "./useNotificationSettings";
import { useLiveSnapshot } from "./useLiveState";

/** Great-circle distance in km between two [lat, lng] points. */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Location proximity radius in km (matches backend's 15km). */
const LOCATION_RADIUS_KM = 15;

function showTestAlerts(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return typeof window !== "undefined" && (window as unknown as { __showTestAlerts?: boolean }).__showTestAlerts === true;
}

/**
 * Live list of active alerts (from the shared live store) plus local
 * notifications for the zones this user follows.
 *
 * Notifications are batched:
 *  - pre_alerts → grouped by region (צפון, דרום, מרכז, ירושלים)
 *  - alerts/uav/terrorist → single notification per type with city names listed
 *  - "you can leave" → only on an official Oref "event ended" message, never
 *    just because a zone disappeared from the map (timeouts aren't clearance)
 */
export function useFirebaseAlerts(): ActiveAlert[] {
  const live = useLiveSnapshot();
  const { settings, userCoords } = useNotificationSettings();
  const [centroids, setCentroids] = useState<Record<string, [number, number]> | null>(null);
  const [cityRegions, setCityRegions] = useState<Record<string, string>>({});

  // Settings and GPS change often; reading them through refs keeps the
  // notification logic from re-running (and re-notifying) on every change.
  const ctxRef = useRef({ settings, userCoords, centroids, cityRegions });
  useEffect(() => {
    ctxRef.current = { settings, userCoords, centroids, cityRegions };
  }, [settings, userCoords, centroids, cityRegions]);

  const prevAlertsRef = useRef<ActiveAlert[] | null>(null);
  const seenClearsRef = useRef<Record<string, number> | null>(null);

  // Load city-to-region mapping
  useEffect(() => {
    fetch("/data/city-regions.json")
      .then((res) => res.json())
      .then((data) => setCityRegions(data))
      .catch(() => {});
  }, []);

  // Load city centroids for location-based notification filtering
  useEffect(() => {
    if (settings.currentLocation) {
      fetch("/data/city-centroids.json")
        .then((res) => res.json())
        .then((data: Record<string, [number, number]>) => setCentroids(data))
        .catch(() => {});
    }
  }, [settings.currentLocation]);

  const alerts = useMemo((): ActiveAlert[] => {
    if (!live.alerts) return [];
    const list = Object.values(live.alerts).filter((a) => a && typeof a === "object" && a.city_name_he);
    return showTestAlerts() ? list : list.filter((a) => !a.is_test);
  }, [live.alerts]);

  // ── New alerts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (live.alerts === null) return; // nothing received yet

    const prev = prevAlertsRef.current;
    prevAlertsRef.current = alerts;

    // On first data, treat only fresh alerts (< 60s old) as new so opening the
    // app mid-salvo still notifies, but old alerts don't.
    const prevIds = prev
      ? new Set(prev.map((a) => a.id))
      : new Set(alerts.filter((a) => Date.now() - a.timestamp >= 60_000).map((a) => a.id));
    const newAlerts = alerts.filter((a) => !prevIds.has(a.id));
    if (newAlerts.length === 0) return;

    const { settings, cityRegions } = ctxRef.current;
    if (!canNotify(settings.enabled)) return;

    const relevant: { alert: ActiveAlert; people: string[] }[] = [];
    for (const a of newAlerts) {
      if (a.status === "pre_alert" && !settings.earlyAlerts) continue;
      const match = matchZone(a.city_name_he || a.city_name, ctxRef.current);
      if (match) relevant.push({ alert: a, people: match.people });
    }
    if (relevant.length === 0) return;

    const byStatus: Record<string, typeof relevant> = {};
    for (const r of relevant) (byStatus[r.alert.status] ??= []).push(r);

    for (const [status, group] of Object.entries(byStatus)) {
      const people = [...new Set(group.flatMap((g) => g.people))];
      if (status === "pre_alert") {
        // Pre-alerts: group by region, show region names + count
        const byRegion: Record<string, number> = {};
        for (const { alert: a } of group) {
          const region = cityRegions[a.city_name_he] || cityRegions[a.city_name] || "אחר";
          byRegion[region] = (byRegion[region] || 0) + 1;
        }
        const regionSummaries = Object.entries(byRegion).map(([region, n]) => `${region} (${n})`);
        sendNotification(withPeople("התרעה מוקדמת (מודיעין)", people), regionSummaries.join(" · "), `pre_alert_batch_${Date.now()}`);
      } else {
        // Alerts/UAV/Terrorist/After_alert: one notification per type with city names
        let title = "צבע אדום!";
        if (status === "uav") title = "חדירת כלי טיס עוין";
        if (status === "terrorist") title = "חדירת מחבלים";
        if (status === "after_alert") title = "להישאר במרחב המוגן";
        const cityNames = group.map(({ alert: a }) => a.city_name_he || a.city_name);
        sendNotification(withPeople(title, people), cityNames.join(", "), `${status}_batch_${Date.now()}`);
      }
    }
  }, [alerts, live.alerts]);

  // ── Official "event ended" ────────────────────────────────────────────────
  useEffect(() => {
    if (live.clears === null) return;
    const current: Record<string, number> = {};
    for (const c of Object.values(live.clears)) {
      if (c?.city_name_he && c.source === "oref") current[c.city_name_he] = c.ts;
    }
    const seen = seenClearsRef.current;
    seenClearsRef.current = current;
    if (seen === null) return; // first load: these were announced before we opened

    const fresh = Object.keys(current).filter((city) => current[city] !== seen[city]);
    const { settings } = ctxRef.current;
    if (fresh.length === 0 || !settings.leaveShelterAlerts || !canNotify(settings.enabled)) return;

    const matched: string[] = [];
    const people: string[] = [];
    for (const city of fresh) {
      const m = matchZone(city, ctxRef.current);
      if (!m) continue;
      matched.push(city);
      people.push(...m.people.filter((p) => !people.includes(p)));
    }
    if (matched.length > 0) {
      sendNotification(withPeople("האירוע הסתיים", people), `ניתן לצאת מהמרחב המוגן: ${matched.join(", ")}`, "clear_batch");
    }
  }, [live.clears]);

  return alerts;
}

interface MatchCtx {
  settings: ReturnType<typeof useNotificationSettings>["settings"];
  userCoords: [number, number] | null;
  centroids: Record<string, [number, number]> | null;
}

/** Does this user follow `city`? Returns the names of their people there. */
function matchZone(city: string, { settings, userCoords, centroids }: MatchCtx): { people: string[] } | null {
  const people = (settings.people ?? []).filter((p) => p.city === city).map((p) => p.name);
  if (people.length > 0 || settings.allIsrael || settings.selectedCities.includes(city)) return { people };
  if (settings.currentLocation && userCoords && centroids?.[city]) {
    if (haversineKm(userCoords, centroids[city]) <= LOCATION_RADIUS_KM) return { people };
  }
  return null;
}

function withPeople(title: string, people: string[]): string {
  if (people.length === 0) return title;
  const shown = people.slice(0, 3).join(", ") + (people.length > 3 ? ` +${people.length - 3}` : "");
  return `${title} · ${shown}`;
}

function canNotify(enabled: boolean): boolean {
  return enabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

function sendNotification(title: string, body: string, tag: string) {
  const options = {
    body,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    vibrate: [200, 100, 200] as number[],
    tag,
    renotify: true,
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, options);
    });
  } else {
    new Notification(title, options);
  }
}
