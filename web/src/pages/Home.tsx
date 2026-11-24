import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { Sun, Heart, Compass, Zap, Clock, Sparkles, ImageUp } from "lucide-react";
import { motion } from "framer-motion";
import { useDeviceId } from "@/hooks/useDeviceId";
import { listProfiles, archiveProfile } from "@/api/profiles";
import { Button } from "@/components/ui/button";
import { Mandala } from "@/components/Cosmos";
import { HelpBubble } from "@/components/HelpBubble";
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
import ProfilesMenu from "@/components/ProfilesMenu";

const QUESTION_ICONS = { Sun, Heart, Compass, Zap, Clock, Sparkles } as const;
const QUESTION_KEYS = ["personality", "relationships", "career", "challenges", "timing", "purpose"] as const;

/**
 * Only the cards whose sentence leans on a term a newcomer cannot guess get a bubble, and it sits on the
 * whole description (R5): the Big Three, the Midheaven, transits and the North Node.
 */
function QuestionDescription({ id, children }: { id: (typeof QUESTION_KEYS)[number]; children: ReactElement }) {
  if (id === "personality") return <HelpBubble helpKey="terms.bigThree">{children}</HelpBubble>;
  if (id === "career") return <HelpBubble helpKey="terms.midheaven">{children}</HelpBubble>;
  if (id === "timing") return <HelpBubble helpKey="home.transits">{children}</HelpBubble>;
  if (id === "purpose") return <HelpBubble helpKey="home.northNode">{children}</HelpBubble>;
  return children;
}

function HeroSection() {
  const { t } = useTranslation();

  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 py-24 text-center">
      {/* Rotating zodiac mandala behind the hero */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] max-w-[140vw] max-h-[140vw] -translate-x-1/2 -translate-y-1/2 opacity-85">
        <Mandala stroke="#6f9af0" glyphColor="#a9c6ff" baseOpacity={0.28} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 mx-auto max-w-3xl"
      >
        <div className="mb-4 text-xs uppercase tracking-[0.28em] text-[#8fb6ff]">
          ✦{" "}
          <HelpBubble helpKey="home.eyebrow">
            <span>{t("landing.hero.eyebrow", "Natal Astrology · Swiss Ephemeris")}</span>
          </HelpBubble>
        </div>
        <h1 className="font-serif text-5xl leading-[1.03] sm:text-6xl md:text-7xl">
          <span className="text-foreground">{t("landing.hero.titleLead")}</span>
          <br />
          <span className="text-gold-gradient italic">{t("landing.hero.titleAccent")}</span>
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
          {t("landing.hero.subtitle")}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button
            size="lg"
            className="rounded-full bg-primary px-8 font-semibold text-primary-foreground hover:bg-[#8fb6ff]"
            asChild
          >
            <Link to="/profile/new">{t("landing.hero.cta")}</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-primary/60 px-7 text-foreground hover:border-primary hover:text-[#8fb6ff]"
            asChild
          >
            <Link to="/explain-chart">
              <ImageUp className="mr-1.5 h-4 w-4" />
              {t("explainChart.title")}
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-border px-7 text-foreground hover:border-primary hover:text-[#8fb6ff]"
            asChild
          >
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
              <motion.div key={key} variants={itemVariants} className="ds-card p-8 flex flex-col items-center text-center group">
                <div className="mb-6 p-4 rounded-full border border-primary/30 group-hover:border-primary/80 transition-colors shadow-[0_0_15px_rgba(212,175,55,0.1)] group-hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-serif font-semibold text-primary">
                  {t(`landing.questions.${key}.title`)}
                </h3>
                <QuestionDescription id={key}>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`landing.questions.${key}.description`)}
                  </p>
                </QuestionDescription>
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
              {key === "precision" ? (
                <HelpBubble helpKey="home.swissEphemeris">
                  <h3 className="mb-2 text-lg font-serif font-semibold text-gold-gradient">
                    {t(`landing.features.${key}.title`)}
                  </h3>
                </HelpBubble>
              ) : (
                <h3 className="mb-2 text-lg font-serif font-semibold text-gold-gradient">
                  {t(`landing.features.${key}.title`)}
                </h3>
              )}
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
      await archiveProfile(deletingId, deviceId, true);
      setProfiles((prev) => prev.map((p) => (p.id === deletingId ? { ...p, archived: true } : p)));
    } catch (err) {
      setError(getErrorMessage(err, "errors.profileDeleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUnarchive(id: string) {
    try {
      await archiveProfile(id, deviceId, false);
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, archived: false } : p)));
    } catch (err) {
      setError(getErrorMessage(err, "errors.profileDeleteFailed"));
    }
  }

  return (
    <>
      {!loading && !error && profiles.length > 0 && (
        <ProfilesMenu profiles={profiles} deviceId={deviceId} onDelete={setDeletingId} onUnarchive={handleUnarchive} />
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

      <HeroSection />
      <QuestionsSection />
      <FeaturesSection />

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("home.archiveConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("home.archiveConfirmMessage", {
                name: profileToDelete?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("home.deleteConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("home.archiveConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
