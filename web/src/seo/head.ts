import { headTagsFor, isPrivatePath, privateHeadTags, publicRoute, type HeadTag, type Lang } from "@/seo/routes";

/** Replace the data-seo head tags and the document title (client-side SPA navigation). */
export function applyHead(title: string, tags: readonly HeadTag[], lang?: Lang): void {
  document.title = title;
  if (lang) document.documentElement.lang = lang;
  document.head.querySelectorAll("[data-seo]").forEach((el) => el.remove());
  for (const t of tags) {
    const el = document.createElement(t.tag);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    if (t.text) el.textContent = t.text;
    document.head.appendChild(el);
  }
}

/** Head for the current pathname: public pages get their own tags, everything else is noindex. */
export function syncHeadForPath(pathname: string, fallbackLang: Lang): void {
  const route = publicRoute(pathname);
  if (route) {
    applyHead(route.title, headTagsFor(route), route.lang);
    return;
  }
  // Private routes (and unknown ones) are never indexed.
  void isPrivatePath(pathname);
  applyHead("AstroWeb", privateHeadTags(), fallbackLang);
}
