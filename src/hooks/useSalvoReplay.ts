"use client";

import { useEffect, useMemo, useState } from "react";
import { eventsUpTo, salvoAxis, type Salvo, type SalvoAxis } from "@/lib/salvos";

/** A whole salvo plays in this long, whatever its real length (quiet gaps are squeezed). */
const PLAY_MS = 15_000;
const TICK_MS = 100;

export interface SalvoReplay {
  axis: SalvoAxis | null;
  /** Replay clock (ms timestamp); null = not replaying (the map shows the whole salvo). */
  t: number | null;
  /** Events that have happened by t. The map only redraws when this changes. */
  shown: number;
  playing: boolean;
  toggle: () => void;
  seek: (t: number) => void;
  stop: () => void;
}

export function useSalvoReplay(salvo: Salvo | null): SalvoReplay {
  const axis = useMemo(() => (salvo ? salvoAxis(salvo) : null), [salvo]);
  const id = salvo?.id ?? null;
  const [stored, setStored] = useState<{ id: string | null; t: number | null; playing: boolean }>({ id: null, t: null, playing: false });
  // A different salvo starts from its full picture.
  const { t, playing } = stored.id === id ? stored : { t: null, playing: false };
  const set = (next: { t: number | null; playing: boolean }) => setStored({ id, ...next });

  useEffect(() => {
    if (!playing || t === null || !axis) return;
    const timer = setTimeout(() => {
      // Advance at a steady pace along the (squeezed) timeline, not the raw clock.
      const p = axis.toPos(t) + TICK_MS / PLAY_MS;
      setStored({ id, t: p >= 1 ? axis.end : axis.fromPos(p), playing: p < 1 });
    }, TICK_MS);
    return () => clearTimeout(timer);
  }, [playing, t, axis, id]);

  const shown = useMemo(() => (salvo && t !== null ? eventsUpTo(salvo, t) : 0), [salvo, t]);

  return {
    axis,
    t,
    shown,
    playing,
    toggle: () => {
      if (!axis) return;
      if (playing) return set({ t, playing: false });
      set({ t: t === null || t >= axis.end ? axis.start : t, playing: true });
    },
    seek: (to) => {
      if (!axis) return;
      // Whole seconds (what the clock shows): dragging within a second is a no-op.
      const next = Math.round(Math.max(axis.start, Math.min(axis.end, to)) / 1000) * 1000;
      if (next === t && !playing) return;
      set({ t: next, playing: false });
    },
    stop: () => set({ t: null, playing: false }),
  };
}
