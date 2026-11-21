## Maximise the natal chart (feat/wheel-maximize, v2.30.0)

Request (asked twice, the second time with emphasis): "картинку натальной карты максимайз". v2.27.0 only made the *downloaded* picture fill its frame and gave the PNG its largest size; there was no way to see the wheel bigger on the page, where it stops at 600 px. I had asked about a full-screen button in the report instead of building it.

- [x] `MaximizedWheel` (native modal `dialog`, `showModal()`): the wheel over the whole window, sized by the smaller side of the window (`min(100vw - 2rem, 100dvh - 2rem)`), dense backdrop, close button, Escape, click on the empty area, page scroll locked while open, focus kept inside by the browser. It mounts the wheel only while open, so the page never holds two drawings.
- [x] `WheelStage` (wheel + tooltip, extracted from `NatalChart`) is used by the page and by the dialog, so hover, tap-to-pin, aspect lines and the tooltip work the same in both; the pin rule (`clickReleasesPinned`) takes every wheel on the page; closing the dialog clears the hover that could not be cleared by a pointer leaving.
- [x] A round button with the "maximise" icon in the top right corner of the chart card (EN "Maximize the chart", RU "Развернуть карту"). First put in the corner of the centred 600 px wheel, which is not the corner of the card on a wide layout (owner: "Кнопка максимайз должна быть в правом верхнем углу"); now on the full-width container: 0 px from the right and top edge of the chart area (measured in a 1440 px layout).
- [x] Tests: `wheelMaximize.test.tsx` (10): button name in both languages, closed dialog without a second wheel, dialog markup (labelled, fills the window, shows only when open), size rule, pin with two wheels. Web 347 pass, build, tsc and eslint clean.
- [x] Browser check on the local mock (940 x 922 window): wheel 600 px on the page, 890 x 890 in the dialog, focus on the close button, tooltip in the dialog, real Escape closes it, click on the empty area closes it, close button closes it, scroll lock released, no tooltip left on the page.
- [x] Ship: PR #34 (CI green, merge 712edd7, deploy success, header v2.30.0). Live read-only check (2026-11-21, 940 x 922 window): the button is in the top right corner of the chart area (0 px from the right and top edge), label "Развернуть карту"; the wheel is 600 px on the page and 890 px in the dialog; the tooltip works in the dialog; a real Escape closes it, one wheel is left on the page, the scroll lock is released and no tooltip is left.

---

## Cancelled subscriptions still marked active (fix/close-ended-cancellations, v2.29.4)

Report: "у профайла Борис и у профайла Настя есть активная subscription, но мы его не показываем как subscription ... мы отменили, тогда она не должна быть активной. Ты это починил или нет?"
Finding (live, read-only, 2026-11-21): both subscriptions are cancelled (`canceledAt` set: the card shows "Отменится в конце периода") yet the stored `status` is still "active", so the card says "активна", the account page lists them with a next letter, and the profiles panel (which uses the cancel rule) shows no mark on any of the 18 profiles. Three places, three answers. v2.29.2 only stopped the letters, and only at the next due tick, so the status stayed "active" until then.
Cause: only a Stripe `deleted` webhook event (not arriving) or a due letter could flip the status; the card and the account page already hide `status == "canceled"`.

- [x] `closeEndedCancellations` in `services/letterScheduling.ts`: every tick closes the active, cancelled subscriptions whose paid period is over (status "canceled"), due or not; needs the new `(status, canceledAt)` index in `firestore.indexes.json`; if that pass fails (index still building) letters are not held back and the due pass applies the same rule.
- [x] Tests: 16 in `letter-scheduling.test.ts` (5 new: not-due closed, paid period kept, never-cancelled untouched, several closed, sweep failure); mutation check with the pass disabled fails 4. Functions 472 pass, build and lint clean.
- [x] Ship: PR #33 (CI green, merge 142ed89, deploy success incl. the index, which was READY at 21:38 UTC). Live (2026-11-21, read-only): the 21:51:02 UTC scheduler tick logged `due 0, enqueued 0, closed 2` and sent no letter; the account page now says "Нет активных подписок"; the astrologer tab of the profile is back to the subscribe offer (no "активна", no cancel pill, no next letter); the profiles panel stays unmarked (18 profiles, 0 marked).
- Still open for the owner: `cancelSubscription` answers ok even when the Stripe call fails, and the Stripe webhook seems not to receive renewal / deleted events; check both subscriptions in the Stripe dashboard (a closed record does not cancel the Stripe side).

---

## Subscription dates in the wrong format (fix/subscription-dates, v2.29.3)

Report (screenshot of the astrologer card): "проблемы с подпиской - посмотри на даты". The Russian card showed "Следующее письмо: 11/21/2026, 3:00:35 PM" and "Отменится в конце периода · 7/3/2026".
Cause: `toLocaleString()` / `toLocaleDateString()` without a language use the browser's own setting, so a Russian page printed the American order (7/3/2026 is a July date there and a March one to a Russian reader). The cancel date was also a stale `currentPeriodEnd` (see v2.29.2) that lay in the past.

