"use client";

import { useState } from "react";
import { ZONE_META, formatClock, formatSince, type ZoneStatus } from "@/hooks/useZoneStatus";

interface ShelterCardProps {
  /** The user's own zones (current location first) with their status. */
  zones: { zone: string; status: ZoneStatus; isLocation: boolean }[];
  /** Raise the card above the status bar when that is showing. */
  raised: boolean;
}

/**
 * "Can I leave the shelter?" — shown only while one of the user's own zones
 * has something going on. Says "you can leave" only after an official Oref
 * "event ended" message for that zone.
 */
export function ShelterCard({ zones, raised }: ShelterCardProps) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const relevant = zones
    .filter((z) => z.status.state !== "quiet")
    .sort((a, b) => ZONE_META[a.status.state].severity - ZONE_META[b.status.state].severity);
  if (relevant.length === 0) return null;

  const top = relevant[0];
  const key = relevant.map((z) => `${z.zone}:${z.status.state}:${z.status.at ?? ""}`).join("|");
  if (key === dismissedKey) return null;

  const meta = ZONE_META[top.status.state];
  const others = relevant.length - 1;
  const detail =
    top.status.state === "clear" && top.status.at ? `${meta.hint} (${formatClock(top.status.at)})`
    : meta.severity === 0 && top.status.at ? `${meta.hint} · ${formatSince(top.status.at)}`
    : meta.hint;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className={`absolute right-3 left-3 sm:left-auto sm:w-[380px] z-[1001] ${raised ? "bottom-[72px]" : "bottom-4"}`}
    >
      <div
        className="liquid-glass glass-overlay rounded-[22px] px-4 py-3 flex items-center gap-3"
        style={{ boxShadow: `inset 4px 0 0 ${meta.color}` }}
      >
        <span
          className={`h-3 w-3 rounded-full flex-shrink-0${meta.severity === 0 ? " status-dot-pulse" : ""}`}
          style={{ background: meta.color }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0 text-right">
          <div className="text-[11px] text-white/55 truncate">
            {top.isLocation ? "המיקום שלך" : "האזור שלך"} · {top.zone}
            {others > 0 && ` ועוד ${others}`}
          </div>
          <div className="text-[15px] font-bold leading-tight" style={{ color: meta.color }}>
            {meta.label}
          </div>
          {detail && <div className="text-[11px] text-white/65 leading-snug">{detail}</div>}
        </div>
        <button
          onClick={() => setDismissedKey(key)}
          aria-label="הסתרה"
          className="glass-btn h-7 w-7 rounded-full flex-shrink-0 text-white/50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
