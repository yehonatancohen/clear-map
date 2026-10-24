/**
 * Groups rocket/missile alerts into salvos and estimates where each came from.
 *
 * Pure (no React, no fetch) so live alerts, the history log, replay and the
 * share card all agree. The source is an ESTIMATE from geography + whether
 * Oref sent an early warning first: nothing in Oref's data says "Iran" or
 * "Yemen", so long-range fire is labelled as such, never as a fact.
 */

export type LatLng = [number, number];

export interface SalvoEvent {
  city: string;
  /** alert | after_alert | pre_alert | clear (others are ignored) */
  status: string;
  ts: number;
}

export type SalvoSource = "long_range" | "lebanon" | "gaza" | "unknown";

export interface Salvo {
  id: string;
  source: SalvoSource;
  /** First event of the salvo (early warning if there was one). */
  startTs: number;
  firstAlertTs: number;
  lastAlertTs: number;
  /** Last official clear when ended, otherwise the last red alert. */
  endTs: number;
  /** Every alerted zone got an official Oref "event ended". */
  ended: boolean;
  alertCities: string[];
  /** Warned in advance but never got a red alert. */
  warnedCities: string[];
  clearedCities: string[];
  /** region → number of alerted zones */
  regions: Record<string, number>;
  /** Early warning → first red alert, in seconds (long-range only). */
  leadSec: number | null;
  spreadKm: number;
  /** Deduped, chronological — what replay steps through. */
  events: SalvoEvent[];
}

export interface SalvoGeo {
  centroids: Record<string, LatLng>;
  regions: Record<string, string>;
}

export const SOURCE_META: Record<SalvoSource, { label: string; hint: string | null }> = {
  long_range: { label: "ירי ארוך טווח", hint: "איראן / תימן" },
  lebanon: { label: "ירי מלבנון", hint: null },
  gaza: { label: "ירי מעזה", hint: null },
  unknown: { label: "ירי רקטות וטילים", hint: null },
};

/** Red alerts more than this far apart start a new salvo. */
const CHAIN_GAP_MS = 4 * 60_000;
/** Oref's early warning precedes long-range fire by up to ~12 min (backend TTL). */
const WARNING_WINDOW_MS = 15 * 60_000;
/** Clears that close a salvo usually come 10–30 min after the last alert. */
const CLEAR_WINDOW_MS = 60 * 60_000;
/** Same zone + status within this window is one event (Oref vs Firebase skew). */
const DEDUPE_MS = 90_000;

const GAZA_LINE: LatLng[] = [[31.58, 34.52], [31.42, 34.38], [31.29, 34.25]];
const GAZA_RANGE_KM = 45;
const LEBANON_MIN_LAT = 32.55;
/** Unwarned fire this wide, away from both borders, is still long range. */
const WIDE_MIN_ZONES = 20;
const WIDE_MIN_KM = 25;
/** Border fire concurrent with a long-range salvo stays separate if it is this tight. */
const BORDER_MAX_KM = 50;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normStatus(status: string): "alert" | "pre_alert" | "clear" | null {
  if (status === "alert" || status === "after_alert") return "alert";
  if (status === "pre_alert") return "pre_alert";
  if (status === "clear") return "clear";
  return null;
}

/** Border zone a zone is exposed to when fire comes without early warning. */
function borderZone(city: string, geo: SalvoGeo): "lebanon" | "gaza" | "other" {
  const c = geo.centroids[city];
  if (!c) return "other";
  if (c[0] >= LEBANON_MIN_LAT || geo.regions[city] === "צפון") return "lebanon";
  if (c[0] < 31.85 && GAZA_LINE.some((p) => haversineKm(c, p) <= GAZA_RANGE_KM)) return "gaza";
  return "other";
}

