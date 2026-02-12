import { useParams } from "react-router";
import { useTranslation } from "react-i18next";

export default function ProfileDetail() {
  const { id } = useParams();
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {t("profile.detail.title")}
      </h1>
      <p className="text-muted-foreground">
        Profile ID: {id}
      </p>
      <p className="text-muted-foreground">
        {t("profile.detail.placeholder")}
      </p>
    </div>
  );
}
