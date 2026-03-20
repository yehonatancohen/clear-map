"use client";

export type MapMode = "live" | "history";

interface TimelineModeToggleProps {
  mode: MapMode;
  onToggle: (mode: MapMode) => void;
}

export default function TimelineModeToggle({
  mode,
  onToggle,
}: TimelineModeToggleProps) {
  return (
    <div className="absolute top-3 left-28 z-[1000] glass-overlay" dir="rtl">
      <div className="liquid-glass rounded-xl flex overflow-hidden">
        <button
          onClick={() => onToggle("live")}
          className={`px-3 py-1.5 text-[11px] font-bold tracking-wide transition-all duration-200 ${
            mode === "live"
              ? "bg-emerald-500/30 text-emerald-400"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {mode === "live" && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 status-dot-pulse" />
            )}
            חי
          </span>
        </button>
        <button
          onClick={() => onToggle("history")}
          className={`px-3 py-1.5 text-[11px] font-bold tracking-wide transition-all duration-200 ${
            mode === "history"
              ? "bg-blue-500/30 text-blue-400"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {mode === "history" && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
            )}
            היסטוריה
          </span>
        </button>
      </div>
    </div>
  );
}
