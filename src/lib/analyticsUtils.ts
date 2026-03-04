import type { OrefHistoryAlert } from "@/types";

// ── Helpers ──

function parseDateReliable(a: OrefHistoryAlert): Date {
  // Try alertDate first (may be ISO-ish)
  if (a.alertDate) {
    const d = new Date(a.alertDate);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: parse date field (DD.MM.YYYY) + time (HH:MM:SS)
  const [day, month, year] = a.date.split(".");
  if (a.time) {
    const [h, m, s] = a.time.split(":");
    return new Date(+year, +month - 1, +day, +h, +m, +(s ?? 0));
  }
  return new Date(+year, +month - 1, +day);
}

function parseHour(a: OrefHistoryAlert): number {
  const match = a.alertDate?.match(/[T ](\d{2}):/);
  if (match) return parseInt(match[1], 10);
  return parseInt(a.time?.split(":")[0] ?? "0", 10);
}

function parseDate(a: OrefHistoryAlert): Date {
  return parseDateReliable(a);
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

// ── Filter by time range ──

export function filterByRange(
  alerts: OrefHistoryAlert[],
  days: number | null,
): OrefHistoryAlert[] {
  if (days === null) return alerts; // "all time"
  const cutoff = Date.now() - days * 86400000;
  return alerts.filter((a) => parseDate(a).getTime() >= cutoff);
}

// ── Summary Stats ──

export interface SummaryStats {
  total: number;
  uniqueCities: number;
  avgPerDay: number;
  busiestDay: { date: string; count: number };
  totalDays: number;
  daysWithAlerts: number;
}

export function computeStats(
  alerts: OrefHistoryAlert[],
  rangeDays: number | null,
): SummaryStats {
  const citySet = new Set(alerts.map((a) => a.data));

  const byDate = new Map<string, number>();
  for (const a of alerts) {
    byDate.set(a.date, (byDate.get(a.date) ?? 0) + 1);
  }

  let busiestDay = { date: "", count: 0 };
  for (const [date, count] of byDate) {
    if (count > busiestDay.count) busiestDay = { date, count };
  }

  let totalDays: number;
  if (rangeDays !== null) {
    totalDays = rangeDays;
  } else {
    const warStart = new Date(2026, 1, 28);
    totalDays = Math.ceil((Date.now() - warStart.getTime()) / 86400000) || 1;
  }

  return {
    total: alerts.length,
    uniqueCities: citySet.size,
    avgPerDay: Math.round(alerts.length / Math.max(totalDays, 1)),
    busiestDay,
    totalDays,
    daysWithAlerts: byDate.size,
  };
}

// ── Top Cities ──

export function topCities(
  alerts: OrefHistoryAlert[],
  limit = 15,
): { city: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of alerts) {
    map.set(a.data, (map.get(a.data) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Hourly Distribution ──

export function hourlyDistribution(alerts: OrefHistoryAlert[]): number[] {
  const hours = new Array(24).fill(0);
  for (const a of alerts) {
    hours[parseHour(a)]++;
  }
  return hours;
}

// ── Daily Timeline ──

export function dailyTimeline(
  alerts: OrefHistoryAlert[],
): { date: string; label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of alerts) {
    const d = parseDate(a);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, count]) => {
      const [y, m, d] = dateKey.split("-");
      const dt = new Date(+y, +m - 1, +d);
      const dayName = HEBREW_DAYS[dt.getDay()];
      return {
        date: dateKey,
        label: `${dayName} ${d}.${m}`,
        count,
      };
    });
}

// ── Category Breakdown ──

export function categoryBreakdown(
  alerts: OrefHistoryAlert[],
): { category: number; desc: string; count: number; color: string }[] {
  const map = new Map<number, { desc: string; count: number }>();
  const colorMap: Record<number, string> = {
    1: "bg-red-500",
    2: "bg-purple-500",
    3: "bg-red-800",
    7: "bg-amber-600",
    8: "bg-amber-600",
    10: "bg-red-800",
    12: "bg-orange-500",
    14: "bg-blue-500",
  };

  const nameMap: Record<number, string> = {
    2: "התראות כלי טיס עוין",
  };

  for (const a of alerts) {
    const existing = map.get(a.category);
    if (existing) {
      existing.count++;
    } else {
      let desc = a.category_desc?.replace(/ - האירוע הסתיים$/, "") ?? `קטגוריה ${a.category}`;
      if (nameMap[a.category]) desc = nameMap[a.category];
      map.set(a.category, { desc, count: 1 });
    }
  }

  return [...map.entries()]
    .map(([category, { desc, count }]) => ({
      category,
      desc,
      count,
      color: colorMap[category] ?? "bg-gray-500",
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Peak Hours (specific date+hour windows with most alerts) ──

export function peakWindows(
  alerts: OrefHistoryAlert[],
  limit = 5,
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of alerts) {
    const d = parseDate(a);
    const key = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Alerts per city per day (heatmap data) ──

export function cityDayHeatmap(
  alerts: OrefHistoryAlert[],
  topN = 8,
): { cities: string[]; days: string[]; grid: number[][] } {
  // Get top cities
  const top = topCities(alerts, topN);
  const cities = top.map((c) => c.city);
  const citySet = new Set(cities);

  // Get unique days
  const daySet = new Map<string, string>();
  for (const a of alerts) {
    if (!citySet.has(a.data)) continue;
    const d = parseDate(a);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!daySet.has(key)) {
      daySet.set(key, `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  const sortedDays = [...daySet.entries()].sort(([a], [b]) => a.localeCompare(b));
  const days = sortedDays.map(([, label]) => label);
  const dayKeys = sortedDays.map(([key]) => key);

  // Build count grid: grid[cityIdx][dayIdx]
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
  const grid: number[][] = cities.map(() => new Array(days.length).fill(0));

  for (const a of alerts) {
    const ci = cities.indexOf(a.data);
    if (ci === -1) continue;
    const d = parseDate(a);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const di = dayIndex.get(key);
    if (di !== undefined) grid[ci][di]++;
  }

  return { cities, days, grid };
}

// ── Alert Frequency Trend (rolling average alerts/hour) ──

export function alertFrequencyByDay(
  alerts: OrefHistoryAlert[],
): { label: string; alertsPerHour: number }[] {
  const map = new Map<string, number>();
  for (const a of alerts) {
    const d = parseDate(a);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, count]) => {
      const [, m, d] = dateKey.split("-");
      return {
        label: `${d}.${m}`,
        alertsPerHour: Math.round((count / 24) * 10) / 10,
      };
    });
}
