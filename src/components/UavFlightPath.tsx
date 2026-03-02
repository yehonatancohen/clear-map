"use client";

import { Polyline, CircleMarker, Marker } from "react-leaflet";
import L from "leaflet";
import { UavTrack } from "@/types";
import { useEffect, useState } from "react";

const OBSERVED_STYLE = {
  color: "#a855f7",
  weight: 3,
  opacity: 0.8,
};

const PREDICTED_STYLE = {
  color: "#c084fc",
  weight: 2,
  opacity: 0.5,
  dashArray: "8, 8",
};

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
      filter: drop-shadow(0 0 6px rgba(168,85,247,0.8));
      z-index: 2;
    }
    .uav-radar-ring {
      position: absolute;
      top: 50%; left: 50%;
      width: 14px; height: 14px;
      margin-left: -7px; margin-top: -7px;
      border: 2px solid rgba(168,85,247,0.5);
      border-radius: 50%;
      animation: radar-sweep 2s ease-out infinite;
      z-index: 1;
    }
    .uav-radar-ring:nth-child(3) {
      animation-delay: 0.7s;
    }
    .uav-ghost {
      animation: ghost-drift 2s ease-in-out infinite;
      filter: drop-shadow(0 0 3px rgba(192,132,252,0.5));
    }
  `;
  document.head.appendChild(style);
}

const DRONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="28" height="28">
  <!-- Rotor arms -->
  <line x1="7" y1="7" x2="29" y2="29" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="29" y1="7" x2="7" y2="29" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Rotors -->
  <circle cx="7" cy="7" r="5" fill="none" stroke="#a855f7" stroke-width="1.2" opacity="0.6"/>
  <circle cx="29" cy="7" r="5" fill="none" stroke="#a855f7" stroke-width="1.2" opacity="0.6"/>
  <circle cx="7" cy="29" r="5" fill="none" stroke="#a855f7" stroke-width="1.2" opacity="0.6"/>
  <circle cx="29" cy="29" r="5" fill="none" stroke="#a855f7" stroke-width="1.2" opacity="0.6"/>
  <!-- Body -->
  <circle cx="18" cy="18" r="5" fill="#a855f7"/>
  <circle cx="18" cy="18" r="2.5" fill="#e9d5ff"/>
  <!-- Direction notch (forward = up) -->
  <circle cx="18" cy="11" r="1.5" fill="#e9d5ff"/>
</svg>`;

function droneIcon(headingDeg: number) {
  ensureStyles();
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div class="uav-drone-wrap">
      <div class="uav-radar-ring"></div>
      <div class="uav-radar-ring"></div>
      <div class="uav-drone-icon" style="transform: translate(-50%, -50%) rotate(${headingDeg}deg);">
        ${DRONE_SVG}
      </div>
    </div>`,
  });
}

function ghostDroneIcon(headingDeg: number, opacity: number) {
  ensureStyles();
  const svg = DRONE_SVG.replace(/#a855f7/g, "#c084fc").replace(/#e9d5ff/g, "#ddd6fe");
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="uav-ghost" style="opacity:${opacity}; transform: rotate(${headingDeg}deg);">
      ${svg}
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

        return (
          <span key={track.track_id}>
            {/* Observed path */}
            {hasPath && (
              <Polyline positions={track.observed} pathOptions={OBSERVED_STYLE} />
            )}

            {/* Observed point markers */}
            {track.observed.map((pos, i) => (
              <CircleMarker
                key={`${track.track_id}_pt_${i}`}
                center={pos}
                radius={3}
                pathOptions={{
                  color: "#a855f7",
                  fillColor: "#c084fc",
                  fillOpacity: 1,
                  weight: 1,
                }}
              />
            ))}

            {/* Predicted path */}
            {hasPrediction && lastObserved && (
              <Polyline
                positions={[lastObserved, ...track.predicted]}
                pathOptions={PREDICTED_STYLE}
              />
            )}

            {/* Live drone icon at current position */}
            {lastObserved && (
              <Marker
                position={lastObserved}
                icon={droneIcon(track.heading_deg)}
                interactive={false}
                zIndexOffset={1000}
              />
            )}

            {/* Ghost drone stepping along predicted path */}
            {hasPrediction && (
              <Marker
                key={`${track.track_id}_ghost_${ghostIdx}`}
                position={track.predicted[ghostIdx]}
                icon={ghostDroneIcon(track.heading_deg, 0.4)}
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
                  color: "#c084fc",
                  fillColor: "#c084fc",
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
