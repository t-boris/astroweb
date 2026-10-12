# Personal Astrologer — Detailed Implementation Plan

Companion to `personal-astrologer-spec.md` (product spec) and `personal-astrologer-implementation.md`
(phase checklist). This document is the engineering-level plan: exact files, schemas, function
signatures, prompts, sequencing, verification.

Stack reminders: Firebase Functions Gen2 (Node 22, raw `fetch` to Anthropic — no SDK), Firestore, Auth,
Storage; Vite/React 19 + Tailwind v4 + i18next (en/ru); Stripe. Anthropic via Secret Manager
`ANTHROPIC_API_KEY`. Models: Opus 4.8 `claude-opus-4-8` ($5/$25), Sonnet 4.6 `claude-sonnet-4-6` ($3/$15),
Haiku 4.5 `claude-haiku-4-5` ($1/$5).

## Conventions (apply to every change)
- New callables need a Cloud Run public-invoker grant on deploy:
  `gcloud run services add-iam-policy-binding <fnname-lowercase> --region us-central1 --member=allUsers --role=roles/run.invoker` (retry on ETag race).
- Bump `web/package.json` version before each hosting deploy.
- All astrologer Firestore collections are **server-only**: Firestore rules deny client access; only the
  Admin SDK (Functions) reads/writes. Frontend always goes through callables.
- Feature flag: `featureFlags/personalAstrologer` doc `{ enabled: bool, allowUids: string[] }`; a helper
  `isAstrologerEnabled(uid)` gates Phases 2–4 until 4+5 are done.
- Owner-scoping on every callable via `ownerCtx`/`ownsProfile` (`functions/src/services/owner.ts`).
- Account-only: astrologer callables require `request.auth?.uid` (reject device-only).

---

## 0. Data model (build first; Phase 1)

### Collections (all server-only)
```
dossiers/{profileId}
  ownerUid, language, addressForm, locationCurrent{place,lat,lng,timezone},
  relationshipStatus, hasKids, occupation, interests[], goals[], openLoops[],
  styleProfile{humor,seriousness,formality,warmth,brevity,mysticism,emoji}, styleNudge,
  consentSensitive(bool), updatedAt, createdAt

dossiers/{profileId}/facts/{factId}
  key, value, source("onboarding"|"tap"|"inferred"), sourceRef, sensitive(bool),
  confirmed(bool), confidence(0..1), createdAt, supersededAt|null

oracleHistory/{profileId}/items/{id}
  question, answer, askedAt, channel("web"|"letter"), model, extractedFactIds[]

letters/{profileId}/items/{letterId}
  ownerUid, generatedAt, cadence, windowStart, windowEnd,
  brief{themes[],chosenTransits[],newsHooks[],callbacks[],effectiveRegister{}},
  html, teaserText, language, addressForm,
  questions[{id,text,options[],dossierKey,sensitive,answeredOption,answeredAt}],
  status("generated"|"delivered"|"read"), delivery{email{},webPush{},inApp{}},
  feedback("resonated"|"missed"|null), cost{model,inputTokens,outputTokens,usd}, createdAt

letterJobs/{jobId}                       // jobId = `${profileId}__${windowStartISO}`
  profileId, ownerUid, windowStart, windowEnd, cadence,
  status("queued"|"running"|"completed"|"failed"), attempts, error, createdAt

subscriptions/{profileId}                // one per chart (1 astrologer = 1 chart)
  ownerUid, status("active"|"paused"|"past_due"|"canceled"),
  cadence, billingPeriod, provider("stripe"), providerRef,
  priceCents, starsPerCycle(=1), channels{inApp,email,webPush},
  currentPeriodStart, currentPeriodEnd, nextLetterAt, pausedUntil|null, canceledAt|null,
  astrologerName, createdAt, updatedAt

consents/{profileId}  { sensitiveDataConsent, consentAt, tosVersion }
pushSubscriptions/{profileId}/items/{id}  { endpoint, keys{p256dh,auth}, createdAt }
featureFlags/personalAstrologer  { enabled, allowUids[] }
```
`wallets/{ownerKey}` already exists (`services/wallet.ts`).

### Firestore rules (`firestore.rules`)
Add deny-all for `dossiers`, `letters`, `letterJobs`, `subscriptions`, `consents`, `oracleHistory`,
`pushSubscriptions` (Admin SDK bypasses rules). Verify existing `profiles` rules unchanged.

