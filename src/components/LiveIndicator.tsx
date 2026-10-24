"use client";

import { useLiveHealth } from "@/hooks/useLiveState";
import type { MapMode } from "./TimelineModeToggle";

interface LiveIndicatorProps {
  mode: MapMode;
}

export default function LiveIndicator({ mode }: LiveIndicatorProps) {
  const health = useLiveHealth();
  const isLive = health === "ok";

  if (mode === "history") {
    return (
      <div
        className="absolute top-3 left-3 z-[1000] liquid-glass rounded-full px-3 py-2 flex items-center gap-1.5 glass-overlay"
        title="מציג היסטוריית אירועים"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
        <span className="text-[11px] font-bold tracking-wide text-blue-400">
          HISTORY
        </span>
      </div>
    );
  }

  return (
    <div
      className="absolute top-3 left-3 z-[1000] liquid-glass rounded-full px-3 py-2 flex items-center gap-1.5 glass-overlay"
      title={isLive ? "מחובר בזמן אמת" : "אין חיבור"}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isLive
            ? "bg-emerald-400 status-dot-pulse"
            : health === "connecting" ? "bg-amber-400" : "bg-red-500"
        }`}
      />
      <span
        className={`text-[11px] font-bold tracking-wide ${
          isLive ? "text-emerald-400" : health === "connecting" ? "text-amber-300" : "text-red-400"
        }`}
      >
        {isLive ? "LIVE" : health === "connecting" ? "..." : "OFFLINE"}
      </span>
    </div>
  );
}