function dedupe(events: SalvoEvent[]): SalvoEvent[] {
  const out: SalvoEvent[] = [];
  const last = new Map<string, number>();
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    const status = normStatus(e.status);
    if (!status || !e.city || !Number.isFinite(e.ts)) continue;
    const k = `${e.city}|${status}`;
    const prev = last.get(k);
    if (prev !== undefined && e.ts - prev < DEDUPE_MS) continue;
    last.set(k, e.ts);
    out.push({ city: e.city, status, ts: e.ts });
  }
  return out;
}

function spreadOf(cities: string[], geo: SalvoGeo): number {
  const pts = cities.map((c) => geo.centroids[c]).filter(Boolean);
  let max = 0;
  // Extremes along lat/lng are enough for a "how wide" figure; avoids O(n²) on 500-zone waves.
  const ext = [0, 1].flatMap((i) => {
    const s = [...pts].sort((a, b) => a[i] - b[i]);
    return s.length ? [s[0], s[s.length - 1]] : [];
  });
  for (const a of ext) for (const b of ext) max = Math.max(max, haversineKm(a, b));
  return Math.round(max);
}

/** Salvos, newest first. Only salvos with at least one red alert are returned. */
export function detectSalvos(input: SalvoEvent[], geo: SalvoGeo): Salvo[] {
  const events = dedupe(input);
  const alerts = events.filter((e) => e.status === "alert");
  const warnings = events.filter((e) => e.status === "pre_alert");
  const clears = events.filter((e) => e.status === "clear");

  // Was this zone warned shortly before? (Same zone only: a region-wide match would
  // pull Hezbollah fire into an Iranian salvo whenever both hit the north.)
  const warnedAt = new Map<string, number[]>();
  for (const w of warnings) (warnedAt.get(w.city) ?? warnedAt.set(w.city, []).get(w.city)!).push(w.ts);
  const warnedBefore = (e: SalvoEvent) =>
    (warnedAt.get(e.city) ?? []).some((ts) => ts <= e.ts + 30_000 && e.ts - ts <= WARNING_WINDOW_MS);

  // 1. Chain red alerts per "lane": early-warned fire is long range; the rest by border.
  type Chain = { lane: string; items: SalvoEvent[] };
  const open = new Map<string, Chain>();
  const chains: Chain[] = [];
  for (const e of alerts) {
    const lane = warnedBefore(e) ? "long" : borderZone(e.city, geo);
    const cur = open.get(lane);
    if (cur && e.ts - cur.items[cur.items.length - 1].ts <= CHAIN_GAP_MS) {
      cur.items.push(e);
    } else {
      const next = { lane, items: [e] };
      open.set(lane, next);
      chains.push(next);
    }
  }

  // 2. Early-warning data has gaps (older history, partial coverage), so geography helps:
  //    wide unwarned fire deep inside the country is long range too, and anything that
  //    overlaps a long-range salvo joins it unless it stays tight against a border.
  const chainSpread = (c: Chain) => spreadOf([...new Set(c.items.map((e) => e.city))], geo);
  for (const c of chains) {
    if (c.lane === "other" && (new Set(c.items.map((e) => e.city)).size >= WIDE_MIN_ZONES || chainSpread(c) >= WIDE_MIN_KM)) c.lane = "long";
  }
  const longChains = chains.filter((c) => c.lane === "long");
  const overlaps = (a: Chain, b: Chain) =>
    a.items[0].ts <= b.items[b.items.length - 1].ts + CHAIN_GAP_MS && a.items[a.items.length - 1].ts >= b.items[0].ts - CHAIN_GAP_MS;
  const merged: Chain[] = [];
  for (const c of chains) {
    if (c.lane !== "long" && (c.lane === "other" || chainSpread(c) >= BORDER_MAX_KM)) {
      const host = longChains.find((l) => overlaps(c, l));
      if (host) {
        host.items.push(...c.items);
        host.items.sort((a, b) => a.ts - b.ts);
        continue;
      }
    }
    merged.push(c);
  }

  // 3. Build salvos with their early warnings and official clears.
  const salvos = merged.map((c): Salvo => {
    const source: SalvoSource =
      c.lane === "long" ? "long_range" : c.lane === "lebanon" ? "lebanon" : c.lane === "gaza" ? "gaza" : "unknown";
    const firstAlertTs = c.items[0].ts;
    const lastAlertTs = c.items[c.items.length - 1].ts;
    const alertCities = [...new Set(c.items.map((e) => e.city))];
    const alertSet = new Set(alertCities);

    const ownWarnings =
      source === "long_range"
        ? warnings.filter((w) => w.ts >= firstAlertTs - WARNING_WINDOW_MS && w.ts <= lastAlertTs)
        : [];
    const warnedCities = [...new Set(ownWarnings.map((w) => w.city))].filter((x) => !alertSet.has(x));
    const scope = new Set([...alertCities, ...warnedCities]);

    // Last red alert per zone: a clear only counts if it came after it.
    const lastHit = new Map<string, number>();
    for (const e of c.items) lastHit.set(e.city, e.ts);
    const ownClears = clears.filter(
      (cl) => scope.has(cl.city) && cl.ts >= firstAlertTs && cl.ts <= lastAlertTs + CLEAR_WINDOW_MS && cl.ts >= (lastHit.get(cl.city) ?? 0),
    );
    const clearedCities = [...new Set(ownClears.map((cl) => cl.city))];
    const clearedSet = new Set(clearedCities);
    const ended = alertCities.every((x) => clearedSet.has(x));

    const regions: Record<string, number> = {};
    for (const x of alertCities) {
      const r = geo.regions[x] ?? "אחר";
      regions[r] = (regions[r] ?? 0) + 1;
    }

    const startTs = Math.min(firstAlertTs, ...ownWarnings.map((w) => w.ts));
    const endTs = ended ? Math.max(lastAlertTs, ...ownClears.map((cl) => cl.ts)) : lastAlertTs;

    return {
      id: `${source}_${firstAlertTs}`,
      source,
      startTs,
      firstAlertTs,
      lastAlertTs,
      endTs,
      ended,
      alertCities,
      warnedCities,
      clearedCities,
      regions,
      leadSec: ownWarnings.length ? Math.round((firstAlertTs - startTs) / 1000) : null,
      spreadKm: spreadOf(alertCities, geo),
      events: [...ownWarnings, ...c.items, ...ownClears].sort((a, b) => a.ts - b.ts),
    };
  });

  return salvos.sort((a, b) => b.firstAlertTs - a.firstAlertTs);
}