---

## 1. Shared backend services (build once, reused by phases)

### 1.1 `functions/src/services/dossier.ts`
```
getDossier(profileId): Promise<Dossier>                         // resolved summary
appendFact(profileId, fact): Promise<void>                      // provenance + supersede logic
resolveSummary(profileId): Promise<DossierSummary>              // facts -> structured summary
updateStyleProfileEMA(profileId, signals, alpha): Promise<void> // gradual register drift
listFacts / deleteFact / forgetDossier / exportDossier
```
Rules: sensitive facts stored with `confirmed=false` until explicit tap; `getDossier` excludes unconfirmed
sensitive facts from the prompt-facing summary; confidence decays for stale `inferred` facts.

### 1.2 `functions/src/services/newsDigest.ts`
```
buildNewsDigest({interestTags, residence, language, date}): Promise<{hooks:[{headline,oneLine}], note}>
```
Implementation: one `messages` call to **Sonnet 4.6** (or Haiku) with `tools:[{type:"web_search_20250305",
name:"web_search", max_uses:2}]`, system = "news scout, return ONLY JSON digest, no narration". Robust JSON
extraction (`indexOf('{')..lastIndexOf('}')`). Cache in `newsCache/{tag}__{YYYY-MM-DD}` to dedupe across
users. Measured COGS: ~$0.093 (Sonnet) / ~$0.03 (Haiku). (Validated by `tasks/letter-test-boris-cheapnews.mjs`.)

### 1.3 `functions/src/services/transits.ts`
```
computeTransits({natal, residence, windowStart, windowEnd}): Transit[]
```
Compute current planet positions via existing `astro/chart.ts` (`computeNatalChart` for the window) and
**aspect them to natal in code** (extend `astro/aspects.ts`), placed in **relocated houses** (use the
relocation override path from `resolveOwnedChart`). Natal planets stay birth-based.

### 1.4 `functions/src/services/letterEngine.ts`
```
generateLetter(profileId): Promise<LetterDoc>
```
Orchestrates: gather inputs → `newsDigest` → `transits` → **analysis pass (Opus)** → **generation pass
(Opus)** → persist `letters/...`. Returns the letter + cost. Pure generation; delivery/credit handled by
the job (Phase 2/3). Reuse the raw-fetch helper pattern from `services/anthropic.ts` (add `callClaude({
model, system, messages, tools, maxTokens })` returning `{text, usage}`); JSON-schema-validate the brief.

### 1.5 `functions/src/services/factExtraction.ts`
```
extractFacts({text, dossier}): Promise<CandidateFact[]>   // cheap model (Haiku/Sonnet)
```
Used after Oracle/letter free-text. Non-sensitive → auto-append (low confidence); sensitive → pending.

### 1.6 `functions/src/services/astrologer.ts`
Account-only guards, `isAstrologerEnabled(uid)`, subscription read/write helpers, `nextLetterAt`
computation (tz-aware, cadence interval, DST-safe).

---

## 2. Prompts (in `letterEngine.ts` / `newsDigest.ts` / `factExtraction.ts`)

- **Digest (Sonnet/Haiku, web_search):** "Find 2–3 fresh items for these interest tags + region; return
  ONLY JSON {hooks:[{headline,oneLine≤25w}],note}; don't narrate."
- **Analysis (Opus, structured):** inputs chart+transits(relocated)+dossier+digest → JSON `brief`
  {themes(1–2), chosenTransits, newsHooks, callbacks, effectiveRegister{humor,seriousness,warmth,note},
  questions[≤3]{text,options,dossierKey,sensitive}} + emit style signals. First letter → gentle
  getting-to-know questions, no sensitive-in-your-face.
- **Generation (Opus):** persona identity + effective register (styleProfile ⊕ context, styleNudge) +
  language + grammatical gender → JSON {teaser≤180, html(sanitized,~250–360w), questions[≤3]}. "Read the
  room" override; light disclaimer line.
- **Extraction (Haiku):** text → candidate facts {key,value,sensitive,confidence}.

Schema-validate every JSON; on parse failure retry once with a "return ONLY JSON" nudge.

---

## 3. Phase 1 — Foundation (detailed steps)

