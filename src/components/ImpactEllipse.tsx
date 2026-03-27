"use client";

import { Polygon, Polyline, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { ImpactEllipse } from "@/hooks/useImpactEllipses";

const STATUS_COLORS: Record<string, { stroke: string; fill: string; inner: string }> = {
  alert: { stroke: "#FF2A2A", fill: "#FF2A2A", inner: "#FFD700" },
  pre_alert: { stroke: "#FF6A00", fill: "#FF6A00", inner: "#FFD700" },
  terrorist: { stroke: "#FF0055", fill: "#FF0055", inner: "#FFD700" },
};

const ARROW_LENGTH_KM = 15;

const STYLE_ID = "impact-ellipse-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  // Create SVG definitions for the polygon gradient
  const svgNS = "http://www.w3.org/2000/svg";
  const svgDef = document.createElementNS(svgNS, "svg");
  svgDef.setAttribute("style", "position: absolute; width: 0; height: 0; overflow: hidden;");
  svgDef.setAttribute("aria-hidden", "true");
  svgDef.innerHTML = `
    <defs>
      <radialGradient id="polyGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stop-color="#FFFF00" stop-opacity="0" />
        <stop offset="100%" stop-color="#FFFF00" stop-opacity="0.8" />
      </radialGradient>
    </defs>
  `;
  document.body.appendChild(svgDef);

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .impact-poly-gradient {
      fill: url(#polyGradient) !important;
      fill-opacity: 1 !important;
    }
  `;
  document.head.appendChild(style);
}

export default function ImpactEllipseLayer({ ellipses }: { ellipses: ImpactEllipse[] }) {
  useEffect(() => { ensureStyles(); }, []);

  if (ellipses.length === 0) return null;

  return (
    <>
      {ellipses.map((e) => {
        const colors = STATUS_COLORS[e.status] || STATUS_COLORS.alert;

        return (
          <span key={e.id}>
            {/* Outer ellipse */}
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

            {/* Inner hit-area ellipse */}
            <Polygon
              positions={e.hitAreaRing}
              pathOptions={{
                color: colors.inner,
                weight: 1.5,
                opacity: 0.7,
                className: "impact-poly-gradient",
              }}
              // @ts-ignore
              eventHandlers={{
                add: (ev) => {
                  const el = ev.target.getElement();
                  if (el) el.style.setProperty("--inner-color", colors.inner);
                }
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
                  <span style={{ fontSize: "9px", color: "#aaa", fontStyle: "italic" }}>
                    הערכה אוטומטית לפי מרווח התרעות
                  </span>
                </div>
              </Tooltip>
            </Polygon>
          </span>
        );
      })}
    </>
  );
}
