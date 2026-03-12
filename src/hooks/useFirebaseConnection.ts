import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

/**
 * Tracks Firebase Realtime Database WebSocket connection state
 * using the built-in `.info/connected` path.
 */
export function useFirebaseConnection(): boolean {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const connectedRef = ref(rtdb, ".info/connected");

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      setIsConnected(snapshot.val() === true);
    });

    return () => unsubscribe();
  }, []);

  return isConnected;
}
