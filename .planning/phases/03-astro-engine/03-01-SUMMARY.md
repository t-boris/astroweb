---
phase: 03-astro-engine
plan: 01
subsystem: astro
tags: [sweph, swiss-ephemeris, luxon, ephemeris, zodiac, aspects]

# Dependency graph
requires:
  - phase: 02-profile-backend
    provides: types/index.ts with ChartAspect, ChartPoint, ChartHouses types
provides:
  - Swiss Ephemeris (sweph) native module installed and working
  - Ephemeris wrapper (calcPlanetPosition, computeJulianDay, computeHouseCusps)
  - Zodiac longitude-to-sign conversion
  - Aspect detection algorithm with wrap-around safety
  - Astrological constants (bodies, signs, aspects, house systems, calc flags)
affects: [03-02-chart-orchestrator, 03-03-caching-endpoint]

# Tech tracking
tech-stack:
  added: [sweph, luxon, "@types/luxon"]
  patterns: [moshier-ephemeris-init-at-module-load, triangular-aspect-iteration, wrap-around-angular-difference]

key-files:
  created:
    - functions/src/astro/constants.ts
    - functions/src/astro/ephemeris.ts
    - functions/src/astro/zodiac.ts
    - functions/src/astro/aspects.ts
  modified:
    - functions/package.json
    - package-lock.json

key-decisions:
  - "Constants accessed via sweph 'constants' sub-object (not direct exports)"
  - "Moshier ephemeris initialized with empty string (set_ephe_path(''))"
  - "House cusps returned as 0-indexed array from sweph tuple (not 1-indexed)"
  - "6-degree fixed orb for all 5 major aspects"

patterns-established:
  - "Module-level sweph init: set_ephe_path called once at import time"
  - "Triangular iteration for aspect detection: i < j avoids duplicate pairs"
  - "Angular difference formula: raw > 180 ? 360 - raw : raw"

issues-created: []

# Metrics
duration: 3min
completed: 2026-02-11
---

# Phase 3 Plan 1: Astro Computation Primitives Summary

**Swiss Ephemeris (sweph) native module installed with Moshier ephemeris; 4 stateless computation modules created: constants, ephemeris wrapper, zodiac conversion, and aspect detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-11T19:14:06Z
- **Completed:** 2026-02-11T19:17:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed sweph native module (node-gyp build succeeded on macOS) with luxon for timezone handling
- Created typed ephemeris wrapper around sweph calc_ut, julday, and houses functions
- Created zodiac longitude-to-sign converter with proper 0-360 normalization
- Created wrap-around-safe aspect detection across all point pairs with triangular iteration

## Task Commits

Each task was committed atomically:

1. **Task 1: Install sweph + luxon and create constants/ephemeris modules** - `42e471b` (feat)
2. **Task 2: Create zodiac conversion and aspect detection modules** - `c18351e` (feat)

## Files Created/Modified
- `functions/src/astro/constants.ts` - BODIES, ZODIAC_SIGNS, ASPECT_DEFINITIONS, HOUSE_SYSTEM_CODES, CALC_FLAGS
- `functions/src/astro/ephemeris.ts` - calcPlanetPosition, computeJulianDay, computeHouseCusps (Moshier init)
- `functions/src/astro/zodiac.ts` - longitudeToZodiac, longitudeToSign with normalization
- `functions/src/astro/aspects.ts` - angularDifference, detectAspect, detectAllAspects with ChartAspect type
- `functions/package.json` - Added sweph, luxon, @types/luxon dependencies
- `package-lock.json` - Lock file updated

## Decisions Made
- 03-01: sweph constants accessed via `constants` sub-object (e.g., `constants.SE_SUN`), not direct exports
- 03-01: Moshier ephemeris initialized with `set_ephe_path('')` (empty string, not null, per TypeScript signature)
- 03-01: sweph `houses()` returns 0-indexed tuple (house_1 through house_12), converted to plain array
- 03-01: sweph `calc_ut` returns named tuple (lon, lat, dist, lonSpd, latSpd, distSpd), accessed by index
- 03-01: Fixed 6-degree orb for all 5 major aspects (conjunction, sextile, square, trine, opposition)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted sweph API access pattern to actual TypeScript types**
- **Found during:** Task 1 (constants.ts and ephemeris.ts creation)
- **Issue:** Plan assumed `sweph.SE_SUN`, `sweph.FLG_SPEED` etc. as direct exports. Actual API uses `constants.SE_SUN`, `constants.SEFLG_SPEED` via sub-object import.
- **Fix:** Used `import { constants } from 'sweph'` and `import { calc_ut, julday, houses, set_ephe_path } from 'sweph'` destructured imports
- **Files modified:** constants.ts, ephemeris.ts
- **Verification:** TypeScript compiles, sweph functions accessible at runtime
- **Committed in:** 42e471b (Task 1 commit)

**2. [Rule 3 - Blocking] sweph houses returns 0-indexed tuple, not 1-indexed array**
- **Found during:** Task 1 (ephemeris.ts computeHouseCusps)
- **Issue:** Plan and research doc said cusps[0] unused with data in cusps[1-12]. Actual sweph TypeScript API returns a named tuple (house_1 through house_12) that is 0-indexed.
- **Fix:** Used `Array.from(result.data.houses)` to convert tuple to plain array; points accessed via `result.data.points[0]` (asc), `[1]` (mc), `[2]` (armc)
- **Files modified:** ephemeris.ts
- **Verification:** TypeScript compiles with correct types
- **Committed in:** 42e471b (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to match actual sweph TypeScript API. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- All 4 computation primitive modules ready for the chart orchestrator (03-02)
- sweph native build confirmed working on macOS
- Types align with ChartAspect, ChartPoint definitions in types/index.ts
- Ready for 03-02-PLAN.md (computeNatalChart orchestrator)

---
*Phase: 03-astro-engine*
*Completed: 2026-02-11*
