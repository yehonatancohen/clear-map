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
  const { settings, userCoords } = useNotificationSettings();
  const [polygons, setPolygons] = useState<any>(null);

  // Fetch polygons for location-based alerts
  useEffect(() => {
    fetch("/data/polygons.json")
      .then(res => res.json())
      .then(data => setPolygons(data))
      .catch(err => console.error("Failed to fetch polygons", err));
  }, []);

  useEffect(() => {
    // Request notification permission for basic PWA notifications
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const alertsRef = ref(rtdb, "public_state/active_alerts");

    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setAlerts([]);
        prevAlertsRef.current = [];
        return;
      }

      const alertList: ActiveAlert[] = Object.values(data);
      const filtered = alertList.filter(a => {
        if (process.env.NODE_ENV !== 'development' && a.is_test) return false;
        return true;
      });

      // ─── Notification Logic ───
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && settings.enabled) {
        const prevIds = new Set(prevAlertsRef.current.map(a => a.id));
        const newAlerts = filtered.filter(a => !prevIds.has(a.id));

        newAlerts.forEach(a => {
          // Check if we should notify based on settings
          let shouldNotify = settings.allIsrael;

          if (!shouldNotify && settings.selectedCities.includes(a.city_name_he || a.city_name)) {
            shouldNotify = true;
          }

          if (!shouldNotify && settings.currentLocation && userCoords && polygons) {
            const cityData = polygons[a.city_name_he] || polygons[a.city_name];
            if (cityData?.polygon) {
              try {
                // Turf expects [lng, lat] - Oref/Leaflet usually [lat, lng]
                // Convert polygons to [lng, lat]
                const turfCoords = [cityData.polygon.map((p: [number, number]) => [p[1], p[0]])];
                if (booleanPointInPolygon(point([userCoords[1], userCoords[0]]), turfPolygon(turfCoords))) {
                  shouldNotify = true;
                }
              } catch (e) {
                console.error("Turf error", e);
              }
            }
          }

          if (shouldNotify) {
            // Check early alerts filter
            if (a.status === "pre_alert" && !settings.earlyAlerts) return;

            // Determine correct title based on official Oref naming
            let title = "צבע אדום!";
            if (a.status === "uav") title = "חדירת כלי טיס עוין";
            if (a.status === "terrorist") title = "חדירת מחבלים";
            if (a.status === "pre_alert") title = "התרעה מוקדמת (מודיעין)";

            const options = {
              body: a.city_name_he || a.city_name,
              icon: "/favicon.svg",
              badge: "/favicon.svg",
              vibrate: [200, 100, 200],
              tag: a.id, // Prevent duplicate notifications for same alert
              renotify: true
            };

            // Mobile devices (especially iOS) require using the Service Worker registration to show notifications
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.ready.then((registration) => {
                registration.showNotification(title, options);
              });
            } else {
              // Fallback for older browsers
              new Notification(title, options);
            }
          }


        });
      }

      prevAlertsRef.current = filtered;
      setAlerts(filtered);
    });

    return () => unsubscribe();
  }, [settings, userCoords, polygons]);

  return alerts;
}


