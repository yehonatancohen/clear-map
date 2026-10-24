"use client";

import { SOURCE_META, regionsLine, salvoFacts, salvoNoun, type Salvo } from "@/lib/salvos";
import type { SalvoReplay } from "@/hooks/useSalvoReplay";

interface SalvoListProps {
  salvos: Salvo[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (salvo: Salvo | null) => void;
  replay: SalvoReplay;
  onShare: (salvo: Salvo) => void;
  sharing: boolean;
}

const time = (ts: number) => new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const day = (ts: number) => new Date(ts).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });

function groupByDay(salvos: Salvo[]): [string, Salvo[]][] {
  const groups = new Map<string, Salvo[]>();
  for (const s of salvos) {
    const k = day(s.firstAlertTs);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()];
}

export default function SalvoList({ salvos, loading, selectedId, onSelect, replay, onShare, sharing }: SalvoListProps) {
  if (salvos.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-50">
        <h3 className="text-white text-[14px] font-bold mb-1">אין מטחים</h3>
        <p className="text-white text-[12px]">לא נמצא ירי רקטות וטילים בהיסטוריה שנטענה</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-[11px] text-white/45 leading-snug px-1">
        המקור משוער: לפי מיקום ההתרעות והאם קדמה להן התרעה מוקדמת. פיקוד העורף לא מפרסם מאיפה נורה.
      </p>
      {groupByDay(salvos).map(([date, list]) => (
        <div key={date} className="space-y-2.5">
          <div className="sticky top-0 z-10 flex items-center gap-2 py-2 px-3 rounded-full bg-zinc-900 border border-white/10">
            <span className="text-[11px] font-bold text-blue-400">{date}</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          {list.map((s) => {
            const meta = SOURCE_META[s.source];
            const selected = s.id === selectedId;
            const facts = salvoFacts(s).slice(1); // count is shown in the chip
            return (
              <div
                key={s.id}
                className={`liquid-glass-subtle rounded-2xl transition-[background-color,border-color] duration-200 ${
                  selected ? "border-blue-400/70 bg-blue-500/15" : "hover:bg-white/10"
                }`}
              >
                <button onClick={() => onSelect(selected ? null : s)} className="w-full text-right p-4" aria-expanded={selected}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[12px] font-bold tabular-nums ${selected ? "text-blue-300" : "text-white/60"}`}>
                      {time(s.firstAlertTs)}
                    </span>
                    <span className="bg-white/5 text-white/50 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-white/5">
                      {s.alertCities.length} יישובים
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FF2A2A]" />
                    <span className="text-[14px] font-bold text-white/90">
                      {salvoNoun(s)} · {meta.label}
                    </span>
                    {meta.hint && <span className="text-[11px] font-medium text-white/45">{meta.hint}</span>}
                  </div>
                  <p className="text-[12px] text-white/65 mt-1.5 pr-3.5">{regionsLine(s)}</p>
                  <p className="text-[12px] text-white/45 mt-0.5 pr-3.5">{facts.join(" · ")}</p>
                </button>

                {selected && (
                  <div className="px-4 pb-4 -mt-1 flex gap-2">
                    <button
                      onClick={replay.toggle}
                      className="glass-btn-filled rounded-full px-3 h-8 text-[12px] font-bold text-white/85 flex items-center gap-1.5"
                    >
                      {replay.playing ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
                      )}
                      {replay.playing ? "עצור" : replay.t === null ? "שחזור המטח" : "המשך שחזור"}
                    </button>
                    <button
                      onClick={() => onShare(s)}
                      disabled={sharing}
                      className="glass-btn-filled rounded-full px-3 h-8 text-[12px] font-bold text-white/80 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" />
                      </svg>
                      {sharing ? "מכין תמונה…" : "שתף סיכום"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
