"use client";

import { useState, useEffect } from "react";

const DISMISS_KEY = "support_banner_dismissed";
const DISMISS_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHOW_DELAY_MS = 3000;
const AUTO_HIDE_MS = 30000;

export function SupportBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_COOLDOWN) return;

    const timer = setTimeout(() => setShowBanner(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showBanner) return;
    const timer = setTimeout(() => setShowBanner(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [showBanner]);

  function dismissBanner() {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  if (!showBanner) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 sm:left-6 sm:right-auto sm:w-auto z-[2000] toast-enter"
      dir="rtl"
    >
      <div className="bg-zinc-900/95 backdrop-blur-xl border border-amber-500/20 rounded-xl px-3 py-2 shadow-lg flex items-center gap-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400 flex-shrink-0">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <p className="text-[12px] text-white/70 leading-none">
          אוהבים את הפרויקט?
        </p>
        <a
          href="https://buymeacoffee.com/yehonatancohen"
          target="_blank"
          rel="noopener noreferrer"
          onClick={dismissBanner}
          className="text-[11px] font-bold bg-[#FFDD00] text-black px-2.5 py-1 rounded-lg hover:bg-[#FFDD00]/90 transition-all active:scale-95 whitespace-nowrap"
        >
          תמיכה בפרויקט
        </a>
        <button
          onClick={dismissBanner}
          className="text-white/30 hover:text-white transition-colors p-0.5 flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
