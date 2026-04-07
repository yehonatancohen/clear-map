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
  /** Optional mirrored points in the sea */
  mirroredPoints?: [number, number][];
  /** Optional mirrored polygons in the sea */
  mirroredPolygons?: [number, number][][];
  /** Parabola outline ring */
  parabolaRing?: [number, number][];
  /** Parabola heading data */
  parabolaHeading?: {
    origin: [number, number];
    destination: [number, number];
    angle: number;
  };
  /** Convex hull of the original land alert polygons */
  landHull?: [number, number][];
  /** Filtered segments of the land hull that are NOT along the coastline */
  landOutlineSegments?: [number, number][][];
}

const MIN_CITIES_FOR_ELLIPSE = 3;
const ELLIPSE_POINTS = 64;
/**
 * Cluster distance scales with latitude: denser in the north, sparser in the south.
 * Tightened to separate distinct metropolitan barrages (e.g., Tel Aviv vs. Netanya).
 */
function clusterDistanceKm(lat: number): number {
  const t = Math.max(0, Math.min(1, (33.0 - lat) / 3.0));
  return 15 + t * 15; // 15km in North (dense), 30km in South (sparse)
}
/** Inner hit-area ellipse is this fraction of the outer ellipse */
const HIT_AREA_SCALE = 0.25;
/** Fine-tune the ellipse rotation (degrees). Positive = clockwise. */
const ELLIPSE_ROTATION_OFFSET_DEG = 0;

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function toDeg(rad: number) { return (rad * 180) / Math.PI; }

/**
 * Convex Hull (Monotone Chain algorithm).
 * Returns the boundary points of the hull in clockwise/counter-clockwise order.
 */
function getConvexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);

  const crossProduct = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);

  const upper = [];
  for (const p of sorted) {
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const lower = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  upper.pop();
  lower.pop();
  return upper.concat(lower);
}

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

/** Approximate polygon radius: max distance from centroid to any boundary vertex (km). */
function polygonRadius(poly: [number, number][], cent: [number, number]): number {
  let max = 0;
  for (const p of poly) {
    const d = haversineKm(cent, p);
    if (d > max) max = d;
  }
  return max;
}

/** Maximum time gap between alerts to be considered part of the same barrage (ms). */
const MAX_BARRAGE_TIME_GAP_MS = 3 * 60 * 1000; // 3 minutes

function clusterCentroids(
  items: { cityName: string; centroid: [number, number]; status: string; radius: number; timestamp: number }[],
): { cityName: string; centroid: [number, number]; status: string; radius: number; timestamp: number }[][] {
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

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].status !== items[j].status) continue;

      const timeDist = Math.abs(items[i].timestamp - items[j].timestamp);
      if (timeDist > MAX_BARRAGE_TIME_GAP_MS) continue;

      const avgLat = (items[i].centroid[0] + items[j].centroid[0]) / 2;
      const dy = (items[i].centroid[0] - items[j].centroid[0]) * 111.32;
      const dx = (items[i].centroid[1] - items[j].centroid[1]) * 111.32 * Math.cos(toRad(avgLat));

      const thresholdWE = clusterDistanceKm(avgLat);
      const thresholdNS = thresholdWE * 0.65;

      const normDistSq = (dy / thresholdNS) ** 2 + (dx / thresholdWE) ** 2;
      if (normDistSq <= 1.0) {
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

function pcaAnglePoints(points: [number, number][]): number {
  const c = centroid(points);
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [lat, lng] of points) {
    const dy = (lat - c[0]) * 111.32;
    const dx = (lng - c[1]) * 111.32 * Math.cos(toRad(c[0]));
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  const n = points.length;
  cxx /= n; cxy /= n; cyy /= n;

  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;

  if (Math.abs(cxy) < 1e-10) return cxx >= cyy ? 90 : 0;
  return toDeg(Math.atan2(cxy, lambda1 - cyy)) - 90;
}

function extentsAlongAnglePoints(
  points: [number, number][],
  center_: [number, number],
  angleDeg: number,
): { semiMajor: number; semiMinor: number } {
  const rotRad = toRad(angleDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  let maxMajor = 0, maxMinor = 0;

  for (const [lat, lng] of points) {
    const dy = (lat - center_[0]) * 111.32;
    const dx = (lng - center_[1]) * 111.32 * Math.cos(toRad(center_[0]));
    const pMajor = -dx * sinR + dy * cosR;
    const pMinor = dx * cosR + dy * sinR;

    if (Math.abs(pMajor) > maxMajor) maxMajor = Math.abs(pMajor);
    if (Math.abs(pMinor) > maxMinor) maxMinor = Math.abs(pMinor);
  }

  return {
    semiMajor: Math.max(maxMajor, 1.0),
    semiMinor: Math.max(maxMinor, 1.0),
  };
}

function simplifyByAngle(pts: [number, number][], minAngleDeg: number): [number, number][] {
  let result = [...pts];
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    const next: [number, number][] = [];
    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length];
      const curr = result[i];
      const nx = result[(i + 1) % result.length];
      const cosLat = Math.cos((curr[0] * Math.PI) / 180);
      const ax = (curr[1] - prev[1]) * 111.32 * cosLat, ay = (curr[0] - prev[0]) * 111.32;
      const bx = (nx[1] - curr[1]) * 111.32 * cosLat, by = (nx[0] - curr[0]) * 111.32;
      const lenA = Math.sqrt(ax * ax + ay * ay), lenB = Math.sqrt(bx * bx + by * by);
      if (lenA < 0.001 || lenB < 0.001) { next.push(curr); continue; }
      const angleDeg = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (lenA * lenB)))) * 180 / Math.PI;
      if (angleDeg >= minAngleDeg) next.push(curr); else changed = true;
    }
    if (next.length >= 3) result = next; else break;
  }
  return result;
}

