# Natal chart parity verification

Feature: `natal-chart-parity-and-verification` (REQ-005, DEC-008, DEC-010, DEC-012, DEC-013).
This file defines the comparison rules **before** any formal comparison is evaluated, and later holds the results, the point-convention evidence and the discrepancy log that serve as release evidence.

## 1. Evidence layout

| Item | Location |
|---|---|
| Birth inputs, coordinates, UTC instants, house systems of every dataset | `functions/src/__tests__/fixtures/natal-parity/datasets.json` |
| Astro-Seek reference results with the explicit settings used | `functions/src/__tests__/fixtures/natal-parity/astro-seek/` |
| JPL Horizons request parameters, parsed longitudes, raw responses | `functions/src/__tests__/fixtures/natal-parity/horizons/` |
| Script that refreshes the Horizons snapshots | `scripts/natal-parity/fetch-horizons.mjs` |
| Baseline of the legacy `points`, `aspects`, `houses` written by `origin/main` e682fa3 before this feature | `functions/src/__tests__/fixtures/natal-parity/regression/legacy-chart-fields.json` |
| Acceptance tests | `functions/src/__tests__/natal-parity.test.ts` (parsers in `functions/src/__tests__/helpers/natalParity.ts`) |
| Wheel element inventory and display verification | `docs/verification/natal-chart-wheel-inventory.md` |
| Chiron data file (DEC-015) | `functions/ephe/seas_18.se1`, SHA-256 `911a60ed2d706049dab426c03ebc58978fbef20ffd22f9ad957daa2a721e7d89` |
| Rules, results, convention evidence, discrepancies | this file |

## 2. Datasets

| Id | Birth data | Role |
|---|---|---|
| A | 30 Mar 2002 03:30, Cape Town (ZA), 33°56'S 18°25'E, UTC+2, no DST | Dated Whole Sign example (SRC-002): display verification against the screenshot, numerical verification against a regenerated Astro-Seek chart |
| B | 25 Sep 1999 07:24, Riyadh (SA), 24°43'N 46°41'E, UTC+3, no DST | Dated Whole Sign example (SRC-003): same treatment as A |
| C | 12 Jul 1985 14:45, New York (US), 40°43'N 74°00'W, UTC−4 (DST observed) | Koch control; exercises daylight saving time and the western hemisphere |
| D | 3 Feb 1978 22:10, Sydney (AU), 33°52'S 151°12'E, UTC+11 (DST observed) | Placidus control; exercises the southern hemisphere and a local date that differs from the UTC date |
| SRC-004 | Birth inputs not visible | Display verification only, by element (REQ-001) |

The screenshots of A and B omit the time zone, the node and Lilith definitions and the aspect orbs. Under DEC-012 their screenshots are used for display verification, and a new Astro-Seek chart with the same birth inputs and explicit settings (manual coordinates, manual UTC offset and DST flag, house system, node and Lilith type, orbs, point set) is the numerical reference. Agreement with a regenerated chart verifies only the settings that were explicitly configured for it.

## 3. Comparison rules

### 3.1 Angular deviation

The deviation between two longitudes is the smaller arc between them, in `[0, 180]`, so values on either side of 0°/360° compare correctly.

### 3.2 AstroWeb against Astro-Seek (matched settings)

Astro-Seek prints longitudes truncated to whole arcminutes (observed: 14°33.972' is shown as 14°33'), and orbs to whole arcminutes.

| Quantity | Rule | Tolerance |
|---|---|---|
| Longitude of every plotted point (ten bodies, nodes, Lilith, Chiron, Fortune, Vertex, ASC, MC) and every house cusp | The AstroWeb longitude must fall inside the displayed arcminute bin `[shown, shown + 1')` | 0.05' (3") slack at the bin edges, covering float and sub-arcsecond model differences |
| Sign, degree, minute as displayed | Categorical equality of the truncated AstroWeb value with the printed value | none |
| House number of each point | Categorical equality | none |
| Retrograde marker | Categorical equality (AstroWeb: longitude speed below zero) | none |
| Aspect set | The set of (point pair, aspect type) AstroWeb reports must equal the Astro-Seek set after both use the same orb rule (section 3.4) | none |
| Aspect orb | AstroWeb orb inside the displayed arcminute bin | 0.05' slack |
| Applying or separating | Categorical equality | none |

