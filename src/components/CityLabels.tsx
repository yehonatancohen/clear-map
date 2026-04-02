"use client";

import { useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { PolygonLookup } from "@/hooks/usePolygons";
import type { ActiveAlert } from "@/types";
import type { ImpactEllipse } from "@/hooks/useImpactEllipses";

interface CityLabelsProps {
  polygons: PolygonLookup | null;
  theme: "light" | "dark";
  alerts?: ActiveAlert[];
  ellipses?: ImpactEllipse[];
}

/** Ray-casting point-in-polygon for a lat/lng ring. */
function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lati, lngi] = ring[i];
    const [latj, lngj] = ring[j];
    if ((lngi > point[1]) !== (lngj > point[1]) &&
        point[0] < (latj - lati) * (point[1] - lngi) / (lngj - lngi) + lati) {
      inside = !inside;
    }
  }
  return inside;
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

export default function CityLabels({ polygons, theme, alerts, ellipses }: CityLabelsProps) {
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

  const alertedCities = useMemo(() => {
    const s = new Set<string>();
    if (alerts) for (const a of alerts) { s.add(a.city_name_he); }
    return s;
  }, [alerts]);

  const hitRings = useMemo(() =>
    ellipses?.map(e => e.hitAreaRing) ?? [],
  [ellipses]);

  const visibleLabels = useMemo(() => {
    if (!map || allLabels.length === 0) return [];
    const maxTier = getLabelHierarchy(mapState.zoom);

    // Annotate each label with its highlight state before sorting
    const annotated = allLabels.map(label => {
      const isAlerted = alertedCities.has(label.id) || alertedCities.has(label.name);
      const isEllipseHit = isAlerted && hitRings.some(ring => pointInRing(label.pos, ring));
      // Cities inside ellipse get a minor zoom boost so they appear slightly earlier
      const effectiveTier = isEllipseHit ? label.tier - 1.0 : isAlerted ? label.tier - 0.5 : label.tier;
      return { label, isAlerted, isEllipseHit, effectiveTier };
    });

    // Sort: ellipse-hit first, then alerted, then by tier
    const sorted = annotated.sort((a, b) => a.effectiveTier - b.effectiveTier);

    const accepted: { label: LabelPoint; isLarge: boolean; isAlerted: boolean; isEllipseHit: boolean }[] = [];
    const occupiedRects: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const mapSize = map.getSize();

    for (const { label, isAlerted, isEllipseHit, effectiveTier } of sorted) {
      if (effectiveTier > maxTier) continue;
      const point = map.latLngToContainerPoint(label.pos);
      if (point.x < -50 || point.y < -50 || point.x > mapSize.x + 50 || point.y > mapSize.y + 50) continue;

      const isLarge = mapState.zoom < 10 && label.tier <= 1;
      const fontSize = isLarge ? 14 : 12;
      const width = label.name.length * (fontSize * 0.8) + 12;
      const height = fontSize + 10;
      const rect = { x1: point.x - width / 2, y1: point.y - height / 2, x2: point.x + width / 2, y2: point.y + height / 2 };

      const padding = mapState.zoom >= 11 ? 4 : 18;
      if (!occupiedRects.some(r => rect.x1 - padding < r.x2 && rect.x2 + padding > r.x1 && rect.y1 - padding < r.y2 && rect.y2 + padding > r.y1)) {
        accepted.push({ label, isLarge, isAlerted, isEllipseHit });
        occupiedRects.push(rect);
      }
    }
    return accepted;
  }, [allLabels, mapState, map, alertedCities, hitRings]);

  return (
    <>
      {visibleLabels.map(({ label, isLarge, isAlerted, isEllipseHit }) => {
        const extra = isEllipseHit ? 'ellipse-hit' : isAlerted ? 'alerted' : '';
        return (
          <Marker
            key={label.id}
            position={label.pos}
            interactive={false}
            icon={L.divIcon({
              className: "city-label-container",
              html: `<div class="city-label ${theme} ${isLarge ? 'size-large' : ''} ${extra}">${label.name}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          />
        );
      })}
    </>
  );
}
