import { useEffect, useState, useSyncExternalStore } from "react";
import {
  computeHealth,
  getLiveSnapshot,
  getServerLiveSnapshot,
  subscribeLive,
  type LiveHealth,
  type LiveSnapshot,
} from "@/lib/liveStore";

export function useLiveSnapshot(): LiveSnapshot {
  return useSyncExternalStore(subscribeLive, getLiveSnapshot, getServerLiveSnapshot);
}

const getClears = () => getLiveSnapshot().clears;
const getServerClears = () => null;

/** Only the official clears, so heartbeat ticks don't re-render the caller. */
export function useLiveClears(): LiveSnapshot["clears"] {
  return useSyncExternalStore(subscribeLive, getClears, getServerClears);
}

/** Re-evaluated every few seconds so a silent backend turns "stale" on its own. */
export function useLiveHealth(): LiveHealth {
  const snap = useLiveSnapshot();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  return computeHealth(snap, now);
}
