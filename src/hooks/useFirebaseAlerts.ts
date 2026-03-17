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
 */
export function useFirebaseAlerts(): ActiveAlert[] {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const prevAlertsRef = useRef<ActiveAlert[]>([]);
  const activeUserAlertsRef = useRef<Map<string, ActiveAlert>>(new Map());
  const { settings, userCoords } = useNotificationSettings();
  const [polygons, setPolygons] = useState<any>(null);

  // ... (polygons and permission effects)

  useEffect(() => {
    const alertsRef = ref(rtdb, "public_state/active_alerts");

    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // If all alerts are gone, check if we had any active ones to notify "clear"
        if (settings.enabled && settings.leaveShelterAlerts) {
          activeUserAlertsRef.current.forEach((a) => {
            if (["alert", "uav", "terrorist", "after_alert"].includes(a.status)) {
              sendNotification("חזרה לשגרה", `ניתן לצאת מהמרחב המוגן: ${a.city_name_he || a.city_name}`, a.id + "_end");
            }
          });
        }
        activeUserAlertsRef.current.clear();
        setAlerts([]);
        prevAlertsRef.current = [];
        return;
      }

      const alertList: ActiveAlert[] = Object.values(data);
      const filtered = alertList.filter(a => {
        if (process.env.NODE_ENV !== 'development' && a.is_test) return false;
        return true;
      });

      const currentFilteredIds = new Set(filtered.map(a => a.id));

      // 1. Check for alerts that ENDED
      if (settings.enabled && settings.leaveShelterAlerts) {
        activeUserAlertsRef.current.forEach((a, id) => {
          if (!currentFilteredIds.has(id)) {
            // This alert just ended
            if (["alert", "uav", "terrorist", "after_alert"].includes(a.status)) {
              sendNotification("חזרה לשגרה", `ניתן לצאת מהמרחב המוגן: ${a.city_name_he || a.city_name}`, a.id + "_end");
            }
            activeUserAlertsRef.current.delete(id);
          }
        });
      }

      // 2. Check for NEW alerts
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && settings.enabled) {
        const prevIds = new Set(prevAlertsRef.current.map(a => a.id));
        const newAlerts = filtered.filter(a => !prevIds.has(a.id));

        newAlerts.forEach(a => {
          let shouldNotify = settings.allIsrael;
          if (!shouldNotify && settings.selectedCities.includes(a.city_name_he || a.city_name)) shouldNotify = true;
          if (!shouldNotify && settings.currentLocation && userCoords && polygons) {
            const cityData = polygons[a.city_name_he] || polygons[a.city_name];
            if (cityData?.polygon) {
              const turfCoords = [cityData.polygon.map((p: [number, number]) => [p[1], p[0]])];
              if (booleanPointInPolygon(point([userCoords[1], userCoords[0]]), turfPolygon(turfCoords))) shouldNotify = true;
            }
          }

          if (shouldNotify) {
            if (a.status === "pre_alert" && !settings.earlyAlerts) return;

            activeUserAlertsRef.current.set(a.id, a);

            let title = "צבע אדום!";
            if (a.status === "uav") title = "חדירת כלי טיס עוין";
            if (a.status === "terrorist") title = "חדירת מחבלים";
            if (a.status === "pre_alert") title = "התרעה מוקדמת (מודיעין)";
            if (a.status === "after_alert") title = "להישאר במרחב המוגן";

            sendNotification(title, a.city_name_he || a.city_name, a.id);
          }
        });
      }

      prevAlertsRef.current = filtered;
      setAlerts(filtered);
    });

    return () => unsubscribe();
  }, [settings, userCoords, polygons]);

  function sendNotification(title: string, body: string, tag: string) {
    const options = {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      vibrate: [200, 100, 200],
      tag,
      renotify: true
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