/** "מטח" for real barrages, "שיגור" for a handful of zones. */
export function salvoNoun(s: Salvo): string {
  return s.alertCities.length >= 5 ? "מטח" : "שיגור";
}

/** e.g. "ירי ארוך טווח (איראן / תימן)" */
export function salvoTitle(s: Salvo): string {
  const meta = SOURCE_META[s.source];
  return meta.hint ? `${meta.label} (${meta.hint})` : meta.label;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "פחות מדקה";
  if (min < 60) return `${min} דק׳`;
  const h = Math.floor(min / 60);
  return `${h}:${String(min % 60).padStart(2, "0")} שע׳`;
}

/** Zones and their status at time t, for replay. */
export function salvoStateAt(s: Salvo, t: number): Map<string, "pre_alert" | "alert" | "clear"> {
  const state = new Map<string, "pre_alert" | "alert" | "clear">();
  for (const e of s.events) {
    if (e.ts > t) break;
    state.set(e.city, e.status as "pre_alert" | "alert" | "clear");
  }
  return state;
}

/** Same red as rocket alerts on the map. */
const ALERT_RED = "#FF2A2A";

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const ddmm = (ts: number) => new Date(ts).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });

/** "מרכז 54 · צפון 11", biggest first. */
export function regionsLine(s: Salvo): string {
  return Object.entries(s.regions)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r} ${n}`)
    .join(" · ");
}

/** Facts for a salvo, one short phrase each (card + share image + share text). */
export function salvoFacts(s: Salvo): string[] {
  const facts = [`${s.alertCities.length} יישובים`];
  if (s.leadSec !== null && s.leadSec >= 30) facts.push(`התרעה מוקדמת ${formatDuration(s.leadSec * 1000)} לפני`);
  facts.push(s.ended ? `הסתיים אחרי ${formatDuration(s.endTs - s.startTs)}` : "טרם התקבלה הודעת סיום");
  return facts;
}

export function salvoShareSummary(s: Salvo) {
  const meta = SOURCE_META[s.source];
  return {
    title: `${salvoNoun(s)} · ${meta.label}`,
    subtitle: `${meta.hint ? `${meta.hint} · ` : ""}מקור משוער לפי מיקום ההתרעות`,
    lines: [`${ddmm(s.firstAlertTs)} · ${hhmm(s.firstAlertTs)} · ${salvoFacts(s).join(" · ")}`, regionsLine(s)],
    accent: ALERT_RED,
  };
}

export function salvoShareText(s: Salvo): string {
  const sum = salvoShareSummary(s);
  const shown = s.alertCities.slice(0, 40).join(", ") + (s.alertCities.length > 40 ? ` ועוד ${s.alertCities.length - 40}` : "");
  return `🔴 ${sum.title} (${sum.subtitle})\n${sum.lines.join("\n")}\n\n${shown}\n\nhttps://clearmap.co.il`;
}

