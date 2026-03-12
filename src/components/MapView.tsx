"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Polygon, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { useFirebaseAlerts } from "@/hooks/useFirebaseAlerts";
import { usePolygons } from "@/hooks/usePolygons";
import { useMergedPolygons, MergedPolygon } from "@/hooks/useMergedPolygons";
import IntelPanel from "./IntelBanner";
import LiveIndicator from "./LiveIndicator";
import UavFlightPath from "./UavFlightPath";
import { useUavTracks } from "@/hooks/useUavTracks";
import { ActiveAlert, UavTrack } from "@/types";

const ISRAEL_CENTER: [number, number] = [32.5, 34.9];
const DEFAULT_ZOOM = 8;
const THEMES = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
};

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

function AlertFitter({
  alerts,
  polygons,
  uavTracks,
}: {
  alerts: ActiveAlert[];
  polygons: Record<string, { polygon: [number, number][] }>;
  uavTracks: UavTrack[];
}) {
  const map = useMap();
  const prevCountRef = useRef(0);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const prevTrackIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (alerts.length === 0 && uavTracks.length === 0) {
      prevCountRef.current = 0;
      prevIdsRef.current = new Set();
      prevTrackIdsRef.current = new Set();
      return;
    }

    const currentIds = new Set(alerts.map((a) => a.city_name_he));
    const currentTrackIds = new Set(uavTracks.map((t) => t.track_id));

    // Check if there are genuinely NEW alerts or tracks
    const hasNewAlert = alerts.some((a) => !prevIdsRef.current.has(a.city_name_he));
    const hasNewTrack = uavTracks.some((t) => !prevTrackIdsRef.current.has(t.track_id));

    prevIdsRef.current = currentIds;
    prevTrackIdsRef.current = currentTrackIds;

    const totalCount = alerts.length + uavTracks.length;

    if (!hasNewAlert && !hasNewTrack && prevCountRef.current > 0) {
      prevCountRef.current = totalCount;
      return;
    }
    prevCountRef.current = totalCount;

    // Collect all coordinates from all alerted polygons
    const allCoords: [number, number][] = [];
    for (const alert of alerts) {
      const poly = polygons[alert.city_name_he];
      if (poly?.polygon && Array.isArray(poly.polygon)) {
        allCoords.push(...poly.polygon);
      }
    }

    // Collect all coordinates from UAV current locations and predictions
    for (const track of uavTracks) {
      if (track.observed && track.observed.length > 0) {
        allCoords.push(track.observed[track.observed.length - 1]);
      }
      if (track.predicted && track.predicted.length > 0) {
        allCoords.push(...track.predicted);
      }
    }

    if (allCoords.length === 0) return;

    const bounds = L.latLngBounds(
      allCoords.map(([lat, lng]) => L.latLng(lat, lng))
    );

    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 12,
      animate: true,
      duration: 0.8,
    });
  }, [alerts, polygons, uavTracks, map]);

  return null;
}

function getMergedPolygonStyle(mp: MergedPolygon, isNew: boolean) {
  const s = mp.status || "alert";
  const colorMap: Record<string, string> = {
    pre_alert: "#FF6A00",
    alert: "#FF2A2A",
    after_alert: "#ff2a2a6c",
    uav: "#E040FB",
    terrorist: "#FF0055",
  };
  const fillMap: Record<string, string> = {
    pre_alert: "#FF6A00",
    alert: "#FF2A2A",
    after_alert: "#ff2a2ac7",
    uav: "#E040FB",
    terrorist: "#FF0055",
  };
  return {
    color: colorMap[s] || "#ef4444",
    weight: 2,
    fillColor: fillMap[s] || "#ef4444",
    fillOpacity:
      s === "after_alert" ? 0.15 :
        mp.is_double ? 0.6 : 0.5,
    opacity: s === "after_alert" ? 0.4 : 1,
    className:
      isNew ? "alert-polygon-new" :
        mp.is_double && s === "alert" ? "alert-polygon-double" : "",
  };
}

export default function MapView() {
  const alerts = useFirebaseAlerts();
  const polygons = usePolygons();
  const mergedPolygons = useMergedPolygons(alerts, polygons);
  const uavTracks = useUavTracks();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const containerRef = useRef<HTMLDivElement>(null);

  // Track newly appeared alerts for blink animation
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const prevAlertIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    const justAppeared = new Set<string>();

    for (const a of alerts) {
      if (["alert", "uav", "terrorist"].includes(a.status) && !prevAlertIdsRef.current.has(a.id)) {
        justAppeared.add(a.id);
      }
    }

    prevAlertIdsRef.current = currentIds;

    if (justAppeared.size > 0) {
      setNewAlertIds((prev) => new Set([...prev, ...justAppeared]));
      const timer = setTimeout(() => {
        setNewAlertIds((prev) => {
          const next = new Set(prev);
          for (const id of justAppeared) next.delete(id);
          return next;
        });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alerts]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Sync fullscreen state with actual browser state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div id="map-root" ref={containerRef} className={`relative h-[100dvh] w-screen transition-colors duration-500 ${theme === "dark" ? "bg-gray-950" : "bg-gray-100"}`}>
      <IntelPanel
        alerts={alerts}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        theme={theme}
        onThemeChange={setTheme}
      />
      <LiveIndicator />
      <MapContainer
        center={ISRAEL_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        className="hide-labels"
      >
        <ZoomListener />
        <TileLayer url={THEMES[theme]} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' crossOrigin="anonymous" />
        {polygons && (
          <AlertFitter alerts={alerts} polygons={polygons} uavTracks={uavTracks} />
        )}
        {mergedPolygons.map((mp) => {
          const hasNewCity = mp.city_names_he.some((name) =>
            newAlertIds.has(`alert_${name}`),
          );
          return mp.positions.map((positions, idx) => (
            <Polygon
              key={`${mp.id}_${idx}`}
              positions={positions}
              pathOptions={getMergedPolygonStyle(mp, hasNewCity)}
            />
          ));
        })}
        <UavFlightPath tracks={uavTracks} theme={theme} />
      </MapContainer>
    </div>
  );
}
