"use client";

import { useMemo } from "react";
import { NotificationSettings } from "@/hooks/useNotificationSettings";

interface SettingsPanelProps {
  settings: NotificationSettings;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
  toggleCity: (city: string) => void;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  onThemeChange: (theme: "light" | "dark") => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  cityList: string[];
  citySearch: string;
  setCitySearch: (s: string) => void;
  onBack: () => void;
  handleDarkSecretTap?: () => void;
}

export function SettingsPanel({
  settings,
  updateSettings,
  toggleCity,
  permission,
  requestPermission,
  onThemeChange,
  onToggleFullscreen,
  isFullscreen,
  cityList,
  citySearch,
  setCitySearch,
  onBack,
  handleDarkSecretTap,
}: SettingsPanelProps) {
  const filteredCityOptions = useMemo(() => {
    if (citySearch.length < 2) return [];
    return cityList
      .filter((c) => c.includes(citySearch) && !settings.selectedCities.includes(c))
      .slice(0, 10);
  }, [cityList, citySearch, settings.selectedCities]);

  return (
    <div className="flex flex-col flex-1">
      <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2 flex-shrink-0">
        <button onClick={onBack} className="p-1 hover:bg-white/10 rounded-lg text-white/70">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-180">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <h3 className="text-base font-bold text-white/90">הגדרות</h3>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto scrollbar-thin pb-4">
        {/* Theme */}
        <div className="space-y-2.5">
          <SectionLabel>תצוגה</SectionLabel>
          <SectionLabel>ערכת נושא</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <ThemeBtn active={settings.theme === "light"} onClick={() => { updateSettings({ theme: "light" }); onThemeChange("light"); }}>בוקר</ThemeBtn>
            <ThemeBtn active={settings.theme === "auto"} accent="amber" onClick={() => updateSettings({ theme: "auto" })}>אוטומטי</ThemeBtn>
            <ThemeBtn active={settings.theme === "dark"} onClick={() => { updateSettings({ theme: "dark" }); onThemeChange("dark"); handleDarkSecretTap?.(); }}>לילה</ThemeBtn>
            <ThemeBtn active={settings.theme === "google"} accent="blue" onClick={() => { updateSettings({ theme: "google" }); onThemeChange("light"); }}>Google Maps</ThemeBtn>
          </div>

          <Toggle label='מסלול כטב"מ' desc="הצגת מסלול טיסה משוער וחיזוי" checked={settings.showUavPath} accentClass="bg-purple-600"
            onChange={() => updateSettings({ showUavPath: !settings.showUavPath })} />
          <Toggle label="המיקום שלי" desc="הצגת מיקום נוכחי ומרכוז בעת התרעה באזורך" checked={settings.showMyLocation} accentClass="bg-blue-600"
            onChange={() => updateSettings({ showMyLocation: !settings.showMyLocation })} />
          <Toggle label="מסך מלא" desc="הצגת המפה על פני כל המסך" checked={isFullscreen} accentClass="bg-blue-600"
            onChange={onToggleFullscreen} />
        </div>

        {/* Notifications */}
        <div className="space-y-2.5 pt-2">
          <SectionLabel>התראות</SectionLabel>

          {permission === "denied" && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 text-right">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[11px] text-red-300 font-medium leading-normal">ההתראות חסומות בדפדפן. יש לאפשר אותן בהגדרות האתר.</p>
            </div>
          )}
          {permission === "default" && settings.enabled && (
            <button onClick={requestPermission} className="w-full bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-xl p-3 text-[12px] font-bold animate-pulse text-center">
              לחץ כאן לאישור התראות בדפדפן
            </button>
          )}

          <Toggle
            label="התראות דפדפן" desc="קבל התראות גם כשהאפליקציה סגורה"
            checked={settings.enabled} accentClass="bg-blue-600"
            onChange={async () => {
              const next = !settings.enabled;
              if (next && permission === "default") {
                const r = await requestPermission();
                if (r !== "granted") { updateSettings({ enabled: false }); return; }
              }
              updateSettings({ enabled: next });
            }}
          />

          {settings.enabled && (
            <>
              <Toggle label="התרעות מוקדמות" labelClass="text-[#FF6A00]" desc="הנחיות שהייה בסמוך למרחב מוגן"
                checked={settings.earlyAlerts} accentClass="bg-[#FF6A00]"
                onChange={() => updateSettings({ earlyAlerts: !settings.earlyAlerts })} />
              <Toggle label="חזרה לשגרה" labelClass="text-green-400" desc='התראה כשהזמן המוגדר בממ"ד עבר'
                checked={settings.leaveShelterAlerts} accentClass="bg-green-600"
                onChange={() => updateSettings({ leaveShelterAlerts: !settings.leaveShelterAlerts })} />
              <Toggle label="מיקום נוכחי" desc="קבל התראות לפי המיקום שלך כעת"
                checked={settings.currentLocation} accentClass="bg-green-600"
                onChange={() => {
                  const v = !settings.currentLocation;
                  updateSettings({ currentLocation: v, allIsrael: v ? false : (settings.selectedCities.length === 0 ? true : settings.allIsrael) });
                }} />
              <Toggle label="כל הארץ" desc="קבל התראות מכל רחבי המדינה"
                checked={settings.allIsrael} accentClass="bg-purple-600"
                onChange={() => {
                  const v = !settings.allIsrael;
                  updateSettings({ allIsrael: v, ...(v ? { currentLocation: false } : {}) });
                }} />

              {!settings.allIsrael && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <SectionLabel>אזורי עניין</SectionLabel>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="חיפוש עיר/יישוב..."
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/30"
                    />
                    {filteredCityOptions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-[10] mt-1 bg-[#111113] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                        {filteredCityOptions.map((city) => (
                          <button key={city} onClick={() => { toggleCity(city); setCitySearch(""); }}
                            className="w-full text-right px-3 py-2 text-[12px] text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
                            {city}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.selectedCities.length === 0 && !settings.currentLocation && (
                      <p className="text-[10px] text-white/30 italic pr-1">לא נבחרו אזורים. הוסף עיר או אפשר מיקום.</p>
                    )}
                    {settings.selectedCities.map((city) => (
                      <div key={city} className="flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-full pl-1.5 pr-2.5 py-1">
                        <span className="text-[11px] font-bold text-white/90">{city}</span>
                        <button onClick={() => toggleCity(city)} className="text-white/40 hover:text-white/90">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-white/30 uppercase tracking-wider text-right pr-1">{children}</div>;
}

function ThemeBtn({ active, accent, onClick, children }: { active: boolean; accent?: "amber" | "blue"; onClick: () => void; children: React.ReactNode }) {
  const activeClass = accent === "amber"
    ? "bg-amber-500/30 text-amber-200 border border-amber-400/30"
    : accent === "blue"
    ? "bg-blue-500/30 text-blue-200 border border-blue-400/30"
    : "bg-white/20 text-white border border-white/20";
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${active ? activeClass : "bg-white/5 text-white/40 hover:bg-white/10"}`}>
      <span className="text-[12px] font-medium">{children}</span>
    </button>
  );
}

function Toggle({
  label, labelClass = "text-white", desc, checked, accentClass, onChange,
}: {
  label: string; labelClass?: string; desc: string; checked: boolean; accentClass: string; onChange: () => void;
}) {
  return (
    <div className="liquid-glass-subtle border border-white/5 rounded-xl p-3 flex items-center justify-between">
      <div className="flex flex-col text-right">
        <span className={`text-[13px] font-bold ${labelClass}`}>{label}</span>
        <span className="text-[10px] text-white/40 leading-tight">{desc}</span>
      </div>
      <button
        onClick={onChange}
        dir="ltr"
        className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? accentClass : "bg-white/10"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
