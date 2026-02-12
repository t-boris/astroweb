import { find } from "geo-tz";

/**
 * Resolve IANA timezone from coordinates using geo-tz.
 * Returns the primary timezone for the given lat/lng, or "UTC" if none found.
 */
export function getTimezoneFromCoords(lat: number, lng: number): string {
  const results = find(lat, lng);
  return results[0] || "UTC";
}
