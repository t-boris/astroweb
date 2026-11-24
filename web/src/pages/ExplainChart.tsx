import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDeviceId } from "@/hooks/useDeviceId";
import { listProfiles } from "@/api/profiles";
import { getWallet } from "@/api/wallet";
import { describeChartReading, readChartImage } from "@/api/chartReading";
import { ensureSignedIn } from "@/lib/contentSync";
import { preparePicture, type PreparedPicture } from "@/lib/chartPicture";
import { profilePrefill, readFailureOf, type ReadFailure } from "@/lib/explainChart";
import { reverseGeocode } from "@/lib/places";
import { toAppLanguage, type AppLanguage } from "@/lib/language";
import { trackEvent } from "@/lib/analytics";
import { cleanAiArtifacts } from "@/lib/localContent";
import { TOKEN_COST } from "@/lib/tokens";
import NatalChart from "@/components/chart/NatalChart";
import { Astrolabe } from "@/components/Astrolabe";
import { HelpBubble } from "@/components/HelpBubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FailureNote,
  PicturePicker,
  ReadAction,
  ReadPointsTable,
  RecoveredBirthCard,
  SaveAsProfile,
  StorySection,
} from "@/components/explain/ExplainChartParts";
import type { ChartReadingResult } from "@/types";

type Phase = "choose" | "reading" | "done";

/**
 * Explain my natal chart (MarkView feature explain-my-natal-chart): the user uploads a picture of a natal chart,
 * the server recovers the birth from the positions on it, the page shows when and where the person was born,
 * a short story about who they are, the chart, and offers to keep the person as a profile.
 */
