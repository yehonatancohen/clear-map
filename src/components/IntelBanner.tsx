"use client";

import { useState } from "react";
import { IntelligenceUpdate } from "@/types";

interface IntelBannerProps {
  updates: IntelligenceUpdate[];
}

const severityColors: Record<IntelligenceUpdate["severity"], string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-green-400",
};

const severityLabels: Record<IntelligenceUpdate["severity"], string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
};

export default function IntelBanner({ updates }: IntelBannerProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (updates.length === 0) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-4 left-4 z-[1000] flex items-center gap-2 rounded-xl border border-white/10 bg-gray-900/60 px-4 py-3 shadow-2xl backdrop-blur-xl transition-colors hover:bg-gray-800/70"
        dir="rtl"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-gray-300"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <span className="text-sm font-medium text-gray-300">מודיעין</span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/80 px-1.5 text-xs font-bold text-white">
          {updates.length}
        </span>
      </button>
    );
  }

  return (
    <div
      className="intel-panel absolute top-4 bottom-4 left-4 z-[1000] flex w-80 flex-col rounded-2xl border border-white/10 bg-gray-900/60 shadow-2xl backdrop-blur-xl"
      dir="rtl"
    >
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-200">
          עדכוני מודיעין
        </h2>
        <button
          onClick={() => setIsOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          title="סגור"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-400"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {updates.map((update) => (
          <div
            key={update.id}
            className="rounded-xl border border-white/5 bg-white/5 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`text-xs font-bold ${severityColors[update.severity]}`}
              >
                ● {severityLabels[update.severity]}
              </span>
              <span className="text-xs text-gray-500">
                {update.source}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/90">
              {update.text_he}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
