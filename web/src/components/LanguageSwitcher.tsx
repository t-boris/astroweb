import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { APP_LANGUAGES, toAppLanguage, type AppLanguage } from "@/lib/language";
import { publicRoute, routeFor } from "@/seo/routes";

const LABELS: Record<AppLanguage, string> = { en: "EN", ru: "RU" };

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = toAppLanguage(i18n.language);

  async function choose(lng: AppLanguage) {
    await i18n.changeLanguage(lng);
    // On public pages the language lives in the URL: go to the counterpart page.
    const here = publicRoute(pathname);
    if (here && here.lang !== lng) navigate(routeFor(here.kind, lng).path);
  }

  return (
    <div className="flex gap-1">
      {APP_LANGUAGES.map((lng) => (
        <Button
          key={lng}
          variant={current === lng ? "outline" : "ghost"}
          size="xs"
          onClick={() => void choose(lng)}
        >
          {LABELS[lng]}
        </Button>
      ))}
    </div>
  );
}
