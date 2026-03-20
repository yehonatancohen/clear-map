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

// TzevaAdom nested format (for fallback)
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

function convertFirebaseEntry(id: string, entry: FirebaseHistoryEntry): AlertBatch {
  const { status, cities, timestamp } = entry;
  const cfg = CATEGORY_MAP[status] || CATEGORY_MAP["alert"];
  const dateObj = new Date(timestamp);
  const dateStr = dateObj.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".");
  
  const alerts: SortedAlert[] = cities.map(city => ({
    data: city,
    date: dateStr,
    time: dateObj.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    alertDate: dateObj.toISOString(),
    category: typeof cfg.category === 'number' ? cfg.category : 1,
    status: status,
    category_desc: cfg.desc,
    matrix_id: 0,
    rid: 0,
    _ts: timestamp,
  }));

  const byCategory = new Map<number | string, string[]>();
  byCategory.set(cfg.category, cities);

  return { id: `fb_${id}`, startTs: timestamp, endTs: timestamp, alerts, byCategory };
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
      setFbBatches(Object.entries(data)
        .map(([id, entry]) => convertFirebaseEntry(id, entry as FirebaseHistoryEntry))
        .sort((a, b) => b.startTs - a.startTs));
    });
    return () => off(historyRef, "value", unsubscribe);
  }, [enabled]);

  // 2. Fetch External History
  const fetchExternal = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Use URL object to ensure proper query param formatting
      const url = new URL("/api/oref-history", window.location.origin);
      url.searchParams.set("lang", "he");
      url.searchParams.set("t", Date.now().toString()); // Cache bust

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      
      let processed: AlertBatch[] = [];

      if (Array.isArray(data) && data.length > 0) {
        if ("data" in data[0]) {
          // Oref format (flat list)
          const sorted = (data as OrefHistoryAlert[]).map(a => ({ ...a, _ts: parseOrefDate(a.date, a.time) })).sort((a, b) => b._ts - a._ts);
          
          let current: AlertBatch | null = null;
          for (const alert of sorted) {
            let statusOverride = "";
            const desc = alert.category_desc || "";
            if (desc.includes("ניתן לצאת") || desc.includes("הסתיים")) statusOverride = "clear";
            else if (desc.includes("בדקות הקרובות") || desc.includes("מודיעין")) statusOverride = "pre_alert";

            if (!current || Math.abs(current.startTs - alert._ts) > 120000) {
              current = { id: `oref_${alert._ts}`, startTs: alert._ts, endTs: alert._ts, alerts: [], byCategory: new Map() };
              processed.push(current);
            }
            const alertWithStatus = { ...alert, status: statusOverride };
            current.alerts.push(alertWithStatus);
            current.startTs = Math.min(current.startTs, alert._ts);
            
            const cfg = statusOverride ? CATEGORY_MAP[statusOverride] : (CATEGORY_MAP[alert.category] || CATEGORY_MAP[1]);
            const list = current.byCategory.get(cfg.category) || [];
            if (!list.includes(alert.data)) { list.push(alert.data); current.byCategory.set(cfg.category, list); }
          }
        } else if ("alerts" in data[0]) {
          // TzevaAdom format (nested batches fallback)
          processed = (data as TzevaAdomBatch[]).map(b => {
            const alerts: SortedAlert[] = [];
            const byCat = new Map<number | string, string[]>();
            let start = Infinity;
            for (const a of b.alerts) {
                if (a.isDrill) continue;
                const ts = a.time * 1000;
                start = Math.min(start, ts);
                const { category, desc } = threatToCategory(a.threat);
                for (const city of a.cities) {
                    alerts.push({ data: city, date: "", time: "", alertDate: new Date(ts).toISOString(), category, category_desc: desc, matrix_id: 0, rid: b.id, _ts: ts });
                    const list = byCat.get(category) || [];
                    if (!list.includes(city)) { list.push(city); byCat.set(category, list); }
                }
            }
            return { id: `ta_${b.id}`, startTs: start, endTs: start, alerts, byCategory: byCat };
          }).filter(b => b.alerts.length > 0);
        }
      }
      setExternalBatches(processed);
    } catch (err) {
      console.error("External history hook error:", err);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    if (enabled && externalBatches.length === 0) fetchExternal();
  }, [enabled, fetchExternal, externalBatches.length]);

  // 3. Merge & Deduplicate
  useEffect(() => {
    const combined = [...fbBatches, ...externalBatches].sort((a, b) => b.startTs - a.startTs);
    const final: AlertBatch[] = [];
    const seen = new Set();
    
    for (const b of combined) {
      const cityHash = b.alerts.map(a => a.data).sort().join(",");
      const hash = `${Math.floor(b.startTs / 15000)}_${cityHash}`;
      if (!seen.has(hash)) { 
        final.push(b); 
        seen.add(hash); 
      }
    }
    setBatches(final);
    setHasMore(false);
  }, [fbBatches, externalBatches]);

  return { batches, loading, hasMore, loadMore: fetchExternal };
}
