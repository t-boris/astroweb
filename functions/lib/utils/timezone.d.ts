/**
 * Resolve IANA timezone from coordinates using geo-tz.
 * Returns the primary timezone for the given lat/lng, or "UTC" if none found.
 */
export declare function getTimezoneFromCoords(lat: number, lng: number): string;
