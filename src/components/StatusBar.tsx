"use client";

interface StatusBarProps {
  counts: Record<string, number>;
  onClick: () => void;
}

const CHIPS: {
  key: string;
  dot: string;
  color: string;
  label: string;
  pulse?: boolean;
}[] = [
  { key: "alert",       dot: "#FF2A2A", color: "#FF2A2A", label: "ירי טילים",    pulse: true  },
  { key: "uav",         dot: "#E040FB", color: "#E040FB", label: 'כטב"מ',        pulse: true  },
  { key: "terrorist",   dot: "#FF0055", color: "#FF0055", label: "מחבלים",       pulse: true  },
  { key: "pre_alert",   dot: "#FF6A00", color: "#FF6A00", label: "התרעות מוקדמות"              },
  { key: "after_alert", dot: "#FF2A2A", color: "#aaa",    label: 'בממ"ד'                       },
];

export function StatusBar({ counts, onClick }: StatusBarProps) {
  const active = CHIPS.filter((c) => counts[c.key]);
  if (active.length === 0) return null;

  return (
    <button
      onClick={onClick}
      dir="rtl"
      className="absolute bottom-4 right-3 left-3 z-[1000] glass-overlay liquid-glass flex items-center justify-between gap-3 rounded-[22px] px-4 py-2.5 transition-transform duration-200 ease-out active:scale-[0.985]"
    >
      {/* Alert chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {active.map((c) => (
          <div key={c.key} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full flex-shrink-0${c.pulse ? " status-dot-pulse" : ""}`}
              style={{ background: c.dot }}
            />
            <span className="text-[13px] font-bold tabular-nums" style={{ color: c.color }}>
              {counts[c.key]}
            </span>
            <span className="text-[12px] font-medium text-white/60">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Expand chevron */}
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
        className="text-white/50 flex-shrink-0"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
