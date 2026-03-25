import { useMemo } from "react";
import { ActiveAlert } from "@/types";
import { PolygonLookup } from "./usePolygons";

/* ── Confidence ellipse types ─────────────────────────────────────────────── */

export interface ConfidenceEllipse {
  confidence: number;
  semiMajorKm: number;
  semiMinorKm: number;
}

export interface ImpactEllipse {
  id: string;
  /** Estimated hit center [lat, lng] */
  center: [number, number];
  /** Ring of [lat, lng] points forming the outer (alert zone) ellipse */
  ellipseRing: [number, number][];
  /** Ring of [lat, lng] points forming the inner (impact zone) ellipse */
  hitAreaRing: [number, number][];
  /** Rotation angle of major axis in degrees (0 = north, clockwise) */
  majorAxisAngleDeg: number;
  /** Bearing toward estimated launch origin (degrees, 0 = north, clockwise) */
  launchBearingDeg: number;
  /** Estimated distance from the center to the origin (km) */
  launchDistanceKm: number;
  /** Name of the estimated source (e.g. Lebanon, Iran) */
  launchSource: string;
  /** Raw 1σ semi-major axis in km (≈39.3% confidence for 2D) */
  sigmaMajorKm: number;
  /** Raw 1σ semi-minor axis in km */
  sigmaMinorKm: number;
  /** Outer ellipse (alert zone coverage) */
  outer: ConfidenceEllipse;
  /** Inner ellipse (estimated impact zone) */
  inner: ConfidenceEllipse;
  /** Alert status color key */
  status: string;
}

/* ── Constants ────────────────────────────────────────────────────────────── */

const MIN_CITIES_FOR_ELLIPSE = 3;
const ELLIPSE_POINTS = 64;
/** Max distance (km) between two city centroids to be considered "touching" */
const CLUSTER_DISTANCE_KM = 15;
const MIN_AXIS_RATIO = 1.5;
const OUTER_CONFIDENCE = 0.95;
const INNER_CONFIDENCE = 0.50;
const OUTER_PADDING = 1.05; // 5% padding to cover polygon edges

// Israel approximate center for launch direction heuristic
const ISRAEL_CENTER_LAT = 31.5;
const ISRAEL_CENTER_LNG = 34.8;

/* ── Chi-squared confidence scaling ───────────────────────────────────────── */

function chi2Scale(confidence: number): number {
  return Math.sqrt(-2.0 * Math.log(1.0 - confidence));
}

/* ── Geometry helpers ─────────────────────────────────────────────────────── */

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

