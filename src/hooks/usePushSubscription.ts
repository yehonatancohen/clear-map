"use client";

import { useEffect, useRef, useCallback } from "react";
import { ref, set, remove } from "firebase/database";
import { rtdb } from "@/lib/firebase";

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
    await set(ref(rtdb, `push_subscriptions/${key}`), {
      endpoint: data.endpoint,
      keys: data.keys,
      created_at: Date.now(),
    });
  } catch (err) {
    // Firebase RTDB rules may deny this write — that's OK,
    // push still works locally, just won't get server-side pushes
    // until the user updates Firebase rules.
    console.warn("Could not store push subscription in Firebase (check RTDB rules):", err);
  }
}

async function removeSubscription(endpoint: string) {
  try {
    const key = hashEndpoint(endpoint);
    await remove(ref(rtdb, `push_subscriptions/${key}`));
  } catch {
    // Ignore — might already be gone or rules deny it
  }
}

export function usePushSubscription(notificationsEnabled: boolean) {
  const subscriptionRef = useRef<PushSubscription | null>(null);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) {
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
        await removeSubscription(existing.endpoint);
        await existing.unsubscribe();
      }

      // Only attempt subscribe if notification permission is already granted
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      subscriptionRef.current = subscription;
      await storeSubscription(subscription);
    } catch (err) {
      console.warn("Push subscription failed:", err);
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
      console.warn("Push unsubscribe failed:", err);
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
