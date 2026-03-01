import { useMemo } from "react";
import union from "@turf/union";
import { polygon as turfPolygon, featureCollection } from "@turf/helpers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { ActiveAlert } from "@/types";
import { PolygonLookup } from "./usePolygons";

export interface MergedPolygon {
  id: string;
  status: string;
  is_double: boolean;
  timestamp: number;
  city_names_he: string[];
  /** Each entry is a ring of [lat, lng] coords (MultiPolygon produces multiple) */
  positions: [number, number][][];
}

/**
 * Groups alerts by status, then unions touching/overlapping polygons
 * within each group using turf. Distant polygons stay separate
 * (MultiPolygon result splits into individual position arrays).
 */
export function useMergedPolygons(
  alerts: ActiveAlert[],
  polygons: PolygonLookup | null,
): MergedPolygon[] {
  return useMemo(() => {
    if (!polygons || alerts.length === 0) return [];

    // Group alerts by status
    const byStatus: Record<string, ActiveAlert[]> = {};
    for (const alert of alerts) {
      (byStatus[alert.status] ??= []).push(alert);
    }

    const result: MergedPolygon[] = [];

    for (const [status, statusAlerts] of Object.entries(byStatus)) {
      // Build turf features for each alert
      const features: { feature: Feature<Polygon>; alert: ActiveAlert }[] = [];

      for (const alert of statusAlerts) {
        const poly = polygons[alert.city_name_he];
        if (!poly?.polygon?.length) continue;

        // turf expects [lng, lat] and closed rings
        const ring = poly.polygon.map(([lat, lng]) => [lng, lat] as [number, number]);
        if (ring.length < 3) continue;

        // Close the ring if needed
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push([first[0], first[1]]);
        }

        try {
          features.push({ feature: turfPolygon([ring]) as Feature<Polygon>, alert });
        } catch {
          // Malformed polygon — skip
        }
      }

      if (features.length === 0) continue;

      // Union all polygons of the same status
      try {
        let combined: Feature<Polygon | MultiPolygon> = features[0].feature;
        const allAlerts = [features[0].alert];

        for (let i = 1; i < features.length; i++) {
          const merged = union(featureCollection([combined, features[i].feature]));
          if (merged) {
            combined = merged as Feature<Polygon | MultiPolygon>;
            allAlerts.push(features[i].alert);
          }
        }

        // Extract positions from the unioned geometry
        const geom = combined.geometry;
        const positionSets: [number, number][][] = [];

        if (geom.type === "Polygon") {
          // Convert [lng, lat] back to [lat, lng] for Leaflet
          positionSets.push(
            geom.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]),
          );
        } else if (geom.type === "MultiPolygon") {
          for (const poly of geom.coordinates) {
            positionSets.push(
              poly[0].map(([lng, lat]) => [lat, lng] as [number, number]),
            );
          }
        }

        // Each position set becomes its own MergedPolygon entry
        // so distant clusters render as separate shapes
        for (let i = 0; i < positionSets.length; i++) {
          result.push({
            id: `merged_${status}_${i}`,
            status,
            is_double: allAlerts.some((a) => a.is_double),
            timestamp: Math.max(...allAlerts.map((a) => a.timestamp)),
            city_names_he: allAlerts.map((a) => a.city_name_he),
            positions: [positionSets[i]],
          });
        }
      } catch {
        // Fallback: render individually if union fails
        for (const f of features) {
          const poly = polygons[f.alert.city_name_he];
          result.push({
            id: f.alert.id,
            status: f.alert.status,
            is_double: f.alert.is_double,
            timestamp: f.alert.timestamp,
            city_names_he: [f.alert.city_name_he],
            positions: [poly.polygon],
          });
        }
      }
    }

    return result;
  }, [alerts, polygons]);
}
