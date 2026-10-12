/**
 * Consent-gated GA4 via Firebase Analytics (REQ-001, REQ-005).
 *
 * Nothing in this file talks to Google until consent = granted: the
 * `firebase/analytics` module is imported lazily, so a visitor who has not
 * accepted does not even download it, and no cookie or request is created.
 */
import { app } from "@/lib/firebase";
import { getConsent, subscribeConsent } from "@/lib/consent";
import {
  buildEventPayload,
  templatePath,
  type FunnelEventName,
  type FunnelEvents,
} from "@/lib/analyticsEvents";

type AnalyticsModule = typeof import("firebase/analytics");
type AnalyticsInstance = import("firebase/analytics").Analytics;

interface Loaded {
  mod: AnalyticsModule;
  analytics: AnalyticsInstance;
}

const MEASUREMENT_ID = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined;

let loading: Promise<Loaded | null> | null = null;

/** Analytics is configured for this build (a measurement id exists). */
export const analyticsConfigured = Boolean(MEASUREMENT_ID);

function load(): Promise<Loaded | null> {
  if (!analyticsConfigured || getConsent() !== "granted") return Promise.resolve(null);
  if (!loading) {
    loading = (async () => {
      try {
        const mod = await import("firebase/analytics");
        if (!(await mod.isSupported())) return null;
        // send_page_view is off: page views are sent once per route change by AnalyticsRuntime.
        const analytics = mod.initializeAnalytics(app, { config: { send_page_view: false } });
        return { mod, analytics };
      } catch (e) {
        console.warn("Analytics unavailable", e);
        return null;
      }
    })();
  }
  return loading;
}

/** Run `fn` with the analytics instance if consent is granted. Never throws. */
async function withAnalytics(fn: (l: Loaded) => void): Promise<void> {
  if (getConsent() !== "granted") return;
  const l = await load();
  if (!l || getConsent() !== "granted") return;
  try {
    fn(l);
  } catch (e) {
    console.warn("Analytics call failed", e);
  }
}

/** Remove the GA cookies (_ga, _ga_<id>) set for this site. */
export function clearAnalyticsCookies(): void {
  if (typeof document === "undefined") return;
  const host = location.hostname;
  const domains = [host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || !(name === "_ga" || name.startsWith("_ga_") || name === "_gid" || name.startsWith("_gat"))) continue;
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
    }
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** React to consent changes: enable/disable collection and clean up on withdrawal. */
export function startConsentWatcher(): () => void {
  let last = getConsent();
  const apply = () => {
    const now = getConsent();
    if (now === last) return;
    last = now;
    if (now === "granted") {
      void withAnalytics(({ mod, analytics }) => mod.setAnalyticsCollectionEnabled(analytics, true));
    } else if (loading) {
      void loading.then((l) => {
        if (l) l.mod.setAnalyticsCollectionEnabled(l.analytics, false);
        clearAnalyticsCookies();
      });
    }
  };
  if (last === "denied") clearAnalyticsCookies();
  return subscribeConsent(apply);
}

/** Send one funnel event (no-op without consent). Parameters are allowlisted. */
export function trackEvent<K extends FunnelEventName>(name: K, params?: FunnelEvents[K]): void {
  if (getConsent() !== "granted") return;
  const payload = buildEventPayload(name, (params ?? {}) as Record<string, unknown>);
  void withAnalytics(({ mod, analytics }) => mod.logEvent(analytics, name as string, payload));
}

let lastPageView: string | null = null;

/** One page_view for the (templated) path; repeated calls for the same path are ignored. */
export function trackPageView(pathname: string): void {
  if (getConsent() !== "granted") return;
  const path = templatePath(pathname);
  if (lastPageView === path) return;
  lastPageView = path;
  void withAnalytics(({ mod, analytics }) =>
    mod.logEvent(analytics, "page_view", {
      page_path: path,
      page_location: `${location.origin}${path}`,
      page_title: document.title,
    }),
  );
}

/** Forget the last page view (e.g. when consent was just granted, so the current page is counted). */
export function resetPageViewDedupe(): void {
  lastPageView = null;
}

/** GA4 user_id = Firebase uid while signed in; cleared on sign-out. */
export function setAnalyticsUser(uid: string | null): void {
  void withAnalytics(({ mod, analytics }) => mod.setUserId(analytics, uid));
}

/** Mark the admin's own events so a GA4 internal-traffic data filter can exclude them. */
export function setInternalTraffic(internal: boolean): void {
  void withAnalytics(({ mod }) => mod.setDefaultEventParameters({ traffic_type: internal ? "internal" : undefined }));
}

/** Analytics state for checkout calls: consent and, when granted, the GA client_id. */
export interface CheckoutAnalytics {
  consent: "granted" | "denied";
  clientId?: string;
}

function clientIdFromCookie(): string | undefined {
  const m = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)/);
  return m?.[1];
}

function clientIdFromGtag(timeoutMs: number): Promise<string | undefined> {
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  if (!gtag || !MEASUREMENT_ID) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    try {
      gtag("get", MEASUREMENT_ID, "client_id", (id: unknown) => {
        clearTimeout(timer);
        resolve(typeof id === "string" ? id : undefined);
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

/**
 * Never blocks checkout for long: if analytics could not load (ad blocker,
 * unsupported browser) it returns at once without a client_id; otherwise the
 * `_ga` cookie is used, falling back to a short gtag lookup.
 */
export async function getCheckoutAnalytics(): Promise<CheckoutAnalytics> {
  if (getConsent() !== "granted" || !analyticsConfigured) return { consent: "denied" };
  const loaded = await load();
  if (!loaded) return { consent: "granted" };
  const clientId = clientIdFromCookie() ?? (await clientIdFromGtag(800));
  return clientId ? { consent: "granted", clientId } : { consent: "granted" };
}

const seenOnce = new Set<string>();

/** Fire `name` at most once per key for this page load (e.g. one paywall view per profile and feature). */
export function trackOnce<K extends FunnelEventName>(key: string, name: K, params?: FunnelEvents[K]): void {
  const k = `${name}:${key}`;
  if (seenOnce.has(k)) return;
  seenOnce.add(k);
  trackEvent(name, params);
}
