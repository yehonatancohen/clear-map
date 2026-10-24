import { ActiveAlert } from "@/types";
import { getMapInstance } from "@/lib/mapRef";
import { CITY_RANKINGS, getLabelHierarchy } from "@/components/CityLabels";
import { fetchPolygons } from "@/hooks/usePolygons";

// Canvas text uses the same family the page resolved (next/font hashes the name)
const uiFont = () => getComputedStyle(document.body).fontFamily || "sans-serif";

const STATUS_META: Record<string, { emoji: string; label: string; color: string; fill: string; glow: string; dot: string }> = {
  pre_alert: { emoji: "\uD83D\uDFE0", label: "התרעות מוקדמות", color: "rgba(255,106,0,0.9)", fill: "rgba(255,106,0,0.25)", glow: "rgba(255,106,0,0.7)", dot: "#FF6A00" },
  alert: { emoji: "\uD83D\uDD34", label: "ירי רקטות וטילים", color: "rgba(255,42,42,0.9)", fill: "rgba(255,42,42,0.35)", glow: "rgba(239,68,68,0.8)", dot: "#FF2A2A" },
  uav: { emoji: "\uD83D\uDFE3", label: "כלי טיס עוין", color: "rgba(224,64,251,0.9)", fill: "rgba(224,64,251,0.35)", glow: "rgba(224,64,251,0.7)", dot: "#E040FB" },
  terrorist: { emoji: "\uD83D\uDD34", label: "חדירת מחבלים", color: "rgba(255,0,85,0.9)", fill: "rgba(255,0,85,0.35)", glow: "rgba(255,0,85,0.7)", dot: "#FF0055" },
  after_alert: { emoji: "\u26AB", label: 'להישאר בממ"ד', color: "rgba(255,42,42,0.5)", fill: "rgba(255,42,42,0.15)", glow: "rgba(239,68,68,0.4)", dot: "#ef4444" },
  clear: { emoji: "\uD83D\uDFE2", label: "ניתן לצאת מהמרחב המוגן", color: "rgba(16,185,129,0.9)", fill: "rgba(16,185,129,0.3)", glow: "rgba(16,185,129,0.6)", dot: "#10B981" },
};

/**
 * Tries to generate the share image on the clearmap-screenshots server —
 * the same Playwright + Pillow pipeline that produces the Telegram
 * broadcast images — using the current map's center/zoom. Returns null if
 * the server isn't configured or the request fails/times out, so callers
 * can fall back to the client-side canvas render.
 */
export async function generateServerShareImage(
  theme: "light" | "dark" = "dark",
  timeoutMs = 30000,
): Promise<Blob | null> {
  const base = process.env.NEXT_PUBLIC_SHARE_SCREENSHOT_URL;
  if (!base) return null;

  const map = getMapInstance();
  if (!map) return null;

  const center = map.getCenter();
  const zoom = map.getZoom();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/share-screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: center.lat, lon: center.lng, zoom, theme }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Global cache for polygons to avoid repeated fetches
let cachedPolygons: Record<string, { polygon: [number, number][] }> | null = null;

