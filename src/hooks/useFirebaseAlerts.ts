import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { ActiveAlert } from "@/types";

/**
 * Subscribes to /public_state/active_alerts in Firebase RTDB.
 * Returns the live list of active alerts (updates in real-time).
 */
export function useFirebaseAlerts(): ActiveAlert[] {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);

  useEffect(() => {
    const alertsRef = ref(rtdb, "public_state/active_alerts");

    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setAlerts([]);
        return;
      }

      // Firebase stores as object keyed by city name — convert to array
      const alertList: ActiveAlert[] = Object.values(data);

      // Filter test data in production
      const filtered = alertList.filter(a => {
        if (process.env.NODE_ENV !== 'development' && a.is_test) return false;
        return true;
      });

      setAlerts(filtered);
    });

    return () => unsubscribe();
  }, []);

  return alerts;
}
