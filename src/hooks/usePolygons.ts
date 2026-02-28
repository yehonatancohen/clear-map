import { useEffect, useState } from "react";

const STORAGE_KEY = "polygonsJSON";
const DATA_URL = "/data/polygons.json";

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
    fetch(DATA_URL + "?v=2") // Add version query to bust cache immediately
      .then((res) => res.json())
      .then((data: PolygonLookup) => {
        setPolygons(data);
        // Clear old cached data in case it's wasting space
        localStorage.removeItem(STORAGE_KEY);
      })
      .catch((err) => {
        console.error("Failed to load polygons:", err);
      });
  }, []);

  return polygons;
}
