import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { Sun, Heart, Compass, Zap, Clock, Sparkles } from "lucide-react";
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

const QUESTION_ICONS = { Sun, Heart, Compass, Zap, Clock, Sparkles } as const;
const QUESTION_KEYS = ["personality", "relationships", "career", "challenges", "timing", "purpose"] as const;
const ZODIAC_GLYPHS = ["\u2648","\u2649","\u264A","\u264B","\u264C","\u264D","\u264E","\u264F","\u2650","\u2651","\u2652","\u2653"];

function StarField() {
  const stars = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: `${(i * 17.3 + 7.1) % 100}%`,
      top: `${(i * 23.7 + 13.3) % 100}%`,
      size: 1 + (i % 3),
      delay: `${(i * 0.7) % 5}s`,
      duration: `${3 + (i % 4)}s`,
    })),
  []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animation: `twinkle ${star.duration} ease-in-out ${star.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

function HeroSection() {
  const { t } = useTranslation();

  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-4 py-24 text-center">
      <StarField />

      {/* Faint zodiac glyphs ring */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[min(500px,80vw)] w-[min(500px,80vw)]">
          {ZODIAC_GLYPHS.map((glyph, i) => {
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const radius = 45;
            return (
              <span
                key={i}
                className="absolute text-2xl text-purple-400/10 sm:text-3xl"
                style={{
                  left: `${50 + radius * Math.cos(angle)}%`,
                  top: `${50 + radius * Math.sin(angle)}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {glyph}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 max-w-3xl space-y-6">
        <h1
          className="text-gold-gradient text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl"
          style={{ animation: "glow-text 4s ease-in-out infinite" }}
        >
          {t("landing.hero.title")}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
          {t("landing.hero.subtitle")}
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Button size="lg" asChild>
            <Link to="/profile/new">{t("landing.hero.cta")}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#questions">{t("landing.hero.ctaSecondary")}</a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function QuestionsSection() {
  const { t } = useTranslation();

  return (
    <section id="questions" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t("landing.questions.title")}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {QUESTION_KEYS.map((key) => {
            const iconKey = t(`landing.questions.${key}.icon`) as keyof typeof QUESTION_ICONS;
            const Icon = QUESTION_ICONS[iconKey] ?? Sparkles;
            return (
              <div key={key} className="glass-card p-6 transition-colors hover:border-purple-400/25">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10">
                  <Icon className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  {t(`landing.questions.${key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.questions.${key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useTranslation();
  const featureKeys = ["precision", "chart", "interpretations"] as const;

  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t("landing.features.title")}
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {featureKeys.map((key) => (
            <div key={key} className="text-center">
              <h3 className="mb-2 text-lg font-semibold text-gold-gradient">
                {t(`landing.features.${key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(`landing.features.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface ProfilesSectionProps {
  profiles: Profile[];
  onDelete: (id: string) => void;
  formatBirthTime: (profile: Profile) => string;
}

function ProfilesSection({ profiles, onDelete, formatBirthTime }: ProfilesSectionProps) {
  const { t } = useTranslation();

  if (profiles.length === 0) return null;

  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{t("landing.profiles.title")}</h2>
            <p className="mt-1 text-muted-foreground">{t("landing.profiles.subtitle")}</p>
          </div>
          <Button asChild>
            <Link to="/profile/new">{t("home.createProfile")}</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {profiles.map((profile) => (
            <Card key={profile.id} className="glass-card">
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
                  onClick={() => onDelete(profile.id)}
                >
                  {t("common.delete")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

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

  return (
    <>
      <HeroSection />
      <QuestionsSection />
      <FeaturesSection />

      {loading && (
        <div className="px-4 py-12 text-center">
          <p className="text-muted-foreground">{t("home.loading")}</p>
        </div>
      )}

      {error && (
        <div className="px-4 py-12 text-center">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => { setError(null); setLoading(true); setRetryCount(c => c + 1); }}
          >
            {t("errors.retry")}
          </Button>
        </div>
      )}

      {!loading && !error && (
        <ProfilesSection
          profiles={profiles}
          onDelete={setDeletingId}
          formatBirthTime={formatBirthTime}
        />
      )}

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
    </>
  );
}
