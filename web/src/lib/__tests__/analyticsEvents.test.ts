import { describe, expect, it } from "vitest";
import { ALLOWED_PARAMS, PROFILE_TABS, buildEventPayload, templatePath } from "@/lib/analyticsEvents";

describe("funnel taxonomy (REQ-005)", () => {
  it("defines exactly the nine documented events", () => {
    expect(Object.keys(ALLOWED_PARAMS).sort()).toEqual(
      [
        "ai_reading_requested",
        "astrologer_subscribe_start",
        "begin_checkout",
        "chart_viewed",
        "letter_opened",
        "paywall_viewed",
        "profile_create_start",
        "profile_created",
        "unlock_feature",
      ].sort(),
    );
  });

  it("documents the profile tabs", () => {
    expect([...PROFILE_TABS]).toEqual([
      "chart", "planets", "aspects", "houses", "interpretation", "oracle", "transits", "compatibility", "astrologer", "premium",
    ]);
  });

  it("keeps documented parameters", () => {
    expect(buildEventPayload("chart_viewed", { tab: "planets" })).toEqual({ tab: "planets" });
    expect(buildEventPayload("paywall_viewed", { feature: "oracle" })).toEqual({ feature: "oracle" });
    expect(buildEventPayload("unlock_feature", { feature: "interpretations", stars: 4 })).toEqual({ feature: "interpretations", stars: 4 });
    expect(buildEventPayload("astrologer_subscribe_start", { cadence: "weekly", billing_period: "annual" })).toEqual({
      cadence: "weekly",
      billing_period: "annual",
    });
    expect(buildEventPayload("ai_reading_requested", { kind: "deepen" })).toEqual({ kind: "deepen" });
    expect(buildEventPayload("begin_checkout", { pack_id: "reading", value: 3.99, currency: "USD", items: [{ item_id: "reading" }] })).toEqual({
      pack_id: "reading",
      value: 3.99,
      currency: "USD",
      items: [{ item_id: "reading" }],
    });
  });

  it("sends nothing for parameterless events, even if a caller passes data", () => {
    const leak = { name: "Ada", email: "a@b.c", birthDate: "1990-01-01", birthPlace: "Paris", lat: 48.8, lng: 2.3 };
    for (const name of ["profile_create_start", "profile_created", "letter_opened"] as const) {
      expect(buildEventPayload(name, leak)).toEqual({});
    }
  });

  it("drops every non-allowlisted key (no names, dates, places, e-mails)", () => {
    const payload = buildEventPayload("chart_viewed", {
      tab: "chart",
      name: "Ada",
      email: "a@b.c",
      birthDate: "1990-01-01",
      birthPlace: "Paris",
      profileId: "abc123",
    } as never);
    expect(payload).toEqual({ tab: "chart" });
    expect(JSON.stringify(payload)).not.toMatch(/Ada|a@b\.c|1990|Paris|abc123/);
  });

  it("only passes primitive values and item_id items", () => {
    const payload = buildEventPayload("begin_checkout", {
      pack_id: { nested: "object" },
      value: 1,
      currency: "USD",
      items: [{ item_id: "reading", item_name: "Ada's reading" }, "junk", null],
    } as never);
    expect(payload).toEqual({ value: 1, currency: "USD", items: [{ item_id: "reading" }] });
  });
});

describe("page path templating", () => {
  it("replaces profile ids so no identifier reaches GA", () => {
    expect(templatePath("/profile/abc123")).toBe("/profile/:id");
    expect(templatePath("/profile/abc123/edit")).toBe("/profile/:id/edit");
    expect(templatePath("/profile/abc123/letters/")).toBe("/profile/:id/letters");
    expect(templatePath("/profile/abc123?tab=premium&checkout=success")).toBe("/profile/:id");
  });

  it("keeps other paths", () => {
    for (const p of ["/", "/ru", "/privacy", "/ru/privacy", "/account", "/admin", "/profile/new"]) {
      expect(templatePath(p)).toBe(p);
    }
  });
});