async function getPolygons() {
    if (cachedPolygons) return cachedPolygons;
    try {
        cachedPolygons = await fetchPolygons();
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

/** Combined CSS opacity of el and its ancestors up to (not including) stopEl. */
function effectiveOpacity(el: Element, stopEl: Element): number {
  let opacity = 1;
  for (let cur: Element | null = el; cur && cur !== stopEl; cur = cur.parentElement) {
    opacity *= parseFloat(window.getComputedStyle(cur).opacity || "1");
  }
  return opacity;
}

let filterSupport: boolean | null = null;

/** ctx.filter exists in some browsers (older Safari) without doing anything; test it for real. */
function canvasFilterWorks(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const x = c.getContext("2d")!;
    x.filter = "invert(1)";
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 1, 1);
    filterSupport = x.getImageData(0, 0, 1, 1).data[0] < 128;
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

type Matrix = number[]; // 3x3 row-major colour matrix + 3 offsets (0–1 scale)

/** Colour matrices for the CSS filter functions the map uses (Filter Effects spec). */
function filterMatrix(fn: string, v: number): Matrix | null {
  const id = (s: number, o = 0): Matrix => [s, 0, 0, 0, s, 0, 0, 0, s, o, o, o];
  const sat = (s: number): Matrix => [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    0, 0, 0,
  ];
  switch (fn) {
    case "invert": return id(1 - 2 * v, v);
    case "brightness": return id(v);
    case "contrast": return id(v, 0.5 - 0.5 * v);
    case "saturate": return sat(v);
    case "grayscale": return sat(1 - Math.min(v, 1));
    case "hue-rotate": {
      const a = (v * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
        0, 0, 0,
      ];
    }
    default: return null;
  }
}

/** Fallback for browsers without a working ctx.filter: apply the CSS filter chain to the pixels. */
function applyCssFilter(octx: CanvasRenderingContext2D, filter: string) {
  const steps: Matrix[] = [];
  for (const m of filter.matchAll(/([a-z-]+)\(([-\d.]+)(%|deg)?\)/g)) {
    const v = parseFloat(m[2]) / (m[3] === "%" ? 100 : 1);
    const mat = filterMatrix(m[1], v);
    if (mat) steps.push(mat);
  }
  if (steps.length === 0) return;
  let img: ImageData;
  try {
    img = octx.getImageData(0, 0, octx.canvas.width, octx.canvas.height);
  } catch {
    return; // tainted canvas: leave unfiltered
  }
  const d = img.data;
  const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    for (const m of steps) {
      const nr = clamp(m[0] * r + m[1] * g + m[2] * b + m[9]);
      const ng = clamp(m[3] * r + m[4] * g + m[5] * b + m[10]);
      const nb = clamp(m[6] * r + m[7] * g + m[8] * b + m[11]);
      r = nr; g = ng; b = nb;
    }
    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
  }
  octx.putImageData(img, 0, 0);
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

  // Draw tiles layer by layer, as the user sees them. drawImage ignores CSS:
  // the dark theme is light tiles under a CSS filter, and auto mode blends the
  // two layers by opacity, so both have to be re-applied here.
  const layers = new Map<Element, HTMLImageElement[]>();
  for (const tile of container.querySelectorAll<HTMLImageElement>(".leaflet-tile")) {
    if (!tile.complete || !tile.naturalWidth) continue;
    const layer = tile.closest(".leaflet-layer") ?? tile.parentElement!;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(tile);
  }
  for (const [layer, layerTiles] of layers) {
    const opacity = effectiveOpacity(layer, container);
    if (opacity < 0.01) continue;
    const filter = window.getComputedStyle(layer).filter;
    const off = document.createElement("canvas");
    off.width = canvas.width;
    off.height = canvas.height;
    const octx = off.getContext("2d")!;
    octx.scale(dpr, dpr);
    for (const tile of layerTiles) {
      const tileRect = tile.getBoundingClientRect();
      try {
        octx.drawImage(tile, tileRect.left - rect.left, tileRect.top - rect.top, tileRect.width, tileRect.height);
      } catch { /* tainted */ }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    if (filter && filter !== "none") {
      if (canvasFilterWorks()) ctx.filter = filter;
      else applyCssFilter(octx, filter);
    }
    ctx.drawImage(off, 0, 0);
    ctx.restore();
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
        ctx.font = `700 ${fontSize}px ${uiFont()}`;

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
            // Soft halo like the live map's text-shadow; a stroked outline reads as a black box.
            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 4;
            ctx.fillStyle = isLarge ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.8)";
            ctx.fillText(text, point.x, point.y);
            ctx.fillText(text, point.x, point.y);
            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";
            occupiedRects.push(r);
        }
    }
  }

  return canvas;
}

