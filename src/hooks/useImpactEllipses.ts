import { useMemo } from "react";
import { ActiveAlert } from "@/types";
import { PolygonLookup } from "./usePolygons";

export interface ImpactEllipse {
  id: string;
  /** Estimated hit center [lat, lng] */
  center: [number, number];
  /** Ring of [lat, lng] points forming the outer ellipse */
  ellipseRing: [number, number][];
  /** Ring of [lat, lng] points forming the smaller inner hit-area ellipse */
  hitAreaRing: [number, number][];
  /** Rotation angle of major axis in degrees (0 = north, clockwise) */
  majorAxisAngleDeg: number;
  /** Bearing toward estimated launch origin (degrees, 0 = north, clockwise) */
  launchBearingDeg: number;
  /** Estimated distance from the center to the origin (km) */
  launchDistanceKm: number;
  /** Name of the estimated source (e.g. Lebanon, Iran) */
  launchSource: string;
  /** Semi-major axis length in km */
  semiMajorKm: number;
  /** Semi-minor axis length in km */
  semiMinorKm: number;
  /** Alert status color key */
  status: string;
}

const MIN_CITIES_FOR_ELLIPSE = 3;
const ELLIPSE_POINTS = 64;
/**
 * Cluster distance scales with latitude: denser in the north, sparser in the south.
 * 20 km at lat ≥ 33 (Galilee/north), up to 50 km at lat ≤ 30 (deep Negev/Eilat).
 */
function clusterDistanceKm(lat: number): number {
  const t = Math.max(0, Math.min(1, (33.0 - lat) / 3.0));
  return 20 + t * 30;
}
/** Inner hit-area ellipse is this fraction of the outer ellipse */
const HIT_AREA_SCALE = 0.25;
// Israel approximate center for launch direction heuristic
const ISRAEL_CENTER_LAT = 31.5;
const ISRAEL_CENTER_LNG = 34.8;

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function toDeg(rad: number) { return (rad * 180) / Math.PI; }

function kmToLatLng(kmNorth: number, kmEast: number, atLat: number): [number, number] {
  const dLat = kmNorth / 111.32;
  const dLng = kmEast / (111.32 * Math.cos(toRad(atLat)));
  return [dLat, dLng];
}

