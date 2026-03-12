"use client";

import { useFirebaseConnection } from "@/hooks/useFirebaseConnection";

export default function LiveIndicator() {
  const isConnected = useFirebaseConnection();

  return (
    <div
      className="absolute top-3 left-3 z-[1000] liquid-glass rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 glass-overlay"
      title={isConnected ? "מחובר בזמן אמת" : "אין חיבור"}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isConnected
            ? "bg-emerald-400 status-dot-pulse"
            : "bg-red-500"
        }`}
      />
      <span
        className={`text-[11px] font-bold tracking-wide ${
          isConnected ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isConnected ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
}
