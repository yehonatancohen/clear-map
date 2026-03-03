import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    try {
        // Fetch from TzevaAdom which has better history support
        const tzevaRes = await fetch("https://api.tzevaadom.co.il/alerts-history/", {
            cache: "no-store",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        });

        if (!tzevaRes.ok) {
            return NextResponse.json({ error: "Failed to fetch from backup API" }, { status: 500 });
        }

        const rawData = await tzevaRes.json();

        // Map TzevaAdom format to Oref format
        const alerts: any[] = [];

        if (Array.isArray(rawData)) {
            rawData.forEach((group: any) => {
                if (group.alerts && Array.isArray(group.alerts)) {
                    group.alerts.forEach((alert: any) => {
                        const dateObj = new Date(alert.time * 1000);

                        // We filter by requested range if provided
                        // (Though the frontend hook also filters, we can be efficient here)

                        const day = String(dateObj.getDate()).padStart(2, "0");
                        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
                        const year = dateObj.getFullYear();
                        const h = String(dateObj.getHours()).padStart(2, "0");
                        const m = String(dateObj.getMinutes()).padStart(2, "0");
                        const s = String(dateObj.getSeconds()).padStart(2, "0");

                        // Map threat to category
                        // 0=Rockets, 5=UAV
                        let category = 1;
                        let category_desc = "ירי רקטות וטילים";
                        if (alert.threat === 5) {
                            category = 2;
                            category_desc = "חדירת כלי טיס עוין";
                        } else if (alert.threat === 2) {
                            category = 3;
                            category_desc = "חדירת מחבלים";
                        } else if (alert.threat === 6) {
                            category = 10;
                            category_desc = "רעידת אדמה";
                        }

                        alert.cities.forEach((cityName: string) => {
                            alerts.push({
                                data: cityName,
                                date: `${day}.${month}.${year}`,
                                time: `${h}:${m}:${s}`,
                                alertDate: dateObj.toISOString(),
                                category: category,
                                category_desc: category_desc,
                                rid: `${group.id}-${alert.time}-${cityName}`
                            });
                        });
                    });
                }
            });
        }

        return NextResponse.json(alerts);
    } catch (error) {
        console.error("Backup API error:", error);
        return NextResponse.json({ error: "Failed to process alerts history" }, { status: 500 });
    }
}