1. Create collections + rules (§0). Deploy rules.
2. `services/dossier.ts` (§1.1) + types in `functions/src/types/index.ts` and `web/src/types/index.ts`.
3. Extend `api/askOracle.ts`:
   - write Q/A to `oracleHistory`;
   - inject `getDossier(profileId)` summary into the Oracle system prompt (via `services/anthropic.ts`);
   - after answering, call `factExtraction` → append non-sensitive, queue sensitive.
4. New callables (`functions/src/api/`): `getDossier`, `updateDossierFact`, `deleteDossierFact`,
   `forgetDossier`, `confirmFact`, `setInterestTags`, `exportUserData`. Export in `index.ts`.
   Each: account-only + `ownsProfile`. Grant invokers on deploy.
5. Frontend:
   - `web/src/api/dossier.ts` wrappers;
   - **Interest tags** component (chips: suggested + custom-add) on `ProfileCreate.tsx`/profile;
   - **Onboarding** micro-form (reuse `PlaceSearch` for current city → writes relocation + `locationCurrent`);
   - **"Notes about you"** page/route: list facts (provenance), edit/delete, "Forget all", register line,
     sensitive-consent toggle; i18n keys in `public/locales/{en,ru}/translation.json`.
6. Verify: Oracle answer cites a known fact; tags persist; facts editable/deletable; forget wipes.

Deploy: functions (changed + new) + invokers + hosting (version bump).

## 4. Phase 2 — Generation engine (flagged, internal)

1. `services/newsDigest.ts`, `services/transits.ts`, `services/letterEngine.ts`, `factExtraction.ts` (§1).
2. `astro/aspects.ts`: add transit-to-natal aspect detection (orbs per body) if not present.
3. `letterJobs` + `api/processLetterJob.ts` (`onDocumentCreated 'letterJobs/{jobId}'`, mirror
   `processPdfJob.ts`): run `letterEngine.generateLetter`; on success write letter; **on failure**
   set `failed`, retry via re-enqueue (bounded `attempts`), **no credit / no schedule advance**.
4. `api/scheduleLetters.ts` (`onSchedule '*/15 * * * *'`): query `subscriptions` (active, `nextLetterAt<=now`,
   flag-allowed uid) → create `letterJobs/{profileId}__{windowStartISO}` (idempotent). Compute
   `nextLetterAt` (tz-aware, cadence).
5. COGS logging on letter doc; a manual `api/generateLetterNow` (admin/flag) for internal testing.
6. Verify on internal uid: letter generates with relocated houses + live digest, register adapts,
   COGS ≈ $0.16; failures safe; idempotent (no double letter per window).

## 5. Phase 3 — Delivery

1. Callables: `listLetters`, `getLetter`, `markLetterRead`, `setLetterFeedback`, `answerLetterQuestion`
   (free → dossier tap), `askInLetter` (✦1 via `spendFromWallet` + refund-on-failure → Oracle w/ dossier
   + extraction). Export + invokers.
2. Frontend **Letters inbox**: new route/tab; list + sanitized-HTML render (DOMPurify allowlist); tap
   questions (call `answerLetterQuestion`); "ask" box (call `askInLetter`); feedback control. i18n.
3. **Email**: `services/email.ts` (using existing Resend integration) — localized teaser + "Open in
   app" deep link; send from `processLetterJob` after persist; open-tracking pixel; SPF/DKIM/DMARC on natalmystic.com.
4. **PWA**: `web/public/manifest.webmanifest` + service worker (`web/public/sw.js`) + install prompt;
   web-push opt-in → `registerPushSubscription`; push teaser from `processLetterJob`.
5. Verify: letter lands in-app + email (+ push if installed); tap + ✦-ask work; ✦ spend correct.

## 6. Phase 4 — Billing

1. `services/pricing.ts`: cadence×period → priceCents (spec §1); annual 12-for-10; weekly-anchored entry.
2. `api/subscribeAstrologer.ts` → checkout (Stripe global); account-only; store pending
   subscription. Extend `createCheckoutSession` patterns.
3. Webhooks: extend `api/stripeWebhook.ts` (subscription events → set `active`, period dates).
   Idempotent via `purchases/{id}`.
4. **Star crediting**: in `processLetterJob`, on delivered → `grantToWallet(ownerKey, starsPerCycle)`.
5. Lifecycle callables: `cancelSubscription` (period-end; keep dossier+✦), `pauseSubscription`/
   `resumeSubscription`, `setCadence`, `setChannels`, `getAstrologerStatus`. Dunning: a daily cron checks
   `past_due` → grace + nudges → cancel.
