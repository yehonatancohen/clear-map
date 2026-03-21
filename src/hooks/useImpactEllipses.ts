import { useMemo } from "react";
import { ActiveAlert } from "@/types";
import { PolygonLookup } from "./usePolygons";

export interface ImpactEllipse {
  id: string;
  /** Estimated hit center [lat, lng] */
  center: [number, number];
  /** Ring of [lat, lng] points forming the ellipse */
  ellipseRing: [number, number][];
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
const PADDING_FACTOR = 1.0;
/** Max distance (km) between two city centroids to be considered "touching" */
const CLUSTER_DISTANCE_KM = 15;
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

  // Unite nearby cities with the same status
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].status !== items[j].status) continue;
      if (haversineKm(items[i].centroid, items[j].centroid) <= CLUSTER_DISTANCE_KM) {
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
 * 2D PCA on [lat, lng] points (in local km coordinates).
 */
function pca2d(points: [number, number][]): { angleDeg: number; semiMajor: number; semiMinor: number } {
  const center_ = centroid(points);

  const local: [number, number][] = points.map(([lat, lng]) => {
    const dy = (lat - center_[0]) * 111.32;
    const dx = (lng - center_[1]) * 111.32 * Math.cos(toRad(center_[0]));
    return [dx, dy];
  });

  let cxx = 0, cxy = 0, cyy = 0;
  for (const [x, y] of local) {
    cxx += x * x;
    cxy += x * y;
    cyy += y * y;
  }
  const n = local.length;
  cxx /= n; cxy /= n; cyy /= n;

  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;
  const lambda2 = Math.max(0.001, trace / 2 - disc);

  let angleDeg: number;
  if (Math.abs(cxy) < 1e-10) {
    angleDeg = cxx >= cyy ? 90 : 0;
  } else {
    const angleRad = Math.atan2(cxy, lambda1 - cyy);
    angleDeg = toDeg(angleRad) - 90;
  }

  // To make it "very very close to the edge", we calculate the max projection of points
  // onto the major and minor axes rather than just using standard deviation.
  const rotRad = toRad(angleDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  let maxMajor = 0;
  let maxMinor = 0;

  for (const [dx, dy] of local) {
    // Project local km onto the rotated axes
    // rotation=0 means major is North (Y).
    const pMajor = Math.abs(dx * sinR + dy * cosR);
    const pMinor = Math.abs(dx * cosR - dy * sinR);
    if (pMajor > maxMajor) maxMajor = pMajor;
    if (pMinor > maxMinor) maxMinor = pMinor;
  }

  return {
    angleDeg,
    semiMajor: Math.max(maxMajor * 0.98, 1.0), // Tight fit, slightly under 1.0 to ensure it's not "bigger" than alert area
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
  } else {
    // If it's coastal, we are more lenient with West (sea) origins if the ellipse is stretched that way
        // Pick the one that points slightly more towards typical threat origins if both are sea/land mix
        // But generally allow the math to pick the better fit.
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
    // Vast distances for Eastern vectors
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
 * Clusters nearby alerts spatially using union-find, then computes
 * ellipses for clusters with ≥ MIN_CITIES_FOR_ELLIPSE cities.
 */
export function useImpactEllipses(
  alerts: ActiveAlert[],
  polygons: PolygonLookup | null,
): ImpactEllipse[] {
  return useMemo(() => {
    if (!polygons || alerts.length === 0) return [];

    // Only compute for actual alerts (e.g. rockets), skip pre_alerts
    const relevant = alerts.filter(a =>
      a.status === "alert"
    );
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

      // Collect ALL points from ALL city polygons in the cluster to find the true spatial bounds
      const allPoints: [number, number][] = [];
      for (const item of cluster) {
        const poly = polygons[item.cityName];
        if (poly?.polygon) allPoints.push(...poly.polygon);
      }
      
      if (allPoints.length < 3) continue;

      const center_ = centroid(allPoints);
      const { angleDeg, semiMajor, semiMinor } = pca2d(allPoints);
      const ellipseRing = generateEllipseRing(center_, semiMajor, semiMinor, angleDeg);
      const { bearingDeg: launchBearingDeg, distanceKm: launchDistanceKm, source: launchSource } = estimateOrigin(
        center_, angleDeg, semiMajor, semiMinor
      );

      results.push({
        id: `ellipse_${cluster[0].status}_${cluster.map(c => c.cityName).join("_").slice(0, 30)}`,
        center: center_,
        ellipseRing,
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
