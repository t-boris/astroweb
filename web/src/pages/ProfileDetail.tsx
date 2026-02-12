import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { useDeviceId } from "@/hooks/useDeviceId";
import { getProfile, deleteProfile } from "@/api/profiles";
import { getChart } from "@/api/charts";
import NatalChart from "@/components/chart/NatalChart";
import { PlanetsTable } from "@/components/chart/PlanetsTable";
import { AspectsTable } from "@/components/chart/AspectsTable";
import { InterpretationView } from "@/components/chart/InterpretationView";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
import type { Profile, ChartResult } from "@/types";

export default function ProfileDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deviceId = useDeviceId();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartResult | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartRetryCount, setChartRetryCount] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function getErrorMessage(err: unknown, fallbackKey: string): string {
    if (err instanceof FirebaseError) {
      if (err.message.includes("not-found")) return t("errors.profileNotFound");
      if (err.message.includes("permission-denied")) return t("errors.permissionDenied");
      if (err.message.includes("invalid-argument")) return t("errors.profileSaveFailed");
    }
    return t(fallbackKey);
  }

  // Fetch profile
  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      if (!id) {
        setError(t("errors.profileNotFound"));
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
            setError(t("errors.profileNotFound"));
          } else {
            setError(getErrorMessage(err, "errors.unknownError"));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deviceId]);

  // Fetch chart (after profile loads, or on chart retry)
  useEffect(() => {
    if (!profile || !id) return;
    let cancelled = false;

    async function fetchChart() {
      setChartLoading(true);
      setChartError(null);
      try {
        const { chart } = await getChart(id!, deviceId);
        if (!cancelled) setChartData(chart);
      } catch {
        if (!cancelled) setChartError(t("errors.chartLoadFailed"));
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    fetchChart();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, id, deviceId, chartRetryCount]);

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);

    try {
      await deleteProfile(id, deviceId);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "errors.profileDeleteFailed"));
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

  // Error state (covers not-found and generic errors)
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("profile.detail.title")}
        </h1>
        <p className="text-destructive">{error}</p>
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
      <div className="flex flex-wrap gap-2">
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

      {/* Chart / Data Tabs */}
      {chartLoading && (
        <p className="text-muted-foreground text-center">
          {t("profile.detail.chartLoading")}
        </p>
      )}
      {chartError && (
        <div className="text-center space-y-2">
          <p className="text-destructive">{chartError}</p>
          <Button variant="outline" size="sm" onClick={() => { setChartError(null); setChartLoading(true); setChartRetryCount(c => c + 1); }}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {chartData && (
        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="flex w-full overflow-x-auto scrollbar-hidden">
            <TabsTrigger value="chart" className="flex-1 min-w-fit">{t("tabs.chart")}</TabsTrigger>
            <TabsTrigger value="planets" className="flex-1 min-w-fit">{t("tabs.planets")}</TabsTrigger>
            <TabsTrigger value="aspects" className="flex-1 min-w-fit">{t("tabs.aspects")}</TabsTrigger>
            <TabsTrigger value="interpretation" className="flex-1 min-w-fit">{t("tabs.interpretation")}</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <NatalChart chart={chartData} />
          </TabsContent>

          <TabsContent value="planets">
            <Card>
              <CardContent className="pt-6">
                <PlanetsTable points={chartData.points} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="aspects">
            <Card>
              <CardContent className="pt-6">
                <AspectsTable aspects={chartData.aspects} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interpretation">
            <Card>
              <CardContent className="pt-6">
                <InterpretationView chart={chartData} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

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
