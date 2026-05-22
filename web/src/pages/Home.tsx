import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { Sun, Heart, Compass, Zap, Clock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useDeviceId } from "@/hooks/useDeviceId";
import { listProfiles, deleteProfile } from "@/api/profiles";
import { Button } from "@/components/ui/button";
import { Astrolabe } from "@/components/Astrolabe";
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

function StarField() {
  const stars = useMemo(() =>
    Array.from({ length: 100 }, (_, i) => ({
      id: i,
      left: `${(i * 17.3 + 7.1) % 100}%`,
      top: `${(i * 23.7 + 13.3) % 100}%`,
      size: Math.random() > 0.8 ? 2 : 1,
      delay: `${(i * 0.7) % 5}s`,
      duration: `${3 + (i % 4)}s`,
      opacity: Math.random() * 0.5 + 0.3,
    })),
  []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-primary"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
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
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-4 py-24 text-center overflow-hidden">
      <StarField />
      
      {/* Massive rotating astrolabe in the background */}
      <Astrolabe className="absolute top-1/2 left-1/2 h-[120vw] w-[120vw] max-w-[1200px] max-h-[1200px] -translate-x-1/2 -translate-y-1/2 opacity-20 pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 max-w-3xl space-y-6 art-deco-card p-12 mt-12 mx-auto"
      >
        <h1
          className="text-gold-gradient text-4xl font-serif font-bold tracking-tight sm:text-5xl md:text-6xl"
          style={{ animation: "glow-text 4s ease-in-out infinite" }}
        >
          {t("landing.hero.title")}
        </h1>
        <div className="h-px w-3/4 mx-auto bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl font-serif">
          {t("landing.hero.subtitle")}
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-6">
          <Button size="lg" className="bg-primary/20 border border-primary text-primary hover:bg-primary/30" asChild>
            <Link to="/profile/new">{t("landing.hero.cta")}</Link>
          </Button>
          <Button size="lg" variant="outline" className="border-primary/50 text-primary-foreground hover:bg-primary/10 hover:text-primary" asChild>
            <a href="#questions">{t("landing.hero.ctaSecondary")}</a>
          </Button>
        </div>
      </motion.div>
    </section>
  );
}

function QuestionsSection() {
  const { t } = useTranslation();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 50 } }
  };

  return (
    <section id="questions" className="px-4 py-20 relative z-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-center mb-12 gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-primary/50" />
          <h2 className="text-center text-3xl font-serif font-bold tracking-tight sm:text-4xl text-gold-gradient px-4">
            {t("landing.questions.title")}
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/50" />
        </div>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {QUESTION_KEYS.map((key) => {
            const iconKey = t(`landing.questions.${key}.icon`) as keyof typeof QUESTION_ICONS;
            const Icon = QUESTION_ICONS[iconKey] ?? Sparkles;
            return (
              <motion.div key={key} variants={itemVariants} className="art-deco-card p-8 flex flex-col items-center text-center group">
                <div className="mb-6 p-4 rounded-full border border-primary/30 group-hover:border-primary/80 transition-colors shadow-[0_0_15px_rgba(212,175,55,0.1)] group-hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-serif font-semibold text-primary">
                  {t(`landing.questions.${key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.questions.${key}.description`)}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
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
        <h2 className="mb-12 text-center text-3xl font-serif font-bold tracking-tight sm:text-4xl text-gold-gradient">
          {t("landing.features.title")}
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {featureKeys.map((key) => (
            <div key={key} className="text-center">
              <h3 className="mb-2 text-lg font-serif font-semibold text-gold-gradient">
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
    <section className="px-4 py-20 relative z-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 flex flex-col sm:flex-row items-center justify-between gap-4 art-deco-card p-6">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-serif font-bold tracking-tight text-gold-gradient">{t("landing.profiles.title")}</h2>
            <p className="mt-2 text-muted-foreground font-serif">{t("landing.profiles.subtitle")}</p>
          </div>
          <Button className="bg-primary/20 border border-primary text-primary hover:bg-primary/30" asChild>
            <Link to="/profile/new">{t("home.createProfile")}</Link>
          </Button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {profiles.map((profile) => (
            <motion.div
              key={profile.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Card className="art-deco-card h-full flex flex-col bg-transparent">
                <CardHeader className="border-b border-primary/20 pb-4">
                  <CardTitle className="font-serif text-2xl text-center text-primary">{profile.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground flex-grow text-center font-serif">
                  <p className="flex justify-between border-b border-primary/10 pb-1">
                    <span className="text-primary/70">{t("profile.birthDate")}</span> 
                    <span className="text-foreground">{profile.birthDate}</span>
                  </p>
                  <p className="flex justify-between border-b border-primary/10 pb-1">
                    <span className="text-primary/70">{t("profile.birthTime")}</span> 
                    <span className="text-foreground">{formatBirthTime(profile)}</span>
                  </p>
                  <p className="flex justify-between pb-1">
                    <span className="text-primary/70">{t("profile.birthPlace")}</span> 
                    <span className="text-foreground">{profile.birthPlace}</span>
                  </p>
                </CardContent>
                <CardFooter className="gap-3 pt-4 border-t border-primary/20 flex-wrap justify-center">
                  <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10" asChild>
                    <Link to={`/profile/${profile.id}`}>{t("profile.detail.title")}</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10" asChild>
                    <Link to={`/profile/${profile.id}/edit`}>{t("profile.edit.title")}</Link>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-red-900/40 text-red-200 border border-red-800 hover:bg-red-900/60"
                    onClick={() => onDelete(profile.id)}
                  >
                    {t("common.delete")}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
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
