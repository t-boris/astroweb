import type { Plugin } from "vite";
import {
  PUBLIC_ROUTES,
  headTagsFor,
  renderHeadTags,
  renderTitle,
  sitemapXml,
  type PublicRoute,
} from "./src/seo/routes";

/**
 * Build-time SEO shells (DEC-008, REQ-008): writes one static HTML file per
 * public route with that route's title, description, canonical, hreflang,
 * OG/Twitter tags (and JSON-LD on landing pages), plus sitemap.xml. The app body
 * is still rendered by the client; this is not SSR.
 *
 *   /            -> index.html        (also the SPA fallback for private routes)
 *   /ru          -> ru.html           (served at /ru via Hosting cleanUrls)
 *   /privacy     -> privacy.html
 *   /ru/privacy  -> ru/privacy.html
 */
export function withRouteHead(baseHtml: string, route: PublicRoute, gscToken?: string): string {
  const verification = gscToken
    ? `\n    <meta name="google-site-verification" content="${gscToken.replace(/"/g, "&quot;")}" />`
    : "";
  const head = `${renderTitle(route.title)}${verification}\n    ${renderHeadTags(headTagsFor(route))}`;
  if (!/<title>[^<]*<\/title>/.test(baseHtml)) throw new Error("index.html has no <title> to replace");
  return baseHtml
    .replace(/<title>[^<]*<\/title>/, head)
    .replace(/<html lang="[^"]*"/, `<html lang="${route.lang}"`);
}

export function seoShells(options: { gscToken?: string } = {}): Plugin {
  return {
    name: "astroweb-seo-shells",
    apply: "build",
    enforce: "post",
    generateBundle(_outputOptions, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") throw new Error("seo-shells: index.html asset not found in the bundle");
      const base = String(index.source);
      for (const route of PUBLIC_ROUTES) {
        const html = withRouteHead(base, route, options.gscToken);
        if (route.path === "/") {
          index.source = html;
        } else {
          this.emitFile({ type: "asset", fileName: `${route.path.slice(1)}.html`, source: html });
        }
      }
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: sitemapXml(new Date().toISOString().slice(0, 10)),
      });
    },
  };
}
