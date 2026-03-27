"use client";

import { useEffect, useRef, useState } from "react";
import type { SortedAlert, AlertBatch } from "@/hooks/useTimelineHistory";

interface HistoryPanelProps {
  batches: AlertBatch[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string | null, alerts: SortedAlert[]) => void;
  onClose: () => void;
}

const CATEGORY_CONFIG: Record<string | number, { label: string; color: string; dot: string }> = {
  1: { label: "רקטות וטילים", color: "text-[#FF2A2A]", dot: "bg-[#FF2A2A]" },
  2: { label: 'כטב"ם', color: "text-[#E040FB]", dot: "bg-[#E040FB]" },
  3: { label: "חדירת מחבלים", color: "text-[#FF0055]", dot: "bg-[#FF0055]" },
  "pre_alert": { label: "התרעה מוקדמת", color: "text-amber-400", dot: "bg-amber-400" },
  "clear": { label: "האירוע הסתיים - ניתן לצאת", color: "text-emerald-400", dot: "bg-emerald-400" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

const MAX_CITIES_SHOWN = 12;

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
  hasMore,
  onLoadMore,
  selectedBatchId,
  onSelectBatch,
  onClose,
}: HistoryPanelProps) {
  const grouped = groupBatchesByDate(batches);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const touchStartY = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 40) setIsCollapsed(true);
    else if (delta < -40) setIsCollapsed(false);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  const handleBatchClick = (batch: AlertBatch) => {
    if (selectedBatchId === batch.id) {
      onSelectBatch(null, []);
    } else {
      onSelectBatch(batch.id, batch.alerts);
    }
  };

  return (
    <div
      className="absolute bottom-0 sm:top-16 sm:bottom-4 right-0 sm:right-3 left-0 sm:left-auto z-[1000] flex sm:w-80 flex-col h-[55vh] sm:h-auto liquid-glass rounded-t-3xl sm:rounded-3xl overflow-hidden glass-overlay transition-transform duration-300 ease-out sm:transform-none"
      style={{ transform: isCollapsed ? 'translateY(calc(55vh - 80px))' : 'translateY(0)' }}
      dir="rtl"
    >
      {/* Drag handle + Header */}
      <div
        className="flex flex-col items-center px-5 pt-2.5 pb-4 border-b border-white/5 sm:cursor-default touch-none select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Pill — mobile only */}
        <div className="w-8 h-1 rounded-full bg-white/20 mb-3 sm:hidden" />
        <div className="flex items-center justify-between w-full">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
              <path d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <h2 className="text-[16px] font-bold text-white text-right">היסטוריית אירועים</h2>
          </div>
          <span className="text-[11px] text-white/40 font-medium">
            מציג {batches.length} אירועים אחרונים
          </span>
        </div>
        <div className="flex gap-2">
            <button
                onClick={onLoadMore}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-50"
                title="רענן"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={loading ? "animate-spin" : ""}>
                    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
            </button>
            <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
            >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            </button>
        </div>
        </div>
      </div>

      {/* Batched alert list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {batches.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-20">
            <h3 className="text-white text-[14px] font-bold mb-1">אין התרעות</h3>
            <p className="text-white text-[12px]">לא נמצאו התרעות אחרונות</p>
          </div>
        )}

        {Array.from(grouped.entries()).map(([date, dayBatches]) => (
          <div key={date} className="space-y-2.5">
            {/* Date header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 py-2 px-3 rounded-xl bg-zinc-900/90 backdrop-blur-md border border-white/5 shadow-lg">
              <span className="text-[11px] font-bold text-blue-400">{date}</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Batches for this date */}
            <div className="space-y-2.5">
              {dayBatches.map((batch) => {
                const isSelected = selectedBatchId === batch.id;
                const timeLabel = formatTime(batch.startTs);
                const batchStatus = batch.alerts[0]?.status || "";
                const isClear = batchStatus === "clear";
                const isPre = batchStatus === "pre_alert";

                return (
                  <button
                    key={batch.id}
                    onClick={() => handleBatchClick(batch)}
                    className={`w-full text-right liquid-glass-subtle rounded-[20px] p-4 border-r-4 transition-all duration-300 ${
                      isSelected
                        ? "border-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20"
                        : isClear 
                          ? "border-emerald-500/40 hover:bg-emerald-500/5"
                          : isPre
                            ? "border-amber-500/40 hover:bg-amber-500/5"
                            : "border-white/5 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <span className={`text-[12px] font-bold tabular-nums ${isSelected ? "text-blue-400" : "text-white/40"}`}>
                        {timeLabel}
                      </span>
                      {batch.alerts.length > 1 && !isClear && (
                        <span className="bg-white/5 text-white/40 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-white/5">
                          {batch.alerts.length} ערים
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {Array.from(batch.byCategory.entries()).map(([cat, cities]) => {
                        const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG[1];
                        return (
                          <div key={cat}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} shadow-[0_0_8px] shadow-current`} />
                              <span className={`text-[12px] font-bold ${cfg.color}`}>
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-[14px] text-white/90 font-medium leading-relaxed pr-3.5">
                              {cities.slice(0, MAX_CITIES_SHOWN).join(", ")}
                              {cities.length > MAX_CITIES_SHOWN && (
                                <span className="text-white/30 text-[11px] font-normal"> + עוד {cities.length - MAX_CITIES_SHOWN}</span>
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

        {/* Sentinel for infinite scroll (even if hasMore is false, it's good for padding) */}
        <div ref={observerTarget} className="h-10 flex items-center justify-center">
          {loading && (
            <div className="flex gap-2">
              <div className="w-1.5 h-1.5 bg-blue-500/40 rounded-full animate-bounce [animation-duration:0.8s]" />
              <div className="w-1.5 h-1.5 bg-blue-500/40 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-blue-500/40 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
