"use client";

interface PwaInstallModalProps {
  isIosPwa: boolean;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  onInstall: () => void;
  onClose: () => void;
}

export function PwaInstallModal({ isIosPwa, permission, requestPermission, onInstall, onClose }: PwaInstallModalProps) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-zinc-950 border border-white/10 w-full max-w-[420px] rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-500" dir="rtl">
        <div className="p-6 pt-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">התקנת האפליקציה</h2>
              <p className="text-white/50 text-sm">כדי לקבל התראות בזמן אמת</p>
            </div>
            <button onClick={onClose} className="bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all p-2 rounded-full">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              {isIosPwa ? (
                <>
                  <Step n={1}>לחץ על כפתור ה-<strong>שיתוף</strong> בסרגל התחתון.</Step>
                  <Step n={2}>גלול למטה ובחר <strong>&quot;הוסף למסך הבית&quot;</strong>.</Step>
                  <Step n={3}>לחץ על <strong>&quot;הוסף&quot;</strong> בפינה העליונה.</Step>
                </>
              ) : (
                <>
                  <Step n={1}>לחץ על הכפתור <strong>&quot;התקן אפליקציה&quot;</strong> למטה.</Step>
                  <Step n={2}>אשר את ההתקנה בחלון שיפתח.</Step>
                </>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400 mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-amber-200/80 text-xs leading-relaxed font-medium">
                <span className="font-bold">חשוב:</span> לאחר ההתקנה, פתח את האפליקציה מהאייקון החדש במסך הבית כדי להפעיל את ההתראות.
              </p>
            </div>

            <div className="pt-2 space-y-3 pb-2">
              {!isIosPwa && (
                <button onClick={onInstall} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>התקן אפליקציה</span>
                </button>
              )}
              {permission !== "granted" && (
                <button onClick={requestPermission} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] border border-white/5 flex items-center justify-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  <span>{permission === "denied" ? "התראות חסומות (שנה בהגדרות)" : "הפעל התראות כעת"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">{n}</div>
      <div className="text-white/80 text-[15px] leading-snug pt-1">{children}</div>
    </div>
  );
}
