import { useEffect, useState } from "react";

const STORAGE_KEY = "polygonsJSON";
/**
 * Coordinates rounded to ~1 m (see scripts/minify-polygons.py), about a third
 * of the original download. Bump the version after regenerating the file.
 */
export const POLYGONS_URL = "/data/polygons.min.json?v=3";
/** Full-precision original, used if the minified file is ever missing. */
const POLYGONS_FALLBACK_URL = "/data/polygons.json?v=2";

/** Load polygons, falling back to the original file rather than drawing nothing. */
export async function fetchPolygons(): Promise<PolygonLookup> {
  try {
    const res = await fetch(POLYGONS_URL);
    if (res.ok) return await res.json();
    console.warn("[polygons] minified file unavailable:", res.status);
  } catch (err) {
    console.warn("[polygons] minified file failed:", err);
  }
  const res = await fetch(POLYGONS_FALLBACK_URL);
  if (!res.ok) throw new Error(`polygons: HTTP ${res.status}`);
  return res.json();
}

export interface PolygonEntry {
  city_name: string;
  city_name_he: string;
  polygon: [number, number][];
}

/** Hebrew city name → polygon data */
export type PolygonLookup = Record<string, PolygonEntry>;

export function usePolygons(): PolygonLookup | null {
  const [polygons, setPolygons] = useState<PolygonLookup | null>(null);

  useEffect(() => {
    fetchPolygons()
      .then((data: PolygonLookup) => {
        // Remove the ETWS country-wide dummy polygon that shows up in Egypt
        if (data["בחלק מהאזורים בארץ"]) {
          delete data["בחלק מהאזורים בארץ"];
        }
        setPolygons(data);
        // Clear old cached data in case it's wasting space
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked (e.g. embedded iframe) */ }
      })
      .catch((err) => {
        console.error("Failed to load polygons:", err);
      });
  }, []);

  return polygons;
}