6. Frontend **Astrologer hub** (per chart in `ProfileDetail.tsx` or new route): hire (cadence/period/
   channels), name your astrologer (random suggestion), status, cancel/pause; "sign in to hire" for
   anonymous. i18n.
7. Verify: pay (both rails) → letters flow → ✦ credited → cancel keeps data; dunning path works.

## 7. Phase 5 — Privacy & compliance

1. Enforce sensitive-consent gating in `dossier`/`factExtraction`/prompts.
2. `exportUserData` (full JSON), `forgetDossier`, and **account-deletion cascade**
   (`api/deleteAccount` or extend existing): profiles → dossiers/facts → letters → oracleHistory →
   subscriptions (cancel) → consents → pushSubscriptions. Wallet per existing rules.
3. **No RU-resident store** (decided): document accepted 152-FZ gap; all data `us-central1`.
4. Retention: unlimited now (config flag for future).
5. Verify: forget wipes; export complete; deletion cascades.

## 8. Phase 6 — Polish, growth, ops

1. **Free sample letter**: `api/generateSampleLetter` (account-only, one per chart, after onboarding) →
   reuse `letterEngine`; mark sample; becomes first inbox item; CTA to hire. Anti-abuse guard.
2. Prompt iteration using `tasks/letter-test*.mjs` harness (register, length, guardrails, crisis).
3. Win-back (lapsed nudges), annual upsell.
4. **Metrics dashboard** (extend Admin): delivery/open/read, answer rate, dossier growth, ✦ redemption,
   MRR/ARR, churn, gross margin, generation/payment failure rates; cost-anomaly alert.
5. Optional: move digest to **Haiku** (~$0.10/letter) once quality validated.

---

## 9. API contract summary (callables)

| Callable | Input | Output | Phase |
|---|---|---|---|
| getDossier | {profileId} | Dossier | 1 |
| setInterestTags | {profileId, tags[]} | {ok} | 1 |
| updateDossierFact / deleteDossierFact / confirmFact | {profileId, factId,...} | {ok} | 1 |
| forgetDossier / exportUserData | {profileId} | {ok}/{data} | 1/5 |
| (internal) generateLetterNow | {profileId} | {letterId} | 2 |
| listLetters / getLetter | {profileId[,letterId]} | letters | 3 |
| markLetterRead / setLetterFeedback | {profileId,letterId,...} | {ok} | 3 |
| answerLetterQuestion | {profileId,letterId,questionId,optionId} | {ok} | 3 |
| askInLetter | {profileId,letterId?,question} | {answer} (✦1) | 3 |
| registerPushSubscription | {profileId,sub} | {ok} | 3 |
| subscribeAstrologer | {profileId,cadence,billingPeriod,channels} | {url} | 4 |
| getAstrologerStatus | {profileId} | status | 4 |
| setCadence / setChannels | {profileId,...} | {ok} | 4 |
| pauseSubscription / resumeSubscription / cancelSubscription | {profileId} | {ok} | 4 |
| generateSampleLetter | {profileId} | {letterId} | 6 |

Triggers: `scheduleLetters` (cron), `processLetterJob` (onDocumentCreated), webhooks (`stripeWebhook`),
`dunningSweep` (cron).

## 10. Testing strategy
- **Unit:** dossier resolve/supersede, styleProfile EMA, pricing, nextLetterAt (tz/DST), transit aspects.
- **Integration (emulators):** job idempotency, failure→no-credit, ✦ spend/refund, webhook idempotency.
- **Live harness:** `tasks/letter-test*.mjs` for COGS + quality + register; extend for relocation + more
  personas (anxious, EN feminine).
- **Pre-deploy:** `npm run build:functions` + `web` build must pass; emulator smoke.

## 11. Rollout & rollback
- Phases 2–4 behind `featureFlags/personalAstrologer.allowUids` (internal only) until 4+5 done.
- Public launch = flip `enabled` + sample-letter funnel.
- Rollback: flag off (stops scheduling/hiring); in-flight jobs idempotent; billing via provider dashboards.

## 12. Work order (dependencies)
0(model+rules) → 1(services: dossier) → Phase 1 → Phase 2(news/transits/engine/jobs/scheduler) →
Phase 3(delivery) → Phase 4(billing) → Phase 5(privacy) → Phase 6(polish). Email provider + Boris's
current residence + Haiku-vs-Sonnet decision can be resolved in parallel before Phase 2/3.
