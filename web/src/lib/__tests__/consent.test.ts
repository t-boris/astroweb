import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_KEY,
  closeConsentChoice,
  getConsent,
  getConsentSnapshot,
  openConsentChoice,
  resetConsentForTests,
  setConsent,
  subscribeConsent,
} from "@/lib/consent";

function stubStorage(initial: Record<string, string> = {}, broken = false) {
  const data = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (broken) throw new Error("blocked");
      return k in data ? data[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error("blocked");
      data[k] = v;
    },
  });
  return data;
}

describe("consent store (REQ-001)", () => {
  beforeEach(() => {
    resetConsentForTests();
  });

  it("starts undecided with the banner open", () => {
    stubStorage();
    expect(getConsent()).toBe("unknown");
    expect(getConsentSnapshot()).toEqual({ consent: "unknown", bannerOpen: true });
  });

  it("persists a granted choice and closes the banner", () => {
    const data = stubStorage();
    setConsent("granted");
    expect(data[CONSENT_KEY]).toBe("granted");
    expect(getConsentSnapshot()).toEqual({ consent: "granted", bannerOpen: false });
  });

  it("keeps a declined choice across reloads", () => {
    stubStorage({ [CONSENT_KEY]: "denied" });
    expect(getConsent()).toBe("denied");
    expect(getConsentSnapshot().bannerOpen).toBe(false);
  });

  it("restores granted after a reload", () => {
    stubStorage({ [CONSENT_KEY]: "granted" });
    expect(getConsent()).toBe("granted");
  });

  it("ignores garbage in storage", () => {
    stubStorage({ [CONSENT_KEY]: "yes please" });
    expect(getConsent()).toBe("unknown");
  });

  it("can be reopened and changed later without losing the stored choice until a new one is made", () => {
    const data = stubStorage({ [CONSENT_KEY]: "granted" });
    openConsentChoice();
    expect(getConsentSnapshot()).toEqual({ consent: "granted", bannerOpen: true });
    expect(data[CONSENT_KEY]).toBe("granted");
    closeConsentChoice();
    expect(getConsentSnapshot().bannerOpen).toBe(false);
    openConsentChoice();
    setConsent("denied");
    expect(data[CONSENT_KEY]).toBe("denied");
    expect(getConsent()).toBe("denied");
  });

  it("notifies subscribers and returns a stable snapshot between changes", () => {
    stubStorage();
    const fn = vi.fn();
    const off = subscribeConsent(fn);
    const a = getConsentSnapshot();
    expect(getConsentSnapshot()).toBe(a);
    setConsent("granted");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    setConsent("denied");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stays undecided (nothing loads) when storage is blocked, but still applies the choice for this page", () => {
    stubStorage({}, true);
    expect(getConsent()).toBe("unknown");
    expect(() => setConsent("granted")).not.toThrow();
    expect(getConsent()).toBe("granted");
  });
});
