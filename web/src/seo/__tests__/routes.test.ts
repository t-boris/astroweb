import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTES,
  headTagsFor,
  homePath,
  isPrivatePath,
  privacyPath,
  publicRoute,
  renderHeadTags,
  sitemapXml,
} from "@/seo/routes";
import { withRouteHead } from "../../../seo-shells-plugin";

const attr = (route: (typeof PUBLIC_ROUTES)[number], pick: (t: { tag: string; attrs: Record<string, string> }) => boolean) =>
  headTagsFor(route).filter(pick);

describe("public routes (REQ-003, REQ-008)", () => {
  it("lists exactly /, /ru, /privacy and /ru/privacy", () => {
    expect(PUBLIC_ROUTES.map((r) => r.path)).toEqual(["/", "/ru", "/privacy", "/ru/privacy"]);
  });

  it("gives every page its own non-empty title and description", () => {
    const titles = PUBLIC_ROUTES.map((r) => r.title);
    const descriptions = PUBLIC_ROUTES.map((r) => r.description);
    expect(new Set(titles).size).toBe(4);
    expect(new Set(descriptions).size).toBe(4);
    for (const r of PUBLIC_ROUTES) {
      expect(r.title.length).toBeGreaterThan(10);
      expect(r.title.length).toBeLessThanOrEqual(70);
      expect(r.description.length).toBeGreaterThan(50);
      expect(r.description.length).toBeLessThanOrEqual(170);
    }
  });

  it("uses the right language in titles and descriptions", () => {
    for (const r of PUBLIC_ROUTES) {
      const cyrillic = /[А-Яа-я]/.test(r.title + r.description);
      expect(cyrillic).toBe(r.lang === "ru");
    }
  });

  it("each page has a self-referencing canonical and reciprocal hreflang with x-default", () => {
    for (const r of PUBLIC_ROUTES) {
      const canonical = attr(r, (t) => t.attrs.rel === "canonical");
      expect(canonical).toHaveLength(1);
      expect(canonical[0].attrs.href).toBe(r.path === "/" ? "https://natalmystic.com/" : `https://natalmystic.com${r.path}`);
      const alt = Object.fromEntries(attr(r, (t) => t.attrs.rel === "alternate").map((t) => [t.attrs.hreflang, t.attrs.href]));
      const kind = r.kind;
      const en = PUBLIC_ROUTES.find((x) => x.kind === kind && x.lang === "en")!;
      const ru = PUBLIC_ROUTES.find((x) => x.kind === kind && x.lang === "ru")!;
      expect(alt.en).toContain(en.path === "/" ? "natalmystic.com/" : en.path);
      expect(alt.ru).toContain(ru.path);
      expect(alt["x-default"]).toBe(alt.en);
    }
  });

  it("carries Open Graph and Twitter tags that differ per page", () => {
    const seen = new Set<string>();
    for (const r of PUBLIC_ROUTES) {
      const meta = Object.fromEntries(headTagsFor(r).filter((t) => t.tag === "meta").map((t) => [t.attrs.property ?? t.attrs.name, t.attrs.content]));
      for (const k of ["og:title", "og:description", "og:url", "og:locale", "twitter:card", "twitter:title"]) {
        expect(meta[k], `${r.path} ${k}`).toBeTruthy();
      }
      expect(meta["og:title"]).toBe(r.title);
      expect(meta["og:locale"]).toBe(r.lang === "ru" ? "ru_RU" : "en_US");
      seen.add(meta["og:url"]);
    }
    expect(seen.size).toBe(4);
  });

  it("adds JSON-LD only to the landing pages", () => {
    for (const r of PUBLIC_ROUTES) {
      const ld = headTagsFor(r).filter((t) => t.attrs.type === "application/ld+json");
      if (r.kind === "landing") {
        expect(ld).toHaveLength(1);
        const data = JSON.parse((ld[0].text as string).replace(/\\u003c/g, "<"));
        expect(data["@type"]).toBe("WebApplication");
        expect(data.inLanguage).toBe(r.lang);
        expect(data.url).toContain("natalmystic.com");
      } else {
        expect(ld).toHaveLength(0);
      }
    }
  });

  it("marks every tag data-seo so the client can replace it", () => {
    for (const r of PUBLIC_ROUTES) expect(headTagsFor(r).every((t) => t.attrs["data-seo"] === "1")).toBe(true);
  });

  it("escapes attribute values", () => {
    const html = renderHeadTags([{ tag: "meta", attrs: { name: "x", content: 'a "b" <c> & d' } }]);
    expect(html).toBe('<meta name="x" content="a &quot;b&quot; &lt;c> &amp; d" />');
  });
});