function generateSeaMirrorPoints(
  points: [number, number][],
  center: [number, number]
): [number, number][] {
  return points.map(([lat, lng]) => [
    2 * center[0] - lat,
    2 * center[1] - lng,
  ] as [number, number]);
}

// Israel Mediterranean coastline waypoints (lat, lon), Rosh HaNikra → Rafah
export const COASTLINE_WAYPOINTS: [number, number][] = [
  [33.09, 35.10], // Rosh HaNikra
  [32.93, 35.07], // Akko
  [32.83, 34.99], // Haifa
  [32.62, 34.91], // Dor/Atlit
  [32.35, 34.86], // Netanya
  [32.17, 34.80], // Herzliya
  [32.08, 34.77], // Tel Aviv
  [32.00, 34.75], // Jaffa / Bat Yam
  [31.80, 34.64], // Ashdod
  [31.67, 34.57], // Ashkelon
  [31.35, 34.35], // Northern Gaza coast
  [31.27, 34.22], // Rafah
];

/** Interpolate coastline longitude at a given latitude. */
function coastlineLngAtLat(lat: number): number {
  for (let i = 0; i < COASTLINE_WAYPOINTS.length - 1; i++) {
    const [lat1, lng1] = COASTLINE_WAYPOINTS[i];
    const [lat2, lng2] = COASTLINE_WAYPOINTS[i + 1];
    const minLat = Math.min(lat1, lat2);
    const maxLat = Math.max(lat1, lat2);
    if (lat >= minLat && lat <= maxLat) {
      const t = (lat - lat1) / (lat2 - lat1);
      return lng1 + t * (lng2 - lng1);
    }
  }
  // Clamp to nearest endpoint
  if (lat >= COASTLINE_WAYPOINTS[0][0]) return COASTLINE_WAYPOINTS[0][1];
  return COASTLINE_WAYPOINTS[COASTLINE_WAYPOINTS.length - 1][1];
}

/**
 * Find the nearest segment index, distance, and the actual point on the coastline polyline to a given point.
 */
