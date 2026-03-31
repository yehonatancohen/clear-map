"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Polygon, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { useFirebaseAlerts } from "@/hooks/useFirebaseAlerts";
import { usePolygons, PolygonLookup } from "@/hooks/usePolygons";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useMergedPolygons, MergedPolygon } from "@/hooks/useMergedPolygons";
import { useImpactEllipses } from "@/hooks/useImpactEllipses";
import ImpactEllipseLayer from "./ImpactEllipse";
import IntelPanel from "./IntelBanner";
import LiveIndicator from "./LiveIndicator";
import UavFlightPath from "./UavFlightPath";
import { useUavTracks } from "@/hooks/useUavTracks";
import { setMapInstance } from "@/lib/mapRef";
import { useSunCycle } from "@/hooks/useSunCycle";
import { ActiveAlert, UavTrack } from "@/types";
import type { MapMode } from "./TimelineModeToggle";
import TimelinePolygons from "./TimelinePolygons";
import HistoryPanel from "./HistoryPanel";
import { useHistoryAlerts, SortedAlert } from "@/hooks/useTimelineHistory";
import CityLabels from "./CityLabels";
import { SupportBanner } from "./SupportBanner";

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

function SetViewOnLoad({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], zoom, { animate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const TILE_FADE_STYLE_ID = "tile-crossfade-style";
function TileCrossfadeStyle() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(TILE_FADE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TILE_FADE_STYLE_ID;
    style.textContent = `.leaflet-tile-pane .leaflet-layer { transition: opacity 2s ease-in-out; }`;
    document.head.appendChild(style);
  }, []);
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
  userCoords,
  isBroadcast = false,
}: {
  alerts: ActiveAlert[] | SortedAlert[];
  polygons: PolygonLookup | null;
  uavTracks?: UavTrack[];
  isHistory?: boolean;
  /** When set, include user position in bounds if alerts are nearby. */
  userCoords?: [number, number] | null;
  isBroadcast?: boolean;
}) {
  const map = useMap();
  const prevIdsRef = useRef<string>("");
  const searchParams = useSearchParams();
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");

  useEffect(() => {
    if (!polygons) return;
    if (alerts.length === 0 && (!uavTracks || uavTracks.length === 0)) return;

    // IF lat/lon params are present, DO NOT perform auto-fit.
    // We want to respect the manual view requested via URL (usually from screenshot bot).
    if (latParam && lonParam) {
      return;
    }

    // In broadcast mode (without specific lat/lon), we add a delay to the fit logic
    // to allow the map to stabilize before capturing.
    if (isBroadcast) {
      const timer = setTimeout(() => {
        const cityNames = alerts.map((a) => ("city_name_he" in a ? a.city_name_he : a.data));
        const currentIds = cityNames.sort().join(",");
        if (currentIds === prevIdsRef.current) return;
        prevIdsRef.current = currentIds;
        performFit(cityNames);
      }, 12000);
      return () => clearTimeout(timer);
    }

    const cityNames = alerts.map((a) => ("city_name_he" in a ? a.city_name_he : a.data));
    const currentIds = cityNames.sort().join(",");

    if (currentIds === prevIdsRef.current) return;
    prevIdsRef.current = currentIds;

    performFit(cityNames);
  }, [alerts, polygons, uavTracks, isHistory, userCoords, map, isBroadcast, latParam, lonParam]);

  const performFit = (cityNames: string[]) => {
    // When user location is active, check if any alert is nearby.
    // If so, fit only to nearby alerts + user position (ignore distant alerts).
    if (userCoords) {
      const nearbyCoords: [number, number][] = [userCoords];
      for (const a of alerts) {
        const name = "city_name_he" in a ? a.city_name_he : (a as SortedAlert).data;
        const status = "city_name_he" in a ? (a as ActiveAlert).status : "alert";
        if (status !== "alert" && status !== "pre_alert" && status !== "uav" && status !== "terrorist") continue;
        const poly = polygons![name];
        if (!poly?.polygon || poly.polygon.length === 0) continue;
        const cLat = poly.polygon.reduce((s: number, p: [number, number]) => s + p[0], 0) / poly.polygon.length;
        const cLng = poly.polygon.reduce((s: number, p: [number, number]) => s + p[1], 0) / poly.polygon.length;
        if (haversineKm(userCoords, [cLat, cLng]) <= NEARBY_RADIUS_KM) {
          nearbyCoords.push(...poly.polygon);
        }
      }

      // If there are nearby alerts, fit to user area only
      if (nearbyCoords.length > 1) {
        const bounds = L.latLngBounds(nearbyCoords.map(([lat, lng]) => L.latLng(lat, lng)));
        const isMobile = window.innerWidth < 640;
        map.fitBounds(bounds, {
          paddingTopLeft: [20, isMobile ? 80 : 50],
          paddingBottomRight: [20, 50],
          maxZoom: 13,
          animate: true,
          duration: 0.8,
        });
        return;
      }
    }

    // Default: fit to all alerts + UAV tracks
    const allCoords: [number, number][] = [];
    for (const cityName of cityNames) {
      const poly = polygons![cityName];
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
  };

  return null;
}

const USER_LOCATION_STYLE_ID = "user-location-styles";
function ensureUserLocationStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(USER_LOCATION_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = USER_LOCATION_STYLE_ID;
  style.textContent = `
    @keyframes user-loc-pulse {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
      100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
    }
    .user-loc-dot {
      position: relative;
      width: 16px; height: 16px;
    }
    .user-loc-dot::before {
      content: '';
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 12px; height: 12px;
      background: #4285F4;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(66,133,244,0.5);
      z-index: 2;
    }
    .user-loc-dot::after {
      content: '';
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 12px; height: 12px;
      background: rgba(66,133,244,0.4);
      border-radius: 50%;
      animation: user-loc-pulse 2s ease-out infinite;
      z-index: 1;
    }
  `;
  document.head.appendChild(style);
}

const userLocationIcon = L.divIcon({
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: '<div class="user-loc-dot"></div>',
});

/** Show a blue dot at the user's GPS position. */
function UserLocationMarker({ coords }: { coords: [number, number] }) {
  useEffect(() => { ensureUserLocationStyles(); }, []);
  return (
    <Marker
      position={coords}
      icon={userLocationIcon}
      interactive={false}
      zIndexOffset={900}
    />
  );
}

/** Proximity radius (km) — if any alert centroid is within this distance, consider user "in the area". */
const NEARBY_RADIUS_KM = 30;

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sin2Lat = Math.sin(dLat / 2) ** 2;
  const sin2Lng = Math.sin(dLng / 2) ** 2;
  const h = sin2Lat + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * sin2Lng;
  return 2 * R * Math.asin(Math.sqrt(h));
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

export default function MapView({ isBroadcast = false }: { isBroadcast?: boolean }) {
  const alerts = useFirebaseAlerts();
  const polygons = usePolygons();
  const mergedPolygons = useMergedPolygons(alerts, polygons);
  const impactEllipses = useImpactEllipses(alerts, polygons);
  const uavTracks = useUavTracks();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("map_theme");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });
  const setTheme = (t: "light" | "dark") => {
    localStorage.setItem("map_theme", t);
    setThemeState(t);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<MapMode>("live");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchAlerts, setSelectedBatchAlerts] = useState<SortedAlert[]>([]);

  const { settings, userCoords } = useNotificationSettings();
  const searchParams = useSearchParams();
  const rawUav = searchParams.get("uav");
  const rawEllipse = searchParams.get("ellipse");
  const rawTheme = searchParams.get("theme");
  const rawLat = searchParams.get("lat");
  const rawLon = searchParams.get("lon");
  const rawZoom = searchParams.get("zoom");

  const initialCenter: [number, number] =
    isBroadcast && rawLat && rawLon
      ? [parseFloat(rawLat), parseFloat(rawLon)]
      : ISRAEL_CENTER;
  const initialZoom = isBroadcast && rawZoom ? parseInt(rawZoom, 10) : DEFAULT_ZOOM;

  const showUav = isBroadcast && rawUav ? rawUav === "true" : settings.showUavPath;
  const showEllipse = isBroadcast && rawEllipse ? rawEllipse === "true" : settings.showImpactZones;
  const showMyLocation = settings.showMyLocation && userCoords !== null;

  // Auto theme logic: URL param > Auto Theme setting > Manual theme
  const sunCycle = useSunCycle(settings.autoTheme);
  const effectiveTheme = isBroadcast && rawTheme === "dark" ? "dark" 
    : isBroadcast && rawTheme === "light" ? "light"
    : settings.autoTheme ? sunCycle.theme : theme;

  const { batches, loading, hasMore, loadMore } = useHistoryAlerts(mode === "history");

  const historyMappedAlerts = useMemo((): ActiveAlert[] => {
    if (mode !== "history") return [];
    return selectedBatchAlerts.map(a => ({
      id: `h_${a._ts}_${a.data}`,
      city_name: "",
      city_name_he: a.data,
      timestamp: a._ts,
      is_double: false,
      status: a.status || (a.category === 1 ? "alert" : a.category === 2 ? "uav" : "other"),
    }));
  }, [mode, selectedBatchAlerts]);

  const historyImpactEllipses = useImpactEllipses(historyMappedAlerts, polygons);

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
    <div id="map-root" ref={containerRef} className={`relative h-[100dvh] w-screen transition-colors duration-500 ${effectiveTheme === "dark" ? "bg-gray-950" : "bg-gray-100"}`}>
      {!isBroadcast && (
        <IntelPanel
          alerts={alerts}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          theme={effectiveTheme}
          onThemeChange={setTheme}
          mode={mode}
          onModeChange={setMode}
        />
      )}
      {!isBroadcast && <LiveIndicator mode={mode} />}
      {!isBroadcast && <SupportBanner />}
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <ZoomListener />
        <MapRefSetter />
        <TileCrossfadeStyle />
        {isBroadcast && rawLat && rawLon && rawZoom && (
          <SetViewOnLoad
            lat={parseFloat(rawLat)}
            lon={parseFloat(rawLon)}
            zoom={parseInt(rawZoom, 10)}
          />
        )}
        {/* Base: dark tiles always present */}
        <TileLayer url={THEMES.dark} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' crossOrigin="anonymous" />
        {/* Light tiles on top — opacity controls the blend */}
        <TileLayer
          url={THEMES.light}
          opacity={settings.autoTheme ? sunCycle.dayFactor : effectiveTheme === "light" ? 1 : 0}
          crossOrigin="anonymous"
        />

        {mode === "live" && (
          <>
            <AlertFitter alerts={alerts} polygons={polygons} uavTracks={uavTracks} userCoords={showMyLocation ? userCoords : null} isBroadcast={isBroadcast} />
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
            {showUav && <UavFlightPath tracks={uavTracks} theme={effectiveTheme} />}
            {showEllipse && <ImpactEllipseLayer ellipses={impactEllipses} />}
            {showMyLocation && <UserLocationMarker coords={userCoords!} />}
          </>
        )}

        {mode === "history" && selectedBatchAlerts.length > 0 && (
          <>
            <AlertFitter alerts={selectedBatchAlerts} polygons={polygons} isHistory={true} isBroadcast={isBroadcast} />
            <TimelinePolygons alerts={selectedBatchAlerts} polygons={polygons} />
            {showEllipse && <ImpactEllipseLayer ellipses={historyImpactEllipses} />}
          </>
        )}

        <CityLabels polygons={polygons} theme={effectiveTheme} />
      </MapContainer>
      {!isBroadcast && mode === "history" && (
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
