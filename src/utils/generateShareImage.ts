import { ActiveAlert } from "@/types";
import { getMapInstance } from "@/lib/mapRef";
import { CITY_RANKINGS, getLabelHierarchy } from "@/components/CityLabels";

const STATUS_META: Record<string, { emoji: string; label: string; color: string; fill: string; glow: string; dot: string }> = {
  pre_alert: { emoji: "\uD83D\uDFE0", label: "התרעות מוקדמות", color: "rgba(255,106,0,0.9)", fill: "rgba(255,106,0,0.25)", glow: "rgba(255,106,0,0.7)", dot: "#FF6A00" },
  alert: { emoji: "\uD83D\uDD34", label: "ירי רקטות וטילים", color: "rgba(255,42,42,0.9)", fill: "rgba(255,42,42,0.35)", glow: "rgba(239,68,68,0.8)", dot: "#FF2A2A" },
  uav: { emoji: "\uD83D\uDFE3", label: "כלי טיס עוין", color: "rgba(224,64,251,0.9)", fill: "rgba(224,64,251,0.35)", glow: "rgba(224,64,251,0.7)", dot: "#E040FB" },
  terrorist: { emoji: "\uD83D\uDD34", label: "חדירת מחבלים", color: "rgba(255,0,85,0.9)", fill: "rgba(255,0,85,0.35)", glow: "rgba(255,0,85,0.7)", dot: "#FF0055" },
  after_alert: { emoji: "\u26AB", label: 'להישאר בממ"ד', color: "rgba(255,42,42,0.5)", fill: "rgba(255,42,42,0.15)", glow: "rgba(239,68,68,0.4)", dot: "#ef4444" },
  clear: { emoji: "\uD83D\uDFE2", label: "ניתן לצאת מהמרחב המוגן", color: "rgba(16,185,129,0.9)", fill: "rgba(16,185,129,0.3)", glow: "rgba(16,185,129,0.6)", dot: "#10B981" },
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

/** Returns true if any ancestor up to (but not including) stopEl has opacity < threshold. */
function hasInvisibleAncestor(el: Element, stopEl: Element, threshold = 0.05): boolean {
  let cur: Element | null = el.parentElement;
  while (cur && cur !== stopEl) {
    if (parseFloat(window.getComputedStyle(cur).opacity ?? "1") < threshold) return true;
    cur = cur.parentElement;
  }
  return false;
}

async function captureCurrentMapView(
  alerts: ActiveAlert[],
  polygonsData: Record<string, { polygon: [number, number][] }> | null,
  theme: "light" | "dark" = "dark",
): Promise<HTMLCanvasElement> {
  const mapRoot = document.getElementById("map-root");
  const container = mapRoot?.querySelector(".leaflet-container") as HTMLElement | null;
  if (!container) throw new Error("Map container not found");

  const map = getMapInstance();
  const L = await import("leaflet");

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

      // Fill
      ctx.fillStyle = meta.fill;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fill();

      // Stroke with glow (matching CSS drop-shadow)
      ctx.shadowColor = meta.glow;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 1.5 / dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
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

  return canvas;
}

export async function generateShareImage(alerts: ActiveAlert[], theme: "light" | "dark" = "dark"): Promise<Blob> {
  const polygonsData = await getPolygons();
  const mapCanvas = await captureCurrentMapView(alerts, polygonsData, theme);

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
      ctx.fillStyle = meta.dot;
      ctx.fill();
      ctx.fillStyle = textColorSoft;
      const labelText = counts[status] > 1 ? `${meta.label} (${counts[status]})` : meta.label;
      ctx.fillText(labelText, SIZE - 76, y);
      y += rowH;
    }
  }

  // URL watermark badge — bottom left, styled like a pill button
  {
    const urlText = "clearmap.co.il";
    ctx.font = "bold 26px Rubik, sans-serif";
    const textW = ctx.measureText(urlText).width;
    const padX = 20, padY = 12;
    const badgeW = textW + padX * 2;
    const badgeH = 26 + padY * 2;
    const badgeX = 28;
    const badgeY = SIZE - badgeH - 28;
    const r = badgeH / 2;

    // Pill background
    ctx.beginPath();
    ctx.moveTo(badgeX + r, badgeY);
    ctx.lineTo(badgeX + badgeW - r, badgeY);
    ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + badgeH, r);
    ctx.lineTo(badgeX + badgeW, badgeY + badgeH - r);
    ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH, r);
    ctx.lineTo(badgeX + r, badgeY + badgeH);
    ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r, r);
    ctx.lineTo(badgeX, badgeY + r);
    ctx.arcTo(badgeX, badgeY, badgeX + r, badgeY, r);
    ctx.closePath();

    ctx.fillStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
    ctx.fill();
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.20)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 26px Rubik, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.85)" : "rgba(10,10,20,0.75)";
    ctx.fillText(urlText, badgeX + padX, badgeY + badgeH / 2);
    ctx.shadowBlur = 0;
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
