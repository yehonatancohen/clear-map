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
function clusterCentroids(
  items: { cityName: string; centroid: [number, number]; status: string }[],
): { cityName: string; centroid: [number, number]; status: string }[][] {
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

  // Unite nearby cities with the same status, using latitude-adjusted distance
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].status !== items[j].status) continue;
      const avgLat = (items[i].centroid[0] + items[j].centroid[0]) / 2;
      if (haversineKm(items[i].centroid, items[j].centroid) <= clusterDistanceKm(avgLat)) {
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
 * Max-projection extents of all boundary points along the given axis angle.
 * Gives the tight-fit semi-axes so the ellipse touches the polygon edges.
 */
function extentsAlongAngle(
  allBoundaryPoints: [number, number][],
  center_: [number, number],
  angleDeg: number,
): { semiMajor: number; semiMinor: number } {
  const rotRad = toRad(angleDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  let maxMajor = 0, maxMinor = 0;

  for (const [lat, lng] of allBoundaryPoints) {
    const dy = (lat - center_[0]) * 111.32;
    const dx = (lng - center_[1]) * 111.32 * Math.cos(toRad(center_[0]));
    const pMajor = Math.abs(-dx * sinR + dy * cosR);
    const pMinor = Math.abs(dx * cosR + dy * sinR);
    if (pMajor > maxMajor) maxMajor = pMajor;
    if (pMinor > maxMinor) maxMinor = pMinor;
  }

  return {
    semiMajor: Math.max(maxMajor * 0.98, 1.0),
    semiMinor: Math.max(maxMinor * 0.98, 0.6),
  };
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
    const items: { cityName: string; centroid: [number, number]; status: string }[] = [];
    const seen = new Set<string>();
    for (const alert of relevant) {
      if (seen.has(alert.city_name_he)) continue;
      seen.add(alert.city_name_he);

      const poly = polygons[alert.city_name_he];
      if (!poly?.polygon || poly.polygon.length < 3) continue;
      items.push({
        cityName: alert.city_name_he,
        centroid: centroid(poly.polygon),
        status: alert.status,
      });
    }

    if (items.length < MIN_CITIES_FOR_ELLIPSE) return [];

    // Cluster by proximity
    const clusters = clusterCentroids(items);
    const results: ImpactEllipse[] = [];

    for (const cluster of clusters) {
      if (cluster.length < MIN_CITIES_FOR_ELLIPSE) continue;

      // Collect boundary points for extent calculation
      const allPoints: [number, number][] = [];
      for (const item of cluster) {
        const poly = polygons[item.cityName];
        if (poly?.polygon) allPoints.push(...poly.polygon);
      }

      if (allPoints.length < 3) continue;

      // Center = mean of city centroids (equal weight per city, not per polygon vertex)
      const center_ = centroid(cluster.map(item => item.centroid));
      // Angle = PCA of city centroids (reflects how cities are arranged, not polygon shapes)
      const angleDeg = pcaAngle(cluster.map(item => item.centroid));
      // Extents = max boundary-point projections onto those axes
      const { semiMajor, semiMinor } = extentsAlongAngle(allPoints, center_, angleDeg);
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
