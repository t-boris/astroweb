---
type: plan
feature: product-analytics-purchase-funnel-and-seo-foundation
title: Product analytics, purchase funnel and SEO foundation
issues:
  - id: I-1
    title: Consent layer and consent-gated Firebase Analytics initialisation
    summary: "Add a consent store (persisted choice, reopenable) and an EN/RU consent banner via existing i18n that links to /privacy or /ru/privacy according to the current language. Add VITE_FIREBASE_MEASUREMENT_ID and lazy Firebase Analytics init in web/src/lib/firebase.ts that runs only after consent is granted (Basic Consent Mode v2: no GA requests before consent). Add SPA page_view on route changes, expose a helper to read the GA client_id and consent state for checkout calls, and add a 'change cookie settings' control that reopens the choice."
    requirements: [REQ-001]
    decisions: [DEC-001, DEC-002, DEC-004]
    status: in-progress
  - id: I-2
    title: Pass GA client_id, uid and consent into Stripe checkout and subscription metadata
    summary: Extend the checkout-creating callables so the client sends the GA client_id and analytics consent state, and these are written into the Stripe checkout session metadata. In subscribeAstrologer, also write the client_id, the Firebase Auth uid (if signed in) and the consent state into subscription_data.metadata. Consent is fixed at checkout and is not updated later. Existing subscriptions without this metadata are treated as not consented.
    requirements: [REQ-002]
    decisions: [DEC-001, DEC-007]
    status: todo
  - id: I-3
    title: Server-side GA4 Measurement Protocol events from the Stripe webhook
    summary: "In functions/src/api/stripeWebhook.ts, send purchase (transaction_id = Stripe session id, value, currency, items) and subscription start/renewal/cancel events via the GA4 Measurement Protocol for every successful event. With consent = granted, use the stored client_id and user_id; otherwise send no user identifier and use a deterministic pseudo client_id: a truncated SHA-256 of the Stripe identifier, formatted GA-style (session id for purchases; proposed invoice id for renewal and subscription id + event id for cancel, to be confirmed). Retries must produce the same IDs with no duplicates, and no birth data, names or emails may be sent. Verify the client_id requirement against the current GA4 docs and the validation endpoint."
    requirements: [REQ-002]
    decisions: [DEC-001, DEC-005, DEC-007]
    status: todo
  - id: I-4
    title: Bilingual public routes, per-URL meta tags, robots.txt and sitemap
    summary: Add routes /ru and /ru/privacy in App.tsx, where the URL sets the UI language. Manage title, description, OG/Twitter tags, self-canonical and reciprocal hreflang (+x-default) per route on the client. Add noindex to /admin, /account and /profile/*. Add web/public/robots.txt and sitemap.xml listing /, /ru, /privacy and /ru/privacy, plus landing-page structured data.
    requirements: [REQ-003]
    decisions: [DEC-003, DEC-004]
    status: superseded
  - id: I-5
    title: Privacy page (EN/RU) and site footer
    summary: "Implement the /privacy and /ru/privacy page content. It names MobileMind AI as the operator, with astroweb@mobilemindai.com as a mailto link. It describes GA4/Firebase Analytics, cookies, Basic Consent Mode, and the server-side purchase and subscription events: that they are always sent, the identifiers used with consent, and the pseudonymous hash-based client_id without consent (linkable to Stripe/Firestore, never called anonymous). It states that subscription consent is fixed at checkout and that attribution can be stopped by contacting the operator, and includes a control to reopen the consent choice. It does not mention birth data. Add a public footer linking to the privacy page in the current language. Check the text against what the implementation actually sends."
    requirements: [REQ-004, REQ-001]
    decisions: [DEC-004, DEC-005, DEC-007]
    status: todo
  - id: I-6
    title: GA4 setup and legal reasoning checklist (documentation)
    summary: "Write a documentation checklist covering: the funnel exploration over the taxonomy events, key events, BigQuery export link, internal-traffic exclusion, Search Console linking, and the legal reasoning for always-sent server-side events with a pseudonymous transaction-derived client_id and consent state retained in Stripe subscription metadata."
    requirements: [REQ-002]
    decisions: [DEC-001, DEC-005, DEC-007]
    status: todo
  - id: I-7
    title: Funnel event taxonomy wired into the web app
    summary: "Add a typed analytics helper (trackEvent, setAnalyticsUser, page path templating) and fire profile_create_start, profile_created, chart_viewed, paywall_viewed, begin_checkout, unlock_feature, astrologer_subscribe_start, ai_reading_requested and letter_opened at the triggers in REQ-005, with a unit-tested payload builder that cannot carry PII. Set traffic_type=internal for the admin account."
    requirements: [REQ-005]
    decisions: [DEC-002, DEC-006, DEC-010]
    status: todo
  - id: I-8
    title: Star spend ledger (starSpends)
    summary: "Extend wallet spend and refund so every spend writes a starSpends row in the same transaction and every refund writes a negative row; label the four call sites (unlockFeature, askOracle, askRelationship, askInLetter) with feature names."
    requirements: [REQ-009]
    decisions: [DEC-009]
    status: todo
  - id: I-9
    title: adminStats callable and Business tab
    summary: "Add adminStats in functions/src/api/admin.ts (admin-only, period 7d/30d/90d/all, day/week/month UTC buckets, per-currency revenue, purchases, paying users, ARPPU, subscription counts, new profiles, net stars per feature), persist livemode/walletKey/ownerUid on new purchases in stripeWebhook, and add the Business tab to web/src/pages/Admin.tsx. Pure aggregation logic lives in a tested service."
    requirements: [REQ-006]
    decisions: [DEC-006, DEC-009, DEC-012]
    status: todo
  - id: I-10
    title: Static per-route HTML shells, robots.txt, sitemap and noindex headers
    summary: "Replaces the client-only approach of I-4 (DEC-008). Add a shared route metadata module, an inline Vite plugin that emits /ru, /privacy and /ru/privacy HTML (and rewrites index.html for /) with per-route head tags and JSON-LD, firebase.json cleanUrls and X-Robots-Tag headers for private routes, web/public/robots.txt and sitemap.xml, and the Search Console verification meta tag."
    requirements: [REQ-008, REQ-007]
    decisions: [DEC-003, DEC-008, DEC-010]
    status: todo
  - id: I-11
    title: GA4 property, Measurement Protocol secret, Search Console and PR-check workflow
    summary: "Operational work: create the GA4 property and web stream via the MarkView browser, link to Firebase, put the API secret in Secret Manager as GA_API_SECRET, commit the public measurement id, create the funnel exploration, verify Search Console and submit the sitemap, add .github/workflows/ci.yml, bump the version to 2.20.0 and deploy manually."
    requirements: [REQ-007, REQ-010]
    decisions: [DEC-010, DEC-013]
    status: todo
updated: 2026-10-12
---

# Implementation plan — Product analytics, purchase funnel and SEO foundation

## I-1: Consent layer and consent-gated Firebase Analytics initialisation

Add a consent store (persisted choice, reopenable) and an EN/RU consent banner via existing i18n that links to /privacy or /ru/privacy according to the current language. Add VITE_FIREBASE_MEASUREMENT_ID and lazy Firebase Analytics init in web/src/lib/firebase.ts that runs only after consent is granted (Basic Consent Mode v2: no GA requests before consent). Add SPA page_view on route changes, expose a helper to read the GA client_id and consent state for checkout calls, and add a 'change cookie settings' control that reopens the choice.

Requirements: REQ-001
Decisions: DEC-001, DEC-002, DEC-004

## I-2: Pass GA client_id, uid and consent into Stripe checkout and subscription metadata

Extend the checkout-creating callables so the client sends the GA client_id and analytics consent state, and these are written into the Stripe checkout session metadata. In subscribeAstrologer, also write the client_id, the Firebase Auth uid (if signed in) and the consent state into subscription_data.metadata. Consent is fixed at checkout and is not updated later. Existing subscriptions without this metadata are treated as not consented.

Requirements: REQ-002
Decisions: DEC-001, DEC-007

## I-3: Server-side GA4 Measurement Protocol events from the Stripe webhook

In functions/src/api/stripeWebhook.ts, send purchase (transaction_id = Stripe session id, value, currency, items) and subscription start/renewal/cancel events via the GA4 Measurement Protocol for every successful event. With consent = granted, use the stored client_id and user_id; otherwise send no user identifier and use a deterministic pseudo client_id: a truncated SHA-256 of the Stripe identifier, formatted GA-style (session id for purchases; proposed invoice id for renewal and subscription id + event id for cancel, to be confirmed). Retries must produce the same IDs with no duplicates, and no birth data, names or emails may be sent. Verify the client_id requirement against the current GA4 docs and the validation endpoint.

Requirements: REQ-002
Decisions: DEC-001, DEC-005, DEC-007

## I-4: Bilingual public routes, per-URL meta tags, robots.txt and sitemap

Add routes /ru and /ru/privacy in App.tsx, where the URL sets the UI language. Manage title, description, OG/Twitter tags, self-canonical and reciprocal hreflang (+x-default) per route on the client. Add noindex to /admin, /account and /profile/*. Add web/public/robots.txt and sitemap.xml listing /, /ru, /privacy and /ru/privacy, plus landing-page structured data.

Requirements: REQ-003
Decisions: DEC-003, DEC-004

## I-5: Privacy page (EN/RU) and site footer

Implement the /privacy and /ru/privacy page content. It names MobileMind AI as the operator, with astroweb@mobilemindai.com as a mailto link. It describes GA4/Firebase Analytics, cookies, Basic Consent Mode, and the server-side purchase and subscription events: that they are always sent, the identifiers used with consent, and the pseudonymous hash-based client_id without consent (linkable to Stripe/Firestore, never called anonymous). It states that subscription consent is fixed at checkout and that attribution can be stopped by contacting the operator, and includes a control to reopen the consent choice. It does not mention birth data. Add a public footer linking to the privacy page in the current language. Check the text against what the implementation actually sends.

Requirements: REQ-004, REQ-001
Decisions: DEC-004, DEC-005, DEC-007

## I-6: GA4 setup and legal reasoning checklist (documentation)

Write a documentation checklist covering: the funnel exploration over the taxonomy events, key events, BigQuery export link, internal-traffic exclusion, Search Console linking, and the legal reasoning for always-sent server-side events with a pseudonymous transaction-derived client_id and consent state retained in Stripe subscription metadata.

Requirements: REQ-002
Decisions: DEC-001, DEC-005, DEC-007

## I-7: Funnel event taxonomy wired into the web app

Typed analytics helper and the nine funnel events of REQ-005, with a PII-free payload builder and the admin `traffic_type=internal` default parameter.

Requirements: REQ-005
Decisions: DEC-002, DEC-006, DEC-010

## I-8: Star spend ledger (starSpends)

Every star spend and refund writes a `starSpends` row in the same transaction (DEC-009).

Requirements: REQ-009
Decisions: DEC-009

## I-9: adminStats callable and Business tab

Admin-only `adminStats` plus the Business tab; the webhook persists `livemode`, `walletKey` and `ownerUid` on new purchases (DEC-012).

Requirements: REQ-006
Decisions: DEC-006, DEC-009, DEC-012

## I-10: Static per-route HTML shells, robots.txt, sitemap and noindex headers

Supersedes I-4 (DEC-008): build-time HTML per public route, `cleanUrls`, `X-Robots-Tag` for private routes, robots.txt, sitemap.xml and the Search Console meta tag.

Requirements: REQ-008, REQ-007
Decisions: DEC-003, DEC-008, DEC-010

## I-11: GA4 property, Measurement Protocol secret, Search Console and PR-check workflow

Operational work through the MarkView browser (DEC-010), the CI check workflow, version bump and manual deploy (DEC-013).

Requirements: REQ-007, REQ-010
Decisions: DEC-010, DEC-013
