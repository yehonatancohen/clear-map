import { ActiveAlert } from "@/types";
import { getMapInstance } from "@/lib/mapRef";
import { CITY_RANKINGS, getLabelHierarchy } from "@/components/CityLabels";

const STATUS_META: Record<string, { emoji: string; label: string; color: string; fill: string }> = {
  pre_alert: { emoji: "\uD83D\uDFE0", label: "התרעות מוקדמות", color: "#FF6A00", fill: "rgba(255,106,0,0.5)" },
  alert: { emoji: "\uD83D\uDD34", label: "ירי רקטות וטילים", color: "#FF2A2A", fill: "rgba(255,42,42,0.5)" },
  uav: { emoji: "\uD83D\uDFE3", label: "כלי טיס עוין", color: "#E040FB", fill: "rgba(224,64,251,0.5)" },
  terrorist: { emoji: "\uD83D\uDD34", label: "חדירת מחבלים", color: "#FF0055", fill: "rgba(255,0,85,0.5)" },
  after_alert: { emoji: "\u26AB", label: 'להישאר בממ"ד', color: "#A80000", fill: "rgba(168,0,0,0.25)" },
  clear: { emoji: "\uD83D\uDFE2", label: "ניתן לצאת מהמרחב המוגן", color: "#10B981", fill: "rgba(16,185,129,0.4)" },
};

// Global cache for polygons to avoid repeated fetches
let cachedPolygons: Record<string, { polygon: [number, number][] }> | null = null;

async function getPolygons() {
    if (cachedPolygons) return cachedPolygons;
    try {
        const res = await fetch("/data/polygons.json");
        cachedPolygons = await res.json();
        return cachedPolygons;
    } catch {
        return null;
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Rapidly check if tiles are loaded. 
 * Instead of waiting 4s, we check if there are any pending 'loading' tiles.
 */
function waitForMapReady(map: L.Map, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    
    // Check if map is already stable
    let isLoaded = true;
    map.eachLayer((layer: any) => {
        if (layer._loading) isLoaded = false;
    });

    if (isLoaded) {
        clearTimeout(timer);
        resolve();
    } else {
        map.once("load zoomend moveend", () => {
            clearTimeout(timer);
            setTimeout(resolve, 100); // Tiny buffer
        });
    }
  });
}

/** Returns true if any ancestor up to (but not including) stopEl has opacity < threshold. */
function hasInvisibleAncestor(el: Element, stopEl: Element, threshold = 0.05): boolean {
  let cur: Element | null = el.parentElement;
  while (cur && cur !== stopEl) {
    if (parseFloat(window.getComputedStyle(cur).opacity ?? "1") < threshold) return true;
    cur = cur.parentElement;
  }
  return false;
}

