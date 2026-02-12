import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex gap-1">
      <Button
        variant={i18n.language === "en" ? "outline" : "ghost"}
        size="xs"
        onClick={() => i18n.changeLanguage("en")}
      >
        EN
      </Button>
      <Button
        variant={i18n.language === "ru" ? "outline" : "ghost"}
        size="xs"
        onClick={() => i18n.changeLanguage("ru")}
      >
        RU
      </Button>
    </div>
  );
}
