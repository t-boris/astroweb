import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_PARAMS } from "@/lib/analyticsEvents";

/**
 * The privacy pages must say what analytics really does (REQ-004). These tests
 * tie the locale text to the implementation: the event allowlist, the server
 * event names and the identifiers used.
 */
const load = (lng: string) => JSON.parse(readFileSync(resolve(__dirname, `../../../public/locales/${lng}/translation.json`), "utf-8"));
const flatten = (o: unknown): string[] =>
  typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(flatten) : [];

const texts = { en: flatten(load("en").privacy).join("\n"), ru: flatten(load("ru").privacy).join("\n") };
const SERVER_EVENTS = ["purchase", "subscription_start", "subscription_renewal", "subscription_cancel"];
const CLIENT_EVENTS = [...Object.keys(ALLOWED_PARAMS), "page_view"];

describe.each(["en", "ru"] as const)("privacy text (%s)", (lng) => {
  const text = texts[lng];

  it("names the operator and the contact", () => {
    expect(text).toContain("MobileMind AI");
    expect(text).toContain("astroweb@mobilemindai.com");
  });

  it("lists every client event the app sends and every server event the webhook sends", () => {
    for (const name of [...CLIENT_EVENTS, ...SERVER_EVENTS]) {
      expect(text, name).toContain(name);
    }
  });

  it("describes Google Analytics / GA4, the cookies and basic Consent Mode", () => {
    expect(text).toContain("GA4");
    expect(text).toContain("_ga");
    expect(text).toContain("_ga_<container id>");
    expect(text).toMatch(/Consent Mode/);
  });

  it("states that server-side events are sent whether or not consent was given", () => {
    expect(text).toMatch(lng === "en" ? /whether or not you gave consent/ : /независимо от того, давали ли вы согласие/);
  });

  it("explains the identifiers with and without consent", () => {
    expect(text).toContain("client id");
    expect(text).toContain("user_id");
    expect(text).toMatch(lng === "en" ? /one-way hash of the Stripe identifier/ : /односторонний хеш идентификатора/);
    expect(text).toMatch(lng === "en" ? /checkout session id for a purchase/ : /идентификатор сессии оплаты/);
  });

  it("says the pseudonymous id can be linked to the payment record and is not anonymous", () => {
    expect(text).toMatch(lng === "en" ? /matched to the payment record we hold in Stripe and in our database/ : /сопоставить с записью о платеже/);
    expect(text).toMatch(lng === "en" ? /pseudonymous/ : /псевдоним/);
    expect(text).not.toMatch(/fully anonymous|completely anonymous|полностью анонимн|являются анонимными/i);
  });

  it("covers subscription consent: recorded at checkout, applies to renewal/cancel, later withdrawal does not change it", () => {
    expect(text).toMatch(lng === "en" ? /recorded when you start the subscription checkout/ : /фиксируется, когда вы начинаете оформление подписки/);
    expect(text).toMatch(lng === "en" ? /renewal and cancel events/ : /продления и отмены/);
    expect(text).toMatch(lng === "en" ? /Withdrawing consent on the site later does not change/ : /отзовёте согласие на сайте, сохранённый выбор существующей подписки не изменится/);
    expect(text).toMatch(lng === "en" ? /write to <mail>astroweb@mobilemindai\.com<\/mail>/ : /напишите на <mail>astroweb@mobilemindai\.com<\/mail>/);
  });

  it("never mentions birth data", () => {
    expect(text).not.toMatch(/birth|рожден|натальн/i);
  });

  it("tells how to reopen the choice and has a control labelled for it", () => {
    const section = load(lng).privacy.change;
    expect(section.button.length).toBeGreaterThan(3);
    expect(section.body.length).toBeGreaterThan(20);
  });
});

describe("privacy page component", () => {
  const source = readFileSync(resolve(__dirname, "../../pages/Privacy.tsx"), "utf-8");
  it("links the contact as a mailto and wires the reopen-consent control", () => {
    expect(source).toContain("mailto:astroweb@mobilemindai.com");
    expect(source).toContain("openConsentChoice");
  });
  it("renders every event line the locale defines", () => {
    const keys = Object.keys(load("en").privacy.events).filter((k) => !["title", "intro", "userId"].includes(k));
    for (const k of keys) expect(source, k).toContain(`"${k}"`);
  });
});

describe("consent banner and footer", () => {
  it("link to the privacy page in the current UI language", () => {
    const banner = readFileSync(resolve(__dirname, "../../components/ConsentBanner.tsx"), "utf-8");
    const footer = readFileSync(resolve(__dirname, "../../components/SiteFooter.tsx"), "utf-8");
    for (const src of [banner, footer]) {
      expect(src).toContain("privacyPath(toAppLanguage(i18n.language))");
    }
  });
  it("have EN and RU text", () => {
    for (const lng of ["en", "ru"]) {
      const d = load(lng);
      expect(d.consent.body).toContain("<privacy>");
      expect(d.consent.accept).toBeTruthy();
      expect(d.consent.decline).toBeTruthy();
      expect(d.footer.privacy).toBeTruthy();
    }
  });
});