async function captureMapCenteredOnAlerts(
  alerts: ActiveAlert[],
  polygonsData: Record<string, { polygon: [number, number][] }> | null,
  theme: "light" | "dark" = "dark",
): Promise<HTMLCanvasElement> {
  const mapRoot = document.getElementById("map-root");
  const container = mapRoot?.querySelector(".leaflet-container") as HTMLElement | null;
  if (!container) throw new Error("Map container not found");

  const map = getMapInstance();
  const L = await import("leaflet");

  const savedCenter = map ? map.getCenter() : null;
  const savedZoom = map ? map.getZoom() : null;

  if (map && alerts.length > 0 && polygonsData) {
    const allCoords: [number, number][] = [];
    for (const a of alerts) {
      const poly = polygonsData[a.city_name_he];
      if (poly?.polygon && Array.isArray(poly.polygon)) {
        allCoords.push(...poly.polygon);
      }
    }
    
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords.map(([lat, lng]) => L.latLng(lat, lng)));
      // Only jump if current view doesn't contain the alerts or is significantly different
      const currentBounds = map.getBounds();
      if (!currentBounds.contains(bounds) || map.getZoom() > 12 || map.getZoom() < 7) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 11, animate: false });
          await waitForMapReady(map);
      }
    }
  }

  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 2;
  const canvas = document.createElement("canvas");
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = theme === "dark" ? "#030712" : "#e8eaf0";
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Draw tiles — skip tiles from invisible layers (e.g. the light tile layer
  // when in dark mode has CSS opacity:0 on its pane, but drawImage ignores that).
  const tiles = container.querySelectorAll<HTMLImageElement>(".leaflet-tile");
  for (const tile of tiles) {
    if (!tile.complete || !tile.naturalWidth) continue;
    if (hasInvisibleAncestor(tile, container)) continue;
    const tileRect = tile.getBoundingClientRect();
    try {
      ctx.drawImage(tile, tileRect.left - rect.left, tileRect.top - rect.top, tileRect.width, tileRect.height);
    } catch { /* tainted */ }
  }

  if (map && polygonsData) {
    // 1. Draw Alert Polygons
    for (const a of alerts) {
      const poly = polygonsData[a.city_name_he];
      if (!poly?.polygon || poly.polygon.length < 3) continue;
      const meta = STATUS_META[a.status] || STATUS_META.alert;
      const points = poly.polygon.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fillStyle = meta.fill;
      ctx.fill();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 2. Draw City Labels
    const zoom = map.getZoom();
    const maxTier = getLabelHierarchy(zoom);
    const sortedCities = Object.entries(polygonsData)
        .map(([name, entry]) => {
            const cityName = name.includes(" - ") ? name.split(" - ")[0].trim() : name;
            return {
                name,
                rawName: name,
                parentName: cityName,
                polygon: entry.polygon,
                tier: CITY_RANKINGS[cityName === "תל אביב" ? "תל אביב - יפו" : cityName] ?? 4
            };
        })
        .filter(c => c.tier <= maxTier)
        .sort((a, b) => a.tier - b.tier);

    const occupiedRects: { x1: number; y1: number; x2: number; y2: number }[] = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const city of sortedCities) {
        if (!city.polygon || city.polygon.length === 0) continue;
        
        let latSum = 0, lngSum = 0;
        for (const p of city.polygon) { latSum += p[0]; lngSum += p[1]; }
        const centroid = L.latLng(latSum / city.polygon.length, lngSum / city.polygon.length);
        const point = map.latLngToContainerPoint(centroid);

        if (point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height) continue;

        const isLarge = zoom < 10 && city.tier <= 1;
        const fontSize = isLarge ? 14 : 12;
        ctx.font = `700 ${fontSize}px Rubik, sans-serif`;

        const text = city.rawName.includes(" - ") && zoom < 11.5 ? city.parentName : city.rawName;
        const textWidth = ctx.measureText(text).width + 12;
        const textHeight = fontSize + 8;

        const r = {
            x1: point.x - textWidth / 2,
            y1: point.y - textHeight / 2,
            x2: point.x + textWidth / 2,
            y2: point.y + textHeight / 2
        };

        const padding = zoom >= 11 ? 4 : 18;
        const collides = occupiedRects.some(o => 
            r.x1 - padding < o.x2 && r.x2 + padding > o.x1 &&
            r.y1 - padding < o.y2 && r.y2 + padding > o.y1
        );

        if (!collides) {
            ctx.strokeStyle = "black";
            ctx.lineWidth = isLarge ? 4 : 3;
            ctx.strokeText(text, point.x, point.y);
            ctx.fillStyle = isLarge ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.75)";
            ctx.fillText(text, point.x, point.y);
            occupiedRects.push(r);
        }
    }
  }

  if (map && savedCenter && savedZoom !== null) {
    map.setView(savedCenter, savedZoom, { animate: false });
  }

  return canvas;
}

