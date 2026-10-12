import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Consent gating of the analytics runtime (REQ-001, REQ-005): nothing from
 * firebase/analytics may even be imported before consent = granted.
 */
const sdk = vi.hoisted(() => ({
  loaded: vi.fn(),
  isSupported: vi.fn(async () => true),
  initializeAnalytics: vi.fn(() => ({ fake: "analytics" })),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  setDefaultEventParameters: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
}));

vi.mock("firebase/analytics", () => {
  sdk.loaded();
  return {
    isSupported: sdk.isSupported,
    initializeAnalytics: sdk.initializeAnalytics,
    logEvent: sdk.logEvent,
    setUserId: sdk.setUserId,
    setDefaultEventParameters: sdk.setDefaultEventParameters,
    setAnalyticsCollectionEnabled: sdk.setAnalyticsCollectionEnabled,
  };
});
vi.mock("@/lib/firebase", () => ({ app: { name: "test-app" } }));

const cookies = { value: "" };

async function freshModules(storage: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST123");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => {
      storage[k] = v;
    },
  });
  vi.stubGlobal("window", {}); // no window.gtag: the client_id falls back to the _ga cookie
  vi.stubGlobal("location", { origin: "https://natalmystic.com", hostname: "natalmystic.com" });
  vi.stubGlobal("document", {
    title: "Page title",
    get cookie() {
      return cookies.value;
    },
    set cookie(v: string) {
      cookies.value = v;
    },
  });
  const consent = await import("@/lib/consent");
  const analytics = await import("@/lib/analytics");
  return { consent, analytics };
}

// Time for any (wrongly) triggered dynamic import to run; positive assertions use vi.waitFor instead.
const flush = () => new Promise((r) => setTimeout(r, 50));

describe("analytics runtime", () => {
  beforeEach(() => {
    Object.values(sdk).forEach((f) => "mockClear" in f && f.mockClear());
    cookies.value = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not load or call Firebase Analytics while the choice is undecided", async () => {
    const { analytics } = await freshModules();
    analytics.trackEvent("chart_viewed", { tab: "planets" });
    analytics.trackPageView("/");
    analytics.setAnalyticsUser("uid-1");
    await flush();
    expect(sdk.loaded).not.toHaveBeenCalled();
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
    expect(sdk.setUserId).not.toHaveBeenCalled();
  });

  it("stays off after the user declined, including on the next page load", async () => {
    const { analytics } = await freshModules({ "astroweb.analyticsConsent": "denied" });
    analytics.trackEvent("profile_created");
    analytics.trackPageView("/privacy");
    await flush();
    expect(sdk.loaded).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
    expect((await analytics.getCheckoutAnalytics())).toEqual({ consent: "denied" });
  });

  it("initialises once and sends events with allowlisted params after consent", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    analytics.trackEvent("chart_viewed", { tab: "planets", name: "Ada" } as never);
    analytics.trackEvent("paywall_viewed", { feature: "oracle" });
    await vi.waitFor(() => expect(sdk.logEvent).toHaveBeenCalledTimes(2));
    expect(sdk.initializeAnalytics).toHaveBeenCalledTimes(1);
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith({ name: "test-app" }, { config: { send_page_view: false } });
    expect(sdk.logEvent).toHaveBeenCalledWith({ fake: "analytics" }, "chart_viewed", { tab: "planets" });
    expect(sdk.logEvent).toHaveBeenCalledWith({ fake: "analytics" }, "paywall_viewed", { feature: "oracle" });
  });

  it("sends exactly one page_view per path with the profile id templated away", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    analytics.trackPageView("/profile/abc123");
    analytics.trackPageView("/profile/abc123"); // same route again: ignored
    analytics.trackPageView("/profile/zzz999"); // another id, same template: ignored
    analytics.trackPageView("/account");
    await vi.waitFor(() => expect(sdk.logEvent.mock.calls.filter((c) => c[1] === "page_view")).toHaveLength(2));
    const pageViews = sdk.logEvent.mock.calls.filter((c) => c[1] === "page_view");
    expect(pageViews.map((c) => (c[2] as { page_path: string }).page_path)).toEqual(["/profile/:id", "/account"]);
    expect(JSON.stringify(pageViews)).not.toMatch(/abc123|zzz999/);
    expect(pageViews[0][2]).toMatchObject({ page_location: "https://natalmystic.com/profile/:id", page_title: "Page title" });
  });

  it("fires an event again for a fresh action but trackOnce dedupes per key", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    analytics.trackOnce("p1", "paywall_viewed", { feature: "interpretations" });
    analytics.trackOnce("p1", "paywall_viewed", { feature: "interpretations" });
    analytics.trackOnce("p2", "paywall_viewed", { feature: "interpretations" });
    await vi.waitFor(() => expect(sdk.logEvent.mock.calls.filter((c) => c[1] === "paywall_viewed")).toHaveLength(2));
    await flush(); // a third call would have shown up by now
    expect(sdk.logEvent.mock.calls.filter((c) => c[1] === "paywall_viewed")).toHaveLength(2);
  });

  it("sets user_id for signed-in users and the internal-traffic parameter for the admin", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    analytics.setAnalyticsUser("uid-1");
    analytics.setInternalTraffic(true);
    analytics.setAnalyticsUser(null);
    await vi.waitFor(() => expect(sdk.setUserId).toHaveBeenCalledTimes(2));
    expect(sdk.setUserId.mock.calls.map((c) => c[1])).toEqual(["uid-1", null]);
    expect(sdk.setDefaultEventParameters).toHaveBeenCalledWith({ traffic_type: "internal" });
  });

  it("withdrawing consent disables collection and removes the GA cookies", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    const stop = analytics.startConsentWatcher();
    analytics.trackEvent("profile_created");
    await vi.waitFor(() => expect(sdk.logEvent).toHaveBeenCalledTimes(1));
    cookies.value = "_ga=GA1.1.1.2; _ga_ABC=GS1.1.1.2.3; other=1";
    consent.setConsent("denied");
    await vi.waitFor(() => expect(sdk.setAnalyticsCollectionEnabled).toHaveBeenCalledWith({ fake: "analytics" }, false));
    stop();
    sdk.logEvent.mockClear();
    analytics.trackEvent("profile_created");
    await flush();
    expect(sdk.logEvent).not.toHaveBeenCalled();
  });

  it("keeps working when analytics is blocked: no throw, checkout is not delayed", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    sdk.isSupported.mockRejectedValueOnce(new Error("blocked by client"));
    expect(() => analytics.trackEvent("profile_created")).not.toThrow();
    const started = Date.now();
    expect(await analytics.getCheckoutAnalytics()).toEqual({ consent: "granted" });
    expect(Date.now() - started).toBeLessThan(500);
    expect(() => analytics.trackPageView("/")).not.toThrow();
    expect(() => analytics.setAnalyticsUser("u1")).not.toThrow();
  });

  it("reads the GA client_id from the _ga cookie for checkout calls", async () => {
    const { consent, analytics } = await freshModules();
    consent.setConsent("granted");
    cookies.value = "foo=bar; _ga=GA1.1.1234567890.1700000000";
    expect(await analytics.getCheckoutAnalytics()).toEqual({ consent: "granted", clientId: "1234567890.1700000000" });
  });
});
