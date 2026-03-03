"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrefHistory } from "@/hooks/useOrefHistory";
import {
  filterByRange,
  computeStats,
  topCities,
  hourlyDistribution,
  dailyTimeline,
  categoryBreakdown,
  peakWindows,
  cityDayHeatmap,
} from "@/lib/analyticsUtils";

// ── Constants ──

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: "3 ימים", days: 3 },
  { label: "7 ימים", days: 7 },
  { label: "14 ימים", days: 14 },
  { label: "30 ימים", days: 30 },
  { label: "הכל", days: null },
];

// ── Loading Screen ──

function LoadingScreen({
  progress,
  loadedMonths,
  totalMonths,
}: {
  progress: number;
  loadedMonths: number;
  totalMonths: number;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold text-white">טוען נתונים היסטוריים...</h1>
      <p className="text-sm text-white/50">
        חודש {loadedMonths} מתוך {totalMonths}
      </p>
      <div className="w-full max-w-md h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-500 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-white/30">{progress}%</p>
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="liquid-glass rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-xs text-white/40 font-medium">{label}</span>
      <span className="text-2xl font-bold text-white tabular-nums">{value.toLocaleString()}</span>
      {sub && <span className="text-[11px] text-white/30">{sub}</span>}
    </div>
  );
}

// ── Section Wrapper ──

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`liquid-glass rounded-2xl p-5 ${className}`}>
      <h2 className="text-sm font-bold text-white/70 mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Horizontal Bar Chart ──

