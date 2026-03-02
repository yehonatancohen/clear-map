import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { UavTrack } from "@/types";

/**
 * Subscribes to /public_state/uav_tracks in Firebase RTDB.
 * Returns the live list of UAV flight path tracks.
 */
export function useUavTracks(): UavTrack[] {
  const [tracks, setTracks] = useState<UavTrack[]>([]);

  useEffect(() => {
    const tracksRef = ref(rtdb, "public_state/uav_tracks");

    const unsubscribe = onValue(tracksRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setTracks([]);
        return;
      }

      // Firebase omits empty arrays, so normalize fields
      const trackList: UavTrack[] = (Object.values(data) as Record<string, unknown>[]).map((t) => ({
        track_id: (t.track_id as string) ?? "",
        observed: (t.observed as [number, number][]) ?? [],
        predicted: (t.predicted as [number, number][]) ?? [],
        heading_deg: (t.heading_deg as number) ?? 0,
        speed_kmh: (t.speed_kmh as number) ?? 0,
        last_updated: (t.last_updated as number) ?? 0,
      }));
      setTracks(trackList);
    });

    return () => unsubscribe();
  }, []);

  return tracks;
}