/** Quiet stretches longer than this are drawn at this length on the replay timeline. */
const AXIS_MAX_GAP_MS = 90_000;

export interface SalvoAxis {
  start: number;
  end: number;
  /** Timestamp → 0..1 along the timeline. */
  toPos: (ts: number) => number;
  /** 0..1 along the timeline → timestamp. */
  fromPos: (p: number) => number;
  /** Where quiet time was cut (0..1). */
  breaks: number[];
}

/**
 * Replay time axis with quiet stretches squeezed: early warning → fire → clears can
 * span 20+ minutes with all the action in two. Piecewise linear, so it inverts exactly.
 */
export function salvoAxis(s: Salvo): SalvoAxis {
  const times = [...new Set(s.events.map((e) => e.ts))].sort((a, b) => a - b);
  const stops = [{ ts: times[0], at: 0 }];
  const breaks: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    const prev = stops[stops.length - 1].at;
    if (gap > AXIS_MAX_GAP_MS) breaks.push(prev + AXIS_MAX_GAP_MS / 2);
    stops.push({ ts: times[i], at: prev + Math.min(gap, AXIS_MAX_GAP_MS) });
  }
  const total = Math.max(1, stops[stops.length - 1].at);
  const segment = <K extends "ts" | "at">(key: K, v: number) => {
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1][key] <= v) i++;
    return [stops[i], stops[Math.min(i + 1, stops.length - 1)]] as const;
  };
  return {
    start: times[0],
    end: times[times.length - 1],
    toPos: (ts) => {
      const [a, b] = segment("ts", ts);
      const at = b.ts === a.ts ? a.at : a.at + ((ts - a.ts) / (b.ts - a.ts)) * (b.at - a.at);
      return Math.max(0, Math.min(1, at / total));
    },
    fromPos: (p) => {
      const at = Math.max(0, Math.min(1, p)) * total;
      const [a, b] = segment("at", at);
      return b.at === a.at ? a.ts : a.ts + ((at - a.at) / (b.at - a.at)) * (b.ts - a.ts);
    },
    breaks: breaks.map((b) => b / total),
  };
}

/** How many of the salvo's events have happened by time t (events are chronological). */
export function eventsUpTo(s: Salvo, t: number): number {
  let n = 0;
  while (n < s.events.length && s.events[n].ts <= t) n++;
  return n;
}
