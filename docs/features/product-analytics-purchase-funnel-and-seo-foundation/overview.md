---
type: feature
id: product-analytics-purchase-funnel-and-seo-foundation
title: Product analytics, purchase funnel and SEO foundation
status: verified
owner: Boris Tsekinovsky
created: 2026-10-12
provenance: Created from the quick feature intake
understanding:
  Problem: known
  Target Users: known
  Primary Workflow: known
  Permissions: known
  Failure Scenarios: known
  Data Model: known
  Notifications: n/a
  Security: known
  Analytics: known
  Dependencies: known
  Acceptance Criteria: known
intake: quick
questions_left: 0
issue: "#2"
understanding_notes:
  Problem: Владелец сейчас не видит трафик, поведение пользователей и воронку. У сайта нет базового SEO.
  Target Users: Данными пользуется владелец/админ. Посетители видят только cookie-баннер и страницу /privacy.
  Primary Workflow: "Цепочка: согласие → GA4 → события воронки → серверный purchase из webhook → вкладка Business в /admin. Отдельно: SEO для / и /ru."
  Permissions: Вкладку Business и adminStats видит только админ по проверенному e-mail. Так уже устроен существующий /admin.
  Failure Scenarios: Отказ от согласия и блокировщики уже учтены (DEC-001, DEC-002). Сбои отправки через Measurement Protocol разберёт ревью и реализация.
  Data Model: Данные о деньгах берутся из purchases/subscriptions в Firestore. client_id и согласие передаются в metadata Stripe checkout.
  Notifications: Уведомления в этой фиче не нужны.
  Security: PII в GA не отправляем, аналитику включаем только после согласия. На /privacy оператором указана MobileMind AI, контакт — astroweb@mobilemindai.com.
  Analytics: Таксономия событий, user_id и чек-лист настройки GA4 зафиксированы в scope.
  Dependencies: Firebase Analytics, GA4 Measurement Protocol (нужен API secret), Stripe webhook, Search Console.
  Acceptance Criteria: Критерии приёмки есть у REQ-001–REQ-004. Для вкладки Business и для таксономии событий их уточнят при написании спецификации, вопросы для этого не нужны.
---

# Product analytics, purchase funnel and SEO foundation

## Idea

Add product analytics so the owner can see who visits AstroWeb, where they come from, what they do and for how long, who pays, and where they drop out of the purchase funnel. Use Google Analytics 4 through the Firebase Analytics SDK, which fits the project's Firebase-only constraint. Purchases are sent server-side from the Stripe webhook so revenue is reliable. Add a small "Business" tab in the existing /admin page with KPIs taken from Firestore (the source of truth for money). Add the SEO basics: meta tags, Open Graph, sitemap, robots.txt, Search Console. "CEO" in the request is read as "SEO".

## Problem

The owner currently has no visibility into traffic or user behaviour. No analytics SDK is installed, firebaseConfig has no measurementId and no events are tracked. Revenue is only visible as a raw purchases list in /admin. Search engines see an empty SPA shell with the title "AstroWeb" and no description, OG tags, sitemap or robots.txt. Without data there is no way to tell which step loses users (profile creation → chart → paywall → Stripe checkout → payment) or which channels bring paying users.

## Scope

