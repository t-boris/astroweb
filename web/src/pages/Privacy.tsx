import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { openConsentChoice } from "@/lib/consent";

const EVENT_KEYS = [
  "pageView",
  "profileCreateStart",
  "profileCreated",
  "chartViewed",
  "paywallViewed",
  "beginCheckout",
  "unlockFeature",
  "subscribeStart",
  "aiReading",
  "letterOpened",
] as const;

const mailLink = <a href="mailto:astroweb@mobilemindai.com" className="text-primary underline underline-offset-2" />;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-serif text-xl text-primary">{title}</h2>
      {children}
    </section>
  );
}

/** Public bilingual privacy page (REQ-004). The text lives in the locale files. */
export default function Privacy() {
  const { t } = useTranslation();
  const p = "text-sm leading-relaxed text-muted-foreground";
  const ul = "list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground";

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:py-14" data-testid="privacy-page">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl sm:text-4xl">{t("privacy.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("privacy.updated")}</p>
        <p className={p}>{t("privacy.intro")}</p>
      </header>

      <Section title={t("privacy.operator.title")}>
        <p className={p}>
          <Trans i18nKey="privacy.operator.body" components={{ mail: mailLink }} />
        </p>
      </Section>

      <Section title={t("privacy.consent.title")}>
        <p className={p}>{t("privacy.consent.body1")}</p>
        <p className={p}>{t("privacy.consent.body2")}</p>
        <h3 className="pt-1 text-sm font-medium text-foreground">{t("privacy.consent.cookiesTitle")}</h3>
        <ul className={ul}>
          <li>{t("privacy.consent.cookie1")}</li>
          <li>{t("privacy.consent.cookie2")}</li>
        </ul>
        <h3 className="pt-1 text-sm font-medium text-foreground">{t("privacy.consent.storageTitle")}</h3>
        <ul className={ul}>
          <li>{t("privacy.consent.storage1")}</li>
          <li>{t("privacy.consent.storage2")}</li>
          <li>{t("privacy.consent.storage3")}</li>
          <li>{t("privacy.consent.storage4")}</li>
        </ul>
      </Section>

      <Section title={t("privacy.events.title")}>
        <p className={p}>{t("privacy.events.intro")}</p>
        <ul className={ul}>
          {EVENT_KEYS.map((k) => (
            <li key={k}>{t(`privacy.events.${k}`)}</li>
          ))}
        </ul>
        <p className={p}>{t("privacy.events.userId")}</p>
      </Section>

      <Section title={t("privacy.server.title")}>
        <p className={p}>{t("privacy.server.body1")}</p>
        <p className={p}>{t("privacy.server.body2")}</p>
        <p className={p}>{t("privacy.server.withConsent")}</p>
        <p className={p}>{t("privacy.server.withoutConsent")}</p>
      </Section>

      <Section title={t("privacy.subscriptions.title")}>
        <p className={p}>
          <Trans i18nKey="privacy.subscriptions.body" components={{ mail: mailLink }} />
        </p>
      </Section>

      <Section title={t("privacy.never.title")}>
        <p className={p}>{t("privacy.never.body")}</p>
      </Section>

      <Section title={t("privacy.change.title")}>
        <p className={p}>{t("privacy.change.body")}</p>
        <Button variant="outline" onClick={openConsentChoice} data-testid="privacy-change-consent">
          {t("privacy.change.button")}
        </Button>
      </Section>
    </article>
  );
}
