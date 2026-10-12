# GA4 setup and legal reasoning checklist

Feature: `docs/features/product-analytics-purchase-funnel-and-seo-foundation/` (REQ-002, REQ-005, REQ-007, REQ-010).
Status of each item is marked **done**, **owner step** (needs the property owner) or **later**.

## 1. What exists

| Item | Value |
|---|---|
| GA account | MobileMindAI |
| GA4 property | `astroweb-dev`, property id `558657249` |
| Web data stream | `AstroWeb`, stream id `16114991436`, measurement id `G-0RFR9LGX0L` (public) |
| Firebase link | Enabled in Firebase console > Project settings > Integrations > Google Analytics (done 2026-10-12, as t.boris@gmail.com) |
| Measurement Protocol API secret | Nickname `astroweb-stripe-webhook`. The value lives only in Secret Manager as `GA_API_SECRET`. Never commit or print it. |
| Enhanced Measurement | Off. GA does not add history-change page views; the app sends exactly one `page_view` per route change itself. |

## 2. Configuration in the repository

| Setting | Where | Notes |
|---|---|---|
| `VITE_FIREBASE_MEASUREMENT_ID` | `web/.env.production` | Public. Without it analytics is disabled in that build. |
| `GA_MEASUREMENT_ID` | `functions/.env.astroweb-dev` | Public. Loaded by `firebase deploy`. |
| `GA_API_SECRET` | Secret Manager, bound to `stripeWebhook` | Rotate: create a new secret in GA4 (Admin > Data streams > AstroWeb > Measurement Protocol API secrets), then `firebase functions:secrets:set GA_API_SECRET --project astroweb-dev` and redeploy `stripeWebhook`. |

The browser never loads `firebase/analytics` before the visitor accepts the cookie banner (Basic Consent Mode).

## 3. Events

Browser (only after consent; no names, e-mails or birth data):
`page_view` (page path with profile ids replaced by `:id`), `profile_create_start`, `profile_created`, `chart_viewed` (`tab`), `paywall_viewed` (`feature`), `begin_checkout` (`pack_id`, `value`, `currency`, `items`), `unlock_feature` (`feature`, `stars`), `astrologer_subscribe_start` (`cadence`, `billing_period`), `ai_reading_requested` (`kind`), `letter_opened`.
GA4 `user_id` is the Firebase uid for signed-in users only. The admin's events carry `traffic_type = internal`.

Server (Stripe webhook, Measurement Protocol; always sent for live-mode events): `purchase`, `subscription_start`, `subscription_renewal`, `subscription_cancel`. Test-mode Stripe events are not sent (DEC-014).

Identifiers: with consent = granted in the Stripe session or subscription metadata, the real GA `client_id` (and `user_id` when signed in). Otherwise a pseudo `client_id` that is a SHA-256-derived GA-shaped id of: the checkout session id (purchase, subscription start), the invoice id (renewal), `<subscription id>:<event id>` (cancel). No `user_id`.

## 4. Key events (owner step in GA4: Admin > Key events > New key event)

Mark: `purchase`, `subscription_start`, `profile_created`, `begin_checkout`, `unlock_feature`. Custom events appear in the list only after GA4 has received them at least once.

## 5. Funnel exploration

Name: **Purchase funnel**. Explore > Funnel exploration, closed funnel, breakdown by *Default channel group*.

| Step | Event |
|---|---|
| 1. Visit | `session_start` (or `page_view`) |
| 2. Profile created | `profile_created` |
| 3. Chart viewed | `chart_viewed` |
| 4. Paywall viewed | `paywall_viewed` |
| 5. Checkout started | `begin_checkout` |
| 6. Purchase | `purchase` |

Status: see section 10.

## 6. Internal traffic (admin)

The app sets the default event parameter `traffic_type = internal` while the admin account is signed in. In GA4 the data filter *Internal Traffic* (Admin > Data filters) excludes events with that value. It is in **Testing** state: events are only labelled, not removed.
**Owner step:** open Reports > Realtime / DebugView as the admin, confirm admin events show the test filter name, then Admin > Data filters > Internal Traffic > Activate filter. Activation is irreversible and not retroactive.

## 7. BigQuery export link (owner step)

Admin > Product links > BigQuery links > Link. Choose project `astroweb-dev`, dataset location, daily export (streaming export costs extra). Raw events then land in `analytics_558657249`. Linking requires billing on the project (already Blaze). No custom BI dashboards are built in this feature.

## 8. Search Console

Property `https://natalmystic.com/` (URL prefix), verified with the HTML meta tag `google-site-verification` that the static page shells carry (token in `web/.env.production` as `VITE_GSC_VERIFICATION`). Sitemap: `https://natalmystic.com/sitemap.xml` (4 URLs: `/`, `/ru`, `/privacy`, `/ru/privacy`). Link Search Console to the GA4 property in GA4: Admin > Product links > Search Console links.
Status: see section 10.

## 9. Optional: Looker Studio

If one screen is wanted later, connect Looker Studio (free) to the GA4 property or to the BigQuery export. Not part of this feature; no code.

## 10. Status log (2026-10-12)

