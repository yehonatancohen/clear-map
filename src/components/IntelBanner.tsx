"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ActiveAlert } from "@/types";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { generateShareImage, buildShareText } from "@/utils/generateShareImage";
import type { MapMode } from "./TimelineModeToggle";

import { TopBar } from "./TopBar";
import { LegendPanel } from "./LegendPanel";
import { AboutPanel } from "./AboutPanel";
import { TelegramPanel } from "./TelegramPanel";
import { AlertsPanel } from "./AlertsPanel";
import { StatusBar } from "./StatusBar";
import { ToastContainer } from "./ToastContainer";
import { PwaInstallModal } from "./PwaInstallModal";

interface IntelPanelProps {
  alerts: ActiveAlert[];
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  mode?: MapMode;
  onModeChange?: (mode: MapMode) => void;
  cityList?: string[];
}

export default function IntelPanel({
  alerts,
  onToggleFullscreen,
  isFullscreen,
  theme,
  onThemeChange,
  mode = "live",
  onModeChange,
  cityList: cityListProp,
}: IntelPanelProps) {
  // ── Panel visibility ──────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [aboutView, setAboutView] = useState<"about" | "settings">("about");
  const [showLegend, setShowLegend] = useState(false);
  const [showTelegramInfo, setShowTelegramInfo] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [showInstallTutorial, setShowInstallTutorial] = useState(false);
  const [, setTick] = useState(0);

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-hide disclaimer
  useEffect(() => {
    if (!showDisclaimer) return;
    const t = setTimeout(() => setShowDisclaimer(false), 30_000);
    return () => clearTimeout(t);
  }, [showDisclaimer]);

  // ── PWA ───────────────────────────────────────────────────────────────────
  const [isIosPwa, setIsIosPwa] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const deferredInstallPromptRef = useRef<any>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    setIsStandalonePwa(standalone);
    setIsIosPwa(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const handler = (e: Event) => { e.preventDefault(); deferredInstallPromptRef.current = e; };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handlePwaInstall() {
    if (!deferredInstallPromptRef.current) return;
    deferredInstallPromptRef.current.prompt();
    const { outcome } = await deferredInstallPromptRef.current.userChoice;
    if (outcome === "accepted") { deferredInstallPromptRef.current = null; setShowInstallTutorial(false); }
  }

  // ── Settings / notifications ──────────────────────────────────────────────
  const { settings, updateSettings, toggleCity, userCoords, permission, requestPermission } = useNotificationSettings();
  usePushSubscription(settings, userCoords);
  const [cityList, setCityList] = useState<string[]>(cityListProp ?? []);
  const [citySearch, setCitySearch] = useState("");

  useEffect(() => {
    if (cityListProp && cityListProp.length > 0) setCityList(cityListProp);
  }, [cityListProp]);

  // ── Share ─────────────────────────────────────────────────────────────────
  const [isCapturing, setIsCapturing] = useState(false);

  const handleShare = async () => {
    setIsCapturing(true);
    const wasOpen = isOpen; setIsOpen(false);
    const wasAbout = showAbout; setShowAbout(false);
    const wasLegend = showLegend; setShowLegend(false);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const blob = await generateShareImage(alerts, theme);
      const file = new File([blob], "clearmap-status.png", { type: "image/png" });
      const text = buildShareText(alerts);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
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
      if (wasOpen) setIsOpen(true);
      if (wasAbout) setShowAbout(true);
      if (wasLegend) setShowLegend(true);
      setIsCapturing(false);
    }
  };

  // ── Toast notifications ───────────────────────────────────────────────────
  const [toasts, setToasts] = useState<(ActiveAlert & { toastId: number })[]>([]);
  const prevAlertIdsRef = useRef<Set<string>>(new Set(alerts.map((a) => a.id)));
  const toastIdCounter = useRef(0);

  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    const newAlerts = alerts.filter(
      (a) => ["alert", "uav", "terrorist"].includes(a.status) && !prevAlertIdsRef.current.has(a.id)
    );
    prevAlertIdsRef.current = currentIds;
    if (newAlerts.length === 0) return;
    const added = newAlerts.map((a) => ({ ...a, toastId: ++toastIdCounter.current }));
    setToasts((prev) => [...prev, ...added].slice(-5));
    added.forEach((t) => setTimeout(() => setToasts((prev) => prev.filter((p) => p.toastId !== t.toastId)), 5000));
  }, [alerts]);

  // ── Broadcast ────────────────────────────────────────────────────────────
  const [broadcastUav, setBroadcastUav] = useState(true);
  const [broadcastEllipse, setBroadcastEllipse] = useState(false);

  // ── Secret troll mode ─────────────────────────────────────────────────────
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
      setTrollEnabled((prev) => { const n = !prev; if (!n && trollPlaying) setTrollPlaying(false); return n; });
    }
  }, [trollPlaying]);

  const handleDarkSecretTap = useCallback(() => {
    if (!trollEnabled) return;
    darkClickCount.current++;
    if (darkClickTimer.current) clearTimeout(darkClickTimer.current);
    darkClickTimer.current = setTimeout(() => { darkClickCount.current = 0; }, 1500);
    if (darkClickCount.current >= 5) { darkClickCount.current = 0; setTrollPlaying(true); }
  }, [trollEnabled]);

  useEffect(() => {
    if (!trollEnabled || trollPlaying) return;
    if (alerts.some((a) => a.status === "pre_alert" && /בנימינה/i.test(a.city_name_he))) setTrollPlaying(true);
  }, [alerts, trollEnabled, trollPlaying]);

  useEffect(() => {
    if (trollPlaying && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.volume = 1;
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
  }, [trollPlaying]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const counts = alerts.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const hasAlerts = alerts.length > 0;

  function closeAll() { setIsOpen(false); setShowAbout(false); setShowLegend(false); setShowTelegramInfo(false); }

  return (
    <>
      <TopBar
        alertCount={alerts.length}
        isOpen={isOpen}
        onToggleIntel={() => { setIsOpen(!isOpen); setShowAbout(false); setShowLegend(false); setShowTelegramInfo(false); }}
        showAbout={showAbout}
        onToggleAbout={() => { setShowAbout(!showAbout); setIsOpen(false); setShowLegend(false); setShowTelegramInfo(false); setAboutView("about"); }}
        showLegend={showLegend}
        onToggleLegend={() => { setShowLegend(!showLegend); setShowAbout(false); setIsOpen(false); setShowTelegramInfo(false); }}
        mode={mode}
        onModeChange={onModeChange}
        isCapturing={isCapturing}
        onShare={handleShare}
        onLogoSecretTap={handleLogoSecretTap}
      />

      {showLegend && <LegendPanel onClose={() => setShowLegend(false)} />}

      {showAbout && (
        <AboutPanel
          view={aboutView}
          onViewChange={setAboutView}
          onClose={() => setShowAbout(false)}
          isStandalonePwa={isStandalonePwa}
          isCapturing={isCapturing}
          onShare={handleShare}
          onTelegramInfo={() => { setShowTelegramInfo(true); setShowAbout(false); }}
          onInstallTutorial={() => { setShowInstallTutorial(true); setShowAbout(false); }}
          settings={settings}
          updateSettings={updateSettings}
          toggleCity={toggleCity}
          permission={permission}
          requestPermission={requestPermission}
          onThemeChange={onThemeChange}
          onToggleFullscreen={onToggleFullscreen}
          isFullscreen={isFullscreen}
          cityList={cityList}
          citySearch={citySearch}
          setCitySearch={setCitySearch}
          handleDarkSecretTap={handleDarkSecretTap}
        />
      )}

      {showTelegramInfo && (
        <TelegramPanel
          broadcastUav={broadcastUav}
          setBroadcastUav={setBroadcastUav}
          broadcastEllipse={broadcastEllipse}
          setBroadcastEllipse={setBroadcastEllipse}
          onClose={() => setShowTelegramInfo(false)}
        />
      )}

      {isOpen && (
        <AlertsPanel alerts={alerts} counts={counts} onClose={() => setIsOpen(false)} />
      )}

      <ToastContainer toasts={toasts} />

      {!isOpen && hasAlerts && mode === "live" && (
        <StatusBar counts={counts} onClick={() => { closeAll(); setIsOpen(true); }} />
      )}

      {/* Disclaimer */}
      {showDisclaimer && (
        <div className="absolute top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] z-[2000] pointer-events-none" dir="rtl">
          <div className="liquid-glass border border-red-500/25 rounded-xl px-3 py-2 shadow-lg shadow-red-500/10 pointer-events-auto flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400 flex-shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="flex-1 text-[11px] text-white/70 leading-snug text-right">
              <span className="font-bold text-white/90">אזהרה:</span> המערכת אינה תחליף לצופרי פיקוד העורף. המידע עשוי להיות שגוי. השימוש באחריות המשתמש.
            </p>
            <button onClick={() => setShowDisclaimer(false)} className="flex-shrink-0 text-white/30 hover:text-white transition-colors p-1 rounded active:scale-95">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showInstallTutorial && (
        <PwaInstallModal
          isIosPwa={isIosPwa}
          permission={permission}
          requestPermission={requestPermission}
          onInstall={handlePwaInstall}
          onClose={() => setShowInstallTutorial(false)}
        />
      )}

      {/* Secret troll video */}
      {trollPlaying && (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-pointer" onClick={() => setTrollPlaying(false)}>
          <video ref={videoRef} src="/pre_alert_troll.mp4" className="w-full h-full object-contain" autoPlay playsInline onEnded={() => setTrollPlaying(false)} />
        </div>
      )}
    </>
  );
}
