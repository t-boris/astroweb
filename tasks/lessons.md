# Lessons

## Cloud Functions return 429 "Rate exceeded" / "no available instance" right after enabling billing

**Symptom:** After enabling Blaze billing on `astroweb-dev` and deploying, every callable
(`listProfiles`, `createProfile`, ...) returned HTTP 429 "Rate exceeded" from Google Frontend.
In the browser this surfaced as a misleading **CORS error**
("No 'Access-Control-Allow-Origin' header is present") because the 429 is rejected at the edge
before the function runs, so no CORS header is attached. Cloud Run logs showed
`The request was aborted because there was no available instance`.

**Root cause:** Cloud Run revisions built during the billing-disabled → propagating window got
wedged on infra that still treated billing as off. Quota was healthy (cpu_allocation = 200000
in us-central1) and billing was linked — so it was NOT a quota/budget cap, and a plain
`firebase deploy --only functions` did nothing ("No changes detected" — it dedupes on source hash).

**Fix:** Force a brand-new Cloud Run revision out-of-band (a label change is enough):
```
gcloud run services update <service> --region us-central1 --update-labels forceredeploy=t$(date +%s) --quiet
```
Service names are the lowercased function names (createProfile -> createprofile). Recovery is
immediate (HTTP 200 within ~15s). Do this for all services the frontend calls.

**Diagnostic tells:**
- 429 from `server: Google Frontend` = edge throttle, request never reaches the function.
- Cloud Run "no available instance" warnings *stop* appearing while probes still 429 = requests
  blocked at the edge, not the backend.
- Verify recovery with an OPTIONS preflight (expect 204 + `access-control-allow-origin`) and a
  real createProfile -> getProfile -> deleteProfile round-trip.

## Firestore rejects `undefined` field values

`.add()` / `.set()` / `.update()` throw "Cannot use undefined as a Firestore value" if any field
(including nested array/object fields) is `undefined`. Helpers that return `string | undefined`
(e.g. `optionalString`) must have their result OMITTED from the doc when undefined — do not write
the key. Seen when storing premium PDF report sections (`category`/`detail`) in `pdfJobs`.

## Long callables (>70 s) need the async job pattern, not a bigger timeout

Premium PDF generation (4 parallel Claude narratives ~140 s) exceeded the Firebase callable
client default of 70 s, so the browser aborted with "Failed to generate PDF" while the server
kept working. Fix = async job: client `enqueuePremiumPdf` → `pdfJobs/{jobId}` doc →
`processPdfJob` Firestore trigger (timeoutSeconds 540, memory 1GiB, secret ANTHROPIC_API_KEY)
renders + uploads to GCS bucket `astroweb-dev-premium-pdfs` → client polls `getPremiumPdfJob`
which returns the PDF as base64. Storage was NOT provisioned by default — created the bucket via
gcloud and granted the compute SA `roles/storage.objectAdmin`. Also: per-section
`maxOutputTokens` was 3000, which truncates Russian (~2.5-3.5 tok/word) and triggered the slow
continuation loop — raised to 8000 for a single clean pass.

## Stripe webhook must point at the FUNCTION URL, not the website

