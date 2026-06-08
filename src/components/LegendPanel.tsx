"use client";

interface LegendPanelProps {
  onClose: () => void;
}

export function LegendPanel({ onClose }: LegendPanelProps) {
  return (
    <div
      className="absolute top-14 sm:top-16 right-3 z-[1001] liquid-glass rounded-2xl p-4 sm:p-5 w-[calc(100vw-24px)] sm:w-80 glass-overlay max-w-md"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
        <h3 className="text-sm font-bold text-white/90">מקרא התרעות</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-lg text-white/40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-4">
        <LegendItem color="#FF2A2A" glow title="התרעות ירי רקטות וטילים" desc="ירי טילים ורקטות לפיקוד העורף. היכנסו למרחב המוגן." />
        <LegendItem color="#E040FB" glow title="התרעות חדירת כלי טיס עוין" desc="חדירת כלי טיס בלתי מאויש. יש להיכנס מיד למרחב המוגן.">
          <p className="text-[10px] text-purple-300 leading-tight mt-1">
            * המערכת מבצעת בזמן אמת הפיכת נתונים למסלול משוער, חוזה את כיוון הטיסה ומתריעה על מיקומים עתידיים פוטנציאליים טרם הגעת הכלי.
          </p>
        </LegendItem>
        <LegendItem color="#FF6A00" title="התרעות מוקדמות" desc='הנחיה מטעם צה"ל לשהות בסמיכות למרחב מוגן.' />
        <LegendItem color="rgba(168,0,0,0.5)" title='להישאר בממ"ד' desc='יש להישאר בממרחב המוגן עד 10 דקות מקבלת ההתרעה (או עד להודעה אחרת).' />
        <LegendItem color="#FF0055" title="חדירת מחבלים" desc="חשש לאירוע בטחוני, היכנסו למבנה ונעלו דלתות." />
      </div>
    </div>
  );
}

function LegendItem({
  color, glow = false, title, desc, children,
}: {
  color: string; glow?: boolean; title: string; desc: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-1 flex-shrink-0 h-3 w-3 rounded-full"
        style={{
          background: color,
          boxShadow: glow ? `0 0 8px ${color}` : undefined,
        }}
      />
      <div className="text-right">
        <div className="text-[13px] font-bold text-white/90">{title}</div>
        <div className="text-[11px] text-white/60 leading-tight mt-0.5">{desc}</div>
        {children}
      </div>
    </div>
  );
}
