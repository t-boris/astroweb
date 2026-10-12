# Personal Astrologer — Implementation Plan

Derived from `tasks/personal-astrologer-spec.md`. Phases ship behind a feature flag; nothing is exposed
to paying users until billing (Phase 4) and privacy controls (Phase 5) are in place. Every deploy: grant
`allUsers` Cloud Run invoker on new callables, and bump `web/package.json` version.

Legend: `[F]` functions/backend · `[W]` web/frontend · `[I]` infra/ops.

---

## Phase 1 — Foundation (data + dossier + Oracle becomes person-aware)

Goal: the dossier exists, grows, is editable, and already improves the existing Oracle. No letters yet.

- [ ] [F] Add Firestore collections + Admin-only access (rules deny client reads):
      `dossiers/{profileId}` (+ `facts` subcollection), `oracleHistory/{profileId}/items`, `consents`.
- [ ] [F] `dossier` service: read structured summary; append fact (provenance, sensitive, confirmed,
      confidence); resolve summary from facts; conflict/supersede + confidence decay.
- [ ] [F] **Server-side oracle history**: write each Oracle Q/A to `oracleHistory` (today it's only
      client localStorage). Extend `api/askOracle.ts`.
- [ ] [F] **Inject dossier into the Oracle**: extend the Oracle prompt (`services/anthropic.ts` +
      `askOracle.ts`) with the dossier summary so answers are person-aware.
- [ ] [F] **Fact extraction pass**: after an Oracle answer, a cheap-model pass extracts candidate facts
      → store non-sensitive (low confidence, undoable); sensitive → pending-confirm.
- [ ] [F] Callables: `getDossier`, `updateDossierFact`, `deleteDossierFact`, `forgetDossier`,
      `confirmFact`, `setInterestTags`, `exportUserData`.
- [ ] [W] **Interest tags** UI on the profile: pick from suggestions + add custom; editable anytime.
- [ ] [W] **Onboarding micro-form** (address form/grammatical gender, current city via existing
      PlaceSearch/relocation, relationship status, interest tags) — all optional, "why we ask".
- [ ] [W] **"Notes about you"** screen: list facts w/ provenance; per-fact edit/delete; "Forget all";
      register line; consent toggle for sensitive data.
- [ ] [F] **Account-only gate** helper: astrologer features require `request.auth.uid` (not device).
- [ ] [I] Deploy; verify dossier round-trips; Oracle answers reference known facts.

Exit: a signed-in user can set interests/onboarding, the Oracle answers using the dossier, and every
fact is visible/editable/deletable.

---

## Phase 2 — Generation engine (internal, flagged)

Goal: generate a letter end-to-end for internal accounts; measure real COGS. No delivery/billing yet.

- [ ] [F] **News digest** module: `web_search` on **Sonnet 4.6 (or Haiku)**, keyed on interest tags +
      **current residence** (relocation), `max_uses ≤ 2`. Returns a compact JSON digest. Cache per
      (tag, day). (Validated: $0.093 Sonnet / ~$0.03 Haiku.)
- [ ] [F] **Transit computation** for the cadence window, placed in **relocated houses** (reuse
      `resolveOwnedChart` relocation override; natal planets birth-based). Prefer computing aspects in
      code (extend `astro/aspects`) for precision rather than leaving it to the model.
- [ ] [F] **Analysis pass (Opus 4.8)**: inputs = chart + transits + dossier + digest → schema-validated
      `brief` (themes, chosen transits, news hooks, callbacks, effectiveRegister, ≤3 questions). Emits
      **style signals** → EMA-update `styleProfile`. Robust JSON extraction.
- [ ] [F] **Generation pass (Opus 4.8)**: `brief` + persona identity + effective register
      (`styleProfile ⊕ context`, `styleNudge`) + language + grammatical gender → `{teaser, html,
      questions}`. HTML sanitized (allowlist, no scripts). Length-budgeted. "Read the room" override.
- [ ] [F] **letterJobs** collection + `processLetterJob` (`onDocumentCreated`, mirrors `processPdfJob`):
      idempotency key `${profileId}:${windowStart}`; retries/backoff; **no star credit / no schedule
      advance on failure**.
- [ ] [F] **Scheduler** `scheduleLetters` (cron ~15 min): find `subscriptions` due (`nextLetterAt<=now`,
      active) → enqueue jobs; `nextLetterAt` in user tz (local morning), DST-safe; cadence-driven.
- [ ] [F] **COGS logging** per letter (`cost{model,inputTokens,outputTokens,usd}` on the letter doc).
- [ ] [F] `letters/{profileId}/items/{letterId}` writes; feature flag (internal uids only).
- [ ] [I] Deploy; generate for internal accounts; verify COGS ≈ model and register adaptation.

Exit: letters generate on a schedule for internal accounts, correct language/gender/relocation, COGS
logged, failures safe.

---

## Phase 3 — Delivery (in-app + email + PWA push)

