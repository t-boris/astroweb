# Admin control of AI models and prompts

Spec: `docs/features/admin-control-of-ai-models-and-prompts/` (REQ-001..007, REQ-009, REQ-011, REQ-012; DEC-001..005, DEC-010..018; Q-001..004, Q-009..012).
Branch: `feat/admin-control-of-ai-models-and-prompts`. Requested by Boris in chat on 2026-10-18.
Answers recorded from Boris: Q-001 -> DEC-010 (Claude + other providers), Q-002 -> DEC-011 (system prompt + user template with placeholders), Q-003 -> DEC-012 (test run), Q-004 -> DEC-013 (no history, reset only), Q-009 -> DEC-014 (OpenAI and Gemini), Q-010 -> DEC-015 (official SDKs, pinned), Q-011 -> DEC-016 (each provider's web search for the news digest), Q-012 -> DEC-017 (one prompt set per task).
Proposed by me, awaiting Boris: DEC-001 (Firestore `aiSettings`, 60 s cache), DEC-002 (model list with per-model request rules), DEC-003 (task registry, byte-identical defaults), DEC-004 (cache keys carry the settings version), DEC-005 (admin edits model, output limit, temperature where supported), DEC-018 (OpenAI Responses with store:false; Gemini generateContent).
Deploy: the CI auto-deploy runs when the PR is merged to main. OPENAI_API_KEY and GEMINI_API_KEY must exist in Secret Manager BEFORE the merge (a bound secret that does not exist fails the deploy).

- [ ] **WP0 Golden tests first (REQ-004):** snapshot the exact system/user text and request parameters every current builder produces (each task, EN and RU, fixed sample data), so the refactor can prove byte-identical defaults.
- [ ] **WP1 Model table + provider layer (DEC-002, DEC-005, DEC-015, DEC-018, REQ-011, REQ-012):** `services/ai/models.ts` (provider, id, label, prices with effective dates, temperature support, thinking rules, output limit, web search); one `generateText` interface with three transports: Claude (existing raw HTTPS, merged from `anthropic.ts` + `claudeRaw.ts`), OpenAI (`openai` SDK, Responses API, `store: false`), Gemini (`@google/genai`, `generateContent`); per-model request rules (drop unsupported params, thinking/reasoning settings and output headroom), continuation on truncation, refusal/safety handling, usage + cost for all providers; key presence = provider available.
- [ ] **WP2 Task registry + settings store (DEC-001, DEC-003, DEC-011, DEC-013, DEC-017, REQ-003, REQ-004, REQ-006):** `services/ai/tasks.ts` with the 10 tasks, their default model/limits and editable texts per language (system, user, plus named parts such as the 4 premium PDF section instructions), placeholders (required/allowed, `{{name}}`); `aiSettings/{taskId}` loader with 60 s cache, validation on read with per-part fallback and warning; settings version (empty for pure defaults).
- [ ] **WP3 Call sites (REQ-002, REQ-007, REQ-011):** Oracle, Oracle in letters, compatibility, deepen, forecast, premium PDF (async job + legacy sync path), letter analysis, letter writing, news digest (web search per provider, DEC-016), fact extraction use the registry + `generateText`; cache keys of deepen/forecast/PDF/news include the settings version; bind OPENAI_API_KEY and GEMINI_API_KEY to the functions that run AI.
- [ ] **WP4 Admin callables (REQ-005, REQ-009):** `adminGetAiSettings` (tasks, models, effective + default values, provider availability), `adminSaveAiSettings` (server validation, updatedBy/updatedAt), `adminResetAiSettings`, `adminTestAiTask` (unsaved settings on a chosen profile; dry run: no stars, no caches, no user content, no settings write); all behind `assertAdmin`.
- [ ] **WP5 Admin UI "AI" tab (REQ-001, REQ-002, REQ-003, REQ-004, REQ-009):** task list; editor with model picker grouped by provider (unavailable disabled, prices), output limit, temperature only where supported, EN/RU texts with placeholder list, default view and reset, save errors listed; test panel (profile, extra input, result with model/tokens/cost/time). English, no help bubbles.
- [ ] **WP6 Tests:** golden byte-identical defaults, model rules per provider, transports with mocked SDKs and HTTPS (incl. store:false, truncation, refusal, thinking not shown), placeholder validation, loader fallback and cache, cache-key versions, admin auth (signed out / non-admin / unverified), dry-run writes nothing; web pure helpers.
- [ ] **WP7 Verify:** functions + web tests, builds, lint at baseline; local admin walkthrough against the emulator/mock backend; acceptance criteria ticked in the spec.
- [ ] **WP8 Ship:** Boris creates the two secrets (commands provided); commits, PR with test plan, CI green, version bump (minor), merge, CI deploy, confirm the live version; live check of the AI tab in the MarkView browser (read-only); one paid test run per provider only with Boris's go-ahead; manual checklist for Boris.

---

# Contextual help tooltips across the UI (issue #13)

Spec: `docs/features/contextual-help-tooltips-across-the-ui/` (REQ-001..005, DEC-001..011, Q-001..009).
Branch: `feat/contextual-help-tooltips-across-the-ui`. Started on the explicit /goal from Boris on 2026-10-13.
Answers recorded from Boris: Q-007 -> DEC-007 (house-system label, no selector), Q-008 -> DEC-008 (AstrologerNotes covered, no-help check is Admin only), Q-009 -> DEC-011 (Oracle indicators, no model name). DEC-009 and DEC-010 are my design decisions and stay proposed until Boris accepts them.
Deploy: the CI auto-deploy runs when the PR is merged to main.

- [x] **WP1 Component (I-1, REQ-005):** shadcn `ui/popover.tsx` (Radix Popover), pure open/close rules (`lib/helpBubble.ts`, `helpFocusScope.ts`, `helpPointer.ts`, `inputModality.ts`), `HelpBubble` (hover with delay, keyboard focus, Escape, tap, "?" on touch for actionable elements, viewport-safe, screen-reader description, no setting, no analytics).
- [x] **WP2 i18n (I-2, REQ-004):** `help.*` in en/ru `translation.json`, key builders in `lib/helpKeys.ts`, EN/RU parity + non-empty + used-keys test, language switch without reload.
- [x] **WP3 Astrology terms (I-3, REQ-001, DEC-007):** planets, signs, houses, aspect types, house systems, orb, exactness; PlanetsTable, AspectsTable, HouseAreasView, AspectFilters, house-system label.
- [x] **WP4 Profile tabs (I-4, REQ-002):** every tab in ProfileDetail, Premium store heading.
- [x] **WP5 Profile controls (I-5, REQ-003):** icon-only buttons (native `title` replaced), Oracle indicators (no model name, DEC-011), stars/Premium indicators, relocation, chart mode.
- [x] **WP6 Other end-user screens (I-6, REQ-003, REQ-005, DEC-008):** Layout, Home, ProfileCreate, Account, Letters, AstrologerHub/Panel, AstrologerNotes; test that Admin has no help bubbles.
- [x] **WP7 Verify:** web tests + build + lint at baseline, local walkthrough, acceptance criteria ticked in the spec.
- [ ] **WP8 Ship:** commits, PR with test plan, CI green, merge, version bump, CI deploy, confirm the live version, live walkthrough in the MarkView browser, manual checklist for Boris.

## Review (before the deploy; the live results are added after it)

- Built: one `HelpBubble` (Radix Popover, no new dependency) used on every covered screen; 180 EN+RU help texts under `help.*`, 9 accessible names under `a11y.*`; version 2.22.0.
- Tests: functions 205, web 121 (new: open/close rules, tab-stop registry, markup for pointer and touch devices, EN/RU parity, text rules, used-keys, no help in Admin, nothing tracked or stored). Builds green. Web lint 8 errors against 9 at `origin/main`, none new.
- Browser (local dev server, mocked callables, MarkView browser): hover with delay, keyboard focus (real Tab key), Escape, language switch without reload, tab tap still switches, `?` button and tap-to-open on a simulated touch device at 375 px, bubble stays inside the viewport, a click into a text field does not open its bubble, no console errors.
- Found and fixed on the way: the first version removed the roving `tabindex` of the tabs (Radix Slot, explicit `undefined`); the touch `?` button crowded the header (corner badge variant); text fields opened their bubble on click; the Houses tab had 245 tab stops (now 46).
- Spec contradictions with the code, asked and answered: no house-system toggle (Q-007), AstrologerNotes is an end-user page (Q-008), no Oracle model label (Q-009).
- Found, not changed (existing UI, for the owner): the annual-plan label says "2 months free" (`hub.annual`) while the price is nine times the monthly price (3 months free) and the badge says "-3 mo"; planet and sign names are English in the Russian UI in several tables; the landing text promises the North Node, which the chart does not contain; `/forecast` sends only the natal chart and the date to the AI (no computed transits); the RU account strings use "ты" while the rest uses "вы"; the header is already crowded at 375 px with a long profile name.
- Known limit: a screen-reader user who browses by element hears the help text only when the term gets keyboard focus (the first element of each term is a tab stop).

---

# Server-side, cross-device storage of profile data (issue #10)

Spec: `docs/features/server-side-cross-device-storage-of-profile-data/` (REQ-001..009, DEC-001..009).
Branch: `feature/cross-device-profile-content`. Plan and defaults approved by Boris on 2026-10-12 (DEC-009).
Deploy: the CI auto-deploy runs when the PR is merged to main.

- [x] **WP1 Backend storage + callables (I-3, I-4, I-6, I-9; REQ-002..005, REQ-007, REQ-009):** `services/profileContent.ts`, `getProfileContent`, `uploadLocalContent`, `deleteProfileContentItem`, cascade in `deleteProfile`, persistence in `askRelationship` / `deepenInterpretation` / `askOracle`, rules test, unit tests.
- [x] **WP2 Account gate on the server (I-1; REQ-006, REQ-004):** `askOracle`, `askRelationship`, `unlockFeature`, `createCheckoutSession` reject deviceId-only callers before any charge; tests.
- [x] **WP3 Client content layer (I-4, I-5, I-7; REQ-002..004, REQ-007, REQ-009):** api client, local-content reader/uploader (pure, tested), `useProfileContent` hook, InterpretationView and RelationshipView read from the server, entry deletion.
- [x] **WP4 Client sign-in gate + notice (I-2, I-8; REQ-006, REQ-008, REQ-001):** `ensureSignedIn` (popup, claimProfiles, no reload), gate on buy / unlock / Oracle / compatibility, "Sign in to save" notice in the profile list.
- [x] **WP5 Verify:** functions and web tests, builds, live anonymous walkthrough in the MarkView browser.
- [x] **WP6 Ship:** PR with test plan, CI green, merge, version 2.21.0, CI deploy, confirm the live version, manual checklist for Boris.

## Review

Shipped as 2.21.0 in PR #11 (merged, issue #10 closed). The CI deploy run 38320211298 succeeded and the live bundle reports `2.21.0`.

- Tests: functions 205, web 80, both builds green; web lint at the baseline of 9 errors.
- Endpoints on production: the 3 new callables have the public invoker and the CORS preflight answers 204. A call with only a deviceId gets `UNAUTHENTICATED` from `askOracle`, `askRelationship`, `unlockFeature`, `createCheckoutSession` and `uploadLocalContent`.
- Anonymous walkthrough on natalmystic.com in the MarkView browser:
  - A legacy local Oracle entry is shown and stays in localStorage.
  - The Oracle button reads "Sign in to ask the Oracle" and opens the sign-in popup. While the popup is open, nothing is charged and the question stays in the box.
  - The compatibility button reads "Sign in to generate the reading".
  - The "Sign in to save" notice appears in English and Russian.
- Not checked here: the signed-in flows, because Google sign-in does not complete in MarkView. They are on the owner's Chrome checklist.
- Deviation from the plan: the planned `useProfileContent` hook became `loadProfileContent` in `lib/contentSync.ts`, which each view calls. Its result also controls whether the view writes content back to the browser (anonymous) or not (signed in).
- Owner walkthrough (Chrome + MarkView, 2026-10-12):
  - Signed-in Oracle answer, compatibility reading, unlock and deep text: each stored on the server.
  - Cross-device: shown on a second device without a browser copy.
  - Single-entry delete: removed on the server.
  - One-time upload of real legacy content (profile `VPq31…`): stored with `source: upload`, no duplicates, stars unchanged.
  - Not checked live (DEC-010): the purchase gate (the Google popup needs the owner) and profile deletion (the UI only archives). Both are covered by unit tests. Feature set to verified.
- Found, older than this release: a claimed profile opened after sign-out shows a generic error instead of asking the visitor to sign in.
- Test data: anonymous profile "Walkthrough Test 3" (`4NnkkxALYciufg1PXJX3`), left on the MarkView browser's device.
(filled in at the end)

---

# Product analytics, purchase funnel and SEO foundation (issue #2)

Spec: `docs/features/product-analytics-purchase-funnel-and-seo-foundation/` (REQ-001..010, DEC-001..016).
Branch: `feature/analytics-funnel-seo-foundation`. Plan approved by Boris on 2026-10-12.
Deploy is manual (`npm run build:functions` then `npm run deploy`); the auto-deploy workflow is already broken (DEC-013).

- [x] **WP1 Consent + analytics core (I-1, REQ-001):** consent store, EN/RU banner, lazy Firebase Analytics after consent, page_view with `/profile/:id` templating, client_id helper, reopen-consent control.
- [x] **WP2 Event taxonomy (I-7, REQ-005):** typed `trackEvent`, nine funnel events at their triggers, uid as user_id, `traffic_type=internal` for admin, PII-free payload builder + test.
- [x] **WP3 Star spend ledger (I-8, REQ-009):** `starSpends` rows written with every spend/refund, four labelled call sites, tests.
- [x] **WP4 Checkout metadata + GA4 Measurement Protocol (I-2, I-3, REQ-002):** client_id + consent into checkout and subscription metadata, `ga4.ts` service (pseudo client_id hash, payload builder, sender), webhook events for purchase / subscription start / renewal / cancel, `livemode`+`walletKey`+`ownerUid` on purchases, tests.
- [x] **WP5 adminStats + Business tab (I-9, REQ-006):** admin-only callable, tested aggregation service, Business tab in `/admin`.
- [x] **WP6 Bilingual routes, privacy pages, footer (I-5, I-10, REQ-003, REQ-004, REQ-008):** `/ru`, `/ru/privacy`, language-from-URL, shared route metadata, static HTML shells plugin, `cleanUrls` + `X-Robots-Tag`, robots.txt, sitemap.xml, JSON-LD, privacy text matching what is collected, footer.
- [x] **WP7 Docs + CI (I-6, I-11, REQ-010):** `docs/ga4-setup-checklist.md`, `.github/workflows/ci.yml`.
- [x] **WP8 Verify:** functions build + tests, web build, privacy text vs implementation, no-consent network check, ad-blocker check.
- [x] **WP9 Ship:** commits, push, PR with test plan, CI green, merge, version 2.20.0, GA4 property + `GA_API_SECRET` + Search Console via MarkView browser, manual deploy, confirm deployed version, browser walkthrough, manual checklist for Boris.

## Review (2026-10-12)

- Shipped as PR #3 (feature), #4 (pin vitest, DEC-017), #5 (CI deploy fix, DEC-018), #6 (paywall dedupe fix, 2.20.1). Live: https://natalmystic.com v2.20.1.
- Verified: functions 173 + web 66 unit tests, builds, Hosting emulator, live browser walkthrough (no request or cookie before consent; events and parameters in the live dataLayer; checkout creates a live Stripe session; GA4 Realtime sees the events), Search Console verified, GA4 funnel exploration created.
- Found and fixed during live verification: Cloud Build npm crash (vitest 4.1), CI `.env`/secret overlap, `adminStats` missing public invoker, `paywall_viewed` dedupe collision.
- Open for the owner: Search Console sitemap status (re-check in ~24 h), GA4 key events, Internal Traffic filter activation, BigQuery link, Business tab check as admin in Chrome, first real purchase to fill the funnel's last step.
- Known limits: subscription charges are not in Business-tab revenue (DEC-012); star-spend data starts at the release (DEC-009); the CI auto-deploy now runs on every push to main.

---

# Deep Space UI reskin (from /Users/boris/Downloads/AstroWeb)

Target: prototype in Downloads/AstroWeb (proto/ + screens/*.png). Cosmic-blue, ice-blue accent,
gold stars, Marcellus + Hanken Grotesk, star/constellation/meteor/mandala background.

- [x] Foundation: re-themed .dark tokens → Deep Space; fonts → Marcellus/Hanken; body gradient;
  art-deco-card → rounded blue card; text-gold-gradient → ice-blue; cosmic keyframes. v1.3.0
- [x] Cosmos background component (StarField/Constellation/Meteors/Mandala) in Layout.
- [x] Nav restyle (AstroWeb logo, blue "Web", blur).
- [x] Home hero (mandala + two-tone serif "Discover Your / Cosmic Blueprint" + blue CTA).
- [x] ProfileCreate: dropped gold astrolabe; eyebrow + serif h1 + cosmic card. v1.3.1
- [x] ProfileDetail: dropped gold astrolabe; eyebrow + serif name header. v1.3.1
- [x] Interpretation blocks → cosmic cards with colored left accent. v1.3.2
- [x] Cards/buttons/tables/tabs all inherit Deep Space tokens (coherent cosmic look app-wide).
- [x] Chart tab two-column layout (wheel + Big Three + Chart Mode cards). v1.4.0
- [x] Underline-style tabs (blue active, gold Premium). v1.4.0
- [x] Header ✦ stars pill (total tokens across device profiles, gold). v1.4.0
- [x] Oracle answer as chat bubble with gold ✦ avatar. v1.4.1
  (Premium uses token packs by design, not the proto subscription plans.)

# Token wallet + Admin panel

## Context / bug fixed
- Stripe webhook pointed at `https://natalmystic.com/stripeWebhook` (the website, not the
  function) → Hosting returned index.html (200) so Stripe thought it delivered but the function
  never ran → paid, nothing unlocked, `purchases` empty. FIXED: endpoint URL → the Cloud Run
  function URL. Restored Boris's compatibility+PDF + recorded the 3 paid sessions.

## Decisions (defaults — adjust if needed)
- **Token wallet:** unified `tokens` (integer) on profile. Price **$0.99/token**.
- **Costs:** oracle question = **1**, compatibility = **2**, interpretation+PDF = **4**.
- **Buy packs:** quantity-based (1, 5, 10, 20) at $0.99 each.
- **Display:** token balance shown as **stars (✦)**.
- **Migration:** existing entitlements → tokens once:
  `tokens += (oracleCredits||0) + 4*(hasPremiumPdf?1:0) + 2*(hasPremiumCompatibility?1:0)`.
- **Auth/admin:** Google sign-in, used ONLY to gate `/admin` for `t.boris@gmail.com`. Regular
  users stay anonymous (deviceId) — no forced login. (Enabling Google provider needs a Firebase
  console step — flagged.)

## Phase A — Token backend
- [ ] `services/tokens.ts`: `spendTokens(profileId, cost)` (Firestore transaction, throws
  `failed-precondition` if balance < cost), `refundTokens(profileId, cost)`, `grantTokens`.
- [ ] `createCheckoutSession`: sell tokens — `{ quantity }` → amount = qty*99, metadata.tokens=qty.
- [ ] `stripeWebhook`: on completed, `tokens += Number(metadata.tokens)` (idempotent); record purchase.
- [ ] `askOracle`: spend 1 (was oracleCredits); refund on failure.
- [ ] `askRelationship`: spend 2 (was hasPremiumCompatibility flag); refund on failure.
- [ ] `enqueuePremiumPdf`: spend 4 (was hasPremiumPdf flag); refund in `processPdfJob` on failure.
- [ ] One-time migration of existing profiles to tokens.

## Phase B — Token frontend
- [ ] Token balance as stars in header / profile.
- [ ] "Buy tokens" UI (pack selector) replacing the 3 per-feature buttons.
- [ ] Gate oracle/compatibility/PDF by balance; show cost ("✦×2"); friendly "not enough tokens".
- [ ] i18n en/ru.

## Phase C — Admin + auth
- [ ] Firebase Auth (Google) — enable provider (console), wire `firebase/auth` in web.
- [ ] `/admin` route: visible only to t.boris@gmail.com (client gate + server enforcement).
- [ ] Admin callables (verify `request.auth.token.email`): list profiles, list purchases/revenue,
  grant tokens to a profile.
- [ ] Login UI (only needed to reach /admin).

## Review
- Phase A (token backend): DONE — tokens wallet, spend/refund, checkout sells tokens by quantity,
  webhook credits tokens. Deployed.
- Phase B (token frontend): DONE — star (✦) display, buy packs ✦1/5/10/20, gating by balance,
  in-app text free. i18n en/ru. v1.1.1.
- Migration: DONE — 33 profiles converted (Boris ✦6).
- Phase C (admin + auth): CODE DONE & deployed (v1.2.0):
  - `api/admin.ts` callables (adminListProfiles/adminListPurchases/adminGrantTokens), gated to
    `t.boris@gmail.com` via `request.auth.token.email` + email_verified. Verified: no-auth → denied.
  - `pages/Admin.tsx` at `/admin`: Google sign-in, revenue/purchases/profiles, grant-tokens.
  - Could NOT enable the Google provider via API (project is basic Firebase Auth, admin/v2/config
    returns 404) → user must enable it in console. That is the ONLY remaining step.

## Remaining user action (owner-only, cannot be done via API)
1. Firebase Console → Authentication → Sign-in method → enable **Google** (support email
   t.boris@gmail.com).
2. Authentication → Settings → Authorized domains → ensure **natalmystic.com** is listed (needed
   for the sign-in popup on the custom domain).
Then `/admin` works immediately — no further deploy needed.

# Ukrainian language (uk)

Scope (approved): UI + AI-generated content. Static PDF template labels fall back to English.

- [x] web: `uk/translation.json` (translated from ru, same keys/placeholders)
- [x] web: i18n `supportedLngs` + UA button in LanguageSwitcher
- [x] web: shared helper mapping UI language -> API language (`ru|en|uk`) + date locale; replace
  the three `startsWith("ru") ? "ru" : "en"` copies; widen `language` types
- [x] functions: `SupportedLanguage` += "uk"; separate `PromptLanguage` (ru|en) for prompt templates;
  uk uses English templates + one explicit "write in Ukrainian" directive (single helper)
- [x] functions: forecast / premium PDF narrative / letters date label handle uk; PDF static labels -> en
- [x] typecheck + build web & functions; bump web version

## Review
- uk UI verified in local prod build (v2.19.0): switcher EN/RU/UA, home page renders in Ukrainian.
- functions: tsc OK, 106 tests pass (new `output-language.test.ts`). en/ru prompt text unchanged,
  so existing AI caches stay valid; uk gets its own cache entries (language is in every cache key).
- Not in scope: static PDF labels for uk (English), letters (dossier language is still always "ru").
- Not deployed yet.
