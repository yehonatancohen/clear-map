"use client";

import { useMemo } from "react";
import { Polygon } from "react-leaflet";
import type { OrefHistoryAlert } from "@/types";
import { useMergedPolygons } from "@/hooks/useMergedPolygons";
import type { PolygonLookup } from "@/hooks/usePolygons";
import type { ActiveAlert } from "@/types";

// Unified color scheme: pre alert -> orange, alert -> red, leave shelter -> emerald green, uav -> purple
const HISTORY_COLORS: Record<string, { stroke: string; fill: string }> = {
  alert:      { stroke: "#FF2A2A", fill: "#FF2A2A" },     // red — active alert
  pre_alert:  { stroke: "#FFA500", fill: "#FFA500" },     // orange — early warnings
  uav:        { stroke: "#E040FB", fill: "#E040FB" },     // purple — UAV
  terrorist:  { stroke: "#FF0055", fill: "#FF0055" },     // magenta — terrorists
  clear:      { stroke: "#10B981", fill: "#10B981" },     // green — leave shelter confirmation
};

function getStatus(alert: OrefHistoryAlert & { status?: string }): string {
  if (alert.status === "clear") return "clear";
  if (alert.status === "pre_alert") return "pre_alert";
  
  switch (alert.category) {
    case 1: return "alert";
    case 2: return "uav";
    case 3: return "terrorist";
    default: return "alert";
  }
}

interface TimelinePolygonsProps {
  alerts: (OrefHistoryAlert & { _ts: number; status?: string })[];
  polygons: PolygonLookup | null;
}

export default function TimelinePolygons({
  alerts,
  polygons,
}: TimelinePolygonsProps) {
  const syntheticAlerts: ActiveAlert[] = useMemo(() => {
    return alerts.map((a, i) => ({
      id: `hist_${a.rid || i}_${a._ts}`,
      city_name: a.data,
      city_name_he: a.data,
      timestamp: a._ts,
      is_double: false,
      status: getStatus(a),
    }));
  }, [alerts]);

  const mergedPolygons = useMergedPolygons(syntheticAlerts, polygons);

  return (
    <>
      {mergedPolygons.map((mp) => {
        const colors = HISTORY_COLORS[mp.status] || HISTORY_COLORS.alert;
        return mp.positions.map((positions, idx) => (
          <Polygon
            key={`${mp.id}_${idx}`}
            positions={positions}
            pathOptions={{
              color: colors.stroke,
              weight: 2,
              fillColor: colors.fill,
              fillOpacity: 0.4,
              opacity: 0.8,
              className: "timeline-polygon-appear",
            }}
          />
        ));
      })}
    </>
  );
}
