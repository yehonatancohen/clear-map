"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import {
  addPastHistory,
  clearCities,
  getDevSource,
  getSim,
  removeCities,
  resetSim,
  runSteps,
  setAlerts,
  setDevSource,
  setHealth,
  setUavTrack,
  stopScenario,
  subscribeSim,
  type DevSource,
  type SimHealth,
} from "@/lib/devSim";

/**
 * Development-only control panel (never rendered in production builds).
 * Drives the fake backend in lib/devSim so every UI path can be exercised
 * locally without touching production Firebase.
 */

type LatLng = [number, number];

const STATUSES: { id: string; label: string; cls: string }[] = [
  { id: "pre_alert", label: "מוקדמת", cls: "bg-amber-500/25 text-amber-200" },
  { id: "alert", label: "צבע אדום", cls: "bg-red-600/30 text-red-200" },
  { id: "after_alert", label: "להישאר במ״מ", cls: "bg-orange-500/25 text-orange-200" },
  { id: "uav", label: "כטב״מ", cls: "bg-purple-500/25 text-purple-200" },
  { id: "terrorist", label: "מחבלים", cls: "bg-rose-800/40 text-rose-200" },
];

const SOURCES: { id: DevSource; label: string }[] = [
  { id: "sim", label: "סימולציה" },
  { id: "firebase", label: "Firebase אמיתי" },
  { id: "poll", label: "/api/live (גיבוי)" },
];

const HEALTH: { id: SimHealth; label: string }[] = [
  { id: "ok", label: "תקין" },
  { id: "stale", label: "שרת תקוע" },
  { id: "source_down", label: "פקע״ר לא זמין" },
];

const TLV: LatLng = [32.08, 34.78];
const HAIFA: LatLng = [32.8, 35.0];
const JERUSALEM: LatLng = [31.77, 35.21];
const BEER_SHEVA: LatLng = [31.25, 34.79];
const KIRYAT_SHMONA: LatLng = [33.2, 35.57];
const WEST_GALILEE: LatLng = [33.05, 35.25];
const SDEROT: LatLng = [31.52, 34.6];

