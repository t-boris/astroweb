import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("home.title")}</h1>
      <p className="text-muted-foreground">{t("home.noProfiles")}</p>
      <Button asChild>
        <Link to="/profile/new">{t("home.createProfile")}</Link>
      </Button>
    </div>
  );
}
