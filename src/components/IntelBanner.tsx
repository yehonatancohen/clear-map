"use client";

import { useState } from "react";
import { ActiveAlert } from "@/types";

interface IntelPanelProps {
  alerts: ActiveAlert[];
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  telegram_yellow: {
    label: "מודיעין",
    color: "text-yellow-400",
    dot: "bg-yellow-400",
    bg: "border-yellow-400/20",
  },
  pre_alert: {
    label: "צפי להתרעה",
    color: "text-orange-400",
    dot: "bg-orange-400",
    bg: "border-orange-400/20",
  },
  alert: {
    label: "התרעה",
    color: "text-red-400",
    dot: "bg-red-400",
    bg: "border-red-400/20",
  },
  after_alert: {
    label: "מוגנות",
    color: "text-gray-400",
    dot: "bg-gray-400",
    bg: "border-gray-400/20",
  },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function AlertItem({ alert }: { alert: ActiveAlert }) {
  const config = STATUS_CONFIG[alert.status] || STATUS_CONFIG.alert;
  const isActive = alert.status === "alert" || alert.status === "pre_alert";

  return (
    <div className={`alert-item-enter liquid-glass-subtle rounded-xl p-3 border-r-2 ${config.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${config.dot} ${isActive ? "status-dot-pulse" : ""}`}
          />
          <span className={`text-[11px] font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
        <span className="text-[10px] text-white/50 font-medium tabular-nums">
          {formatTime(alert.timestamp)}
        </span>
      </div>
      <p className="text-[14px] text-white font-bold leading-snug">
        {alert.city_name_he}
      </p>
    </div>
  );
}

export default function IntelPanel({
  alerts,
  onToggleFullscreen,
  isFullscreen,
  theme,
  onThemeChange,
}: IntelPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // Group alerts by status for the summary counts
  const counts = alerts.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const hasAlerts = alerts.length > 0;

  // Sort: alerts first (active → pre → telegram → after), newest first within same status
  const sorted = [...alerts].sort((a, b) => {
    const pri: Record<string, number> = { alert: 0, pre_alert: 1, telegram_yellow: 2, after_alert: 3 };
    const dp = (pri[a.status] ?? 9) - (pri[b.status] ?? 9);
    if (dp !== 0) return dp;
    return b.timestamp - a.timestamp;
  });

  return (
    <>
      {/* ─── Top bar: Logo + controls ─── */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2 glass-overlay" dir="rtl">
        {/* Logo */}
        <button
          onClick={() => setShowAbout(!showAbout)}
          className="liquid-glass rounded-2xl px-4 py-2.5 flex items-center gap-2.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="text-[16px] font-bold text-white tracking-tight">מפה שקופה</span>
          {hasAlerts && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {alerts.length}
            </span>
          )}
        </button>

        {/* Intel toggle */}
        {hasAlerts && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="liquid-glass rounded-2xl p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]"
            title="עדכונים"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
              <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>
        )}

        {/* Fullscreen */}
        <button
          onClick={onToggleFullscreen}
          className="liquid-glass rounded-2xl p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]"
          title={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
              <path d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4m-7 11l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
              <path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
      </div>

      {/* ─── About mini-popup ─── */}
      {showAbout && (
        <div
          className="absolute top-16 right-3 z-[1001] liquid-glass rounded-2xl p-5 w-64 glass-overlay"
          dir="rtl"
        >
          <div className="about-shimmer absolute inset-0 rounded-2xl pointer-events-none" />
          <h3 className="text-base font-bold text-white/90 mb-1.5">מפה שקופה</h3>
          <p className="text-[11px] text-white/50 leading-relaxed mb-3">
            מערכת מודיעין ויזואלית בזמן אמת.
            <br />
            מציגה התרעות פיקוד העורף, מודיעין טלגרם ומצב מוגנות.
          </p>
          <div className="flex items-center gap-3 text-[10px] text-white/30 mb-4">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              פעיל
            </div>
            <span>v1.0</span>
          </div>

          {/* Theme Toggle */}
          <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">ערכת נושא</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onThemeChange("light")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 transition-all ${theme === "light"
                  ? "bg-white/20 text-white border border-white/20"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
                  }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                <span className="text-[12px] font-medium">בוקר</span>
              </button>
              <button
                onClick={() => onThemeChange("dark")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 transition-all ${theme === "dark"
                  ? "bg-white/20 text-white border border-white/20"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
                  }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="text-[12px] font-medium">לילה</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sidebar panel ─── */}
      {isOpen && hasAlerts && (
        <div
          className="intel-panel absolute top-16 bottom-4 right-3 z-[1000] flex w-72 flex-col liquid-glass rounded-2xl overflow-hidden glass-overlay"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-bold text-white">עדכונים</h2>
              <span className="text-[11px] text-white/50 font-medium">{alerts.length}</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Status summary bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
            {counts.alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-400 status-dot-pulse" />
                {counts.alert} התרעות
              </div>
            )}
            {counts.pre_alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-orange-400">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                {counts.pre_alert} צפי
              </div>
            )}
            {counts.after_alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-gray-300">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                {counts.after_alert} מוגנות
              </div>
            )}
            {counts.telegram_yellow && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-yellow-400">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                {counts.telegram_yellow} מודיעין
              </div>
            )}
          </div>

          {/* Alert list */}
          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {sorted.map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Bottom status bar (when panel is closed and there are alerts) ─── */}
      {!isOpen && hasAlerts && (
        <div
          className="absolute bottom-4 right-3 left-3 z-[1000] flex items-center justify-center gap-4 liquid-glass rounded-2xl px-4 py-2.5 glass-overlay"
          dir="rtl"
        >
          {counts.alert && (
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-red-400">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400 status-dot-pulse" />
              {counts.alert} התרעות פעילות
            </div>
          )}
          {counts.pre_alert && (
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-orange-400">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
              {counts.pre_alert} צפי התרעה
            </div>
          )}
          {counts.after_alert && (
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-gray-300">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
              {counts.after_alert} מוגנות
            </div>
          )}
          {counts.telegram_yellow && (
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-yellow-400">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              {counts.telegram_yellow} מודיעין
            </div>
          )}
        </div>
      )}
    </>
  );
}