- [x] `lib/subscriptionDates.ts`: `formatDay`, `formatDayTime` (no seconds), `formatPeriodEnd` (empty unless the end is still ahead; the epoch of a failed read, a missing or an unreadable value included); tests (8) with a mutation check (5 fail with the old calls).
- [x] Used on the astrologer card (next letter, cancel date), the account page (next letter) and the letters inbox (letter date); the cancel pill shows no date when it is not ahead; `home.subscription.endingNoDate` ("Astrologer · ending") for the profile-list mark without a date.
- [x] Web 337 tests (after the rebase), tsc and eslint clean on the touched files.
- [x] Ship: PR #31 (CI green, merge 22b7a76, deploy success, header v2.29.3). Live read-only look (2026-11-21, owner session, no names or addresses printed): the astrologer card shows "Следующее письмо: 22 нояб. 2026 г., 15:00" and the pill "Отменится в конце периода" without the stale date; the account page lists the next letters as "23 нояб. 2026 г." and "22 нояб. 2026 г."; no `m/d/yyyy` date anywhere on either page.

---

## Letters kept coming after the subscription was cancelled (fix/canceled-subscription-letters, v2.29.2)

Report: "письма все еще идут, а я прекратил подписку давно".
Cause: `scheduleLetters` picked subscriptions by `status == "active"` and `nextLetterAt <= now` only. A cancel sets `canceledAt` and asks Stripe to cancel at period end, but the record stays `active` until Stripe's `customer.subscription.deleted` event reaches the webhook; the webhook log shows almost no traffic, so that event never flipped the record and letters (a paid AI generation and an email each) went on, 1-2 a day up to the day of the report. `currentPeriodEnd` was stale too (it is only refreshed by `invoice.payment_succeeded`), which also made the card announce a cancellation in the past.

