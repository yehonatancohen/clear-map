import { NextResponse } from "next/server";

// Specified Oref AJAX History endpoint
const OREF_AJAX_URL = "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get("lang") || "he";
    const fromDate = searchParams.get("fromDate") || ""; // DD.MM.YYYY
    const toDate = searchParams.get("toDate") || "";     // DD.MM.YYYY

    try {
        // Construct URL with params if provided
        const url = new URL(OREF_AJAX_URL);
        url.searchParams.set("lang", lang);
        if (fromDate) url.searchParams.set("fromDate", fromDate);
        if (toDate) url.searchParams.set("toDate", toDate);

        const res = await fetch(url.toString(), {
            cache: "no-store",
            headers: { 
                "User-Agent": UA,
                "Referer": "https://alerts-history.oref.org.il/",
                "X-Requested-With": "XMLHttpRequest"
            },
        });

        if (!res.ok) {
            // Fallback to bridge if Oref directly blocks (common for cloud IPs)
            const bridgeRes = await fetch("https://backend.clearmap.co.il/api/alerts-history", {
                cache: "no-store",
                headers: { "User-Agent": UA }
            });
            
            if (!bridgeRes.ok) {
                return NextResponse.json(
                    { error: `Oref API returned ${res.status}` },
                    { status: 502 },
                );
            }
            return NextResponse.json(await bridgeRes.json());
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("History AJAX API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch history" },
            { status: 500 },
        );
    }
}
