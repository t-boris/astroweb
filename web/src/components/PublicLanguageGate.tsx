import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { toAppLanguage } from "@/lib/language";
import { routeFor, type Lang, type PageKind } from "@/seo/routes";

/**
 * Public routes: the URL sets the UI language (DEC-003) when the visitor
 * arrives. A visitor whose stored preference is Russian who opens the English
 * URL is sent to the Russian counterpart, so returning Russian users are never
 * forced into English. The language switcher changes the language first and then
 * navigates, so an explicit choice is never overridden (the effect below runs
 * on arrival only, not on later language changes).
 */
export default function PublicLanguageGate({ lang, kind, children }: { lang: Lang; kind: PageKind; children: ReactNode }) {
  const { i18n } = useTranslation();
  const { key } = useLocation();

  useEffect(() => {
    if (lang === "ru" && toAppLanguage(i18n.language) !== "ru") void i18n.changeLanguage("ru");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, key]);

  if (lang === "en" && toAppLanguage(i18n.language) === "ru") return <Navigate to={routeFor(kind, "ru").path} replace />;
  return <>{children}</>;
}
