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
  /** Semi-major axis length in km */
  semiMajorKm: number;
  /** Semi-minor axis length in km */
  semiMinorKm: number;
  /** Alert status color key */
  status: string;
}

const MIN_CITIES_FOR_ELLIPSE = 3;
const ELLIPSE_POINTS = 64;
const PADDING_FACTOR = 1.05;
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
    angleDeg = toDeg(angleRad);
  }

  const semiMajor = Math.sqrt(lambda1) * PADDING_FACTOR;
  const semiMinor = Math.sqrt(lambda2) * PADDING_FACTOR;

  return {
    angleDeg,
    semiMajor: Math.max(semiMajor, 1),
    semiMinor: Math.max(semiMinor, 0.5),
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
 * Pick the major axis direction that is NOT pointing west.
 * Attacks come from land (north, east, south) — never from the
 * Mediterranean Sea (west, roughly 240°-300°).
 */
function computeLaunchBearing(_center: [number, number], majorAxisAngleDeg: number): number {
  const bearing1 = ((majorAxisAngleDeg % 360) + 360) % 360;
  const bearing2 = (bearing1 + 180) % 360;

  // "West" zone: bearings roughly 240°–300° (the Mediterranean side)
  function isWest(b: number) { return b >= 240 && b <= 300; }

  // Prefer the bearing that is NOT pointing west
  if (isWest(bearing1) && !isWest(bearing2)) return bearing2;
  if (isWest(bearing2) && !isWest(bearing1)) return bearing1;

  // If both or neither are west, pick the one further from 270° (due west)
  const diff1 = Math.abs(((bearing1 - 270 + 540) % 360) - 180);
  const diff2 = Math.abs(((bearing2 - 270 + 540) % 360) - 180);
  return diff1 >= diff2 ? bearing1 : bearing2;
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

    // Only compute for attack-related statuses
    const relevant = alerts.filter(a =>
      ["alert", "pre_alert", "terrorist"].includes(a.status)
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

      const centroids = cluster.map(c => c.centroid);
      const center_ = centroid(centroids);
      const { angleDeg, semiMajor, semiMinor } = pca2d(centroids);
      const ellipseRing = generateEllipseRing(center_, semiMajor, semiMinor, angleDeg);
      const launchBearingDeg = computeLaunchBearing(center_, angleDeg);

      results.push({
        id: `ellipse_${cluster[0].status}_${cluster.map(c => c.cityName).join("_").slice(0, 30)}`,
        center: center_,
        ellipseRing,
        majorAxisAngleDeg: angleDeg,
        launchBearingDeg,
        semiMajorKm: semiMajor,
        semiMinorKm: semiMinor,
        status: cluster[0].status,
      });
    }

    return results;
  }, [alerts, polygons]);
}
