"use client";

import { ActiveAlert } from "@/types";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  pre_alert:   { label: "התרעה מוקדמת",     color: "text-[#FF6A00]", dot: "bg-[#FF6A00]",  bg: "border-[#FF6A00]/20" },
  alert:       { label: "ירי רקטות וטילים", color: "text-[#FF2A2A]", dot: "bg-[#FF2A2A]",  bg: "border-[#FF2A2A]/20" },
  uav:         { label: "כלי טיס עוין",     color: "text-[#E040FB]", dot: "bg-[#E040FB]",  bg: "border-[#E040FB]/20" },
  terrorist:   { label: "חדירת מחבלים",     color: "text-[#FF0055]", dot: "bg-[#FF0055]",  bg: "border-[#FF0055]/20" },
  after_alert: { label: 'להישאר בממ"ד',     color: "text-[#FF2A2A]/70", dot: "bg-[#FF2A2A]/50", bg: "border-[#FF2A2A]/10" },
  info:        { label: "",                 color: "text-emerald-400", dot: "bg-emerald-400", bg: "border-emerald-400/20" },
  error:       { label: "",                 color: "text-red-400",     dot: "bg-red-400",      bg: "border-red-400/20" },
};

interface ToastContainerProps {
  toasts: (ActiveAlert & { toastId: number })[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="absolute bottom-16 sm:bottom-20 right-3 left-3 flex flex-col items-center gap-2 pointer-events-none z-[1002]"
      dir="rtl"
    >
      {toasts.map((t) => {
        const config = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.alert;
        return (
          <div
            key={t.toastId}
            className={`toast-enter flex items-center gap-3 px-4 py-2.5 rounded-xl liquid-glass border ${config.bg} shadow-xl pointer-events-auto`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${config.dot} status-dot-pulse`} />
            <div className="flex flex-col text-right">
              {config.label && (
                <span className={`font-bold text-[11px] ${config.color} leading-none mb-1 opacity-90`}>
                  {config.label}
                </span>
              )}
              <span className="font-bold text-[14px] text-white leading-none tracking-tight">
                {t.city_name_he}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
