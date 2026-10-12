# Personal Astrologer — Production Feature Specification

Status: Draft for approval
Owner: Boris
Target product: AstroWeb (natalmystic.com) — React/Vite + Firebase (Functions Gen2, Firestore, Auth, Storage), Anthropic Claude, Stripe.

---

## 1. Summary

A **Personal Astrologer** is a persistent, per-natal-chart AI persona that a user "hires" via a paid
subscription. It proactively sends a beautifully formatted **letter** at a user-chosen cadence,
weaving the chart's transits with everything it has learned about the person (the **dossier**) and
real-world context (news, weather). The same astrologer answers ad-hoc questions (the existing
Oracle) using that dossier, and learns continuously from every interaction — partly from explicit
tap answers, partly from careful (confirmed) inferences from the user's questions.

The astrologer is the product's retention engine: continuity ("last week you asked about X — how did
it go?") is the thing generic horoscope apps structurally cannot do.

### Core principles (locked decisions)
- **1 astrologer = 1 chart (profile).** An account may "employ" several (self, partner, child).
- **One persona *identity*, adaptive *register*** (NOT one fixed voice for everyone). There is a single
  brand astrologer identity — its astrological worldview, ethics, expertise — and the user **names it
  per chart** (random suggestion offered). But *how* it talks is **learned per chart and evolves over
  time** like a real psychologist/astrologer: seriousness, humor, formality, warmth, brevity, mysticism.
  Serious to a serious question; if the client jokes, it records "playful" in the dossier and starts
  matching that. A single message's **context overrides the learned baseline** — a serious/anxious/
  crisis question is answered seriously even for a usually-playful client ("read the room").
- **One dossier per chart**, shared by the letter engine and the web Oracle.
- **Dossier depth = whatever the user allows.** Facts are collected explicitly (taps) and via careful
  inference from questions, **always with confirmation for sensitive data**.
- **Channels: web app (PWA) + email. No Telegram, no WhatsApp.** Email is a teaser + link; the rich
  HTML letter, the tap-questions, and "ask a question" live **in the app**.
- **Use the place of *living*, not birth, for the letter's context.** Natal planet positions stay
  birth-based (astrologically correct), but **transit house placement, weather, season and regional news
  use the user's current residence** — via the existing relocation fields (`relocationEnabled`,
  `currentPlace/currentLat/currentLng`, see `resolveOwnedChart`). If no current residence is set, ask for
  it in onboarding; do not silently fall back to birthplace.
- **Subscription is account-only.** Hiring an astrologer requires a **signed-in account** (recurring
  billing, dossier persistence, cross-device). Anonymous device users see "sign in to hire". The free
  sample letter (§3.0) is the acquisition step that pulls them to sign in.
- **Interests = tags.** During profile onboarding the user picks interest **tags** (from suggestions)
  and can **add custom** ones. Tags drive the news `web_search` and the analysis pass's relevance.
- **Stars (✦) buying happens on the web only.** À-la-carte star = **$0.99**.
- **Letters are paid with money (subscription), not stars.** Per cycle the user is credited **+1 ✦**
  to their wallet (non-expiring, usable for questions).
- **Both generation passes use Claude Opus 4.8.** (Analysis pass may move to a cheaper model later;
  start on Opus for quality + measurement.)
