"use client";

import { Polyline, CircleMarker, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { UavTrack } from "@/types";
import { useEffect, useState } from "react";

const COLOR_PALETTES = [
  { main: "#0ea5e9", light: "#bae6fd", bg: "#7dd3fc" }, // Cyan
  { main: "#84cc16", light: "#d9f99d", bg: "#bef264" }, // Lime
  { main: "#f97316", light: "#ffedd5", bg: "#fdba74" }, // Orange
  { main: "#ec4899", light: "#fbcfe8", bg: "#f9a8d4" }, // Pink
  { main: "#eab308", light: "#fef08a", bg: "#fde047" }, // Yellow
  { main: "#14b8a6", light: "#ccfbf1", bg: "#5eead4" }, // Teal
];

function getPaletteKey(trackId: string) {
  // Extract number from uav_0, uav_1 etc, fallback to hash
  const match = trackId.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10) % COLOR_PALETTES.length;
  }
  let hash = 0;
  for (let i = 0; i < trackId.length; i++) {
    hash = trackId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % COLOR_PALETTES.length;
}

function getObservedStyle(color: string) {
  return {
    color: color,
    weight: 3,
    opacity: 0.8,
  };
}

function getPredictedStyle(color: string, dashColor: string) {
  return {
    color: dashColor,
    weight: 2,
    opacity: 0.5,
    dashArray: "8, 8",
  };
}

// Inject global CSS for drone animations (once)
const STYLE_ID = "uav-drone-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes drone-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.85; }
    }
    @keyframes radar-sweep {
      0% { transform: scale(0.3); opacity: 0.7; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    @keyframes ghost-drift {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 0.15; }
    }
    .uav-drone-wrap {
      position: relative;
      width: 36px; height: 36px;
    }
    .uav-drone-icon {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      animation: drone-pulse 1.5s ease-in-out infinite;
      filter: drop-shadow(0 0 6px var(--uav-main));
      z-index: 2;
    }
    .uav-radar-ring {
      position: absolute;
      top: 50%; left: 50%;
      width: 14px; height: 14px;
      margin-left: -7px; margin-top: -7px;
      border: 2px solid var(--uav-ring);
      border-radius: 50%;
      animation: radar-sweep 2s ease-out infinite;
      z-index: 1;
    }
    .uav-radar-ring:nth-child(3) {
      animation-delay: 0.7s;
    }
    .uav-ghost {
      animation: ghost-drift 2s ease-in-out infinite;
      filter: drop-shadow(0 0 3px var(--uav-ghost-glow));
    }
  `;
  document.head.appendChild(style);
}

const DRONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="28" height="28">
  <!-- Rotor arms -->
  <line x1="7" y1="7" x2="29" y2="29" stroke="var(--uav-bg)" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="29" y1="7" x2="7" y2="29" stroke="var(--uav-bg)" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Rotors -->
  <circle cx="7" cy="7" r="5" fill="none" stroke="var(--uav-main)" stroke-width="1.2" opacity="0.6"/>
  <circle cx="29" cy="7" r="5" fill="none" stroke="var(--uav-main)" stroke-width="1.2" opacity="0.6"/>
  <circle cx="7" cy="29" r="5" fill="none" stroke="var(--uav-main)" stroke-width="1.2" opacity="0.6"/>
  <circle cx="29" cy="29" r="5" fill="none" stroke="var(--uav-main)" stroke-width="1.2" opacity="0.6"/>
  <!-- Body -->
  <circle cx="18" cy="18" r="5" fill="var(--uav-main)"/>
  <circle cx="18" cy="18" r="2.5" fill="var(--uav-light)"/>
  <!-- Direction notch (forward = up) -->
  <circle cx="18" cy="11" r="1.5" fill="var(--uav-light)"/>
</svg>`;

function droneIcon(headingDeg: number, paletteMap: { main: string; light: string; bg: string }) {
  ensureStyles();
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div class="uav-drone-wrap" style="--uav-main: ${paletteMap.main}; --uav-light: ${paletteMap.light}; --uav-bg: ${paletteMap.bg}; --uav-ring: ${paletteMap.main}80;">
      <div class="uav-radar-ring"></div>
      <div class="uav-radar-ring"></div>
      <div class="uav-drone-icon" style="transform: translate(-50%, -50%) rotate(${headingDeg}deg);">
        ${DRONE_SVG}
      </div>
    </div>`,
  });
}

function ghostDroneIcon(headingDeg: number, opacity: number, paletteMap: { main: string; light: string; bg: string }) {
  ensureStyles();
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="uav-ghost" style="opacity:${opacity}; transform: rotate(${headingDeg}deg); --uav-main: ${paletteMap.bg}; --uav-light: ${paletteMap.light}; --uav-bg: ${paletteMap.light}; --uav-ghost-glow: ${paletteMap.bg}80;">
      ${DRONE_SVG}
    </div>`,
  });
}

