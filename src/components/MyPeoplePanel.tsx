"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { ZONE_META, formatClock, formatSince, type ZoneStatus } from "@/hooks/useZoneStatus";

const MAX_PEOPLE = 12;

interface MyPeoplePanelProps {
  cityList: string[];
  statusOf: (city: string) => ZoneStatus;
  locationZone: string | null;
  onClose: () => void;
}

/**
 * "My people": follow the exact Oref zones of family and friends and see at a
 * glance who is in the shelter, who can leave, and who is fine.
 */
export function MyPeoplePanel({ cityList, statusOf, locationZone, onClose }: MyPeoplePanelProps) {
  const { settings, updateSettings, permission, userCoords } = useNotificationSettings();
  const people = settings.people ?? [];
  const [name, setName] = useState("");
  const [zoneQuery, setZoneQuery] = useState("");
  const [zone, setZone] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (zone || zoneQuery.trim().length < 2) return [];
    const q = zoneQuery.trim();
    return cityList.filter((c) => c.includes(q)).sort((a, b) => Number(!a.startsWith(q)) - Number(!b.startsWith(q))).slice(0, 8);
  }, [cityList, zoneQuery, zone]);

  const canAdd = name.trim().length > 0 && !!zone && people.length < MAX_PEOPLE;

  function add() {
    if (!canAdd || !zone) return;
    const person: Person = { name: name.trim().slice(0, 20), city: zone };
    updateSettings({ people: [...people, person] });
    setName("");
    setZone(null);
    setZoneQuery("");
  }

  // Stops using the location everywhere (map dot, "me" row, shelter card, location
  // notifications). Same fallback as the settings toggle so notifications never go silent.
  function locationOff() {
    updateSettings({
      showMyLocation: false,
      currentLocation: false,
      ...(settings.currentLocation && settings.selectedCities.length === 0 ? { allIsrael: true } : {}),
    });
  }

  function remove(i: number) {
    updateSettings({ people: people.filter((_, j) => j !== i) });
  }

  // Most urgent first, then in the order the user added them
  const rows = people
    .map((p, i) => ({ p, i, status: statusOf(p.city) }))
    .sort((a, b) => ZONE_META[a.status.state].severity - ZONE_META[b.status.state].severity || a.i - b.i);

  return (
    <div
      className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass glass-pop rounded-3xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-96 glass-overlay max-w-md max-h-[80vh] flex flex-col"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2 flex-shrink-0">
        <h3 className="text-base font-bold text-white/90">האנשים שלי</h3>
        <button onClick={onClose} aria-label="סגור" className="glass-btn-filled h-8 w-8 rounded-full text-white/70">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto scrollbar-thin flex-1 pb-1">
        {/* Me */}
        {locationZone ? (
          <PersonRow name="אני" zone={locationZone} status={statusOf(locationZone)} tag="מיקום נוכחי" onRemove={locationOff} removeLabel="כיבוי המיקום שלי" />
        ) : settings.showMyLocation || settings.currentLocation ? (
          <div className="liquid-glass-subtle rounded-xl p-3 flex items-center gap-3 text-[12px] text-white/50">
            <span className="flex-1 text-right">
              {userCoords ? "המיקום שלך מחוץ לאזורי ההתרעה" : "ממתין למיקום… יש לאשר גישה למיקום בדפדפן"}
            </span>
            <button onClick={locationOff} className="text-blue-300 font-bold hover:text-blue-200 flex-shrink-0">
              כיבוי מיקום
            </button>
          </div>
        ) : (
          <button
            onClick={() => updateSettings({ showMyLocation: true })}
            className="w-full liquid-glass-subtle rounded-xl p-3 text-right text-[12px] text-blue-300 font-bold hover:bg-white/5"
          >
            + הצגת הסטטוס שלי לפי מיקום
          </button>
        )}

        {rows.map(({ p, i, status }) => (
          <PersonRow key={`${p.name}_${p.city}_${i}`} name={p.name} zone={p.city} status={status} onRemove={() => remove(i)} />
        ))}

        {people.length === 0 && (
          <p className="text-[12px] text-white/50 leading-relaxed px-1 py-2">
            הוסיפו את בני המשפחה והחברים לפי היישוב או האזור שבו הם נמצאים, ותראו כאן מי במרחב המוגן ומי כבר יכול לצאת.
          </p>
        )}

        {/* Add */}
        {people.length < MAX_PEOPLE && (
          <div className="liquid-glass-subtle rounded-xl p-3 space-y-2 mt-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם (למשל: אמא)"
                aria-label="שם"
                className="w-28 flex-shrink-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[13px] text-white focus:outline-none focus:border-white/30"
              />
              <div className="relative flex-1">
                <input
                  type="text"
                  value={zone ?? zoneQuery}
                  onChange={(e) => { setZone(null); setZoneQuery(e.target.value); }}
                  placeholder="יישוב / אזור"
                  aria-label="יישוב או אזור"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[13px] text-white focus:outline-none focus:border-white/30"
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-[10] mt-1 bg-[#111113] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                    {suggestions.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setZone(c); setZoneQuery(""); }}
                        className="w-full text-right px-3 py-2 text-[12px] text-white/80 hover:bg-white/10 border-b border-white/5 last:border-0"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={add}
              disabled={!canAdd}
              className="w-full bg-blue-600/25 text-blue-200 border border-blue-500/30 rounded-xl py-2 text-[12px] font-bold disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.98]"
            >
              הוספה
            </button>
          </div>
        )}

        <p className="text-[10px] text-white/40 leading-snug px-1 pt-1">
          {settings.enabled && permission === "granted"
            ? "תקבלו התראה כשיש התרעה או סיום אירוע באזור של אחד מהם. "
            : "הפעילו התראות בהגדרות כדי לקבל עדכון כשיש התרעה באזור שלהם. "}
          הרשימה נשמרת במכשיר, וכשההתראות מופעלות היא נשמרת גם בשרת ההתראות (לא ציבורי) כדי לשלוח לכם עדכונים עליהם. המידע אינו תחליף להנחיות פיקוד העורף.
        </p>
      </div>
    </div>
  );
}

function PersonRow({
  name, zone, status, tag, onRemove, removeLabel,
}: {
  name: string;
  zone: string;
  status: ZoneStatus;
  tag?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const meta = ZONE_META[status.state];
  const urgent = meta.severity === 0;
  const detail =
    status.state === "clear" && status.at ? `הודעת פיקוד העורף ${formatClock(status.at)}`
    : status.at && meta.severity <= 1 ? formatSince(status.at)
    : "";

  return (
    <div
      className="liquid-glass-subtle rounded-xl p-3 flex items-center gap-3"
      style={status.state !== "quiet" ? { boxShadow: `inset 3px 0 0 ${meta.color}` } : undefined}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full flex-shrink-0${urgent ? " status-dot-pulse" : ""}`}
        style={{ background: meta.color }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-bold text-white truncate">{name}</span>
          <span className="text-[11px] text-white/50 truncate">{zone}</span>
          {tag && <span className="text-[10px] text-blue-300/80 flex-shrink-0">{tag}</span>}
        </div>
        <div className="text-[12px] font-bold leading-tight" style={{ color: meta.color }}>
          {meta.label}
          {detail && <span className="font-normal text-white/50"> · {detail}</span>}
        </div>
      </div>
      {onRemove && (
        <button onClick={onRemove} aria-label={removeLabel ?? `הסרת ${name}`} title={removeLabel} className="text-white/30 hover:text-white/80 p-1 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
