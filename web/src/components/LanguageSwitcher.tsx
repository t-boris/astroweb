import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { APP_LANGUAGES, toAppLanguage, type AppLanguage } from "@/lib/language";

const LABELS: Record<AppLanguage, string> = { en: "EN", ru: "RU" };

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = toAppLanguage(i18n.language);

  return (
    <div className="flex gap-1">
      {APP_LANGUAGES.map((lng) => (
        <Button
          key={lng}
          variant={current === lng ? "outline" : "ghost"}
          size="xs"
          onClick={() => i18n.changeLanguage(lng)}
        >
          {LABELS[lng]}
        </Button>
      ))}
    </div>
  );
}
