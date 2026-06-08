"use client";

import { ActiveAlert } from "@/types";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  pre_alert:   { label: "התרעה מוקדמת",         color: "text-[#FF6A00]", dot: "bg-[#FF6A00]",        bg: "border-[#FF6A00]/20" },
  alert:       { label: "ירי רקטות וטילים",     color: "text-[#FF2A2A]", dot: "bg-[#FF2A2A]",        bg: "border-[#FF2A2A]/20" },
  uav:         { label: 'כלי טיס עוין',         color: "text-[#E040FB]", dot: "bg-[#E040FB]",        bg: "border-[#E040FB]/20" },
  terrorist:   { label: "חדירת מחבלים",         color: "text-[#FF0055]", dot: "bg-[#FF0055]",        bg: "border-[#FF0055]/20" },
  after_alert: { label: 'להישאר בממ"ד',         color: "text-[#FF2A2A]/70", dot: "bg-[#FF2A2A]/50",  bg: "border-[#FF2A2A]/10" },
};

const STATUS_PRIORITY: Record<string, number> = {
  alert: 0, terrorist: 1, uav: 2, pre_alert: 3, after_alert: 4,
};

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `לפני ${diff} שניות`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `לפני ${mins} דקות`;
  return `לפני ${Math.floor(mins / 60)} שעות`;
}

interface AlertsPanelProps {
  alerts: ActiveAlert[];
  counts: Record<string, number>;
  onClose: () => void;
}

export function AlertsPanel({ alerts, counts, onClose }: AlertsPanelProps) {
  const sorted = [...alerts].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9;
    const pb = STATUS_PRIORITY[b.status] ?? 9;
    return pa !== pb ? pa - pb : b.timestamp - a.timestamp;
  });

  return (
    <div
      className="intel-panel absolute top-14 sm:top-16 bottom-4 right-3 left-3 sm:left-auto z-[1000] flex sm:w-80 flex-col liquid-glass rounded-2xl overflow-hidden glass-overlay"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-bold text-white">עדכונים</h2>
          <span className="text-[11px] text-white/40 font-medium">{alerts.length}</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 text-white/40"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 flex-wrap">
        {counts.alert    && <Chip dot="bg-[#FF2A2A]" color="text-[#FF2A2A]" label={`${counts.alert} טילים`} pulse />}
        {counts.uav      && <Chip dot="bg-[#E040FB]" color="text-[#E040FB]" label={`${counts.uav} כטב"מ`} pulse />}
        {counts.terrorist && <Chip dot="bg-[#FF0055]" color="text-[#FF0055]" label={`${counts.terrorist} מחבלים`} pulse />}
        {counts.pre_alert && <Chip dot="bg-[#FF6A00]" color="text-[#FF6A00]" label={`${counts.pre_alert} מוקדם`} />}
      </div>

      {/* Alert list */}
      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {alerts.length > 0 ? (
          sorted.map((alert) => <AlertItem key={alert.id} alert={alert} />)
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-20">
            <h3 className="text-white text-[14px] font-bold mb-1">אין התרעות פעילות</h3>
            <p className="text-white text-[12px]">כאן יופיעו עדכונים בזמן אמת</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ dot, color, label, pulse }: { dot: string; color: string; label: string; pulse?: boolean }) {
  return (
    <div className={`flex items-center gap-1 text-[11px] font-bold ${color}`}>
      <span className={`h-2 w-2 rounded-full ${dot} ${pulse ? "status-dot-pulse" : ""}`} />
      {label}
    </div>
  );
}

function AlertItem({ alert }: { alert: ActiveAlert }) {
  const config = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.alert;
  const isActive = alert.status === "alert" || alert.status === "pre_alert" || alert.status === "uav" || alert.status === "terrorist";

  return (
    <div className={`alert-item-enter liquid-glass-subtle rounded-xl p-3 border-r-2 ${config.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${config.dot} ${isActive ? "status-dot-pulse" : ""}`} />
          <span className={`text-[11px] font-medium ${config.color}`}>{config.label}</span>
        </div>
        <span className="text-[10px] text-white/40 font-medium tabular-nums">
          {formatRelativeTime(alert.timestamp)}
        </span>
      </div>
      <p className="text-[14px] text-white font-bold leading-snug">{alert.city_name_he}</p>
    </div>
  );
}
