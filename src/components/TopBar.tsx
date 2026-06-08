"use client";

import type { MapMode } from "./TimelineModeToggle";

interface TopBarProps {
  alertCount: number;
  isOpen: boolean;
  onToggleIntel: () => void;
  showAbout: boolean;
  onToggleAbout: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  mode: MapMode;
  onModeChange?: (m: MapMode) => void;
  isCapturing: boolean;
  onShare: () => void;
  onLogoSecretTap: () => void;
}

export function TopBar({
  alertCount, isOpen, onToggleIntel,
  showAbout, onToggleAbout,
  showLegend, onToggleLegend,
  mode, onModeChange,
  isCapturing, onShare,
  onLogoSecretTap,
}: TopBarProps) {
  return (
    <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 sm:gap-2 glass-overlay" dir="rtl">
      {/* Logo / About */}
      <button
        onClick={() => { onLogoSecretTap(); onToggleAbout(); }}
        className={`liquid-glass rounded-2xl p-1.5 sm:p-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${showAbout ? "bg-white/20" : ""}`}
      >
        <img src="/logo-dark-theme.png" alt="מפה שקופה" className="h-8 sm:h-9 w-auto object-contain" />
      </button>

      {/* Intel toggle — only when there are active alerts */}
      {alertCount > 0 && (
        <button
          onClick={onToggleIntel}
          className={`relative liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${isOpen ? "bg-white/20" : ""}`}
          title="עדכונים"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
            <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-md">
            {alertCount}
          </span>
        </button>
      )}

      {/* History toggle */}
      {onModeChange && (
        <button
          onClick={() => onModeChange(mode === "history" ? "live" : "history")}
          className={`liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${mode === "history" ? "bg-blue-500/30 border border-blue-500/50" : ""}`}
          title="היסטוריית התרעות"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={mode === "history" ? "text-blue-300" : "text-white/70"}>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
          </svg>
        </button>
      )}

      {/* Legend */}
      <button
        onClick={onToggleLegend}
        className={`liquid-glass rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${showLegend ? "bg-white/20" : ""}`}
        title="מקרא"
      >
        <span className="text-[13px] sm:text-[14px] font-bold text-white tracking-tight">מקרא</span>
      </button>

      {/* Support */}
      <a
        href="https://buymeacoffee.com/yehonatancohen"
        target="_blank" rel="noopener noreferrer"
        className="liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] bg-amber-500/10 border border-amber-500/20"
        title="תמיכה בפרויקט"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </a>

      {/* Share */}
      <button
        onClick={onShare}
        disabled={isCapturing}
        className={`liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${isCapturing ? "opacity-50 pointer-events-none" : ""}`}
        title="שתף מצב נוכחי"
      >
        {isCapturing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70 animate-spin">
            <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>
          </svg>
        )}
      </button>
    </div>
  );
}
