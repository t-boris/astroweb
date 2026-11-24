import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { initI18n, textOf } from "@/components/chart/__tests__/tablesTestSupport";
import {
  FailureNote,
  PicturePicker,
  ReadAction,
  ReadPointsTable,
  RecoveredBirthCard,
  SaveAsProfile,
  StorySection,
} from "@/components/explain/ExplainChartParts";
import ExplainChart from "@/pages/ExplainChart";
import ProfileCreate from "@/pages/ProfileCreate";
import ProfilesMenu from "@/components/ProfilesMenu";
import { profilePrefill } from "@/lib/explainChart";
import type { ChartPictureReading, Profile, ReadChartPoint, RecoveredBirth } from "@/types";

/** Explain my natal chart: the page, its pieces in English and Russian, the entry points and the profile prefill. */

vi.mock("@/lib/firebase", () => ({ app: {}, db: {}, functions: {}, auth: { currentUser: null } }));
vi.mock("@/hooks/useDeviceId", () => ({ useDeviceId: () => "device", getDeviceId: () => "device" }));
vi.mock("@/components/SignInNotice", () => ({ default: () => null }));
// The map of the place search needs a browser; the form is what is checked here.
vi.mock("@/components/PlaceSearch", () => ({
  default: ({ initialValue }: { initialValue?: string }) => <input data-place-search value={initialValue ?? ""} readOnly />,
}));

const SRC = join(__dirname, "..", "..");
const RAW_KEY = /\bexplainChart\.[A-Za-z_.]+/;

const html = (element: ReactElement) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

const BIRTH: RecoveredBirth = {
  status: "partial",
  birthDate: "2002-03-30",
  birthTime: "03:30",
  timezone: "Africa/Johannesburg",
  utc: "2002-03-30T01:30:20Z",
  lat: -33.913,
  lng: 18.335,
  timeAccuracyMinutes: 0.8,
  placeAccuracyKm: 20.1,
};

function point(id: ReadChartPoint["id"], sign: string, degree: number, minute: number | null, extra: Partial<ReadChartPoint> = {}): ReadChartPoint {
  return { id, sign, degree, minute, retrograde: false, estimated: false, longitude: 0, resolution: 1 / 60, ...extra };
}

const READING: ChartPictureReading = {
  zodiac: "tropical",
  points: [
    point("Sun", "Aries", 9, 10, { matched: true, deviationArcmin: 0 }),
    point("Mars", "Taurus", 19, 55, { matched: false, deviationArcmin: 30.6 }),
    point("Pluto", "Sagittarius", 17, 36, { retrograde: true, matched: true, deviationArcmin: 0 }),
    point("Chiron", "Capricorn", 8, null, { estimated: true }),
  ],
  asc: point("ASC", "Aquarius", 24, 58, { matched: true, deviationArcmin: 0 }),
  mc: point("MC", "Scorpio", 20, 37, { matched: true, deviationArcmin: 0 }),
  notes: "",
};

