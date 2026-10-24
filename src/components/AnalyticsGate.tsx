"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Analytics bills per event; every load of /embed on a news site would
 * count as a page view. Embeds are left out (Google Analytics still sees them).
 */
export function AnalyticsGate() {
  return <Analytics beforeSend={(event) => (new URL(event.url).pathname.startsWith("/embed") ? null : event)} />;
}
