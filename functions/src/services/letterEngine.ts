import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getProfileById } from "./profile";
import { resolveOwnedChart } from "./chartResolver";
import { getDossier, getDossierSummaryText } from "./dossier";
import { computeTransits } from "./transits";
import { buildNewsDigest } from "./newsDigest";
import { callClaudeRaw, extractJson, usageCostUsd } from "./claudeRaw";
import type { StyleProfile } from "../types";

const OPUS = "claude-opus-4-8";

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

interface Brief {
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

/**
 * Generate one letter for a chart (does NOT persist or deliver — the job does
 * that). Pure: gather inputs → news digest (cheap model) → Opus analysis →
 * Opus generation. Returns the content + measured COGS.
 */
export async function generateLetter(profileId: string): Promise<LetterContent> {
  const profile = await getProfileById(profileId);
  if (!profile) throw new Error("Profile not found");
  const dossier = await getDossier(profileId, profile.ownerUid ?? "", "ru");
  const lang = dossier.language ?? "ru";

  // Residence (place of living, not birth) for relocated houses + news + weather.
  const residence =
    dossier.locationCurrent ??
    (typeof profile.currentLat === "number" && typeof profile.currentLng === "number"
      ? { place: profile.currentPlace ?? profile.birthPlace, lat: profile.currentLat, lng: profile.currentLng, timezone: profile.timezone }
      : { place: profile.birthPlace, lat: profile.lat, lng: profile.lng, timezone: profile.timezone });

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
  const digest = await buildNewsDigest({
    interestTags: dossier.interests,
    residence: residence.place,
    language: lang,
    date: dateStr,
  });

  const recentQ = await recentOracleQuestion(profileId);
  const name = await astrologerName(profileId);
  const style: StyleProfile = dossier.styleProfile ?? {
    humor: 0.4, seriousness: 0.5, formality: 0.2, warmth: 0.6, brevity: 0.6, mysticism: 0.4, emoji: 0.2,
  };
  // Everything already known (incl. custom-key facts) + questions already asked,
  // so the analysis pass NEVER re-asks the same thing.
  const knownText = await getDossierSummaryText(profileId);
  const askedKeys = await recentAskedKeys(profileId);

  const passes: LetterContent["cost"]["passes"] = [];
  let usd = digest.costUsd;

  // ---- Analysis pass (Opus) --------------------------------------------------
  const analysisSystem =
    "Аналитический движок письма личного астролога. ТОЛЬКО JSON: " +
    '{"themes":[1-2],"chosenTransits":[string],"newsHooks":[string],"callbacks":[],' +
    '"effectiveRegister":{"humor":0..1,"seriousness":0..1,"warmth":0..1,"note":string},' +
    '"questions":[{"text":string,"options":[2-3],"dossierKey":string,"sensitive":bool}]}. ' +
    "Выбери 2-3 значимых транзита из списка; newsHooks бери из дайджеста; ≤3 коротких вопроса, заполняющих ТОЛЬКО пробелы досье. " +
    "КРИТИЧНО: НЕ задавай вопросы, ответы на которые уже есть в 'ЧТО УЖЕ ИЗВЕСТНО', и НЕ повторяй темы из 'УЖЕ СПРАШИВАЛ'. Если новых пробелов нет — верни пустой массив questions. " +
    "effectiveRegister = styleProfile ⊕ контекст: серьёзный/тревожный недавний вопрос → приглуши humor, подними seriousness/warmth (read the room).";
  const analysisUser = [
    `ДОСЬЕ: ${JSON.stringify({ language: lang, addressForm: dossier.addressForm, interests: dossier.interests, goals: dossier.goals, openLoops: dossier.openLoops, styleProfile: style, styleNudge: dossier.styleNudge })}`,
    knownText ? `ЧТО УЖЕ ИЗВЕСТНО (НЕ переспрашивай это):\n${knownText}` : "",
    askedKeys.length ? `УЖЕ СПРАШИВАЛ (не повторяй эти темы): ${askedKeys.join(", ")}` : "",
    `НАТАЛ (дома релоцированы на ${residence.place}): ${chart.points.map((p) => `${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°${p.house ? ` д${p.house}` : ""}`).join(" · ")}`,
    `ТЕКУЩИЕ ПОЗИЦИИ: ${transit.positions}`,
    `ТРАНЗИТНЫЕ АСПЕКТЫ:\n${transit.aspects}`,
    `НОВОСТИ (дайджест): ${JSON.stringify(digest.hooks)}`,
    recentQ ? `НЕДАВНИЙ ВОПРОС: "${recentQ}"` : "Это первое письмо (cold start) — вопросы мягко знакомятся.",
  ].filter(Boolean).join("\n");

  const a = await callClaudeRaw({ model: OPUS, system: analysisSystem, user: analysisUser, maxTokens: 1500 });
  passes.push({ label: "analysis", model: OPUS, inTok: a.usage.input_tokens, outTok: a.usage.output_tokens });
  usd += usageCostUsd(OPUS, a.usage);
  const brief = extractJson<Brief>(a.text);

  // ---- Generation pass (Opus) ------------------------------------------------
  const genderNote =
    dossier.addressForm === "feminine" ? "женский род" : dossier.addressForm === "masculine" ? "мужской род" : "нейтральный род";
  const generationSystem =
    `Ты — ${name}, личный астролог (одна постоянная личность). Пиши ПИСЬМО на ${lang === "ru" ? "русском" : "английском"}, ${genderNote}. ` +
    `Выдерживай effectiveRegister из брифа. Структура по темам; вплетай транзит→смысл→действие→крючок из новостей. ` +
    `Континуитет: сошлись на открытые темы, если есть. Read the room. ТОЛЬКО JSON: ` +
    '{"teaser":string(≤180),"html":string(чистый HTML ~250-360 слов, без <script>),"questions":[{"text":string,"options":[2-3]}](≤3)}. Дисклеймер строкой.';
  const g = await callClaudeRaw({ model: OPUS, system: generationSystem, user: `БРИФ: ${JSON.stringify(brief)}`, maxTokens: 2000 });
  passes.push({ label: "generation", model: OPUS, inTok: g.usage.input_tokens, outTok: g.usage.output_tokens });
  usd += usageCostUsd(OPUS, g.usage);
  const letter = extractJson<{ teaser: string; html: string; questions: { text: string; options: string[] }[] }>(g.text);

  // Merge dossierKey/sensitive from the brief's questions into the rendered ones.
  const questions: LetterQuestion[] = (letter.questions ?? []).slice(0, 3).map((q, i) => ({
    id: `q${i}`,
    text: q.text,
    options: q.options ?? [],
    dossierKey: brief.questions?.[i]?.dossierKey ?? "misc",
    sensitive: Boolean(brief.questions?.[i]?.sensitive),
  }));

  logger.info("generateLetter done", { profileId, usd: usd.toFixed(4), residence: residence.place });

  return {
    html: letter.html,
    teaserText: letter.teaser,
    questions,
    brief,
    language: lang,
    addressForm: dossier.addressForm,
    cost: { usd, passes },
    generatedAt: new Date().toISOString(),
  };
}