- [x] `services/subscriptionLifecycle.ts`: `cancellationTookEffect(doc, now)` is true when `canceledAt` is set and the period end is missing, unreadable or not ahead (the owner's cancel wins over a stale date).
- [x] `services/letterScheduling.ts` (`enqueueDueLetters`, used by `api/scheduleLetters.ts`): such a subscription gets no letter and is closed (`status: "canceled"`, what the Stripe event would do); a failed close is logged and does not stop the tick. The profile-list summary uses the same rule.
- [x] Tests: `letter-scheduling.test.ts` (11, with a `create()` added to the fake Firestore); mutation check with the rule stubbed to `false` fails 6 tests. Functions 467 pass, `build:functions` and lint clean.
- [x] Ship: PR #30 (CI green, merge cd25e8a, deploy success). Live: the three letters of 2026-11-21 (11:38, 14:08, 21:09 UTC) went out before the deploy. The account has two subscriptions (daily, due 22 Nov; every 2 days, due 23 Nov); the cancelled one is closed at its next due tick instead of getting a letter. Still to read from the scheduler log (counts only) after 2026-11-22 21:00 UTC: `closed >= 1` and no letter for that subscription.
- Open for the owner (not changed): `cancelSubscription` logs a failed Stripe call but still answers ok, so a failed `cancel_at_period_end` leaves Stripe billing; the Stripe webhook may not be receiving renewal / deleted events (endpoint events or signing secret); check the subscription in the Stripe dashboard.

---

## Wheel tooltip could not be dismissed (fix/wheel-tooltip-dismiss, v2.29.1)

Report: after clicking a point or an axis (DSC in the report) the tooltip stayed on the wheel and could not be closed.
Cause: a click or tap pins the point (`selectedId`) so the wheel works without hovering; the only way to let it go was another click on the same marker, and the tooltip itself is `pointer-events-none`.

- [x] Pure rules in `chart/wheelSelection.ts`: a click that is not on a point or axis of the wheel releases the pinned point, and so does Escape (a click on a marker keeps its own select/unselect rule).
- [x] `NatalChart` listens on `document` for `click` and `keydown` only while something is pinned.
- [x] Tests (`wheelSelection.test.ts`, 6): marker click keeps, empty wheel / page / missing target releases, only Escape releases, markers carry `data-point` / `data-angle`.
- [x] Verified in the browser on the local mock (synthetic clicks): pin by click, click on the page / on the empty wheel / on a button releases, same marker toggles off, Enter keeps, Escape releases, another marker switches the tooltip. Web tests 329 pass, eslint clean on the touched files.
- [x] Ship: PR #29 (CI green, merge 1dc7d04, deploy success, v2.29.1). Live read-only check on v2.29.3 (2026-11-21): the axis click pins the tooltip, a click on the page or on the empty wheel and Escape release it, a second click on the same axis unpins it.

---

# Profiles panel: resizable, no visible scrollbar, subscription marks

Branch: `feat/profiles-panel-resize-subscription` (stacked on `feat/big-three-compact-strip`, v2.28.0 -> 2.29.0). Requested by Boris in chat on 2026-11-21: "сделай панель с профилями с изменяющейся шириной и спрячь скролл, еще показывай как-то те профили у которых есть подписка".
Status: APPROVED CHOICE (Boris, 2026-11-21): the subscription data comes in one request from the server (`listProfiles` adds a short summary to each profile), not one call per profile.

Findings: the panel is `ProfilesMenu` inside `pages/Home.tsx` (fixed `w-60` sidebar from `xl`, off-canvas drawer below). The list is `overflow-y-auto`; a `.scrollbar-hidden` utility already exists. Subscriptions live in `subscriptions/{profileId}` (status active | paused | past_due | canceled, `cadence`, `canceledAt`, `currentPeriodEnd`); a cancel keeps access until the period end. Subscriptions need an account, so anonymous (device-only) lists have none. The header `ProfileSwitcher` is a second list of the same profiles.

Plan (tick as done):
- [x] **S1 Server:** `services/subscriptionSummary.ts`: pure `summarizeSubscription(doc, now)` -> `{ state: active | ending | paused | past_due, cadence, until }` or null (canceled or ended); `withSubscriptions(profiles, load)` reads `subscriptions/*` in one batched `getAll`, never fails the list (reports the error and returns the profiles as they are); `listProfiles` attaches it for signed-in callers only; type `ProfileSubscription` in both type files; 9 tests.
- [x] **S2 Panel:** `components/ProfilesMenu.tsx` (moved out of `Home.tsx`, behaviour kept): width dragged by a handle on the right edge from `xl` (min 220, max 440 and 40% of the window, default 240, saved in `localStorage`, arrow keys with Shift for a bigger step, Home/End, double click resets, `role="separator"`); scrollbar hidden (`scrollbar-hidden`, the list still scrolls); width rules are pure (`lib/panelWidth.ts`) and tested.
- [x] **S3 Subscription mark:** `SubscriptionBadge`: a sparkle next to the name and a pill with the wording on the card (Astrologer + cadence / until a date / paused / payment failed), accent colour of the card by state (gold, amber, slate, red); the same sparkle in the header `ProfileSwitcher`; archived profiles are not marked; EN and RU texts; the text hook lives in `lib/useSubscriptionText.ts`.
- [x] **S4 Verify (ship pending):** chart-core 77, functions 456 (24 files), web 323 (22 files); `build:functions`, `lint --workspace=functions`, `build:web`; eslint in web at the baseline (5 errors, 1 warning, files not touched here); the date test passes in UTC, Los Angeles and Auckland. Browser check on the local mock (synthetic profiles, the app in a 1440 px iframe because the window is narrower than `xl`): all four states and the plain cards, no scrollbar (width 0, `scrollbar-width: none`, the list does scroll), drag 240 -> 300 -> 360, clamp at 440 and 220, arrows 16 and Shift 48, Home/End, double click back to 240 and the storage key removed, 400 kept after a reload, the sparkles in the header dropdown. Version 2.29.0. Shipped as PR #27 (CI green, merge 9d92828, deploy success including the `listProfiles` function). Live read-only check (2026-11-21, v2.29.0, the app in a 1440 px iframe): the docked panel lists 18 profiles, the handle is a `role="separator"`, drag 240 -> 320 and a double click back to 240, storage key removed, no scroll bar (`scrollbar-width: none`, 0 px) while the list scrolls. No profile of this account has a subscription, so no mark could be seen live; the marks are covered by the unit tests and the local mock (four states). To see one live, a real subscription is needed (not created here).

---

# Big Three: a compact, animated strip with an explanation

Branch: `feat/big-three-compact-strip` (from `main` 987edfe, v2.27.0). Requested by Boris in chat on 2026-11-21: "Большая тройка теперь занимает слишком много места - добавь туда что-то, сделай более красивым желательно с анимацией и объяснением".
Status: APPROVED CHOICE (Boris, 2026-11-21): a compact strip of three cards (not a one-line triptych).

Findings: the Chart tab card (`pages/ProfileDetail.tsx`, right column) is a tall list of three rows (glyph, label, sign). `InterpretationView` has its own compact three-card strip; it is left as it is. The per-sign texts `interpretation.{sun,moon,ascendant}.<sign>.text` already exist in EN and RU, so the explanation reuses them. `framer-motion` is already used on the page; there is no jsdom in web tests (pure model tests plus `renderToStaticMarkup`).

Plan (tick as done):
- [x] **B1 Model:** `bigThreeModel.ts` (pure): the three items (glyph, sign, degree, element, modality, house, text key), Rising unknown when the chart is a noon estimate; tests.
- [x] **B2 Component + styles:** `BigThree.tsx`: three cards in a row in the element colour; animated orbit ring around the glyph and a soft pulse on the picked card (CSS, off under `prefers-reduced-motion`); staggered entry, cross-fade of the explanation and animated "Details" (framer-motion, off under reduced motion). Compact by default: cards plus a one-line explanation of the picked card; "Details" opens the element, modality, house chips, the existing per-sign reading (clamped) and "Full reading" (opens the Interpretation tab). Rising without a birth time says why the time is needed and links to the profile edit page. EN and RU texts. First version showed the reading at once and was taller than the old card (about 400 px against 270 px), so the details were made collapsible.
- [x] **B3 Wire:** the tall card in `ProfileDetail.tsx` is replaced; `hexToRgba` moved to `utils/elementColors.ts` (shared with `InterpretationView`); the help text `profile.risingUnknown` described the removed dash and is deleted (EN and RU), the new texts live under `bigThree.*`.
- [x] **B4 Verify (ship pending):** web 312 tests (10 new), `build:web`, eslint on the touched files clean. Browser check on the local mock (synthetic profiles), RU: closed block 215 px high at a 875 px column (the old card was about 270 px), Moon picked and opened (amber glow, chips, reading, link), unknown time (dashed "?" ring, explanation, link to `/profile/U/edit`). Version 2.28.0. Shipped as PR #26 (CI green, merge f158264, deploy success). Live read-only check (2026-11-21, v2.28.0): three cards with orbit dots, Sun picked, closed block 215 px high, 348 px with the details open (4 chips, "Full reading" link).

---

# Download the natal wheel and the aspect matrix as images; draw the new wheel in the PDF

Branch: `feat/chart-image-download-and-pdf-wheel` (from `origin/main` 8a25ef3, v2.26.0). Requested by Boris in chat on 2026-11-21.
Status: APPROVED CHOICES (Boris, 2026-11-21): shared workspace package; PDF palette (cream and gold, not the dark site wheel); image footer = link + birth date (and time when known), place and house system, no name.

Request: (1) a button that downloads the natal wheel as an image exactly as the profile draws it, and one for the aspect matrix; (2) the site link https://natalmystic.com on each image; (3) the PDF we generate must draw the updated wheel; (4) the link https://natalmystic.com in the PDF too.

Findings from the code:
- The profile wheel is one SVG built from React layers (`NatalChart.tsx` and its children; attributes for colours, 12 `className` uses). `react-dom/server` `renderToStaticMarkup` can serialise the same layers with no new library, so the PNG is the on-screen wheel by construction (no hover or selection, the user's active aspect filters).
- The aspect matrix (`AspectMatrix.tsx`) is an HTML table: its image is an SVG drawing of the same cells from the same view-model.
- The PDF (`functions/src/services/pdf.ts`, `pdfkit`, `drawNatalChart`) draws an old wheel (0 degrees Aries at the top, short letters, five major aspects, no angles, no scale, no extra points, no link). The bundled Noto fonts have no astrological glyphs.
- DEPLOY CONSTRAINT: `firebase.json` deploys the folder `functions/` only. A workspace package outside it would be missing in Cloud Build. Mechanism (decision for the shared package): `packages/chart-core` is the single source; web imports it as a workspace package; `functions` gets a generated copy of its sources at build time in `functions/src/vendor/chart-core/` (git-ignored, written by `scripts/vendor-chart-core.mjs` before `tsc`, tests and lint). The compiled copy lands in `functions/lib`, which is what the deploy uploads. Proof required: install `functions/` alone in a clean directory (what Cloud Build does) and load the compiled PDF module.
- The chart types (ChartResult and friends) move into the package; `types/index.ts` in `web` and `functions` re-export them (removes the duplicated block that was kept in sync by hand).

Plan (tick as done):
- [x] **P1 Foundation:** create `packages/chart-core` (types, constants, chartMath, labelSpread, positions, wheelLayout, pure view-model helpers, their tests moved with them); wire web (workspace dependency, imports) and functions (vendor script in build, lint, test and serve scripts, `.gitignore`); add the package test step to `.github/workflows/ci.yml`; all existing tests stay green; deploy-simulation proof.
  - Evidence (2026-11-21, working tree, not committed): `packages/chart-core` holds the types, constants, chartMath, labelSpread, positions, wheelLayout, viewModel (pure part), aspectFilters (pure part) and 4 moved test files + fixtures; web keeps `utils/{elementColors,labels,useAspectFilters}.ts`. Tests: package 77 (4 files), web 259 (19 files), functions 415 (22 files, incl. natal-parity); 77 + 259 = the old web 336. `build:functions`, `build:web`, `tsc --noEmit` in the package and in functions pass; eslint on web unchanged (5 errors, 1 warning in the six untouched files); `npm ci --dry-run` accepts the lockfile; Vite dev serves the package (`/@fs/.../chart-core/src/index.ts` 200). Deploy simulation: `functions/` copied without node_modules to a clean directory, `npm install --omit=dev`, then `lib/services/pdf.js`, `lib/vendor/chart-core/index.js` and `lib/index.js` (65 exports) load there; no runtime reference to `packages/` or `@astroweb` in `lib/`.
- [x] **P2 Web images:** a clean wheel SVG and a matrix SVG, PNG at 2x through a canvas, download buttons (wheel next to the aspect filters, matrix above the matrix), footer https://natalmystic.com + date, place, house system, EN and RU texts, tests.
- [x] **P3 PDF wheel:** pdfkit drawing with the new geometry from the shared layout functions (house 1 at 9 o'clock, degree scale, cusp labels and numbers, ASC/DSC/MC/IC, all points with glyph, degree, sign, minute, retrograde marker, shared aspects with minors), astrological glyph font (OFL) in `functions/assets/fonts`, clickable and printed link https://natalmystic.com on the wheel page and the cover, unknown birth time draws no houses or angles and says the positions are noon estimates, tests.
  - P2 evidence: `WheelSvg`, `image/WheelImage`, `image/MatrixImage`, `matrixModel`, `wheelModel`; 295 web tests (35 new in `chartImage.test.tsx`). Real click in the browser (local mock backend, synthetic profiles): `natal-chart.png` 2080x2432 and `natal-chart-aspects.png` 3200x2729 (capped at 3200), image/png, no error; EN known time (footer: URL, date and time, place, house system), RU unknown time (no houses or angles, footer says the time is unknown and the positions are noon estimates).
  - P3 evidence: `functions/src/services/pdfWheel.ts` (`planNatalWheel`, `drawNatalWheel`), `NotoSansSymbols-Regular.ttf` + licence, 25 tests in `pdf-wheel.test.ts`; PDF rendered with `pdftoppm` and inspected (known time EN, unknown time RU, Placidus RU); 2 `/URI (https://natalmystic.com)` annotations (cover and wheel page); default aspects = the five majors like the site (all 11 on request); deploy simulation in a clean directory embeds the font.
- [x] **P4 Verify:** `npm run build:functions`, `npm test --workspace=functions`, `npm test --workspace=@astroweb/chart-core`, `npm test --workspace=web`, `npm run build:web`, eslint on touched files; open the downloaded PNGs and the rendered PDF page and compare with the on-screen wheel; independent code review.
  - Follow-up requests from Boris in chat (2026-11-21), all done: (a) the dividing lines of the circle must be visible on the images and in the PDF; (b) lighter background of the images; (c) the chart larger, "maximize" (read as: the chart fills the picture and the PDF page, PNG at the maximum allowed size). `WheelLook` (`wheelLook.ts`): page look unchanged, `IMAGE_WHEEL_LOOK` stronger; `IMAGE_BG = #20284f`; wheel margin 6; PNG longer side 3200 px; PDF `wheelSide` fills the page width (cusps `deepGold` 1.5, sectors 1.4).
  - Evidence (2026-11-21, after the follow-ups and the review fixes): chart-core 77, web 302 (20 files), functions 447 (23 files) green; `build:functions`, `lint --workspace=functions`, `build:web` clean; eslint in web at the baseline (5 errors, 1 warning, six untouched files). Real clicks in the browser on the local mock (synthetic profile): `natal-chart.png` 2773x3200 (bg #20284f, lighter disc, visible cusp and sign lines, footer URL + date/time + place + house system) and `natal-chart-aspects.png` 3200x2692, both image/png, no error. PDF page 4 rendered with `pdftoppm` (EN known time, RU unknown time): wheel 564 pt wide, legend and link above the page footer, 31 pages, 2 URI annotations; the page-fit test fails when the reserve under the wheel is cut from 120 to 50 (mutation check).
  - Independent review, fixed: blob URL revoked 60 s after the click (was at once); footer text cut by code point, XML-invalid characters dropped, "relocated" kept for long names, `sanitizeSvg` touches only `style` attributes; button name = visible text (`title` carries the long wording), `aria-disabled` instead of `disabled`; vendor npm script skips when `../scripts` is absent (uploaded folder); stale `utils/...` paths in the two docs. Not fixed, reported to the owner: glyphs in the PNG come from system fonts; PDF wheel uses the shared aspect set while the PDF aspect tables use the legacy list; wheel size constants are copied in web and in `pdfWheel.ts`; a relocated chart prints the relocation place.
- [x] **P5 Ship:** bump `web/package.json` to 2.27.0, commits, PR #25 with test plan, green CI (2 runs), merge 987edfe, CI deploy success, live header v2.27.0.
  - Live read-only check (2026-11-21, natalmystic.com, owner session, cache-busted URL, no screenshots of real profiles, nothing bought, unlocked or generated): `natal-chart.png` image/png 2773x3200, background corner #20284f, footer text pixels present; `natal-chart-aspects.png` image/png 3200x2692, same background; no error shown. The PDF is not generated live (a premium PDF is a purchase); it is covered by the 31-page render and the tests.

Out of scope: SVG download, share buttons, an analytics event for downloads, the name or coordinates on the image, changing the planets, houses and aspects tables of the PDF, the house-system selector for AI readings and the PDF (still Koch).

---

# Natal Chart Parity and Verification (issue #22)

Spec: `docs/features/natal-chart-parity-and-verification/` (REQ-001..005, DEC-008..018, Q-001..002, F-001..003, SRC-001..005, I-1..I-8).
Branch: `feat/natal-chart-parity-and-verification`. Started on the explicit /goal from Boris on 2026-11-21.
Answers recorded from Boris: Q-001 -> DEC-008 (Astro-Seek full charts + independent longitudes), Q-002 -> DEC-009 (Koch default, selector), independent source -> DEC-013 (JPL Horizons snapshots), data contract -> DEC-014 (additive `ChartResult` fields, `points`/`aspects` unchanged), Chiron -> DEC-015 (bundle `seas_18.se1`), clarification SRC-005 (the drawn wheel must carry every picture feature -> REQ-001). Leftover files from earlier work go into this PR as separate commits (done: `dc086d5`, `0612fb0`, `5634d24`).
Answered with the evidence in: Part of Fortune -> DEC-016 (day formula when the Sun is above the horizon, night formula otherwise; "always day" fails on night charts A and D, "by the Sun's house" fails on B).
Decided from the evidence (DEC-010 rule, proposed in MarkView for Boris to accept): DEC-017 shared aspect orb table (7/10, 4/6, 2.5 degrees), DEC-018 mean obliquity for cusps, ASC, MC and Vertex.
Deploy: the CI auto-deploy runs when the PR is merged to main.

Findings from the spike (exploratory, 2026-11-21; formal comparison comes after the tolerances are written):
- Ten bodies from `sweph` (Moshier) match both screenshots to the arcminute; UTC offsets +2 (Cape Town 2002) and +3 (Riyadh 1999) confirmed.
- Mean North Node and mean Black Moon Lilith match both screenshots; true node and osculating Lilith miss by 1-3 degrees. Astro-Seek truncates minutes (33.972' shows 33').
- Vertex of B: `sweph` 5°18.993' vs shown 5°19' (arcminute-rounded city coordinates); angles need a matched-coordinate comparison.
- Chiron fails in Moshier mode without `seas_18.se1`; with it, both screenshots match (DEC-015).
- All three pictures are Whole Sign wheels: house 1 cusp on the 9 o'clock axis, ASC at its own longitude inside house 1. Today's wheel pins the ASC to 9 o'clock and treats cusps 1 and 10 as ASC and MC.

- [x] **WP1 Fixtures and conventions (I-1; REQ-002, REQ-003, REQ-005; DEC-010, DEC-012):** (done: eight Astro-Seek captures in `functions/src/__tests__/fixtures/natal-parity/astro-seek/`, conventions in `docs/verification/natal-chart-parity.md` section 5; the wheel element inventory is in `docs/verification/natal-chart-wheel-inventory.md`) regenerate Astro-Seek charts for datasets A (30 Mar 2002 03:30 Cape Town) and B (25 Sep 1999 07:24 Riyadh) with explicit settings, plus Koch and Placidus controls; read positions, houses, aspects and the aspect glyph inventory; save inputs, settings and results as fixtures with provenance; inventory the wheel elements of SRC-002..004.
- [x] **WP2 Verification rules (I-7, REQ-005):** write tolerances and categorical rules (displayed-minute bin, coordinate-sensitive points, retrograde, house and aspect categories) in `docs/verification/natal-chart-parity.md` and commit them before any formal comparison is evaluated.
- [x] **WP3 Calculation (I-3, I-4, I-5 backend, I-8; REQ-001..003, REQ-005; DEC-010, DEC-011, DEC-014, DEC-015):** mean nodes, mean Lilith, Chiron (file), Part of Fortune (once decided), Vertex, speed and retrograde; shared expanded aspect set with orb and applying/separating; additive `ChartResult` fields (context with requested and actual house system, UTC instant, coordinates, conventions; positions; angles; aspect set); calculation version in the cache key so older entries are recalculated; unknown birth time withholds ASC, MC, cusps, houses, angle-dependent points and aspects; `points`/`aspects` unchanged.
- [x] **WP4 Profile UI (I-2, I-3, I-5, I-6; REQ-001..004; DEC-009, DEC-011):** (done: wheel in `NatalChart.tsx` and its layers, tables/matrix/summaries/selector/context line, Houses tab, EN and RU texts; element inventory in `docs/verification/natal-chart-wheel-inventory.md`) house-system selector (Koch default) and chart context line; wheel orientation, degree scale, ASC/DSC/MC/IC axes, point labels with retrograde marker, extra points, aspect lines including angles and minor aspects; Planets table rows; Aspects list from the shared set; aspect matrix; element-by-modality grid; 0-30° degree strip; Houses tab shows requested vs actual system; EN and RU texts; tests.
- [x] **WP5 Acceptance checks (I-7, I-8; REQ-005; DEC-008, DEC-013):** Horizons snapshot script and committed responses; full-chart comparison tests against the fixtures; cached-vs-fresh test; verification report with deviations.
- [x] **WP6 Verify:** `npm test --workspace=functions`, `npm test --workspace=web`, `npm run build:functions`, `npm run build:web`, lint; local display verification of the wheel against SRC-002..004.
- [ ] **WP7 Ship:** bump `web/package.json` (minor), commits with the `Feature:` trailer, PR with test plan, CI green, merge, CI deploy, confirm the live version, live walkthrough in the MarkView browser, GitHub #22 comments and close after merge, MarkView statuses.

## Review (before the merge; the CI, deploy and live results are recorded in the pull request and in issue #22)

- Backend: `computeNatalChart` now returns the additive fields (`context`, `positions`, `angles`, `sharedAspects`); `points`, `aspects` and `houses` keep their contents (regression baseline from `origin/main` e682fa3, only aspects that touch ASC or MC differ by 0.01 degree of orb because of DEC-018). `CALC_VERSION = 2` is part of the cache key, so older cached charts are recalculated. Chiron comes from the bundled `functions/ephe/seas_18.se1` (DEC-015).
- Verification: `docs/verification/natal-chart-parity.md` (rules before results; sections 5 to 7 hold conventions, discrepancy log X-1..X-9 and results). 63 acceptance tests in `functions/src/__tests__/natal-parity.test.ts` against four regenerated Astro-Seek charts (arcsecond tables, default-orb and 15 degree aspect lists), JPL Horizons snapshots and the transcribed SRC-002 and SRC-003 tables. Largest deviations: points 1.40 arcsec (Moon, C), cusps 0.58 arcsec, Horizons 1.157 arcsec; aspect sets equal on all four datasets; applying or separating equal on all comparable rows (pairs of two daily-rotation points show no status).
- Frontend: wheel, tables, matrix and summaries read one result through `positions.ts` and `viewModel.ts`; the wheel inventory is `docs/verification/natal-chart-wheel-inventory.md`. Browser check against a local mock backend: chart A in Whole Sign against SRC-002, chart B against SRC-003, unknown birth time, Placidus fallback at a polar place, phone width.
- Results at the last run: functions 22 files / 415 tests, web 23 files / 336 tests, `npm run build:functions` and `npm run build:web` clean, eslint clean on the touched web files (the five eslint errors and one warning that remain are in files this change does not touch).
- Open for the owner: DEC-017 (orb table, status rules) and DEC-018 (mean obliquity) are proposed and implemented as written; the licence of the bundled Chiron file (DEC-015) is still an open owner question.
- Known limits: the AI readings and the premium PDF keep using Koch because the server defaults to it (the selector is not shown on the Interpretation tab); if a newly selected house system fails to load, the previous chart stays on screen under the retry message while the selector already shows the new choice; the reveal animation of the wheel is inert because its keyframes were removed from the CSS in an earlier commit.

---

# Simpler Horoscope Discovery and Purchasing (issue #16)

Spec: `docs/features/simpler-horoscope-discovery-and-purchasing/` (REQ-001..005, DEC-001..010, Q-001..011, F-001..004, I-1..I-6).
Branch: `feat/simpler-horoscope-discovery-and-purchasing`. Approved direct USD base prices recorded in `DEC-010` ($1.99 situation, $3.99 relationship).
Deploy: CI auto-deploy (`.github/workflows/firebase-deploy.yml`) triggers on push to `main`.

- [x] **I-1 Three-month situation and relationship forecasts (REQ-001, REQ-002, DEC-002):** replaced Oracle/Compatibility/Transits wording with plain-language Russian & English labels across tabs, headings, actions, help bubbles, and privacy text; separated `oracleLetter` defaults from `oracle`; updated `oracle` and `compatibility` prompts and shared `forecastGeneration.ts` with computed 3-month transits and persisted/displayed `periodStart`/`periodEnd`.
- [x] **I-2 Daily, monthly, and yearly horoscope offers (REQ-003, REQ-004, DEC-001, DEC-004, DEC-009):** upgraded `ForecastView.tsx` into Personal Horoscopes with free Today's Horoscope (`Гороскоп на день`), one-time Current Month (`Гороскоп на месяц`, $4.99 / 5★), and Current Year (`Гороскоп на год`, $19.99 / 20★), pre-purchase and in-result covered dates, and daily subscription distinction banner.
- [x] **I-3 Daily horoscope subscription pricing & presentation (REQ-004, DEC-005):** updated `pricing.ts` and `web/src/api/astrologer.ts` to $30.00/mo and $179.82/yr for `daily` (without free-month labels on daily annual, other cadences untouched, existing subscriptions renew at contracted prices); updated `AstrologerPanel.tsx` to show full offer before sign-in with covered profile, included content, daily delivery, and distinction from free today's horoscope.
- [x] **I-4 Direct checkout with automatic star redemption (REQ-003, REQ-005, DEC-001..010):** added `directServices.ts`, `directOrders.ts`, `api/directCheckout.ts` (5 callables), `DirectCheckoutDialog.tsx` (native modal `<dialog>`), proportional star redemption with cent rounding, live quote check (`QUOTE_CHANGED`), idempotency keys, concurrent/duplicate period locks, cancel-safe star preservation, and sign-in/ownership enforcement.
- [x] **I-5 Fulfillment, saved period horoscopes & recovery (REQ-001..003, REQ-005, DEC-006, DEC-007):** added `monthlyHoroscope` and `yearlyHoroscope` AI tasks + Admin AI test wiring, `periodHoroscopes/{profileId}/items/{periodKey}` persistence + past-period archive reopening without checkout/charge/stars, and failed-generation recovery under the original order without second charge or star deduction.
- [x] **I-6 Unified purchase conversion funnel (REQ-005, DEC-008):** updated `ga4.ts`, `stripeWebhook.ts`, `directOrders.ts`, `businessStats.ts`, cross-feature `product-analytics-purchase-funnel-and-seo-foundation/requirements/REQ-002.md`, `docs/ga4-setup-checklist.md`, and EN/RU privacy pages so USD, mixed, and fully star-funded ($0 USD) direct orders count in one funnel, deduplicated by unique order ID and using actual charged USD revenue.
- [x] **Verify:** `npm run build:functions`, `npm test --workspace=functions` (20 files / 345 tests), `npm test --workspace=web` (14 files / 139 tests), `npm run build:web`, eslint clean on all modified/added web files, clean-dir `functions/package.json` install check, all acceptance criteria ticked via MarkView.
- [x] **Ship:** bumped version to `2.24.0`, merged PR #17 (`42f412b`) with green CI, verified CI Firebase deploy (`44615533344`), confirmed HTTP 204 CORS preflight + HTTP 401 auth gates on all 5 new Cloud Run callables, confirmed live `v2.24.0` (`/assets/index-BptuIHjZ.js`) and full Russian/English walkthrough in MarkView browser with zero console errors, closed `#16`, marked feature `implemented` → `verified` in MarkView.

---

# Admin control of AI models and prompts

Spec: `docs/features/admin-control-of-ai-models-and-prompts/` (REQ-001..007, REQ-009, REQ-011, REQ-012; DEC-001..005, DEC-010..018; Q-001..004, Q-009..012).
Branch: `feat/admin-control-of-ai-models-and-prompts`. Requested by Boris in chat on 2026-10-18.
Answers recorded from Boris: Q-001 -> DEC-010 (Claude + other providers), Q-002 -> DEC-011 (system prompt + user template with placeholders), Q-003 -> DEC-012 (test run), Q-004 -> DEC-013 (no history, reset only), Q-009 -> DEC-014 (OpenAI and Gemini), Q-010 -> DEC-015 (official SDKs, pinned), Q-011 -> DEC-016 (each provider's web search for the news digest), Q-012 -> DEC-017 (one prompt set per task).
Proposed by me, awaiting Boris: DEC-001 (Firestore `aiSettings`, 60 s cache), DEC-002 (model list with per-model request rules), DEC-003 (task registry, byte-identical defaults), DEC-004 (cache keys carry the settings version), DEC-005 (admin edits model, output limit, temperature where supported), DEC-018 (OpenAI Responses with store:false; Gemini generateContent).
Deploy: the CI auto-deploy runs when the PR is merged to main. OPENAI_API_KEY and GEMINI_API_KEY must exist in Secret Manager BEFORE the merge (a bound secret that does not exist fails the deploy).

- [x] **WP0 Golden tests first (REQ-004):** snapshot the exact system/user text and request parameters every current builder produces (each task, EN and RU, fixed sample data), so the refactor can prove byte-identical defaults.
- [x] **WP1 Model table + provider layer (DEC-002, DEC-005, DEC-015, DEC-018, REQ-011, REQ-012):** `services/ai/models.ts` (provider, id, label, prices with effective dates, temperature support, thinking rules, output limit, web search); one `generateText` interface with three transports: Claude (existing raw HTTPS, merged from `anthropic.ts` + `claudeRaw.ts`), OpenAI (`openai` SDK, Responses API, `store: false`), Gemini (`@google/genai`, `generateContent`); per-model request rules (drop unsupported params, thinking/reasoning settings and output headroom), continuation on truncation, refusal/safety handling, usage + cost for all providers; key presence = provider available.
- [x] **WP2 Task registry + settings store (DEC-001, DEC-003, DEC-011, DEC-013, DEC-017, REQ-003, REQ-004, REQ-006):** `services/ai/tasks.ts` with the 10 tasks, their default model/limits and editable texts per language (system, user, plus named parts such as the 4 premium PDF section instructions), placeholders (required/allowed, `{{name}}`); `aiSettings/{taskId}` loader with 60 s cache, validation on read with per-part fallback and warning; settings version (empty for pure defaults).
- [x] **WP3 Call sites (REQ-002, REQ-007, REQ-011):** Oracle, Oracle in letters, compatibility, deepen, forecast, premium PDF (async job + legacy sync path), letter analysis, letter writing, news digest (web search per provider, DEC-016), fact extraction use the registry + `generateText`; cache keys of deepen/forecast/PDF/news include the settings version; bind OPENAI_API_KEY and GEMINI_API_KEY to the functions that run AI.
- [x] **WP4 Admin callables (REQ-005, REQ-009):** `adminGetAiSettings` (tasks, models, effective + default values, provider availability), `adminSaveAiSettings` (server validation, updatedBy/updatedAt), `adminResetAiSettings`, `adminTestAiTask` (unsaved settings on a chosen profile; dry run: no stars, no caches, no user content, no settings write); all behind `assertAdmin`.
- [x] **WP5 Admin UI "AI" tab (REQ-001, REQ-002, REQ-003, REQ-004, REQ-009):** task list; editor with model picker grouped by provider (unavailable disabled, prices), output limit, temperature only where supported, EN/RU texts with placeholder list, default view and reset, save errors listed; test panel (profile, extra input, result with model/tokens/cost/time). English, no help bubbles.
- [x] **WP6 Tests:** golden byte-identical defaults, model rules per provider, transports with mocked SDKs and HTTPS (incl. store:false, truncation, refusal, thinking not shown), placeholder validation, loader fallback and cache, cache-key versions, admin auth (signed out / non-admin / unverified), dry-run writes nothing; web pure helpers.
- [x] **WP7 Verify:** functions + web tests, builds, lint at baseline; local admin walkthrough against the emulator/mock backend; acceptance criteria ticked in the spec.
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
