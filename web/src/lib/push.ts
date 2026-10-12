import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// Public VAPID key (matches functions/src/services/webpush.ts).
const VAPID_PUBLIC_KEY = "BOEN7U-6D90CxpnjAWz0rzpHN82gXYfNY3pym7NRKfnnBMP_bfj5yLKMjHm7iIu8Ix92R6kKvtXuHSzAox0ItlY";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Register the SW, request permission, subscribe, and store the subscription. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Push notifications are not supported on this device/browser");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }
  const fn = httpsCallable<{ subscription: unknown }, { ok: boolean }>(functions, "registerPushSubscription");
  await fn({ subscription: sub.toJSON() });
}

/** Register the SW silently (for PWA features) — no permission prompt. */
export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    /* ignore */
  }
}
