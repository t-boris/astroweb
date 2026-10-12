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