| Item | Status |
|---|---|
| GA4 property, web stream, Firebase link | **done** (section 1) |
| Measurement Protocol API secret in Secret Manager, bound to `stripeWebhook` | **done** |
| GA4 receives events from the live site | **done**: Realtime shows `page_view`, `first_visit`, `session_start`, `user_engagement`, `profile_create_start`; the live `dataLayer` showed `profile_created`, `chart_viewed`, `paywall_viewed`, `begin_checkout` with the documented parameters and no PII |
| Funnel exploration **Purchase funnel** (Visit, Profile created, Chart viewed, Paywall viewed, Checkout started, Purchase) | **done**: created in GA4 > Explore, range "This month". Today's data was not processed yet when it was created (Explore lags by hours), so the drop-off chart is still empty. `purchase` can only appear after the first real live-mode payment. |
| Search Console property `https://natalmystic.com/` | **done**: verified automatically with the HTML tag |
| Sitemap `https://natalmystic.com/sitemap.xml` submitted | **submitted**; Search Console showed "Couldn't fetch / 0 discovered pages" right after the first submission. The file is valid (HTTP 200, `application/xml`, 4 URLs, fetched with a Googlebot user agent). **Owner step:** re-check Search Console > Sitemaps after about 24 hours; if it still fails, remove and re-submit it. |
| Search Console linked to GA4 | **owner step** (section 8) |
| Key events (`purchase`, `subscription_start`, `profile_created`, `begin_checkout`, `unlock_feature`) | **owner step** (section 4); the events now exist in GA4 |
| Internal Traffic data filter | **owner step**, left in Testing (section 6) |
| BigQuery export link | **owner step** (section 7) |

Operational facts found while deploying 2.20.0: see section 13.

**Owner acceptance (2026-10-12):** the owner checked the release, confirmed that sign-in works in Chrome and closed the feature (DEC-019). The open owner steps above remain; the sitemap was re-submitted once more after Google's live URL test reported the file as available.

## 11. Checking an event before it goes live

`curl -s -X POST 'https://www.google-analytics.com/debug/mp/collect?measurement_id=G-0RFR9LGX0L&api_secret=<secret>' -d '{"client_id":"1234567890.1700000000","events":[{"name":"purchase","params":{"transaction_id":"t1","value":1,"currency":"USD"}}]}'`
returns `validationMessages`. An empty list means the payload is valid. Without `client_id` it returns `VALUE_REQUIRED` (verified 2026-10-12, F-001 / DEC-005).

## 12. Legal reasoning (not legal advice; have counsel review)

**What is sent without consent and why it is defensible**

1. *Not a device-storage event.* The purchase and subscription events are sent by our server from the Stripe webhook. Nothing is read from or written to the visitor's device, so the consent rule for cookies and similar technologies (ePrivacy art. 5(3)) is not triggered by these events. The browser-side GA4 SDK, which does set cookies, stays off until consent (DEC-002).
2. *Still personal data, so GDPR applies.* The pseudonymous `client_id` is a one-way hash of a Stripe identifier. It cannot be reversed from the hash, but the operator can link it to the payment record in Stripe and Firestore, so it is pseudonymous, not anonymous. The privacy pages say so plainly and never call it anonymous.
3. *Lawful basis.* Legitimate interest (GDPR art. 6(1)(f)): measuring revenue and subscription health of the service. The data is minimal: transaction id, amount, currency, product, cadence. No `user_id`, no e-mail, no name, no birth data, no IP address or user agent of the buyer (the request comes from our server).
4. *Transparency and objection.* `/privacy` and `/ru/privacy` disclose these events, the identifiers and the operator contact. A person can ask `astroweb@mobilemindai.com` to stop attribution.
5. *Revenue is still complete in Firestore.* GA4 is for behaviour and attribution; Stripe and Firestore remain the financial source of truth.
6. *Why not send nothing without consent.* The owner chose near-complete revenue in GA4 (DEC-001). The weaker position, compared with a random single-use id, is accepted knowingly: a deterministic id derived from the transaction id is linkable to the payment record (DEC-005).

**Consent state kept in Stripe subscription metadata (DEC-007)**

- The analytics consent state, the GA `client_id` and the uid (only when consent was granted) are written to the Stripe session and to `subscription_data.metadata` when the astrologer checkout starts.
- Renewal and cancel events read the state from the Stripe subscription metadata, not from the browser. Withdrawing consent on the site later does not change it. This is disclosed on the privacy pages, and the operator can stop attribution on request.
- Subscriptions created before this change have no such metadata and are treated as not consented: their events are anonymous in the sense above (pseudonymous hash, no `user_id`).
- When consent is declined, nothing identifying (no `client_id`, no uid) is written to Stripe metadata, only `ga_consent = denied`.

**Open points for counsel:** whether legitimate interest is accepted for pseudonymous server-side revenue events in the target jurisdictions (EU/RU audience); the transfer mechanism to Google LLC; whether a withdrawal after subscribing should retroactively anonymise later events (option 3 of F-003 was rejected for effort).

## 13. Deploy notes (2026-10-12)

- Cloud Build installs `functions/package.json` without a lockfile. `vitest ^4.0.18` floated to 4.1.x and crashed npm (`edgesOut`); it is pinned to 4.0.18 (DEC-017). Check a change to the functions dependencies in an empty directory: `npm install --package-lock-only`.
- `.github/workflows/firebase-deploy.yml` no longer writes `functions/.env`, because it repeated Secret Manager secrets and Cloud Run rejected the update (DEC-018). A push to `main` deploys again.
- A function first created by an aborted deploy can be left without the public invoker binding (`adminStats` was). Symptom: HTTP 403 with no body from Cloud Run, also on the CORS preflight. Check with `gcloud run services get-iam-policy <name> --region us-central1 --project astroweb-dev`; callables need `allUsers` with `roles/run.invoker` (the function itself enforces admin with `assertAdmin`). Trigger-based functions (`processPdfJob`, `processLetterJob`, `scheduleLetters`) are correctly not public.
- The MarkView embedded browser opens sign-in popups without `window.opener`, so Google sign-in does not complete there. It works in Chrome.
