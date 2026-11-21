# Natal chart wheel inventory

Feature: `natal-chart-parity-and-verification` (REQ-001, REQ-002, REQ-003, DEC-011, DEC-014, DEC-016, DEC-017, SRC-005).

Owner requirement (SRC-005): the way the profile draws the natal wheel must include all the functionality visible in the three reference pictures.

| Reference | File | Chart |
|---|---|---|
| SRC-002 | `docs/features/natal-chart-parity-and-verification/references/SRC-002-post-picture-1.webp` | Astro-Seek, 30 Mar 2002 03:30, Cape Town, Whole Sign (fixture A) |
| SRC-003 | `docs/features/natal-chart-parity-and-verification/references/SRC-003-post-picture-2.webp` | Astro-Seek, 25 Sep 1999 07:24, Riyadh, Whole Sign (fixture B) |
| SRC-004 | `docs/features/natal-chart-parity-and-verification/references/SRC-004-post-picture-12.webp` | Astro-Seek, birth inputs and house system not stated (the house boundaries sit on sign boundaries and the ASC, 26°31′, is off the left axis, which looks like Whole Sign) |

This file lists every functional element of the three pictures, how the profile draws it, and in which file. It is written from the code and the pictures as they stand, and says plainly what is **not** drawn.

All wheel files are in `web/src/components/chart/`. The wheel is one SVG (`viewBox 0 0 1000 1000`) built by `NatalChart.tsx`; its layers are drawn bottom to top: sign ring, degree scale, houses, cusp labels, aspect lines, angle axes, points.

## 1. Elements of the wheel (the SVG)

