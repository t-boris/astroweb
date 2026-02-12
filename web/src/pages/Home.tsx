import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { useDeviceId } from "@/hooks/useDeviceId";
import { listProfiles, deleteProfile } from "@/api/profiles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
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

export default function Home() {
  const { t } = useTranslation();
  const deviceId = useDeviceId();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  function getErrorMessage(err: unknown, fallbackKey: string): string {
    if (err instanceof FirebaseError) {
      if (err.message.includes("not-found")) return t("errors.profileNotFound");
      if (err.message.includes("permission-denied")) return t("errors.permissionDenied");
      if (err.message.includes("invalid-argument")) return t("errors.profileSaveFailed");
    }
    return t(fallbackKey);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchProfiles() {
      try {
        const data = await listProfiles(deviceId);
        if (!cancelled) {
          setProfiles(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "errors.profileListFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProfiles();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, retryCount]);

  const profileToDelete = profiles.find((p) => p.id === deletingId);

  async function handleDelete() {
    if (!deletingId) return;

    try {
      await deleteProfile(deletingId, deviceId);
      setProfiles((prev) => prev.filter((p) => p.id !== deletingId));
    } catch (err) {
      setError(getErrorMessage(err, "errors.profileDeleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  function formatBirthTime(profile: Profile): string {
    if (profile.timeUnknown) {
      return t("profile.timeUnknown");
    }
    return profile.birthTime ?? t("profile.timeUnknown");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("home.title")}</h1>
        <p className="text-muted-foreground">{t("home.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("home.title")}</h1>
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); setRetryCount(c => c + 1); }}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  }

  if (profiles.length === 0) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t("home.title")}</h1>
        <Button asChild>
          <Link to="/profile/new">{t("home.createProfile")}</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {profiles.map((profile) => (
          <Card key={profile.id}>
            <CardHeader>
              <CardTitle>{profile.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                {t("profile.birthDate")}: {profile.birthDate}
              </p>
              <p>
                {t("profile.birthTime")}: {formatBirthTime(profile)}
              </p>
              <p>
                {t("profile.birthPlace")}: {profile.birthPlace}
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/profile/${profile.id}`}>{t("profile.detail.title")}</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/profile/${profile.id}/edit`}>{t("profile.edit.title")}</Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeletingId(profile.id)}
              >
                {t("common.delete")}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("home.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("home.deleteConfirmMessage", {
                name: profileToDelete?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("home.deleteConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {t("home.deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