/**
 * Animates a drone marker stepping through the predicted path points,
 * cycling back to the start for a continuous simulation effect.
 */
function useGhostAnimation(tracks: UavTrack[]): Map<string, number> {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (tracks.length === 0) return;
    const interval = setInterval(() => setStep((s) => s + 1), 1200);
    return () => clearInterval(interval);
  }, [tracks.length]);

  // Map track_id → index into predicted array (cycling)
  const positions = new Map<string, number>();
  for (const track of tracks) {
    if (track.predicted.length > 0) {
      positions.set(track.track_id, step % track.predicted.length);
    }
  }
  return positions;
}

export default function UavFlightPath({ tracks }: { tracks: UavTrack[] }) {
  const ghostPositions = useGhostAnimation(tracks);

  if (tracks.length === 0) return null;

  return (
    <>
      {tracks.map((track) => {
        const hasPath = track.observed.length >= 2;
        const hasPrediction = track.predicted.length > 0;
        const lastObserved = track.observed[track.observed.length - 1];
        const ghostIdx = ghostPositions.get(track.track_id) ?? 0;

        const palette = COLOR_PALETTES[getPaletteKey(track.track_id)];

        return (
          <span key={track.track_id}>
            {/* Observed path */}
            {hasPath && (
              <Polyline positions={track.observed} pathOptions={getObservedStyle(palette.main)} />
            )}

            {/* Observed point markers */}
            {track.observed.map((pos, i) => (
              <CircleMarker
                key={`${track.track_id}_pt_${i}`}
                center={pos}
                radius={3}
                pathOptions={{
                  color: palette.main,
                  fillColor: palette.bg,
                  fillOpacity: 1,
                  weight: 1,
                }}
              />
            ))}

            {/* Predicted path */}
            {hasPrediction && lastObserved && (
              <Polyline
                positions={[lastObserved, ...track.predicted]}
                pathOptions={getPredictedStyle(palette.main, palette.bg)}
              />
            )}

            {/* Live drone icon at current position */}
            {lastObserved && (
              <Marker
                position={lastObserved}
                icon={droneIcon(track.heading_deg, palette)}
                interactive={true}
                zIndexOffset={1000}
              >
                <Popup className="uav-popup">
                  <div className="flex flex-col gap-1 p-1 text-right" dir="rtl">
                    <span className="font-bold text-[13px] text-purple-900 border-b border-purple-200 pb-1 mb-1">כלי טיס עוין במעקב</span>
                    <span className="text-[11px] text-gray-700"><b>מהירות משוערת:</b> ~{track.speed_kmh} קמ"ש</span>
                    {track.origin_type && (
                      <span className="text-[11px] text-gray-700"><b>סיווג:</b> {track.origin_type}</span>
                    )}
                    <span className="text-[9px] text-gray-400 mt-1 italic leading-tight bg-gray-50 p-1.5 rounded-md">הנתונים מבוססים על הערכת מערכת. יש להיכנס למרחב המוגן מיד עם הישמע האזעקה.</span>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Ghost drone stepping along predicted path */}
            {hasPrediction && (
              <Marker
                key={`${track.track_id}_ghost_${ghostIdx}`}
                position={track.predicted[ghostIdx]}
                icon={ghostDroneIcon(track.heading_deg, 0.4, palette)}
                interactive={false}
                zIndexOffset={999}
              />
            )}

            {/* Faded prediction point markers */}
            {track.predicted.map((pos, i) => (
              <CircleMarker
                key={`${track.track_id}_pred_${i}`}
                center={pos}
                radius={2}
                pathOptions={{
                  color: palette.bg,
                  fillColor: palette.bg,
                  fillOpacity: 0.3,
                  weight: 1,
                  opacity: 0.4,
                }}
              />
            ))}
          </span>
        );
      })}
    </>
  );
}
