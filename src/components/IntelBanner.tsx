"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ActiveAlert } from "@/types";

interface IntelPanelProps {
  alerts: ActiveAlert[];
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  pre_alert: {
    label: "התרעות מוקדמות",
    color: "text-[#FF6A00]",
    dot: "bg-[#FF6A00]",
    bg: "border-[#FF6A00]/20",
  },
  alert: {
    label: "התרעות ירי רקטות וטילים",
    color: "text-[#FF2A2A]",
    dot: "bg-[#FF2A2A]",
    bg: "border-[#FF2A2A]/20",
  },
  uav: {
    label: "התרעות חדירת כלי טיס עוין",
    color: "text-[#E040FB]",
    dot: "bg-[#E040FB]",
    bg: "border-[#E040FB]/20",
  },
  terrorist: {
    label: "חדירת מחבלים",
    color: "text-[#FF0055]",
    dot: "bg-[#FF0055]",
    bg: "border-[#FF0055]/20",
  },
  after_alert: {
    label: "להישאר בממ\"ד",
    color: "text-[#FF2A2A]/70",
    dot: "bg-[#FF2A2A]/50",
    bg: "border-[#FF2A2A]/10",
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
  const [showLegend, setShowLegend] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [toasts, setToasts] = useState<(ActiveAlert & { toastId: number })[]>([]);
  const prevAlertIdsRef = useRef<Set<string>>(new Set(alerts.map(a => a.id)));
  const toastIdCounter = useRef(0);

  // ── Secret troll mode ──
  const [trollEnabled, setTrollEnabled] = useState(false);
  const [trollPlaying, setTrollPlaying] = useState(false);

  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<NodeJS.Timeout | null>(null);
  const darkClickCount = useRef(0);
  const darkClickTimer = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleLogoSecretTap = useCallback(() => {
    logoClickCount.current++;
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
    logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0; }, 1500);
    if (logoClickCount.current >= 5) {
      logoClickCount.current = 0;
      setTrollEnabled(prev => {
        const next = !prev;
        if (!next && trollPlaying) setTrollPlaying(false);
        return next;
      });
    }
  }, [trollPlaying]);

  const handleDarkSecretTap = useCallback(() => {
    if (!trollEnabled) return;
    darkClickCount.current++;
    if (darkClickTimer.current) clearTimeout(darkClickTimer.current);
    darkClickTimer.current = setTimeout(() => { darkClickCount.current = 0; }, 1500);
    if (darkClickCount.current >= 5) {
      darkClickCount.current = 0;
      setTrollPlaying(true);
    }
  }, [trollEnabled]);

  // Watch for Binyamina pre_alert
  useEffect(() => {
    if (!trollEnabled || trollPlaying) return;
    const hasBinyaminaPreAlert = alerts.some(
      a => a.status === "pre_alert" && /בנימינה/i.test(a.city_name_he)
    );
    if (hasBinyaminaPreAlert) setTrollPlaying(true);
  }, [alerts, trollEnabled, trollPlaying]);

  // Auto-play video with sound when trollPlaying changes
  useEffect(() => {
    if (trollPlaying && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.volume = 1;
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => { });
    }
  }, [trollPlaying]);

  // Auto-hide disclaimer after 30 seconds
  useEffect(() => {
    if (showDisclaimer) {
      const timer = setTimeout(() => setShowDisclaimer(false), 30000);
      return () => clearTimeout(timer);
    }
  }, [showDisclaimer]);

  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    const newAlerts: ActiveAlert[] = [];

    for (const a of alerts) {
      if (
        ["alert", "uav", "terrorist"].includes(a.status) &&
        !prevAlertIdsRef.current.has(a.id)
      ) {
        newAlerts.push(a);
      }
    }

    prevAlertIdsRef.current = currentIds;

    if (newAlerts.length > 0) {
      const addedToasts = newAlerts.map(a => ({ ...a, toastId: ++toastIdCounter.current }));
      setToasts(prev => [...prev, ...addedToasts].slice(-5));

      addedToasts.forEach((t) => {
        setTimeout(() => {
          setToasts((prev) => prev.filter(p => p.toastId !== t.toastId));
        }, 5000);
      });
    }
  }, [alerts]);

  // Group alerts by status for the summary counts
  const counts = alerts.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const hasAlerts = alerts.length > 0;

  // Sort: always newest first
  const sorted = [...alerts].sort((a, b) => b.timestamp - a.timestamp);

  const handleShare = async () => {
    const url = window.location.origin;
    const title = "מפה שקופה - מערכת התרעות ומודיעין";
    const text = "הצטרפו כדי לצפות בהתרעות ובמודיעין בזמן אמת.";

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        console.log("Error sharing", err);
      }
    } else {
      navigator.clipboard.writeText(url);
      alert("הקישור הועתק ללוח!");
    }
  };

  return (
    <>
      {/* ─── Top bar: Logo + controls ─── */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 sm:gap-2 glass-overlay" dir="rtl">
        {/* Logo / About */}
        <button
          onClick={() => { handleLogoSecretTap(); setShowAbout(!showAbout); setShowLegend(false); setIsOpen(false); }}
          className={`liquid-glass rounded-2xl p-1.5 sm:p-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          <img
            src={theme === "dark" ? "/logo-dark-theme.png" : "/logo-light-theme.png"}
            alt="מפה שקופה"
            className="h-8 sm:h-9 w-auto object-contain"
          />
        </button>

        {/* Intel toggle */}
        {hasAlerts && (
          <button
            onClick={() => { setIsOpen(!isOpen); setShowAbout(false); setShowLegend(false); }}
            className={`relative liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]`}
            title="עדכונים"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
              <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-md">
              {alerts.length}
            </span>
          </button>
        )}

        {/* Legend */}
        <button
          onClick={() => { setShowLegend(!showLegend); setShowAbout(false); setIsOpen(false); }}
          className={`liquid-glass rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${showLegend ? 'bg-white/20' : ''}`}
          title="מקרא"
        >
          <span className="text-[13px] sm:text-[14px] font-bold text-white tracking-tight">מקרא</span>
        </button>



        {/* Fullscreen */}
        <button
          onClick={onToggleFullscreen}
          className={`liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]`}
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

      {/* ─── Legend mini-popup ─── */}
      {showLegend && (
        <div className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-80 glass-overlay max-w-md" dir="rtl">
          <h3 className="text-sm font-bold text-white/90 mb-3 border-b border-white/10 pb-2">מקרא התרעות</h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF2A2A] shadow-[0_0_8px_rgba(255,42,42,0.8)]" />
              <div>
                <div className="text-[13px] font-bold text-white/90">התרעות ירי רקטות וטילים</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">ירי טילים ורקטות לפיקוד העורף. היכנסו למרחב המוגן.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#E040FB] shadow-[0_0_8px_rgba(224,64,251,0.8)]" />
              <div>
                <div className="text-[13px] font-bold text-white/90">התרעות חדירת כלי טיס עוין</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5 mb-1">חדירת כלי טיס בלתי מאויש. יש להיכנס מיד למרחב המוגן.</div>
                <div className="text-[10px] text-purple-300 leading-tight"> * המערכת מבצעת בזמן אמת הפיכת נתונים למסלול משוער, חוזה את כיוון הטיסה ומתריעה על מיקומים עתידיים פוטנציאליים טרם הגעת הכלי.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF6A00]" />
              <div>
                <div className="text-[13px] font-bold text-white/90">התרעות מוקדמות</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">הנחיה מטעם צה"ל לשהות בסמיכות למרחב מוגן.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF2A2A]/50" />
              <div>
                <div className="text-[13px] font-bold text-white/90">להישאר בממ"ד</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">יש להישאר במרחב המוגן עד 10 דקות מקבלת ההתרעה (או עד להודעה אחרת).</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF0055]" />
              <div>
                <div className="text-[13px] font-bold text-white/90">חדירת מחבלים</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">חשש לאירוע בטחוני, היכנסו למבנה ונעלו דלתות.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── About mini-popup ─── */}
      {showAbout && (
        <div
          className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-72 glass-overlay max-w-sm"
          dir="rtl"
        >
          <div className="about-shimmer absolute inset-0 rounded-2xl pointer-events-none" />
          <h3 className="text-base font-bold text-white/90 mb-1.5 flex items-center gap-2">
            מפה שקופה
            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/70 font-medium">v1.1</span>
          </h3>
          <div className="mb-4">
            <p className="text-[12px] text-white/80 leading-relaxed mb-2">
              מערכת התרעות ומודיעין מתקדמת בזמן אמת. המערכת משלבת דיווחי פיקוד העורף רשמיים עם מקורות מודיעין גלוי במטרה לספק את תמונת המצב המדויקת והמהירה ביותר.
            </p>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-white/50">
                פותח באהבה על ידי <strong className="text-white">יהונתן כהן</strong><br />
                <a href="mailto:yoncohenyon@gmail.com" className="hover:text-white transition-colors underline underline-offset-2">ליצור קשר</a>
              </p>
              <a
                href="https://buymeacoffee.com/yehonatancohen"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] font-bold bg-[#FFDD00] text-black px-2 py-1 rounded-md hover:bg-[#FFDD00]/90 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                  <line x1="6" y1="1" x2="6" y2="4"></line>
                  <line x1="10" y1="1" x2="10" y2="4"></line>
                  <line x1="14" y1="1" x2="14" y2="4"></line>
                </svg>
                קפה?
              </a>
            </div>
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
                onClick={() => { onThemeChange("dark"); handleDarkSecretTap(); }}
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

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={handleShare}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 active:scale-[0.98]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                <span className="text-[12px] font-bold">שתף קישור</span>
              </button>

              <a
                href="https://t.me/clearmapchannel"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all bg-[#0088cc]/20 text-[#0088cc] hover:bg-[#0088cc]/30 border border-[#0088cc]/30 active:scale-[0.98]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.11.03-1.84 1.18-5.2 3.45-.49.34-.94.5-1.35.49-.45-.01-1.3-.25-1.94-.46-.78-.26-1.4-.4-1.35-.85.03-.23.36-.47 1-.72 3.92-1.7 6.54-2.83 7.84-3.37 3.73-1.55 4.51-1.82 5.02-1.83.11 0 .36.03.5.14.11.08.14.2.15.28 0 .04.01.12.01.2z" />
                </svg>
                <span className="text-[12px] font-bold">ערוץ טלגרם</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sidebar panel ─── */}
      {isOpen && hasAlerts && (
        <div
          className="intel-panel absolute top-14 sm:top-16 bottom-4 right-3 left-3 sm:left-auto z-[1000] flex sm:w-72 flex-col liquid-glass rounded-2xl overflow-hidden glass-overlay"
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
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF2A2A]">
                <span className="h-2 w-2 rounded-full bg-[#FF2A2A] status-dot-pulse" />
                {counts.alert} התרעות טילים
              </div>
            )}
            {counts.uav && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#E040FB]">
                <span className="h-2 w-2 rounded-full bg-[#E040FB] status-dot-pulse" />
                {counts.uav} התרעות כלי טיס
              </div>
            )}
            {counts.terrorist && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF0055]">
                <span className="h-2 w-2 rounded-full bg-[#FF0055] status-dot-pulse" />
                {counts.terrorist} חדירת מחבלים
              </div>
            )}
            {counts.pre_alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF6A00]">
                <span className="h-2 w-2 rounded-full bg-[#FF6A00]" />
                {counts.pre_alert} התרעות מוקדמות
              </div>
            )}
            {counts.after_alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF2A2A]/70">
                <span className="h-2 w-2 rounded-full bg-[#FF2A2A]/50" />
                {counts.after_alert} להישאר בממ"ד
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

      {/* ─── Toast Notifications (New Alerts) ─── */}
      <div className={`absolute bottom-16 sm:bottom-20 right-3 left-3 flex flex-col items-center gap-2 pointer-events-none z-[1002]`} dir="rtl">
        {toasts.map((t) => {
          const config = STATUS_CONFIG[t.status] || STATUS_CONFIG.alert;
          return (
            <div key={t.toastId} className={`toast-enter flex items-center gap-3 px-4 py-2.5 rounded-xl liquid-glass border ${config.bg} shadow-xl pointer-events-auto`}>
              <span className={`h-2.5 w-2.5 rounded-full ${config.dot} status-dot-pulse`} />
              <div className="flex flex-col">
                <span className={`font-bold text-[11px] ${config.color} leading-none mb-1 opacity-90`}>{config.label}</span>
                <span className="font-bold text-[14px] text-white leading-none tracking-tight">{t.city_name_he}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Bottom status bar (when panel is closed and there are alerts) ─── */}
      {!isOpen && hasAlerts && (
        <div
          className={`absolute bottom-4 right-3 left-3 z-[1000] flex flex-wrap items-center justify-center gap-2 sm:gap-3 liquid-glass rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 glass-overlay`}
          dir="rtl"
        >
          {counts.alert && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF2A2A]">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF2A2A] status-dot-pulse" />
              {counts.alert} התרעות ירי רקטות וטילים
            </div>
          )}
          {counts.uav && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#E040FB]">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#E040FB] status-dot-pulse" />
              {counts.uav} התרעות חדירת כלי טיס עוין
            </div>
          )}
          {counts.terrorist && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF0055]">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF0055] status-dot-pulse" />
              {counts.terrorist} חדירת מחבלים
            </div>
          )}
          {counts.pre_alert && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF6A00]">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF6A00]" />
              {counts.pre_alert} התרעות מוקדמות
            </div>
          )}
          {counts.after_alert && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF2A2A]/70">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF2A2A]/50" />
              {counts.after_alert} להישאר בממ"ד
            </div>
          )}

        </div>
      )}

      {/* ─── Disclaimer Top Banner ─── */}
      {showDisclaimer && (
        <div className="absolute top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[500px] z-[2000] pointer-events-none" dir="rtl">
          <div className="liquid-glass border border-red-500/30 rounded-xl p-4 shadow-xl shadow-red-500/10 pointer-events-auto flex items-start gap-4">
            <div className="bg-red-500/20 p-2 rounded-full flex-shrink-0 mt-0.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <div className="flex-1">
              <h2 className="text-[14px] sm:text-[15px] font-bold text-white tracking-tight mb-1">
                אזהרת שימוש במערכת
              </h2>
              <p className="text-[12px] sm:text-[13px] leading-snug text-white/80 font-medium">
                המערכת אינה מהווה תחליף לצופרי פיקוד העורף. המידע (ובייחוד אזעקות המודיעין) עשוי להיות שגוי. השימוש באחריות המשתמש בלבד.
              </p>
            </div>

            <button
              onClick={() => setShowDisclaimer(false)}
              className="flex-shrink-0 text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-lg active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* ─── Secret troll video overlay ─── */}
      {trollPlaying && (
        <div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-pointer"
          onClick={() => setTrollPlaying(false)}
        >
          <video
            ref={videoRef}
            src="/pre_alert_troll.mp4"
            className="w-full h-full object-contain"
            autoPlay
            playsInline
            onEnded={() => setTrollPlaying(false)}
          />
        </div>
      )}
    </>
  );
}
