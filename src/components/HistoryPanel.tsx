"use client";

import type { SortedAlert, AlertBatch } from "@/hooks/useTimelineHistory";
import type { HistoryRange } from "@/hooks/useTimelineHistory";

interface HistoryPanelProps {
  batches: AlertBatch[];
  loading: boolean;
  progress: number;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string | null, alerts: SortedAlert[]) => void;
  onClose: () => void;
}

const RANGE_OPTIONS: { value: HistoryRange; label: string }[] = [
  { value: 1, label: "יום" },
  { value: 2, label: "יומיים" },
  { value: 3, label: "3 ימים" },
  { value: 7, label: "שבוע" },
];

const CATEGORY_CONFIG: Record<number, { label: string; color: string; dot: string }> = {
  1: { label: "רקטות וטילים", color: "text-[#FF2A2A]", dot: "bg-[#FF2A2A]" },
  2: { label: 'כטב"ם', color: "text-[#E040FB]", dot: "bg-[#E040FB]" },
  3: { label: "חדירת מחבלים", color: "text-[#FF0055]", dot: "bg-[#FF0055]" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

// Max cities shown per category before truncating
const MAX_CITIES_SHOWN = 6;

function groupBatchesByDate(batches: AlertBatch[]): Map<string, AlertBatch[]> {
  const groups = new Map<string, AlertBatch[]>();
  for (const b of batches) {
    const key = formatDate(b.startTs);
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }
  return groups;
}

export default function HistoryPanel({
  batches,
  loading,
  progress,
  range,
  onRangeChange,
  selectedBatchId,
  onSelectBatch,
  onClose,
}: HistoryPanelProps) {
  const grouped = groupBatchesByDate(batches);
  const totalAlerts = batches.reduce((n, b) => n + b.alerts.length, 0);

  const handleBatchClick = (batch: AlertBatch) => {
    if (selectedBatchId === batch.id) {
      onSelectBatch(null, []);
    } else {
      onSelectBatch(batch.id, batch.alerts);
    }
  };

  return (
    <div
      className="absolute bottom-0 sm:top-16 sm:bottom-4 right-0 sm:right-3 left-0 sm:left-auto z-[1000] flex sm:w-80 flex-col h-[50vh] sm:h-auto liquid-glass rounded-t-2xl sm:rounded-2xl overflow-hidden glass-overlay"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-bold text-white text-right">היסטוריה</h2>
          <span className="text-[11px] text-white/50 font-medium">
            {totalAlerts} התרעות · {batches.length} אירועים
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10 text-white/40"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Range selector */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onRangeChange(opt.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              range === opt.value
                ? "bg-blue-500/30 text-blue-300"
                : "text-white/30 hover:text-white/50 hover:bg-white/5"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="px-4 py-1.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-blue-500/60 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-white/40 tabular-nums">{progress}%</span>
          </div>
        </div>
      )}

      {/* Batched alert list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        {batches.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-20">
            <h3 className="text-white text-[14px] font-bold mb-1">אין התרעות</h3>
            <p className="text-white text-[12px]">לא נמצאו התרעות בתקופה הנבחרת</p>
          </div>
        )}

        {Array.from(grouped.entries()).map(([date, dayBatches]) => (
          <div key={date} className="mb-3">
            {/* Date header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 py-1.5 px-2 mb-1 rounded-lg bg-white/5 backdrop-blur-sm border border-white/5">
              <span className="text-[11px] font-bold text-blue-400">{date}</span>
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] text-white/40 font-medium">{dayBatches.length} אירועים</span>
            </div>

            {/* Batches for this date */}
            <div className="space-y-2">
              {dayBatches.map((batch) => {
                const isSingle = batch.alerts.length === 1;
                const isSelected = selectedBatchId === batch.id;
                const timeLabel =
                  batch.startTs === batch.endTs
                    ? formatTime(batch.startTs)
                    : `${formatTime(batch.startTs)} – ${formatTime(batch.endTs)}`;

                return (
                  <button
                    key={batch.id}
                    onClick={() => handleBatchClick(batch)}
                    className={`w-full text-right liquid-glass-subtle rounded-xl p-3 border-r-2 transition-all duration-200 ${
                      isSelected
                        ? "border-blue-400 bg-blue-500/10 ring-1 ring-blue-500/30"
                        : "border-blue-500/20 hover:bg-white/5"
                    }`}
                  >
                    {/* Time + count header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[12px] font-bold tabular-nums ${isSelected ? "text-blue-400" : "text-white/50"}`}>
                        {timeLabel}
                      </span>
                      {!isSingle && (
                        <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                          isSelected ? "bg-blue-500/30 text-blue-300" : "bg-blue-500/20 text-blue-300"
                        }`}>
                          {batch.alerts.length}
                        </span>
                      )}
                    </div>

                    {/* Categories within this batch */}
                    <div className="space-y-1.5">
                      {Array.from(batch.byCategory.entries()).map(([cat, cities]) => {
                        const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG[1];
                        return (
                          <div key={cat}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              <span className={`text-[10px] font-medium ${cfg.color}`}>
                                {cfg.label}
                                {cities.length > 1 && (
                                  <span className="text-white/30 mr-1">({cities.length})</span>
                                )}
                              </span>
                            </div>
                            <p className="text-[12px] text-white/90 font-medium leading-relaxed pr-3">
                              {cities.slice(0, MAX_CITIES_SHOWN).join(", ")}
                              {cities.length > MAX_CITIES_SHOWN && (
                                <span className="text-white/30"> +{cities.length - MAX_CITIES_SHOWN}</span>
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
