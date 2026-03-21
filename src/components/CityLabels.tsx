"use client";

import { useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { PolygonLookup } from "@/hooks/usePolygons";

interface CityLabelsProps {
  polygons: PolygonLookup | null;
  theme: "light" | "dark";
}

export interface LabelPoint {
  id: string;
  name: string;
  pos: [number, number];
  tier: number;
}

export const CITY_RANKINGS: Record<string, number> = {
  // Tier 0: Top Metropolis (Always visible)
  "תל אביב": 0, "תל אביב - יפו": 0, "ירושלים": 0, "חיפה": 0,

  // Tier 1: Large Metropolitan Centers
  "באר שבע": 1, "אשדוד": 1, "ראשון לציון": 1, "פתח תקווה": 1, "נתניה": 1,

  // Tier 2: Major Urban Centers
  "חולון": 2, "בני ברק": 2, "רמת גן": 2, "אשקלון": 2, "רחובות": 2, "בית שמש": 2,
  "בת ים": 2, "הרצליה": 2, "כפר סבא": 2, "חדרה": 2, "מודיעין": 2,
  "מודיעין-מכבים-רעות": 2, "רעננה": 2, "אילת": 2,

  // Tier 3: Regional Centers
  "לוד": 3, "רמלה": 3, "נהריה": 3, "עכו": 3, "כרמיאל": 3, "עפולה": 3,
  "טבריה": 3, "נצרת": 3, "קריית גת": 3, "קריית שמונה": 3, "הוד השרון": 3,
  "גבעת שמואל": 3, "נוף הגליל": 3, "אום אל-פחם": 3, "רהט": 3,

  // Tier 3.5: Large Towns / Secondary Centers
  "צפת": 3.5, "קצרין": 3.5, "דימונה": 3.5, "ערד": 3.5, "שדרות": 3.5, "נתיבות": 3.5,
  "אריאל": 3.5, "מעלה אדומים": 3.5, "קריית מלאכי": 3.5, "מגדל העמק": 3.5,
  "מעלות-תרשיחא": 3.5, "יקנעם עילית": 3.5, "טירת כרמל": 3.5, "נשר": 3.5,
  "קריית ים": 3.5, "קריית ביאליק": 3.5, "קריית מוצקין": 3.5, "קריית אתא": 3.5,
  "טייבה": 3.5, "שפרעם": 3.5, "באקה אל-גרבייה": 3.5,
};

export function getLabelHierarchy(zoom: number) {
    if (zoom >= 11.8) return 4;
    if (zoom >= 11.2) return 3.5;
    if (zoom >= 10.5) return 3;
    if (zoom >= 9.5) return 2;
    if (zoom >= 8) return 1;
    return 0;
}

export default function CityLabels({ polygons, theme }: CityLabelsProps) {
  const map = useMap();
  const [mapState, setMapState] = useState({
    zoom: map.getZoom(),
    center: map.getCenter(),
    bounds: map.getBounds().toBBoxString()
  });

  useMapEvents({
    moveend: () => setMapState({ zoom: map.getZoom(), center: map.getCenter(), bounds: map.getBounds().toBBoxString() }),
    zoomend: () => setMapState({ zoom: map.getZoom(), center: map.getCenter(), bounds: map.getBounds().toBBoxString() })
  });

  const showIndividual = mapState.zoom >= 11.5;

  const allLabels = useMemo(() => {
    if (!polygons) return [];
    const groupedData: Record<string, { lat: number; lng: number; count: number }> = {};
    const labels: LabelPoint[] = [];

    for (const [heName, entry] of Object.entries(polygons)) {
      if (!entry.polygon || entry.polygon.length === 0) continue;
      let latSum = 0, lngSum = 0;
      for (const p of entry.polygon) { latSum += p[0]; lngSum += p[1]; }
      const centroid = { lat: latSum / entry.polygon.length, lng: lngSum / entry.polygon.length };

      if (heName.includes(" - ")) {
        let cityName = heName.split(" - ")[0].trim();
        if (cityName === "תל אביב") cityName = "תל אביב - יפו";
        if (!groupedData[cityName]) groupedData[cityName] = { lat: 0, lng: 0, count: 0 };
        groupedData[cityName].lat += centroid.lat;
        groupedData[cityName].lng += centroid.lng;
        groupedData[cityName].count += 1;
        if (showIndividual) {
          labels.push({ id: heName, name: heName, pos: [centroid.lat, centroid.lng], tier: CITY_RANKINGS[cityName] ?? 4 });
        }
      } else {
        labels.push({ id: heName, name: heName, pos: [centroid.lat, centroid.lng], tier: CITY_RANKINGS[heName] ?? 4 });
      }
    }

    if (!showIndividual) {
      for (const [name, data] of Object.entries(groupedData)) {
        labels.push({ id: `grouped_${name}`, name: name, pos: [data.lat / data.count, data.lng / data.count], tier: CITY_RANKINGS[name] ?? 4 });
      }
    }
    return labels;
  }, [polygons, showIndividual]);

  const visibleLabels = useMemo(() => {
    if (!map || allLabels.length === 0) return [];
    const sorted = [...allLabels].sort((a, b) => a.tier - b.tier);
    const accepted: { label: LabelPoint; isLarge: boolean }[] = [];
    const occupiedRects: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const mapSize = map.getSize();
    const maxTier = getLabelHierarchy(mapState.zoom);

    for (const label of sorted) {
      if (label.tier > maxTier) continue;
      const point = map.latLngToContainerPoint(label.pos);
      if (point.x < -50 || point.y < -50 || point.x > mapSize.x + 50 || point.y > mapSize.y + 50) continue;

      // Determine if label should be larger
      const isLarge = mapState.zoom < 10 && label.tier <= 1;
      const fontSize = isLarge ? 14 : 12;
      
      // Calculate dimensions for text-only without background padding
      const width = label.name.length * (fontSize * 0.8) + 12;
      const height = fontSize + 10;
      const rect = { x1: point.x - width / 2, y1: point.y - height / 2, x2: point.x + width / 2, y2: point.y + height / 2 };
      
      const padding = mapState.zoom >= 11 ? 4 : 18;
      if (!occupiedRects.some(r => rect.x1 - padding < r.x2 && rect.x2 + padding > r.x1 && rect.y1 - padding < r.y2 && rect.y2 + padding > r.y1)) {
        accepted.push({ label, isLarge });
        occupiedRects.push(rect);
      }
    }
    return accepted;
  }, [allLabels, mapState, map]);

  return (
    <>
      {visibleLabels.map(({ label, isLarge }) => (
        <Marker
          key={label.id}
          position={label.pos}
          interactive={false}
          icon={L.divIcon({
            className: "city-label-container",
            html: `<div class="city-label ${theme} ${isLarge ? 'size-large' : ''}">${label.name}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
        />
      ))}
    </>
  );
}
