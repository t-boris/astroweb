import { useState } from "react";

const STORAGE_KEY = "astroweb_device_id";

/**
 * Non-hook utility to get or generate the device ID.
 * Safe to call outside React components.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * React hook that returns a stable device ID persisted in localStorage.
 * Generates a UUID on first visit, reuses it on subsequent visits.
 */
export function useDeviceId(): string {
  const [deviceId] = useState<string>(() => getDeviceId());
  return deviceId;
}
