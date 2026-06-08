"use client";

import { NotificationSettings } from "@/hooks/useNotificationSettings";
import { SettingsPanel } from "./SettingsPanel";

interface AboutPanelProps {
  view: "about" | "settings";
  onViewChange: (v: "about" | "settings") => void;
  onClose: () => void;
  isStandalonePwa: boolean;
  isCapturing: boolean;
  onShare: () => void;
  onTelegramInfo: () => void;
  onInstallTutorial: () => void;
  // SettingsPanel props
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
  handleDarkSecretTap?: () => void;
}

export function AboutPanel({
  view,
  onViewChange,
  onClose,
  isStandalonePwa,
  isCapturing,
  onShare,
  onTelegramInfo,
  onInstallTutorial,
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
  handleDarkSecretTap,
}: AboutPanelProps) {
  return (
    <div
      className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-96 glass-overlay max-w-sm max-h-[85vh] overflow-y-auto flex flex-col"
      dir="rtl"
    >
      <div className="about-shimmer absolute inset-0 rounded-2xl pointer-events-none" />

      {view === "settings" ? (
        <SettingsPanel
          settings={settings}
          updateSettings={updateSettings}
          toggleCity={toggleCity}
          permission={permission}
          requestPermission={requestPermission}
          onThemeChange={onThemeChange}
          onToggleFullscreen={onToggleFullscreen}
          isFullscreen={isFullscreen}
          cityList={cityList}
          citySearch={citySearch}
          setCitySearch={setCitySearch}
          onBack={() => onViewChange("about")}
          handleDarkSecretTap={handleDarkSecretTap}
        />
      ) : (
        <AboutView
          isStandalonePwa={isStandalonePwa}
          isCapturing={isCapturing}
          onShare={onShare}
          onSettings={() => onViewChange("settings")}
          onTelegramInfo={onTelegramInfo}
          onInstallTutorial={onInstallTutorial}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function AboutView({
  isStandalonePwa, isCapturing, onShare, onSettings, onTelegramInfo, onInstallTutorial, onClose,
}: {
  isStandalonePwa: boolean; isCapturing: boolean;
  onShare: () => void; onSettings: () => void; onTelegramInfo: () => void;
  onInstallTutorial: () => void; onClose: () => void;
}) {
  return (
    <div className="flex flex-col flex-1">
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <h3 className="text-base font-bold text-white/90 flex items-center gap-2">
          מפה שקופה
          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/70 font-medium">v1.2</span>
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="mb-4 text-right overflow-y-auto scrollbar-thin">
        <p className="text-[12px] text-white/80 leading-relaxed mb-3">
          מפה שקופה היא פרויקט <strong className="text-white">בהתנדבות מלאה</strong> לטובת הציבור. המערכת משלבת דיווחי פיקוד העורף רשמיים עם מקורות מודיעין גלוי.
        </p>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-3">
          <p className="text-[11px] text-amber-200/80 leading-snug">
            העלויות של החזקת השרתים עולות ככל שיש יותר משתמשים. אם אתם מוצאים ערך במערכת, נשמח לעזרתכם.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-white/50 text-right">
            פותח על ידי <strong className="text-white">יהונתן כהן</strong><br />
            <a href="mailto:yoncohenyon@gmail.com" className="hover:text-white transition-colors underline underline-offset-2">ליצור קשר</a>
          </p>
          <a href="https://buymeacoffee.com/yehonatancohen" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-bold bg-[#FFDD00] text-black px-3 py-1.5 rounded-lg hover:bg-[#FFDD00]/90 transition-colors shadow-lg shadow-amber-500/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            תמיכה בפרויקט
          </a>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <button onClick={onShare} disabled={isCapturing}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 bg-white/10 hover:bg-white/15 transition-all border border-white/10 active:scale-[0.98] ${isCapturing ? "opacity-50 pointer-events-none" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>
          </svg>
          <span className="text-[12px] font-bold text-white/80">שתף</span>
        </button>
        <a href="https://t.me/clearmapchannel" target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 bg-[#0088cc]/20 text-[#0088cc] hover:bg-[#0088cc]/30 border border-[#0088cc]/30 active:scale-[0.98] transition-all">
          <span className="text-[12px] font-bold">טלגרם</span>
        </a>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-4 flex-shrink-0">
        <NavRow icon={<SettingsIcon />} label="הגדרות" onClick={onSettings} />
        <NavRow icon={<TelegramIcon />} label="ערוצי כתבים וחדשות" onClick={onTelegramInfo} accent="blue" />
        {!isStandalonePwa && (
          <NavRow icon={<DownloadIcon />} label="הוסף למסך הבית" onClick={onInstallTutorial} accent="blue" subtle />
        )}
      </div>
    </div>
  );
}

function NavRow({ icon, label, onClick, accent, subtle }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: "blue"; subtle?: boolean }) {
  const cls = accent
    ? subtle
      ? "bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20"
      : "bg-[#0088cc]/10 hover:bg-[#0088cc]/20 text-[#0088cc] border border-[#0088cc]/20"
    : "bg-white/10 hover:bg-white/15 text-white border border-white/10";
  return (
    <button onClick={onClick} className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl transition-all shadow-lg active:scale-[0.98] ${cls}`}>
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-[13px] font-bold">{label}</span>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-30">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.343 3.94c.09-.542.56-.94 1.114-.94h1.086c.554 0 1.024.398 1.114.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.768.768a1.125 1.125 0 01.12 1.45l-.527.737a1.125 1.125 0 00.108 1.205c.166.396.506.71.93.78l.894.149c.542.09.94.56.94 1.114v1.086c0 .554-.398 1.024-.94 1.114l-.894.149a1.125 1.125 0 00-.93.78c-.164.398-.142.855.108 1.205l.527.738a1.125 1.125 0 01-.12 1.45l-.768.767a1.125 1.125 0 01-1.45.12l-.737-.527a1.125 1.125 0 00-1.205.108c-.396.166-.71.506-.78.93l-.149.894c-.09.542-.56.94-1.114.94h-1.086c-.554 0-1.024-.398-1.114-.94l-.149-.894a1.125 1.125 0 00-.78-.93c-.398-.164-.855-.142-1.205.108l-.738.527a1.125 1.125 0 01-1.45-.12l-.767-.768a1.125 1.125 0 01-.12-1.45l.527-.737a1.125 1.125 0 00-.108-1.205c-.166-.396-.506-.71-.93-.78l-.894-.149a1.125 1.125 0 01-.94-1.114v-1.086c0-.554.398-1.024.94-1.114l.894-.149c.424-.07.764-.384.93-.78.164-.398.142-.855-.108-1.205l-.527-.737a1.125 1.125 0 01.12-1.45l.768-.768a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.205.108.396-.166.71-.506.78-.93l.149-.894z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