describe.each(["en", "ru"] as const)("the pieces of the page (%s)", (lang) => {
  beforeAll(async () => {
    await initI18n(lang);
  });

  it("show when and where the person was born, with the accuracy rounded up", () => {
    const text = textOf(html(<RecoveredBirthCard birth={BIRTH} placeName="Cape Town, Western Cape, South Africa" language={lang} charged />));
    if (lang === "en") {
      expect(text).toContain("When and where the person was born");
      expect(text).toContain("March 30, 2002");
      expect(text).toContain("At about 03:30 local time (± 1 min)");
      expect(text).toContain("Near Cape Town, Western Cape, South Africa (within about 21 km)");
      expect(text).toContain("Time zone: Africa/Johannesburg");
    } else {
      expect(text).toContain("Когда и где родился человек");
      expect(text).toMatch(/30 марта 2002/);
      expect(text).toContain("Около 03:30 по местному времени (± 1 мин)");
      expect(text).toContain("Рядом с Cape Town, Western Cape, South Africa (в пределах ~21 км)");
    }
    expect(text).not.toMatch(RAW_KEY);
  });

  it("name the place by coordinates when there is no name, and say when no star was spent", () => {
    const text = textOf(html(<RecoveredBirthCard birth={BIRTH} placeName={null} language={lang} charged={false} />));
    expect(text).toContain("33.9°S 18.3°E");
    expect(text).toContain(lang === "en" ? "no star was spent" : "звезда не списана");
  });

  it("list what was read, with the misread points named and their distance", () => {
    const markup = html(<ReadPointsTable reading={READING} />);
    expect(markup.match(/data-point=/g)).toHaveLength(6);
    expect(markup).toContain('data-point="Mars" data-matched="false"');
    expect(markup).toContain('data-point="Chiron" data-matched="none"');
    const text = textOf(markup);
    if (lang === "en") {
      expect(text).toContain("19°55′ Taurus");
      expect(text).toContain("17°36′ Sagittarius ℞");
      expect(text).toContain("≈ 8° Capricorn");
      expect(text).toContain("off by 31′");
      expect(text).toContain("not checked");
      expect(text).toContain("probably misread: Mars.");
    } else {
      expect(text).toContain("19°55′ Телец");
      expect(text).toContain("расхождение 31′");
      expect(text).toContain("Марс");
    }
    expect(text).not.toMatch(RAW_KEY);
  });

  it("explain a picture without ASC and MC, and that the star came back", () => {
    const text = textOf(html(<FailureNote failure={{ kind: "not_read", reason: "missing_angles" }} />));
    expect(text).toContain("ASC");
    expect(text).toContain("MC");
    expect(text).toContain(lang === "en" ? "Your star has been returned." : "Звезда возвращена.");
    const short = textOf(html(<FailureNote failure={{ kind: "no_stars" }} />));
    expect(short).not.toContain(lang === "en" ? "returned" : "возвращена");
  });

  it("offer to read, to sign in, or the way to stars", () => {
    const signedOut = textOf(html(<ReadAction signedIn={false} stars={null} firstProfileId={null} busy={false} disabled={false} onRead={() => {}} />));
    expect(signedOut).toContain(lang === "en" ? "Sign in and read · ✦1" : "Войти и прочитать · ✦1");

    const ready = textOf(html(<ReadAction signedIn stars={4} firstProfileId="p1" busy={false} disabled={false} onRead={() => {}} />));
    expect(ready).toContain(lang === "en" ? "Read the chart · ✦1" : "Прочитать карту · ✦1");
    expect(ready).toContain(lang === "en" ? "You have ✦4" : "У вас ✦4");

    const short = html(<ReadAction signedIn stars={0} firstProfileId="p1" busy={false} disabled={false} onRead={() => {}} />);
    expect(short).toContain('href="/profile/p1?tab=premium"');
    const noProfile = html(<ReadAction signedIn stars={0} firstProfileId={null} busy={false} disabled={false} onRead={() => {}} />);
    expect(noProfile).toContain('href="/profile/new"');
    expect(noProfile).not.toContain("?tab=premium");
  });

  it("show the story as it is written, written, or failed", () => {
    expect(textOf(html(<StorySection text={null} state="loading" onRetry={() => {}} />))).toContain(lang === "en" ? "Writing the story…" : "Пишем рассказ…");
    expect(textOf(html(<StorySection text={"## Born around\nA calm and curious person."} state="done" onRetry={() => {}} />))).toContain(
      "A calm and curious person.",
    );
    const failed = html(<StorySection text={null} state="failed" onRetry={() => {}} />);
    expect(failed).toContain('data-story="failed"');
    expect(failed).toContain("<button");
  });

  it("show the picker and the offer to save the person", () => {
    const picker = textOf(html(<PicturePicker picture={null} preparing={false} disabled={false} onFile={() => {}} />));
    expect(picker).toContain(lang === "en" ? "Choose a picture" : "Выбрать картинку");
    expect(textOf(html(<SaveAsProfile onSave={() => {}} />))).toContain(lang === "en" ? "Create a profile" : "Создать профиль");
  });

  it("open the page with what the picture must show", () => {
    const markup = html(<ExplainChart />);
    const text = textOf(markup);
    expect(text).toContain(lang === "en" ? "Explain my natal chart" : "Объясни мою натальную карту");
    expect(text).toContain("ASC");
    expect(text).toContain("MC");
    expect(markup).toContain("data-picture-input");
    expect(markup).toContain('accept="image/png,image/jpeg,image/webp,image/heic,image/heif"');
    expect(text).not.toMatch(RAW_KEY);
  });
});

describe("saving the person as a profile", () => {
  beforeAll(async () => {
    await initI18n("en");
  });

  it("opens the profile form filled in with the recovered birth", () => {
    const prefill = profilePrefill(BIRTH, "Cape Town, Western Cape, South Africa");
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname: "/profile/new", state: { prefill } }]}>
        <ProfileCreate />
      </MemoryRouter>,
    );
    expect(markup).toContain('value="2002-03-30"');
    expect(markup).toContain('value="03:30"');
    expect(markup).toContain('value="Cape Town, Western Cape, South Africa"');
    expect(markup).toContain("-33.9130, 18.3350");
    expect(markup).toContain("data-prefill-note");
    // The name is the user's to give.
    expect(markup).toMatch(/id="name"[^>]*value=""/);
  });

  it("leaves the form empty without a prefill", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/profile/new"]}>
        <ProfileCreate />
      </MemoryRouter>,
    );
    expect(markup).not.toContain("data-prefill-note");
    expect(markup).not.toContain('value="2002-03-30"');
  });
});

describe("the two ways to start, side by side", () => {
  beforeAll(async () => {
    await initI18n("en");
  });

  it("the profiles panel has Explain my natal chart under Create profile", () => {
    const someone: Profile = {
      id: "p1",
      ownerDeviceId: "device",
      name: "Someone",
      birthDate: "1990-01-01",
      birthTime: null,
      timeUnknown: true,
      birthPlace: "London",
      lat: 51.5,
      lng: -0.1,
      timezone: "Europe/London",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    // The panel shows only once there is a profile; before that the home page offers both ways.
    const markup = html(<ProfilesMenu profiles={[someone]} deviceId="device" onDelete={() => {}} onUnarchive={() => {}} />);
    const create = markup.indexOf('href="/profile/new"');
    const explain = markup.indexOf('href="/explain-chart"');
    expect(create).toBeGreaterThan(-1);
    expect(explain).toBeGreaterThan(create);
    expect(textOf(markup)).toContain("Explain my natal chart");
  });

  it("the home page and the header switcher link to it next to the profile form", () => {
    for (const file of ["pages/Home.tsx", "components/ProfileSwitcher.tsx"]) {
      const source = readFileSync(join(SRC, file), "utf-8");
      const create = source.indexOf('to="/profile/new"');
      const explain = source.indexOf('to="/explain-chart"');
      expect(create, file).toBeGreaterThan(-1);
      expect(explain, file).toBeGreaterThan(create);
      expect(source, file).toContain('t("explainChart.title")');
    }
  });
});