- **Subscription price = 3 × (report-days per month)**, valued at **$0.50/star inside the
  subscription** (1 analysis + 1 generation + 1 star to the user's wallet per cycle).

### Pricing (locked)
| Cadence | Reports/mo | Monthly price | ✦/mo to wallet |
|---|---|---|---|
| Daily | 30 | $45 | 30 |
| Every 2 days (default) | 15 | $22.50 | 15 |
| Every 5 days | 6 | $9 | 6 |
| Weekly | 4 | $6 | 4 |
| Every 2 weeks | 2 | $3 | 2 |

Default cadence: **every 2 days** (monthly). Annual plan: 12 months for the price of 10; positioned
around the **weekly** cadence as the entry annual tier (push annual — retention 44% vs 17% monthly per
research).

**COGS / margin (Opus 4.8 verified pricing: $5 / MTok input, $25 / MTok output; web search $10/1k):**
**Measured** (real two-pass run, `tasks/letter-test.mjs`): analysis 1073 in / 838 out + generation
1084 in / 1134 out = **$0.060 token COGS**, + ~$0.03 web search ≈ **$0.09/letter floor**. Production
(bigger dossier/history + live web_search retrieved tokens) realistically **$0.12–0.30/letter**.
**Measured with LIVE web_search** (`tasks/letter-test-boris.mjs`, real Boris chart + current news):
analysis 41,335 in / 1,241 out ≈ **$0.238** (the ~41k is retrieved search content) + generation 1,247 in
/ 1,116 out ($0.034) + 2 searches ($0.02) = **$0.292/letter → ~81% margin**. Confirms ~$0.30 as the
realistic ceiling; the driver is web-search retrieved tokens, reducible to ~$0.10–0.15 via §6 mitigation.
**Optimized (production default), measured** (`tasks/letter-test-boris-cheapnews.mjs`): news digest on
**Sonnet 4.6 + web_search** ($0.093 for ~28k retrieved tokens) → Opus analysis ($0.020) → Opus generation
($0.030) + search ($0.02) = **$0.164/letter → ~89% margin**, with **no quality loss** (live hooks:
Anthropic IPO, Moldova HiTech Park). Using **Haiku** for the digest pushes it to **~$0.10 (~93%)**.
At $0.50/star (revenue $1.50/cycle) → **~80–94% gross margin** across all cadences. Prompt caching (chart +
persona + dossier reused across the two passes) lowers it further. Runs also confirmed the adaptive
register + "read the room" override and live, locally-relevant news in the letter.

### Goals
- Recurring revenue with healthy margin, layered on top of the existing one-off ✦ wallet (hybrid).
- A daily/periodic habit hook (the letter) → retention.
- Progressive, consent-based personalization that visibly improves output.

### Non-goals (this feature)
- Human-astrologer marketplace (separate future bet).
- Native mobile apps / Telegram / WhatsApp / SMS (later, demand-driven).
- Synastry letters across two charts (v2; letters are single-chart here).

---

## 2. Terminology

- **Astrologer** — the per-chart persistent persona + its dossier + its subscription.
- **Dossier** — per-chart knowledge graph about the person (structured fields + learned facts).
- **Letter** — a scheduled, generated message (HTML in-app + email teaser).
- **Cycle** — one scheduled letter generation+delivery, defined by the chart's cadence.
- **Stars (✦)** — the existing per-user wallet credits. À-la-carte $0.99; subscription values them at $0.50.

---

## 3. User-facing flows

### 3.0 Free sample letter (acquisition hook)
Before subscribing, a user may generate **one real letter for free** for a chart — to see the actual
product, not a marketing mockup. One per chart (anti-abuse); requires the minimal onboarding taps so the
sample is genuinely personalized. Cost to us ≈ one letter's COGS (~$0.09–0.30) = very cheap CAC. After
the sample, prompt to hire (and the sample itself becomes the first item in the Letters inbox).

### 3.1 Hire (subscribe)
1. From a chart, user opens "Personal Astrologer".
2. Picks **cadence** (daily / 2d / 5d / weekly / 2w) and **billing period** (monthly / annual).
3. Picks **delivery**: in-app always on; email on/off (default on); web-push (prompt to install PWA).
4. Minimal onboarding (2–4 taps): address form / grammatical gender, current city, relationship
   status, and **interest tags** (pick from suggestions + add custom). All optional, each with a
   "why we ask" line. (Interest tags can also be edited any time on the profile.)
   **Hiring requires sign-in** — anonymous users are prompted to sign in here.
5. Consent screen (sensitive-data opt-in + ToS/astrology disclaimer).
6. Pays via Stripe (global). On success → subscription active, first letter scheduled.

### 3.2 Receive & read a letter
- **Email** arrives: short teaser + "Open in app" link (no questions in email).
- **In-app inbox** "Letters from your astrologer": rich HTML letter, up to 3 tap-questions, and an
  "ask a question" box.
- **Web push** (if PWA installed): ping with teaser.
- Reading state and feedback (resonated / missed) tracked.

### 3.3 Profiling loop
- Up to **3 short tap-questions** per letter (options provided). Tapping writes the answer to the
  dossier (free). Skipping is fine.
- **Free-text reply / "ask a question" = an Oracle question, charged ✦1.** Answered with chart +
  dossier; the question text is also analyzed for new facts (proposed → confirmed before storing
  sensitive ones).

### 3.4 Manage
- **Cancel** → stops billing at period end + stops letters; **dossier and ✦ preserved**.
- **Pause** (softer) → suspend letters/billing for a chosen period.
- **"Notes about you"** → view/edit/delete every dossier fact; **"Forget everything"** = delete dossier.
- **Change cadence / delivery channels** anytime (re-price on next period).
- **Buy stars** → web checkout (existing).

### 3.5 States (subscription lifecycle)
`none → active → (paused | past_due) → canceled`. Data states: `active` / `lapsed (remembered)` /
`forgotten (dossier deleted)`. Canceling never deletes data; deletion is a separate explicit action.

---

## 4. Data model (Firestore)

> Owner-scoping reuses the existing model: profiles owned by `ownerUid` (account) or `ownerDeviceId`
> (anonymous); the per-user wallet lives in `wallets/{ownerKey}` (see `functions/src/services/wallet.ts`).

### 4.1 `profiles/{profileId}` (existing — extend)
Add:
- `astrologer?: { enabled: boolean; name: string; createdAt; }` — presence of a hired astrologer.

### 4.2 `dossiers/{profileId}`
Structured summary (fast to inject into prompts):
```
{
  profileId,
  ownerUid,                       // for owner-scoping + GDPR export/delete
  language: "ru" | "en",
  addressForm: "masculine" | "feminine" | "neutral" | null,   // grammatical gender
  locationCurrent: { place, lat, lng, timezone } | null,
  relationshipStatus: "single" | "relationship" | "married" | "complicated" | null,  // sensitive
  hasKids: boolean | null,
  occupation: string | null,
  interests: string[],            // career, money, love, health, creativity, sport, <industry>...
  goals: string[],
  openLoops: string[],            // current situations the astrologer should follow up on
  styleProfile: {                 // learned communication register (each 0..1), evolves via EMA
    humor, seriousness, formality, warmth, brevity, mysticism, emoji
  } | null,
  styleNudge: "more_serious" | "more_playful" | null,   // optional explicit user override
  updatedAt, createdAt
}
```

### 4.3 `dossiers/{profileId}/facts/{factId}` (subcollection — learned facts log)
```
{
  key,                            // canonical key, e.g. "relationshipStatus"
  value,
  source: "onboarding" | "tap" | "inferred",
  sourceRef: string | null,       // letterId/questionId/oracleQuestionId
  sensitive: boolean,
  confirmed: boolean,             // sensitive facts require confirmed=true to be used
  confidence: number,             // 0..1
  createdAt, supersededAt | null
}
```
Provenance + confirmation rules are enforced here; the structured summary (4.2) is the resolved view.

### 4.4 `subscriptions/{profileId}` (one per chart)
```
{
  profileId, ownerUid,
  status: "active" | "paused" | "past_due" | "canceled",
  cadence: "daily" | "every_2_days" | "every_5_days" | "weekly" | "every_2_weeks",
  billingPeriod: "monthly" | "annual",
  provider: "stripe",
  providerRef: string,            // customer/subscription/payment-method id
  priceCents: number,             // computed from cadence + period
  starsPerCycle: number,          // 1
  channels: { inApp: true, email: bool, webPush: bool },
  currentPeriodStart, currentPeriodEnd,
  nextLetterAt,                   // timezone-aware schedule cursor
  pausedUntil | null, canceledAt | null,
  createdAt, updatedAt
}
```

### 4.5 `letters/{profileId}/items/{letterId}`
```
{
  profileId, ownerUid,
  generatedAt, cadence, windowStart, windowEnd,
  brief: { themes[], chosenTransits[], newsHooks[], callbacks[] },   // analysis output (audit)
  html: string,                   // sanitized HTML body (in-app)
  teaserText: string,             // email/push teaser
  language, addressForm,
  questions: [ { id, text, options[], dossierKey, sensitive, answeredOption | null, answeredAt | null } ],
  status: "generated" | "delivered" | "read",
  delivery: { email?: {sentAt, opened?}, webPush?: {sentAt}, inApp: {readAt?} },
  feedback: "resonated" | "missed" | null,
  cost: { model, inputTokens, outputTokens, usd },   // COGS logging
  createdAt
}
```

### 4.6 `letterJobs/{jobId}` (generation jobs — mirrors `pdfJobs` pattern)
Idempotency key = `${profileId}:${windowStart}`. States `queued → running → completed | failed`,
`attempts`, `error`. Drives retries; guarantees one letter per cycle.

### 4.7 `oracleHistory/{profileId}/items/{id}` (server-side — NEW)
The web Oracle currently stores history client-side (localStorage). The dossier analyzer needs a
**server-side** record. Each entry: `{ question, answer, askedAt, channel, model, extractedFacts[] }`.

### 4.8 `pushSubscriptions/{profileId}/items/{id}`
Web-push endpoints (PWA) for delivery.

### 4.9 `consents/{profileId}`
`{ sensitiveDataConsent: bool, consentAt, tosVersion, dataResidencyRegion }` — compliance audit.

### 4.10 `wallets/{ownerKey}` (existing)
Subscription credits `+starsPerCycle` per delivered letter; à-la-carte purchases and question spends
already implemented (`functions/src/services/wallet.ts`).

### Firestore security rules
All reads/writes go through callable Functions (no direct client access to dossiers/letters/
subscriptions). Rules deny client access to these collections; only Admin SDK writes.

---

## 5. Message-generation pipeline

The two passes correspond to the two internal "stars" of cost.

### 5.1 Scheduling
- Cron Function (`scheduleLetters`, every 15 min) queries `subscriptions` where
  `status == active && nextLetterAt <= now` → creates a `letterJob` (idempotent) per profile.
- `nextLetterAt` computed in the chart's timezone, anchored to local morning; advanced by cadence
  after a successful delivery (DST-safe).
- Concurrency: respect Anthropic rate limits; a queue/limiter caps parallel generations.

### 5.2 Generation (`processLetterJob`, onDocumentCreated `letterJobs/{jobId}`)
**Step 1 — Gather inputs**
- Natal chart (cached; existing chart service) — planets birth-based; **houses/ASC/MC relocated to the
  current residence** (existing relocation override).
- Transits for `[windowStart, now]` (window length = cadence; weekly = week's notable transits, not one
  day), placed in the **relocated** houses. Reuse/extend the forecast/transits computation.
- Dossier (4.2) + recent `oracleHistory` + previous letter's unanswered questions + last feedback.
- External context, keyed on **current residence** (not birthplace): news for the user's interest tags +
  region, weather/season. **News digest produced on a cheap model (Sonnet 4.6 / Haiku) via web_search**,
  then passed to the Opus analysis pass (see §6). Cached per (tag, day).

**Step 2 — Analysis pass (Opus 4.8, structured output)**
Produces a JSON `brief`: chosen 1–2 themes, the transits that matter *for this person*, news hooks,
continuity callbacks, and the up-to-3 profiling questions (gap-driven from dossier). Output is schema-
validated (tool/structured output). No prose here.
It also emits **style signals** read from this cycle (did the client joke? was the last question
anxious/serious? how did they react to the previous letter?) → these nudge the dossier `styleProfile`
via a smoothing update (EMA), so a single joke doesn't flip the whole register. The brief carries the
**effective register** for this letter = learned baseline blended with this message's context.

**Step 3 — Generation pass (Opus 4.8)**
Takes `brief` + persona identity + the chart's **effective register** (learned `styleProfile` ⊕ this
message's context, with `styleNudge` applied) + language + `addressForm` (grammatical gender) → writes
the letter: structured by themes, weaving transit → meaning → action → news hook, in the register that
fits *this* client. Context overrides baseline — never flippant on a serious/anxious/crisis topic. Emits:
- `html` (sanitized, constrained template — no scripts),
- `teaserText` (≤ ~200 chars for email/push),
- `questions[]` (≤3, each with options + target `dossierKey` + `sensitive` flag).
Output length budget enforced (~1–1.5k tokens) for COGS + UX.

**Step 4 — Persist & deliver**
Write `letters/.../{letterId}`; deliver to enabled channels (§7). Mark `delivered`.

**Step 5 — Credit + account**
On successful delivery: credit `+1 ✦` to the wallet; log `cost` (tokens, $). Advance `nextLetterAt`.

**Step 6 — Failure handling**
On failure: retry with backoff (max N). **Never** credit the star or advance the schedule on failure.
Billing is independent of generation, so a failed letter never affects the charge. Alert after N fails.

### 5.3 Response handling
- **Tap answer** (`answerLetterQuestion`): write to dossier (sensitive taps are themselves the
  confirmation). Mark question answered.
- **Free-text "ask"** (`askInLetter`): spend ✦1 (existing wallet spend + refund-on-failure pattern),
  answer via the Oracle engine **with dossier injected**, then analyze the question for new facts
  (proposed; sensitive → confirmation prompt).
- **No answer**: re-prioritize that gap for a future letter.

---

## 6. External context (news/weather) + guardrails

- News: via **Claude/Opus `web_search`** (decision) — no separate news API. Searches keyed on the
  user's **interest tags** + location. Billed $10/1k searches + token cost for retrieved content.
- **Cost note (measured):** retrieved web content is the dominant cost — a live run injected ~41k input
  tokens (≈$0.24) into the analysis pass. **Mitigation:** cap `max_uses` (≤2–3) and `max_content_tokens`,
  **or** run the news search on a cheaper model (Sonnet 4.6 / Haiku) and pass Opus a short digest →
  brings COGS from ~$0.29 down to ~$0.10–0.15 with no loss to the Opus-written letter. Cache per
  (tag, day) to dedupe across users.
- Weather/season: by `locationCurrent`.
- **Guardrails (prompt + post-filter):** news is a *light contextual hook* only — exclude tragedy,
  graphic, partisan-political, and doom content; never alarmist. No medical/financial/legal directives;
  serious matters → "consider a professional." Astrology framed as guidance, not determinism.
- **Crisis handling:** if a user's free-text indicates self-harm/crisis, respond safely with resources;
  do not trivialize with astrology.
- **Read the room (overrides learned register):** regardless of a playful learned baseline, a serious,
  anxious, grief, health, or crisis topic is answered seriously. Humor is earned by context, never
  forced. This override is enforced in both the analysis (effective register) and generation prompts.

---

## 7. Channels & delivery

- **In-app inbox** (primary): rich HTML letter, tap-questions, "ask" box. Sanitized HTML render.
- **Email** (teaser + link): provider (Postmark/SendGrid/SES). Localized template; "Open in app" CTA;
  open-tracking. No interactive questions in email.
- **Web push (PWA):** installable PWA + service worker; push teaser. iOS caveat: requires "Add to
  Home Screen" (iOS 16.4+); web push unavailable otherwise — fall back to email.
- Delivery + open/read tracked per letter (§4.5). Retries on transient delivery failures.

---

## 8. Billing

- **Providers:** Stripe (global). Recurring monthly/annual.
  - Stripe: Customer + Subscription; webhook fulfillment (extend existing `stripeWebhook`).
- **Price** computed from cadence + period (table §1). Stars credited per delivered letter, not at
  billing time, so credits track actual service.
- **Cancel** → `canceled`, access until `currentPeriodEnd`, then letters stop; **dossier + ✦ kept**.
- **Pause** → `paused` until `pausedUntil`; no charge, no letters; resumes automatically.
- **Dunning** (failed renewal) → `past_due`, grace window with retries + in-app/email nudges; pause
  letters during past_due; cancel if unresolved.
- **Proration / refunds:** access-to-period-end, no partial refunds by default (configurable for
  annual). À-la-carte ✦ are never voided by subscription changes.
- **Idempotency:** webhook events keyed (reuse `purchases/{sessionId}` pattern) to avoid double-credit.

---

## 9. Stars accounting (money-sensitive — explicit)

- Letters are funded by the **money subscription**, not the wallet. Internal COGS = 2 Opus passes +
  news + delivery (~$0.55 lean). This is **not** charged to the wallet.
- Each delivered letter credits **+1 ✦** to `wallets/{ownerKey}` (non-expiring).
- **Tap answers: free.** **Free-text question: ✦1** (existing spend + refund-on-failure).
- À-la-carte ✦ purchase: **$0.99** (web). Subscription values ✦ at **$0.50** for pricing the plan.
- Canceling/pausing never voids purchased or credited ✦.

---

## 10. AI / prompts

- **Model:** Opus 4.8 (`claude-opus-4-8`) for both analysis and generation, via Secret Manager
  `ANTHROPIC_API_KEY` (existing). **Verified pricing: $5 / MTok input, $25 / MTok output**; web search
  $10/1k. Use **prompt caching** for the stable prefix (persona + chart + dossier) — cache read is
  0.1× input. Note: Opus 4.7+ tokenizer can use ~35% more tokens for the same text — budget for it.
  Analysis pass may later move to Sonnet 4.6 ($3/$15) to cut COGS; start on Opus for the quality test.
- **Analysis prompt:** deterministic-ish; outputs schema-validated JSON brief (themes, transits, hooks,
  callbacks, ≤3 questions with target dossier keys + sensitivity). Inject chart + transits + dossier +
  news + recent history. Token budget enforced.
- **Generation prompt:** single branded persona; respects `language` + `addressForm` (grammatical
  gender — correct verb/adjective forms in RU), `tonePreference`; emits constrained HTML + teaser +
  questions. Guardrails (§6) embedded. Output length capped.
- **Oracle prompt (existing, extend):** inject dossier so answers are person-aware. Keep refund-on-
  failure.
- **Safety:** HTML sanitized (allowlist, no scripts); no PII leakage across users (per-request only;
  no training on user data); disclaimers.
- **Quality/testing:** prompt iteration harness + sample dossiers; measure real token usage to validate
  COGS assumptions before launch pricing.

---

## 11. Personalization / dossier mechanics

- **Sources:** onboarding taps, letter tap-answers, inference from questions.
- **Confirmation rules:** non-sensitive inferred facts stored with low confidence + easy undo;
  **sensitive facts (relationship, health, orientation, religion, kids) require explicit tap/confirm**
  before they are stored as `confirmed` and used in prompts.
- **Gap-driven questions:** analysis pass selects the most valuable unknown dossier keys; never repeats
  recently asked/answered ones.
- **Conflict resolution:** newest confirmed fact supersedes; structured summary (4.2) is the resolved
  view; `confidence` decays for stale inferred facts.
- **Adaptive register (style learning):** the `styleProfile` (humor, seriousness, formality, warmth,
  brevity, mysticism, emoji) is learned from interaction signals and updated with **smoothing (EMA)** so
  it drifts gradually, not on a single message. The **effective register per message = baseline ⊕ this
  message's context**, with a hard rule that serious/anxious/crisis context overrides a playful baseline.
  The user can nudge it explicitly ("be more serious / more playful") via `styleNudge` in "Notes about
  you" — visible control reinforces trust and the "your astrologer gets you" feel.
- **Transparency:** "Notes about you" shows every fact with provenance; per-fact delete; "Forget all";
  and a plain-language line on the current register ("talks to you in a warm, lightly playful tone").

---

## 12. Privacy, consent & compliance

- **Sensitive categories** handled separately: explicit opt-in consent, stored only via confirmation,
  flagged `sensitive`, easily deletable, never used for ads/sharing/cross-user.
- **GDPR (EU):** lawful basis = consent; rights to access, rectify, erase, export (dossier export
  endpoint); clear retention; DPA with subprocessors (Anthropic, email, news, payment).
- **152-FZ (RU) — DECIDED: no RU-resident storage.** We will **not** store any data in Russia. All
  data stays on the existing Firebase (`us-central1`). Consequence (accepted, owner's call): RU-resident
  personal-data localization is not provided; this is a known compliance gap for RU users that we are
  choosing not to address by localizing data. No RU-specific data store is built.
- **AI isolation:** dossier injected per request only; no fine-tuning on user data; Anthropic zero-
  retention/opt-out config where available.
- **Data retention:** letters retained **indefinitely (no limit) for now** (revisit later); deleted on
  "Forget"; account deletion cascades (profiles → dossier → letters → oracleHistory → push subs →
  consents). Wallet handled per existing rules.
- **Disclaimers:** astrology = entertainment/guidance; not medical/financial/legal/psychological advice.

---

## 13. Internationalization

- EN + RU (existing i18n). Letters generated in the user's `language`.
- **Grammatical gender** (`addressForm`) is a first-class dossier field, asked early, injected into the
  generation prompt for correct RU forms ("ты сделал/сделала").
- Localized UI for inbox, onboarding, billing, "Notes about you".

---

## 14. API surface (new/extended Cloud Functions, callable unless noted)

- `subscribeAstrologer({ profileId, cadence, billingPeriod, channels })` → checkout URL (Stripe).
- `getAstrologerStatus({ profileId })` → subscription + next letter + channels.
- `setCadence({ profileId, cadence })`, `setChannels({ profileId, channels })`.
- `pauseSubscription`, `resumeSubscription`, `cancelSubscription`.
- `listLetters({ profileId })`, `getLetter({ profileId, letterId })`, `markLetterRead`, `setLetterFeedback`.
- `answerLetterQuestion({ profileId, letterId, questionId, optionId })` → dossier write (free).
- `askInLetter({ profileId, letterId | null, question })` → Oracle answer (✦1) + fact extraction.
- `getDossier`, `updateDossierFact`, `deleteDossierFact`, `forgetDossier`, `exportUserData`.
- `registerPushSubscription`, `unregisterPushSubscription`.
- `scheduleLetters` (cron), `processLetterJob` (onDocumentCreated), `deliverLetter` (internal).
- Extend `stripeWebhook`.
- All new callables need the Cloud Run public-invoker binding (known deploy step).

---

## 15. Frontend (React/Vite + Tailwind + Deep-Space kit)

- **Astrologer hub** (per chart): hire/manage, cadence + channels, billing status, cancel/pause.
- **Letters inbox**: list + rich HTML letter view; tap-questions; "ask" box; feedback.
- **Onboarding**: 2–4 tap micro-form + consent.
- **"Notes about you"**: dossier viewer/editor; per-fact delete; "Forget".
- **PWA**: manifest + service worker + web-push opt-in + install prompt.
- **Wallet/stars**: existing; surface "free stars from your subscription".

---

## 16. Observability & ops

- **Per-letter COGS logging** (tokens, $) → cost dashboard; alert on cost anomalies.
- **Metrics:** delivery rate, email open rate, in-app read rate, question answer rate, dossier growth,
  ✦ redemption rate, MRR/ARR, churn, gross margin, generation failure rate, payment failure rate.
- **Alerts:** generation failures, delivery failures, payment dunning spikes, cost-per-letter drift.
- **Bump `web/package.json` version each deploy** (project rule).

---

## 17. Edge cases & failure modes

- Generation failure → retry; no star credit; no schedule advance; billing unaffected; alert.
- Payment renewal failure → `past_due` + grace + nudges; letters paused; cancel if unresolved.
- Timezone/DST → schedule in user's tz; idempotent cycle key prevents double-send.
- Cold start (empty dossier) → letters still work (chart + news); prioritize onboarding questions.
- Archived/deleted profile → stop scheduling; cascade delete on profile deletion.
- Cancel mid-cycle → access to period end; dossier/✦ preserved.
- Multiple charts under one account → independent astrologers/subscriptions; shared wallet.
- Star balance: tap = free; free-text = ✦1; insufficient ✦ → prompt to buy (web).
- Sensitive inference without confirmation → never stored as usable.

---

## 18. Security

- Owner-scoping for every callable (existing `ownerCtx`/`ownsProfile`); dossiers/letters/subscriptions
  never client-readable directly (rules deny; Admin SDK only).
- Webhook signature verification (Stripe).
- Secrets in Secret Manager; HTML sanitization; rate limits on `askInLetter`/Oracle.
- New callables: grant `allUsers` Cloud Run invoker on deploy (known requirement).

---

## 19. Delivery plan (phased within the production feature)

1. **Foundation** — data models; server-side `oracleHistory`; dossier + "Notes about you"; consent;
   inject dossier into existing Oracle.
2. **Generation engine** — scheduler + `processLetterJob` + 2-pass Opus + letter storage + COGS logging
   (behind feature flag; internal accounts only).
3. **Delivery** — in-app inbox + email; then PWA + web push.
4. **Billing** — Stripe recurring; cadence/annual plans; star crediting; cancel/pause/dunning.
5. **Privacy controls** — forget/export; sensitive-consent gating; **152-FZ residency decision**.
6. **Polish** — guardrail/prompt iteration to "wow"; win-back; annual nudges; metrics dashboard.

Each phase ships behind a flag; no phase exposed to paying users until billing + privacy controls are
in place.

---

## 20. Acceptance criteria

- A user can hire an astrologer for a chart, pick cadence/period/channels, and pay (Stripe).
- Letters generate on schedule (tz-correct), in correct language + grammatical gender, with ≤3 working
  tap-questions and an "ask" box; delivered to in-app + email (+ push if installed).
- Tap answers update the dossier (free); free-text asks charge ✦1 and answer with dossier context.
- Each delivered letter credits +1 ✦; failures never credit or double-bill.
- Cancel/pause stop letters/billing while preserving dossier + ✦; "Forget" deletes dossier; export works.
- Sensitive facts are stored only after explicit confirmation and are user-deletable.
- Per-letter COGS is logged; margin matches model within tolerance after a real Opus measurement.
- All sensitive collections are inaccessible to clients except via owner-scoped callables.

---

## 21. Decisions log

Resolved:
1. **152-FZ / data residency — DECIDED:** no RU-resident storage; nothing stored in Russia; all data on
   existing Firebase `us-central1` (accepted compliance gap for RU).
2. **Opus 4.8 pricing — VERIFIED online:** $5 / MTok input, $25 / MTok output (web search $10/1k).
   → COGS ≈ $0.20–0.30/letter, **~80% margin** at $0.50/star. (Still validate with a real measured run.)
3. **News — DECIDED:** Claude/Opus `web_search` (no separate news API); cap searches + content tokens.
4. **Persona name — DECIDED:** user names their own astrologer per chart (random suggestion offered);
   one shared voice, no fixed brand name.
5. **Cadence — DECIDED:** default every 2 days (monthly); annual anchored to the weekly tier; 12-for-10.
6. **Letter retention — DECIDED:** unlimited for now.

Still open:
- Validate measured Opus token usage vs the COGS model before launch pricing is finalized.
