"use client";

import { useEffect, useRef, useCallback } from "react";
import type { NotificationSettings } from "./useNotificationSettings";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function hashEndpoint(endpoint: string): string {
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) {
    const chr = endpoint.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "sub_" + Math.abs(hash).toString(36);
}

async function storeSubscription(
  subscription: PushSubscription, 
  settings: NotificationSettings, 
  userCoords: [number, number] | null
) {
  try {
    const key = hashEndpoint(subscription.endpoint);
    const data = subscription.toJSON();

    const res = await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        key, 
        endpoint: data.endpoint, 
        keys: data.keys,
        settings,
        userCoords
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Push] Subscription storage failed:", res.status, errorText);
    } else {
      console.log("[Push] Subscription synced successfully (Enabled:", settings.enabled, ")");
    }
  } catch (err) {
    console.error("[Push] Could not store subscription:", err);
  }
}

async function removeSubscription(endpoint: string) {
  try {
    const key = hashEndpoint(endpoint);
    const res = await fetch("/api/push-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (res.ok) {
        console.log("[Push] Subscription removed from server");
    }
  } catch {
    // Ignore — might already be gone
  }
}

export function usePushSubscription(settings: NotificationSettings, userCoords: [number, number] | null) {
  const subscriptionRef = useRef<PushSubscription | null>(null);
  const isInitialMount = useRef(true);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const existingKey = subscription.options?.applicationServerKey;
        const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const keysMatch =
          existingKey &&
          currentKey.length === new Uint8Array(existingKey).length &&
          currentKey.every((v, i) => v === new Uint8Array(existingKey)[i]);

        if (!keysMatch) {
          console.log("[Push] VAPID key mismatch, re-subscribing...");
          await subscription.unsubscribe();
          subscription = null;
        }
      }

      if (!subscription && settings.enabled) {
        if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;
        
        console.log("[Push] Creating new subscription...");
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }

      if (subscription) {
        subscriptionRef.current = subscription;
        if (settings.enabled) {
            await storeSubscription(subscription, settings, userCoords);
        } else {
            // If we have a subscription but settings are disabled, remove it
            await removeSubscription(subscription.endpoint);
            await subscription.unsubscribe();
            subscriptionRef.current = null;
        }
      }
    } catch (err) {
      console.error("[Push] Subscription error:", err);
    }
  }, [settings, userCoords]);

  // Initial check and subsequent toggles
  useEffect(() => {
    subscribe();
  }, [settings.enabled, subscribe]);

  // Periodic sync of settings/location
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
    }
    if (settings.enabled && subscriptionRef.current) {
      storeSubscription(subscriptionRef.current, settings, userCoords);
    }
  }, [settings, userCoords]);
}
