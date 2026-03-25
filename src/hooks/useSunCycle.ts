"use client";

import { useState, useEffect } from "react";

// Israel approximate center
const LAT = 31.78;
const LNG = 35.22;

/** Compute sunrise & sunset times (UTC) for a given date and location.
 *  Simplified solar position algorithm — accurate to ~2 minutes. */
function getSunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );

  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  // Solar declination (Spencer, 1971)
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Equation of time (minutes)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.04089 * Math.sin(2 * gamma));

  // Hour angle for sunrise/sunset (solar zenith = 90.833° for atmospheric refraction)
  const zenith = toRad(90.833);
  const latRad = toRad(lat);
  const cosHA =
    (Math.cos(zenith) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  // Clamp for polar regions (shouldn't happen for Israel)
  const ha = toDeg(Math.acos(Math.max(-1, Math.min(1, cosHA))));

  // Sunrise and sunset in minutes from midnight UTC
  const solarNoon = 720 - 4 * lng - eqTime;
  const sunriseMin = solarNoon - ha * 4;
  const sunsetMin = solarNoon + ha * 4;

  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    sunrise: new Date(base.getTime() + sunriseMin * 60000),
    sunset: new Date(base.getTime() + sunsetMin * 60000),
  };
}

export type SunPhase = "day" | "night" | "sunrise" | "sunset";

interface SunCycleResult {
  phase: SunPhase;
  theme: "light" | "dark";
  /** 0 = fully dark, 1 = fully light. Smoothly transitions during sunrise/sunset (~15 min). */
  dayFactor: number;
}

const TRANSITION_MINUTES = 10;

/** Steep sigmoid: snaps quickly between 0 and 1, minimizing time in the unreadable mid-opacity range.
 *  At 30% linear → output ~0.02 (dark), at 70% linear → output ~0.98 (light). */
function sharpStep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return 1 / (1 + Math.exp(-16 * (t - 0.5)));
}

export function useSunCycle(enabled: boolean): SunCycleResult {
  const [result, setResult] = useState<SunCycleResult>({
    phase: "day",
    theme: "dark",
    dayFactor: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    function compute(): SunCycleResult {
      const now = new Date();
      const { sunrise, sunset } = getSunTimes(now, LAT, LNG);

      const sunriseMs = sunrise.getTime();
      const sunsetMs = sunset.getTime();
      const nowMs = now.getTime();
      const transMs = TRANSITION_MINUTES * 60000;

      // Sunrise transition window: [sunrise - trans/2, sunrise + trans/2]
      const srStart = sunriseMs - transMs / 2;
      const srEnd = sunriseMs + transMs / 2;

      // Sunset transition window: [sunset - trans/2, sunset + trans/2]
      const ssStart = sunsetMs - transMs / 2;
      const ssEnd = sunsetMs + transMs / 2;

      let linearFactor: number;
      let phase: SunPhase;

      if (nowMs < srStart) {
        // Before sunrise transition — night
        linearFactor = 0;
        phase = "night";
      } else if (nowMs < srEnd) {
        // During sunrise transition
        linearFactor = (nowMs - srStart) / (srEnd - srStart);
        phase = "sunrise";
      } else if (nowMs < ssStart) {
        // Full day
        linearFactor = 1;
        phase = "day";
      } else if (nowMs < ssEnd) {
        // During sunset transition
        linearFactor = 1 - (nowMs - ssStart) / (ssEnd - ssStart);
        phase = "sunset";
      } else {
        // After sunset — night
        linearFactor = 0;
        phase = "night";
      }

      // Apply smoothstep so the map rushes through the unreadable mid-opacity range
      const dayFactor = sharpStep(linearFactor);

      return {
        phase,
        theme: dayFactor >= 0.5 ? "light" : "dark",
        dayFactor,
      };
    }

    setResult(compute());

    // Update every 60 seconds for smooth transitions
    const interval = setInterval(() => setResult(compute()), 60_000);
    return () => clearInterval(interval);
  }, [enabled]);

  return result;
}
