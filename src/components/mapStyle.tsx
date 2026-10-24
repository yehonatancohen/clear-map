"use client";

import { useEffect } from "react";
import type { MergedPolygon } from "@/hooks/useMergedPolygons";

// Shared by the main map and the /embed widget.

// CARTO killed anonymous access to basemaps.cartocdn.com (every tile now comes
// back stamped with an "API KEY REQUIRED" watermark), so the base map is served
// from Google's road tiles instead. The dark/light look is produced with a CSS
// filter on the tile layer (see MAP_TILE_STYLE below) rather than by swapping
// providers, which keeps street-level zoom (~20) and avoids a second dependency.
// `apistyle=s.e:l|p.v:off` strips every label and POI from the tiles so they
// don't fight the app's own CityLabels overlay; the explicit "google" theme
// keeps the fully-labelled map on purpose.
export const GOOGLE_ROADS_NOLABELS =
  "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=iw&apistyle=s.e%3Al%7Cp.v%3Aoff";
export const GOOGLE_ROADS = "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=iw";
export const MAX_TILE_ZOOM = 20;
export const THEMES = {
  dark: GOOGLE_ROADS_NOLABELS,
  light: GOOGLE_ROADS_NOLABELS,
  google: GOOGLE_ROADS,
};


const TILE_FADE_STYLE_ID = "tile-crossfade-style";
// Both base layers pull the same Google road tiles; the dark/light appearance is
// a CSS filter. `invert + hue-rotate` is the standard "dark map" trick (white
// land -> near-black, water/parks keep a plausible hue); the extra
// brightness/contrast/saturate knobs mute it so the coloured alert polygons
// drawn on top stay legible. The light layer is only lightly desaturated.
const MAP_TILE_STYLE = `
.leaflet-tile-pane .leaflet-layer { transition: opacity 0.4s ease-in-out; }
.leaflet-tile-pane .map-tiles-dark {
  filter: invert(1) hue-rotate(180deg) brightness(0.78) contrast(0.95) saturate(0.42) grayscale(0.32);
}
.leaflet-tile-pane .map-tiles-light {
  filter: saturate(0.5) brightness(1.03) contrast(0.95);
}
`;
export function TileCrossfadeStyle() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(TILE_FADE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TILE_FADE_STYLE_ID;
    style.textContent = MAP_TILE_STYLE;
    document.head.appendChild(style);
  }, []);
  return null;
}

export function getMergedPolygonStyle(mp: MergedPolygon, isNew: boolean) {
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
