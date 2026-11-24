/**
 * Place names from Photon (komoot), shared by the place search of the profile form and the place recovered
 * from a chart picture.
 */

export const PHOTON_URL = "https://photon.komoot.io/api";
/** Reverse lookups live at /reverse, not under /api (which answers 404). */
export const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
/** How far a reverse lookup looks for a town: a recovered birth place is known within tens of kilometres. */
export const REVERSE_RADIUS_KM = 25;

export interface PhotonProperties {
  name?: string;
  type?: string;
  city?: string;
  state?: string;
  country?: string;
  countrycode?: string;
}

/** "Cape Town, Western Cape, South Africa": the name, the region and the country, each once ("Moscow, Russia"). */
export function formatPlaceName(props: PhotonProperties): string {
  const parts: string[] = [];
  for (const part of [props.name, props.state, props.country]) {
    const value = part?.trim();
    if (value && !parts.includes(value)) parts.push(value);
  }
  return parts.join(", ");
}

type FetchJson = (url: string) => Promise<unknown>;

async function nearest(fetchJson: FetchJson, lat: number, lng: number, layer?: string): Promise<PhotonProperties | null> {
  const params = new URLSearchParams({ lat: lat.toString(), lon: lng.toString(), lang: "en", radius: String(REVERSE_RADIUS_KM) });
  if (layer) params.set("layer", layer);
  const data = (await fetchJson(`${PHOTON_REVERSE_URL}?${params}`)) as { features?: { properties?: PhotonProperties }[] } | null;
  return data?.features?.[0]?.properties ?? null;
}

/**
 * The town at the coordinates ("Cape Town, Western Cape, South Africa"), or null when Photon knows none nearby or
 * cannot be reached. The nearest town is asked for first; without one, the town (or the name) of the nearest
 * object. The names are in English, as in the place search.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchJson: FetchJson = async (url) => (await fetch(url)).json(),
): Promise<string | null> {
  try {
    const town = await nearest(fetchJson, lat, lng, "city");
    if (town) return formatPlaceName(town) || null;
    const any = await nearest(fetchJson, lat, lng);
    return any ? formatPlaceName({ ...any, name: any.city || any.name }) || null : null;
  } catch {
    return null;
  }
}
