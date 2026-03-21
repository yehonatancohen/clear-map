import { NextResponse } from "next/server";

const FIREBASE_DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

export async function POST(req: Request) {
  try {
    const { key, endpoint, keys, settings, userCoords } = await req.json();

    if (!key || !endpoint || !keys) {
      return NextResponse.json(
        { error: "Missing required fields: key, endpoint, keys" },
        { status: 400 }
      );
    }

    const url = `${FIREBASE_DB_URL}/push_subscriptions/${key}.json`;

    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        endpoint, 
        keys, 
        settings,
        userCoords,
        updated_at: Date.now() 
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[push-subscribe] Firebase write failed (${res.status}):`, errorText);
      return NextResponse.json({ error: errorText }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push-subscribe] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { key } = await req.json();

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    const url = `${FIREBASE_DB_URL}/push_subscriptions/${key}.json`;

    await fetch(url, { method: "DELETE" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push-subscribe] Delete error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
