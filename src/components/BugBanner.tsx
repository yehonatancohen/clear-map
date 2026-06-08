"use client";

import { useState } from "react";

export function BugBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[3000] w-[calc(100%-2rem)] max-w-xl toast-enter"
      dir="rtl"
    >
      <div className="bg-red-950/95 backdrop-blur-xl border border-red-500/40 rounded-xl px-4 py-3 shadow-lg flex items-start gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400 flex-shrink-0 mt-0.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-[13px] text-white/90 leading-relaxed flex-1">
          <span className="font-semibold text-red-300">תקלה ידועה: </span>
          ישנה תקלה הגורמת להתרעות מוקדמות להיראות כהתרעות רגילות. אנחנו עובדים על תיקון בהקדם האפשרי. מצטערים על אי הנוחות.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/30 hover:text-white/80 transition-colors p-0.5 flex-shrink-0 mt-0.5"
          aria-label="סגור"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
