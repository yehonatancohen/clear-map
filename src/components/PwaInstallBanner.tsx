"use client";

import { useState, useEffect, useRef } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_dismissed";
const DISMISS_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days
const AUTO_HIDE_MS = 10_000;

export function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_COOLDOWN) return;

    // Android / Desktop Chrome: capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: no beforeinstallprompt, show manual instructions
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (iosDevice) {
      setIsIos(true);
      setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(dismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [show]);

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  async function handleInstall() {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      await deferredPromptRef.current.userChoice;
      deferredPromptRef.current = null;
    }
    dismiss();
  }

  if (!show) return null;

  return (
    <div
      className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[420px] z-[2000] animate-[toast-enter_0.4s_ease-out]"
      dir="rtl"
    >
      <div className="liquid-glass border border-blue-400/20 rounded-xl p-3 sm:p-4 shadow-xl shadow-blue-500/10 flex items-start gap-3">
        {/* Icon */}
        <div className="bg-blue-500/20 p-2 rounded-full flex-shrink-0 mt-0.5">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-blue-400"
          >
            <path d="M12 18v-6m0 0V6m0 6h6m-6 0H6" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] sm:text-[14px] font-bold text-white leading-tight mb-1">
            התקן את מפה שקופה
          </h3>
          {isIos ? (
            <p className="text-[11px] sm:text-[12px] text-white/70 leading-snug">
              לחץ על{" "}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="inline -mt-0.5 text-blue-400"
              >
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>{" "}
              ובחר <strong className="text-white">&quot;הוסף למסך הבית&quot;</strong>
            </p>
          ) : (
            <button
              onClick={handleInstall}
              className="text-[11px] sm:text-[12px] text-blue-400 font-bold hover:text-blue-300 transition-colors"
            >
              לחץ כאן להוספה למסך הבית →
            </button>
          )}
        </div>

        {/* Close */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 active:scale-95"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
