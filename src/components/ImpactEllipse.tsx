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
 * Compute an arrow line from center outward along a bearing.
 */
function computeArrowLine(
  center: [number, number],
  bearingDeg: number,
  lengthKm: number,
): [number, number][] {
  const bRad = toRad(bearingDeg);
  const kmN = lengthKm * Math.cos(bRad);
  const kmE = lengthKm * Math.sin(bRad);
  const [dLat, dLng] = kmToLatLng(kmN, kmE, center[0]);
  const endPoint: [number, number] = [center[0] + dLat, center[1] + dLng];

  // Arrowhead wings
  const wingLen = lengthKm * 0.2;
  const wingAngle1 = bearingDeg + 150;
  const wingAngle2 = bearingDeg - 150;

  function wing(angle: number): [number, number] {
    const r = toRad(angle);
    const [dy, dx] = kmToLatLng(wingLen * Math.cos(r), wingLen * Math.sin(r), endPoint[0]);
    return [endPoint[0] + dy, endPoint[1] + dx];
  }

  return [center, endPoint, wing(wingAngle1), endPoint, wing(wingAngle2)];
}

export default function ImpactEllipseLayer({ ellipses }: { ellipses: ImpactEllipse[] }) {
  useEffect(() => { ensureStyles(); }, []);

  if (ellipses.length === 0) return null;

  return (
    <>
      {ellipses.map((e) => {
        const colors = STATUS_COLORS[e.status] || STATUS_COLORS.alert;
        const arrowPoints = computeArrowLine(e.center, e.launchBearingDeg, ARROW_LENGTH_KM);

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
                  <span style={{ fontSize: "10px", color: "#888" }}>
                    ציר: {e.semiMajorKm.toFixed(1)}×{e.semiMinorKm.toFixed(1)} ק&quot;מ
                  </span><br />
                  <span style={{ fontSize: "9px", color: "#aaa", fontStyle: "italic" }}>
                    הערכה אוטומטית — אין להסתמך עליה
                  </span>
                </div>
              </Tooltip>
            </Marker>

            {/* Launch direction arrow */}
            <Polyline
              positions={arrowPoints}
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