function nearestCoastlineSegment(p: [number, number]): { dist: number; segIdx: number; point: [number, number] } {
  const cosLat = Math.cos(toRad(p[0]));
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestPoint: [number, number] = p;

  for (let i = 0; i < COASTLINE_WAYPOINTS.length - 1; i++) {
    const a = COASTLINE_WAYPOINTS[i];
    const b = COASTLINE_WAYPOINTS[i + 1];

    const px = (p[1] - a[1]) * 111.32 * cosLat;
    const py = (p[0] - a[0]) * 111.32;
    const dx = (b[1] - a[1]) * 111.32 * cosLat;
    const dy = (b[0] - a[0]) * 111.32;

    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 1e-12 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq)) : 0;

    const nearX = t * dx;
    const nearY = t * dy;
    const dist = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);

    if (dist < bestDist) {
      bestDist = dist;
      bestSeg = i;
      bestPoint = [a[0] + nearY / 111.32, a[1] + nearX / (111.32 * cosLat)];
    }
  }

  return { dist: bestDist, segIdx: bestSeg, point: bestPoint };
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

  const isLebanonLat = center[0] > 32.9;
  const isSouthOfRishon = center[0] < 32.0;
  const isCoastal = center[1] < 34.85;

  function isWest(b: number) { return b >= 240 && b <= 300; }
  let bearingDeg = bearing1;

  if (isLebanonLat) {
    const diff1 = Math.min(Math.abs(bearing1), Math.abs(bearing1 - 360));
    const diff2 = Math.min(Math.abs(bearing2), Math.abs(bearing2 - 360));
    bearingDeg = diff1 <= diff2 ? bearing1 : bearing2;
  } else if (isSouthOfRishon) {
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

  if (bearingDeg >= 315 || bearingDeg <= 45 || (isLebanonLat && (bearingDeg >= 300 || bearingDeg <= 60))) {
    source = "לבנון";
    const distToBorderKm = Math.max(0, (33.1 - center[0]) * 111.32);
    distanceKm = distToBorderKm + 20 + stretch * 15;
  } else if (isWest(bearingDeg)) {
    source = "הים התיכון (שיגור ימי)";
    distanceKm = 30 + stretch * 20;
  } else if (bearingDeg > 45 && bearingDeg < 135) {
    source = stretch > 3 ? "איראן" : "עיראק/סוריה";
    distanceKm = 1000 + stretch * 150;
  } else if (bearingDeg >= 135 && bearingDeg <= 210) {
    source = "תימן";
    distanceKm = 1800 + stretch * 50;
  } else {
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

    const relevant = alerts.filter(a => a.status === "alert");
    if (relevant.length < MIN_CITIES_FOR_ELLIPSE) return [];

    const items: { cityName: string; centroid: [number, number]; status: string; radius: number; timestamp: number }[] = [];
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
        timestamp: alert.timestamp,
      });
    }

    if (items.length < MIN_CITIES_FOR_ELLIPSE) return [];

    const clusters = clusterCentroids(items);
    const results: ImpactEllipse[] = [];

    for (const cluster of clusters) {
      if (cluster.length < MIN_CITIES_FOR_ELLIPSE) continue;

      // STEP 1: Convex hull of all land alert polygon vertices
      const allLandVertices: [number, number][] = [];
      for (const item of cluster) {
        const poly = polygons[item.cityName]?.polygon || [];
        for (const pt of poly) allLandVertices.push(pt);
      }
      const landHull = getConvexHull(allLandVertices);
      const landCentroid = centroid(landHull);

      // STEP 2: PCA angle of land hull
      const hullAngleDeg = pcaAnglePoints(landHull);

      // STEP 3: Bounding box center along initial bearing
      const { bearingDeg: initialBearingDeg } = estimateOrigin(landCentroid, hullAngleDeg, 5, 5);
      const rotRad = toRad(initialBearingDeg);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (const pt of landHull) {
        const dy = (pt[0] - landCentroid[0]) * 111.32;
        const dx = (pt[1] - landCentroid[1]) * 111.32 * Math.cos(toRad(landCentroid[0]));
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
      }

      const xv = (minX + maxX) / 2;
      const yv = (minY + maxY) / 2;
      const [cLatOff, cLngOff] = kmToLatLng(xv * sinR + yv * cosR, xv * cosR - yv * sinR, landCentroid[0]);
      const center_: [number, number] = [landCentroid[0] + cLatOff, landCentroid[1] + cLngOff];

      const hasCoastalCity = cluster.some(item => nearestCoastlineSegment(item.centroid).dist < 12);
      const barrageDepthKm = maxY - minY;
      const isCoastalDeepBarrage = hasCoastalCity && barrageDepthKm > 14;

      let attackBearingDeg = hullAngleDeg;
      let finalCenter = landCentroid;
      let finalMirrors: [number, number][] = [];
      let allPoints: [number, number][] = [...landHull];
      let landOutlineSegments: [number, number][][] = [];

      if (isCoastalDeepBarrage) {
        const coastPivot: [number, number] = [landCentroid[0], coastlineLngAtLat(landCentroid[0])];
        const seaMirrors = generateSeaMirrorPoints(landHull, coastPivot);

        // Find edge most parallel to coastline on specified side (west for land, east for mirror)
        const coastlineEdge = (hull: [number, number][], westSide: boolean): [[number, number], [number, number]] => {
          const simplified = simplifyByAngle(hull, 20);
          const cFirst = COASTLINE_WAYPOINTS[0], cLast = COASTLINE_WAYPOINTS[COASTLINE_WAYPOINTS.length - 1];
          const cosLat = Math.cos((cFirst[0] * Math.PI) / 180);
          const cdx = (cLast[1] - cFirst[1]) * cosLat, cdy = cLast[0] - cFirst[0];
          const cLen = Math.sqrt(cdx * cdx + cdy * cdy);
          const centLng = simplified.reduce((s, p) => s + p[1], 0) / simplified.length;
          let bestI = 0, bestParallel = -Infinity;
          for (let i = 0; i < simplified.length; i++) {
            const next = simplified[(i + 1) % simplified.length];
            const midLng = (simplified[i][1] + next[1]) / 2;
            if (westSide ? midLng > centLng : midLng < centLng) continue;
            const edx = (next[1] - simplified[i][1]) * cosLat, edy = next[0] - simplified[i][0];
            const eLen = Math.sqrt(edx * edx + edy * edy);
            if (eLen < 0.001) continue;
            const parallel = Math.abs((cdx * edx + cdy * edy) / (cLen * eLen));
            if (parallel > bestParallel) { bestParallel = parallel; bestI = i; }
          }
          const a = simplified[bestI], b = simplified[(bestI + 1) % simplified.length];
          return a[0] >= b[0] ? [a, b] : [b, a];
        };

        const [landP1] = coastlineEdge(landHull, true);
        const [mirrorP1] = coastlineEdge(seaMirrors, false);
        const latShift = landP1[0] - mirrorP1[0];
        const lngShift = landP1[1] - mirrorP1[1];
        finalMirrors = seaMirrors.map(([lat, lng]) => [lat + latShift, lng + lngShift] as [number, number]);

        allPoints = [...landHull, ...finalMirrors];
        finalCenter = centroid(allPoints);
        attackBearingDeg = pcaAnglePoints(allPoints);

        const hullCentroid = centroid(landHull);
        const nHull = landHull.length;
        for (let i = 0; i < nHull; i++) {
          const p1 = landHull[i];
          const p2 = landHull[(i + 1) % nHull];
          const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
          const { dist: distMid } = nearestCoastlineSegment(mid);
          const isWestOfCentroid = mid[1] < hullCentroid[1] + 0.02;
          if (isWestOfCentroid && distMid < 5.0) continue;
          landOutlineSegments.push([p1, p2]);
        }
      }

      // Find the minimum bounding-box area angle over 0–180°
      {
        let bestAngle = attackBearingDeg;
        let bestArea = Infinity;
        for (let a = 0; a < 180; a += 1) {
          const e = extentsAlongAnglePoints(allPoints, finalCenter, a);
          const area = e.semiMajor * e.semiMinor;
          if (area < bestArea) { bestArea = area; bestAngle = a; }
        }
        attackBearingDeg = bestAngle;
      }
      attackBearingDeg += ELLIPSE_ROTATION_OFFSET_DEG;

      const { semiMajor, semiMinor } = extentsAlongAnglePoints(allPoints, finalCenter, attackBearingDeg);
      const ellipseRing = generateEllipseRing(finalCenter, semiMajor, semiMinor, attackBearingDeg);
      const hitAreaRing = generateEllipseRing(finalCenter, semiMajor * HIT_AREA_SCALE, semiMinor * HIT_AREA_SCALE, attackBearingDeg);

      const { source: launchSource } = estimateOrigin(landCentroid, attackBearingDeg, semiMajor, semiMinor);
      const arrowLength = Math.max(barrageDepthKm * 0.6, 10);

      let arrowAngleDeg = attackBearingDeg;
      if (finalMirrors.length > 0) {
        const { segIdx } = nearestCoastlineSegment(landCentroid);
        const cA = COASTLINE_WAYPOINTS[segIdx];
        const cB = COASTLINE_WAYPOINTS[segIdx + 1];
        const cpN = (cB[0] - cA[0]);
        const cpE = (cB[1] - cA[1]) * Math.cos(toRad(cA[0]));
        const seaN = -cpE, seaE = cpN;
        const sign = seaE < 0 ? 1 : -1;
        arrowAngleDeg = toDeg(Math.atan2(sign * seaN, sign * seaE)) - 90;
      }

      const [hLat, hLng] = kmToLatLng(
        arrowLength * Math.cos(toRad(arrowAngleDeg)),
        arrowLength * Math.sin(toRad(arrowAngleDeg)),
        finalCenter[0]
      );

      results.push({
        id: `ellipse_${cluster[0].status}_${cluster.map(c => c.cityName).join("_").slice(0, 30)}`,
        center: finalCenter,
        ellipseRing,
        hitAreaRing,
        majorAxisAngleDeg: attackBearingDeg,
        launchBearingDeg: attackBearingDeg,
        launchDistanceKm: 100,
        launchSource,
        semiMajorKm: semiMajor,
        semiMinorKm: semiMinor,
        status: cluster[0].status,
        mirroredPoints: finalMirrors,
        parabolaRing: [],
        parabolaHeading: {
          origin: finalCenter,
          destination: [finalCenter[0] + hLat, finalCenter[1] + hLng] as [number, number],
          angle: attackBearingDeg
        },
        landHull,
        landOutlineSegments: isCoastalDeepBarrage ? landOutlineSegments : [],
      });
    }

    return results;
  }, [alerts, polygons]);
}
