"use client";

import { useState, useEffect, useCallback } from "react";

export interface NotificationSettings {
  enabled: boolean;
  earlyAlerts: boolean;
  leaveShelterAlerts: boolean;
  allIsrael: boolean;
  currentLocation: boolean;
  selectedCities: string[];
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  earlyAlerts: true,
  leaveShelterAlerts: true,
  allIsrael: true,
  currentLocation: false,
  selectedCities: [],
};


export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    }
    return "denied";
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("notification_settings_v2");
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("notification_settings_v2", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (settings.currentLocation && "geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserCoords([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.error("Geolocation error", err);
        },
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setUserCoords(null);
    }
  }, [settings.currentLocation]);

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleCity = useCallback((cityName: string) => {
    setSettings((prev) => {
      const next = prev.selectedCities.includes(cityName)
        ? prev.selectedCities.filter((c) => c !== cityName)
        : [...prev.selectedCities, cityName];
      return { ...prev, selectedCities: next };
    });
  }, []);

  return { settings, updateSettings, toggleCity, userCoords, permission, requestPermission };
}
