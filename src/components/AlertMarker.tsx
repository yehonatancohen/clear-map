"use client";

import { memo } from "react";
import { Polygon } from "react-leaflet";
import { ActiveAlert } from "@/types";

interface AlertMarkerProps {
  alert: ActiveAlert;
  polygon: [number, number][];
}

export function AlertMarker({ alert, polygon }: AlertMarkerProps) {
  return (
    <Polygon
      positions={polygon}
      pathOptions={{
        color: alert.status === "telegram_yellow" ? "#eab308" :
          alert.status === "after_alert" ? "#6b7280" :
          alert.status === "pre_alert" ? "#f97316" : "red",
        weight: alert.status === "pre_alert" ? 3 : 2,
        fillColor: alert.status === "telegram_yellow" ? "#fef08a" :
          alert.status === "after_alert" ? "#9ca3af" :
          alert.status === "pre_alert" ? "#f97316" : "red",
        fillOpacity: alert.status === "pre_alert" ? 0.0 :
          alert.status === "telegram_yellow" ? 0.4 :
            alert.status === "after_alert" ? 0.3 :
              alert.is_double ? 0.5 : 0.4,
        className: alert.is_double && alert.status === "alert" ? "alert-polygon-double" : "",
        dashArray: alert.status === "pre_alert" ? "5, 5" : undefined,
      }}
    />
  );
}