- [ ] [W] **Letters inbox** ("Letters from your astrologer"): list + rich sanitized-HTML letter view;
      ≤3 tap-questions; "ask a question" box.
- [ ] [F] `listLetters`, `getLetter`, `markLetterRead`, `setLetterFeedback`,
      `answerLetterQuestion` (free → dossier), `askInLetter` (✦1 → Oracle + extraction).
- [ ] [F] **Email delivery**: use existing `Resend` integration (`services/email.ts`) — teaser + "Open in
      app" link, localized; SPF/DKIM/DMARC on natalmystic.com; open tracking; deliver on `processLetterJob`.
- [ ] [W] **PWA**: manifest + service worker + install prompt; web-push opt-in.
- [ ] [F] `registerPushSubscription`/`unregisterPushSubscription`; push teaser on new letter.
- [ ] [F] Delivery + open/read tracking per letter; transient-failure retries.
- [ ] [I] Deploy; confirm a letter lands in-app + email (+ push if installed).

Exit: a generated letter reaches in-app inbox + email; tap-answers and ✦-questions work.

---

## Phase 4 — Billing (Stripe) — makes it real

- [ ] [F] **Plan pricing** from cadence + period (table in spec §1); annual = 12-for-10; weekly-anchored
      annual entry tier.
- [ ] [F] `subscribeAstrologer` → checkout: **Stripe** (global). Account-only.
- [ ] [F] Recurring: Stripe Subscription.
      Webhooks (extend `stripeWebhook`, signature-verified), idempotent
      (reuse `purchases/{id}` pattern).
- [ ] [F] **Star crediting**: +1 ✦ to `wallets/{ownerKey}` on each delivered letter (not at billing).
- [ ] [F] Lifecycle: `cancelSubscription` (period-end, keep dossier+✦), `pauseSubscription`/
      `resumeSubscription`, **dunning** on `past_due` (grace + retries + nudges; pause letters).
- [ ] [F] `setCadence`, `setChannels`, `getAstrologerStatus`.
- [ ] [W] **Astrologer hub** (per chart): hire (cadence/period/channels), status, cancel/pause, name
      your astrologer (random suggestion).
- [ ] [I] Deploy + grant invokers; test full pay → letters → cancel keeps data.

Exit: a user can pay (both providers), receive letters, get ✦ credited, and cancel/pause without losing
dossier or ✦.

---

## Phase 5 — Privacy controls & compliance

- [ ] [F] **Sensitive-data consent gating**: sensitive facts unusable until explicit confirm; consent
      record. Enforce in extraction + prompts.
- [ ] [F] **Forget / export**: `forgetDossier` (delete dossier+facts), `exportUserData` (GDPR).
- [ ] [F] **Account-deletion cascade**: profile → dossier → letters → oracleHistory → push subs →
      consents (wallet per existing rules).
- [ ] [I] **No RU-resident storage** (decided): keep all data on `us-central1`; document the accepted
      152-FZ gap; do not build a RU store.
- [ ] [F] Retention: letters unlimited for now (flag for future limit).
- [ ] [I] Verify: forget wipes dossier; export returns all data; deletion cascades.

Exit: full user control over personal data; compliance posture documented.

---

## Phase 6 — Polish, growth & ops

- [ ] [W][F] **Free sample letter** (acquisition): one real letter free per chart (after onboarding),
      anyone can try → prompts sign-in/hire; becomes first inbox item. (§3.0)
- [ ] [F] **Prompt iteration** to "wow": tune register, length, news guardrails (no doom/partisan),
      crisis handling; A/B on tone. Use the test scripts as the harness.
- [ ] [F][W] **Win-back**: "your astrologer still remembers you" on lapsed; annual upsell nudges.
- [ ] [I] **Metrics dashboard**: delivery/open/read rates, question-answer rate, dossier growth, ✦
      redemption, MRR/ARR, churn, gross margin, generation/payment failure rates; cost-anomaly alerts.
- [ ] [F] Optional COGS lever: move news digest to **Haiku** (~$0.10/letter) once quality validated.

Exit: launch-ready acquisition funnel, tuned quality, observability, healthy margin.

---

## Cross-cutting
- Feature flag gates Phases 2–4 until 4+5 complete.
- Security: owner-scoping on every callable (`ownerCtx`/`ownsProfile`); deny client reads on
  dossiers/letters/subscriptions; webhook signature verification; rate-limit `askInLetter`; sanitize HTML.
- Reuse: `services/wallet.ts`, `resolveOwnedChart` (relocation), `astro/*`, `processPdfJob` job pattern,
  Stripe scaffolding, i18n.
- Test harness already exists: `tasks/letter-test.mjs`, `letter-test-boris.mjs`,
  `letter-test-boris-cheapnews.mjs` (synthetic, live-search, and cheap-news-digest variants).

## Open items (not blocking start)
- Confirm Boris's **current residence** for accurate transit houses/weather/news (test used birthplace).
- Decide Haiku vs Sonnet for the news digest after a quality pass.
