"use client";

import { useEffect, useRef, useCallback } from "react";

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

async function storeSubscription(subscription: PushSubscription) {
  try {
    const key = hashEndpoint(subscription.endpoint);
    const data = subscription.toJSON();

    const res = await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, endpoint: data.endpoint, keys: data.keys }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Push] Subscription storage failed:", res.status, errorText);
    } else {
      console.log("[Push] Subscription stored successfully");
    }
  } catch (err) {
    console.error("[Push] Could not store subscription:", err);
  }
}

async function removeSubscription(endpoint: string) {
  try {
    const key = hashEndpoint(endpoint);
    await fetch("/api/push-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  } catch {
    // Ignore — might already be gone
  }
}

export function usePushSubscription(notificationsEnabled: boolean) {
  const subscriptionRef = useRef<PushSubscription | null>(null);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[Push] No VAPID_PUBLIC_KEY — push disabled");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      console.warn("[Push] No service worker support");
      return;
    }
    if (!("PushManager" in window)) {
      console.warn("[Push] No PushManager — not an installed PWA or unsupported browser");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        // If VAPID key changed, unsubscribe old and re-subscribe with new key
        const existingKey = existing.options?.applicationServerKey;
        const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const keysMatch =
          existingKey &&
          currentKey.length === new Uint8Array(existingKey).length &&
          currentKey.every((v, i) => v === new Uint8Array(existingKey)[i]);

        if (keysMatch) {
          subscriptionRef.current = existing;
          await storeSubscription(existing);
          return;
        }

        // Key mismatch — unsubscribe old subscription
        console.log("[Push] VAPID key changed, re-subscribing...");
        try {
          await existing.unsubscribe();
        } catch (err) {
          console.warn("[Push] Old unsubscribe failed (continuing):", err);
        }
      }

      // Only attempt subscribe if notification permission is already granted
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        console.warn("[Push] Notification permission not granted:", Notification.permission);
        return;
      }

      console.log("[Push] Creating new push subscription...");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      console.log("[Push] Subscription created, storing...");
      subscriptionRef.current = subscription;
      await storeSubscription(subscription);
    } catch (err) {
      console.error("[Push] Subscription failed:", err);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const sub = subscriptionRef.current;
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
        subscriptionRef.current = null;
      }
    } catch (err) {
      console.warn("[Push] Unsubscribe failed:", err);
    }
  }, []);

  useEffect(() => {
    if (notificationsEnabled && VAPID_PUBLIC_KEY) {
      subscribe();
    } else if (!notificationsEnabled) {
      unsubscribe();
    }
  }, [notificationsEnabled, subscribe, unsubscribe]);
}
