import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIREBASE_DB_URL = (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");
const NODES = ["active_alerts", "uav_tracks", "clears", "heartbeat"] as const;

/**
 * Snapshot of live alert state for clients that can't (or shouldn't) hold a
 * Firebase websocket: embeds, and the main site when RTDB is saturated.
 *
 * Cached at the CDN for 1s, so however many viewers poll, Firebase sees about
 * one read per second per edge region.
 */
export async function GET() {
  try {
    const values = await Promise.all(
      NODES.map(async (node) => {
        const res = await fetch(`${FIREBASE_DB_URL}/public_state/${node}.json`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${node}: HTTP ${res.status}`);
        return res.json();
      }),
    );
    const [alerts, uav_tracks, clears, heartbeat] = values;
    return NextResponse.json(
      { alerts, uav_tracks, clears, heartbeat, server_now: Date.now() },
      {
        headers: {
          "Cache-Control": "public, max-age=1, s-maxage=1, stale-while-revalidate=10",
          "CDN-Cache-Control": "public, max-age=1, stale-while-revalidate=10",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    console.error("[live] Firebase read failed:", err);
    return NextResponse.json({ error: "upstream" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