export async function generateShareImage(alerts: ActiveAlert[], theme: "light" | "dark" = "dark"): Promise<Blob> {
  const polygonsData = await getPolygons();
  const mapCanvas = await captureMapCenteredOnAlerts(alerts, polygonsData, theme);

  const SIZE = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  const isDark = theme === "dark";
  const overlayRgb = isDark ? "3,7,18" : "232,234,240";
  const textColor = isDark ? "rgba(255,255,255,0.9)" : "rgba(10,10,20,0.9)";
  const textColorSoft = isDark ? "rgba(255,255,255,0.85)" : "rgba(10,10,20,0.85)";

  const mw = mapCanvas.width;
  const mh = mapCanvas.height;
  const cropSize = Math.min(mw, mh);
  const sx = (mw - cropSize) / 2;
  const sy = (mh - cropSize) / 2;
  ctx.drawImage(mapCanvas, sx, sy, cropSize, cropSize, 0, 0, SIZE, SIZE);

  // Top gradient overlay for logo area
  const topGrad = ctx.createLinearGradient(0, 0, 0, 180);
  topGrad.addColorStop(0, `rgba(${overlayRgb},0.88)`);
  topGrad.addColorStop(1, `rgba(${overlayRgb},0)`);
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, SIZE, 180);

  // Logo — larger than Telegram screenshots
  try {
    const logo = await loadImage(`/logo-${theme}-theme.png`);
    const logoH = 110;
    const logoW = logo.width * (logoH / logo.height);
    ctx.drawImage(logo, SIZE - logoW - 30, 24, logoW, logoH);
  } catch {
    ctx.font = "bold 42px Rubik, sans-serif";
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.direction = "rtl";
    ctx.fillText("מפה שקופה", SIZE - 30, 80);
  }

  // Legend — larger than Telegram screenshots
  const activeStatuses = new Set(alerts.map((a) => a.status));
  if (activeStatuses.size > 0) {
    const legendEntries = ["alert", "uav", "pre_alert", "terrorist", "after_alert", "clear"].filter(
      (s) => activeStatuses.has(s),
    );
    const rowH = 42;
    const legendH = 56 + legendEntries.length * rowH;
    const legendY = SIZE - legendH - 24;

    const legGrad = ctx.createLinearGradient(0, legendY - 50, 0, SIZE);
    legGrad.addColorStop(0, `rgba(${overlayRgb},0)`);
    legGrad.addColorStop(0.3, `rgba(${overlayRgb},0.75)`);
    legGrad.addColorStop(1, `rgba(${overlayRgb},0.92)`);
    ctx.fillStyle = legGrad;
    ctx.fillRect(0, legendY - 50, SIZE, SIZE - legendY + 50);

    let y = legendY;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.font = "bold 32px Rubik, sans-serif";
    ctx.fillStyle = textColor;
    ctx.fillText("מקרא", SIZE - 44, y);
    y += 50;

    const counts: Record<string, number> = {};
    for (const a of alerts) counts[a.status] = (counts[a.status] || 0) + 1;

    ctx.font = "26px Rubik, sans-serif";
    for (const status of legendEntries) {
      const meta = STATUS_META[status];
      if (!meta) continue;
      ctx.beginPath();
      ctx.arc(SIZE - 56, y - 7, 10, 0, Math.PI * 2);
      ctx.fillStyle = meta.color;
      ctx.fill();
      ctx.fillStyle = textColorSoft;
      const labelText = counts[status] > 1 ? `${meta.label} (${counts[status]})` : meta.label;
      ctx.fillText(labelText, SIZE - 76, y);
      y += rowH;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))), "image/png", 0.9);
  });
}

export function buildShareText(alerts: ActiveAlert[]): string {
  if (alerts.length === 0) {
    return "מפה שקופה - אין התרעות פעילות כרגע\n\nhttps://clearmap.co.il";
  }

  const counts: Record<string, number> = {};
  const citiesByStatus: Record<string, string[]> = {};
  for (const a of alerts) {
    counts[a.status] = (counts[a.status] || 0) + 1;
    if (!citiesByStatus[a.status]) citiesByStatus[a.status] = [];
    if (!citiesByStatus[a.status].includes(a.city_name_he)) {
      citiesByStatus[a.status].push(a.city_name_he);
    }
  }

  let text = `מפה שקופה - ${alerts.length} התרעות פעילות\n\n`;
  const order = ["alert", "uav", "terrorist", "pre_alert", "after_alert", "clear"];
  for (const status of order) {
    if (!counts[status]) continue;
    const meta = STATUS_META[status];
    const cities = citiesByStatus[status];
    text += `${meta.emoji} ${meta.label}: ${cities.join(", ")}\n`;
  }

  text += "\nhttps://clearmap.co.il";
  return text;
}
