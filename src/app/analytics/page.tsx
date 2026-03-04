"use client";

import dynamic from "next/dynamic";

const AnalyticsView = dynamic(
  () => import("@/components/analytics/AnalyticsView"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center">
        <div className="text-sm text-gray-500 animate-pulse">טוען...</div>
      </div>
    ),
  }
);

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
