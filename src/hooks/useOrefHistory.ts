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
  loadedMonths: number;
  totalMonths: number;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatOrefDate(d: Date) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function generateMonthRanges(): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  const now = new Date();
  let cursor = new Date(WAR_START);

  while (cursor <= now) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    // Start of range: first day of month, or war start for the first month
    const from =
      ranges.length === 0
        ? WAR_START
        : new Date(year, month, 1);

    // End of range: last day of month, or today for the current month
    const endOfMonth = new Date(year, month + 1, 0);
    const to = endOfMonth > now ? now : endOfMonth;

    ranges.push({ from: formatOrefDate(from), to: formatOrefDate(to) });

    // Move to next month
    cursor = new Date(year, month + 1, 1);
  }

  return ranges;
}

async function fetchMonth(
  from: string,
  to: string,
  signal: AbortSignal
): Promise<OrefHistoryAlert[]> {
  const params = new URLSearchParams({
    lang: "he",
    fromDate: from,
    toDate: to,
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
    loadedMonths: 0,
    totalMonths: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (_cache) return; // Already cached

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      const ranges = generateMonthRanges();
      setState((s) => ({ ...s, totalMonths: ranges.length }));

      const all: OrefHistoryAlert[] = [];

      for (let i = 0; i < ranges.length; i++) {
        if (controller.signal.aborted) return;
        try {
          const chunk = await fetchMonth(
            ranges[i].from,
            ranges[i].to,
            controller.signal
          );
          all.push(...chunk);
          setState((s) => ({
            ...s,
            alerts: [...all],
            loadedMonths: i + 1,
            progress: Math.round(((i + 1) / ranges.length) * 100),
          }));
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          // Skip failed months, continue fetching
          setState((s) => ({ ...s, loadedMonths: i + 1 }));
        }

        // Small delay to avoid hammering the server
        if (i < ranges.length - 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      // Filter out clearance events (cat 13), pre-alerts (cat 14), and "event ended" alerts
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
