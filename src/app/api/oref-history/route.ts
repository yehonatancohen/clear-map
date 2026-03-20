import { NextResponse } from "next/server";

const OREF_AJAX_URL = "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get("lang") || "he";

    try {
        const url = new URL(OREF_AJAX_URL);
        url.searchParams.set("lang", lang);

        console.log(`[HistoryAPI] Fetching from Oref: ${url.toString()}`);
        
        let res = await fetch(url.toString(), {
            cache: "no-store",
            headers: { 
                "User-Agent": UA,
                "Referer": "https://alerts-history.oref.org.il/",
                "X-Requested-With": "XMLHttpRequest"
            },
            signal: AbortSignal.timeout(8000) // 8s timeout
        });

        if (!res.ok) {
            console.warn(`[HistoryAPI] Oref failed (${res.status}), trying Bridge...`);
            const bridgeRes = await fetch("https://backend.clearmap.co.il/api/alerts-history", {
                cache: "no-store",
                headers: { "User-Agent": UA },
                signal: AbortSignal.timeout(8000)
            });
            
            if (!bridgeRes.ok) {
                console.error(`[HistoryAPI] Bridge also failed (${bridgeRes.status}), trying TzevaAdom...`);
                // Final fallback to TzevaAdom which is very reliable
                const taRes = await fetch("https://api.tzevaadom.co.il/alerts-history", {
                    cache: "no-store",
                    headers: { "User-Agent": UA },
                    signal: AbortSignal.timeout(5000)
                });
                
                if (!taRes.ok) throw new Error("All history sources failed");
                return NextResponse.json(await taRes.json());
            }
            return NextResponse.json(await bridgeRes.json());
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[HistoryAPI] Final error:", error.message);
        return NextResponse.json(
            { error: "Failed to fetch history", message: error.message },
            { status: 502 },
        );
    }
}