IN:
1) GA4 via Firebase Analytics (firebase/analytics) in web/src/lib/firebase.ts, plus VITE_FIREBASE_MEASUREMENT_ID; SPA page_view on every route change in App.tsx/Layout.
2) Cookie/consent banner using Google Consent Mode v2 in Basic mode: Firebase Analytics/GA4 is not initialised and sends no requests until the user accepts analytics. Banner text in EN and RU via the existing i18n. The banner and a site footer link to a new public privacy page at /privacy (EN) and /ru/privacy (RU) that describes GA4/Firebase Analytics, the cookies used, consent and how to change it, and the server-side purchase/subscription events sent without consent with a pseudonymous identifier derived from the transaction id. It also states that analytics consent is recorded when a subscription starts and applies to its later renewal and cancel events, and how to ask the operator (astroweb@mobilemindai.com) to stop attribution.
3) A fixed event taxonomy for the funnel: profile_create_start, profile_created, chart_viewed (tab), paywall_viewed (feature), begin_checkout (packId/value), unlock_feature (feature, stars spent), astrologer_subscribe_start, ai_reading_requested, letter_opened. Also GA4 user_id = Firebase Auth uid when signed in, otherwise no PII.
4) A server-side `purchase` event (transaction_id = Stripe session id, value, currency, items) sent from functions/src/api/stripeWebhook.ts via the GA4 Measurement Protocol, together with the subscription start, renewal and cancel events. The GA client_id and the analytics consent state travel in the Stripe checkout metadata. For the astrologer subscription, subscribeAstrologer also writes the GA client_id, the Firebase Auth uid (if signed in) and the consent state into subscription_data.metadata; the webhook reads them from the Stripe subscription metadata for renewal and cancel events, and the consent state at subscription checkout applies to all of that subscription's events (later consent withdrawal does not update it). These events are always sent: when consent = granted is not in the metadata, the event is sent with a pseudo client_id derived deterministically from a Stripe identifier for that event, e.g. the Stripe session id for checkout purchases (a one-way hash, e.g. truncated SHA-256 formatted as a GA-style client_id) and without user_id or any other user identifier (anonymous transaction, not attributed to channels or funnel steps; webhook retries produce the same client_id and transaction_id). With consent granted, the real GA client_id from the metadata is used.
5) A GA4 setup checklist (documented, not code): a funnel exploration with the steps above, key events, a BigQuery export link, excluding the admin's own traffic, and the legal reasoning for sending server-side purchase/subscription events without consent with a pseudonymous client_id derived from the transaction id (linkable to the payment record in Stripe/Firestore).
6) A "Business" tab in /admin (web/src/pages/Admin.tsx + a new adminStats callable in functions/src/api/admin.ts): revenue by day/week/month, purchase count, paying users, ARPPU, active/canceled/past_due astrologer subscriptions, new profiles per period, and stars spent per feature. Counting rules: revenue is reported per currency separately, without conversion; day/week/month buckets are computed in UTC; test-mode purchases (livemode=false) are excluded (the webhook persists livemode in purchases); a paying user is identified by ownerUid, falling back to deviceId when ownerUid is absent.
7) SEO basics: two public landing URLs, / (EN) and /ru (RU, the URL sets the UI language), each with its own title/description, OG/Twitter tags, canonical and reciprocal hreflang links; the same bilingual pattern for /privacy and /ru/privacy; robots.txt, sitemap.xml listing /, /ru, /privacy and /ru/privacy, noindex on /admin, /account and /profile/*, structured data for the landing page, and Google Search Console verification.
OUT: a custom-built analytics backend; session recording or heatmaps (Microsoft Clarity/Hotjar could be a follow-up); SSR/prerender migration; A/B testing; ad pixels (Meta/TikTok); Yandex.Metrica (it can be added later behind the same consent layer).

## Analysis

Project facts:
- Stack: React + Vite SPA on Firebase Hosting, Cloud Functions and Firestore (.planning/PROJECT.md). The constraint "Firebase only, unified Google ecosystem" favours GA4 via Firebase Analytics.
- web/src/lib/firebase.ts initialises app, Firestore, Functions and Auth. It has no Analytics and no measurementId. A grep for gtag/analytics/plausible/posthog/metrika finds nothing in the source.
- web/index.html has only <title>AstroWeb</title>: no meta description, no OG tags. web/public holds only sw.js, icon.svg and manifest.webmanifest, so there is no robots.txt or sitemap.xml.
- Routes (web/src/App.tsx): /, /profile/new, /profile/:id(/edit|/notes|/letters|/astrologer), /account, /admin. Only "/" is a natural public/SEO landing page. Profile pages are private, per-user data.
- Monetisation already exists. There are Stripe star packs (functions/src/api/createCheckoutSession.ts, called from web/src/pages/ProfileDetail.tsx:396). Feature unlocks are paid with stars (functions/src/api/unlockFeature.ts, called from InterpretationView.tsx:678). There is an astrologer subscription (functions/src/api/subscribeAstrologer.ts, AstrologerPanel.tsx:80). The wallet lives in functions/src/services/wallet.ts.
- functions/src/api/stripeWebhook.ts writes `purchases/{sessionId}` idempotently (amountTotal, currency, tier, tokens, customerEmail, createdAt). It also maintains `subscriptions` status (active/past_due/canceled). This is the natural hook for server-side purchase events.
- functions/src/api/admin.ts already has adminListProfiles, adminListPurchases (sums revenueCents over max 1000 docs, client-side), adminListUsers and grants, gated to a hard-coded verified admin email. web/src/pages/Admin.tsx renders them. It has no time-series, funnel or KPI aggregation.
- Users are anonymous (deviceId in localStorage) or Firebase Auth accounts (ownerUid). Both identities exist.
AI inferences:
- Client-side purchase tracking would lose events: users close the tab after the Stripe redirect, and ad blockers interfere. Server-side Measurement Protocol from the webhook is more reliable. The client_id must be passed through checkout metadata to join it to the session.
- GA4 numbers will be lower than real traffic (ad blockers, declined consent). Revenue in /admin from Firestore/Stripe must therefore stay the financial source of truth, and GA is for behaviour and the funnel.
- A client-only SPA gets limited SEO. Static meta, OG, sitemap and a crawlable landing page cover most of the value. Full prerender/SSR is a separate decision.
- Birth data counts as personal data. It must never be sent to GA (no names, dates, places or emails in event params).

## Assumptions

Made by the AI where the request left a choice open; correct them in the discussion.

- 'CEO' in the request means SEO (speech-to-text artefact).
- GA4 via Firebase Analytics is the primary tool; no paid analytics product (Mixpanel/Amplitude/PostHog) in this iteration.
- The audience includes EU/RU users, so a consent banner with Consent Mode v2 is required before any analytics cookies are set.
- Stripe/Firestore remains the financial source of truth; GA revenue is used only for attribution and the funnel.
- The admin KPI tab reads aggregates on demand from Firestore (no scheduled rollups) because volumes are small (current admin queries already cap at 500–1000 docs).
- No personal or birth data (name, birth date/place, email) is sent to GA; user_id is the Firebase uid only.
- Only '/', '/ru', '/privacy', '/ru/privacy' (and any future marketing pages) are indexable; all /profile/*, /account and /admin are noindex.
- The admin's own traffic is excluded from GA (internal traffic filter or skipping init when the admin is signed in).
- BigQuery export is enabled for raw-event access but no custom BI dashboards are built now.

## Acceptance Criteria

- [x] Given the user has not accepted the consent banner, when any page loads, then no GA cookies are set and no analytics hits are sent (verified in GA DebugView / network tab).
- [x] Given consent is accepted, when the user navigates between SPA routes, then exactly one page_view per route change appears in GA4 DebugView with the correct page_path (profile IDs replaced by a template such as /profile/:id).
- [x] Each funnel event (profile_create_start, profile_created, chart_viewed, paywall_viewed, begin_checkout, unlock_feature, astrologer_subscribe_start) fires once at the defined trigger with the documented parameters and no PII.
- [x] Given a successful Stripe star-pack checkout, when stripeWebhook processes checkout.session.completed, then a GA4 'purchase' event is sent server-side with transaction_id = Stripe session id, value and currency matching purchases/{id}, and a redelivered webhook does not send a duplicate.
- [x] Subscription start, renewal (invoice.payment_succeeded) and cancellation (customer.subscription.deleted) each produce a server-side GA4 event.
- [ ] A GA4 funnel exploration 'Visit → Profile created → Chart viewed → Paywall viewed → Checkout started → Purchase' is configured and documented, and shows step-by-step drop-off. — pending (DEC-019): the exploration exists; Explore had not processed any data yet, the last step needs the first real payment
- [x] The /admin Business tab shows, for a selectable period (7d/30d/90d/all): revenue, number of purchases, paying users, ARPPU, new profiles, active/past_due/canceled subscriptions and stars spent per feature, and its revenue, per currency, equals the sum of purchases.amountTotal of live-mode (livemode=true) purchases in that currency for that period, with periods bucketed in UTC.
- [x] The adminStats callable rejects any caller who is not the verified admin (same assertAdmin rule as existing admin functions).
- [x] The landing pages / (EN) and /ru (RU) served by Hosting each contain their own localized title, meta description, canonical, Open Graph and Twitter tags and reciprocal hreflang links; /robots.txt and /sitemap.xml (listing /, /ru, /privacy, /ru/privacy) are served; the consent banner and footer link to /privacy (or /ru/privacy); /admin, /account and /profile/* carry noindex.
- [ ] The site is verified in Google Search Console and the sitemap is submitted without errors. — pending (DEC-019): ownership is verified and the sitemap is submitted, Search Console still shows 'Couldn't fetch' (empty 'Last read'); Google's live test says the file is available
- [x] With analytics blocked by an ad blocker, all app features including checkout continue to work without errors.
