import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import ProfilesMenu from "@/components/ProfilesMenu";
import { SubscriptionPill, SubscriptionSparkle } from "@/components/SubscriptionBadge";
import { initI18n, textOf } from "@/components/chart/__tests__/tablesTestSupport";
import {
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  PANEL_STORAGE_KEY,
  clampPanelWidth,
  maxPanelWidth,
  readStoredPanelWidth,
  storePanelWidth,
  widthAfterKey,
} from "@/lib/panelWidth";
import { SUBSCRIPTION_COLOURS, cadenceTextKey } from "@/lib/subscriptionMark";
import type { Profile, ProfileSubscription } from "@/types";

/** The profiles panel: its width rules, the subscription marks and the first paint of the list. */

// The sign-in hint talks to Firebase auth; it is not what is tested here.
vi.mock("@/components/SignInNotice", () => ({ default: () => null }));

beforeAll(async () => {
  await initI18n("en");
});

function profile(id: string, extra: Partial<Profile> = {}): Profile {
  return {
    id,
    ownerDeviceId: "device",
    name: `Name ${id}`,
    birthDate: "1990-01-01",
    birthTime: null,
    timeUnknown: true,
    birthPlace: "London",
    lat: 51.5,
    lng: -0.1,
    timezone: "Europe/London",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const SUB = (state: ProfileSubscription["state"], cadence = "every_2_days", until: string | null = "2026-12-05T12:00:00.000Z"): ProfileSubscription => ({
  state,
  cadence,
  until,
});

describe("panel width rules", () => {
  it("keeps the width between the minimum and the maximum, and at most 40% of the window", () => {
    expect(clampPanelWidth(100, 1440)).toBe(PANEL_MIN);
    expect(clampPanelWidth(9999, 1440)).toBe(PANEL_MAX);
    expect(clampPanelWidth(300, 1440)).toBe(300);
    expect(maxPanelWidth(1280)).toBe(PANEL_MAX);
    expect(maxPanelWidth(900)).toBe(360);
    expect(clampPanelWidth(430, 900)).toBe(360);
    // A window so narrow that 40% is below the minimum still gives the minimum.
    expect(maxPanelWidth(400)).toBe(PANEL_MIN);
  });

  it("falls back to the default for a number that is not one", () => {
    expect(clampPanelWidth(Number.NaN, 1440)).toBe(PANEL_DEFAULT);
    expect(clampPanelWidth(Number.POSITIVE_INFINITY, 1440)).toBe(PANEL_DEFAULT);
  });

  it("moves with the arrow keys, by a larger step with Shift, and stops at the ends", () => {
    expect(widthAfterKey("ArrowRight", 240, false, 1440)).toBe(256);
    expect(widthAfterKey("ArrowLeft", 240, false, 1440)).toBe(224);
    expect(widthAfterKey("ArrowRight", 240, true, 1440)).toBe(288);
    expect(widthAfterKey("ArrowLeft", PANEL_MIN, false, 1440)).toBe(PANEL_MIN);
    expect(widthAfterKey("ArrowRight", PANEL_MAX, false, 1440)).toBe(PANEL_MAX);
    expect(widthAfterKey("Home", 300, false, 1440)).toBe(PANEL_MIN);
    expect(widthAfterKey("End", 300, false, 1440)).toBe(PANEL_MAX);
    expect(widthAfterKey("Tab", 300, false, 1440)).toBeNull();
  });

  it("remembers the width, ignores a bad stored value and survives blocked storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => void values.set(k, v),
      removeItem: (k: string) => void values.delete(k),
    };
    expect(readStoredPanelWidth(storage)).toBe(PANEL_DEFAULT);
    storePanelWidth(storage, 320);
    expect(values.get(PANEL_STORAGE_KEY)).toBe("320");
    expect(readStoredPanelWidth(storage)).toBe(320);
    // The default is not stored: the key goes away, so the panel follows a changed default later.
    storePanelWidth(storage, PANEL_DEFAULT);
    expect(values.has(PANEL_STORAGE_KEY)).toBe(false);
    values.set(PANEL_STORAGE_KEY, "banana");
    expect(readStoredPanelWidth(storage)).toBe(PANEL_DEFAULT);
    values.set(PANEL_STORAGE_KEY, "9000");
    expect(readStoredPanelWidth(storage)).toBe(PANEL_MAX);

    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredPanelWidth(blocked)).toBe(PANEL_DEFAULT);
    expect(() => storePanelWidth(blocked, 300)).not.toThrow();
    expect(readStoredPanelWidth(null)).toBe(PANEL_DEFAULT);
  });
});

