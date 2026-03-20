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
  const [day, month, year] = dateStr.split(".").map(Number);
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, s).getTime();
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

  // 2. Fetch History (Oref AJAX endpoint)
  const fetchExternal = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/oref-history?lang=he");
      if (!res.ok) throw new Error("Fetch failed");
      const data: OrefHistoryAlert[] = await res.json();
      
      const processed: AlertBatch[] = [];
      if (Array.isArray(data) && data.length > 0) {
        // Oref format (flat list)
        const sorted = data.map(a => ({ ...a, _ts: parseOrefDate(a.date, a.time) })).sort((a, b) => b._ts - a._ts);
        
        let current: AlertBatch | null = null;
        for (const alert of sorted) {
          // Identify clearance or pre-alerts from description
          let statusOverride = "";
          const desc = alert.category_desc || "";
          
          if (desc.includes("ניתן לצאת") || desc.includes("הסתיים")) {
            statusOverride = "clear";
          } else if (desc.includes("בדקות הקרובות") || desc.includes("מודיעין")) {
            statusOverride = "pre_alert";
          }

          // Batch within 2 minutes for AJAX results as they are more granular
          if (!current || Math.abs(current.startTs - alert._ts) > 120000) {
            current = { id: `oref_${alert._ts}_${alert.rid}`, startTs: alert._ts, endTs: alert._ts, alerts: [], byCategory: new Map() };
            processed.push(current);
          }
          
          const alertWithStatus = { ...alert, status: statusOverride };
          current.alerts.push(alertWithStatus);
          current.startTs = Math.min(current.startTs, alert._ts);
          
          const cfg = statusOverride ? CATEGORY_MAP[statusOverride] : (CATEGORY_MAP[alert.category] || CATEGORY_MAP[1]);
          const catKey = cfg.category;
          
          const list = current.byCategory.get(catKey) || [];
          if (!list.includes(alert.data)) {
            list.push(alert.data);
            current.byCategory.set(catKey, list);
          }
        }
      }
      setExternalBatches(processed);
    } catch (err) {
      console.error("External AJAX history error:", err);
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
      // Use 15-second buckets for deduplication between sources
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
