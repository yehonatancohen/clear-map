"use client";

import { useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Polygon, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { useFirebaseAlerts } from "@/hooks/useFirebaseAlerts";
import { usePolygons } from "@/hooks/usePolygons";
import IntelBanner from "./IntelBanner";
import { ActiveAlert } from "@/types";

const ISRAEL_CENTER: [number, number] = [32.5, 34.9];
const DEFAULT_ZOOM = 8;
const TILE_URL =
  "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";

function ZoomListener() {
  const map = useMapEvents({
    zoomend() {
      const el = map.getContainer();
      if (map.getZoom() < 10) {
        el.classList.add("hide-labels");
      } else {
        el.classList.remove("hide-labels");
      }
    },
  });
  return null;
}

/** Automatically fit bounds when NEW alerts appear. */
function AlertFitter({
  alerts,
  polygons,
}: {
  alerts: ActiveAlert[];
  polygons: Record<string, { polygon: [number, number][] }>;
}) {
  const map = useMap();
  const prevCountRef = useRef(0);

  useEffect(() => {
    // Only auto-fit when alert count INCREASES (new alerts came in)
    if (alerts.length <= prevCountRef.current || alerts.length === 0) {
      prevCountRef.current = alerts.length;
      return;
    }
    prevCountRef.current = alerts.length;

    // Collect all coordinates from all alerted polygons
    const allCoords: [number, number][] = [];
    for (const alert of alerts) {
      const poly = polygons[alert.city_name_he];
      if (poly && Array.isArray(poly.polygon)) {
        allCoords.push(...poly.polygon);
      }
    }

    if (allCoords.length === 0) return;

    const bounds = L.latLngBounds(
      allCoords.map(([lat, lng]) => L.latLng(lat, lng))
    );

    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 12,
      animate: true,
      duration: 0.8,
    });
  }, [alerts, polygons, map]);

  return null;
}

function getPolygonStyle(alert: ActiveAlert) {
  const s = alert.status || "alert";
  return {
    color:
      s === "telegram_yellow" ? "#eab308" :
        s === "after_alert" ? "#6b7280" : "red",
    weight: s === "pre_alert" ? 3 : 2,
    fillColor:
      s === "telegram_yellow" ? "#fef08a" :
        s === "after_alert" ? "#9ca3af" : "red",
    fillOpacity:
      s === "pre_alert" ? 0.0 :
        s === "telegram_yellow" ? 0.4 :
          s === "after_alert" ? 0.3 :
            alert.is_double ? 0.5 : 0.4,
    className: alert.is_double && s === "alert" ? "alert-polygon-double" : "",
    dashArray: s === "pre_alert" ? "5, 5" : undefined,
  };
}

export default function MapView() {
  const alerts = useFirebaseAlerts();
  const polygons = usePolygons();

  return (
    <div className="relative h-screen w-screen">
      <IntelBanner updates={[]} />
      <MapContainer
        center={ISRAEL_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        className="hide-labels"
      >
        <ZoomListener />
        <TileLayer url={TILE_URL} />
        {polygons && (
          <AlertFitter alerts={alerts} polygons={polygons} />
        )}
        {polygons && Array.isArray(alerts) &&
          alerts.map((alert: ActiveAlert) => {
            if (!alert?.id || !alert?.city_name_he) return null;
            const poly = polygons[alert.city_name_he];
            if (!poly?.polygon || !Array.isArray(poly.polygon) || poly.polygon.length === 0) return null;
            return (
              <Polygon
                key={alert.id}
                positions={poly.polygon}
                pathOptions={getPolygonStyle(alert)}
              />
            );
          })}
      </MapContainer>
    </div>
  );
}
