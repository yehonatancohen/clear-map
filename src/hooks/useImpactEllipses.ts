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
// Israel approximate center for launch direction heuristic
const ISRAEL_CENTER_LAT = 31.5;
const ISRAEL_CENTER_LNG = 34.8;

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function toDeg(rad: number) { return (rad * 180) / Math.PI; }

/**
 * Convex Hull (Monotone Chain algorithm).
 * Returns the boundary points of the hull in clockwise/counter-clockwise order.
 */
function getConvexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  // Sort by lat, then lng
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

  // Unite cities whose centroids are within the cluster threshold AND occurred within the time gap.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].status !== items[j].status) continue;

      // Time check (Barrage window)
      const timeDist = Math.abs(items[i].timestamp - items[j].timestamp);
      if (timeDist > MAX_BARRAGE_TIME_GAP_MS) continue;

      // Space check (Anisotropic Barrage radius)
      // We are stricter about North-South separation to avoid mixing distinct regional barrages.
      const avgLat = (items[i].centroid[0] + items[j].centroid[0]) / 2;
      const dy = (items[i].centroid[0] - items[j].centroid[0]) * 111.32;
      const dx = (items[i].centroid[1] - items[j].centroid[1]) * 111.32 * Math.cos(toRad(avgLat));

      const thresholdWE = clusterDistanceKm(avgLat);
      const thresholdNS = thresholdWE * 0.65; // Stricter N-S threshold (approx 10-20km)

      // Use elliptical distance formula: (dy/thresholdNS)^2 + (dx/thresholdWE)^2 <= 1.0
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

