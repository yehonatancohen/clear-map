import { NextResponse } from "next/server";

const API_BASE = "https://api.tzevaadom.co.il/alerts-history";
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get("ids"); // comma-separated batch IDs

    try {
        if (ids) {
            // Fetch specific batches by ID
            const idList = ids.split(",").map(Number).filter(Boolean);
            const results = await Promise.all(
                idList.map(async (id) => {
                    try {
                        const res = await fetch(`${API_BASE}/id/${id}`, {
                            headers: { "User-Agent": UA },
                        });
                        if (!res.ok) return null;
                        const data = await res.json();
                        return data?.alerts ? data : null;
                    } catch {
                        return null;
                    }
                }),
            );
            return NextResponse.json(results.filter(Boolean));
        }

        // Default: return latest batch list
        const res = await fetch(API_BASE, {
            cache: "no-store",
            headers: { "User-Agent": UA },
        });
        if (!res.ok) {
            return NextResponse.json(
                { error: `Upstream ${res.status}` },
                { status: 502 },
            );
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("History API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch history" },
            { status: 500 },
        );
    }
}