export default function ExplainChart() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const language = toAppLanguage(i18n.resolvedLanguage);

  const [picture, setPicture] = useState<PreparedPicture | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [phase, setPhase] = useState<Phase>("choose");
  const [failure, setFailure] = useState<ReadFailure | null>(null);
  const [result, setResult] = useState<ChartReadingResult | null>(null);
  /** undefined while the name of the recovered place is looked up; null when there is none. */
  const [placeName, setPlaceName] = useState<string | null | undefined>(undefined);
  const [stories, setStories] = useState<Partial<Record<AppLanguage, string>>>({});
  const [storyStates, setStoryStates] = useState<Partial<Record<AppLanguage, "loading" | "failed">>>({});

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [stars, setStars] = useState<number | null>(null);
  const [firstProfileId, setFirstProfileId] = useState<string | null>(null);
  const [balanceTick, setBalanceTick] = useState(0);
  /** The reading the page shows now: answers that arrive for an earlier one are dropped. */
  const shownReading = useRef<string | null>(null);
  /** Stories asked for ("readingId:language"), so a re-run of the effect never asks twice. */
  const storyRequests = useRef(new Set<string>());

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    const onChanged = () => setBalanceTick((n) => n + 1);
    window.addEventListener("astroweb:stars-changed", onChanged);
    return () => window.removeEventListener("astroweb:stars-changed", onChanged);
  }, []);

  useEffect(() => {
    if (!user) {
      setStars(null);
      return;
    }
    let cancelled = false;
    getWallet(deviceId)
      .then((tokens) => !cancelled && setStars(tokens))
      .catch(() => {});
    listProfiles(deviceId)
      .then((profiles) => !cancelled && setFirstProfileId(profiles.find((p) => !p.archived)?.id ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deviceId, user, balanceTick]);

  function clearResult() {
    shownReading.current = null;
    storyRequests.current = new Set();
    setResult(null);
    setPlaceName(undefined);
    setStories({});
    setStoryStates({});
    setPhase("choose");
  }

  async function handleFile(file: File) {
    clearResult();
    setFailure(null);
    setPreparing(true);
    try {
      setPicture(await preparePicture(file));
    } catch (error) {
      setPicture(null);
      setFailure(readFailureOf(error));
    } finally {
      setPreparing(false);
    }
  }

  // A picture can be pasted anywhere on the page (a screenshot copied from another site or app).
  const pasteTarget = useRef(handleFile);
  useEffect(() => {
    pasteTarget.current = handleFile;
  });
  const readingNow = phase === "reading";
  useEffect(() => {
    if (readingNow) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void pasteTarget.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readingNow]);

  async function handleRead() {
    if (!picture || phase === "reading") return;
    // First, before any other await, so the browser lets the sign-in popup open.
    if (!(await ensureSignedIn(deviceId))) return;
    setFailure(null);
    setPhase("reading");
    trackEvent("ai_reading_requested", { kind: "chart_image" });
    try {
      const out = await readChartImage(picture.dataUrl);
      shownReading.current = out.readingId;
      storyRequests.current = new Set();
      setPlaceName(undefined);
      setStories({});
      setStoryStates({});
      setResult(out);
      setPhase("done");
    } catch (error) {
      setFailure(readFailureOf(error));
      setPhase("choose");
    } finally {
      window.dispatchEvent(new Event("astroweb:stars-changed"));
    }
  }

  // The name of the recovered place, for the card and the story.
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    void reverseGeocode(result.birth.lat, result.birth.lng).then((name) => {
      if (!cancelled) setPlaceName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  // The story, once per language: it is asked for when the place name is known, and again when the language changes.
  useEffect(() => {
    if (!result || placeName === undefined || stories[language] || storyStates[language] === "failed") return;
    const readingId = result.readingId;
    const key = `${readingId}:${language}`;
    if (storyRequests.current.has(key)) return;
    storyRequests.current.add(key);
    setStoryStates((s) => ({ ...s, [language]: "loading" }));
    describeChartReading(readingId, language, placeName)
      .then((answer) => {
        if (shownReading.current !== readingId) return;
        setStories((s) => ({ ...s, [language]: cleanAiArtifacts(answer.text) }));
        setStoryStates((s) => ({ ...s, [language]: undefined }));
      })
      .catch(() => {
        storyRequests.current.delete(key);
        if (shownReading.current !== readingId) return;
        setStoryStates((s) => ({ ...s, [language]: "failed" }));
      });
  }, [result, placeName, language, stories, storyStates]);

  function saveAsProfile() {
    if (!result) return;
    navigate("/profile/new", { state: { prefill: profilePrefill(result.birth, placeName ?? null) } });
  }

  function readAnother() {
    clearResult();
    setPicture(null);
    setFailure(null);
  }

  const story = stories[language] ?? null;
  const storyState = story ? "done" : storyStates[language] === "failed" ? "failed" : "loading";

  return (
    <div className="relative z-10 mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <div className="mb-2 text-xs uppercase tracking-[0.28em] text-[#8fb6ff]">✦ {t("explainChart.title")}</div>
        <h1 className="mb-3 font-serif text-4xl text-foreground">{t("explainChart.title")}</h1>
        <p className="text-muted-foreground">{t("explainChart.intro")}</p>
      </motion.div>

      {phase !== "done" && (
        <Card className="ds-card">
          <CardContent className="space-y-5 pt-6">
            <HelpBubble helpKey="explainChart.picture" side="top">
              <p className="text-sm text-foreground">{t("explainChart.needs")}</p>
            </HelpBubble>
            <PicturePicker picture={picture} preparing={preparing} disabled={phase === "reading"} onFile={(file) => void handleFile(file)} />
            {failure && <FailureNote failure={failure} />}
            {phase === "reading" ? (
              <div className="flex flex-col items-center gap-3 py-4" data-reading>
                <Astrolabe className="h-28 w-28" />
                <p className="text-sm text-muted-foreground">{t("explainChart.read.reading")}</p>
              </div>
            ) : (
              picture && (
                <ReadAction
                  signedIn={Boolean(user)}
                  stars={stars}
                  firstProfileId={firstProfileId}
                  busy={false}
                  disabled={preparing}
                  onRead={() => void handleRead()}
                />
              )
            )}
            <p className="text-xs text-muted-foreground">{t("explainChart.read.price", { count: TOKEN_COST.chartReading })}</p>
            <p className="text-xs text-muted-foreground">{t("explainChart.privacy")}</p>
          </CardContent>
        </Card>
      )}

      {phase === "done" && result && (
        <>
          <RecoveredBirthCard birth={result.birth} placeName={placeName} language={language} charged={result.charged} />
          <StorySection
            text={story}
            state={storyState}
            onRetry={() => setStoryStates((s) => ({ ...s, [language]: undefined }))}
          />
          <NatalChart chart={result.chart} />
          <ReadPointsTable reading={result.reading} />
          <SaveAsProfile onSave={saveAsProfile} />
          <Button type="button" variant="outline" onClick={readAnother}>
            {t("explainChart.again")}
          </Button>
        </>
      )}
    </div>
  );
}