/** Replaces the legend with a headline block (used for a salvo's summary card). */
export interface ShareSummary {
  title: string;
  subtitle?: string;
  lines: string[];
  /** Dot color next to the title. */
  accent: string;
}

/** Native share sheet when the browser can share files, otherwise download + copy text. */
export async function shareOrDownload(blob: Blob, text: string, filename = "clearmap-status.png"): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  // writeText can stay pending forever without page focus; don't let it hold the UI.
  try {
    await Promise.race([navigator.clipboard.writeText(text), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* clipboard not available */ }
  return "downloaded";
}

/**
 * The share image is a centered square of the map, while a phone shows a tall view
 * (and the history panel pushes fits into the top half). Re-fit the cities into the
 * square (leaving room for the logo and the bottom block), wait for the tiles,
 * capture, then put the view back.
 */
export async function withShareView<T>(
  cities: string[],
  polygons: Record<string, { polygon: [number, number][] }> | null,
  capture: () => Promise<T>,
  /** Share of the square kept clear at the bottom: the salvo card is taller than the legend. */
  bottomPad = 0.36,
): Promise<T> {
  const map = getMapInstance();
  const container = document.querySelector("#map-root .leaflet-container") as HTMLElement | null;
  const coords = cities.flatMap((c) => polygons?.[c]?.polygon ?? []);
  if (!map || !container || coords.length === 0) return capture();

  const L = await import("leaflet");
  const prevCenter = map.getCenter();
  const prevZoom = map.getZoom();
  const prevSnap = map.options.zoomSnap;
  const { width: w, height: h } = container.getBoundingClientRect();
  const side = Math.min(w, h);
  const padX = (w - side) / 2 + side * 0.06;
  const padY = (h - side) / 2;
  // Whole-zoom snapping can leave a nationwide wave at half the size it fits at.
  map.options.zoomSnap = 0.25;
  map.fitBounds(L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng))), {
    paddingTopLeft: [padX, padY + side * 0.12],
    paddingBottomRight: [padX, padY + side * bottomPad],
    maxZoom: 12,
    animate: false,
  });
  try {
    await waitForTiles(container);
    return await capture();
  } finally {
    map.options.zoomSnap = prevSnap;
    map.setView(prevCenter, prevZoom, { animate: false });
  }
}

