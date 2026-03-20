"use client";

import { useState, useEffect, useRef } from "react";
import type { OrefHistoryAlert } from "@/types";
import { getCachedBatchIds, getCachedBatches, cacheBatches, CachedBatch } from "@/lib/historyCache";

export type HistoryRange = 1 | 2 | 3 | 7;

export type SortedAlert = OrefHistoryAlert & { _ts: number };

export interface AlertBatch {
  id: string;
  startTs: number;
  endTs: number;
  alerts: SortedAlert[];
  byCategory: Map<number, string[]>;
}

interface RawBatch {
  id: number;
  description?: string | null;
  alerts: {
    time: number;
    cities: string[];
    threat: number;
    isDrill: boolean;
  }[];
}

// ~50 batches/day estimate
const BATCHES_PER_DAY = 55;
// How many IDs to request per API call
const FETCH_CHUNK = 5;
// Delay between fetch chunks (ms)
const FETCH_DELAY = 300;

function threatToCategory(threat: number): { category: number; desc: string } {
  switch (threat) {
    case 5:
      return { category: 2, desc: "חדירת כלי טיס עוין" };
    case 2:
      return { category: 3, desc: "חדירת מחבלים" };
    case 6:
      return { category: 10, desc: "רעידת אדמה" };
    default:
      return { category: 1, desc: "ירי רקטות וטילים" };
  }
}

function convertBatch(raw: RawBatch): AlertBatch {
  const alerts: SortedAlert[] = [];
  const byCategory = new Map<number, string[]>();
  let startTs = Infinity;
  let endTs = 0;

  for (const a of raw.alerts) {
    if (a.isDrill) continue;
    const tsMs = a.time * 1000;
    const { category, desc } = threatToCategory(a.threat);
    if (tsMs < startTs) startTs = tsMs;
    if (tsMs > endTs) endTs = tsMs;

    const dateObj = new Date(tsMs);
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    const h = String(dateObj.getHours()).padStart(2, "0");
    const m = String(dateObj.getMinutes()).padStart(2, "0");
    const s = String(dateObj.getSeconds()).padStart(2, "0");

    for (const city of a.cities) {
      alerts.push({
        data: city,
        date: `${day}.${month}.${year}`,
        time: `${h}:${m}:${s}`,
        alertDate: dateObj.toISOString(),
        category,
        category_desc: desc,
        matrix_id: 0,
        rid: raw.id,
        _ts: tsMs,
      });

      const list = byCategory.get(category);
      if (list) {
        if (!list.includes(city)) list.push(city);
      } else {
        byCategory.set(category, [city]);
      }
    }
  }

  return {
    id: `batch_${raw.id}`,
    startTs,
    endTs: endTs || startTs,
    alerts,
    byCategory,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface HistoryState {
  batches: AlertBatch[];
  loading: boolean;
  progress: number;
}

export function useHistoryAlerts(days: HistoryRange, enabled = true): HistoryState {
  const [state, setState] = useState<HistoryState>({
    batches: [],
    loading: false,
    progress: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ batches: [], loading: true, progress: 0 });

    (async () => {
      try {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const batchMap = new Map<number, RawBatch>();

        // 1. Fetch latest batch list
        const listRes = await fetch("/api/oref-history", { signal: controller.signal });
        if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
        const list: RawBatch[] = await listRes.json();
        if (controller.signal.aborted) return;

        for (const b of list) batchMap.set(b.id, b);

        // Cache list batches
        cacheBatches(
          list.map((b) => ({ id: b.id, alerts: b.alerts, cachedAt: Date.now() })),
        ).catch(() => {});

        const latestId = Math.max(...list.map((b) => b.id));
        const lowestListId = Math.min(...list.map((b) => b.id));

        // Show initial data immediately
        updateState(batchMap, cutoff, true, 10);

        // 2. Calculate which older IDs we need
        const targetLowestId = latestId - days * BATCHES_PER_DAY;
        const allNeededIds: number[] = [];
        for (let id = lowestListId - 1; id >= targetLowestId; id--) {
          allNeededIds.push(id);
        }

        if (allNeededIds.length === 0) {
          updateState(batchMap, cutoff, false, 100);
          return;
        }

        // 3. Check IndexedDB for cached batches
        let cachedIds: Set<number>;
        try {
          cachedIds = await getCachedBatchIds();
        } catch {
          cachedIds = new Set();
        }
        if (controller.signal.aborted) return;

        const cachedNeeded = allNeededIds.filter((id) => cachedIds.has(id));
        const uncachedNeeded = allNeededIds.filter((id) => !cachedIds.has(id));

        // Load from cache
        if (cachedNeeded.length > 0) {
          try {
            const cached = await getCachedBatches(cachedNeeded);
            for (const c of cached) {
              batchMap.set(c.id, { id: c.id, alerts: c.alerts });
            }
            updateState(batchMap, cutoff, uncachedNeeded.length > 0, 30);
          } catch {
            // cache read failed, will fetch instead
          }
          if (controller.signal.aborted) return;
        }

        // 4. Fetch missing batches progressively
        const totalToFetch = uncachedNeeded.length;
        let fetched = 0;

        for (let i = 0; i < uncachedNeeded.length; i += FETCH_CHUNK) {
          if (controller.signal.aborted) return;

          const chunk = uncachedNeeded.slice(i, i + FETCH_CHUNK);
          const idsParam = chunk.join(",");

          try {
            const res = await fetch(`/api/oref-history?ids=${idsParam}`, {
              signal: controller.signal,
            });
            if (res.ok) {
              const batches: RawBatch[] = await res.json();
              const toCache: CachedBatch[] = [];

              for (const b of batches) {
                batchMap.set(b.id, b);
                toCache.push({ id: b.id, alerts: b.alerts, cachedAt: Date.now() });
              }

              // Cache in background
              if (toCache.length > 0) {
                cacheBatches(toCache).catch(() => {});
              }
            }
          } catch (err) {
            if (controller.signal.aborted) return;
            // Individual chunk failed, continue
          }

          fetched += chunk.length;
          const pct = Math.round(30 + (fetched / totalToFetch) * 70);
          updateState(batchMap, cutoff, i + FETCH_CHUNK < uncachedNeeded.length, pct);

          // Delay to avoid rate limiting
          if (i + FETCH_CHUNK < uncachedNeeded.length) {
            await sleep(FETCH_DELAY);
          }
        }

        updateState(batchMap, cutoff, false, 100);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("History fetch failed:", err);
        setState((s) => ({ ...s, loading: false }));
      }
    })();

    function updateState(
      batchMap: Map<number, RawBatch>,
      cutoff: number,
      loading: boolean,
      progress: number,
    ) {
      const batches = Array.from(batchMap.values())
        .map(convertBatch)
        .filter((b) => b.alerts.length > 0 && b.endTs >= cutoff)
        .sort((a, b) => b.startTs - a.startTs);

      setState({ batches, loading, progress });
    }

    return () => controller.abort();
  }, [days, enabled]);

  return state;
}
