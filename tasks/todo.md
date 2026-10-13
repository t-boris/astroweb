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
