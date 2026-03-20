"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { OrefHistoryAlert } from "@/types";
import { ref, onValue, off, query, limitToLast } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export type SortedAlert = OrefHistoryAlert & { _ts: number; status?: string };

export interface AlertBatch {
  id: string;
  startTs: number;
  endTs: number;
  alerts: SortedAlert[];
  byCategory: Map<number | string, string[]>;
}

interface FirebaseHistoryEntry {
  status: string;
  cities: string[];
  timestamp: number;
}

interface TzevaAdomBatch {
    id: number;
    alerts: {
        time: number;
        cities: string[];
        threat: number;
        isDrill: boolean;
    }[];
}

const CATEGORY_MAP: Record<string | number, { category: number | string; desc: string }> = {
  1: { category: 1, desc: "ירי רקטות וטילים" },
  2: { category: 2, desc: "חדירת כלי טיס עוין" },
  3: { category: 3, desc: "חדירת מחבלים" },
  10: { category: "pre_alert", desc: "התרעה מוקדמת" },
  "alert": { category: 1, desc: "ירי רקטות וטילים" },
  "uav": { category: 2, desc: "חדירת כלי טיס עוין" },
  "terrorist": { category: 3, desc: "חדירת מחבלים" },
  "pre_alert": { category: "pre_alert", desc: "התרעה מוקדמת" },
  "clear": { category: "clear", desc: "האירוע הסתיים" },
};

function parseOrefDate(dateStr: string, timeStr: string): number {
  if (!dateStr || !timeStr) return Date.now();
  const [day, month, year] = dateStr.split(".").map(Number);
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, s).getTime();
}

function threatToCategory(threat: number): { category: number; desc: string } {
  switch (threat) {
    case 5: return { category: 2, desc: "חדירת כלי טיס עוין" };
    case 2: return { category: 3, desc: "חדירת מחבלים" };
    default: return { category: 1, desc: "ירי רקטות וטילים" };
  }
}