/** Smallest angular difference between two bearings (0–180). */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Estimate the "radius" of a city polygon as average distance from centroid to boundary. */
function estimatePolygonRadiusKm(polygon: [number, number][]): number {
  const c = centroid(polygon);
  let totalDist = 0;
  for (const pt of polygon) {
    totalDist += haversineKm(c, pt);
  }
  return Math.max(totalDist / polygon.length, 0.5);
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

/* ── Weighted projection data ─────────────────────────────────────────────── */

interface CityData {
  cityName: string;
  centroid: [number, number];
  radiusKm: number;
  polygon: [number, number][];
}

interface WeightedPoint {
  dx: number; // East km offset from center
  dy: number; // North km offset from center
  w: number;  // inverse-radius-squared weight
}

interface WeightedProjection {
  center: [number, number];
  points: WeightedPoint[];
  totalWeight: number;
}

/**
 * Compute weighted centroid and project all boundary points to local km coordinates.
 * Each boundary point is weighted by its parent city's inverse-radius-squared.
 */
function prepareWeightedProjection(cityData: CityData[]): WeightedProjection {
  // Weighted centroid using city centroids
  const cityWeights = cityData.map(c => {
    const r = Math.max(c.radiusKm, 0.5);
    return 1.0 / (r * r);
  });
  const totalCityWeight = cityWeights.reduce((a, b) => a + b, 0);

  const wCenterLat = cityData.reduce((sum, c, i) => sum + cityWeights[i] * c.centroid[0], 0) / totalCityWeight;
  const wCenterLng = cityData.reduce((sum, c, i) => sum + cityWeights[i] * c.centroid[1], 0) / totalCityWeight;

  // Project all boundary points with parent city weights
  const points: WeightedPoint[] = [];
  let totalWeight = 0;

  for (let ci = 0; ci < cityData.length; ci++) {
    const city = cityData[ci];
    const w = cityWeights[ci];
    for (const [lat, lng] of city.polygon) {
      const dy = (lat - wCenterLat) * 111.32;
      const dx = (lng - wCenterLng) * 111.32 * Math.cos(toRad(wCenterLat));
      points.push({ dx, dy, w });
      totalWeight += w;
    }
  }

  return { center: [wCenterLat, wCenterLng], points, totalWeight };
}

/* ── Free PCA (for initial angle estimation) ──────────────────────────────── */

interface FreePcaResult {
  angleDeg: number;
  sigmaMajor: number;
  sigmaMinor: number;
}

/**
 * Free (unconstrained) PCA on weighted points.
 * Returns the eigenvector angle and 1σ semi-axes.
 * Used as initial estimate to feed into estimateOrigin.
 */
function freePca(proj: WeightedProjection): FreePcaResult {
  const { points, totalWeight } = proj;

  // Weighted mean in projected space
  let wmx = 0, wmy = 0;
  for (const p of points) {
    wmx += (p.w / totalWeight) * p.dx;
    wmy += (p.w / totalWeight) * p.dy;
  }

  // Weighted covariance matrix
  let cxx = 0, cxy = 0, cyy = 0;
  for (const p of points) {
    const nw = p.w / totalWeight;
    const ddx = p.dx - wmx;
    const ddy = p.dy - wmy;
    cxx += nw * ddx * ddx;
    cxy += nw * ddx * ddy;
    cyy += nw * ddy * ddy;
  }

  // Bessel-like correction
  let sumNw2 = 0;
  for (const p of points) {
    const nw = p.w / totalWeight;
    sumNw2 += nw * nw;
  }
  const correction = 1.0 - sumNw2;
  if (correction > 1e-12) {
    cxx /= correction;
    cxy /= correction;
    cyy /= correction;
  }

  // Eigenvalues
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;
  const lambda2 = Math.max(0, trace / 2 - disc);

  const sigmaMajor = Math.sqrt(Math.max(lambda1, 0.001));
  const sigmaMinor = Math.sqrt(Math.max(lambda2, 0.001));

  // Eigenvector direction → angle from North
  let angleDeg: number;
  if (Math.abs(cxy) < 1e-10) {
    angleDeg = cxx >= cyy ? 90 : 0;
  } else {
    const angleRad = Math.atan2(cxy, lambda1 - cyy);
    angleDeg = toDeg(angleRad) - 90;
  }

  return { angleDeg, sigmaMajor, sigmaMinor };
}

/* ── Trajectory-locked sigma ──────────────────────────────────────────────── */

/**
 * Project weighted points onto trajectory-locked axes and compute weighted
 * variance along each. The major axis is locked to the launch bearing.
 *
 * Returns 1σ semi-axes where major is along the trajectory.
 * Enforces sigma_major >= sigma_minor (range error dominates physically).
 */
function trajectoryLockedSigma(
  proj: WeightedProjection,
  bearingDeg: number,
): { sigmaMajor: number; sigmaMinor: number } {
  const { points, totalWeight } = proj;
  const bRad = toRad(bearingDeg);

  // Trajectory axis unit vector: (east, north)
  const trajX = Math.sin(bRad);
  const trajY = Math.cos(bRad);

  // Perpendicular axis unit vector
  const perpX = Math.cos(bRad);
  const perpY = -Math.sin(bRad);

  // Project each point and compute weighted means
  let wmaj = 0, wmin = 0;
  const projMaj: number[] = [];
  const projMin: number[] = [];
  const normWeights: number[] = [];

  for (const p of points) {
    const nw = p.w / totalWeight;
    const pMaj = p.dx * trajX + p.dy * trajY;
    const pMin = p.dx * perpX + p.dy * perpY;
    projMaj.push(pMaj);
    projMin.push(pMin);
    normWeights.push(nw);
    wmaj += nw * pMaj;
    wmin += nw * pMin;
  }

  // Weighted variance along each axis
  let varMaj = 0, varMin = 0;
  for (let i = 0; i < points.length; i++) {
    varMaj += normWeights[i] * (projMaj[i] - wmaj) ** 2;
    varMin += normWeights[i] * (projMin[i] - wmin) ** 2;
  }

  // Bessel-like correction
  let sumNw2 = 0;
  for (const nw of normWeights) {
    sumNw2 += nw * nw;
  }
  const correction = 1.0 - sumNw2;
  if (correction > 1e-12) {
    varMaj /= correction;
    varMin /= correction;
  }

  let sigmaMajor = Math.sqrt(Math.max(varMaj, 0.001));
  let sigmaMinor = Math.sqrt(Math.max(varMin, 0.001));

  // Enforce sigma_major >= sigma_minor (range error always dominates)
  sigmaMajor = Math.max(sigmaMajor, sigmaMinor);

  return { sigmaMajor, sigmaMinor };
}

/* ── Max-extent along trajectory axes ─────────────────────────────────────── */

/**
 * Project all boundary points onto trajectory-locked axes and return
 * the furthest point distance along each axis.
 * This directly gives the outer ellipse semi-axes (before padding).
 */
function trajectoryLockedExtent(
  proj: WeightedProjection,
  bearingDeg: number,
): { extentMajor: number; extentMinor: number } {
  const bRad = toRad(bearingDeg);
  const trajX = Math.sin(bRad);
  const trajY = Math.cos(bRad);
  const perpX = Math.cos(bRad);
  const perpY = -Math.sin(bRad);

  let maxMaj = 0, maxMin = 0;

  for (const p of proj.points) {
    const pMaj = Math.abs(p.dx * trajX + p.dy * trajY);
    const pMin = Math.abs(p.dx * perpX + p.dy * perpY);
    if (pMaj > maxMaj) maxMaj = pMaj;
    if (pMin > maxMin) maxMin = pMin;
  }

  return { extentMajor: maxMaj, extentMinor: maxMin };
}

/* ── Ellipse ring generation ──────────────────────────────────────────────── */

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

/* ── Launch origin estimation ─────────────────────────────────────────────── */

function estimateOrigin(center: [number, number], majorAxisAngleDeg: number, semiMajorKm: number, semiMinorKm: number): { bearingDeg: number, distanceKm: number, source: string } {
  const lat = center[0];
  const lng = center[1];
  const stretch = semiMajorKm / Math.max(semiMinorKm, 1);

  // PCA-derived candidate bearings (used for refinement only)
  const pca1 = ((majorAxisAngleDeg % 360) + 360) % 360;
  const pca2 = (pca1 + 180) % 360;

  /**
   * Pick the PCA candidate closest to a target bearing.
   * If neither PCA candidate is within maxDeviation degrees, use the target directly.
   * This lets PCA refine the direction when it agrees with the geographic prior,
   * but prevents PCA from overriding the known threat bearing when it disagrees.
   */
  function refineBearing(target: number, maxDeviation: number = 40): number {
    const d1 = angleDiff(pca1, target);
    const d2 = angleDiff(pca2, target);
    if (d1 <= maxDeviation && d1 <= d2) return pca1;
    if (d2 <= maxDeviation) return pca2;
    return target;
  }

  let bearingDeg: number;
  let source: string;
  let distanceKm: number;

  // Determine source primarily by geographic position of the cluster center
  if (lat > 32.5) {
    // Northern Israel → Lebanon (bearing roughly north, ~0°)
    bearingDeg = refineBearing(0);
    source = "לבנון";
    const distToBorderKm = Math.max(0, (33.1 - lat) * 111.32);
    distanceKm = distToBorderKm + 20 + stretch * 15;
  } else if (lat < 31.0 && lng > 34.5) {
    // Deep south, eastern (Arava/Negev east) → Yemen (~170°)
    bearingDeg = refineBearing(170);
    source = "תימן";
    distanceKm = 1800 + stretch * 50;
  } else if (lat < 31.5 && lng < 34.5) {
    // Southwest (near Gaza envelope) → Gaza/Sinai (~220°)
    bearingDeg = refineBearing(220);
    source = "עזה/סיני";
    distanceKm = 40 + stretch * 10;
  } else {
    // Central Israel (lat ~31.0–32.5) → Iran/Iraq (~85°, roughly east)
    bearingDeg = refineBearing(85);
    source = stretch > 3 ? "איראן" : "עיראק/סוריה";
    distanceKm = 1000 + stretch * 150;
  }

  console.log('[ImpactEllipse] estimateOrigin:', {
    launchBearing: bearingDeg,
    originSource: source,
    pcaAngle: majorAxisAngleDeg,
    pcaCandidates: [pca1.toFixed(1), pca2.toFixed(1)],
    center: { lat: lat.toFixed(3), lng: lng.toFixed(3) },
    stretch: stretch.toFixed(2),
  });

  return { bearingDeg, distanceKm, source };
}

/* ── Trajectory-constrained centering ─────────────────────────────────────── */

function applyTrajectoryConstraint(
  weightedCenter: [number, number],
  arithmeticMid: [number, number],
  launchBearingDeg: number,
): [number, number] {
  const trajUnitX = Math.sin(toRad(launchBearingDeg));
  const trajUnitY = Math.cos(toRad(launchBearingDeg));

  // Project weighted centroid offset onto trajectory direction
  const dLat = weightedCenter[0] - arithmeticMid[0];
  const dLng = weightedCenter[1] - arithmeticMid[1];

  const dNorth = dLat * 111.32;
  const dEast = dLng * 111.32 * Math.cos(toRad(arithmeticMid[0]));

  const proj = dNorth * trajUnitY + dEast * trajUnitX;
  const constrainedNorth = proj * trajUnitY;
  const constrainedEast = proj * trajUnitX;

  const constrainedLat = arithmeticMid[0] + constrainedNorth / 111.32;
  const constrainedLng = arithmeticMid[1] + constrainedEast / (111.32 * Math.cos(toRad(arithmeticMid[0])));

  // Blend: 70% trajectory-constrained, 30% raw weighted centroid
  return [
    0.7 * constrainedLat + 0.3 * weightedCenter[0],
    0.7 * constrainedLng + 0.3 * weightedCenter[1],
  ];
}

/* ── Main hook ────────────────────────────────────────────────────────────── */

/**
 * Hook: compute impact ellipses from raw alerts + polygon data.
 * Clusters nearby alerts spatially using union-find, then computes
 * chi-squared confidence ellipses with trajectory-locked axis orientation
 * for clusters with ≥ MIN_CITIES_FOR_ELLIPSE cities.
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

      // Build per-city data with centroid, radius, and polygon
      const cityDataList: CityData[] = [];
      for (const item of cluster) {
        const poly = polygons[item.cityName];
        if (!poly?.polygon || poly.polygon.length < 3) continue;
        cityDataList.push({
          cityName: item.cityName,
          centroid: item.centroid,
          radiusKm: estimatePolygonRadiusKm(poly.polygon),
          polygon: poly.polygon,
        });
      }

      if (cityDataList.length < MIN_CITIES_FOR_ELLIPSE) continue;

      // Step 1: Weighted projection (centroid + boundary points in local km)
      const proj = prepareWeightedProjection(cityDataList);

      // Step 2: Free PCA for initial axis angle
      const pcaResult = freePca(proj);

      // Step 3: Estimate launch origin using free PCA angle
      const origin = estimateOrigin(
        proj.center, pcaResult.angleDeg, pcaResult.sigmaMajor, pcaResult.sigmaMinor
      );

      // Step 4: Determine orientation (trajectory-locked or PCA fallback)
      let rotation: number;

      if (origin.source !== "מקור לא ידוע") {
        rotation = origin.bearingDeg;
      } else {
        rotation = pcaResult.angleDeg;
      }

      // Step 5: Outer = max extent of boundary points along each axis + padding
      const extent = trajectoryLockedExtent(proj, rotation);
      let outerMajor = extent.extentMajor * OUTER_PADDING;
      let outerMinor = extent.extentMinor * OUTER_PADDING;

      // Enforce minimum axis ratio (range error > deflection)
      if (outerMajor / Math.max(outerMinor, 0.1) < MIN_AXIS_RATIO) {
        outerMajor = Math.max(outerMajor, outerMinor * MIN_AXIS_RATIO);
      }

      // Step 6: Inner = outer × 0.481
      const innerOuterRatio = chi2Scale(INNER_CONFIDENCE) / chi2Scale(OUTER_CONFIDENCE);
      const innerMajor = outerMajor * innerOuterRatio;
      const innerMinor = outerMinor * innerOuterRatio;

      console.log('[ImpactEllipse] sizing:', {
        rotation,
        originSource: origin.source,
        outerSemiMajorKm: outerMajor.toFixed(1),
        outerSemiMinorKm: outerMinor.toFixed(1),
        innerSemiMajorKm: innerMajor.toFixed(1),
        innerSemiMinorKm: innerMinor.toFixed(1),
        rawExtentMajor: extent.extentMajor.toFixed(1),
        rawExtentMinor: extent.extentMinor.toFixed(1),
      });

      // Step 7: Apply trajectory constraint to center
      const arithmeticMid = centroid(cityDataList.map(c => c.centroid));
      const constrainedCenter = applyTrajectoryConstraint(
        proj.center, arithmeticMid, origin.bearingDeg
      );

      // Step 8: Generate ellipse rings
      const ellipseRing = generateEllipseRing(constrainedCenter, outerMajor, outerMinor, rotation);
      const hitAreaRing = generateEllipseRing(constrainedCenter, innerMajor, innerMinor, rotation);

      results.push({
        id: `ellipse_${cluster[0].status}_${cluster.map(c => c.cityName).join("_").slice(0, 30)}`,
        center: constrainedCenter,
        ellipseRing,
        hitAreaRing,
        majorAxisAngleDeg: rotation,
        launchBearingDeg: origin.bearingDeg,
        launchDistanceKm: origin.distanceKm,
        launchSource: origin.source,
        sigmaMajorKm: outerMajor,
        sigmaMinorKm: outerMinor,
        outer: {
          confidence: OUTER_CONFIDENCE,
          semiMajorKm: outerMajor,
          semiMinorKm: outerMinor,
        },
        inner: {
          confidence: INNER_CONFIDENCE,
          semiMajorKm: innerMajor,
          semiMinorKm: innerMinor,
        },
        status: cluster[0].status,
      });
    }

    return results;
  }, [alerts, polygons]);
}
