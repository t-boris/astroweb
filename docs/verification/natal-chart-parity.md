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

Eligibility and orb rules for the shared aspect set are defined from the reference inventory (REQ-003, plan I-5) and recorded in section 5 before the aspect comparison is evaluated. For the matched comparison Astro-Seek is configured with an explicit orb rule rather than its default orbs, so that both sides apply the same rule.

## 4. Release evidence

The release evidence is this file with sections 5 to 7 filled in, the fixtures listed in section 1, and the passing acceptance tests (`functions/src/__tests__/natal-parity.test.ts`). It identifies every regenerated Astro-Seek chart (dataset, the URL parameters used, date of retrieval) and every explicit setting.

## 5. Point conventions and evidence (DEC-010)

_To be completed with the reproduction results._

## 6. Discrepancy log

_None recorded yet._

## 7. Results

_To be completed by the acceptance tests and the comparison run._