function centroid(points: [number, number][]): [number, number] {
  let sumLat = 0, sumLng = 0;
  for (const [lat, lng] of points) {
    sumLat += lat;
    sumLng += lng;
  }
  return [sumLat / points.length, sumLng / points.length];
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sin2Lat = Math.sin(dLat / 2) ** 2;
  const sin2Lng = Math.sin(dLng / 2) ** 2;
  const h = sin2Lat + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sin2Lng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Simple union-find / DBSCAN-style clustering by distance.
 * Groups city centroids that are within CLUSTER_DISTANCE_KM of each other.
 */
/** Approximate polygon radius: max distance from centroid to any boundary vertex (km). */
function polygonRadius(poly: [number, number][], cent: [number, number]): number {
  let max = 0;
  for (const p of poly) {
    const d = haversineKm(cent, p);
    if (d > max) max = d;
  }
  return max;
}

function clusterCentroids(
  items: { cityName: string; centroid: [number, number]; status: string; radius: number }[],
): { cityName: string; centroid: [number, number]; status: string; radius: number }[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function unite(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Unite cities whose polygon borders are within the cluster threshold.
  // Border-to-border distance ≈ centroid distance − sum of polygon radii.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].status !== items[j].status) continue;
      const centDist = haversineKm(items[i].centroid, items[j].centroid);
      const borderDist = Math.max(0, centDist - items[i].radius - items[j].radius);
      const avgLat = (items[i].centroid[0] + items[j].centroid[0]) / 2;
      if (borderDist <= clusterDistanceKm(avgLat)) {
        unite(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  return Array.from(groups.values()).map(indices => indices.map(i => items[i]));
}

/**
 * PCA angle from city centroids only.
 * Using centroids (one point per city) means the orientation reflects how the
 * cities are spatially arranged, not the internal shape of their polygons.
 * Large polygon cities (e.g. Tel Aviv) would otherwise dominate the covariance.
 */
function pcaAngle(cityCentroids: [number, number][]): number {
  const c = centroid(cityCentroids);
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [lat, lng] of cityCentroids) {
    const dy = (lat - c[0]) * 111.32;
    const dx = (lng - c[1]) * 111.32 * Math.cos(toRad(c[0]));
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  const n = cityCentroids.length;
  cxx /= n; cxy /= n; cyy /= n;

  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;

  if (Math.abs(cxy) < 1e-10) return cxx >= cyy ? 90 : 0;
  return toDeg(Math.atan2(cxy, lambda1 - cyy)) - 90;
}

/**
 * Extrapolated ellipse extents that handle coastline clipping.
 *
 * For each city in the cluster, we measure its polygon extent in all four
 * axis-aligned directions (±major, ±minor) relative to its own centroid.
 * We then use max(+side, −side) as the city's "symmetric radius" along each
 * axis — if the sea side is clipped at the coastline and thus shorter than
 * the land side, the land-side radius is mirrored to fill in the sea area.
 * If both sides are roughly equal (open land city) nothing changes.
 *
 * The global semi-axes are then:
 *   semiAxis = max over all cities of (centroid_projection + symmetric_radius)
 * taken independently in the positive and negative directions, then the larger
 * of the two becomes the final semi-axis (symmetric ellipse).
 */
function extentsAlongAngleExtrapolated(
  cluster: { cityName: string; centroid: [number, number] }[],
  polygons: PolygonLookup,
  center_: [number, number],
  angleDeg: number,
): { semiMajor: number; semiMinor: number } {
  const rotRad = toRad(angleDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  let posMajor = 0, negMajor = 0;
  let posMinor = 0, negMinor = 0;

  for (const item of cluster) {
    const poly = polygons[item.cityName];
    if (!poly?.polygon?.length) continue;

    // Centroid projection onto axes relative to cluster center
    const cdy = (item.centroid[0] - center_[0]) * 111.32;
    const cdx = (item.centroid[1] - center_[1]) * 111.32 * Math.cos(toRad(center_[0]));
    const cMajor = -cdx * sinR + cdy * cosR;
    const cMinor = cdx * cosR + cdy * sinR;

    // City's own extent along each axis direction, relative to its centroid
    let cityPosMajor = 0, cityNegMajor = 0;
    let cityPosMinor = 0, cityNegMinor = 0;

    for (const [lat, lng] of poly.polygon) {
      const dy = (lat - item.centroid[0]) * 111.32;
      const dx = (lng - item.centroid[1]) * 111.32 * Math.cos(toRad(item.centroid[0]));
      const pMajor = -dx * sinR + dy * cosR;
      const pMinor = dx * cosR + dy * sinR;

      if (pMajor > cityPosMajor) cityPosMajor = pMajor;
      if (-pMajor > cityNegMajor) cityNegMajor = -pMajor;
      if (pMinor > cityPosMinor) cityPosMinor = pMinor;
      if (-pMinor > cityNegMinor) cityNegMinor = -pMinor;
    }

    // Symmetric radius: mirror the larger (non-clipped) side onto the smaller
    // (potentially coast-clipped) side so the ellipse extends over the sea.
    const radiusMajor = Math.max(cityPosMajor, cityNegMajor);
    const radiusMinor = Math.max(cityPosMinor, cityNegMinor);

    // Global extent from cluster center, both directions
    if (cMajor + radiusMajor > posMajor) posMajor = cMajor + radiusMajor;
    if (-cMajor + radiusMajor > negMajor) negMajor = -cMajor + radiusMajor;
    if (cMinor + radiusMinor > posMinor) posMinor = cMinor + radiusMinor;
    if (-cMinor + radiusMinor > negMinor) negMinor = -cMinor + radiusMinor;
  }

  return {
    semiMajor: Math.max(Math.max(posMajor, negMajor) * 0.98, 1.0),
    semiMinor: Math.max(Math.max(posMinor, negMinor) * 0.98, 0.6),
  };
}

/**
 * Approximate Israel Mediterranean coastline longitude for a given latitude.
 * Interpolated from roughly (33.1°N, 35.08°E) in the north to (31.3°N, 34.25°E) in the south.
 */
function coastlineLng(lat: number): number {
  return 34.25 + (lat - 31.3) * (35.08 - 34.25) / (33.1 - 31.3);
}

/**
 * Adjust ellipse center and extents when near the Mediterranean coastline.
 *
 * Because alerts only come from land-based cities, coastal clusters have their
 * centroid shifted inland. This function:
 *  1. Detects if the cluster is close to the coast
 *  2. Shifts the center seaward to compensate for the missing sea-side data
 *  3. Slightly expands the axis perpendicular to the coast
 *
 * This makes coastal ellipses "imagine" the sea as part of the alert zone,
 * producing a more realistic coverage shape.
 */
function adjustForCoastline(
  center: [number, number],
  semiMajor: number,
  semiMinor: number,
  angleDeg: number,
): { center: [number, number]; semiMajor: number; semiMinor: number } {
  const cLng = coastlineLng(center[0]);

  // Distance from center to coastline in km (positive = east of coast / inland)
  const cosLat = Math.cos(toRad(center[0]));
  const distToCoastKm = (center[1] - cLng) * 111.32 * cosLat;

  // Only apply if cluster is inland and within threshold of coast
  const COAST_THRESHOLD_KM = 20;
  if (distToCoastKm < 0 || distToCoastKm > COAST_THRESHOLD_KM) {
    return { center, semiMajor, semiMinor };
  }

  // How "coastal" is this cluster? (1 = right at coast, 0 = at threshold)
  const coastFactor = 1 - distToCoastKm / COAST_THRESHOLD_KM;

  // Shift center seaward (westward) by a fraction of the distance to coast
  const shiftKm = distToCoastKm * 0.4 * coastFactor;
  const shiftLng = shiftKm / (111.32 * cosLat);
  const newCenter: [number, number] = [center[0], center[1] - shiftLng];

  // Determine which axis is roughly perpendicular to the coast (E-W ≈ 90°)
  // and expand it slightly to represent the missing sea-side data
  const angleRad = toRad(angleDeg);
  const majorEW = Math.abs(Math.sin(angleRad)); // 1 if major axis is E-W
  const minorEW = Math.abs(Math.cos(angleRad)); // 1 if minor axis is E-W

  const expandAmount = 1 + coastFactor * 0.2;
  const newSemiMajor = semiMajor * (1 + (expandAmount - 1) * majorEW);
  const newSemiMinor = semiMinor * (1 + (expandAmount - 1) * minorEW);

  return { center: newCenter, semiMajor: newSemiMajor, semiMinor: newSemiMinor };
}

function generateEllipseRing(
  center_: [number, number],
  semiMajorKm: number,
  semiMinorKm: number,
  rotationDeg: number,
): [number, number][] {
  const ring: [number, number][] = [];
  const rotRad = toRad(rotationDeg);

  for (let i = 0; i <= ELLIPSE_POINTS; i++) {
    const theta = (2 * Math.PI * i) / ELLIPSE_POINTS;
    const localY = semiMajorKm * Math.cos(theta);
    const localX = semiMinorKm * Math.sin(theta);

    const rotatedX = localX * Math.cos(rotRad) - localY * Math.sin(rotRad);
    const rotatedY = localX * Math.sin(rotRad) + localY * Math.cos(rotRad);

    const [dLat, dLng] = kmToLatLng(rotatedY, rotatedX, center_[0]);
    ring.push([center_[0] + dLat, center_[1] + dLng]);
  }

  return ring;
}

/**
 * Estimate launch origin distance and metadata based on stretch, orientation, and geographic heuristics.
 */
function estimateOrigin(center: [number, number], majorAxisAngleDeg: number, semiMajorKm: number, semiMinorKm: number): { bearingDeg: number, distanceKm: number, source: string } {
  const bearing1 = ((majorAxisAngleDeg % 360) + 360) % 360;
  const bearing2 = (bearing1 + 180) % 360;

  // Preference order: Lebanon (North) > East > Gaza (SW)
  const isLebanonLat = center[0] > 32.9; // If cluster is very far North, default to Lebanon
  const isSouthOfRishon = center[0] < 32.0; // Rishon is ~31.97
  const isCoastal = center[1] < 34.85; // Close to Mediterranean coast

  function isWest(b: number) { return b >= 240 && b <= 300; }
  let bearingDeg = bearing1;

  if (isLebanonLat) {
      // For northern clusters, pick the vector that points most North (closest to 0 or 360)
      const diff1 = Math.min(Math.abs(bearing1), Math.abs(bearing1 - 360));
      const diff2 = Math.min(Math.abs(bearing2), Math.abs(bearing2 - 360));
      bearingDeg = diff1 <= diff2 ? bearing1 : bearing2;
  } else if (isSouthOfRishon) {
      // For southern clusters, pick the vector that points most South (closest to 180)
      const diff1 = Math.abs(bearing1 - 180);
      const diff2 = Math.abs(bearing2 - 180);
      bearingDeg = diff1 <= diff2 ? bearing1 : bearing2;
  } else if (isCoastal) {
    const diff1 = Math.abs(((bearing1 - 270 + 540) % 360) - 180);
    const diff2 = Math.abs(((bearing2 - 270 + 540) % 360) - 180);
    bearingDeg = diff1 >= diff2 ? bearing1 : bearing2;
  } else {
    if (isWest(bearing1) && !isWest(bearing2)) bearingDeg = bearing2;
    else if (isWest(bearing2) && !isWest(bearing1)) bearingDeg = bearing1;
    else {
      const diff1 = Math.abs(((bearing1 - 270 + 540) % 360) - 180);
      const diff2 = Math.abs(((bearing2 - 270 + 540) % 360) - 180);
      bearingDeg = diff1 >= diff2 ? bearing1 : bearing2;
    }
  }

  const stretch = semiMajorKm / Math.max(semiMinorKm, 1);
  let source = "מקור לא ידוע";
  let distanceKm = 100;

  // North (Lebanon/Syria)
  if (bearingDeg >= 315 || bearingDeg <= 45 || (isLebanonLat && (bearingDeg >= 300 || bearingDeg <= 60))) {
    source = "לבנון";
    const distToBorderKm = Math.max(0, (33.1 - center[0]) * 111.32);
    distanceKm = distToBorderKm + 20 + stretch * 15;
  }
  // West (Mediterranean / Sea-based)
  else if (isWest(bearingDeg)) {
    source = "הים התיכון (שיגור ימי)";
    distanceKm = 30 + stretch * 20;
  }
  // East (Iran/Iraq)
  else if (bearingDeg > 45 && bearingDeg < 135) {
    source = stretch > 3 ? "איראן" : "עיראק/סוריה";
    distanceKm = 1000 + stretch * 150;
  }
  // South/South-East (Yemen)
  else if (bearingDeg >= 135 && bearingDeg <= 210) {
    source = "תימן";
    distanceKm = 1800 + stretch * 50;
  }
  // South West / General local (Gaza/Sinai)
  else {
    source = "עזה/סיני";
    distanceKm = 40 + stretch * 10;
  }

  return { bearingDeg, distanceKm, source };
}

/**
 * Hook: compute impact ellipses from raw alerts + polygon data.
 * Clusters nearby alerts spatially using union-find, then fits a tight
 * PCA ellipse whose edges touch the alert polygon boundaries.
 */
export function useImpactEllipses(
  alerts: ActiveAlert[],
  polygons: PolygonLookup | null,
): ImpactEllipse[] {
  return useMemo(() => {
    if (!polygons || alerts.length === 0) return [];

    // Only compute for actual alerts (e.g. rockets), skip pre_alerts
    const relevant = alerts.filter(a => a.status === "alert");
    if (relevant.length < MIN_CITIES_FOR_ELLIPSE) return [];

    // Compute centroid for each alert's city polygon
    const items: { cityName: string; centroid: [number, number]; status: string; radius: number }[] = [];
    const seen = new Set<string>();
    for (const alert of relevant) {
      if (seen.has(alert.city_name_he)) continue;
      seen.add(alert.city_name_he);

      const poly = polygons[alert.city_name_he];
      if (!poly?.polygon || poly.polygon.length < 3) continue;
      const cent = centroid(poly.polygon);
      items.push({
        cityName: alert.city_name_he,
        centroid: cent,
        status: alert.status,
        radius: polygonRadius(poly.polygon, cent),
      });
    }

    if (items.length < MIN_CITIES_FOR_ELLIPSE) return [];

    // Cluster by proximity
    const clusters = clusterCentroids(items);
    const results: ImpactEllipse[] = [];

    for (const cluster of clusters) {
      if (cluster.length < MIN_CITIES_FOR_ELLIPSE) continue;

      // Center = mean of city centroids (equal weight per city, not per polygon vertex)
      const rawCenter = centroid(cluster.map(item => item.centroid));
      // Angle = PCA of city centroids (reflects how cities are arranged, not polygon shapes)
      const angleDeg = pcaAngle(cluster.map(item => item.centroid));
      // Extents: per-city symmetric radius extrapolation handles coastline clipping
      const rawExtents = extentsAlongAngleExtrapolated(cluster, polygons, rawCenter, angleDeg);
      // Coastline adjustment: shift center seaward and expand when near Mediterranean
      const { center: center_, semiMajor, semiMinor } = adjustForCoastline(
        rawCenter, rawExtents.semiMajor, rawExtents.semiMinor, angleDeg
      );
      const ellipseRing = generateEllipseRing(center_, semiMajor, semiMinor, angleDeg);
      const hitAreaRing = generateEllipseRing(center_, semiMajor * HIT_AREA_SCALE, semiMinor * HIT_AREA_SCALE, angleDeg);
      const { bearingDeg: launchBearingDeg, distanceKm: launchDistanceKm, source: launchSource } = estimateOrigin(
        center_, angleDeg, semiMajor, semiMinor
      );

      results.push({
        id: `ellipse_${cluster[0].status}_${cluster.map(c => c.cityName).join("_").slice(0, 30)}`,
        center: center_,
        ellipseRing,
        hitAreaRing,
        majorAxisAngleDeg: angleDeg,
        launchBearingDeg,
        launchDistanceKm,
        launchSource,
        semiMajorKm: semiMajor,
        semiMinorKm: semiMinor,
        status: cluster[0].status,
      });
    }

    return results;
  }, [alerts, polygons]);
}
