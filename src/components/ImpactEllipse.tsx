"use client";

import { Polygon, Polyline, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { ImpactEllipse } from "@/hooks/useImpactEllipses";

const STATUS_COLORS: Record<string, { stroke: string; fill: string }> = {
  alert:     { stroke: "#FF2A2A", fill: "#FF2A2A" },
  pre_alert: { stroke: "#FF6A00", fill: "#FF6A00" },
  terrorist: { stroke: "#FF0055", fill: "#FF0055" },
};

const ARROW_LENGTH_KM = 15;

/** Inject CSS keyframes once */
const STYLE_ID = "impact-ellipse-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes impact-pulse {
      0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.6; }
    }
    @keyframes impact-ring-expand {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.8; }
      100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
    }
    .impact-center-wrap {
      position: relative;
      width: 40px;
      height: 40px;
    }
    .impact-crosshair {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2;
    }
    .impact-pulse-ring {
      position: absolute;
      top: 50%; left: 50%;
      width: 16px; height: 16px;
      border: 2px solid var(--impact-color);
      border-radius: 50%;
      animation: impact-ring-expand 2s ease-out infinite;
      z-index: 1;
    }
    .impact-pulse-ring:nth-child(2) {
      animation-delay: 0.7s;
    }
    .impact-pulse-ring:nth-child(3) {
      animation-delay: 1.4s;
    }
  `;
  document.head.appendChild(style);
}

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function kmToLatLng(kmNorth: number, kmEast: number, atLat: number): [number, number] {
  const dLat = kmNorth / 111.32;
  const dLng = kmEast / (111.32 * Math.cos(toRad(atLat)));
  return [dLat, dLng];
}

function centerIcon(color: string) {
  ensureStyles();

  const crosshairSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="6" stroke="${color}" stroke-width="2" fill="${color}" fill-opacity="0.2"/>
    <circle cx="12" cy="12" r="2.5" fill="${color}"/>
    <line x1="12" y1="2" x2="12" y2="8" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="16" x2="12" y2="22" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="2" y1="12" x2="8" y2="12" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="16" y1="12" x2="22" y2="12" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div class="impact-center-wrap" style="--impact-color: ${color}">
      <div class="impact-pulse-ring"></div>
      <div class="impact-pulse-ring"></div>
      <div class="impact-pulse-ring"></div>
      <div class="impact-crosshair" style="animation: impact-pulse 2s ease-in-out infinite;">
        ${crosshairSvg}
      </div>
    </div>`,
  });
}

/**
 * Compute a curved ballistic arrival path from far away.
 * Points trace from the hypothetical launch origin to the impact center.
 */
function computeBallisticPath(
  center: [number, number],
  bearingFromCenterDeg: number,
  baseLengthKm: number = 800,
): [number, number][] {
  const points: [number, number][] = [];
  const NUM_POINTS = 40;
  
  const bRad = toRad(bearingFromCenterDeg);
  // Curve perpendicular to bearing (creates an arc sweeping "up" or "down" based on direction)
  // For Iran (East), bearing is ~90. We want the arc to curve slightly North, so offset to the right.
  const perpRad = bRad + Math.PI / 2;
  
  for (let i = 0; i <= NUM_POINTS; i++) {
    // t goes from 0 (launch pt) to 1 (impact center)
    const t = i / NUM_POINTS;
    const tRev = 1 - t; // 1 at launch, 0 at center
    
    // Stretch the start point much further out
    const distKm = baseLengthKm * tRev;
    
    // Create an arching offset based on a sine curve that peaks in the middle of the trajectory
    const curveOffsetKm = Math.sin(tRev * Math.PI) * (baseLengthKm * 0.15); // 15% curve arch
    
    // Base line extending along bearing
    const baseN = distKm * Math.cos(bRad);
    const baseE = distKm * Math.sin(bRad);
    
    // Add perpendicular curve offset
    const nN = baseN + curveOffsetKm * Math.cos(perpRad);
    const nE = baseE + curveOffsetKm * Math.sin(perpRad);
    
    const [dLat, dLng] = kmToLatLng(nN, nE, center[0]);
    points.push([center[0] + dLat, center[1] + dLng]);
  }
  
  return points;
}

export default function ImpactEllipseLayer({ ellipses }: { ellipses: ImpactEllipse[] }) {
  useEffect(() => { ensureStyles(); }, []);

  if (ellipses.length === 0) return null;

  return (
    <>
      {ellipses.map((e) => {
        const colors = STATUS_COLORS[e.status] || STATUS_COLORS.alert;
        const ballisticPoints = computeBallisticPath(e.center, e.launchBearingDeg, e.launchDistanceKm);

        return (
          <span key={e.id}>
            {/* Ellipse outline */}
            <Polygon
              positions={e.ellipseRing}
              pathOptions={{
                color: colors.stroke,
                weight: 2,
                dashArray: "8, 6",
                fillColor: colors.fill,
                fillOpacity: 0.08,
                opacity: 0.7,
              }}
            />

            {/* Center crosshair marker */}
            <Marker
              position={e.center}
              icon={centerIcon(colors.stroke)}
              interactive={true}
              zIndexOffset={1100}
            >
              <Tooltip
                direction="top"
                offset={[0, -20]}
                className="impact-tooltip"
                permanent={false}
              >
                <div dir="rtl" style={{ textAlign: "right", fontSize: "12px", lineHeight: "1.5" }}>
                  <strong>מוקד פגיעה משוער</strong><br />
                  <span style={{ fontSize: "11px", color: "#ddd" }}>
                    מקור ירי משוער: <span style={{ color: "#fff", fontWeight: "bold" }}>{e.launchSource}</span>
                  </span><br />
                  <span style={{ fontSize: "10px", color: "#888" }}>
                    ציר: {e.semiMajorKm.toFixed(1)}×{e.semiMinorKm.toFixed(1)} ק&quot;מ
                  </span><br />
                  <span style={{ fontSize: "9px", color: "#aaa", fontStyle: "italic" }}>
                    הערכה אוטומטית לפי מרווח התרעות
                  </span>
                </div>
              </Tooltip>
            </Marker>

            {/* Launch direction arrow */}
            <Polyline
              positions={ballisticPoints}
              pathOptions={{
                color: colors.stroke,
                weight: 2,
                dashArray: "6, 4",
                opacity: 0.5,
              }}
            />
          </span>
        );
      })}
    </>
  );
}
