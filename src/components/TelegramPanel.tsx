"use client";

interface TelegramPanelProps {
  broadcastUav: boolean;
  setBroadcastUav: (v: boolean) => void;
  broadcastEllipse: boolean;
  setBroadcastEllipse: (v: boolean) => void;
  onClose: () => void;
}

export function TelegramPanel({
  broadcastUav, setBroadcastUav, broadcastEllipse, setBroadcastEllipse, onClose,
}: TelegramPanelProps) {
  return (
    <div
      className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-96 glass-overlay max-w-sm max-h-[85vh] overflow-y-auto flex flex-col"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2 flex-shrink-0">
        <h3 className="text-base font-bold text-white/90">ערוצי כתבים וחדשות</h3>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="space-y-6 overflow-y-auto scrollbar-thin pb-2">
        {/* Broadcast */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/20 p-1.5 rounded-lg text-blue-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 10l5 5-5 5" /><path d="M4 4v7a4 4 0 004 4h12" />
              </svg>
            </div>
            <h4 className="text-[14px] font-bold text-white">שידור חי (Broadcast)</h4>
          </div>
          <p className="text-[12px] text-white/60 leading-relaxed pr-8">
            קישור ייעודי לשידורים חיים, מותאם להטמעה בתוכנות שידור (OBS) או לתצוגה במסכים.
          </p>
          <div className="pr-8 space-y-2">
            <MiniToggle label='הצגת מסלול כטב"מ' checked={broadcastUav} accentClass="bg-purple-600" onChange={() => setBroadcastUav(!broadcastUav)} />
            <MiniToggle label="הצגת אזור פגיעה" checked={broadcastEllipse} accentClass="bg-red-600" onChange={() => setBroadcastEllipse(!broadcastEllipse)} />
          </div>
          <div className="pr-8">
            <button
              onClick={() => {
                const url = `${window.location.origin}/broadcast?uav=${broadcastUav}&ellipse=${broadcastEllipse}`;
                navigator.clipboard.writeText(url);
              }}
              className="w-full bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-xl py-2 text-[12px] font-bold hover:bg-blue-600/30 transition-all flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              העתק קישור שידור
            </button>
          </div>
        </div>

        {/* Telegram Bot */}
        <div className="space-y-3 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="bg-[#0088cc]/20 p-1.5 rounded-lg text-[#0088cc]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
              </svg>
            </div>
            <h4 className="text-[14px] font-bold text-white">בוט התרעות לערוצים</h4>
          </div>
          <p className="text-[12px] text-white/60 leading-relaxed pr-8">
            ניתן להוסיף את <strong className="text-white">@ClearMapBot</strong> לערוץ הטלגרם שלכם.
          </p>
          <div className="pr-8 space-y-2">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              {[
                'הוסיפו את @ClearMapBot כמנהל בערוץ.',
                <span key={2}>כתבו <code className="bg-white/10 px-1 rounded text-blue-300">/start</code> להרשמה.</span>,
                <span key={3}>לביטול כתבו <code className="bg-white/10 px-1 rounded text-red-300">/stop</code>.</span>,
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="bg-white/10 text-white/70 text-[10px] h-4 w-4 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-[11px] text-white/80">{step}</span>
                </div>
              ))}
            </div>
            <a href="https://t.me/ClearMapBot" target="_blank" rel="noopener noreferrer"
              className="w-full bg-[#0088cc]/20 text-[#0088cc] border border-[#0088cc]/30 rounded-xl py-2 text-[12px] font-bold hover:bg-[#0088cc]/30 transition-all flex items-center justify-center gap-2">
              מעבר לבוט
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniToggle({ label, checked, accentClass, onChange }: { label: string; checked: boolean; accentClass: string; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/5">
      <span className="text-[11px] text-white/80">{label}</span>
      <button onClick={onChange} dir="ltr" className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors ${checked ? accentClass : "bg-white/10"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
