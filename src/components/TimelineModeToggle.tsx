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
      <div className="liquid-glass glass-segment rounded-full flex gap-0.5 p-1">
        <button
          onClick={() => onToggle("live")}
          aria-pressed={mode === "live"}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide ${
            mode === "live" ? "text-emerald-300" : "text-white/60 hover:text-white/80"
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
          aria-pressed={mode === "history"}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide ${
            mode === "history" ? "text-blue-300" : "text-white/60 hover:text-white/80"
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
