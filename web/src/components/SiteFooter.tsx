import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { openConsentChoice } from "@/lib/consent";
import { toAppLanguage } from "@/lib/language";
import { privacyPath } from "@/seo/routes";

/** Public footer: operator, privacy page in the current language, cookie settings (REQ-004). */
export default function SiteFooter() {
  const { t, i18n } = useTranslation();
  const to = privacyPath(toAppLanguage(i18n.language));
  return (
    <footer className="relative z-10 border-t border-border/40 px-4 py-6 text-xs text-muted-foreground" data-testid="site-footer">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span>{t("footer.operator", { year: new Date().getFullYear() })}</span>
        <nav className="flex items-center gap-4">
          <Link to={to} className="hover:text-foreground" data-testid="footer-privacy">
            {t("footer.privacy")}
          </Link>
          <button type="button" onClick={openConsentChoice} className="hover:text-foreground" data-testid="footer-cookie-settings">
            {t("consent.settings")}
          </button>
        </nav>
      </div>
    </footer>
  );
}
