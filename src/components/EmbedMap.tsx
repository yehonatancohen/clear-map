"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { configureLive } from "@/lib/liveStore";
import { useLiveSnapshot } from "@/hooks/useLiveState";
import { usePolygons, type PolygonLookup } from "@/hooks/usePolygons";
import { useMergedPolygons } from "@/hooks/useMergedPolygons";
import type { ActiveAlert } from "@/types";
import CityLabels from "./CityLabels";
import ConnectionBanner from "./ConnectionBanner";
import { THEMES, MAX_TILE_ZOOM, TileCrossfadeStyle, getMergedPolygonStyle } from "./mapStyle";

// Embeds poll the CDN-cached /api/live instead of opening a Firebase socket,
// so a busy news homepage can't exhaust the main site's connection capacity.
configureLive("poll");

const ISRAEL_CENTER: [number, number] = [31.6, 34.9];
const DEFAULT_ZOOM = 7;

const CHIPS = [
  { key: "alert", color: "#FF2A2A", label: "ירי טילים" },
  { key: "uav", color: "#E040FB", label: 'כטב"מ' },
  { key: "terrorist", color: "#FF0055", label: "מחבלים" },
  { key: "pre_alert", color: "#FF6A00", label: "התרעה מוקדמת" },
  { key: "after_alert", color: "#c76b6b", label: 'בממ"ד' },
];

/**
 * Lightweight live alert map for news sites: /embed?theme=dark|light&lat=&lon=&zoom=&fit=0
 * No panels, notifications or prediction layers; always links back to the site.
 */
export default function EmbedMap() {
  const params = useSearchParams();
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const lat = parseFloat(params.get("lat") ?? "");
  const lon = parseFloat(params.get("lon") ?? "");
  const zoom = parseInt(params.get("zoom") ?? "", 10);
  const center: [number, number] = Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : ISRAEL_CENTER;
  const initialZoom = Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM;
  const autoFit = params.get("fit") !== "0";

  const live = useLiveSnapshot();
  const alerts = useMemo(
    () => Object.values(live.alerts ?? {}).filter((a): a is ActiveAlert => !!a?.city_name_he && !a.is_test),
    [live.alerts],
  );
  const polygons = usePolygons();
  const merged = useMergedPolygons(alerts, polygons);

  const counts = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const activeChips = CHIPS.filter((c) => counts[c.key]);
  const dark = theme === "dark";

  return (
    <div className={`relative h-full w-full ${dark ? "bg-gray-950" : "bg-gray-100"}`} dir="rtl">
      <MapContainer center={center} zoom={initialZoom} zoomControl={false} attributionControl={false} style={{ height: "100%", width: "100%" }}>
        <TileCrossfadeStyle />
        <TileLayer
          url={dark ? THEMES.dark : THEMES.light}
          className={dark ? "map-tiles-dark" : "map-tiles-light"}
          crossOrigin="anonymous"
          maxNativeZoom={MAX_TILE_ZOOM}
          maxZoom={MAX_TILE_ZOOM}
        />
        {autoFit && <EmbedFitter alerts={alerts} polygons={polygons} home={center} homeZoom={initialZoom} />}
        {merged.map((mp) =>
          mp.positions.map((positions, idx) => (
            <Polygon key={`${mp.id}_${idx}`} positions={positions} pathOptions={getMergedPolygonStyle(mp, false)} />
          )),
        )}
        <CityLabels polygons={polygons} theme={theme} alerts={alerts} />
      </MapContainer>

      <ConnectionBanner compact />

      <a
        href="https://clearmap.co.il/?utm_source=embed"
        target="_blank"
        rel="noopener"
        className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-white shadow"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 status-dot-pulse" />
        <span className="text-[12px] font-bold">מפה שקופה</span>
        <span className="text-[10px] text-white/60" dir="ltr">clearmap.co.il</span>
      </a>

      <div className="absolute bottom-2 right-2 left-2 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-black/60 backdrop-blur px-3 py-1.5 text-white">
          {activeChips.length === 0 ? (
            <span className="text-[12px] text-white/70">{live.source === "none" ? "טוען..." : "אין התרעות פעילות"}</span>
          ) : (
            activeChips.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-[12px] font-bold tabular-nums" style={{ color: c.color }}>{counts[c.key]}</span>
                <span className="text-[11px] text-white/70">{c.label}</span>
              </span>
            ))
          )}
        </div>
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] text-white/60">
          אינו תחליף להתרעות פיקוד העורף
        </span>
      </div>
    </div>
  );
}

function EmbedFitter({
  alerts, polygons, home, homeZoom,
}: {
  alerts: ActiveAlert[];
  polygons: PolygonLookup | null;
  home: [number, number];
  homeZoom: number;
}) {
  const map = useMap();
  const prevKey = useRef("");

  useEffect(() => {
    if (!polygons) return;
    const names = alerts.map((a) => a.city_name_he).sort();
    const key = names.join(",");
    if (key === prevKey.current) return;
    prevKey.current = key;

    const coords = names.flatMap((n) => polygons[n]?.polygon ?? []);
    if (coords.length === 0) {
      map.setView(home, homeZoom, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(coords.map(([la, ln]) => L.latLng(la, ln))), {
      padding: [30, 40],
      maxZoom: 11,
      animate: true,
    });
  }, [alerts, polygons, map, home, homeZoom]);

  return null;
}
