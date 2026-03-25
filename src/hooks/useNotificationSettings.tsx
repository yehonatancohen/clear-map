"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface NotificationSettings {
  enabled: boolean;
  earlyAlerts: boolean;
  leaveShelterAlerts: boolean;
  allIsrael: boolean;
  currentLocation: boolean;
  selectedCities: string[];
  showUavPath: boolean;
  showImpactZones: boolean;
  showMyLocation: boolean;
  autoTheme: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  earlyAlerts: true,
  leaveShelterAlerts: true,
  allIsrael: true,
  currentLocation: false,
  selectedCities: [],
  showUavPath: true,
  showImpactZones: false,
  showMyLocation: false,
  autoTheme: false,
};

interface SettingsContextType {
  settings: NotificationSettings;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
  toggleCity: (cityName: string) => void;
  userCoords: [number, number] | null;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("notification_settings_v2");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("notification_settings_v2", JSON.stringify(settings));
  }, [settings]);

  // Geolocation logic — activate when either setting needs location
  const needsLocation = settings.currentLocation || settings.showMyLocation;
  useEffect(() => {
    if (needsLocation && "geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setUserCoords([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.error("Geolocation error", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setUserCoords(null);
    }
  }, [needsLocation]);

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

  const requestPermission = useCallback(async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    }
    return "denied";
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, toggleCity, userCoords, permission, requestPermission }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useNotificationSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useNotificationSettings must be used within a SettingsProvider");
  }
  return context;
}