| # | Element | Where seen | How the profile wheel draws it | Component / file |
|---|---|---|---|---|
| 1 | Orientation: house 1 cusp on the left (9 o'clock) axis, zodiac counter-clockwise | SRC-002, SRC-003, SRC-004 | The whole wheel is rotated by `wheelRotation(chart)` (the house 1 cusp longitude); a longitude `lon` is drawn at SVG angle `180 + (lon - rotation)`. In Whole Sign the ASC therefore lies inside house 1, off the axis (fixture A: 24.98 degrees below it, as in SRC-002). The old formula `180 - (lon - asc)` mirrored the zodiac and is replaced. | `packages/chart-core/src/chartMath.ts` (`eclipticToSvgAngle`), `packages/chart-core/src/positions.ts` (`wheelRotation`) |
| 2 | Orientation for an unknown birth time | not in the pictures; REQ-001 | Rotation 0: 0 degrees Aries on the left axis. | same |
| 3 | Zodiac ring with the 12 sign glyphs | all three | 12 sectors from `signInner` to `outerRadius`, element-tinted, one glyph per sign in the middle of its sector (`data-sign`), written with the text-presentation selector so Chrome does not substitute colour emoji. | `ZodiacRing.tsx`, `packages/chart-core/src/wheelLayout.ts` (`signGlyph`) |
| 4 | Degree scale: a tick at every degree, longer at every 5 and 10 | all three | 360 ticks hanging inward from the sign ring in three paths, `data-scale="degree"` (288 ticks, 5 long), `"five"` (36, 9 long), `"ten"` (36, 14 long); two guide circles. | `DegreeScale.tsx`, `packages/chart-core/src/wheelLayout.ts` (`degreeScaleTicks`) |
| 5 | House cusp lines | all three | 12 radial lines (`data-house-cusp`) at the calculated cusps, from the inner circle to the sign ring; none when the birth time is unknown. In Whole Sign they are the sign boundaries; in Koch and Placidus they are unevenly spaced. | `HouseCusps.tsx` |
| 6 | House numbers 1 to 12 | all three | Numbers (`data-house-number`) in a house ring (radius 238 to 200), each at the middle of its house between its two cusps; none when the time is unknown. | `HouseCusps.tsx`, `packages/chart-core/src/wheelLayout.ts` (`houseMidLongitude`) |
| 7 | ASC, DSC, MC, IC as thick axes, separate from the house lines | SRC-002, SRC-004 (SRC-003 marks ASC and MC with circled labels) | Four thick gold lines at the angle's own longitude from the inner circle to the sign ring, with a thin extension across the sign band. In Whole Sign they are independent of the cusps (REQ-001, as in SRC-002 and SRC-004); in Koch and Placidus the ASC lies on cusp 1 and the MC on cusp 10. None when the time is unknown. | `AngleAxes.tsx`, `packages/chart-core/src/wheelLayout.ts` (`angleEntries`) |
| 8 | Angle label: name, sign glyph, degree, minute | SRC-002, SRC-004 (degree and minute at the ring end); SRC-003 (circled ASC, MC inside the planet stack) | Outside the ring at the end of each axis: name (`ASC`, `DSC`, `MC`, `IC`), then degree with the sign glyph, then minute (for example `ASC 24° ♒ 58′`). The picture variants put these parts in different places; the profile uses one layout, all parts present. | `AngleAxes.tsx`, `packages/chart-core/src/wheelLayout.ts` (`angleLabelCenter`) |
| 9 | House cusp longitude labels: degree, sign glyph, minute at every cusp | SRC-003 (`00 ♎ 00` at each Whole Sign cusp; SRC-002 and SRC-004 print none) | Outside the sign ring, on the cusp line, in the same form as the angle labels (degree with sign glyph, then minute) but smaller (13 against 15) and dimmer, marked `data-cusp-label="1"` to `"12"`. The cusp line is carried across the sign band to a mark at the exact longitude. Whole Sign: all 12 (each `0° sign 00′`). Koch and Placidus: 8, because cusps 1, 4, 7 and 10 are the ASC, IC, DSC and MC (equal within 0.01 degrees) and the angle label already shows that value. A label too close to another cusp label or to an angle label (7 degrees) is moved along the ring with the label spreading, never hidden, and joined to its cusp by a short dashed leader; the angle labels never move. None when the birth time is unknown. | `CuspLabels.tsx`, `packages/chart-core/src/wheelLayout.ts` (`cuspLabels`, `cuspLabelCenter`), `packages/chart-core/src/labelSpread.ts` (`fixed` labels), `packages/chart-core/src/constants.ts` (`OUTER_LABEL_GAP_DEG`, `CUSP_ANGLE_TOLERANCE_DEG`) |
| 10 | Planet glyphs: Sun to Pluto | all three | Glyph at the point's display angle (`data-field="glyph"`). | `PlanetMarkers.tsx`, `packages/chart-core/src/wheelLayout.ts` (`placePoints`) |
| 11 | Extra points: North Node, South Node (the opposite node), Black Moon Lilith, Chiron, Part of Fortune, Vertex | SRC-002 (both nodes, Lilith, Chiron), SRC-003 (also Fortune and Vertex), SRC-004 (both nodes, Lilith, Chiron) | Every entry of `getPositions` is drawn; Fortune as the circled cross, Vertex as the text glyph `Vx` (set smaller). Fortune and Vertex are absent for an unknown birth time because they are not calculated; Chiron is absent when the ephemeris has no value for the date. | `PlanetMarkers.tsx`, `packages/chart-core/src/positions.ts` (`getPositions`), `packages/chart-core/src/constants.ts` |
| 12 | Position annotation next to each point: degree, sign glyph, minute | all three | A stack inward from the glyph: `dd°`, sign glyph, `mm′` (`data-field="degree"`, `"sign"`, `"minute"`). Degree and minute are truncated, as every other view and Astro-Seek do. | `PlanetMarkers.tsx`, `packages/chart-core/src/positions.ts` (`splitLongitude`) |
| 13 | Retrograde marker "R" | all three | A red `R` beside the glyph (`data-retrograde-marker`), set tangentially so it does not meet the degree label. Fixture A: Pluto, North Node, South Node (SRC-002); B: Jupiter, Saturn, Uranus, Neptune and both nodes (SRC-003 prints R for the listed node; the opposite node is marked too because it moves with it, and the chart data says so). | `PlanetMarkers.tsx` |
| 14 | Tick on the ring at the exact longitude, leader to the displaced label | all three (SRC-002 and SRC-004 show the ticks and the leader lines) | A short tick on the degree scale at the point's exact longitude (`data-tick="ring"`) and a leader line (`data-leader`) to its label; the leader is dashed when the label had to move. | `PlanetMarkers.tsx` |
| 15 | Crowded points: labels that do not overlap | SRC-002, SRC-003, SRC-004 | Pure circular spreading of the display angles with a minimum gap of 8 degrees: stable cyclic order, wrap-aware, never hides a point, keeps the mean of a cluster, gap shrinks to 360/n only if the circle cannot hold it. | `packages/chart-core/src/labelSpread.ts`, `packages/chart-core/src/wheelLayout.ts` (`placePoints`) |
| 16 | Aspect lines inside the inner circle, ending at the points' longitudes | all three | One line per shared aspect between the two exact longitudes (`longitudeOfId`), ending in a tick on the inner circle (`data-tick="inner"`). Lines to the ASC and MC are drawn, as in SRC-002 and SRC-004. The South Node has none. | `AspectLines.tsx`, `packages/chart-core/src/wheelLayout.ts` (`aspectSegments`), `PlanetMarkers.tsx` |
| 17 | Aspect line colour, weight and style | SRC-002 (colours, weights, solid and dotted), SRC-004 (red and blue, solid and dotted, different weights) | Colour per aspect type; major aspects solid, minor aspects dashed (`6 5`) and a distinct colour; width `0.8 + 3.2 * exactness` and opacity `0.35 + 0.55 * exactness`, so a tighter orb is heavier. Applying or separating is not on the line, only in the tooltip. | `AspectLines.tsx`, `packages/chart-core/src/wheelLayout.ts` (`aspectStrokeWidth`, `aspectStrokeOpacity`), `packages/chart-core/src/constants.ts` |
| 18 | Aspect glyph on the line | SRC-003 | The type's glyph at the line's midpoint (moved to 0.3 along near-diameter chords so oppositions do not pile up in the centre), only on lines of 36 units or more; on by default, switchable with a toggle under the wheel. | `AspectLines.tsx`, `NatalChart.tsx` |
| 19 | Aspect filters | not in the pictures; REQ-003 and DEC-011 | 11 toggles in two groups (5 major, 6 minor) plus "Show all" and "Reset"; a filter only hides, it never changes the shared set. Default view: the 5 major aspects. | `AspectFilters.tsx`, `packages/chart-core/src/aspectFilters.ts` (`useAspectFilters`, `filterAspects`) |
| 20 | Hover or tap detail | not in the pictures; brief | Hover or tap a point or an angle: others dim to 0.15, only its aspects stay; a tooltip gives name, sign, degree, minute, house, retrograde, and the shared aspects of that point with orb and applying or separating. Same values as the tables (`formatDegreeMinute`, `formatOrb`). | `ChartTooltip.tsx`, `PlanetMarkers.tsx`, `AngleAxes.tsx`, `NatalChart.tsx` |
| 21 | Unknown birth time | REQ-001 | No houses, house numbers, axes or angle labels, no Fortune or Vertex; the zodiac starts at 0 degrees Aries on the left; a visible note under the wheel says the positions are local-noon estimates (`data-wheel-note="time-estimated"`). | `NatalChart.tsx` |
| 22 | Accessible name | brief | `role="img"` and a translated `aria-label` on the SVG (EN and RU). | `NatalChart.tsx`, `public/locales/*/translation.json` (`natalWheel`) |

### 1.1 Differences in layout and notes

Every function visible in the pictures is drawn (rows 1 to 22). These differences remain, none of them a missing element:

| Item | Where seen | Status |
|---|---|---|
| Circled `ASC` and `MC` markers in the planet stack | SRC-003 | The data are drawn (axes, labels, aspect lines); the picture's circled-marker layout is not reproduced. See row 8. |
| Short `ASC`, `DSC`, `MC`, `IC` labels inside the house ring | SRC-004 | Not reproduced; the name is part of the label at the ring end (row 8). |
| Astro-Seek logo, watermark and the header text inside the picture | all three | Not drawn, deliberately (not a function). The same information is given outside the SVG, see section 2. |

Applying or separating is not drawn on the lines (DEC-017); it is in the tooltip and in the tables, as the pictures show it only in the matrix.

Reveal animation: the reveal styles are kept, but the keyframes they refer to (`chart-fade-in`, `chart-line-draw`, `chart-glow-pulse`, `chart-shimmer`) no longer exist in the CSS (removed in commit 748d716), so the reveal is effectively instant. Not changed here.

## 2. Elements of the pictures that are not part of the wheel SVG

These are drawn by components owned by another agent. They are listed so that nothing in the pictures is unaccounted for; **they were not verified here**.

| Element | Where seen | Component / file |
|---|---|---|
| Chart header: date, time, place, coordinates, house system | SRC-002, SRC-003 (printed top left in the picture) | `ChartContextLine.tsx`, `HouseSystemSelector.tsx` |
| Position table: sign, degree, minute, house for the bodies, nodes, Lilith, Chiron, Fortune, Vertex, ASC, MC; retrograde mark | SRC-002, SRC-003 | `PlanetsTable.tsx` |
| Lower-triangular aspect matrix with glyphs, signed orbs, `a` or `s` | SRC-002, SRC-003 | `AspectMatrix.tsx` |
| Aspect list | not in the pictures | `AspectsTable.tsx` |
| Element by modality grid with totals | SRC-002, SRC-003 | `ElementModalityGrid.tsx` |
| Degree-within-sign strip (0 to 30 degrees) | SRC-002 | `DegreeStrip.tsx` |

## 3. How the wheel was verified

Run on branch `feat/natal-chart-parity-and-verification`, 2026-11-21.

| Check | Result |
|---|---|
| `cd web && npx tsc -b` | no errors |
| `cd web && npx vitest run` | 23 files, 332 tests, all pass; 122 of them are the wheel tests listed below |
| `npx eslint src/components/chart` (including tests and utils) | no warnings, no errors |
| `utils/__tests__/labelSpread.test.ts` | 16 tests: no overlap, stable order, wrap-around at 0 and 360, never drops a label, falls back to even spacing, fixed labels that never move |
| `utils/__tests__/chartMath.test.ts` | 10 tests: the rotation longitude is on the left axis, zodiac counter-clockwise, ASC and MC placement of A and C |
| `utils/__tests__/wheelLayout.test.ts` | 43 tests: scale ticks, label placement, angle entries, cusp labels (12 in Whole Sign, 8 in Koch and Placidus, 0.01 degree rule, spreading of narrow houses, clearance from the angle labels), aspect segments, and the table values of SRC-002 and SRC-003 for A and B |
| `__tests__/NatalChart.test.tsx` | 53 tests, server-rendered `NatalChart` for fixtures A, B, C, D and unknown time (EN and RU): 12 sign glyphs, scale ticks 288 + 36 + 36, 12 cusps and house numbers, cusp 1 on the left axis, ASC, DSC, MC, IC with name, sign, degree and minute, ASC 24° 58′ Aquarius and MC 20° 37′ Scorpio of A and ASC 23° 43′ of B, every point with glyph, degree, sign, minute, cusp labels (12 with 0° 00′ of the sign in A and B, house 1 = 0° Aquarius in A and 0° Libra in B, houses 2, 3, 5, 6, 8, 9, 11, 12 with the cusp values in C and D, none for unknown time, on the cusp line, inside the view box, clear of the angle labels), the `R` markers equal the retrograde points, ring ticks at the exact longitude, default view shows only the major aspects of the shared set, minors dashed when shown, aspect symbols on and off, dimming, the filters, the tooltip content, and for unknown time no houses, angles or cusps and the local-noon note |
| Rendered SVG of A, B, C, D and unknown time, checked numerically | house 1 cusp at SVG angle 180.000 in every dataset; fixture A: ASC axis end at 204.98 (= 180 + 24.98), MC at 110.62; B: ASC at 203.72, MC at 114.33; C and D (Koch, Placidus): ASC at exactly 180 and DSC at 0. No label outside the view box. Estimated text boxes of different labels never overlap, cusp labels (A 12, B 12, C 8, D 8) included against the angle labels, the point labels and the house numbers (0 cross-label overlaps in all five; cusp labels moved with a leader: A 2, B 4, C 0, D 0). Inside one point's own stack, 18 pairs touched with deliberately crude glyph widths (A 6, B 3, C 5, D 3, unknown 1), none visible in the screenshots, but the real text widths depend on the browser font. |
| Headless Chrome screenshots of the five renders, compared by eye with the three pictures | orientation, axes, labels, stacks, retrograde marks, ticks and aspect styling match the pictures except for the elements in section 1.1. The images are in the session scratchpad, not in the repository. |

Not verified: behaviour in a real browser session (hover and tap, tooltip position, the toggle buttons), touch devices, and the live profile page. The tests run in a node environment without a DOM, so the interactive parts are covered only by their markup and their pure helpers.