export function useHistoryAlerts(enabled = true) {
  const [batches, setBatches] = useState<AlertBatch[]>([]);
  const [fbBatches, setFbBatches] = useState<AlertBatch[]>([]);
  const [externalBatches, setExternalBatches] = useState<AlertBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // 1. Firebase Listen
  useEffect(() => {
    if (!enabled) return;
    const historyRef = query(ref(rtdb, "/public_state/history"), limitToLast(200));
    const unsubscribe = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      const converted = Object.entries(data).map(([id, e]: [string, any]) => {
        const entry = e as FirebaseHistoryEntry;
        const cfg = CATEGORY_MAP[entry.status] || CATEGORY_MAP["alert"];
        const ts = entry.timestamp;
        const dateObj = new Date(ts);
        const dateStr = dateObj.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".");
        
        const alerts: SortedAlert[] = entry.cities.map(city => ({
          data: city,
          date: dateStr,
          time: dateObj.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          alertDate: dateObj.toISOString(),
          category: typeof cfg.category === 'number' ? cfg.category : 1,
          status: entry.status,
          category_desc: cfg.desc,
          matrix_id: 0, rid: 0, _ts: ts,
        }));

        const byCat = new Map<number | string, string[]>();
        byCat.set(cfg.category, entry.cities);

        return { id: `fb_${id}`, startTs: ts, endTs: ts, alerts, byCategory: byCat };
      });
      setFbBatches(converted);
    });
    return () => off(historyRef, "value", unsubscribe);
  }, [enabled]);

  // 2. Fetch External
  const fetchExternal = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const url = new URL("/api/oref-history", window.location.origin);
      url.searchParams.set("lang", "he");
      url.searchParams.set("t", Date.now().toString());

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      
      const processed: AlertBatch[] = [];
      if (Array.isArray(data) && data.length > 0) {
        if ("data" in data[0]) {
          // Oref format
          for (const alert of data as OrefHistoryAlert[]) {
            const ts = parseOrefDate(alert.date, alert.time);
            let status = "";
            const desc = alert.category_desc || "";
            if (desc.includes("ניתן לצאת") || desc.includes("הסתיים")) status = "clear";
            else if (desc.includes("בדקות הקרובות") || desc.includes("מודיעין")) status = "pre_alert";

            const cfg = status ? CATEGORY_MAP[status] : (CATEGORY_MAP[alert.category] || CATEGORY_MAP[1]);
            const byCat = new Map<number | string, string[]>();
            byCat.set(cfg.category, [alert.data]);

            processed.push({
              id: `oref_${ts}_${alert.rid}`,
              startTs: ts, endTs: ts,
              alerts: [{ ...alert, _ts: ts, status }],
              byCategory: byCat
            });
          }
        } else if ("alerts" in data[0]) {
          // TzevaAdom format
          for (const b of data as TzevaAdomBatch[]) {
            for (const a of b.alerts) {
                if (a.isDrill) continue;
                const ts = a.time * 1000;
                const { category, desc } = threatToCategory(a.threat);
                const byCat = new Map<number | string, string[]>();
                byCat.set(category, a.cities);
                const alerts: SortedAlert[] = a.cities.map(c => ({
                    data: c, date: "", time: "", alertDate: new Date(ts).toISOString(),
                    category, category_desc: desc, matrix_id: 0, rid: b.id, _ts: ts
                } as any));
                processed.push({ id: `ta_${ts}_${b.id}`, startTs: ts, endTs: ts, alerts, byCategory: byCat });
            }
          }
        }
      }
      setExternalBatches(processed);
    } catch (err) {
      console.error("External history error:", err);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    if (enabled && externalBatches.length === 0) fetchExternal();
  }, [enabled, fetchExternal, externalBatches.length]);

  // 3. Final Batching pass (Group everything within 2 mins)
  useEffect(() => {
    // Collect all individual alert objects from all batches
    const allAlerts: SortedAlert[] = [];
    [...fbBatches, ...externalBatches].forEach(b => allAlerts.push(...b.alerts));

    // Sort all alerts by time descending
    allAlerts.sort((a, b) => b._ts - a._ts);

    // Deduplicate identical alerts (same city, status, and very close time)
    const uniqueAlerts: SortedAlert[] = [];
    const seenHashes = new Set<string>();
    for (const a of allAlerts) {
        // Hash by city + status + 15s window
        const hash = `${a.data}_${a.status || a.category}_${Math.floor(a._ts / 15000)}`;
        if (!seenHashes.has(hash)) {
            uniqueAlerts.push(a);
            seenHashes.add(hash);
        }
    }

    // Perform final grouping into batches (2 min window)
    const finalBatches: AlertBatch[] = [];
    let currentBatch: AlertBatch | null = null;

    for (const alert of uniqueAlerts) {
        if (!currentBatch || Math.abs(currentBatch.startTs - alert._ts) > 120000) {
            currentBatch = {
                id: `batch_${alert._ts}`,
                startTs: alert._ts,
                endTs: alert._ts,
                alerts: [],
                byCategory: new Map(),
            };
            finalBatches.push(currentBatch);
        }

        currentBatch.alerts.push(alert);
        currentBatch.startTs = Math.min(currentBatch.startTs, alert._ts);
        currentBatch.endTs = Math.max(currentBatch.endTs, alert._ts);

        // Update category map within batch
        let status = alert.status || "";
        const cfg = status ? CATEGORY_MAP[status] : (CATEGORY_MAP[alert.category] || CATEGORY_MAP[1]);
        const list = currentBatch.byCategory.get(cfg.category) || [];
        if (!list.includes(alert.data)) {
            list.push(alert.data);
            currentBatch.byCategory.set(cfg.category, list);
        }
    }

    setBatches(finalBatches);
    setHasMore(false);
  }, [fbBatches, externalBatches]);

  return { batches, loading, hasMore, loadMore: fetchExternal };
}
