import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateLocale, toAppLanguage } from "@/lib/language";
import { FirebaseError } from "firebase/app";
import { ChevronDown, ChevronUp, Download, Trash2 } from "lucide-react";
import {
  generateInterpretations,
  type InterpretationBlock,
} from "@/data/interpretations";
import {
  PLANET_GLYPHS,
  ASPECT_GLYPHS,
  ELEMENT_COLORS,
  ASPECT_COLORS,
  ZODIAC_GLYPHS,
  ZODIAC_SIGNS,
  SIGN_ELEMENTS,
} from "@/components/chart/utils/constants";
import { signLabel } from "@/lib/signs";
import { AiReading, renderInlineMarkdown } from "@/components/AiReading";
import { deepenInterpretation, askOracle } from "@/api/ai";
import {
  enqueuePremiumPdf,
  getPremiumPdfJob,
  type PdfReportSection,
} from "@/api/pdf";
import { Button } from "@/components/ui/button";
import { unlockFeature } from "@/api/unlock";
import { trackEvent, trackOnce } from "@/lib/analytics";
import { TOKEN_COST } from "@/lib/tokens";
import type { ChartResult } from "@/types";

interface InterpretationViewProps {
  chart: ChartResult;
  profileId: string;
  profileName: string;
  ownerDeviceId: string;
  tokens: number;
  interpretationsUnlocked?: boolean;
  onUnlocked?: () => void;
  onPurchasePremium?: () => void;
  /** "interpretation" = readings only, "oracle" = oracle chat only, "full" = both. */
  mode?: "full" | "oracle" | "interpretation";
  relocationLat?: number | null;
  relocationLng?: number | null;
}

interface OracleEntry {
  question: string;
  answer: string;
  model: string;
  askedAt: string;
}

interface InterpretationAiState {
  deepTexts: Record<string, string>;
  oracleHistory: OracleEntry[];
}

function cleanAiArtifacts(input: string): string {
  const filteredLines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !(
        normalized.startsWith("of fragment to start from") ||
        normalized.startsWith("*continuation:*") ||
        normalized.startsWith("last generated fragment:") ||
        normalized.startsWith("continue the same answer")
      );
    });

  return filteredLines
    .join("\n")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function getAiStorageKey(profileId: string): string {
  return `astroweb:ai:v4:${profileId}`;
}

function getOracleEntryKey(entry: OracleEntry): string {
  return `${entry.askedAt}-${entry.question}`;
}

