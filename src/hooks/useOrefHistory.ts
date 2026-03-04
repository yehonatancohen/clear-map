"use client";

import { useState, useEffect, useRef } from "react";
import type { OrefHistoryAlert } from "@/types";

// Module-level cache — survives within the same tab session
let _cache: OrefHistoryAlert[] | null = null;

const WAR_START = new Date(2026, 1, 28); // Feb 28, 2026 — שאגת הארי

interface FetchState {
  alerts: OrefHistoryAlert[];
  loading: boolean;
  progress: number;
  error: string | null;
  loadedDays: number;
  totalDays: number;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatOrefDate(d: Date) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function generateDayRanges(): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  const now = new Date();
  let cursor = new Date(WAR_START);

  // Set cursor to start of day
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= now) {
    const dayStr = formatOrefDate(cursor);
    ranges.push({ from: dayStr, to: dayStr });

    // Move to next day
    cursor.setDate(cursor.getDate() + 1);
  }

  return ranges;
}

async function fetchDay(
  date: string,
  signal: AbortSignal
): Promise<OrefHistoryAlert[]> {
  const params = new URLSearchParams({
    lang: "he",
    fromDate: date,
    toDate: date,
    mode: "0",
  });
  const res = await fetch(`/api/oref-history?${params}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function useOrefHistory(): FetchState {
  const [state, setState] = useState<FetchState>({
    alerts: _cache ?? [],
    loading: !_cache,
    progress: _cache ? 100 : 0,
    error: null,
    loadedDays: 0,
    totalDays: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (_cache) return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      const ranges = generateDayRanges();
      setState((s) => ({ ...s, totalDays: ranges.length }));

      const uniqueAlertsMap = new Map<string, OrefHistoryAlert>();

      for (let i = 0; i < ranges.length; i++) {
        if (controller.signal.aborted) return;
        try {
          const chunk = await fetchDay(ranges[i].from, controller.signal);

          // Deduplicate by rid or data+date+time
          chunk.forEach(alert => {
            const key = alert.rid ? String(alert.rid) : `${alert.data}-${alert.date}-${alert.time}`;
            uniqueAlertsMap.set(key, alert);
          });

          const currentList = Array.from(uniqueAlertsMap.values());

          setState((s) => ({
            ...s,
            alerts: currentList,
            loadedDays: i + 1,
            progress: Math.round(((i + 1) / ranges.length) * 100),
          }));
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          console.error(`Failed to fetch for day ${ranges[i].from}:`, err);
          setState((s) => ({ ...s, loadedDays: i + 1 }));
        }

        // Delay to avoid hammering (session initialization in proxy is heavy)
        if (i < ranges.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Final processing: filter out unwanted categories
      const all = Array.from(uniqueAlertsMap.values());
      const filtered = all.filter(
        (a) => a.category !== 13 && a.category !== 14 && !a.category_desc?.includes("הסתיים")
      );

      _cache = filtered;
      setState((s) => ({
        ...s,
        alerts: filtered,
        loading: false,
        progress: 100,
      }));
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, []);

  return state;
}
