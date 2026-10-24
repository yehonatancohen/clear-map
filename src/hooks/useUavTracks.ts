import { useMemo } from "react";
import { UavTrack } from "@/types";
import { useLiveSnapshot } from "./useLiveState";

/**
 * Live list of UAV flight path tracks (/public_state/uav_tracks).
 */
export function useUavTracks(): UavTrack[] {
  const { uavTracks } = useLiveSnapshot();

  return useMemo(() => {
    if (!uavTracks) return [];

    // Firebase omits empty arrays, so normalize fields
    const trackList: UavTrack[] = (Object.values(uavTracks) as Record<string, unknown>[]).map((t) => ({
      track_id: (t.track_id as string) ?? "",
      observed: (t.observed as [number, number][]) ?? [],
      predicted: (t.predicted as [number, number][]) ?? [],
      heading_deg: (t.heading_deg as number) ?? 0,
      speed_kmh: (t.speed_kmh as number) ?? 0,
      last_updated: (t.last_updated as number) ?? 0,
      is_test: (t.is_test as boolean) ?? false,
    }));

    // Filter test data in production
    const showTest =
      process.env.NODE_ENV === "development" ||
      (typeof window !== "undefined" && (window as unknown as { __showTestAlerts?: boolean }).__showTestAlerts === true);
    return showTest ? trackList : trackList.filter((t) => !t.is_test);
  }, [uavTracks]);
}
