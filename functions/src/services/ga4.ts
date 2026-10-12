import { createHash } from "node:crypto";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Server-side GA4 events via the Measurement Protocol (REQ-002).
 *
 * Privacy rules (DEC-001, DEC-005, DEC-007, DEC-011):
 *  - Events are ALWAYS sent for successful purchase / subscription events.
 *  - With analytics consent = granted in the relevant Stripe metadata the real
 *    GA client_id (and user_id = Firebase uid, if signed in) is used.
 *  - Otherwise the event is anonymous: no user_id, and a pseudo client_id that
 *    is a deterministic one-way hash of a Stripe identifier of that event.
 *  - No names, emails or birth data are ever put in an event parameter.
 */

const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const CLIENT_ID_RE = /^\d{1,12}\.\d{1,12}$/;
const HASH_NAMESPACE = "astroweb-ga4-pseudo-client|";

/** Consent state and identifiers as stored in Stripe metadata. */
export interface StoredAnalytics {
  consent: boolean;
  clientId: string | null;
  uid: string | null;
}

/** Analytics state sent by the browser to a checkout-creating callable. */
export interface ClientAnalytics {
  consent: boolean;
  clientId: string | null;
}

export type Ga4EventName =
  | "purchase"
  | "subscription_start"
  | "subscription_renewal"
  | "subscription_cancel";

export interface Ga4Event {
  name: Ga4EventName;
  params: Record<string, unknown>;
}

export interface Ga4Request {
  client_id: string;
  user_id?: string;
  events: Ga4Event[];
}

/** Sanitise the `analytics` object a browser sent to a callable. */
export function parseClientAnalytics(raw: unknown): ClientAnalytics {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const consent = o.consent === "granted";
  const clientId = typeof o.clientId === "string" && CLIENT_ID_RE.test(o.clientId) ? o.clientId : null;
  return { consent, clientId: consent ? clientId : null };
}

/**
 * Stripe metadata entries for the analytics state at checkout. The client_id and
 * uid are stored only when consent was granted, so a declined visitor leaves no
 * identifier in Stripe.
 */
export function analyticsMetadata(a: ClientAnalytics, uid: string | null): Record<string, string> {
  if (!a.consent) return { ga_consent: "denied" };
  return {
    ga_consent: "granted",
    ...(a.clientId ? { ga_client_id: a.clientId } : {}),
    ...(uid ? { ga_uid: uid } : {}),
  };
}

/** Read the analytics state back from Stripe session / subscription metadata. */
export function readAnalyticsMetadata(md: Record<string, string | undefined> | null | undefined): StoredAnalytics {
  const m = md ?? {};
  const clientId = typeof m.ga_client_id === "string" && CLIENT_ID_RE.test(m.ga_client_id) ? m.ga_client_id : null;
  return {
    consent: m.ga_consent === "granted",
    clientId,
    uid: m.ga_consent === "granted" && m.ga_uid ? m.ga_uid : null,
  };
}

/**
 * One-way, deterministic pseudo client_id formatted like a GA client_id
 * ("<10 digits>.<10 digits>"). Same seed -> same id (webhook retries); the
 * seed cannot be recovered from it and it never equals the seed.
 */
export function pseudoClientId(seed: string): string {
  const digest = createHash("sha256").update(HASH_NAMESPACE + seed).digest();
  const a = 1_000_000_000 + digest.readUInt32BE(0);
  const b = 1_000_000_000 + (digest.readUInt32BE(4) % 1_000_000_000);
  return `${a}.${b}`;
}

/**
 * Build the Measurement Protocol request for one event.
 * `seed` is the Stripe identifier used when the event must be anonymous.
 * Granted consent without a usable real client_id is treated as anonymous.
 */
export function buildGa4Request(stored: StoredAnalytics, seed: string, event: Ga4Event): Ga4Request {
  if (stored.consent && stored.clientId) {
    return {
      client_id: stored.clientId,
      ...(stored.uid ? { user_id: stored.uid } : {}),
      events: [event],
    };
  }
  return { client_id: pseudoClientId(seed), events: [event] };
}

const toValue = (cents: number | null | undefined) => Math.round(Number(cents) || 0) / 100;
const toCurrency = (c: string | null | undefined) => (c ? c.toUpperCase() : "USD");

