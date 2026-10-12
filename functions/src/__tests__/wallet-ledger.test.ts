import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore, type FakeFirestore } from "./helpers/fakeFirestore";

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeFirestore }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => holder.fake.db,
  FieldValue: { serverTimestamp: () => "TS" },
}));

import {
  buildStarSpendRow,
  grantToWallet,
  refundToWallet,
  spendFromWallet,
  spendInTx,
} from "../services/wallet";

const rows = () => [...holder.fake.all("starSpends").values()];

describe("starSpends ledger (REQ-009)", () => {
  beforeEach(() => {
    holder.fake = createFakeFirestore();
    holder.fake.seed("wallets", "u1", { tokens: 5 });
  });

  it("builds a row with the wallet key, feature and stars", () => {
    expect(buildStarSpendRow("u1", "oracle", 1)).toEqual({ walletKey: "u1", feature: "oracle", stars: 1 });
  });

  it("writes one row with the debit in the same commit", async () => {
    const left = await spendFromWallet("u1", 2, "relationship");
    expect(left).toBe(3);
    expect(holder.fake.all("wallets").get("u1")?.tokens).toBe(3);
    expect(rows()).toEqual([{ walletKey: "u1", feature: "relationship", stars: 2, createdAt: "TS" }]);
  });

  it("writes no row and keeps the balance when stars are insufficient", async () => {
    await expect(spendFromWallet("u1", 9, "oracle")).rejects.toMatchObject({ message: "INSUFFICIENT_TOKENS" });
    expect(holder.fake.all("wallets").get("u1")?.tokens).toBe(5);
    expect(rows()).toHaveLength(0);
  });

  it("writes a negative row on refund so net spend is zero", async () => {
    await spendFromWallet("u1", 1, "letter");
    await refundToWallet("u1", 1, "letter");
    const r = rows();
    expect(r.map((x) => x.stars)).toEqual([1, -1]);
    expect(r.every((x) => x.feature === "letter")).toBe(true);
    expect(holder.fake.all("wallets").get("u1")?.tokens).toBe(5);
  });

  it("does not write a ledger row for purchases or admin grants", async () => {
    await grantToWallet("u1", 4);
    expect(holder.fake.all("wallets").get("u1")?.tokens).toBe(9);
    expect(rows()).toHaveLength(0);
  });

  it("spendInTx records the row inside the caller's transaction", async () => {
    const db = holder.fake.db as { runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };
    const left = await db.runTransaction((tx) => spendInTx(tx as never, "u1", 4, "interpretations"));
    expect(left).toBe(1);
    expect(rows()).toEqual([{ walletKey: "u1", feature: "interpretations", stars: 4, createdAt: "TS" }]);
  });
});
