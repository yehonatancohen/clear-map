"use client";

import { Polygon, Tooltip } from "react-leaflet";
import type { ImpactEllipse } from "@/hooks/useImpactEllipses";

const STATUS_COLORS: Record<string, { stroke: string; fill: string }> = {
  alert: { stroke: "#FF2A2A", fill: "#FF2A2A" },
  pre_alert: { stroke: "#FF6A00", fill: "#FF6A00" },
  terrorist: { stroke: "#FF0055", fill: "#FF0055" },
};

const INNER_ELLIPSE_COLOR = "#FFD700"; // yellow
const INNER_GRADIENT_STEPS = 7;

function scaleRingAroundCenter(
  ring: [number, number][],
  center: [number, number],
  scale: number,
): [number, number][] {
  return ring.map(([lat, lng]) => [
    center[0] + (lat - center[0]) * scale,
    center[1] + (lng - center[1]) * scale,
  ]);
}

export default function ImpactEllipseLayer({ ellipses }: { ellipses: ImpactEllipse[] }) {

  if (ellipses.length === 0) return null;

  return (
    <>
      {ellipses.map((e) => {
        const colors = STATUS_COLORS[e.status] || STATUS_COLORS.alert;

        return (
          <span key={e.id}>
            {/* 1. Outer ellipse */}
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

            {/* 2. Inner hit-area ellipse — yellow dashed outline */}
            <Polygon
              positions={e.hitAreaRing}
              pathOptions={{
                color: INNER_ELLIPSE_COLOR,
                weight: 2,
                dashArray: "8, 6",
                fillOpacity: 0,
                opacity: 0.7,
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -8]}
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
                </div>
              </Tooltip>
            </Polygon>

            {/* 3. Inner hit-area ellipse — yellow gradient fill */}
            {Array.from({ length: INNER_GRADIENT_STEPS }, (_, i) => {
              const outerScale = 1.0 - i / INNER_GRADIENT_STEPS;
              const innerScale = 1.0 - (i + 1) / INNER_GRADIENT_STEPS;
              const fillOpacity = 0.22 * (INNER_GRADIENT_STEPS - i) / INNER_GRADIENT_STEPS;

              const outerRing = scaleRingAroundCenter(e.hitAreaRing, e.center, outerScale);
              const innerRing = scaleRingAroundCenter(e.hitAreaRing, e.center, innerScale);
              const positions: [number, number][][] = innerScale > 0.01 ? [outerRing, innerRing] : [outerRing];

              return (
                <Polygon
                  key={`inner_grad_${e.id}_${i}`}
                  positions={positions}
                  interactive={false}
                  pathOptions={{
                    color: "transparent",
                    weight: 0,
                    fillColor: INNER_ELLIPSE_COLOR,
                    fillOpacity,
                    opacity: 0,
                  }}
                />
              );
            })}

          </span>
        );
      })}
    </>
  );
}
