"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Polygon, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { useFirebaseAlerts } from "@/hooks/useFirebaseAlerts";
import { usePolygons, PolygonLookup } from "@/hooks/usePolygons";
import { useMergedPolygons, MergedPolygon } from "@/hooks/useMergedPolygons";
import IntelPanel from "./IntelBanner";
import LiveIndicator from "./LiveIndicator";
import { PwaInstallBanner } from "./PwaInstallBanner";
import UavFlightPath from "./UavFlightPath";
import { useUavTracks } from "@/hooks/useUavTracks";
import { setMapInstance } from "@/lib/mapRef";
import { ActiveAlert, UavTrack } from "@/types";
import type { MapMode } from "./TimelineModeToggle";
import TimelinePolygons from "./TimelinePolygons";
import HistoryPanel from "./HistoryPanel";
import { useHistoryAlerts, SortedAlert } from "@/hooks/useTimelineHistory";
import CityLabels from "./CityLabels";

const ISRAEL_CENTER: [number, number] = [32.5, 34.9];
const DEFAULT_ZOOM = 8;
const THEMES = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
};

const LABELS = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
};

function ZoomListener() {
  return null;
}

function MapRefSetter() {
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
  }, [map]);
  return null;
}

function AlertFitter({
  alerts,
  polygons,
  uavTracks,
  isHistory = false,
}: {
  alerts: ActiveAlert[] | SortedAlert[];
  polygons: PolygonLookup | null;
  uavTracks?: UavTrack[];
  isHistory?: boolean;
}) {
  const map = useMap();
  const prevIdsRef = useRef<string>("");

  useEffect(() => {
    if (!polygons) return;
    if (alerts.length === 0 && (!uavTracks || uavTracks.length === 0)) return;

    // ActiveAlert uses city_name_he, SortedAlert uses data
    const cityNames = alerts.map((a) => ("city_name_he" in a ? a.city_name_he : a.data));
    const currentIds = cityNames.sort().join(",");

    if (currentIds === prevIdsRef.current) return;
    prevIdsRef.current = currentIds;

    const allCoords: [number, number][] = [];
    for (const cityName of cityNames) {
      const poly = polygons[cityName];
      if (poly?.polygon && Array.isArray(poly.polygon)) {
        allCoords.push(...poly.polygon);
      }
    }

    if (uavTracks) {
      for (const track of uavTracks) {
        if (track.observed && track.observed.length > 0) {
          allCoords.push(track.observed[track.observed.length - 1]);
        }
        if (track.predicted && track.predicted.length > 0) {
          allCoords.push(...track.predicted);
        }
      }
    }

    if (allCoords.length === 0) return;

    const bounds = L.latLngBounds(allCoords.map(([lat, lng]) => L.latLng(lat, lng)));

    // On mobile, history panel takes bottom 50% of screen
    const isMobile = window.innerWidth < 640;
    const paddingBottom = (isMobile && isHistory) ? (window.innerHeight * 0.5) + 40 : 50;
    const paddingTop = isMobile ? 80 : 50;

    map.fitBounds(bounds, {
      paddingTopLeft: [20, paddingTop],
      paddingBottomRight: [20, paddingBottom],
      maxZoom: 12,
      animate: true,
      duration: 0.8,
    });
  }, [alerts, polygons, uavTracks, isHistory, map]);

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
    after_alert: "#ff2a2a6c",
    uav: "#E040FB",
    terrorist: "#FF0055",
  };
  return {
    color: colorMap[s] || "#ef4444",
    weight: 2,
    fillColor: fillMap[s] || "#ef4444",
    fillOpacity:
      s === "after_alert" ? 0.25 :
        mp.is_double ? 0.6 : 0.5,
    opacity: s === "after_alert" ? 0.5 : 1,
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
  const [mode, setMode] = useState<MapMode>("live");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchAlerts, setSelectedBatchAlerts] = useState<SortedAlert[]>([]);

  const { batches, loading, hasMore, loadMore } = useHistoryAlerts(mode === "history");

  useEffect(() => {
    setSelectedBatchId(null);
    setSelectedBatchAlerts([]);
  }, [mode]);

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
        mode={mode}
        onModeChange={setMode}
      />
      <LiveIndicator />
      <PwaInstallBanner />
      <MapContainer
        center={ISRAEL_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <ZoomListener />
        <MapRefSetter />
        <TileLayer url={THEMES[theme]} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' crossOrigin="anonymous" />

        {mode === "live" && (
          <>
            <AlertFitter alerts={alerts} polygons={polygons} uavTracks={uavTracks} />
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
          </>
        )}

        {mode === "history" && selectedBatchAlerts.length > 0 && (
          <>
            <AlertFitter alerts={selectedBatchAlerts} polygons={polygons} isHistory />
            <TimelinePolygons alerts={selectedBatchAlerts} polygons={polygons} />
          </>
        )}

        <CityLabels polygons={polygons} theme={theme} />
      </MapContainer>
      {mode === "history" && (
        <HistoryPanel
          batches={batches}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          selectedBatchId={selectedBatchId}
          onSelectBatch={(id, alerts) => {
            setSelectedBatchId(id);
            setSelectedBatchAlerts(alerts);
          }}
          onClose={() => {
            setMode("live");
            setSelectedBatchId(null);
            setSelectedBatchAlerts([]);
          }}
        />
      )}

    </div>
  );
}