describe("sitemap.xml", () => {
  const xml = sitemapXml("2026-10-12");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it("lists exactly the four public URLs", () => {
    expect(locs).toEqual([
      "https://natalmystic.com/",
      "https://natalmystic.com/ru",
      "https://natalmystic.com/privacy",
      "https://natalmystic.com/ru/privacy",
    ]);
  });

  it("never lists private routes", () => {
    expect(xml).not.toMatch(/\/admin|\/account|\/profile/);
  });
});

describe("route helpers", () => {
  it("classifies private routes", () => {
    for (const p of ["/admin", "/account", "/profile/new", "/profile/abc/edit", "/profile/abc/astrologer", "/admin/"]) {
      expect(isPrivatePath(p), p).toBe(true);
    }
    for (const p of ["/", "/ru", "/privacy", "/ru/privacy", "/profiles-info"]) {
      expect(isPrivatePath(p), p).toBe(false);
    }
  });

  it("resolves public routes ignoring trailing slash and query", () => {
    expect(publicRoute("/ru/")?.path).toBe("/ru");
    expect(publicRoute("/privacy?x=1")?.path).toBe("/privacy");
    expect(publicRoute("/profile/abc")).toBeUndefined();
  });

  it("builds language-aware home and privacy paths", () => {
    expect(homePath("en")).toBe("/");
    expect(homePath("ru")).toBe("/ru");
    expect(privacyPath("en")).toBe("/privacy");
    expect(privacyPath("ru")).toBe("/ru/privacy");
  });
});

describe("static shell generation (DEC-008)", () => {
  const base = '<!doctype html><html lang="en" class="dark"><head><title>AstroWeb</title></head><body></body></html>';

  it("replaces the title and html lang and injects the route tags", () => {
    const ru = PUBLIC_ROUTES.find((r) => r.path === "/ru/privacy")!;
    const html = withRouteHead(base, ru);
    expect(html).toContain('<html lang="ru" class="dark">');
    expect(html).toContain(`<title>${ru.title}</title>`);
    expect(html).toContain('rel="canonical" href="https://natalmystic.com/ru/privacy"');
    expect(html).not.toContain("<title>AstroWeb</title>");
  });

  it("adds the Search Console verification tag only when a token is given", () => {
    const r = PUBLIC_ROUTES[0];
    expect(withRouteHead(base, r)).not.toContain("google-site-verification");
    expect(withRouteHead(base, r, "tok-123")).toContain('<meta name="google-site-verification" content="tok-123" />');
  });
});

describe("Hosting config (REQ-008)", () => {
  const firebase = JSON.parse(readFileSync(resolve(__dirname, "../../../../firebase.json"), "utf-8"));
  const headers = firebase.hosting.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;

  it("serves X-Robots-Tag noindex for /admin, /account and /profile/**", () => {
    for (const source of ["/admin", "/account", "/profile/**"]) {
      const h = headers.find((x) => x.source === source);
      expect(h, source).toBeTruthy();
      expect(h!.headers).toContainEqual({ key: "X-Robots-Tag", value: expect.stringContaining("noindex") });
    }
  });

  it("uses clean URLs so /ru and /ru/privacy resolve to the generated files", () => {
    expect(firebase.hosting.cleanUrls).toBe(true);
    expect(firebase.hosting.trailingSlashBehavior).toBe("REMOVE");
  });

  it("serves a robots.txt that allows / and points at the sitemap", () => {
    const robots = readFileSync(resolve(__dirname, "../../../public/robots.txt"), "utf-8");
    expect(robots).toMatch(/User-agent: \*/);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
    expect(robots).toContain("Sitemap: https://natalmystic.com/sitemap.xml");
  });
});
