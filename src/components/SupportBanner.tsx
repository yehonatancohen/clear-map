"use client";

import { useState, useEffect } from "react";

const DISMISS_KEY = "support_banner_dismissed";
const DISMISS_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHOW_DELAY_MS = 30_000; // Show after 30 seconds of browsing

export function SupportBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_COOLDOWN) return;

    const timer = setTimeout(() => {
      setShowBanner(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  function dismissBanner() {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  if (!showBanner) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 sm:left-6 sm:right-auto sm:w-[340px] z-[2000] toast-enter"
      dir="rtl"
    >
      <div className="bg-zinc-900/95 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-4 shadow-2xl flex items-start gap-4 ring-1 ring-amber-500/10">
        <div className="bg-amber-500/20 p-2.5 rounded-xl flex-shrink-0 mt-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-white leading-tight mb-1">
            אוהבים את הפרויקט?
          </p>
          <p className="text-[12px] text-white/60 leading-snug mb-3">
            מפה שקופה הוא פרויקט בהתנדבות. התרומות שלכם עוזרות לנו לכסות את עלויות השרתים ולהמשיך לפעול.
          </p>
          <a
            href="https://buymeacoffee.com/yehonatancohen"
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismissBanner}
            className="inline-flex items-center gap-2 bg-[#FFDD00] text-black text-[12px] font-bold px-4 py-2 rounded-xl hover:bg-[#FFDD00]/90 transition-all active:scale-95 shadow-lg shadow-amber-500/10"
          >
            תמיכה בפרויקט
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>

        <button
          onClick={dismissBanner}
          className="text-white/30 hover:text-white transition-colors p-1 -mr-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
