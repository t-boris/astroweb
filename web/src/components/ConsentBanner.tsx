import { useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { closeConsentChoice, getConsentSnapshot, setConsent, subscribeConsent } from "@/lib/consent";
import { toAppLanguage } from "@/lib/language";
import { privacyPath } from "@/seo/routes";

/** EN/RU analytics consent banner (REQ-001). Shown until a choice exists, or when reopened. */
export default function ConsentBanner() {
  const { t, i18n } = useTranslation();
  const { bannerOpen, consent } = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getConsentSnapshot);
  if (!bannerOpen) return null;
  const to = privacyPath(toAppLanguage(i18n.language));

  return (
    <div
      role="dialog"
      aria-label={t("consent.title")}
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-[#0b1020] p-4 shadow-2xl sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-1 font-serif text-base text-foreground">{t("consent.title")}</p>
          <p>
            <Trans
              i18nKey="consent.body"
              components={{ privacy: <Link to={to} className="text-primary underline underline-offset-2" /> }}
            />
          </p>
        </div>
        <div className="flex flex-none gap-2">
          <Button variant="outline" size="sm" onClick={() => setConsent("denied")} data-testid="consent-decline">
            {t("consent.decline")}
          </Button>
          <Button size="sm" onClick={() => setConsent("granted")} data-testid="consent-accept">
            {t("consent.accept")}
          </Button>
          {consent !== "unknown" && (
            <Button variant="ghost" size="sm" onClick={closeConsentChoice} aria-label="Close">
              ×
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