async function waitForTiles(container: HTMLElement, timeoutMs = 3000) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 250)); // let Leaflet add the new tiles
  while (Date.now() - start < timeoutMs) {
    const tiles = [...container.querySelectorAll<HTMLImageElement>(".leaflet-tile")];
    if (tiles.every((t) => t.complete)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** "14:32 · 24.10" — a shared picture of alerts is useless without when it was true. */
function stamp(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  return `${time} · ${date}`;
}

export async function generateShareImage(
  alerts: ActiveAlert[],
  theme: "light" | "dark" = "dark",
  summary?: ShareSummary,
  /** When the picture was true (ms), shown in the legend header. */
  asOf: number = Date.now(),
): Promise<Blob> {
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
    ctx.font = `bold 42px ${uiFont()}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.direction = "rtl";
    ctx.fillText("מפה שקופה", SIZE - 30, 80);
  }

  if (summary) {
    drawSummary(ctx, summary, SIZE, overlayRgb, textColor, textColorSoft);
  }

  // Legend — larger than Telegram screenshots
  const activeStatuses = new Set(alerts.map((a) => a.status));
  if (!summary) {
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
    ctx.font = `bold 32px ${uiFont()}`;
    ctx.fillStyle = textColor;
    ctx.fillText(`${legendEntries.length ? "מצב ההתרעות" : "אין התרעות פעילות"} · ${stamp(asOf)}`, SIZE - 44, y);
    y += 50;

    const counts: Record<string, number> = {};
    for (const a of alerts) counts[a.status] = (counts[a.status] || 0) + 1;

    ctx.font = `26px ${uiFont()}`;
    for (const status of legendEntries) {
      const meta = STATUS_META[status];
      if (!meta) continue;
      ctx.beginPath();
      ctx.arc(SIZE - 56, y - 7, 10, 0, Math.PI * 2);
      ctx.fillStyle = meta.dot;
      ctx.fill();
      ctx.fillStyle = textColorSoft;
      const labelText = `${meta.label} · ${counts[status] === 1 ? "יישוב אחד" : `${counts[status]} יישובים`}`;
      ctx.fillText(labelText, SIZE - 76, y);
      y += rowH;
    }
  }

  // URL watermark badge — bottom left, styled like a pill button
  {
    const urlText = "clearmap.co.il";
    ctx.font = `bold 26px ${uiFont()}`;
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
    ctx.font = `bold 26px ${uiFont()}`;
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

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function drawSummary(
  ctx: CanvasRenderingContext2D,
  summary: ShareSummary,
  SIZE: number,
  overlayRgb: string,
  textColor: string,
  textColorSoft: string,
) {
  const right = SIZE - 44;
  const maxW = SIZE - 88;
  const lineH = 40;
  // Bottom of the block sits above the URL badge (bottom-left, ~80px tall).
  const blockBottom = SIZE - 112;
  const blockH = 58 + (summary.subtitle ? 40 : 0) + summary.lines.length * lineH;
  const top = blockBottom - blockH;

  const grad = ctx.createLinearGradient(0, top - 60, 0, SIZE);
  grad.addColorStop(0, `rgba(${overlayRgb},0)`);
  grad.addColorStop(0.25, `rgba(${overlayRgb},0.8)`);
  grad.addColorStop(1, `rgba(${overlayRgb},0.94)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, top - 60, SIZE, SIZE - top + 60);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  let y = top + 44;

  ctx.beginPath();
  ctx.arc(right - 12, y - 14, 12, 0, Math.PI * 2);
  ctx.fillStyle = summary.accent;
  ctx.fill();
  ctx.font = `bold 46px ${uiFont()}`;
  ctx.fillStyle = textColor;
  ctx.fillText(fitText(ctx, summary.title, maxW - 40), right - 36, y);
  y += 44;

  if (summary.subtitle) {
    ctx.font = `500 26px ${uiFont()}`;
    ctx.fillStyle = textColorSoft;
    ctx.globalAlpha = 0.75;
    ctx.fillText(fitText(ctx, summary.subtitle, maxW), right, y);
    ctx.globalAlpha = 1;
    y += 40;
  }

  ctx.font = `500 28px ${uiFont()}`;
  ctx.fillStyle = textColorSoft;
  for (const line of summary.lines) {
    y += 4;
    ctx.fillText(fitText(ctx, line, maxW), right, y);
    y += lineH - 4;
  }
}

/** Cities listed per status in the share text; a nationwide wave has hundreds. */
const SHARE_TEXT_MAX_CITIES = 30;

export function buildShareText(alerts: ActiveAlert[], asOf: number = Date.now()): string {
  if (alerts.length === 0) {
    return `מפה שקופה - אין התרעות פעילות (${stamp(asOf)})\n\nhttps://clearmap.co.il`;
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

  let text = `מפה שקופה - ${alerts.length} התרעות פעילות (${stamp(asOf)})\n\n`;
  const order = ["alert", "uav", "terrorist", "pre_alert", "after_alert", "clear"];
  for (const status of order) {
    if (!counts[status]) continue;
    const meta = STATUS_META[status];
    const cities = citiesByStatus[status];
    const shown = cities.slice(0, SHARE_TEXT_MAX_CITIES).join(", ");
    const more = cities.length > SHARE_TEXT_MAX_CITIES ? ` ועוד ${cities.length - SHARE_TEXT_MAX_CITIES}` : "";
    text += `${meta.emoji} ${meta.label} (${cities.length}): ${shown}${more}\n`;
  }

  text += "\nhttps://clearmap.co.il";
  return text;
}
