import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getProfileById } from "./profile";
import { resolveOwnedChart } from "./chartResolver";
import { getDossier, getDossierSummaryText, readDossier } from "./dossier";
import { computeTransits } from "./transits";
import { buildNewsDigest } from "./newsDigest";
import { buildLetterAnalysisPrompt, buildLetterGenerationPrompt, type LetterAnalysisPromptInput } from "./prompts";
import type { GenerationResult } from "./ai/generate";
import { extractJson } from "./ai/json";
import { runTask } from "./ai/run";
import { loadTaskSettings, textsFor, type EffectiveTaskSettings } from "./ai/settings";
import type { StyleProfile } from "../types";

export interface LetterQuestion {
  id: string;
  text: string;
  options: string[];
  dossierKey: string;
  sensitive: boolean;
}
export interface LetterContent {
  html: string;
  teaserText: string;
  questions: LetterQuestion[];
  brief: unknown;
  language: "ru" | "en";
  addressForm: string | null;
  cost: { usd: number; passes: { label: string; model: string; inTok: number; outTok: number }[] };
  generatedAt: string;
}

export interface Brief {
  themes: string[];
  chosenTransits: string[];
  newsHooks: string[];
  callbacks: string[];
  effectiveRegister: { humor: number; seriousness: number; warmth: number; note: string };
  questions: { text: string; options: string[]; dossierKey: string; sensitive: boolean }[];
}

/** Persist a generated letter to `letters/{profileId}/items`. Returns letterId. */
export async function persistLetter(
  profileId: string,
  ownerUid: string,
  content: LetterContent,
  meta: { cadence: string; windowStart: string; windowEnd: string },
): Promise<string> {
  const ref = getFirestore().collection("letters").doc(profileId).collection("items").doc();
  await ref.set({
    id: ref.id,
    profileId,
    ownerUid,
    generatedAt: content.generatedAt,
    cadence: meta.cadence,
    windowStart: meta.windowStart,
    windowEnd: meta.windowEnd,
    brief: content.brief,
    html: content.html,
    teaserText: content.teaserText,
    language: content.language,
    addressForm: content.addressForm,
    questions: content.questions.map((q) => ({ ...q, answeredOption: null, answeredAt: null })),
    status: "generated",
    delivery: { inApp: {} },
    feedback: null,
    cost: content.cost,
    createdAt: content.generatedAt,
  });
  return ref.id;
}

/** Enqueue a letter job to run now (used to send the first letter right after hiring). */
export async function enqueueImmediateLetter(profileId: string, ownerUid: string, cadence: string): Promise<void> {
  const now = new Date().toISOString();
  const jobId = `${profileId}__${now.replace(/[:.]/g, "-")}`;
  await getFirestore().collection("letterJobs").doc(jobId).set({
    profileId,
    ownerUid,
    cadence,
    windowStart: now,
    windowEnd: now,
    status: "queued",
    attempts: 0,
    createdAt: now,
  });
}

/** dossierKeys + question texts asked in the last few letters (to avoid repeats). */
async function recentAskedKeys(profileId: string): Promise<string[]> {
  const snap = await getFirestore()
    .collection("letters")
    .doc(profileId)
    .collection("items")
    .orderBy("generatedAt", "desc")
    .limit(5)
    .get();
  const keys = new Set<string>();
  snap.docs.forEach((d) => {
    const qs = (d.data().questions as { dossierKey?: string; text?: string }[]) ?? [];
    qs.forEach((q) => {
      if (q.dossierKey) keys.add(q.dossierKey);
      if (q.text) keys.add(q.text);
    });
  });
  return [...keys].slice(0, 30);
}