function getSingleLinePreview(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")       // strip markdown headings
    .replace(/\*\*([^*]+)\*\*/g, "$1") // strip bold markers
    .replace(/[*_`>#]/g, "")           // stray markdown chars
    .replace(/\s+/g, " ")
    .trim();
}

function saveBase64Pdf(base64: string, fileName: string, contentType: string): void {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function readStoredAiState(profileId: string): InterpretationAiState {
  try {
    const raw = localStorage.getItem(getAiStorageKey(profileId));
    if (!raw) {
      return { deepTexts: {}, oracleHistory: [] };
    }

    const parsed = JSON.parse(raw) as Partial<InterpretationAiState>;
    return {
      deepTexts:
        parsed.deepTexts && typeof parsed.deepTexts === "object"
          ? Object.fromEntries(
              Object.entries(parsed.deepTexts).map(([key, value]) => [
                key,
                typeof value === "string" ? cleanAiArtifacts(value) : "",
              ]),
            )
          : {},
      oracleHistory: Array.isArray(parsed.oracleHistory)
        ? parsed.oracleHistory
            .filter(
              (item): item is OracleEntry =>
                typeof item?.question === "string" &&
                typeof item?.answer === "string" &&
                typeof item?.model === "string" &&
                typeof item?.askedAt === "string",
            )
            .map((item) => ({
              ...item,
              answer: cleanAiArtifacts(item.answer),
            }))
        : [],
    };
  } catch {
    return { deepTexts: {}, oracleHistory: [] };
  }
}

function writeStoredAiState(profileId: string, state: InterpretationAiState): void {
  try {
    localStorage.setItem(getAiStorageKey(profileId), JSON.stringify(state));
  } catch {
    // Ignore quota/storage errors.
  }
}

function getBlockColor(block: InterpretationBlock): string {
  if (block.category === "aspect") {
    return ASPECT_COLORS[block.tags[0]] ?? "#888";
  }
  // For sign categories, first tag is the element
  const element = block.tags[0] as keyof typeof ELEMENT_COLORS;
  return ELEMENT_COLORS[element]?.stroke ?? "#888";
}

function getBlockGlyph(block: InterpretationBlock): string {
  if (block.category === "aspect") {
    return ASPECT_GLYPHS[block.tags[0]] ?? "✦";
  }
  const kind = block.key.split(".")[1];
  if (kind === "sun") return PLANET_GLYPHS["Sun"] ?? "☉";
  if (kind === "moon") return PLANET_GLYPHS["Moon"] ?? "☽";
  if (kind === "ascendant") return "↑";
  if (kind === "midheaven") return "MC";
  return "✦";
}

function getBlockInstanceKey(block: InterpretationBlock): string {
  if (block.aspect) {
    return `${block.key}-${block.aspect.a}-${block.aspect.b}-${block.aspect.type}`;
  }
  return block.key;
}

type ElementKey = "fire" | "earth" | "air" | "water";

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function signElement(sign: string | null | undefined): ElementKey | null {
  if (!sign) return null;
  return SIGN_ELEMENTS[sign] ?? null;
}

function signFromLongitude(longitude: number): string {
  const normalized = ((longitude % 360) + 360) % 360;
  return ZODIAC_SIGNS[Math.floor(normalized / 30)];
}

/** Sun / Moon / Rising hero strip — a quick visual anchor for the chart. */
function BigThree({ chart }: { chart: ChartResult }) {
  const { t } = useTranslation();
  const sun = chart.points.find((p) => p.body === "Sun");
  const moon = chart.points.find((p) => p.body === "Moon");
  const risingSign = chart.houses.asc !== null ? signFromLongitude(chart.houses.asc) : null;

  const items = [
    sun && { glyph: PLANET_GLYPHS.Sun, label: t("interpretation.overview.bigThreeSun", "Sun"), sign: sun.sign },
    moon && { glyph: PLANET_GLYPHS.Moon, label: t("interpretation.overview.bigThreeMoon", "Moon"), sign: moon.sign },
    risingSign && { glyph: "↑", label: t("interpretation.overview.bigThreeRising", "Rising"), sign: risingSign },
  ].filter(Boolean) as { glyph: string; label: string; sign: string }[];

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((it) => {
        const el = signElement(it.sign);
        const c = el ? ELEMENT_COLORS[el].stroke : "#8fb6ff";
        return (
          <div
            key={it.label}
            className="relative overflow-hidden rounded-2xl border p-3 text-center sm:p-4"
            style={{ borderColor: hexToRgba(c, 0.3), background: hexToRgba(c, 0.06) }}
          >
            <div
              className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-full border font-serif text-xl sm:h-11 sm:w-11"
              style={{ color: c, borderColor: hexToRgba(c, 0.4) }}
            >
              {it.glyph}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className="flex items-center justify-center gap-1 font-serif text-sm text-[var(--ink)] sm:text-base">
              <span style={{ color: c }}>{ZODIAC_GLYPHS[it.sign]}</span>
              <span className="truncate">{signLabel(t, it.sign)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Circular "explored N/total" progress indicator. */
function ProgressRing({ done, total, label }: { done: number; total: number; label: string }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? done / total : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-11 w-11">
        <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="#e8c969"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-[#e8c969]">
          {done}/{total}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** Elemental balance bar across the chart's planets + optional progress ring. */
function ChartOverview({
  chart,
  explored,
  total,
  unlocked,
}: {
  chart: ChartResult;
  explored: number;
  total: number;
  unlocked: boolean;
}) {
  const { t } = useTranslation();
  const order: ElementKey[] = ["fire", "earth", "air", "water"];
  const counts: Record<ElementKey, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  let totalPlanets = 0;
  for (const point of chart.points) {
    if (!(point.body in PLANET_GLYPHS)) continue;
    const el = signElement(point.sign);
    if (el) {
      counts[el] += 1;
      totalPlanets += 1;
    }
  }
  if (totalPlanets === 0) return null;

  return (
    <div className="ds-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-serif text-base text-[#8fb6ff] sm:text-lg">
          {t("interpretation.overview.balanceTitle", "Elemental balance")}
        </h3>
        {unlocked && total > 0 && (
          <ProgressRing done={explored} total={total} label={t("interpretation.overview.explored", "Explored")} />
        )}
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
        {order.map((el) =>
          counts[el] > 0 ? (
            <div
              key={el}
              style={{ width: `${(counts[el] / totalPlanets) * 100}%`, background: ELEMENT_COLORS[el].stroke }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {order.map((el) => (
          <div key={el} className="flex flex-col items-center gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: ELEMENT_COLORS[el].text }}>
              <span className="h-2 w-2 rounded-full" style={{ background: ELEMENT_COLORS[el].stroke }} />
              {t(`interpretation.overview.elements.${el}`, el)}
            </span>
            <span className="text-sm font-semibold text-[var(--ink)]">{counts[el]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InterpretationView({
  chart,
  profileId,
  profileName,
  ownerDeviceId,
  tokens,
  interpretationsUnlocked = false,
  onUnlocked,
  onPurchasePremium,
  mode = "full",
  relocationLat,
  relocationLng,
}: InterpretationViewProps) {
  const { t, i18n } = useTranslation();
  const blocks = useMemo(() => generateInterpretations(chart), [chart]);
  const language = toAppLanguage(i18n.resolvedLanguage);

  const [deepLoadingKey, setDeepLoadingKey] = useState<string | null>(null);
  const [deepTexts, setDeepTexts] = useState<Record<string, string>>({});
  const [deepErrors, setDeepErrors] = useState<Record<string, string>>({});
  const [oracleQuestion, setOracleQuestion] = useState("");
  const [oracleAnswer, setOracleAnswer] = useState<string | null>(null);
  const [oracleHistory, setOracleHistory] = useState<OracleEntry[]>([]);
  const [currentOracleEntryKey, setCurrentOracleEntryKey] = useState<string | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [collapsedDeepDive, setCollapsedDeepDive] = useState<Record<string, boolean>>({});
  const [collapsedOracleAnswers, setCollapsedOracleAnswers] = useState<Record<string, boolean>>({});
  const [currentOracleCollapsed, setCurrentOracleCollapsed] = useState(false);

  const signBlocks = blocks.filter((b) => b.category !== "aspect");
  const aspectBlocks = blocks.filter((b) => b.category === "aspect");
  const exploredCount = blocks.filter((b) => Boolean(deepTexts[getBlockInstanceKey(b)])).length;
  const oracleHistoryWithoutCurrent = oracleAnswer
    ? oracleHistory.slice(1)
    : oracleHistory;

  useEffect(() => {
    const stored = readStoredAiState(profileId);
    setDeepTexts(stored.deepTexts);
    setOracleHistory(stored.oracleHistory);
    setOracleAnswer(null);
    setCurrentOracleEntryKey(null);
    setPdfError(null);
    setPdfLoading(false);
    setCollapsedDeepDive({});
    setCurrentOracleCollapsed(false);
    setCollapsedOracleAnswers(
      Object.fromEntries(stored.oracleHistory.map((entry) => [getOracleEntryKey(entry), true])),
    );
  }, [profileId]);

  useEffect(() => {
    writeStoredAiState(profileId, { deepTexts, oracleHistory });
  }, [profileId, deepTexts, oracleHistory]);

  function buildPdfSections(): PdfReportSection[] {
    return blocks.map((block) => {
      const blockId = getBlockInstanceKey(block);
      const aspect = block.aspect;
      const baseText = t(`${block.key}.text`);
      const deepText = deepTexts[blockId];
      const body = deepText
        ? `${baseText}\n\n## ${t("ai.deepDiveTitle")}\n${deepText}`
        : baseText;

      return {
        title: t(`${block.key}.title`),
        category: t(`interpretation.categories.${block.category}`),
        detail: aspect
          ? t("interpretation.aspectBetween", {
              a: aspect.a,
              b: aspect.b,
              type: t(`interpretation.aspects.${aspect.type}.title`),
              orb: aspect.orb.toFixed(1),
            })
          : undefined,
        body,
      };
    });
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    setPdfError(null);
    setPdfProgress(t("premium.pdfGenerating"));

    try {
      const generatedAtDate = new Intl.DateTimeFormat(
        dateLocale(language),
        {
          dateStyle: "long",
          timeStyle: "short",
        },
      ).format(new Date());

      const { jobId } = await enqueuePremiumPdf({
        profileId,
        ownerDeviceId,
        language,
        relocationLat: relocationLat ?? undefined,
        relocationLng: relocationLng ?? undefined,
        report: {
          title: t("premium.pdfTitle", {
            name: profileName,
            defaultValue: `Premium Interpretation: ${profileName}`,
          }),
          subtitle: t("premium.pdfSubtitle", {
            name: profileName,
            defaultValue: `Prepared for ${profileName}`,
          }),
          generatedAt: t("premium.pdfGeneratedAt", {
            date: generatedAtDate,
            defaultValue: `Generated ${generatedAtDate}`,
          }),
          sections: buildPdfSections(),
        },
      });

      // Poll until the job completes (generation takes ~1-3 min).
      const POLL_INTERVAL_MS = 3000;
      const MAX_ATTEMPTS = 120; // ~6 minutes
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        const job = await getPremiumPdfJob({ jobId, ownerDeviceId });

        if (job.status === "completed" && job.base64 && job.fileName) {
          saveBase64Pdf(
            job.base64,
            job.fileName,
            job.contentType ?? "application/pdf",
          );
          return;
        }

        if (job.status === "failed") {
          throw new Error(job.error ?? "PDF generation failed");
        }
      }

      throw new Error("PDF generation timed out");
    } catch (error) {
      if (
        error instanceof FirebaseError &&
        error.message.includes("permission-denied")
      ) {
        setPdfError(t("errors.permissionDenied"));
      } else {
        setPdfError(t("premium.downloadPdfFailed"));
      }
    } finally {
      setPdfLoading(false);
      setPdfProgress(null);
    }
  }

  async function handleDeepDive(block: InterpretationBlock) {
    const blockId = getBlockInstanceKey(block);
    const title = t(`${block.key}.title`);
    const text = t(`${block.key}.text`);

    const focusTopic = block.aspect
      ? `${title}: ${block.aspect.a} ${block.aspect.type} ${block.aspect.b}`
      : title;

    setDeepLoadingKey(blockId);
    setDeepErrors((prev) => ({ ...prev, [blockId]: "" }));
    trackEvent("ai_reading_requested", { kind: "deepen" });

    try {
      const response = await deepenInterpretation({
        profileId,
        ownerDeviceId,
        focusTopic,
        baseInterpretation: text,
        language,
        relocationLat: relocationLat ?? undefined,
        relocationLng: relocationLng ?? undefined,
      });

      const cleanedText = cleanAiArtifacts(response.text);
      setDeepTexts((prev) => ({
        ...prev,
        [blockId]: cleanedText,
      }));
      setCollapsedDeepDive((prev) => ({
        ...prev,
        [blockId]: false,
      }));
    } catch {
      setDeepErrors((prev) => ({
        ...prev,
        [blockId]: t("errors.aiFailed"),
      }));
    } finally {
      setDeepLoadingKey(null);
    }
  }

  async function handleAskOracle() {
    const question = oracleQuestion.trim();
    if (!question) {
      setOracleError(t("errors.oracleQuestionRequired"));
      return;
    }

    setOracleLoading(true);
    setOracleError(null);
    setOracleAnswer(null);
    trackEvent("ai_reading_requested", { kind: "oracle" });

    try {
      const response = await askOracle({
        profileId,
        ownerDeviceId,
        question,
        language,
        relocationLat: relocationLat ?? undefined,
        relocationLng: relocationLng ?? undefined,
      });

      const cleanedAnswer = cleanAiArtifacts(response.answer);
      const finalAnswer =
        cleanedAnswer.length >= 30 ? cleanedAnswer : response.answer.trim();

      if (finalAnswer.length < 20) {
        throw new Error("Oracle returned too short answer");
      }

      const newEntry: OracleEntry = {
        question,
        answer: finalAnswer,
        model: response.model,
        askedAt: new Date().toISOString(),
      };

      // Persist straight to storage first. If the user switched tabs while the
      // answer was generating, this component has unmounted and the setState
      // calls below are no-ops — but the user paid ✦1, so the answer must never
      // be lost. The load effect restores it when they return to the tab.
      try {
        const stored = readStoredAiState(profileId);
        writeStoredAiState(profileId, {
          deepTexts: stored.deepTexts,
          oracleHistory: [newEntry, ...stored.oracleHistory].slice(0, 20),
        });
      } catch {
        /* storage unavailable — fall back to state-only persistence */
      }

      setOracleAnswer(finalAnswer);
      setCurrentOracleEntryKey(getOracleEntryKey(newEntry));
      setCurrentOracleCollapsed(false);
      setOracleHistory((prev) => [newEntry, ...prev].slice(0, 20));
      setCollapsedOracleAnswers((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).map(([key]) => [key, true]),
        ) as Record<string, boolean>;
        next[getOracleEntryKey(newEntry)] = false;
        return next;
      });
      setOracleQuestion("");

      // The oracle spent ✦1 server-side — refresh the profile (inline balance)
      // and the header star count so the cost is reflected immediately.
      onUnlocked?.();
      window.dispatchEvent(new Event("astroweb:stars-changed"));
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.message.includes("permission-denied")) {
          setOracleError(t("errors.permissionDenied"));
        } else if (error.message.includes("not-found")) {
          setOracleError(t("errors.profileNotFound"));
        } else {
          setOracleError(t("errors.aiFailed"));
        }
      } else {
        setOracleError(t("errors.aiFailed"));
      }
    } finally {
      setOracleLoading(false);
    }
  }

  function handleDeleteCurrentOracleAnswer() {
    if (currentOracleEntryKey) {
      setOracleHistory((prev) =>
        prev.filter((entry) => getOracleEntryKey(entry) !== currentOracleEntryKey),
      );
      setCollapsedOracleAnswers((prev) => {
        const next = { ...prev };
        delete next[currentOracleEntryKey];
        return next;
      });
    }

    setOracleAnswer(null);
    setCurrentOracleEntryKey(null);
    setCurrentOracleCollapsed(false);
  }

  function handleDeleteOracleHistoryEntry(entryKey: string) {
    setOracleHistory((prev) => prev.filter((entry) => getOracleEntryKey(entry) !== entryKey));
    setCollapsedOracleAnswers((prev) => {
      const next = { ...prev };
      delete next[entryKey];
      return next;
    });

    if (currentOracleEntryKey === entryKey) {
      setOracleAnswer(null);
      setCurrentOracleEntryKey(null);
      setCurrentOracleCollapsed(false);
    }
  }

  const canOracle = tokens >= TOKEN_COST.oracle;
  // Full interpretations, Dig Deeper and the PDF are all part of the one-time
  // 4-star unlock (or a legacy purchase). Until unlocked, they stay blurred.
  const canPdf = interpretationsUnlocked;
  const canUnlock = tokens >= TOKEN_COST.pdf;
  const [unlocking, setUnlocking] = useState(false);

  // Funnel: the paywall of this view is on screen (once per profile and feature).
  useEffect(() => {
    if (mode !== "oracle" && !interpretationsUnlocked) trackOnce(profileId, "paywall_viewed", { feature: "interpretations" });
    if (mode !== "interpretation" && !canOracle) trackOnce(profileId, "paywall_viewed", { feature: "oracle" });
  }, [mode, interpretationsUnlocked, canOracle, profileId]);

  async function handleUnlock() {
    setUnlocking(true);
    try {
      const unlocked = await unlockFeature({ profileId, ownerDeviceId, feature: "interpretations" });
      if (!unlocked.alreadyUnlocked) {
        trackEvent("unlock_feature", { feature: "interpretations", stars: TOKEN_COST.pdf });
      }
      onUnlocked?.();
      window.dispatchEvent(new Event("astroweb:stars-changed"));
    } catch {
      onPurchasePremium?.();
    } finally {
      setUnlocking(false);
    }
  }

  /** Reading body (blurred unlock CTA or full text + deep dive) shared by sign and aspect cards. */
  function renderBlockBody(block: InterpretationBlock) {
    const blockId = getBlockInstanceKey(block);
    const deepText = deepTexts[blockId];
    const deepError = deepErrors[blockId];
    const deepLoading = deepLoadingKey === blockId;
    const isDeepDiveCollapsed = collapsedDeepDive[blockId] ?? false;

    if (!interpretationsUnlocked) {
      return (
        <div className="relative">
          <p className="text-sm leading-relaxed text-muted-foreground opacity-80 blur-[1px] select-none">
            {getSingleLinePreview(t(`${block.key}.text`))}...
          </p>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90" />
          <div className="relative z-10 mt-2 flex flex-col items-start gap-2">
            <p className="text-xs font-medium text-[#e8c969]">
              {t("premium.unlockRequired", "Unlock Premium to read full deep interpretation.")}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={unlocking}
              className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]"
              onClick={canUnlock ? handleUnlock : onPurchasePremium}
            >
              {unlocking
                ? t("premium.unlocking", "Unlocking…")
                : canUnlock
                  ? t("premium.unlockInterpretations", `Unlock Interpretations + PDF ✦${TOKEN_COST.pdf}`)
                  : t("premium.needStars", { count: TOKEN_COST.pdf, defaultValue: `Need ✦${TOKEN_COST.pdf} — buy stars` })}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(`${block.key}.text`)}</p>
        {/* Once a deep dive exists, the generated reading below (with its own
            expand/collapse control) replaces the trigger — re-running it just
            regenerated near-identical text and left the button looking active. */}
        {!deepText && (
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void handleDeepDive(block);
              }}
              disabled={deepLoading}
            >
              {deepLoading ? t("ai.deepDiveLoading") : t("ai.deepDive")}
            </Button>
          </div>
        )}
        {deepError && <p className="text-sm text-destructive">{deepError}</p>}
        {deepText && (
          <div className="space-y-2 rounded-xl border bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("ai.deepDiveTitle")}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCollapsedDeepDive((prev) => ({
                    ...prev,
                    [blockId]: !isDeepDiveCollapsed,
                  }))
                }
              >
                {isDeepDiveCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
              </Button>
            </div>
            {!isDeepDiveCollapsed && <AiReading text={deepText} />}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {mode !== "oracle" && canPdf && (
        <div className="ds-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-serif text-lg text-[#8fb6ff]">
              {t("premium.pdfReadyTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("premium.pdfReadyDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void handleDownloadPdf();
            }}
            disabled={pdfLoading}
            className="border-[#e8c969]/50 text-[#e8c969] hover:bg-[#e8c969]/10"
          >
            <Download />
            {pdfLoading ? t("premium.downloadPdfLoading") : t("premium.downloadPdf")}
          </Button>
          {pdfLoading && pdfProgress && (
            <p className="text-sm text-[#e8c969]/80 sm:basis-full">{pdfProgress}</p>
          )}
          {pdfError && (
            <p className="text-sm text-destructive sm:basis-full">{pdfError}</p>
          )}
        </div>
      )}

      {mode !== "interpretation" && (
      <div className="ds-card relative overflow-hidden p-4 space-y-3 sm:p-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-20"
          style={{ background: "linear-gradient(180deg, rgba(232,201,105,0.10) 0%, transparent 100%)" }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#e8c969]/40 bg-[#e8c969]/10 text-lg text-[#e8c969]">
              ✦
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-lg text-[#8fb6ff] sm:text-xl">{t("ai.oracleTitle")}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("ai.oracleDescription")}
              </p>
            </div>
          </div>
          <div className="flex flex-none flex-col items-end">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              {t("ai.creditsLabel", "Stars")} · ✦{TOKEN_COST.oracle}
            </span>
            <div className={`flex h-8 items-center justify-center rounded-full px-3 text-sm font-medium border ${canOracle ? "bg-[#e8c969]/10 text-[#e8c969] border-[#e8c969]/30" : "bg-muted/50 text-muted-foreground border-border"}`}>
              <span className="mr-1.5">✦</span> {tokens}
            </div>
          </div>
        </div>

        <textarea
          className="w-full min-h-24 rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e8c969]"
          value={oracleQuestion}
          onChange={(e) => {
            setOracleQuestion(e.target.value);
            if (oracleError) {
              setOracleError(null);
            }
          }}
          placeholder={canOracle ? t("ai.oraclePlaceholder") : t("ai.oracleNoCredits", "You need stars to ask a question. Buy them in the Premium tab.")}
          maxLength={1000}
          disabled={!canOracle}
        />

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleAskOracle}
            disabled={oracleLoading || !canOracle}
            className={canOracle ? "bg-[#e8c969] hover:bg-[#f2dd9a] text-[#1a1606]" : ""}
          >
            {oracleLoading ? t("ai.askOracleLoading") : t("ai.askOracle")}
          </Button>
        </div>

        {oracleError && (
          <p className="text-sm text-destructive">{oracleError}</p>
        )}

        {oracleAnswer && (
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#e8c969]/40 bg-[#e8c969]/10 text-[#e8c969]">✦</div>
            <div className="min-w-0 flex-1 space-y-2 rounded-2xl rounded-bl-sm border border-border bg-secondary p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("ai.answerTitle")}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={currentOracleCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                  title={currentOracleCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                  onClick={() => setCurrentOracleCollapsed((prev) => !prev)}
                >
                  {currentOracleCollapsed ? <ChevronDown /> : <ChevronUp />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                  onClick={handleDeleteCurrentOracleAnswer}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {currentOracleCollapsed ? (
              <p className="text-sm text-muted-foreground truncate">
                {renderInlineMarkdown(getSingleLinePreview(oracleAnswer), "oracle-current-preview")}
              </p>
            ) : (
              <AiReading text={oracleAnswer} />
            )}
            </div>
          </div>
        )}

        {oracleHistoryWithoutCurrent.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("ai.oracleHistoryTitle")}
            </p>
            <div className="space-y-2">
              {oracleHistoryWithoutCurrent.map((entry) => (
                (() => {
                  const entryKey = getOracleEntryKey(entry);
                  const isCollapsed = collapsedOracleAnswers[entryKey] ?? true;

                  return (
                    <div
                      key={entryKey}
                      className="rounded-md border bg-background/40 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {entry.question}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                            title={isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                            onClick={() =>
                              setCollapsedOracleAnswers((prev) => ({
                                ...prev,
                                [entryKey]: !isCollapsed,
                              }))
                            }
                          >
                            {isCollapsed ? <ChevronDown /> : <ChevronUp />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("common.delete")}
                            title={t("common.delete")}
                            onClick={() => handleDeleteOracleHistoryEntry(entryKey)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      {isCollapsed ? (
                        <p className="text-sm text-muted-foreground truncate">
                          {renderInlineMarkdown(getSingleLinePreview(entry.answer), `oracle-history-preview-${entryKey}`)}
                        </p>
                      ) : (
                        <AiReading text={entry.answer} />
                      )}
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {mode !== "oracle" && (<>
      {/* Visual overview: Big Three hero + elemental balance + exploration progress */}
      <BigThree chart={chart} />
      <ChartOverview
        chart={chart}
        explored={exploredCount}
        total={blocks.length}
        unlocked={interpretationsUnlocked}
      />

      {/* Sign-based interpretation blocks */}
      {signBlocks.map((block) => {
        const blockId = getBlockInstanceKey(block);
        const accent = getBlockColor(block);
        const elementKey = block.tags[0] as ElementKey;
        const elementName =
          elementKey in ELEMENT_COLORS ? t(`interpretation.overview.elements.${elementKey}`, elementKey) : null;

        return (
          <article
            key={blockId}
            className="relative overflow-hidden rounded-2xl border bg-[var(--surface)] p-4 sm:p-6"
            style={{ borderColor: hexToRgba(accent, 0.25) }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: `linear-gradient(180deg, ${hexToRgba(accent, 0.16)} 0%, transparent 100%)` }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-3 -bottom-7 select-none font-serif text-[130px] leading-none opacity-[0.06]"
              style={{ color: accent }}
            >
              {getBlockGlyph(block)}
            </span>
            <div className="relative space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full border font-serif text-2xl sm:h-12 sm:w-12"
                  style={{ color: accent, borderColor: hexToRgba(accent, 0.5), background: hexToRgba(accent, 0.1) }}
                >
                  {getBlockGlyph(block)}
                </div>
                <div className="min-w-0">
                  <div className="ds-interp-cat">
                    {t(`interpretation.categories.${block.category}`)}
                    {elementName ? ` · ${elementName}` : ""}
                  </div>
                  <h3 className="font-serif text-lg leading-tight text-[var(--ink)] sm:text-xl">
                    {t(`${block.key}.title`)}
                  </h3>
                </div>
              </div>
              {renderBlockBody(block)}
            </div>
          </article>
        );
      })}

      {/* Separator between sign and aspect blocks */}
      {aspectBlocks.length > 0 && signBlocks.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* Aspect blocks */}
      {aspectBlocks.length > 0 && (
        <div className="space-y-1">
          <span className="ds-interp-cat">
            {t("interpretation.categories.aspect")}
          </span>
        </div>
      )}

      {aspectBlocks.map((block) => {
        const aspect = block.aspect;
        const blockId = getBlockInstanceKey(block);
        const accent = getBlockColor(block);

        return (
          <article
            key={blockId}
            className="relative overflow-hidden rounded-2xl border bg-[var(--surface)] p-4 sm:p-6"
            style={{ borderColor: hexToRgba(accent, 0.25) }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: `linear-gradient(180deg, ${hexToRgba(accent, 0.16)} 0%, transparent 100%)` }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-3 -bottom-7 select-none font-serif text-[130px] leading-none opacity-[0.06]"
              style={{ color: accent }}
            >
              {getBlockGlyph(block)}
            </span>
            <div className="relative space-y-2">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full border font-serif text-2xl sm:h-12 sm:w-12"
                  style={{ color: accent, borderColor: hexToRgba(accent, 0.5), background: hexToRgba(accent, 0.1) }}
                >
                  {getBlockGlyph(block)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-lg leading-tight text-[var(--ink)] sm:text-xl">
                    {t(`${block.key}.title`)}
                  </h3>
                  {aspect && (
                    <p className="text-sm font-medium text-muted-foreground">
                      {PLANET_GLYPHS[aspect.a] ?? ""} {aspect.a}{" "}
                      {ASPECT_GLYPHS[aspect.type] ?? ""}{" "}
                      {PLANET_GLYPHS[aspect.b] ?? ""} {aspect.b}{" "}
                      <span className="text-muted-foreground/70">({aspect.orb.toFixed(1)}&deg;)</span>
                    </p>
                  )}
                </div>
              </div>
              {renderBlockBody(block)}
            </div>
          </article>
        );
      })}
      </>)}
    </div>
  );
}
