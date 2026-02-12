import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

export default function ProfileCreate() {
  const { id } = useParams();
  const { t } = useTranslation();
  const isEdit = Boolean(id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {isEdit ? t("profile.edit.title") : t("profile.create.title")}
      </h1>
      <p className="text-muted-foreground">
        Profile form coming in Phase 4.
      </p>
      <Link to="/" className="text-primary hover:underline">
        {t("profile.create.back")}
      </Link>
    </div>
  );
}