describe("subscription marks", () => {
  it("maps every cadence the app sells to a text and tolerates an unknown one", () => {
    for (const c of ["daily", "every_2_days", "every_5_days", "weekly", "every_2_weeks"]) expect(cadenceTextKey(c)).toMatch(/^hub\.cad/);
    expect(cadenceTextKey("")).toBeNull();
    expect(cadenceTextKey("hourly")).toBeNull();
  });

  it("has a colour for every state, gold for an active one", () => {
    expect(Object.keys(SUBSCRIPTION_COLOURS).sort()).toEqual(["active", "ending", "past_due", "paused"]);
    expect(SUBSCRIPTION_COLOURS.active).toBe("#e8c969");
  });

  it("words each state", () => {
    const text = (s: ProfileSubscription) => textOf(renderToStaticMarkup(<SubscriptionPill subscription={s} />));
    expect(text(SUB("active"))).toBe("Astrologer · Every 2 days");
    expect(text(SUB("active", "daily"))).toBe("Astrologer · Daily");
    expect(text(SUB("active", "something-new"))).toBe("Astrologer");
    // The end of the paid period is shown as a date in the viewer's own time zone.
    const until = "2026-12-05T12:00:00.000Z";
    const expected = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(until));
    expect(text(SUB("ending", "every_2_days", until))).toBe(`Astrologer · until ${expected}`);
    expect(text(SUB("ending", "daily", null))).toBe("Astrologer · ending");
    expect(text(SUB("paused"))).toBe("Astrologer · paused");
    expect(text(SUB("past_due"))).toBe("Astrologer · payment failed");
  });

  it("gives the sparkle the wording as its accessible name and tooltip", () => {
    const html = renderToStaticMarkup(<SubscriptionSparkle subscription={SUB("paused")} />);
    expect(html).toContain('aria-label="Astrologer · paused"');
    expect(html).toContain('title="Astrologer · paused"');
    expect(html).toContain('data-subscription="paused"');
  });
});

describe("the profiles panel", () => {
  const render = (profiles: Profile[]) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ProfilesMenu profiles={profiles} deviceId="device" onDelete={() => {}} onUnarchive={() => {}} />
      </MemoryRouter>,
    );

  it("marks only the profiles that have a subscription", () => {
    const html = render([profile("a", { subscription: SUB("active") }), profile("b"), profile("c", { subscription: SUB("past_due") })]);
    expect(html.match(/data-subscription-card=/g)).toHaveLength(2);
    expect(html).toContain('data-subscription-card="active"');
    expect(html).toContain('data-subscription-card="past_due"');
    const text = textOf(html);
    expect(text).toContain("Astrologer · Every 2 days");
    expect(text).toContain("Astrologer · payment failed");
    expect(text).toContain("Name b");
  });

  it("hides the scroll bar of the list and offers a resize handle with its limits", () => {
    const html = render([profile("a")]);
    expect(html).toMatch(/class="[^"]*scrollbar-hidden[^"]*overflow-y-auto/);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain(`aria-valuemin="${PANEL_MIN}"`);
    expect(html).toContain(`aria-valuenow="${PANEL_DEFAULT}"`);
    expect(html).toContain('aria-label="Resize the profiles panel"');
    expect(html).toContain("--panel-w:240px");
    expect(html).toContain('tabindex="0"');
  });

  it("does not mark archived profiles and renders nothing without profiles", () => {
    const html = render([profile("a"), profile("z", { archived: true, subscription: SUB("active") })]);
    expect(html.match(/data-subscription-card=/g)).toBeNull();
    expect(render([])).toBe("");
  });
});
