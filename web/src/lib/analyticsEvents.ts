/**
 * Funnel event taxonomy (REQ-005). Pure module: types, per-event parameter
 * allowlists and the path template. Nothing here touches the DOM or Firebase,
 * so the "no PII" guarantee is unit-testable.
 */

export const PROFILE_TABS = [
  "chart",
  "planets",
  "aspects",
  "houses",
  "interpretation",
  "oracle",
  "transits",
  "compatibility",
  "astrologer",
  "premium",
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export type PaywallFeature = "interpretations" | "compatibility" | "oracle" | "premium_store";
export type AiReadingKind = "deepen" | "oracle" | "compatibility" | "letter";

export interface FunnelEvents {
  profile_create_start: Record<string, never>;
  profile_created: Record<string, never>;
  chart_viewed: { tab: ProfileTab };
  paywall_viewed: { feature: PaywallFeature };
  begin_checkout: { pack_id: string; value: number; currency: "USD"; items: Array<{ item_id: string }> };
  unlock_feature: { feature: "interpretations" | "compatibility"; stars: number };
  astrologer_subscribe_start: { cadence: string; billing_period: string };
  ai_reading_requested: { kind: AiReadingKind };
  letter_opened: Record<string, never>;
}

export type FunnelEventName = keyof FunnelEvents;

/** Parameter names each event may carry. Anything else is dropped. */
export const ALLOWED_PARAMS: { [K in FunnelEventName]: readonly string[] } = {
  profile_create_start: [],
  profile_created: [],
  chart_viewed: ["tab"],
  paywall_viewed: ["feature"],
  begin_checkout: ["pack_id", "value", "currency", "items"],
  unlock_feature: ["feature", "stars"],
  astrologer_subscribe_start: ["cadence", "billing_period"],
  ai_reading_requested: ["kind"],
  letter_opened: [],
};

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/**
 * Build the parameters actually sent to GA4: only allowlisted keys, only
 * primitive values (and `items` as [{item_id}]). Defence in depth so a
 * careless call site can never leak a name, date, place or e-mail.
 */
export function buildEventPayload<K extends FunnelEventName>(name: K, params: FunnelEvents[K] | Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const src = params as Record<string, unknown>;
  for (const key of ALLOWED_PARAMS[name]) {
    const v = src[key];
    if (key === "items" && Array.isArray(v)) {
      out.items = v
        .map((i) => (i && typeof i === "object" && isPrimitive((i as { item_id?: unknown }).item_id) ? { item_id: String((i as { item_id: unknown }).item_id) } : null))
        .filter((i): i is { item_id: string } => i !== null);
    } else if (isPrimitive(v)) {
      out[key] = v;
    }
  }
  return out;
}

/** Replace profile ids so page paths never carry identifiers: /profile/:id[/…]. */
export function templatePath(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const m = path.match(/^\/profile\/([^/]+)(\/.*)?$/);
  if (m && m[1] !== "new") return `/profile/:id${m[2] ?? ""}`;
  return path;
}