The regenerated Astro-Seek charts also publish an HTML table with longitudes to whole arcseconds (also truncated) and orbs to whole arcminutes. For those tables the same bin rule applies at the printed resolution: the AstroWeb longitude must fall inside `[shown, shown + 1")` widened by the tolerance of its body in section 3.3 (1.5" for the Sun and Mercury to Neptune, 3" for Pluto, 5" for the Moon) and by 1.5" for every other point (nodes, Lilith, Chiron, Fortune, Vertex, ASC, MC, cusps). The arcminute rules in the table above govern the screenshots (display verification of A and B).

A deviation outside the tolerance, or a categorical mismatch, is a discrepancy (section 6). It is investigated and resolved against these rules before acceptance; it is never absorbed by widening the tolerance after the fact.

### 3.3 AstroWeb against JPL Horizons (independent longitudes)

Only the ten standard bodies are compared, as geocentric ecliptic longitude of date for each fixture's UTC instant.

| Body | Tolerance (circular deviation) |
|---|---|
| Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune | 1.5" (0.000417°) |
| Pluto | 3" (0.000833°) |
| Moon | 5" (0.001389°) |

Basis: Astrodienst states that the Moshier model agrees with JPL to under an arcsecond for the planets and to a few arcseconds for the Moon (research note, node 12); Pluto gets a wider margin for the age of the DE404 fit. A change of sign, or of any categorical comparison in 3.2, caused by a deviation that is inside these tolerances is reported as a boundary case.

Matched conditions, recorded with the results:

- Time: Julian Day of the fixture UTC instant, passed as UT. Horizons `TIME_TYPE=UT`; AstroWeb passes the same instant to `calc_ut`. UTC and UT1 differ by under 0.9 s, which moves the Moon by at most about 0.5", inside its tolerance.
- Observing center: geocenter (`500@399`) in both.
- Frame: true ecliptic and equinox of date (Horizons quantity 31; Swiss Ephemeris default).
- Corrections: apparent places with light-time, stellar aberration and relativistic light bending by the Sun in both; no topocentric parallax.
- Ephemeris: Horizons uses JPL DE441 numerical integration; AstroWeb uses the Swiss Ephemeris Moshier semi-analytical model (`SEFLG_MOSEPH`). Their paths share no code or data.

### 3.4 Aspect rules for the matched comparison

Amended on 2026-11-21, after the eight Astro-Seek aspect lists were captured and before any aspect comparison was evaluated. The first draft of this section planned one explicit Astro-Seek orb rule for both sides. The captures showed that Astro-Seek lists one type per pair at a fixed 15° orb and takes the first type of its list in angle order (a pair 1° from a 135° aspect is listed as a trine at 13°54′), so the 15° list cannot be filtered into the set that a closest-type rule produces. The matched comparison therefore uses both captures of every dataset:

1. **Default-orb list (primary).** The AstroWeb orb table of DEC-017 was derived from the default-orb captures of the four datasets and is compared with the same four captures: the set of (point pair, aspect type) must equal the Astro-Seek set, the orb magnitude must fall in the printed arcminute bin (0.05′ slack), the orb sign must agree for orbs of at least one arcminute, and applying or separating must agree (exclusions: section 6). The table is a fit to these captures, so this comparison shows the table is internally consistent with the reference rather than independent of it; the 15° lists below provide the independent check of its limits.
2. **15° lists (independent bounds).** Everything AstroWeb reports must also be listed by Astro-Seek for that pair (same type with the same orb and status, or a type that precedes it in the list), and everything Astro-Seek lists inside the AstroWeb allowance must be reported by AstroWeb (as the same type, or as a closer one). A printed orb equal to the allowance is a boundary case, because the print is truncated.

The bounds that the 15° captures put on the orb table are: majors 6.97° to 7.02° (non-luminary) and 9.95° to 10.32° (with Sun or Moon), sextile 3.72° to 4.32° and 5.40° to 6.45°, minors 2.45° to 2.54°. The table values 7, 10, 4, 6 and 2.5 sit inside every interval.

## 4. Release evidence

The release evidence is this file with sections 5 to 7 filled in, the fixtures listed in section 1, and the passing acceptance tests (`functions/src/__tests__/natal-parity.test.ts`). It identifies every regenerated Astro-Seek chart (dataset, the URL parameters used, date of retrieval) and every explicit setting.

## 5. Point conventions and evidence (DEC-010)

All values below are deviations from the regenerated Astro-Seek charts (arcsecond tables) of datasets A to D, computed with the Swiss Ephemeris Moshier model that the profile uses (Chiron: the bundled `seas_18.se1`). The deviation is measured to the centre of the printed bin, so a perfect match shows up to 0.5″. An agreement with a regenerated chart verifies the explicitly configured convention for that chart; it says nothing about the settings of the original screenshots A and B, which are not stated in the images (DEC-012).

| Point | Convention adopted | Evidence | Alternatives rejected |
|---|---|---|---|
| North Node | Mean node; South Node = North Node + 180° | Mean node: 0.00′ to 0.01′ deviation on A, B, C, D | True node: 68.2′, 101.9′, 76.3′, 84.0′ |
| Black Moon Lilith | Mean lunar apogee | Mean apogee: 0.00′ on all four | Osculating apogee: 193′, 1210′, 196′, 1542′; interpolated apogee: 169′, 69′, 81′, 286′ |
| Chiron | Swiss Ephemeris Chiron from `seas_18.se1` (DEC-015) | 0.16″, 0.25″, 0.22″, 0.01″ | Not calculable with the Moshier model alone ("SwissEph file 'seas_18.se1' not found") |
| Part of Fortune | Day formula (ASC + Moon − Sun) when the Sun is above the true horizon, night formula (ASC + Sun − Moon) otherwise (DEC-016) | By horizon: 0.69″, 0.28″, 1.32″, 0.24″. A and D are night charts, B and C day charts | Always day: 132595″ on A and 414202″ on D. Always night: 25301″ on B and 432894″ on C. By the Sun's house (7 to 12 is day): 25301″ on B, where the Sun is in house 1 of a day chart |
| Vertex | Swiss Ephemeris vertex from the ARMC with the mean obliquity (DEC-018) | Mean obliquity: 0.27″, 0.11″, 0.40″, 0.34″ | True obliquity: 4.73″, 27.92″, 10.09″ (0.20″ on D). On B it shows 5°18′ Cancer where SRC-003 shows 5°19′ |
| House cusps, ASC, MC | Swiss Ephemeris ARMC with the mean obliquity (DEC-018) | Largest cusp deviation from the printed bin centre across 48 cusps: 0.58″; ASC and MC within 0.44″ of the printed bin centres | True obliquity: quadrant cusps off by up to 6.4″ (Placidus) and 3.3″ (Koch) |
| Retrograde marker | Longitude speed below zero | All 15 listed points of the four charts agree, including "Stationary => D" for Pluto on C (speed above zero) | none |
| Zodiac, ayanamsa | Tropical | Astro-Seek `aya=` empty in every capture | none |

The Fortune rule is a single decision of the owner (answered in this conversation, 2026-11-21): by horizon, because the evidence alone left "always day" and "by the Sun's house" excluded and "by horizon" as the only rule that fits all four charts. The screenshot of A (SRC-002) shows no Fortune and no Vertex, so that image cannot confirm either; B (SRC-003) shows Fortune at 20°12′ Aries in house 7 and Vertex at 5°19′ Cancer in house 10, and both agree with the regenerated chart.

### 5.1 Regenerated Astro-Seek charts and their explicit settings

Each chart was generated with `https://horoscopes.astro-seek.com/calculate-birth-chart-horoscope-online/` on 2026-11-21 with these explicit parameters (the exact URL of every capture is stored in its JSON file under `functions/src/__tests__/fixtures/natal-parity/astro-seek/`): manual coordinates in whole minutes, manual UT offset with no DST flag (the offset already includes daylight saving time), `house_system` as in the table, mean node and mean Lilith (`true_uzel` and `true_lilith` unchecked), Fortune, Vertex, Chiron, Lilith, node and ASC included in the aspects, all six minor aspects on, tropical zodiac (`aya=` empty). The printed UT of every capture is asserted equal to the dataset UTC instant by the acceptance tests.

| Dataset | House system | UT offset | Captures (retrieved 2026-11-21 UTC) |
|---|---|---|---|
| A | Whole Sign (`whole_horizon`) | +2 | `A-default-orbs.json` 18:30:38, `A-fixed15-orbs.json` 18:30:58 |
| B | Whole Sign | +3 | `B-default-orbs.json` 18:31:10, `B-fixed15-orbs.json` 18:31:19 |
| C | Koch | −4 | `C-default-orbs.json` 18:31:27, `C-fixed15-orbs.json` 18:31:36 |
| D | Placidus | +11 | `D-default-orbs.json` 18:31:44, `D-fixed15-orbs.json` 18:31:51 |

The default-orb captures use `tolerance=1`; the others use `tolerance=fixed_15.0`.

Original screenshot settings that could not be confirmed (recorded as required by REQ-002): the time zone and UT offset of A and B, the node type, the Lilith type and the aspect orbs. The screenshot of A omits Fortune and Vertex; the regenerated chart adds them.

## 6. Discrepancy log

| Id | Observation | Resolution |
|---|---|---|
| X-1 | With the Swiss Ephemeris default (true obliquity) the Vertex differs from Astro-Seek by 4.7″, 27.9″ and 10.1″ on A, B, C, and the quadrant cusps of C and D by up to 3.3″ and 6.4″ | Resolved by DEC-018: the houses are calculated with the mean obliquity, which reproduces all 48 cusps and four Vertex values within 1.1″ |
| X-2 | Astro-Seek never lists an aspect between ASC and MC (it would be a square at 4.4° on A) | Adopted: two angles never form an aspect (DEC-017) |
| X-3 | Astro-Seek's Fortune-to-Vertex rows are computed with Vertex at 0° Aries: A lists "Fortune Tri Vertex 6°33′" and D "Fortune Tri Vertex −0°34′", which equal the Fortune longitude measured against 0° Aries, and B and C list nothing for the pair | Reference defect. The pair is excluded from the comparison on both sides; AstroWeb computes it from the real longitudes |
| X-4 | Applying or separating for a pair of two points of the daily rotation (ASC, DSC, MC, IC, Vertex, Fortune): 21 rows over the four charts, 11 agree with numeric rates, and no assignment of speeds to the four families reproduces all 21 | AstroWeb shows no status for these pairs (`applying: null`) and the comparison asserts that. All 290 other comparable rows agree (two more are the boundary rows of X-5) |
| X-5 | Orb printed as 0°00′ for Venus octile Mars (C) and Mercury quintile Saturn (D): the side of the exact aspect is not decidable from the print | Boundary cases: the test requires a boolean status and does not compare the side |
| X-6 | Astro-Seek prints "end of 3" for Jupiter on C (35′ before the cusp of house 4) and "Stationary => D" for Pluto on C | Read as house 3 and as not retrograde; both agree with AstroWeb |
| X-7 | The 15° list takes the first type in angle order, not the closest | Section 3.4 compares the 15° lists in both directions instead of filtering them |
| X-8 | The original screenshot of A shows no Fortune or Vertex, and the screenshots omit zone, node, Lilith and orb settings | Recorded in 5.1; regenerated charts are the numerical reference (DEC-012) |
| X-9 | The accepted fact of SRC-002 says retrograde markers appear beside Uranus, Pluto and the lunar nodes. Enlarged, the wheel of the screenshot shows no marker at Uranus, its table shows R only for Pluto and the Node, and Uranus is direct on 30 Mar 2002 in the regenerated chart and in AstroWeb | The fact is imprecise; the screenshot agrees with the calculation (Pluto and the nodes). Not a calculation discrepancy |

## 7. Results

Command: `npm test --workspace=functions` (file `src/__tests__/natal-parity.test.ts`, 63 tests; the final full-suite counts are in the pull request).

| Dataset | Points compared to the arcsecond tables | Largest deviation from the bin centre | Cusps compared | Largest cusp deviation | Horizons: ten bodies, largest deviation | Aspects (default-orb list) | Applying or separating compared |
|---|---|---|---|---|---|---|---|
| A | 17 | 0.92″ (Moon) | 12 | 0.50″ | 0.491″ (Moon) | 76 of 76 equal, plus Fortune–Vertex | 72, 0 differences |
| B | 17 | 1.01″ (Moon) | 12 | 0.50″ | 0.482″ (Moon) | 65 of 65 equal, plus Fortune–Vertex | 60, 0 differences |
| C | 17 | 1.40″ (Moon) | 12 | 0.39″ | 1.157″ (Moon) | 82 of 82 equal | 77, 0 differences (1 boundary row) |
| D | 17 | 0.66″ (Pluto) | 12 | 0.58″ | 0.694″ (Pluto) | 90 of 90 equal, plus Fortune–Vertex | 81, 0 differences (1 boundary row) |

Every deviation is inside the tolerance of section 3 (1.5″, 3″ for Pluto, 5″ for the Moon, plus the 0.5″ half bin). Categorical comparisons (sign, degree, minute, house, retrograde marker) have no mismatches. "Plus Fortune–Vertex" counts the pair that the reference computes wrongly (X-3).

### 7.1 Original screenshots (display verification, arcminute bin)

The position tables of SRC-002 (dataset A) and SRC-003 (dataset B) were transcribed into `functions/src/__tests__/fixtures/natal-parity/screenshots.json`. For every printed row of both images (A: 13 points plus ASC and MC; B: 15 points plus ASC and MC) the AstroWeb sign, degree, minute (truncated like the print), house and retrograde marker are equal to the printed values: 32 of 32 position rows, 28 of 28 point house numbers, and every printed retrograde marker (A: Pluto, Node; B: Jupiter, Saturn, Uranus, Neptune, Node). The element-by-modality totals of the two images are recorded in the same file and are reconciled with the profile summaries in the web tests.

### 7.2 Aspect glyph inventory (REQ-003)

Every aspect glyph visible in the matrices of SRC-002 and SRC-003 (SRC-003 shows all eleven kinds), the Astro-Seek aspect code of its list, the supported type and the glyph of the profile. Astro-Seek abbreviates to three letters, so the codes `Tri` and `Qui` are ambiguous and the tests resolve them from the longitudes (section 3.4).

| Picture glyph | Astro-Seek code | Type (angle) | Profile glyph | Class |
|---|---|---|---|---|
| ☌ (dotted-border cells) | Con | conjunction (0°) | ☌ | major |
| green ⚺-like "V" | Sem | semi-sextile (30°) | ⚺ | minor |
| red ∠ | Oct | semi-square (45°) | ∠ | minor |
| blue ✱ | Sex | sextile (60°) | ⚹ | major |
| green Q | Qui | quintile (72°) | Q | minor |
| red □ | Squ | square (90°) | □ | major |
| blue △ | Tri | trine (120°) | △ | major |
| red square with a tail | Tri | sesquiquadrate (135°) | ⚼ | minor |
| green bQ | Bi- | bi-quintile (144°) | bQ | minor |
| green ⚻-like "⊼" | Qui | quincunx (150°) | ⚻ | minor |
| red ☍ | Opp | opposition (180°) | ☍ | major |

### 7.3 Display verification in the MarkView browser (REQ-001)

Method: the production calculation code (`functions/lib/astro/chart.js`) behind a local mock of the `getProfile` and `getChart` callables, the web app served by Vite, synthetic profiles with the birth inputs of datasets A to D, an unknown-time profile and a polar-latitude profile; the MarkView browser compared the page with the images. After the merge the deployed page was opened read-only (section 7.4).

| Check | Result |
|---|---|
| A, Whole Sign, against SRC-002 | House 1 is Aquarius on the 9 o'clock axis, the zodiac runs counter-clockwise. ASC 24°58′ Aquarius lies at its own longitude below the axis, MC 20°37′ Scorpio at the top, DSC and IC opposite. Pluto, the North Node and the South Node carry R. The positions table equals the printed table row by row (also asserted by `natal-parity.test.ts`). Element totals are those of SRC-002 plus Part of Fortune and Vertex, which the screenshot lacks: Fire 5 (4), Earth 2 (2), Air 6 (6), Water 4 (3), Cardinal 7 (6), Fixed 6 (5), Mutable 4 (4). |
| B, Whole Sign, against SRC-003 | ASC 23°43′ Libra, MC 24°19′ Cancer, Fortune 20°12′ Aries (house 7), Vertex 5°19′ Cancer (house 10), all twelve cusp labels `0° sign 00′`, R on Jupiter, Saturn, Uranus, Neptune and the nodes. Element totals equal the picture: Fire 7, Earth 2, Air 5, Water 3, Cardinal 6, Fixed 6, Mutable 5. |
| SRC-004 by element | The inventory (`docs/verification/natal-chart-wheel-inventory.md`) lists every element of the three pictures; none is left undrawn. Differences in layout only: the circled ASC and MC markers of SRC-003 and the short labels inside the house ring of SRC-004 are drawn as name, sign, degree and minute at the ring end. |
| Aspect list and matrix | The list opens with the five major types, the matrix with all eleven; the pairs, types, signed orbs and a/s markers are identical (asserted by `tables.test.tsx`). |
| Unknown birth time | No angles, houses, cusps or house numbers; the zodiac starts at 0° Aries on the left; a note says the positions are local-noon estimates; the Houses tab shows only that notice. |
| Placidus at 69.6°N | The Houses tab names Whole Sign as the actual system and shows the requested system apart from it. |
| Phone width (390 px) | No horizontal scroll of the page; the wheel scales to the column. |

Hover on a point was checked in the browser: the tooltip shows sign, degree, minute, house and the shared aspects of the point with signed orb and applying or separating. Tap selection is covered by the pure-function tests only.

### 7.4 Deployed version

CI run `44941696018` (push of merge commit `1a4780d` to `main`) built and deployed with Firebase. The deployed page shows `v2.26.0`. On the live page, read-only (no purchase, unlock or generation), the Chart tab shows the new wheel for a real profile with Chiron present (the bundled ephemeris file works in the Cloud Function), the selector switches Koch to Whole Sign and the wheel redraws with twelve cusp labels, the Planets tab lists 18 position rows and the four element rows, the Aspects tab lists 47 aspects with the default filters and a 16-row matrix, the Houses tab names the system and prints no `°60′`, and the browser console has no errors.

