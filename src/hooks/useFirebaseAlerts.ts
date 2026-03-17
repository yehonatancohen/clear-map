import { useEffect, useState, useRef } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { ActiveAlert } from "@/types";

/**
 * Subscribes to /public_state/active_alerts in Firebase RTDB.
 * Returns the live list of active alerts (updates in real-time).
 */
export function useFirebaseAlerts(): ActiveAlert[] {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const prevAlertsRef = useRef<ActiveAlert[]>([]);

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

      // Firebase stores as object keyed by city name — convert to array
      const alertList: ActiveAlert[] = Object.values(data);

      // Filter test data in production
      const filtered = alertList.filter(a => {
        if (process.env.NODE_ENV !== 'development' && a.is_test) return false;
        return true;
      });

      // Basic Notification Logic: Check for new alerts
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const isEnabled = localStorage.getItem("notifications_enabled") !== "false"; 
        const isEarlyEnabled = localStorage.getItem("early_notifications_enabled") !== "false";
        
        if (isEnabled) {
          const prevIds = new Set(prevAlertsRef.current.map(a => a.id));
          const newAlerts = filtered.filter(a => {
            if (prevIds.has(a.id)) return false;
            
            // Standard alerts
            if (a.status === "alert" || a.status === "uav" || a.status === "terrorist") return true;
            
            // Early alerts (pre_alert) - only if enabled by user
            if (a.status === "pre_alert") return isEarlyEnabled;
            
            return false;
          });
          
          if (newAlerts.length > 0) {
            const citiesStr = newAlerts.map(a => a.city_name_he || a.city_name).join(", ");
            new Notification("צבע אדום!", {
              body: citiesStr,
              icon: "/favicon.svg",
            });
          }
        }
      }



      prevAlertsRef.current = filtered;
      setAlerts(filtered);
    });

    return () => unsubscribe();
  }, []);

  return alerts;
}

