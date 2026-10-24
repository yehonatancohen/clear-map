"use client";

import { useLiveHealth } from "@/hooks/useLiveState";

const MESSAGES = {
  stale: { title: "המידע במפה אינו מתעדכן כרגע", desc: "ייתכן שיש התרעות שאינן מוצגות. הקשיבו לצופרים ולאפליקציית פיקוד העורף." },
  source_down: { title: "אין כרגע קשר למקור ההתרעות", desc: "המפה עשויה להיות חלקית. הקשיבו לצופרים ולאפליקציית פיקוד העורף." },
  offline: { title: "אין חיבור לאינטרנט", desc: "המפה תתעדכן כשהחיבור יחזור." },
} as const;

/**
 * Warns when the map might be showing "no alerts" only because data stopped
 * flowing. Without this, a dead backend looks exactly like a quiet day.
 */
export default function ConnectionBanner({ compact = false }: { compact?: boolean }) {
  const health = useLiveHealth();
  if (health !== "stale" && health !== "source_down" && health !== "offline") return null;
  const msg = MESSAGES[health];

  return (
    <div
      role="alert"
      dir="rtl"
      className={`absolute z-[2100] pointer-events-none ${compact ? "top-11 left-2 right-2" :"top-[60px] sm:top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[440px]"}`}
    >
      <div className="pointer-events-auto rounded-2xl border border-amber-400/40 bg-[#1a1206]/90 backdrop-blur-md px-3 py-2 flex items-start gap-2 shadow-lg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="text-right">
          <div className="text-[12px] font-bold text-amber-200">{msg.title}</div>
          {!compact && <div className="text-[11px] text-amber-100/70 leading-snug">{msg.desc}</div>}
        </div>
      </div>
    </div>
  );
}
