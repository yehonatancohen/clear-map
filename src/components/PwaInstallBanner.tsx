"use client";

import { useState, useEffect, useRef } from "react";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_dismissed";
const DISMISS_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTO_HIDE_MS = 15_000;

export function PwaInstallBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const { permission, requestPermission } = useNotificationSettings();

  useEffect(() => {
    // Check if already standalone
    const standalone = window.matchMedia("(display-mode: standalone)").matches || 
                      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return;

    // Dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_COOLDOWN) return;

    // Detect iOS
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIos(iosDevice);

    // Android / Desktop Chrome: capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: no beforeinstallprompt, show banner if not standalone
    if (iosDevice && !standalone) {
      setShowBanner(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Auto-dismiss banner after some time
  useEffect(() => {
    if (!showBanner) return;
    const timer = setTimeout(() => setShowBanner(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [showBanner]);

  function dismissBanner() {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  async function handleOpenTutorial() {
    setShowBanner(false);
    setShowTutorial(true);
  }

  async function handleInstall() {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      if (outcome === "accepted") {
        deferredPromptRef.current = null;
        setShowTutorial(false);
      }
    }
  }

  async function handleEnableNotifications() {
    const result = await requestPermission();
    if (result === "granted") {
      if (isStandalone) {
         setShowTutorial(false);
      }
    }
  }

  if (isStandalone && permission === "granted") return null;
  if (!showBanner && !showTutorial) return null;

  return (
    <>
      {/* Small Bottom Banner */}
      {showBanner && (
        <div
          className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-[320px] z-[2000] toast-enter"
          dir="rtl"
        >
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4">
            <div className="bg-blue-500/20 p-2.5 rounded-xl flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-400">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-white leading-tight">
                רוצה לקבל התראות?
              </p>
              <button
                onClick={handleOpenTutorial}
                className="text-[12px] text-blue-400 font-medium hover:text-blue-300 transition-colors mt-0.5"
              >
                הוסף למסך הבית להפעלת התראות ←
              </button>
            </div>

            <button
              onClick={dismissBanner}
              className="text-white/40 hover:text-white transition-colors p-1"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div 
            className="bg-zinc-950 border border-white/10 w-full max-w-[420px] rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-500"
            dir="rtl"
          >
            <div className="p-6 pt-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">התקנת האפליקציה</h2>
                  <p className="text-white/50 text-sm">כדי לקבל התראות בזמן אמת</p>
                </div>
                <button 
                  onClick={() => setShowTutorial(false)}
                  className="bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all p-2 rounded-full"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-5">
                  {isIos ? (
                    <div className="space-y-4">
                      <div className="flex gap-4 items-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">1</div>
                        <div className="text-white/80 text-[15px] leading-snug pt-1">
                          לחץ על כפתור ה-<span className="font-bold">שיתוף</span> בסרגל התחתון.
                          <div className="mt-2 flex items-center gap-2 text-white/40 text-xs bg-white/5 w-fit px-2 py-1 rounded-md">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                            <span>Share Icon</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">2</div>
                        <div className="text-white/80 text-[15px] leading-snug pt-1">
                          גלול למטה ובחר <span className="font-bold">&quot;הוסף למסך הבית&quot;</span>.
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">3</div>
                        <div className="text-white/80 text-[15px] leading-snug pt-1">
                          לחץ על <span className="font-bold">&quot;הוסף&quot;</span> בפינה העליונה.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-4 items-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">1</div>
                        <div className="text-white/80 text-[15px] leading-snug pt-1">
                          לחץ על הכפתור <span className="font-bold">&quot;התקן אפליקציה&quot;</span> למטה.
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">2</div>
                        <div className="text-white/80 text-[15px] leading-snug pt-1">
                          אשר את ההתקנה בחלון שיפתח.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
                  <div className="text-amber-400 mt-0.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="text-amber-200/80 text-xs leading-relaxed font-medium">
                    <span className="font-bold">חשוב:</span> לאחר ההתקנה, פתח את האפליקציה מהאייקון החדש במסך הבית כדי להפעיל את ההתראות.
                  </p>
                </div>

                <div className="pt-2 space-y-3 pb-2">
                  {!isIos && (
                    <button
                      onClick={handleInstall}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>התקן אפליקציה</span>
                    </button>
                  )}
                  
                  {permission !== "granted" && (
                    <button
                      onClick={handleEnableNotifications}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] border border-white/5 flex items-center justify-center gap-2"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      <span>{permission === "denied" ? "התראות חסומות (שנה בהגדרות)" : "הפעל התראות כעת"}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