/** GA4 recommended `purchase` event for a star-pack checkout. */
export function purchaseEvent(input: {
  transactionId: string;
  amountCents: number | null | undefined;
  currency: string | null | undefined;
  packId: string | null | undefined;
  stars: number;
}): Ga4Event {
  const value = toValue(input.amountCents);
  const itemId = input.packId || `stars_${input.stars}`;
  return {
    name: "purchase",
    params: {
      transaction_id: input.transactionId,
      value,
      currency: toCurrency(input.currency),
      items: [
        { item_id: itemId, item_name: `AstroWeb · ${itemId}`, item_category: "stars", price: value, quantity: 1 },
      ],
    },
  };
}

/** Subscription events: start and renewal carry value; cancel does not. */
export function subscriptionEvent(
  name: "subscription_start" | "subscription_renewal" | "subscription_cancel",
  input: {
    transactionId: string;
    amountCents?: number | null;
    currency?: string | null;
    cadence?: string | null;
    billingPeriod?: string | null;
  },
): Ga4Event {
  const params: Record<string, unknown> = { transaction_id: input.transactionId };
  if (input.cadence) params.cadence = input.cadence;
  if (input.billingPeriod) params.billing_period = input.billingPeriod;
  if (name !== "subscription_cancel") {
    const value = toValue(input.amountCents);
    params.value = value;
    params.currency = toCurrency(input.currency);
    params.items = [
      {
        item_id: input.cadence ? `astrologer_${input.cadence}` : "astrologer",
        item_name: "Personal Astrologer",
        item_category: "astrologer_subscription",
        price: value,
        quantity: 1,
      },
    ];
  }
  return { name, params };
}

export interface Ga4Config {
  measurementId: string | undefined;
  apiSecret: string | undefined;
}

export function ga4ConfigFromEnv(): Ga4Config {
  return { measurementId: process.env.GA_MEASUREMENT_ID, apiSecret: process.env.GA_API_SECRET };
}

type FetchLike = (url: string, init: { method: string; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/**
 * POST one request to the Measurement Protocol. One retry on a network error or
 * 5xx. Never throws; returns whether GA4 accepted it (HTTP 2xx).
 */
export async function sendGa4(
  request: Ga4Request,
  config: Ga4Config = ga4ConfigFromEnv(),
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 4000,
): Promise<boolean> {
  if (!config.measurementId || !config.apiSecret) {
    logger.warn("GA4 not configured (GA_MEASUREMENT_ID / GA_API_SECRET) — event skipped", {
      event: request.events[0]?.name,
    });
    return false;
  }
  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: "POST", body: JSON.stringify(request), signal: ctrl.signal });
      if (res.ok) return true;
      if (res.status < 500) {
        logger.warn("GA4 rejected event", { status: res.status, event: request.events[0]?.name });
        return false;
      }
    } catch (e) {
      logger.warn("GA4 send failed", { attempt, error: (e as Error).message });
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/**
 * Send an event at most once per (event name, transaction id): a marker document
 * is written after GA4 accepted it, so a Stripe redelivery sends nothing, while
 * a failed first attempt is retried on redelivery. Never throws.
 */
export async function sendGa4Once(
  event: Ga4Event,
  stored: StoredAnalytics,
  seed: string,
  deps: { send?: (r: Ga4Request) => Promise<boolean> } = {},
): Promise<"sent" | "duplicate" | "failed"> {
  try {
    const transactionId = String(event.params.transaction_id ?? "");
    if (!transactionId) return "failed";
    const markerKey = createHash("sha256").update(`${event.name}|${transactionId}`).digest("hex").slice(0, 40);
    const ref = getFirestore().collection("ga4Events").doc(markerKey);
    if ((await ref.get()).exists) return "duplicate";
    const request = buildGa4Request(stored, seed, event);
    const ok = await (deps.send ?? ((r) => sendGa4(r)))(request);
    if (!ok) return "failed";
    await ref.set({
      eventName: event.name,
      transactionId,
      anonymous: !(stored.consent && stored.clientId),
      sentAt: new Date().toISOString(),
    });
    return "sent";
  } catch (e) {
    logger.warn("GA4 event failed", { error: (e as Error).message });
    return "failed";
  }
}
