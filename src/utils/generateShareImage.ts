import { ActiveAlert } from "@/types";
import { getMapInstance } from "@/lib/mapRef";

const STATUS_META: Record<string, { emoji: string; label: string; color: string; fill: string }> = {
  pre_alert: { emoji: "\uD83D\uDFE0", label: "התרעות מוקדמות", color: "#FF6A00", fill: "rgba(255,106,0,0.5)" },
  alert: { emoji: "\uD83D\uDD34", label: "ירי רקטות וטילים", color: "#FF2A2A", fill: "rgba(255,42,42,0.5)" },
  uav: { emoji: "\uD83D\uDFE3", label: "כלי טיס עוין", color: "#E040FB", fill: "rgba(224,64,251,0.5)" },
  terrorist: { emoji: "\uD83D\uDD34", label: "חדירת מחבלים", color: "#FF0055", fill: "rgba(255,0,85,0.5)" },
  after_alert: { emoji: "\u26AB", label: 'להישאר בממ"ד', color: "#FF2A2A", fill: "rgba(255,42,42,0.15)" },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function waitForTiles(map: L.Map, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    map.once("idle", () => {
      clearTimeout(timer);
      setTimeout(resolve, 300);
    });
  });
}

async function captureMapCenteredOnAlerts(
  alerts: ActiveAlert[],
  polygonsData: Record<string, { polygon: [number, number][] }> | null,
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
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, animate: false });
      await waitForTiles(map);
    }
  }

  const rect = container.getBoundingClientRect();
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const tiles = container.querySelectorAll<HTMLImageElement>(".leaflet-tile");
  for (const tile of tiles) {
    if (!tile.complete || !tile.naturalWidth) continue;
    const tileRect = tile.getBoundingClientRect();
    try {
      ctx.drawImage(tile, tileRect.left - rect.left, tileRect.top - rect.top, tileRect.width, tileRect.height);
    } catch { /* tainted */ }
  }

  if (map && polygonsData) {
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
  }

  if (map && savedCenter && savedZoom !== null) {
    map.setView(savedCenter, savedZoom, { animate: false });
  }

  return canvas;
}

export async function generateShareImage(alerts: ActiveAlert[]): Promise<Blob> {
  let polygonsData: Record<string, { polygon: [number, number][] }> | null = null;
  try {
    polygonsData = await fetch("/data/polygons.json").then((r) => r.json());
  } catch {
    console.warn("Could not load polygons.json");
  }

  const mapCanvas = await captureMapCenteredOnAlerts(alerts, polygonsData);

  const SIZE = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // Draw map cropped to square
  const mw = mapCanvas.width;
  const mh = mapCanvas.height;
  const cropSize = Math.min(mw, mh);
  const sx = (mw - cropSize) / 2;
  const sy = (mh - cropSize) / 2;
  ctx.drawImage(mapCanvas, sx, sy, cropSize, cropSize, 0, 0, SIZE, SIZE);

  // Top gradient for logo
  const topGrad = ctx.createLinearGradient(0, 0, 0, 160);
  topGrad.addColorStop(0, "rgba(3,7,18,0.8)");
  topGrad.addColorStop(1, "rgba(3,7,18,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, SIZE, 160);

  // Logo
  try {
    const logo = await loadImage("/logo-dark-theme.png");
    const logoH = 80;
    const logoW = logo.width * (logoH / logo.height);
    ctx.drawImage(logo, SIZE - logoW - 30, 24, logoW, logoH);
  } catch {
    ctx.font = "bold 36px Rubik, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "right";
    ctx.direction = "rtl";
    ctx.fillText("מפה שקופה", SIZE - 30, 70);
  }

  // Legend — only active statuses
  const activeStatuses = new Set(alerts.map((a) => a.status));
  if (activeStatuses.size > 0) {
    const legendEntries = ["alert", "uav", "pre_alert", "terrorist", "after_alert"].filter(
      (s) => activeStatuses.has(s),
    );
    const legendH = 50 + legendEntries.length * 34;
    const legendY = SIZE - legendH - 20;

    const legGrad = ctx.createLinearGradient(0, legendY - 40, 0, SIZE);
    legGrad.addColorStop(0, "rgba(3,7,18,0)");
    legGrad.addColorStop(0.3, "rgba(3,7,18,0.6)");
    legGrad.addColorStop(1, "rgba(3,7,18,0.85)");
    ctx.fillStyle = legGrad;
    ctx.fillRect(0, legendY - 40, SIZE, SIZE - legendY + 40);

    let y = legendY;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.font = "bold 26px Rubik, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("מקרא", SIZE - 40, y);
    y += 42;

    const counts: Record<string, number> = {};
    for (const a of alerts) counts[a.status] = (counts[a.status] || 0) + 1;

    ctx.font = "20px Rubik, sans-serif";
    for (const status of legendEntries) {
      const meta = STATUS_META[status];
      if (!meta) continue;
      ctx.beginPath();
      ctx.arc(SIZE - 52, y - 6, 8, 0, Math.PI * 2);
      ctx.fillStyle = meta.color;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const labelText = counts[status] > 1 ? `${meta.label} (${counts[status]})` : meta.label;
      ctx.fillText(labelText, SIZE - 70, y);
      y += 34;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
    );
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

  const order = ["alert", "uav", "terrorist", "pre_alert", "after_alert"];
  for (const status of order) {
    if (!counts[status]) continue;
    const meta = STATUS_META[status];
    const cities = citiesByStatus[status];
    text += `${meta.emoji} ${meta.label}: ${cities.join(", ")}\n`;
  }

  text += "\nhttps://clearmap.co.il";
  return text;
}
