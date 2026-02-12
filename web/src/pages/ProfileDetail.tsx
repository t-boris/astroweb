import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { useDeviceId } from "@/hooks/useDeviceId";
import { getProfile, deleteProfile } from "@/api/profiles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Profile } from "@/types";

export default function ProfileDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deviceId = useDeviceId();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      if (!id) {
        setError("notFound");
        setLoading(false);
        return;
      }

      try {
        const data = await getProfile(id, deviceId);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (
            err instanceof FirebaseError &&
            err.message.includes("not-found")
          ) {
            setError("notFound");
          } else {
            setError("generic");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [id, deviceId]);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);

    try {
      await deleteProfile(id, deviceId);
      navigate("/");
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(err.message);
      } else {
        setError("generic");
      }
      setShowDeleteDialog(false);
      setDeleting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("profile.detail.title")}
        </h1>
        <p className="text-muted-foreground">{t("profile.detail.loading")}</p>
      </div>
    );
  }

  // Not found state
  if (error === "notFound") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("profile.detail.title")}
        </h1>
        <p className="text-destructive">{t("profile.detail.notFound")}</p>
        <Button variant="outline" asChild>
          <Link to="/">{t("profile.detail.back")}</Link>
        </Button>
      </div>
    );
  }

  // Generic error state
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("profile.detail.title")}
        </h1>
        <p className="text-destructive">{t("common.error")}</p>
        <Button variant="outline" asChild>
          <Link to="/">{t("profile.detail.back")}</Link>
        </Button>
      </div>
    );
  }

  // No profile loaded (shouldn't happen after loading, but safe guard)
  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{profile.name}</h1>
      </div>

      {/* Birth Data Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.detail.birthData")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-muted-foreground">
              {t("profile.detail.birthDate")}
            </dt>
            <dd>{profile.birthDate}</dd>

            <dt className="font-medium text-muted-foreground">
              {t("profile.detail.birthTime")}
            </dt>
            <dd>
              {profile.timeUnknown ? (
                <span className="italic text-muted-foreground">
                  {t("profile.detail.timeUnknown")}
                </span>
              ) : (
                profile.birthTime
              )}
            </dd>

            <dt className="font-medium text-muted-foreground">
              {t("profile.detail.birthPlace")}
            </dt>
            <dd>{profile.birthPlace}</dd>

            <dt className="font-medium text-muted-foreground">
              {t("profile.detail.timezone")}
            </dt>
            <dd>{profile.timezone}</dd>

            <dt className="font-medium text-muted-foreground">
              {t("profile.detail.coordinates")}
            </dt>
            <dd>
              {profile.lat.toFixed(4)}, {profile.lng.toFixed(4)}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button asChild>
          <Link to={`/profile/${id}/edit`}>{t("profile.detail.edit")}</Link>
        </Button>
        <Button
          variant="destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          {t("profile.detail.delete")}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">{t("profile.detail.back")}</Link>
        </Button>
      </div>

      {/* Phase 5: Chart wheel, planets table, aspects table, interpretations */}
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-center">
            {t("profile.detail.chartPlaceholder")}
          </p>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setShowDeleteDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("profile.detail.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.detail.deleteConfirmMessage", {
                name: profile.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("profile.detail.deleteConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {t("profile.detail.deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
