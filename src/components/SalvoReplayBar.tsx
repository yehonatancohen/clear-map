"use client";

import { useMemo, useRef } from "react";
import { salvoStateAt, type Salvo } from "@/lib/salvos";
import type { SalvoReplay } from "@/hooks/useSalvoReplay";

/**
 * On-map replay controls: a big clock, what's on the map at that moment, and a
 * timeline of the salvo's events (early warnings, alerts, clears) to scrub.
 */

const TICK_COLOR: Record<string, string> = {
  pre_alert: "#FF6A00",
  alert: "#FF2A2A",
  clear: "#10B981",
};

const clock = (ts: number) => new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const short = (ts: number) => new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SalvoReplayBar({ salvo, replay }: { salvo: Salvo; replay: SalvoReplay }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const axis = replay.axis!;
  const t = replay.t ?? axis.end;
  // The timeline reads left → right like a clock, even in the RTL page.
  const pos = (ts: number) => axis.toPos(ts) * 100;

  // One tick per distinct moment and status; a 500-zone salvo has a few dozen.
  const ticks = useMemo(() => {
    const seen = new Set<string>();
    return salvo.events.filter((e) => {
      const k = `${e.ts}|${e.status}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [salvo]);

  const { shown } = replay;
  const counts = useMemo(() => {
    const c = { alert: 0, pre_alert: 0, clear: 0 };
    if (shown > 0) for (const status of salvoStateAt(salvo, salvo.events[shown - 1].ts).values()) c[status]++;
    return c;
  }, [salvo, shown]);

  // Any moment, not just event times. Pointer moves can outpace the screen, so at
  // most one seek per animation frame (the latest position wins).
  const pendingXRef = useRef<number | null>(null);
  const seekAt = (clientX: number) => {
    const first = pendingXRef.current === null;
    pendingXRef.current = clientX;
    if (!first) return;
    requestAnimationFrame(() => {
      const x = pendingXRef.current;
      pendingXRef.current = null;
      const rect = trackRef.current?.getBoundingClientRect();
      if (x === null || !rect) return;
      replay.seek(axis.fromPos((x - rect.left) / rect.width));
    });
  };

  return (
    <div
      dir="rtl"
      className="absolute left-3 right-3 sm:right-[344px] bottom-[92px] sm:bottom-4 z-[1001] liquid-glass glass-overlay rounded-[22px] px-4 pt-3 pb-2.5"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={replay.toggle}
          aria-label={replay.playing ? "עצור שחזור" : "המשך שחזור"}
          className="glass-btn-filled h-10 w-10 rounded-full text-white/85 flex-shrink-0"
        >
          {replay.playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
          )}
        </button>

        <div className="flex flex-col leading-none">
          <span className="text-[24px] font-bold tabular-nums text-white" aria-live="off">{clock(t)}</span>
          <span className="text-[11px] font-medium text-white/50 mt-1 tabular-nums whitespace-nowrap">{elapsed(t - salvo.startTs)} דק׳ מההתחלה</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap mr-auto text-[12px]">
          {counts.alert > 0 && <Count color={TICK_COLOR.alert} n={counts.alert} label="ירי" />}
          {counts.pre_alert > 0 && <Count color={TICK_COLOR.pre_alert} n={counts.pre_alert} label="מוקדמת" />}
          {counts.clear > 0 && <Count color={TICK_COLOR.clear} n={counts.clear} label="הסתיים" />}
        </div>

        <button onClick={replay.stop} aria-label="סגור שחזור" className="glass-btn h-8 w-8 rounded-full text-white/60 flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Timeline */}
      <div dir="ltr" className="mt-3">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="ציר זמן המטח"
          aria-valuemin={axis.start}
          aria-valuemax={axis.end}
          aria-valuenow={Math.round(t)}
          aria-valuetext={clock(t)}
          className="relative h-7 cursor-pointer touch-none select-none"
          onPointerDown={(e) => {
            draggingRef.current = true;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ }
            seekAt(e.clientX);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) seekAt(e.clientX);
          }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
          onLostPointerCapture={() => { draggingRef.current = false; }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") replay.seek(t + 10_000);
            if (e.key === "ArrowLeft") replay.seek(t - 10_000);
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15" />
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/45 transition-[width] duration-100 ease-linear"
            style={{ width: `${pos(t)}%` }}
          />
          {axis.breaks.map((b) => (
            <span
              key={b}
              aria-hidden="true"
              className="absolute top-1/2 h-3 w-[6px] -translate-x-1/2 -translate-y-1/2 border-x border-white/40 bg-black/40 skew-x-[-20deg]"
              style={{ left: `${b * 100}%` }}
            />
          ))}
          {ticks.map((e) => (
            <span
              key={`${e.ts}|${e.status}`}
              className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${pos(e.ts)}%`, background: TICK_COLOR[e.status], opacity: e.ts <= t ? 1 : 0.35 }}
            />
          ))}
          <span
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.18)] transition-[left] duration-100 ease-linear"
            style={{ left: `${pos(t)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-medium text-white/40 tabular-nums">
          <span>{short(axis.start)}</span>
          <span>{short(axis.end)}</span>
        </div>
      </div>
    </div>
  );
}

function Count({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-bold tabular-nums" style={{ color }}>{n}</span>
      <span className="text-white/55">{label}</span>
    </span>
  );
}