/** How close an individual city must be to be considered "coastal" (km). */
const CITY_COAST_THRESHOLD_KM = 6;
/** Minimum number of coastal cities in a cluster to trigger mirroring. */
const MIN_COASTAL_CITIES_FOR_MIRROR = 3;

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
        timestamp: alert.timestamp,
      });
    }

    if (items.length < MIN_CITIES_FOR_ELLIPSE) return [];

    // Cluster by proximity
    const clusters = clusterCentroids(items);
    const results: ImpactEllipse[] = [];

    for (const cluster of clusters) {
      if (cluster.length < MIN_CITIES_FOR_ELLIPSE) continue;

      // --- PIPELINE STEP 1: EXTRACT & HULL ---
      // Get all vertices of the land alert polygons
      let allLandVertices: [number, number][] = [];
      for (const item of cluster) {
        const poly = polygons[item.cityName]?.polygon || [];
        for (const pt of poly) {
          allLandVertices.push(pt);
        }
      }
      // Calculate the Convex Hull of the land alert polygons
      const landHull = getConvexHull(allLandVertices);
      const landCentroid = centroid(landHull);

      // --- PIPELINE STEP 2: FIND TRAJECTORY (MAJOR AXIS) ---
      // Run PCA on the hull points to find the exact angle of attack.
      const hullAngleDeg = pcaAnglePoints(landHull);

      // Use estimateOrigin heuristic to get an initial trajectory bearing
      const { bearingDeg: initialBearingDeg } = estimateOrigin(
        landCentroid, hullAngleDeg, 5, 5
      );

      // --- PIPELINE STEP 3: FIND THE CENTER ---
      // Rotate the hull points so the major axis (attack angle) is perfectly horizontal.
      const rotRad = toRad(initialBearingDeg);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      const rotatedHull: [number, number][] = [];

      for (const pt of landHull) {
        const dy = (pt[0] - landCentroid[0]) * 111.32;
        const dx = (pt[1] - landCentroid[1]) * 111.32 * Math.cos(toRad(landCentroid[0]));
        // Rotate so launchBearing is the +Y axis (forward)
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;
        rotatedHull.push([rx, ry]);
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
      }

      // Your center is exactly in the middle along the trajectory axis
      const xv = (minX + maxX) / 2;
      const yv = (minY + maxY) / 2;

      const [cLatOff, cLngOff] = kmToLatLng(
        xv * sinR + yv * cosR, // back to dy
        xv * cosR - yv * sinR, // back to dx
        landCentroid[0]
      );
      const center_: [number, number] = [landCentroid[0] + cLatOff, landCentroid[1] + cLngOff];

      const hasCoastalCity = cluster.some(item => nearestCoastlineSegment(item.centroid).dist < 12);
      const barrageDepthKm = maxY - minY;
      const isCoastalDeepBarrage = hasCoastalCity && barrageDepthKm > 14;

      let attackBearingDeg = hullAngleDeg;
      let finalCenter = center_; // <-- Use the calculated bounding-box center
      let finalMirrors: [number, number][] = []; let allPoints: [number, number][] = [...landHull];
      let landOutlineSegments: [number, number][][] = [];

      if (isCoastalDeepBarrage) {
        // --- MIRROR: reflect land hull through the coastline edge of the hull ---
        const coastalHullPoints = landHull.filter(p => nearestCoastlineSegment(p).dist < 8);
        const coastPivot = coastalHullPoints.length > 0
          ? centroid(coastalHullPoints)
          : nearestCoastlineSegment(landCentroid).point;
        const seaMirrors = generateSeaMirrorPoints(landHull, coastPivot);

        finalMirrors = seaMirrors;
        // Center = coastPivot: allPoints is symmetric about it, so extents are equal land/sea.
        finalCenter = coastPivot;
        allPoints = [...landHull, ...seaMirrors];
        // Only use the real land impacts to determine the trajectory angle
        attackBearingDeg = pcaAnglePoints(landHull);

        // --- OUTLINE: hull edges that are NOT along the coastline ---
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

      // 6. FINAL GEOMETRY: find the angle that produces the minimum bounding-box area
      // over the full 0–180° range (ellipses are symmetric, so 180° covers all orientations).
      // 1° steps give sub-degree precision without being expensive.
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
      // 1. Measure extents using the pure, un-offset geographic angle
      let { semiMajor, semiMinor } = extentsAlongAnglePoints(allPoints, finalCenter, attackBearingDeg);

      // 2. Lock orientation: Force semiMajor to always be the longest axis
      if (semiMinor > semiMajor) {
        const temp = semiMajor;
        semiMajor = semiMinor;
        semiMinor = temp;
        attackBearingDeg = (attackBearingDeg + 90) % 360;
      }

      // 3. Add visual map offset ONLY for the drawing functions
      const drawingAngleDeg = attackBearingDeg + ELLIPSE_ROTATION_OFFSET_DEG;

      const ellipseRing = generateEllipseRing(finalCenter, semiMajor, semiMinor, drawingAngleDeg);
      const hitAreaRing = generateEllipseRing(finalCenter, semiMajor * HIT_AREA_SCALE, semiMinor * HIT_AREA_SCALE, drawingAngleDeg);
      // Prevent 90-degree flips: ensure semiMajor is always the longest axis
      let finalSemiMajor = semiMajor;
      let finalSemiMinor = semiMinor;
      let finalAngleDeg = attackBearingDeg;

      if (semiMinor > semiMajor) {
        finalSemiMajor = semiMinor;
        finalSemiMinor = semiMajor;
        finalAngleDeg = (attackBearingDeg + 90) % 360;
      }

      const { source: launchSource } = estimateOrigin(landCentroid, attackBearingDeg, semiMajor, semiMinor);
      const arrowLength = Math.max(barrageDepthKm * 0.6, 10);

      // Arrow points from land toward sea: use the coast-perpendicular direction.
      // The coastline segment direction gives us the coast-parallel vector; rotate 90° toward the sea (west).
      let arrowAngleDeg = attackBearingDeg;
      if (finalMirrors.length > 0) {
        const { segIdx } = nearestCoastlineSegment(landCentroid);
        const cA = COASTLINE_WAYPOINTS[segIdx];
        const cB = COASTLINE_WAYPOINTS[segIdx + 1];
        // Coast-parallel vector (north, east)
        const cpN = (cB[0] - cA[0]);
        const cpE = (cB[1] - cA[1]) * Math.cos(toRad(cA[0]));
        // Rotate 90° CCW to get coast-perpendicular pointing west (toward sea)
        // perpendicular = (-cpE, cpN) in (north, east) → points west for a N→S coastline
        const seaN = -cpE, seaE = cpN;
        // Ensure it points west (seaE < 0 for Israel's west coast)
        const sign = seaE < 0 ? 1 : -1;
        // pcaAngle convention: atan2(north, east) - 90
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
        majorAxisAngleDeg: finalAngleDeg,
        launchBearingDeg: attackBearingDeg,
        launchDistanceKm: 100,
        launchSource,
        semiMajorKm: finalSemiMajor,
        semiMinorKm: finalSemiMinor,
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
