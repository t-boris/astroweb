/**
 * Public-route SEO metadata, shared by the Vite build plugin (which writes the
 * tags into the static HTML that Hosting serves, DEC-008) and by the client
 * head sync (SPA navigation). Pure TypeScript: no DOM, no React.
 */

export const SITE_URL = "https://natalmystic.com";
export type Lang = "en" | "ru";
export type PageKind = "landing" | "privacy";

export interface PublicRoute {
  path: string;
  lang: Lang;
  kind: PageKind;
  title: string;
  description: string;
  ogLocale: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: "/",
    lang: "en",
    kind: "landing",
    title: "AstroWeb – Natal Chart & AI Astrology Readings",
    description:
      "Calculate your natal chart with the Swiss Ephemeris and get a personal AI astrology reading. Explore planets, houses and aspects, and ask the Oracle.",
    ogLocale: "en_US",
  },
  {
    path: "/ru",
    lang: "ru",
    kind: "landing",
    title: "AstroWeb – натальная карта и ИИ-астролог онлайн",
    description:
      "Рассчитайте натальную карту по швейцарским эфемеридам и получите персональный разбор от ИИ-астролога. Планеты, дома, аспекты и вопросы Оракулу.",
    ogLocale: "ru_RU",
  },
  {
    path: "/privacy",
    lang: "en",
    kind: "privacy",
    title: "Privacy & Analytics – AstroWeb",
    description:
      "How AstroWeb uses Google Analytics and cookies, which purchase events are sent from our servers, and how to change or withdraw your consent.",
    ogLocale: "en_US",
  },
  {
    path: "/ru/privacy",
    lang: "ru",
    kind: "privacy",
    title: "Конфиденциальность и аналитика – AstroWeb",
    description:
      "Как AstroWeb использует Google Analytics и cookie, какие события покупок отправляются с наших серверов и как изменить или отозвать согласие.",
    ogLocale: "ru_RU",
  },
];

/** Routes whose pages must never be indexed (REQ-008). */
export const PRIVATE_PREFIXES = ["/admin", "/account", "/profile"] as const;

const normalize = (pathname: string): string => {
  const p = pathname.split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
};

export function publicRoute(pathname: string): PublicRoute | undefined {
  const p = normalize(pathname);
  return PUBLIC_ROUTES.find((r) => r.path === p);
}

export function isPrivatePath(pathname: string): boolean {
  const p = normalize(pathname);
  return PRIVATE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function routeFor(kind: PageKind, lang: Lang): PublicRoute {
  return PUBLIC_ROUTES.find((r) => r.kind === kind && r.lang === lang) as PublicRoute;
}

export const homePath = (lang: Lang): string => routeFor("landing", lang).path;
export const privacyPath = (lang: Lang): string => routeFor("privacy", lang).path;

export const absoluteUrl = (path: string): string => (path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`);

export interface HeadTag {
  tag: "meta" | "link" | "script";
  attrs: Record<string, string>;
  /** Text content (JSON-LD). */
  text?: string;
}

/** WebApplication structured data for a landing page. */
export function landingJsonLd(route: PublicRoute): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "AstroWeb",
    url: absoluteUrl(route.path),
    description: route.description,
    inLanguage: route.lang,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    publisher: { "@type": "Organization", name: "MobileMind AI" },
  };
}

/** Tags for a public page, excluding <title>. Every tag is marked data-seo so the client can replace it. */
export function headTagsFor(route: PublicRoute): HeadTag[] {
  const url = absoluteUrl(route.path);
  const en = routeFor(route.kind, "en");
  const ru = routeFor(route.kind, "ru");
  const other = route.lang === "en" ? ru : en;
  const tags: HeadTag[] = [
    { tag: "meta", attrs: { name: "description", content: route.description } },
    { tag: "link", attrs: { rel: "canonical", href: url } },
    { tag: "link", attrs: { rel: "alternate", hreflang: "en", href: absoluteUrl(en.path) } },
    { tag: "link", attrs: { rel: "alternate", hreflang: "ru", href: absoluteUrl(ru.path) } },
    { tag: "link", attrs: { rel: "alternate", hreflang: "x-default", href: absoluteUrl(en.path) } },
    { tag: "meta", attrs: { property: "og:type", content: "website" } },
    { tag: "meta", attrs: { property: "og:site_name", content: "AstroWeb" } },
    { tag: "meta", attrs: { property: "og:title", content: route.title } },
    { tag: "meta", attrs: { property: "og:description", content: route.description } },
    { tag: "meta", attrs: { property: "og:url", content: url } },
    { tag: "meta", attrs: { property: "og:locale", content: route.ogLocale } },
    { tag: "meta", attrs: { property: "og:locale:alternate", content: other.ogLocale } },
    { tag: "meta", attrs: { property: "og:image", content: `${SITE_URL}/og-image.png` } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
    { tag: "meta", attrs: { name: "twitter:title", content: route.title } },
    { tag: "meta", attrs: { name: "twitter:description", content: route.description } },
    { tag: "meta", attrs: { name: "twitter:image", content: `${SITE_URL}/og-image.png` } },
  ];
  if (route.kind === "landing") {
    tags.push({
      tag: "script",
      attrs: { type: "application/ld+json" },
      // "<" is escaped so the JSON can never close the script element.
      text: JSON.stringify(landingJsonLd(route)).replace(/</g, "\\u003c"),
    });
  }
  return tags.map((t) => ({ ...t, attrs: { ...t.attrs, "data-seo": "1" } }));
}

/** Tags for private pages: a robots noindex only. */
export function privateHeadTags(): HeadTag[] {
  return [{ tag: "meta", attrs: { name: "robots", content: "noindex,nofollow", "data-seo": "1" } }];
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Serialise tags for the static HTML. */
export function renderHeadTags(tags: readonly HeadTag[]): string {
  return tags
    .map((t) => {
      const attrs = Object.entries(t.attrs)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(" ");
      if (t.tag === "script") return `<script ${attrs}>${t.text ?? ""}</script>`;
      return `<${t.tag} ${attrs} />`;
    })
    .join("\n    ");
}

export const renderTitle = (title: string): string => `<title>${escapeText(title)}</title>`;

/** sitemap.xml listing exactly the public routes, with hreflang alternates. */
export function sitemapXml(lastmod: string): string {
  const urls = PUBLIC_ROUTES.map((r) => {
    const alternates = (["en", "ru"] as const)
      .map((lang) => {
        const alt = routeFor(r.kind, lang);
        return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${absoluteUrl(alt.path)}" />`;
      })
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(routeFor(r.kind, "en").path)}" />`)
      .join("\n");
    return `  <url>\n    <loc>${absoluteUrl(r.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alternates}\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}
