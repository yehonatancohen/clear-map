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
        color: alert.status === "telegram_intel" ? "#38bdf8" :
          alert.status === "after_alert" ? "#ef4444" :
            alert.status === "pre_alert" ? "#facc15" : "red",
        weight: alert.status === "pre_alert" ? 3 : 2,
        fillColor: alert.status === "telegram_intel" ? "#7dd3fc" :
          alert.status === "after_alert" ? "#ef4444" :
            alert.status === "pre_alert" ? "#fde047" : "red",
        fillOpacity: alert.status === "pre_alert" ? 0.0 :
          alert.status === "telegram_intel" ? 0.4 :
            alert.status === "after_alert" ? 0.15 :
              alert.is_double ? 0.5 : 0.4,
        opacity: alert.status === "after_alert" ? 0.4 : 1,
        className: alert.is_double && alert.status === "alert" ? "alert-polygon-double" : "",
        dashArray: alert.status === "pre_alert" ? "5, 5" : undefined,
      }}
    />
  );
}
