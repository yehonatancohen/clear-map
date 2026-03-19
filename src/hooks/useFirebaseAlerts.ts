import { useEffect, useState, useRef } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { ActiveAlert } from "@/types";
import { useNotificationSettings } from "./useNotificationSettings";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon as turfPolygon } from "@turf/helpers";

/**
 * Subscribes to /public_state/active_alerts in Firebase RTDB.
 * Returns the live list of active alerts (updates in real-time).
 *
 * Notifications are batched:
 *  - pre_alerts → grouped by region (צפון, דרום, מרכז, ירושלים)
 *  - alerts/uav/terrorist → single notification per type with city names listed
 */
export function useFirebaseAlerts(): ActiveAlert[] {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const prevAlertsRef = useRef<ActiveAlert[]>([]);
  const activeUserAlertsRef = useRef<Map<string, ActiveAlert>>(new Map());
  const isFirstLoadRef = useRef(true);
  const { settings, userCoords } = useNotificationSettings();
  const [polygons, setPolygons] = useState<any>(null);
  const [cityRegions, setCityRegions] = useState<Record<string, string>>({});

  // Load city-to-region mapping
  useEffect(() => {
    fetch("/data/city-regions.json")
      .then((res) => res.json())
      .then((data) => setCityRegions(data))
      .catch(() => {});
  }, []);

  // ... (polygons and permission effects)

  useEffect(() => {
    const alertsRef = ref(rtdb, "public_state/active_alerts");

    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // If all alerts are gone, check if we had any active ones to notify "clear"
        if (settings.enabled && settings.leaveShelterAlerts) {
          const endedAlerts: ActiveAlert[] = [];
          activeUserAlertsRef.current.forEach((a) => {
            if (["alert", "uav", "terrorist", "after_alert"].includes(a.status)) {
              endedAlerts.push(a);
            }
          });
          if (endedAlerts.length > 0) {
            const cityNames = endedAlerts.map((a) => a.city_name_he || a.city_name);
            sendNotification(
              "חזרה לשגרה",
              `ניתן לצאת מהמרחב המוגן: ${cityNames.join(", ")}`,
              "clear_batch"
            );
          }
        }
        activeUserAlertsRef.current.clear();
        setAlerts([]);
        prevAlertsRef.current = [];
        return;
      }

      const alertList: ActiveAlert[] = Object.values(data);
      const filtered = alertList.filter((a) => {
        if (process.env.NODE_ENV !== "development" && a.is_test) return false;
        return true;
      });

      const currentFilteredIds = new Set(filtered.map((a) => a.id));

      // On first load, seed refs without sending notifications (prevents spam on app open)
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        for (const a of filtered) {
          activeUserAlertsRef.current.set(a.id, a);
        }
        prevAlertsRef.current = filtered;
        setAlerts(filtered);
        return;
      }

      // 1. Check for alerts that ENDED — batch the "return to routine" notification
      if (settings.enabled && settings.leaveShelterAlerts) {
        const endedAlerts: ActiveAlert[] = [];
        activeUserAlertsRef.current.forEach((a, id) => {
          if (!currentFilteredIds.has(id)) {
            if (["alert", "uav", "terrorist", "after_alert"].includes(a.status)) {
              endedAlerts.push(a);
            }
            activeUserAlertsRef.current.delete(id);
          }
        });
        if (endedAlerts.length > 0) {
          const cityNames = endedAlerts.map((a) => a.city_name_he || a.city_name);
          sendNotification(
            "חזרה לשגרה",
            `ניתן לצאת מהמרחב המוגן: ${cityNames.join(", ")}`,
            "clear_batch"
          );
        }
      }

      // 2. Check for NEW alerts — batch by status
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        settings.enabled
      ) {
        const prevIds = new Set(prevAlertsRef.current.map((a) => a.id));
        const newAlerts = filtered.filter((a) => !prevIds.has(a.id));

        // Filter to only alerts this user should receive
        const relevantAlerts: ActiveAlert[] = [];
        for (const a of newAlerts) {
          let shouldNotify = settings.allIsrael;
          if (!shouldNotify && settings.selectedCities.includes(a.city_name_he || a.city_name))
            shouldNotify = true;
          if (!shouldNotify && settings.currentLocation && userCoords && polygons) {
            const cityData = polygons[a.city_name_he] || polygons[a.city_name];
            if (cityData?.polygon) {
              const turfCoords = [cityData.polygon.map((p: [number, number]) => [p[1], p[0]])];
              if (
                booleanPointInPolygon(
                  point([userCoords[1], userCoords[0]]),
                  turfPolygon(turfCoords)
                )
              )
                shouldNotify = true;
            }
          }

          if (shouldNotify) {
            if (a.status === "pre_alert" && !settings.earlyAlerts) continue;
            activeUserAlertsRef.current.set(a.id, a);
            relevantAlerts.push(a);
          }
        }

        // Group by status and send batched notifications
        if (relevantAlerts.length > 0) {
          const byStatus: Record<string, ActiveAlert[]> = {};
          for (const a of relevantAlerts) {
            if (!byStatus[a.status]) byStatus[a.status] = [];
            byStatus[a.status].push(a);
          }

          for (const [status, group] of Object.entries(byStatus)) {
            if (status === "pre_alert") {
              // Pre-alerts: group by region, show region names + count
              const byRegion: Record<string, ActiveAlert[]> = {};
              for (const a of group) {
                const region =
                  cityRegions[a.city_name_he] || cityRegions[a.city_name] || "אחר";
                if (!byRegion[region]) byRegion[region] = [];
                byRegion[region].push(a);
              }

              const regionSummaries = Object.entries(byRegion).map(
                ([region, alerts]) => `${region} (${alerts.length})`
              );
              sendNotification(
                "התרעה מוקדמת (מודיעין)",
                regionSummaries.join(" · "),
                `pre_alert_batch_${Date.now()}`
              );
            } else {
              // Alerts/UAV/Terrorist/After_alert: one notification per type with city names
              let title = "צבע אדום!";
              if (status === "uav") title = "חדירת כלי טיס עוין";
              if (status === "terrorist") title = "חדירת מחבלים";
              if (status === "after_alert") title = "להישאר במרחב המוגן";

              const cityNames = group.map((a) => a.city_name_he || a.city_name);
              sendNotification(
                title,
                cityNames.join(", "),
                `${status}_batch_${Date.now()}`
              );
            }
          }
        }
      }

      prevAlertsRef.current = filtered;
      setAlerts(filtered);
    });

    return () => unsubscribe();
  }, [settings, userCoords, polygons, cityRegions]);

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

  return alerts;
}
