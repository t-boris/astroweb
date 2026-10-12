import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  currentUser: null as null | { uid: string },
  popup: vi.fn(),
  claim: vi.fn(),
  upload: vi.fn(),
  get: vi.fn(),
  events: [] as string[],
  order: [] as string[],
}));

vi.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return m.currentUser;
    },
    authStateReady: async () => undefined,
  },
}));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: (...a: unknown[]) => m.popup(...a),
}));
vi.mock("@/api/claim", () => ({ claimProfiles: (...a: unknown[]) => m.claim(...a) }));
vi.mock("@/api/profileContent", () => ({
  uploadLocalContent: (...a: unknown[]) => m.upload(...a),
  getProfileContent: (...a: unknown[]) => m.get(...a),
}));

import { ensureSignedIn, loadProfileContent, mergeLeftovers, fromServer, resetClaimsForTests } from "@/lib/contentSync";
import { aiKey, compatKey } from "@/lib/localContent";

const store: Record<string, string> = {};
const oracle = { question: "Q?", answer: "Answer", model: "m", askedAt: "2026-10-01T00:00:00.000Z" };
const server = {
  deepTexts: { sun: { text: "Server sun", language: "en" } },
  compatibilityReadings: [],
  oracleHistory: [{ id: "o1", ...oracle, channel: "web" }],
};

beforeEach(() => {
  resetClaimsForTests();
  for (const k of Object.keys(store)) delete store[k];
  m.currentUser = null;
  m.events = [];
  m.order = [];
  m.popup.mockReset();
  m.claim.mockReset().mockImplementation(async () => {
    m.order.push("claim");
    return 1;
  });
  m.upload.mockReset().mockImplementation(async () => {
    m.order.push("upload");
  });
  m.get.mockReset().mockImplementation(async () => {
    m.order.push("get");
    return server;
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal("window", { dispatchEvent: (e: { type: string }) => m.events.push(e.type) });
  vi.stubGlobal("Event", class {
    type: string;
    constructor(t: string) {
      this.type = t;
    }
  });
});

describe("sign-in gate (REQ-006, REQ-004)", () => {
  it("anonymous: opens the popup, waits for claimProfiles, then lets the action continue", async () => {
    m.popup.mockImplementation(async () => {
      m.order.push("popup");
      m.currentUser = { uid: "u1" };
      return { user: { uid: "u1" } };
    });
    expect(await ensureSignedIn("dev1")).toBe(true);
    expect(m.order).toEqual(["popup", "claim"]);
    expect(m.claim).toHaveBeenCalledWith("dev1");
    expect(m.events).toContain("astroweb:signed-in");
  });

  it("a closed popup stops the action and claims nothing", async () => {
    m.popup.mockRejectedValue(new Error("popup closed"));
    expect(await ensureSignedIn("dev1")).toBe(false);
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("already signed in: no popup, claim runs once per page", async () => {
    m.currentUser = { uid: "u1" };
    await ensureSignedIn("dev1");
    await ensureSignedIn("dev1");
    expect(m.popup).not.toHaveBeenCalled();
    expect(m.claim).toHaveBeenCalledTimes(1);
  });
});

describe("loading content (REQ-002..004, REQ-007)", () => {
  it("anonymous: never uploads, shows the browser's content, leaves it untouched", async () => {
    store[aiKey("p1")] = JSON.stringify({ deepTexts: { sun: "Local sun" }, oracleHistory: [oracle] });
    const before = { ...store };
    const c = await loadProfileContent("p1", "dev1", "en");
    expect(c.source).toBe("local");
    expect(c.deepTexts).toEqual({ sun: "Local sun" });
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.get).not.toHaveBeenCalled();
    expect(store).toEqual(before);
  });

  it("signed in: claims, uploads local-only content once, clears it, then reads the server", async () => {
    m.currentUser = { uid: "u1" };
    store[aiKey("p1")] = JSON.stringify({ deepTexts: { moon: "Local moon" }, oracleHistory: [oracle] });
    store[compatKey("p1")] = JSON.stringify([]);
    const c = await loadProfileContent("p1", "dev1", "ru");
    expect(m.order).toEqual(["claim", "upload", "get"]);
    expect(m.upload.mock.calls[0][1].deepTexts).toEqual([{ blockKey: "moon", text: "Local moon", language: "ru" }]);
    expect(store[aiKey("p1")]).toBeUndefined();
    expect(c.source).toBe("server");
    expect(c.oracleHistory.map((e) => e.id)).toEqual(["o1"]);

    // Opening again: nothing local left, so no second upload.
    await loadProfileContent("p1", "dev1", "ru");
    expect(m.upload).toHaveBeenCalledTimes(1);
  });

  it("a rejected upload keeps the local copy and still shows it next to the server content", async () => {
    m.currentUser = { uid: "u1" };
    m.upload.mockRejectedValue(new Error("permission-denied"));
    store[aiKey("p1")] = JSON.stringify({ deepTexts: { moon: "Local moon" }, oracleHistory: [] });
    const c = await loadProfileContent("p1", "dev1", "en");
    expect(store[aiKey("p1")]).toBeDefined();
    expect(c.deepTexts).toEqual({ moon: "Local moon", sun: "Server sun" });
  });

  it("server unreachable: falls back to the browser's content", async () => {
    m.currentUser = { uid: "u1" };
    m.get.mockRejectedValue(new Error("offline"));
    const c = await loadProfileContent("p1", "dev1", "en");
    expect(c.source).toBe("local");
  });

  it("merging never shows the same Oracle answer twice", () => {
    const merged = mergeLeftovers(fromServer(server), {
      deepTexts: {},
      oracleHistory: [{ ...oracle, answer: "Answer\n[END_OF_REPORT]", askedAt: "2026-10-01T00:00:05.000Z" }],
      compatibilityReadings: [],
    });
    expect(merged.oracleHistory).toHaveLength(1);
  });
});