function km(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function useSim() {
  return useSyncExternalStore(subscribeSim, getSim, getSim);
}

export default function DevPanel() {
  // Starts collapsed on phones so the map stays visible.
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const [source] = useState<DevSource>(() => getDevSource());
  const sim = useSim();
  const { settings, userCoords, permission, requestPermission } = useNotificationSettings();
  const [centroids, setCentroids] = useState<Record<string, LatLng>>({});
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [scenario, setScenario] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/city-centroids.json")
      .then((r) => r.json())
      .then(setCentroids)
      .catch(() => {});
  }, []);

  const cities = useMemo(() => Object.keys(centroids).sort(), [centroids]);
  const near = (p: LatLng, radius: number) => cities.filter((c) => km(centroids[c], p) <= radius);

  const myZones = useMemo(() => {
    const zones = new Set<string>([...settings.people.map((p) => p.city), ...settings.selectedCities]);
    if (userCoords && cities.length) {
      const nearest = cities.reduce((best, c) => (km(centroids[c], userCoords) < km(centroids[best], userCoords) ? c : best));
      zones.add(nearest);
    }
    return [...zones].filter((z) => centroids[z]);
  }, [settings.people, settings.selectedCities, userCoords, cities, centroids]);

  const scenarios: { id: string; label: string; run: () => void }[] = [
    {
      id: "iran-center",
      label: "מטח איראני – גוש דן",
      run: () => {
        const warn = near(TLV, 45);
        const hit = near(TLV, 14);
        runSteps([
          [0, () => setAlerts(warn, "pre_alert")],
          [8, () => setAlerts(hit, "alert")],
          [23, () => setAlerts(hit, "after_alert")],
          [45, () => clearCities(warn)],
        ]);
      },
    },
    {
      id: "iran-wide",
      label: "גל ארצי (חיפה, דן, ירושלים, ב״ש)",
      run: () => {
        const centers = [HAIFA, TLV, JERUSALEM, BEER_SHEVA];
        const warn = [...new Set(centers.flatMap((c) => near(c, 30)))];
        const hit = [...new Set(centers.flatMap((c) => near(c, 9)))];
        runSteps([
          [0, () => setAlerts(warn, "pre_alert")],
          [10, () => setAlerts(hit, "alert")],
          [25, () => setAlerts(hit, "after_alert")],
          [50, () => clearCities(warn)],
        ]);
      },
    },
    {
      id: "north",
      label: "מטח מלבנון – גבול הצפון",
      run: () => {
        const hit = cities.filter((c) => centroids[c][0] > 32.95);
        runSteps([
          [0, () => setAlerts(hit, "alert")],
          [15, () => setAlerts(hit, "after_alert")],
          [40, () => clearCities(hit)],
        ]);
      },
    },
    {
      id: "long-plus-lebanon",
      label: "ארוך טווח + לבנון במקביל",
      run: () => {
        const warn = near(TLV, 40).concat(near(HAIFA, 10));
        const hit = near(TLV, 12).concat(near(HAIFA, 6));
        const galilee = near(WEST_GALILEE, 6);
        runSteps([
          [0, () => setAlerts(warn, "pre_alert")],
          [8, () => setAlerts(hit, "alert")],
          [10, () => setAlerts(galilee, "alert")],
          [25, () => setAlerts([...hit, ...galilee], "after_alert")],
          [50, () => clearCities([...warn, ...galilee])],
        ]);
      },
    },
    {
      id: "history-salvos",
      label: "היסטוריה: 3 מטחים (מיידי)",
      run: () => {
        // Back-dated so the salvo log fills at once; the live map is untouched.
        const now = Date.now();
        const min = (m: number) => now - m * 60_000;
        const north = near(KIRYAT_SHMONA, 12);
        const warn = near(TLV, 40).concat(near(HAIFA, 10));
        const hit = near(TLV, 14).concat(near(HAIFA, 7));
        const galilee = near(WEST_GALILEE, 6);
        const gaza = near(SDEROT, 10);
        // Oref sends a wave in pieces over a minute or two; clears trickle in.
        const spread = (status: string, cs: string[], fromMin: number, parts: number, everySec: number) =>
          Array.from({ length: parts }, (_, i) => ({
            status,
            cities: cs.filter((_, j) => j % parts === i),
            timestamp: min(fromMin) + i * everySec * 1000,
          }));
        addPastHistory([
          ...spread("alert", north, 95, 4, 20),
          ...spread("clear", north, 80, 3, 40),
          ...spread("pre_alert", warn, 56, 3, 25),
          ...spread("alert", hit, 50, 8, 15),
          ...spread("alert", galilee, 49.8, 2, 20),
          ...spread("clear", [...warn, ...galilee], 36, 6, 30),
          ...spread("alert", gaza, 14, 3, 15),
          ...spread("clear", gaza, 4, 2, 30),
        ]);
      },
    },
    {
      id: "uav",
      label: "חדירת כטב״מ לחיפה",
      run: () => {
        const path: LatLng[] = [[33.12, 35.3], [33.0, 35.2], [32.92, 35.1]];
        const predicted: LatLng[] = [[32.85, 35.03], [32.8, 35.0]];
        runSteps([
          [0, () => { setUavTrack("sim_uav_1", path.slice(0, 2), predicted, 225); setAlerts(near(path[1], 8), "uav"); }],
          [8, () => { setUavTrack("sim_uav_1", path, predicted, 230); setAlerts(near(path[2], 10), "uav"); }],
          [30, () => clearCities(near(path[1], 10).concat(near(path[2], 10)))],
        ]);
      },
    },
    {
      id: "terror",
      label: "חדירת מחבלים – עוטף",
      run: () => {
        const hit = cities.filter((c) => centroids[c][0] < 31.5 && centroids[c][1] < 34.62 && centroids[c][0] > 31.2);
        runSteps([
          [0, () => setAlerts(hit, "terrorist")],
          [40, () => clearCities(hit)],
        ]);
      },
    },
    {
      id: "mine",
      label: "האזורים שלי (אנשים/ערים/מיקום)",
      run: () => {
        runSteps([
          [0, () => setAlerts(myZones, "pre_alert")],
          [6, () => setAlerts(myZones, "alert")],
          [18, () => setAlerts(myZones, "after_alert")],
          [32, () => clearCities(myZones)],
        ]);
      },
    },
    {
      id: "timeout",
      label: "יציאה מהמפה בלי הודעת סיום",
      run: () => {
        runSteps([
          [0, () => setAlerts(myZones.length ? myZones : near(TLV, 5), "alert")],
          [10, () => removeCities(myZones.length ? myZones : near(TLV, 5))],
        ]);
      },
    },
  ];

  const active = Object.values(sim.alerts);
  const counts = STATUSES.map((s) => ({ ...s, n: active.filter((a) => a.status === s.id).length }));
  const matches = query.length >= 2 ? cities.filter((c) => c.includes(query) && !picked.includes(c)).slice(0, 8) : [];

  const switchSource = (s: DevSource) => {
    setDevSource(s);
    location.reload();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-3 z-[2000] rounded-full bg-fuchsia-600 px-3 py-2 text-xs font-bold text-white shadow-lg"
      >
        DEV {active.length > 0 && `· ${active.length}`}
      </button>
    );
  }

  const btn = "rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors";
  const ghost = `${btn} bg-white/10 text-white/80 hover:bg-white/20`;

  return (
    <div
      dir="rtl"
      className="fixed bottom-3 left-3 z-[2000] flex max-h-[85vh] w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-gray-950/95 text-white shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs font-bold text-fuchsia-300">DEV · בדיקות</span>
        <button onClick={() => setOpen(false)} className={ghost}>מזער</button>
      </div>

      <div className="space-y-3 overflow-y-auto px-3 py-3 text-[11px]">
        {/* Data source */}
        <Section title="מקור נתונים">
          <div className="flex flex-wrap gap-1">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => switchSource(s.id)}
                className={`${btn} ${source === s.id ? "bg-fuchsia-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {source !== "sim" && (
            <p className="text-white/50">נתונים אמיתיים מהפרודקשן (קריאה בלבד). הסימולציה פעילה רק במצב ״סימולציה״.</p>
          )}
        </Section>

        {source === "sim" && (
          <>
            {/* Scenarios */}
            <Section title="תרחישים (זמן מקוצר)">
              <div className="grid grid-cols-2 gap-1">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    disabled={!cities.length || (s.id === "mine" && myZones.length === 0)}
                    onClick={() => { setScenario(s.label); s.run(); }}
                    className={`${ghost} text-right disabled:opacity-30`}
                    title={s.id === "mine" && myZones.length === 0 ? "הוסף אנשים / ערים בהגדרות, או הפעל מיקום" : undefined}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {scenario && (
                <div className="flex items-center justify-between text-white/60">
                  <span>רץ: {scenario}</span>
                  <button className={ghost} onClick={() => { stopScenario(); setScenario(null); }}>עצור</button>
                </div>
              )}
              <p className="text-white/40">
                האזורים שלי: {myZones.length ? myZones.slice(0, 4).join(", ") + (myZones.length > 4 ? ` +${myZones.length - 4}` : "") : "אין"}
              </p>
            </Section>

            {/* Manual */}
            <Section title="ידני">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חפש יישוב / אזור…"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] outline-none focus:border-fuchsia-400"
              />
              {matches.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {matches.map((c) => (
                    <button key={c} className={ghost} onClick={() => { setPicked([...picked, c]); setQuery(""); }}>+ {c}</button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {myZones.length > 0 && (
                  <button className={ghost} onClick={() => setPicked([...new Set([...picked, ...myZones])])}>+ האזורים שלי</button>
                )}
                <button className={ghost} onClick={() => setPicked([...new Set([...picked, ...near(TLV, 10)])])}>+ גוש דן</button>
                <button className={ghost} onClick={() => setPicked([...new Set([...picked, ...near(HAIFA, 8)])])}>+ חיפה</button>
                {picked.length > 0 && <button className={ghost} onClick={() => setPicked([])}>נקה בחירה</button>}
              </div>
              {picked.length > 0 && (
                <>
                  <p className="text-white/60">
                    נבחרו {picked.length}: {picked.slice(0, 5).join(", ")}{picked.length > 5 ? "…" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {STATUSES.map((s) => (
                      <button key={s.id} className={`${btn} ${s.cls}`} onClick={() => setAlerts(picked, s.id)}>{s.label}</button>
                    ))}
                    <button className={`${btn} bg-emerald-600/30 text-emerald-200`} onClick={() => clearCities(picked)}>האירוע הסתיים</button>
                    <button className={ghost} onClick={() => removeCities(picked)}>הסר (בלי הודעה)</button>
                  </div>
                </>
              )}
            </Section>

            {/* Health */}
            <Section title="מצב השרת">
              <div className="flex gap-1">
                {HEALTH.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setHealth(h.id)}
                    className={`${btn} ${sim.health === h.id ? "bg-fuchsia-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
              <p className="text-white/40">״שרת תקוע״ מופיע אחרי ~5 שניות. אופליין: DevTools ← Network ← Offline.</p>
            </Section>

            {/* Active */}
            <Section title={`פעיל עכשיו (${active.length})`}>
              <div className="flex flex-wrap gap-1">
                {counts.filter((c) => c.n > 0).map((c) => (
                  <span key={c.id} className={`${btn} ${c.cls}`}>{c.label}: {c.n}</span>
                ))}
                {Object.keys(sim.clears).length > 0 && (
                  <span className={`${btn} bg-emerald-600/20 text-emerald-200`}>הסתיים: {Object.keys(sim.clears).length}</span>
                )}
              </div>
              <button className={`${btn} w-full bg-red-900/50 text-red-100 hover:bg-red-900/70`} onClick={() => { resetSim(); setScenario(null); }}>
                איפוס הכל
              </button>
            </Section>
          </>
        )}

        {/* Notifications */}
        <Section title="התראות דפדפן">
          <p className="text-white/60">
            הרשאה: <b>{permission}</b> · התראות באתר: <b>{settings.enabled ? "פועל" : "כבוי"}</b>
            {settings.people.length > 0 && <> · אנשים: <b>{settings.people.length}</b></>}
          </p>
          {permission !== "granted" && (
            <button className={ghost} onClick={() => requestPermission()}>אשר התראות</button>
          )}
        </Section>

        {/* Other views */}
        <Section title="תצוגות נוספות (מסונכרנות לסימולציה)">
          <div className="flex flex-wrap gap-1">
            <a className={ghost} href="/embed" target="_blank" rel="noreferrer">הטמעה</a>
            <a className={ghost} href="/embed?theme=light" target="_blank" rel="noreferrer">הטמעה בהירה</a>
            <a className={ghost} href="/broadcast" target="_blank" rel="noreferrer">שידור</a>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/40">{title}</div>
      {children}
    </div>
  );
}