/** Most recent letter generated today (idempotency for manual generation). */
export async function todaysLetterId(profileId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getFirestore()
    .collection("letters")
    .doc(profileId)
    .collection("items")
    .orderBy("generatedAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return typeof d.generatedAt === "string" && d.generatedAt.slice(0, 10) === today ? (d.id as string) : null;
}

async function recentOracleQuestion(profileId: string): Promise<string | null> {
  const snap = await getFirestore()
    .collection("oracleHistory")
    .doc(profileId)
    .collection("items")
    .orderBy("askedAt", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : ((snap.docs[0].data().question as string) ?? null);
}

async function astrologerName(profileId: string): Promise<string> {
  const snap = await getFirestore().collection("subscriptions").doc(profileId).get();
  return (snap.exists && (snap.data()?.astrologerName as string)) || "Vega";
}

/** Everything one letter is written from: the person, the chart, transits, news and history. */
export interface LetterInputs {
  profileId: string;
  lang: "ru" | "en";
  addressForm: string | null;
  analysis: LetterAnalysisPromptInput;
  astrologerName: string;
  digestCostUsd: number;
  residencePlace: string;
}

/**
 * Gather the inputs of a letter. With `dryRun` (admin test run) the news digest
 * reads its cache but never writes it.
 */
/** The person behind a letter: profile, dossier, letter language and place of residence. */
export async function loadLetterContext(profileId: string, options: { dryRun?: boolean } = {}) {
  const profile = await getProfileById(profileId);
  if (!profile) throw new Error("Profile not found");
  const dossier = options.dryRun
    ? (await readDossier(profileId, profile.ownerUid ?? "", "ru")).dossier
    : await getDossier(profileId, profile.ownerUid ?? "", "ru");
  const lang = dossier.language ?? "ru";

  // Residence (place of living, not birth) for relocated houses + news + weather.
  const residence =
    dossier.locationCurrent ??
    (typeof profile.currentLat === "number" && typeof profile.currentLng === "number"
      ? { place: profile.currentPlace ?? profile.birthPlace, lat: profile.currentLat, lng: profile.currentLng, timezone: profile.timezone }
      : { place: profile.birthPlace, lat: profile.lat, lng: profile.lng, timezone: profile.timezone });
  return { profile, dossier, lang, residence };
}

export async function prepareLetterInputs(
  profileId: string,
  options: { dryRun?: boolean; newsSettings?: EffectiveTaskSettings } = {},
): Promise<LetterInputs> {
  const { profile, dossier, lang, residence } = await loadLetterContext(profileId, options);

  const { chart } = await resolveOwnedChart({
    profileId,
    ownerDeviceId: profile.ownerDeviceId,
    uid: profile.ownerUid ?? null,
    relocationLat: residence.lat,
    relocationLng: residence.lng,
  });

  const now = new Date();
  const transit = computeTransits(chart, residence, now);
  const dateStr = now.toISOString().slice(0, 10);
  const digest = await buildNewsDigest(
    {
      interestTags: dossier.interests,
      residence: residence.place,
      language: lang,
      date: dateStr,
    },
    { cache: options.dryRun ? "read" : "use", settings: options.newsSettings },
  );

  const recentQ = await recentOracleQuestion(profileId);
  const name = await astrologerName(profileId);
  const style: StyleProfile = dossier.styleProfile ?? {
    humor: 0.4, seriousness: 0.5, formality: 0.2, warmth: 0.6, brevity: 0.6, mysticism: 0.4, emoji: 0.2,
  };
  // Everything already known (incl. custom-key facts) + questions already asked,
  // so the analysis pass NEVER re-asks the same thing.
  const knownText = await getDossierSummaryText(profileId);
  const askedKeys = await recentAskedKeys(profileId);

  return {
    profileId,
    lang,
    addressForm: dossier.addressForm,
    astrologerName: name,
    digestCostUsd: digest.costUsd,
    residencePlace: residence.place,
    analysis: {
      language: lang,
      addressForm: dossier.addressForm,
      interests: dossier.interests,
      goals: dossier.goals,
      openLoops: dossier.openLoops,
      styleProfile: style,
      styleNudge: dossier.styleNudge,
      knownText,
      askedKeys,
      residencePlace: residence.place,
      chart,
      transit,
      newsHooks: digest.hooks,
      recentQuestion: recentQ,
    },
  };
}

/** Analysis pass: themes, transits, news hooks and questions as JSON (task letterAnalysis). */
export async function runLetterAnalysis(
  inputs: LetterInputs,
  settings: EffectiveTaskSettings,
): Promise<{ brief: Brief; result: GenerationResult }> {
  const result = await runTask(
    settings,
    buildLetterAnalysisPrompt({ ...inputs.analysis, texts: textsFor(settings, inputs.lang) }),
  );
  return { brief: extractJson<Brief>(result.text), result };
}

/** Writing pass: the letter as JSON in the astrologer's voice (task letterWriting). */
export async function runLetterWriting(
  inputs: LetterInputs,
  brief: Brief,
  settings: EffectiveTaskSettings,
): Promise<{ letter: { teaser: string; html: string; questions: { text: string; options: string[] }[] }; result: GenerationResult }> {
  const result = await runTask(
    settings,
    buildLetterGenerationPrompt({
      astrologerName: inputs.astrologerName,
      language: inputs.lang,
      addressForm: inputs.addressForm,
      brief,
      texts: textsFor(settings, inputs.lang),
    }),
  );
  return {
    letter: extractJson<{ teaser: string; html: string; questions: { text: string; options: string[] }[] }>(result.text),
    result,
  };
}

/**
 * Generate one letter for a chart (does NOT persist or deliver — the job does
 * that). Pure: gather inputs → news digest → analysis pass → writing pass,
 * each with its task's settings. Returns the content + measured COGS.
 */
export async function generateLetter(profileId: string): Promise<LetterContent> {
  const inputs = await prepareLetterInputs(profileId);
  const passes: LetterContent["cost"]["passes"] = [];
  let usd = inputs.digestCostUsd;

  const { brief, result: a } = await runLetterAnalysis(inputs, await loadTaskSettings("letterAnalysis"));
  passes.push({ label: "analysis", model: a.model, inTok: a.usage.inputTokens, outTok: a.usage.outputTokens });
  usd += a.costUsd;

  const { letter, result: g } = await runLetterWriting(inputs, brief, await loadTaskSettings("letterWriting"));
  passes.push({ label: "generation", model: g.model, inTok: g.usage.inputTokens, outTok: g.usage.outputTokens });
  usd += g.costUsd;

  // Merge dossierKey/sensitive from the brief's questions into the rendered ones.
  const questions: LetterQuestion[] = (letter.questions ?? []).slice(0, 3).map((q, i) => ({
    id: `q${i}`,
    text: q.text,
    options: q.options ?? [],
    dossierKey: brief.questions?.[i]?.dossierKey ?? "misc",
    sensitive: Boolean(brief.questions?.[i]?.sensitive),
  }));

  logger.info("generateLetter done", { profileId, usd: usd.toFixed(4), residence: inputs.residencePlace });

  return {
    html: letter.html,
    teaserText: letter.teaser,
    questions,
    brief,
    language: inputs.lang,
    addressForm: inputs.addressForm,
    cost: { usd, passes },
    generatedAt: new Date().toISOString(),
  };
}