function HorizontalBars({
  data,
  color = "bg-red-500/70",
}: {
  data: { label: string; value: number; color?: string }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 sm:gap-3">
          <span className="w-20 sm:w-28 text-[11px] sm:text-[12px] text-white/60 text-left truncate shrink-0">
            {d.label}
          </span>
          <div className="flex-1 h-4 sm:h-5 bg-white/5 rounded-lg overflow-hidden">
            <div
              className={`h-full rounded-lg transition-all duration-700 ${d.color ?? color}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 sm:w-14 text-[11px] sm:text-[12px] text-white/40 tabular-nums text-left shrink-0">
            {d.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Vertical Bar Chart ──

function VerticalBars({
  data,
  highlightMax = true,
  baseColor = "bg-red-500/40",
  highlightColor = "bg-red-400",
}: {
  data: { label: string; value: number }[];
  highlightMax?: boolean;
  baseColor?: string;
  highlightColor?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const maxIdx = data.findIndex((d) => d.value === max);

  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0">
          <span className="text-[9px] text-white/30 tabular-nums">
            {d.value > 0 ? d.value.toLocaleString() : ""}
          </span>
          <div
            className={`w-full rounded-t-md transition-all duration-700 ${highlightMax && i === maxIdx ? highlightColor : baseColor
              }`}
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
          />
          <span className="text-[10px] text-white/40 leading-none truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Heatmap ──

function Heatmap({
  cities,
  days,
  grid,
}: {
  cities: string[];
  days: string[];
  grid: number[][];
}) {
  const max = Math.max(...grid.flat(), 1);

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <div style={{ minWidth: Math.max(days.length * 32 + 100, 300) }}>
        {/* Day headers */}
        <div className="flex gap-[2px] mb-1" style={{ marginRight: 100 }}>
          {days.map((d) => (
            <div
              key={d}
              className="text-[9px] text-white/30 text-center"
              style={{ width: 28 }}
            >
              {d}
            </div>
          ))}
        </div>
        {/* City rows */}
        {cities.map((city, ci) => (
          <div key={city} className="flex items-center gap-[2px] mb-[2px]">
            <span className="w-[100px] text-[11px] text-white/50 truncate shrink-0 text-left">
              {city}
            </span>
            {grid[ci].map((count, di) => {
              const intensity = count > 0 ? Math.max(0.15, count / max) : 0;
              return (
                <div
                  key={di}
                  className="rounded-sm"
                  style={{
                    width: 28,
                    height: 20,
                    backgroundColor: count > 0
                      ? `rgba(239, 68, 68, ${intensity})`
                      : "rgba(255,255,255,0.03)",
                  }}
                  title={`${city} · ${days[di]} · ${count} התרעות`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Range Picker ──

function RangePicker({
  selected,
  onChange,
}: {
  selected: number | null;
  onChange: (days: number | null) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.days)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selected === opt.days
              ? "bg-red-500 text-white"
              : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main View ──

export default function AnalyticsView() {
  const { alerts: allAlerts, loading, progress, loadedMonths, totalMonths, error } =
    useOrefHistory();

  const [rangeDays, setRangeDays] = useState<number | null>(7);

  const alerts = useMemo(
    () => filterByRange(allAlerts, rangeDays),
    [allAlerts, rangeDays],
  );

  const stats = useMemo(() => (alerts.length ? computeStats(alerts, rangeDays) : null), [alerts, rangeDays]);
  const cities = useMemo(() => topCities(alerts, 10), [alerts]);
  const hourly = useMemo(() => hourlyDistribution(alerts), [alerts]);
  const daily = useMemo(() => dailyTimeline(alerts), [alerts]);
  const categories = useMemo(() => categoryBreakdown(alerts), [alerts]);
  const peaks = useMemo(() => peakWindows(alerts, 5), [alerts]);
  const heatmap = useMemo(() => cityDayHeatmap(alerts, 8), [alerts]);

  const isEmpty = !loading && !error && alerts.length === 0;

  if (loading) {
    return (
      <LoadingScreen
        progress={progress}
        loadedMonths={loadedMonths}
        totalMonths={totalMonths}
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const rangeLabel = rangeDays !== null
    ? `${rangeDays} ימים אחרונים`
    : "מאז תחילת המלחמה";

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 liquid-glass border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-base font-bold tracking-tight">מפה שקופה</span>
          <Link
            href="/"
            className="text-xs text-white/50 hover:text-white/80 transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            חזרה למפה
          </Link>
        </div>
      </nav>

      {/* ─── Content ── */}
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Hero + Range Picker */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">סטטיסטיקות ומגמות</h1>
            <p className="text-sm text-white/40">
              {rangeLabel} · {alerts.length.toLocaleString()} התרעות
            </p>
          </div>
          <RangePicker selected={rangeDays} onChange={setRangeDays} />
        </div>

        {isEmpty ? (
          <div className="liquid-glass rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 mt-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/20">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2 className="text-lg font-bold text-white/70">לא נמצאו התרעות</h2>
            <p className="text-sm text-white/40 max-w-sm">
              בטווח הזמן הנבחר לא נרשמו התרעות במערכת. נסו לבחור טווח זמן ארוך יותר.
            </p>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="סה״כ התרעות" value={stats.total} />
                <StatCard label="ישובים שהותרעו" value={stats.uniqueCities} />
                <StatCard label="ממוצע ליום" value={stats.avgPerDay} />
                <StatCard
                  label="היום העמוס ביותר"
                  value={stats.busiestDay.count.toLocaleString()}
                  sub={stats.busiestDay.date}
                />
              </div>
            )}

            {/* Daily Timeline */}
            {daily.length > 0 && (
              <Section title="התרעות לפי יום">
                <div className="overflow-x-auto -mx-5 px-5">
                  <div style={{ minWidth: Math.max(daily.length * 48, 300) }}>
                    <VerticalBars
                      data={daily.map((d) => ({ label: d.label, value: d.count }))}
                      baseColor="bg-red-500/30"
                      highlightColor="bg-red-400"
                    />
                  </div>
                </div>
              </Section>
            )}

            {/* Top Cities */}
            <Section title="הישובים המותרעים ביותר">
              <HorizontalBars
                data={cities.map((c) => ({ label: c.city, value: c.count }))}
              />
            </Section>

            {/* Hourly Distribution + Peak Windows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Section title="התרעות לפי שעה ביממה" className="md:col-span-2">
                <VerticalBars
                  data={hourly.map((count, i) => ({
                    label: `${i}`,
                    value: count,
                  }))}
                />
              </Section>

              <Section title="שעות השיא">
                <div className="flex flex-col gap-3">
                  {peaks.map((p, i) => (
                    <div key={p.label} className="flex items-center gap-3">
                      <span className="text-lg font-bold text-white/20 w-6">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-[13px] font-medium text-white/80">{p.label}</p>
                        <p className="text-[11px] text-white/30">
                          {p.count.toLocaleString()} התרעות
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            {/* Category Breakdown */}
            {categories.length > 0 && (
              <Section title="סוגי התרעות">
                <HorizontalBars
                  data={categories.map((c) => ({
                    label: c.desc,
                    value: c.count,
                    color: c.color,
                  }))}
                />
              </Section>
            )}

            {/* City × Day Heatmap */}
            {heatmap.days.length > 1 && heatmap.cities.length > 0 && (
              <Section title="מפת חום — ישובים × ימים">
                <Heatmap
                  cities={heatmap.cities}
                  days={heatmap.days}
                  grid={heatmap.grid}
                />
              </Section>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-[10px] text-white/20">
          מקור הנתונים: פיקוד העורף · הנתונים מתעדכנים עם כל ביקור בדף
        </div>
      </div>
    </div>
  );
}