Symptom: payments succeeded (Stripe `payment_status=paid`) but nothing unlocked and `purchases`
was empty; Stripe showed `pending_webhooks=0` (looked "delivered"). Cause: the webhook endpoint
URL was `https://natalmystic.com/stripeWebhook` — the Firebase Hosting domain, which serves
`index.html` (HTTP 200) for any path, so Stripe thought it delivered but the function never ran.
Fix: point the endpoint at the Cloud Run function URL
`https://stripewebhook-kwzmv6ni5q-uc.a.run.app` (updated via Stripe API, keeps the same signing
secret). To restore already-paid sessions: read `checkout/sessions` from Stripe, grant
entitlements, and write idempotent `purchases/{session.id}` docs. Recovery scripts: /tmp/*.mjs
pattern (Stripe API + Firestore REST with `gcloud auth print-access-token`).

## Enforce paywalls on the backend + refund consumable credits on failure

Two billing bugs found in the AI endpoints:
- `askRelationship` (compatibility) enforced the paywall only in the UI — the function never
  checked `hasPremiumCompatibility`, so it ran for free. Fix: check the flag right after
  `resolveOwnedChart` (which returns `profile`), before any token spend.
- `askOracle` deducted the credit BEFORE generating, and the catch didn't refund — a Claude
  failure cost the user a credit with no answer. Fix: refund `oracleCredits` (+1, best-effort)
  in the catch. Pre-deduct is kept (prevents races/negative balances); refund covers failures.
General rule: never trust the frontend for entitlement checks; charge consumables so a failed
generation is not billed.

## Never regenerate identical AI output — cache it (token cost)

Premium PDF and "dig deeper" (deepenInterpretation) are expensive Claude calls. Both now cache
server-side keyed by a sha256 of all inputs that affect output (profile birth identity + relocation
+ language + sections / focusTopic + baseInterpretation):
- PDF: `premiumPdfCache/{key}` doc → PDF at stable path `premium-pdfs/cache/{key}.pdf`. enqueue
  returns a pre-`completed` job on hit (worker guard `if status !== "pending" return`). Cache miss
  also verifies the storage object still exists (bucket has 7-day lifecycle).
- Deepen: `deepInterpretationCache/{key}` doc → `{ text, model }`. Ownership checked via
  getProfileById BEFORE cache read so a hit still can't leak across owners.
Helper: `services/aiCache.ts` `hashCacheKey(parts)`. Verified: 2nd identical call = 0 Claude calls.

## Local dev requires the Firebase emulators running

`web/src/lib/firebase.ts` forces all calls to emulators when `import.meta.env.DEV` is true
(functions :5001, firestore :8080). Running `vite` alone (web on :5173) without the emulators
makes every profile save fail with the generic "Failed to save profile" (the fallback for ANY
error, not just validation). Start emulators alongside Vite:
`firebase emulators:start --only functions,firestore`. The root `npm run dev`
(= `firebase emulators:start`) serves hosting on :5173 and collides with Vite.

## Opus 4.8 (and newer models) reject the `temperature` parameter

Pinning the Oracle to `claude-opus-4-8` broke it with HTTP 400
`temperature is deprecated for this model` (surfaced in-browser as the generic
"Не удалось получить ответ от AI"; tokens were correctly refunded). `callClaudeOnce` used to
always send `temperature: input.temperature ?? 0.5`. Fix: only include `temperature` in the
payload when the caller explicitly sets it, and omit it from `buildOraclePrompt` (Opus 4.8
manages sampling itself). Sonnet 4.6 builders (premium PDF, deepen, relationship) still set
`temperature` explicitly, so they are unchanged. Rule: when adopting a new Claude model, drop
`temperature` (and re-check other params) unless docs confirm support.

## Scheduled-query Firestore composite indexes must be declared in firestore.indexes.json

The astrologer stopped sending letters: `scheduleLetters` (a 15-min cron) ran
`subscriptions.where(status==active).where(nextLetterAt<=now)`, which needs a composite index
`subscriptions(status ASC, nextLetterAt ASC)`. It was missing from `firestore.indexes.json`, so
every tick threw `9 FAILED_PRECONDITION: The query requires an index` — visible ONLY in function
logs, silent in the UI; no letters were ever enqueued. Fix: add the index, `firebase deploy
--only firestore:indexes`, wait for state READY (~2 min), then the next cron tick catches up
(advances `nextLetterAt` one cadence per missed window). Rule: any new two-field `where`/`orderBy`
query — especially in a scheduled/background function with no user-facing error — needs its
composite index added to firestore.indexes.json in the same change.

## Do not chain a commit after a check with `;`

`(cd functions && tsc --noEmit && npm test | grep ...) ; git commit` committed even though `tsc` failed,
because `;` ignores the failure and the subshell's `&&` chain only covers what is inside it. A test file with a
type error then sat in a commit and would have broken `npm run build` (tsc compiles `src/__tests__`).
Rule: join verification and commit with `&&`, and read the failing output before committing. Fix-up commits are
fine, but never leave a red typecheck in history that CI or the deploy build will hit.

## Google consoles in the MarkView browser: narrow window, hidden slide-over panels, legal acknowledgements

- GA4 Admin opens stream details and the API-secret panel as slide-overs that can sit off-screen in a narrow
  window. `browser_click` then falls back to "by script" clicks on the wrong element (it hit the sidebar
  "Create" menu instead of the panel's button). Find the right element with `browser_evaluate` (check
  `getBoundingClientRect`) and click it explicitly; close stray menus with Escape.
- Two Google accounts are signed in (`/u/0` = boris@mobilemindai.com, `/u/1` = t.boris@gmail.com). The
  Firebase project belongs to `/u/1`; "project does not exist or no permission" means wrong account index.
- "User Data Collection Acknowledgement" (needed for a Measurement Protocol secret) is a legal statement by
  the property owner: ask before clicking. Data-filter activation is irreversible: leave filters in Testing
  until the owner has verified them.
- Move a secret from a web page into Secret Manager through the clipboard (`pbpaste | firebase
  functions:secrets:set NAME --data-file -`), then `pbcopy < /dev/null`; never print the value.

## Public routes with a language in the URL: do not let the page fight the language switcher

A gate that re-applies "URL language" in an effect depending on the current i18n language undoes an explicit
switch (click EN on /ru/privacy -> the gate flips back to RU and the English page redirects to RU). Apply the
URL language on arrival only (effect keyed on the location, not on the language) and let the switcher change
the language first, then navigate.

## Dev tools with a floating range can break the Cloud Build install of the functions

Cloud Build runs `npm install` on `functions/package.json` alone (no lockfile in the upload). `"vitest": "^4.0.18"`
floated to 4.1.x, which crashes npm's resolver (`Cannot read properties of null (reading 'edgesOut')`), so every
function failed to update, in CI and in a manual deploy. Diagnose by copying `functions/package.json` to an empty
directory and running `npm install --package-lock-only`; bisect by dropping one dependency at a time. Keep dev
tools in `functions/package.json` pinned exactly (DEC-017) and re-run that clean-directory check after touching
its dependencies.

## A generated `.env` must never repeat a Secret Manager secret

`firebase-deploy.yml` wrote STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET into `functions/.env` while the functions bind
the same names with `secrets: [...]`. Cloud Run rejects the update with HTTP 400 "Secret environment variable
overlaps non secret environment variable". Secrets live only in Secret Manager; `.env.<project>` holds public
values (DEC-018). After touching secrets or env files, confirm with the next push-to-main deploy run, not only locally.

## Test the dedupe key with the call sites' real arguments

`trackOnce(key, name, params)` deduped on `name:key`. Two call sites passed the same profile id as key for different
`paywall_viewed` features, so the second one (premium_store) was silently dropped; the unit test used distinct keys and
passed. Found only by reading the live `dataLayer`. Make the identity include everything that distinguishes events
(here the parameters) and test with the exact collision, not only the happy path.

## Verify a new Cloud Run callable with a CORS preflight, not only with a deploy log

A function created by an aborted deploy (`adminStats`) had no `allUsers` invoker binding: every call, including the
browser's OPTIONS preflight, got a bodiless 403 from Cloud Run, which the app would show as a CORS/permission error. After
deploying a new callable run:
`curl -X OPTIONS <service-url> -H 'Origin: https://natalmystic.com' -H 'Access-Control-Request-Method: POST'` (expect 204)
and compare `gcloud run services get-iam-policy` with a sibling callable.

## Walk the live site and read the real events

Unit tests and the build were green while `paywall_viewed` was dropped. Reading `window.dataLayer` on the deployed site
after clicking through the funnel found it. For analytics work always check the real events, not only the code path.
