import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const h = vi.hoisted(() => ({
  fake: null as unknown as FakeFirestore,
  create: undefined as unknown as Mock,
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: (...a: unknown[]) => h.create(...a) } };
  },
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));
vi.mock("../services/profile", () => ({
  getProfileById: vi.fn().mockResolvedValue({ id: "p1", ownerUid: "uid-1", ownerDeviceId: "dev1" }),
}));
vi.mock("../services/astrologer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/astrologer")>()),
  requireUid: (r: { auth?: { uid?: string } }) => r.auth!.uid,
  isAstrologerEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock("../services/letterEngine", () => ({ enqueueImmediateLetter: vi.fn() }));
vi.mock("../services/email", () => ({ parseRecipientEmails: () => [] }));

import { createCheckoutSession } from "../api/createCheckoutSession";
import { subscribeAstrologer } from "../api/subscribeAstrologer";

process.env.STRIPE_SECRET_KEY = "sk_test_x";

type Callable = { run: (req: unknown) => Promise<{ url: string }> };

const request = (data: Record<string, unknown>, uid: string | null = "uid-1") => ({
  data,
  auth: uid ? { uid } : undefined,
  rawRequest: { headers: { origin: "https://natalmystic.com" } },
});

describe("checkout metadata carries the analytics state (REQ-002)", () => {
  beforeEach(() => {
    h.fake = createFakeFirestore();
    h.create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  });

  it("star pack: consent granted -> client_id, uid and consent in the session metadata", async () => {
    await (createCheckoutSession as unknown as Callable).run(
      request({ profileId: "p1", ownerDeviceId: "dev1", packId: "reading", analytics: { consent: "granted", clientId: "111.222" } }),
    );
    expect(h.create.mock.calls[0][0].metadata).toMatchObject({
      packId: "reading",
      ga_consent: "granted",
      ga_client_id: "111.222",
      ga_uid: "uid-1",
    });
  });

  it("star pack: consent declined -> only the declined flag is stored", async () => {
    await (createCheckoutSession as unknown as Callable).run(
      request({ profileId: "p1", ownerDeviceId: "dev1", packId: "pair", analytics: { consent: "denied", clientId: "111.222" } }),
    );
    const md = h.create.mock.calls[0][0].metadata;
    expect(md.ga_consent).toBe("denied");
    expect(md.ga_client_id).toBeUndefined();
    expect(md.ga_uid).toBeUndefined();
  });

  it("star pack: a client that sends no analytics object (old bundle) is treated as not consented", async () => {
    await (createCheckoutSession as unknown as Callable).run(request({ profileId: "p1", ownerDeviceId: "dev1", packId: "pair" }));
    expect(h.create.mock.calls[0][0].metadata.ga_consent).toBe("denied");
  });

  it("subscription: analytics state is written to BOTH session and subscription_data metadata", async () => {
    await (subscribeAstrologer as unknown as Callable).run(
      request({ profileId: "p1", cadence: "weekly", billingPeriod: "monthly", analytics: { consent: "granted", clientId: "5.6" } }),
    );
    const params = h.create.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    for (const md of [params.metadata, params.subscription_data.metadata]) {
      expect(md).toMatchObject({ ga_consent: "granted", ga_client_id: "5.6", ga_uid: "uid-1" });
    }
    expect(params.subscription_data.metadata).toMatchObject({ kind: "astrologer", cadence: "weekly", period: "monthly" });
  });

  it("subscription: declined consent leaves no identifier in the subscription metadata", async () => {
    await (subscribeAstrologer as unknown as Callable).run(
      request({ profileId: "p1", cadence: "daily", billingPeriod: "annual", analytics: { consent: "denied", clientId: "5.6" } }),
    );
    const md = h.create.mock.calls[0][0].subscription_data.metadata;
    expect(md.ga_consent).toBe("denied");
    expect(md.ga_client_id).toBeUndefined();
    expect(md.ga_uid).toBeUndefined();
  });
});
