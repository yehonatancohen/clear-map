"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { ActiveAlert } from "@/types";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { generateShareImage, buildShareText } from "@/utils/generateShareImage";
import type { MapMode } from "./TimelineModeToggle";

interface IntelPanelProps {
  alerts: ActiveAlert[];
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  mode?: MapMode;
  onModeChange?: (mode: MapMode) => void;
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
  mode = "live",
  onModeChange,
}: IntelPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTelegramInfo, setShowTelegramInfo] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [toasts, setToasts] = useState<(ActiveAlert & { toastId: number })[]>([]);
  const prevAlertIdsRef = useRef<Set<string>>(new Set(alerts.map(a => a.id)));
  const toastIdCounter = useRef(0);

  const { settings, updateSettings, toggleCity, userCoords, permission, requestPermission } = useNotificationSettings();
  usePushSubscription(settings, userCoords);
  const [cityList, setCityList] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);

  const [broadcastUav, setBroadcastUav] = useState(true);
  const [broadcastEllipse, setBroadcastEllipse] = useState(false);

  const handleToggleMainNotifications = async () => {
    const next = !settings.enabled;
    if (next && permission === "default") {
      const result = await requestPermission();
      if (result !== "granted") {
        updateSettings({ enabled: false });
        return;
      }
    }
    updateSettings({ enabled: next });
  };

  useEffect(() => {
    fetch("/data/polygons.json")
      .then(res => res.json())
      .then(data => setCityList(Object.keys(data).sort()))
      .catch(err => console.error("Failed to load cities", err));
  }, []);

  const filteredCityOptions = useMemo(() => {
    if (citySearch.length < 2) return [];
    return cityList
      .filter(city => city.includes(citySearch) && !settings.selectedCities.includes(city))
      .slice(0, 10);
  }, [cityList, citySearch, settings.selectedCities]);

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

  const counts = alerts.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const hasAlerts = alerts.length > 0;
  const sorted = [...alerts].sort((a, b) => b.timestamp - a.timestamp);

  const handleShare = async () => {
    setIsCapturing(true);
    // Close panels so they don't appear in screenshot
    const panelsWereOpen = { about: showAbout, legend: showLegend, intel: isOpen, settings: showSettings };
    setShowAbout(false);
    setShowLegend(false);
    setIsOpen(false);
    setShowSettings(false);

    try {
      // Wait for panels to close
      await new Promise((r) => setTimeout(r, 350));

      const blob = await generateShareImage(alerts);
      const file = new File([blob], "clearmap-status.png", { type: "image/png" });
      const text = buildShareText(alerts);

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        // Fallback: download image + copy text
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "clearmap-status.png";
        a.click();
        URL.revokeObjectURL(a.href);
        await navigator.clipboard.writeText(text);
      }
    } catch (err) {
      console.error("Share failed:", err);
    } finally {
      // Restore panels
      if (panelsWereOpen.about) setShowAbout(true);
      if (panelsWereOpen.legend) setShowLegend(true);
      if (panelsWereOpen.intel) setIsOpen(true);
      if (panelsWereOpen.settings) setShowSettings(true);
      setIsCapturing(false);
    }
  };

  return (
    <>
      {/* ─── Top bar: Logo + controls ─── */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 sm:gap-2 glass-overlay" dir="rtl">
        {/* Logo / About / Settings */}
        <button
          onClick={() => { handleLogoSecretTap(); setShowAbout(!showAbout); setShowLegend(false); setIsOpen(false); setShowSettings(false); }}
          className={`liquid-glass rounded-2xl p-1.5 sm:p-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${showAbout ? 'bg-white/20' : ''}`}
        >
          <img
            src="/logo-dark-theme.png"
            alt="מפה שקופה"
            className="h-8 sm:h-9 w-auto object-contain"
          />
        </button>

        {/* Intel toggle — only shown when there are active alerts */}
        {hasAlerts && (
          <button
            onClick={() => { setIsOpen(!isOpen); setShowAbout(false); setShowLegend(false); setShowSettings(false); }}
            className={`relative liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${isOpen ? 'bg-white/20' : ''}`}
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

        {/* History Toggle */}
        {onModeChange && (
          <button
            onClick={() => { onModeChange(mode === "history" ? "live" : "history"); setShowAbout(false); setIsOpen(false); setShowSettings(false); setShowLegend(false); }}
            className={`liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${mode === "history" ? 'bg-blue-500/30 border border-blue-500/50' : ''}`}
            title="היסטוריית התרעות"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={mode === "history" ? "text-blue-300" : "text-white/70"}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        )}

        {/* Legend */}
        <button
          onClick={() => { setShowLegend(!showLegend); setShowAbout(false); setIsOpen(false); setShowSettings(false); }}
          className={`liquid-glass rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${showLegend ? 'bg-white/20' : ''}`}
          title="מקרא"
        >
          <span className="text-[13px] sm:text-[14px] font-bold text-white tracking-tight">מקרא</span>
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          disabled={isCapturing}
          className={`liquid-glass rounded-2xl p-2 sm:p-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] ${isCapturing ? "opacity-50 pointer-events-none" : ""}`}
          title="שתף מצב נוכחי"
        >
          {isCapturing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70 animate-spin">
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
              <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0-12.814a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0 12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
          )}
        </button>

      </div>

      {/* ─── Legend mini-popup ─── */}
      {showLegend && (
        <div className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-80 glass-overlay max-w-md" dir="rtl">
          <h3 className="text-sm font-bold text-white/90 mb-3 border-b border-white/10 pb-2 text-right">מקרא התרעות</h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF2A2A] shadow-[0_0_8px_rgba(255,42,42,0.8)]" />
              <div className="text-right">
                <div className="text-[13px] font-bold text-white/90">התרעות ירי רקטות וטילים</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">ירי טילים ורקטות לפיקוד העורף. היכנסו למרחב המוגן.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#E040FB] shadow-[0_0_8px_rgba(224,64,251,0.8)]" />
              <div className="text-right">
                <div className="text-[13px] font-bold text-white/90">התרעות חדירת כלי טיס עוין</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5 mb-1">חדירת כלי טיס בלתי מאויש. יש להיכנס מיד למרחב המוגן.</div>
                <div className="text-[10px] text-purple-300 leading-tight"> * המערכת מבצעת בזמן אמת הפיכת נתונים למסלול משוער, חוזה את כיוון הטיסה ומתריעה על מיקומים עתידיים פוטנציאליים טרם הגעת הכלי.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF6A00]" />
              <div className="text-right">
                <div className="text-[13px] font-bold text-white/90">התרעות מוקדמות</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">הנחיה מטעם צה"ל לשהות בסמיכות למרחב מוגן.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#A80000]/50" />
              <div className="text-right">
                <div className="text-[13px] font-bold text-white/90">להישאר בממ"ד</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">יש להישאר בממרחב המוגן עד 10 דקות מקבלת ההתרעה (או עד להודעה אחרת).</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex-shrink-0 h-3 w-3 rounded-full bg-[#FF0055]" />
              <div className="text-right">
                <div className="text-[13px] font-bold text-white/90">חדירת מחבלים</div>
                <div className="text-[11px] text-white/60 leading-tight mt-0.5">חשש לאירוע בטחוני, היכנסו למבנה ונעלו דלתות.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── About & Settings Panel ─── */}
      {showAbout && (
        <div
          className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-96 glass-overlay max-w-sm max-h-[85vh] overflow-y-auto flex flex-col"
          dir="rtl"
        >
          <div className="about-shimmer absolute inset-0 rounded-2xl pointer-events-none" />
          
          {showSettings ? (
            <div className="flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2 flex-shrink-0">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-white/70"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-180">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
                <h3 className="text-base font-bold text-white/90">הגדרות</h3>
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto scrollbar-thin pb-4">
                {/* Visual Settings Section */}
                <div className="space-y-2.5">
                  <div className="text-[11px] font-bold text-white/30 uppercase tracking-wider text-right pr-1">תצוגה</div>
                  
                  {/* Theme Selector */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => { updateSettings({ autoTheme: false }); onThemeChange("light"); }}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${!settings.autoTheme && theme === "light"
                        ? "bg-white/20 text-white border border-white/20"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                        }`}
                    >
                      <span className="text-[12px] font-medium">בוקר</span>
                    </button>
                    <button
                      onClick={() => updateSettings({ autoTheme: !settings.autoTheme })}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${settings.autoTheme
                        ? "bg-amber-500/30 text-amber-200 border border-amber-400/30"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                        }`}
                    >
                      <span className="text-[12px] font-medium">אוטומטי</span>
                    </button>
                    <button
                      onClick={() => { updateSettings({ autoTheme: false }); onThemeChange("dark"); handleDarkSecretTap(); }}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${!settings.autoTheme && theme === "dark"
                        ? "bg-white/20 text-white border border-white/20"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                        }`}
                    >
                      <span className="text-[12px] font-medium">לילה</span>
                    </button>
                  </div>

                  {/* UAV Path Toggle */}
                  <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col text-right">
                      <span className="text-[13px] font-bold text-white">מסלול כטב"ם</span>
                      <span className="text-[10px] text-white/40 leading-tight">הצגת מסלול טיסה משוער וחיזוי</span>
                    </div>
                    <button
                      onClick={() => updateSettings({ showUavPath: !settings.showUavPath })}
                      className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${settings.showUavPath ? 'bg-purple-600' : 'bg-white/10'}`}
                      dir="ltr"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${settings.showUavPath ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Impact Ellipse Toggle */}
                  <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col text-right">
                      <span className="text-[13px] font-bold text-white">אזור פגיעה משוער</span>
                      <span className="text-[10px] text-white/40 leading-tight">הערכת אזור פגיעה אוטומטית לפי מיקומי התרעות</span>
                    </div>
                    <button
                      onClick={() => updateSettings({ showImpactZones: !settings.showImpactZones })}
                      className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${settings.showImpactZones ? 'bg-red-600' : 'bg-white/10'}`}
                      dir="ltr"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${settings.showImpactZones ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* My Location Toggle */}
                  <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col text-right">
                      <span className="text-[13px] font-bold text-white">המיקום שלי</span>
                      <span className="text-[10px] text-white/40 leading-tight">הצגת מיקום נוכחי ומרכוז בעת התרעה באזורך</span>
                    </div>
                    <button
                      onClick={() => updateSettings({ showMyLocation: !settings.showMyLocation })}
                      className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${settings.showMyLocation ? 'bg-blue-600' : 'bg-white/10'}`}
                      dir="ltr"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${settings.showMyLocation ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Fullscreen Toggle */}
                  <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col text-right">
                      <span className="text-[13px] font-bold text-white">מסך מלא</span>
                      <span className="text-[10px] text-white/40 leading-tight">הצגת המפה על פני כל המסך</span>
                    </div>
                    <button
                      onClick={onToggleFullscreen}
                      className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${isFullscreen ? 'bg-blue-600' : 'bg-white/10'}`}
                      dir="ltr"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${isFullscreen ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>


                </div>

                {/* Notifications Section */}
                <div className="space-y-2.5 pt-2">
                  <div className="text-[11px] font-bold text-white/30 uppercase tracking-wider text-right pr-1">התראות</div>
                  
                  {/* Permission Warning */}
                  {permission === "denied" && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 text-right">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 mt-0.5 flex-shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p className="text-[11px] text-red-300 font-medium leading-normal">
                        ההתראות חסומות בדפדפן. יש לאפשר אותן בהגדרות האתר.
                      </p>
                    </div>
                  )}

                  {permission === "default" && settings.enabled && (
                    <button
                      onClick={requestPermission}
                      className="w-full bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-xl p-3 text-[12px] font-bold animate-pulse text-center"
                    >
                      לחץ כאן לאישור התראות בדפדפן
                    </button>
                  )}

                  {/* Main Notification Toggle */}
                  <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex flex-col text-right">
                      <span className="text-[13px] font-bold text-white">התראות דפדפן</span>
                      <span className="text-[10px] text-white/40 leading-tight">קבל התראות גם כשהאפליקציה סגורה</span>
                    </div>
                    <button
                      onClick={handleToggleMainNotifications}
                      className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${settings.enabled ? 'bg-blue-600' : 'bg-white/10'}`}
                      dir="ltr"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${settings.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {settings.enabled && (
                    <>
                      {/* Early Alerts Toggle */}
                      <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex flex-col text-right">
                          <span className="text-[13px] font-bold text-[#FF6A00]">התראות מוקדמות</span>
                          <span className="text-[10px] text-white/40 leading-tight">הנחיות שהייה בסמוך למרחב מוגן</span>
                        </div>
                        <button
                          onClick={() => updateSettings({ earlyAlerts: !settings.earlyAlerts })}
                          className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${settings.earlyAlerts ? 'bg-[#FF6A00]' : 'bg-white/10'}`}
                          dir="ltr"
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${settings.earlyAlerts ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      {/* End of Alert Toggle */}
                      <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex flex-col text-right">
                          <span className="text-[13px] font-bold text-green-400">חזרה לשגרה</span>
                          <span className="text-[10px] text-white/40 leading-tight">התראה כשהזמן המוגדר בממ"ד עבר</span>
                        </div>
                        <button
                          onClick={() => updateSettings({ leaveShelterAlerts: !settings.leaveShelterAlerts })}
                          className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${settings.leaveShelterAlerts ? 'bg-green-600' : 'bg-white/10'}`}
                          dir="ltr"
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${settings.leaveShelterAlerts ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      {/* Geolocation Toggle */}
                      <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex flex-col text-right">
                          <span className="text-[13px] font-bold text-white">מיקום נוכחי</span>
                          <span className="text-[10px] text-white/40 leading-tight">קבל התראות לפי המיקום שלך כעת</span>
                        </div>
                        <button
                          onClick={() => updateSettings({ currentLocation: !settings.currentLocation })}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${settings.currentLocation ? 'bg-green-600' : 'bg-white/10'}`}
                          dir="ltr"
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition duration-200 ease-in-out mt-0.5 ml-0.5 ${settings.currentLocation ? 'translate-x-4.5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {/* All Israel vs Filtered */}
                      <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex flex-col text-right">
                          <span className="text-[13px] font-bold text-white">כל הארץ</span>
                          <span className="text-[10px] text-white/40 leading-tight">קבל התראות מכל רחבי המדינה</span>
                        </div>
                        <button
                          onClick={() => updateSettings({ allIsrael: !settings.allIsrael })}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${settings.allIsrael ? 'bg-purple-600' : 'bg-white/10'}`}
                          dir="ltr"
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition duration-200 ease-in-out mt-0.5 ml-0.5 ${settings.allIsrael ? 'translate-x-4.5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {/* City Selection (shown if All Israel is OFF) */}
                      {!settings.allIsrael && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                          <div className="text-[11px] font-bold text-white/30 uppercase tracking-wider text-right pr-1">אזורי עניין</div>
                          
                          {/* Search Input */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="חיפוש עיר/יישוב..."
                              value={citySearch}
                              onChange={(e) => setCitySearch(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/30"
                            />
                            {filteredCityOptions.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-[10] mt-1 bg-[#1a1c23] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                {filteredCityOptions.map(city => (
                                  <button
                                    key={city}
                                    onClick={() => { toggleCity(city); setCitySearch(""); }}
                                    className="w-full text-right px-3 py-2 text-[12px] text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                                  >
                                    {city}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Selected Cities List */}
                          <div className="flex flex-wrap gap-1.5">
                            {settings.selectedCities.length === 0 && !settings.currentLocation && (
                              <p className="text-[10px] text-white/30 italic pr-1">לא נבחרו אזורים. הוסף עיר או אפשר מיקום.</p>
                            )}
                            {settings.selectedCities.map(city => (
                              <div key={city} className="flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-full pl-1.5 pr-2.5 py-1 transition-all">
                                <span className="text-[11px] font-bold text-white/90">{city}</span>
                                <button 
                                  onClick={() => toggleCity(city)}
                                  className="text-white/40 hover:text-white/90"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              <h3 className="text-base font-bold text-white/90 mb-1.5 flex items-center gap-2 text-right flex-shrink-0">
                מפה שקופה
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/70 font-medium">v1.2</span>
              </h3>
              <div className="mb-4 text-right overflow-y-auto scrollbar-thin">
                <p className="text-[12px] text-white/80 leading-relaxed mb-2">
                  מערכת התרעות ומודיעין מתקדמת בזמן אמת. המערכת משלבת דיווחי פיקוד העורף רשמיים עם מקורות מודיעין גלוי במטרה לספק את תמונת המצב המדויקת והמהירה ביותר.
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-white/50 text-right">
                    פותח באהבה על ידי <strong className="text-white">יהונתן כהן</strong><br />
                    <a href="mailto:yoncohenyon@gmail.com" className="hover:text-white transition-colors underline underline-offset-2">ליצור קשר</a>
                  </p>
                  <a
                    href="https://buymeacoffee.com/yehonatancohen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[10px] font-bold bg-[#FFDD00] text-black px-2 py-1 rounded-md hover:bg-[#FFDD00]/90 transition-colors"
                  >
                    קפה?
                  </a>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-4 flex-shrink-0">
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white transition-all border border-white/10 shadow-lg active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.343 3.94c.09-.542.56-.94 1.114-.94h1.086c.554 0 1.024.398 1.114.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.768.768a1.125 1.125 0 01.12 1.45l-.527.737a1.125 1.125 0 00.108 1.205c.166.396.506.71.93.78l.894.149c.542.09.94.56.94 1.114v1.086c0 .554-.398 1.024-.94 1.114l-.894.149a1.125 1.125 0 00-.93.78c-.164.398-.142.855.108 1.205l.527.738a1.125 1.125 0 01-.12 1.45l-.768.767a1.125 1.125 0 01-1.45.12l-.737-.527a1.125 1.125 0 00-1.205.108c-.396.166-.71.506-.78.93l-.149.894c-.09.542-.56.94-1.114.94h-1.086c-.554 0-1.024-.398-1.114-.94l-.149-.894a1.125 1.125 0 00-.78-.93c-.398-.164-.855-.142-1.205.108l-.738.527a1.125 1.125 0 01-1.45-.12l-.767-.768a1.125 1.125 0 01-.12-1.45l.527-.737a1.125 1.125 0 00-.108-1.205c-.166-.396-.506-.71-.93-.78l-.894-.149a1.125 1.125 0 01-.94-1.114v-1.086c0-.554.398-1.024.94-1.114l.894-.149c.424-.07.764-.384.93-.78.164-.398.142-.855-.108-1.205l-.527-.737a1.125 1.125 0 01.12-1.45l.768-.768a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.205.108.396-.166.71-.506.78-.93l.149-.894z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="text-[13px] font-bold">הגדרות</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-30">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                <button
                  onClick={() => { setShowTelegramInfo(true); setShowAbout(false); }}
                  className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-[#0088cc]/10 hover:bg-[#0088cc]/20 text-[#0088cc] transition-all border border-[#0088cc]/20 shadow-lg active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12l-18 12 4-12-4-12 18 12z" />
                    </svg>
                    <span className="text-[13px] font-bold">ערוצי כתבים וחדשות</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-30">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleShare}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 active:scale-[0.98]"
                  >
                    <span className="text-[12px] font-bold">שתף</span>
                  </button>

                  <a
                    href="https://t.me/clearmapchannel"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all bg-[#0088cc]/20 text-[#0088cc] hover:bg-[#0088cc]/30 border border-[#0088cc]/30 active:scale-[0.98]"
                  >
                    <span className="text-[12px] font-bold">טלגרם</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Telegram & News Explanation Panel ─── */}
      {showTelegramInfo && (
        <div
          className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-96 glass-overlay max-w-sm max-h-[85vh] overflow-y-auto flex flex-col"
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2 flex-shrink-0">
            <h3 className="text-base font-bold text-white/90">ערוצי כתבים וחדשות</h3>
            <button 
              onClick={() => setShowTelegramInfo(false)}
              className="p-1 hover:bg-white/10 rounded-lg text-white/40"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="space-y-6 overflow-y-auto scrollbar-thin pb-2">
            {/* Option 1: Broadcast */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="bg-blue-500/20 p-1.5 rounded-lg text-blue-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 10l5 5-5 5" />
                    <path d="M4 4v7a4 4 0 004 4h12" />
                  </svg>
                </div>
                <h4 className="text-[14px] font-bold text-white">שידור חי (Broadcast)</h4>
              </div>
              <p className="text-[12px] text-white/60 leading-relaxed pr-8">
                קישור ייעודי לשידורים חיים, מותאם להטמעה בתוכנות שידור (OBS) או לתצוגה במסכים.
              </p>
              
              <div className="pr-8 space-y-2">
                <div className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/5">
                  <span className="text-[11px] text-white/80">הצגת מסלול כטב"ם</span>
                  <button
                    onClick={() => setBroadcastUav(!broadcastUav)}
                    dir="ltr"
                    className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors ${broadcastUav ? 'bg-purple-600' : 'bg-white/10'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${broadcastUav ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/5">
                  <span className="text-[11px] text-white/80">הצגת אזור פגיעה</span>
                  <button
                    onClick={() => setBroadcastEllipse(!broadcastEllipse)}
                    dir="ltr"
                    className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors ${broadcastEllipse ? 'bg-red-600' : 'bg-white/10'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${broadcastEllipse ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <div className="pr-8">
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/broadcast?uav=${broadcastUav}&ellipse=${broadcastEllipse}`;
                    navigator.clipboard.writeText(url);
                  }}
                  className="w-full bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-xl py-2 text-[12px] font-bold hover:bg-blue-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  העתק קישור שידור
                </button>
              </div>
            </div>

            {/* Option 2: Telegram Bot */}
            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2">
                <div className="bg-[#0088cc]/20 p-1.5 rounded-lg text-[#0088cc]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 2L2 10l8 4 4 8 7-20z" />
                  </svg>
                </div>
                <h4 className="text-[14px] font-bold text-white">בוט התרעות לערוצים</h4>
              </div>
              <p className="text-[12px] text-white/60 leading-relaxed pr-8">
                ניתן להוסיף את הבוט שלנו <strong className="text-white">@ClearMapBot</strong> לערוץ הטלגרם שלכם לקבלת התרעות אוטומטיות.
              </p>
              
              <div className="pr-8 space-y-2">
                <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="bg-white/10 text-white/70 text-[10px] h-4 w-4 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">1</span>
                    <span className="text-[11px] text-white/80">הוסיפו את <strong className="text-white">@ClearMapBot</strong> כמנהל בערוץ.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-white/10 text-white/70 text-[10px] h-4 w-4 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">2</span>
                    <span className="text-[11px] text-white/80">כתבו בערוץ <code className="bg-white/10 px-1 rounded text-blue-300">/start</code> או <code className="bg-white/10 px-1 rounded text-blue-300">/register</code> להרשמה.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-white/10 text-white/70 text-[10px] h-4 w-4 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">3</span>
                    <span className="text-[11px] text-white/80">לביטול ההרשמה כתבו <code className="bg-white/10 px-1 rounded text-red-300">/stop</code> או <code className="bg-white/10 px-1 rounded text-red-300">/unsubscribe</code>.</span>
                  </div>
                </div>
                
                <a
                  href="https://t.me/ClearMapBot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#0088cc]/20 text-[#0088cc] border border-[#0088cc]/30 rounded-xl py-2 text-[12px] font-bold hover:bg-[#0088cc]/30 transition-all flex items-center justify-center gap-2"
                >
                  מעבר לבוט
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sidebar panel (Updates List) ─── */}
      {isOpen && (
        <div
          className="intel-panel absolute top-14 sm:top-16 bottom-4 right-3 left-3 sm:left-auto z-[1000] flex sm:w-80 flex-col liquid-glass rounded-2xl overflow-hidden glass-overlay"
          dir="rtl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-bold text-white text-right">עדכונים</h2>
              <span className="text-[11px] text-white/50 font-medium">{alerts.length}</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 text-white/40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
            {counts.alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF2A2A] text-right">
                <span className="h-2 w-2 rounded-full bg-[#FF2A2A] status-dot-pulse" />
                {counts.alert} טילים
              </div>
            )}
            {counts.uav && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#E040FB] text-right">
                <span className="h-2 w-2 rounded-full bg-[#E040FB] status-dot-pulse" />
                {counts.uav} כטב"ם
              </div>
            )}
            {counts.pre_alert && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF6A00] text-right">
                <span className="h-2 w-2 rounded-full bg-[#FF6A00]" />
                {counts.pre_alert} מוקדם
              </div>
            )}
          </div>

          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {hasAlerts ? (
              sorted.map((alert) => (
                <AlertItem key={alert.id} alert={alert} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-20">
                <h3 className="text-white text-[14px] font-bold mb-1">אין התרעות פעילות</h3>
                <p className="text-white text-[12px]">כאן יופיעו עדכונים בזמן אמת</p>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-white/5 bg-white/5">
            <button
              onClick={() => { setShowTelegramInfo(true); setIsOpen(false); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0088cc]/20 text-[#0088cc] border border-[#0088cc]/30 hover:bg-[#0088cc]/30 transition-all active:scale-[0.98]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 12l-18 12 4-12-4-12 18 12z" />
              </svg>
              <span className="text-[13px] font-bold">ערוצי כתבים וחדשות</span>
            </button>
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
              <div className="flex flex-col text-right">
                <span className={`font-bold text-[11px] ${config.color} leading-none mb-1 opacity-90`}>{config.label}</span>
                <span className="font-bold text-[14px] text-white leading-none tracking-tight">{t.city_name_he}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Bottom status bar (when panel is closed and there are alerts, hidden in timeline mode) ─── */}
      {!isOpen && hasAlerts && mode === "live" && (
        <div
          className={`absolute bottom-4 right-3 left-3 z-[1000] flex flex-wrap items-center justify-center gap-2 sm:gap-3 liquid-glass rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 glass-overlay`}
          dir="rtl"
        >
          {counts.alert && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF2A2A] text-right">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF2A2A] status-dot-pulse" />
              {counts.alert} התרעות ירי רקטות וטילים
            </div>
          )}
          {counts.uav && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#E040FB] text-right">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#E040FB] status-dot-pulse" />
              {counts.uav} התרעות חדירת כלי טיס עוין
            </div>
          )}
          {counts.terrorist && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF0055] text-right">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF0055] status-dot-pulse" />
              {counts.terrorist} חדירת מחבלים
            </div>
          )}
          {counts.pre_alert && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF6A00] text-right">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#FF6A00]" />
              {counts.pre_alert} התרעות מוקדמות
            </div>
          )}
          {counts.after_alert && (
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#FF2A2A]/70 text-right">
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

            <div className="flex-1 text-right">
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
