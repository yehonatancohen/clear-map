import type { OrefHistoryAlert } from "@/types";

/**
 * Parse an OrefHistoryAlert into a Unix-ms timestamp.
 * Tries alertDate first (ISO-ish), then falls back to date+time fields.
 */
export function alertToTimestamp(alert: OrefHistoryAlert): number {
  // alertDate: "2026-03-01 14:30:00" or similar
  if (alert.alertDate) {
    const ts = new Date(alert.alertDate.replace(" ", "T")).getTime();
    if (!isNaN(ts)) return ts;
  }
  // date: "01.03.2026", time: "14:30:00"
  if (alert.date && alert.time) {
    const [day, month, year] = alert.date.split(".");
    const ts = new Date(`${year}-${month}-${day}T${alert.time}`).getTime();
    if (!isNaN(ts)) return ts;
  }
  return 0;
}
