---
phase: 03-astro-engine
plan: 02
subsystem: astro
tags: [chart-orchestrator, houses, placidus, whole-sign, firestore-cache, sha256, luxon]

# Dependency graph
requires:
  - phase: 03-astro-engine/01
    provides: ephemeris wrapper, zodiac conversion, aspect detection, constants
provides:
  - computeNatalChart orchestrator (birth data -> full ChartResult)
  - House cusp calculation with Placidus and Whole Sign support
  - Planet-to-house placement with 0/360 wrap-around handling
  - Chart Firestore caching service with SHA-256 inputHash
affects: [03-03-caching-endpoint, 04-profile-ui, 05-chart-visualization]

# Tech tracking
tech-stack:
  added: []
  patterns: [chart-computation-pipeline, cache-through-pattern, cusp-range-house-placement]

key-files:
  created:
    - functions/src/astro/houses.ts
    - functions/src/astro/chart.ts
    - functions/src/services/chart.ts
  modified: []

key-decisions:
  - "Cusp range logic for house placement (iterate cusps, handle 0/360 wrap)"
  - "Placidus failure fallback to Whole Sign at extreme latitudes"
  - "Noon default for timeUnknown with null house assignments and ASC/MC"
  - "SHA-256 hash of canonical input string for chart cache key"
  - "Batch delete for chart cleanup on profile deletion"

patterns-established:
  - "Chart pipeline: local time -> UTC -> JD -> planets -> houses -> placement -> aspects -> result"
  - "Cache-through: findCachedChart -> miss -> compute -> storeChart"
  - "Cusp wrap-around: if cuspStart > cuspEnd, check lon >= cuspStart OR lon < cuspEnd"

issues-created: []

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 3 Plan 2: Chart Orchestrator & Caching Service Summary

**computeNatalChart pipeline transforming birth data through UTC/JD/planets/houses/aspects into ChartResult, plus SHA-256 inputHash-based Firestore caching service**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T01:19:40Z
- **Completed:** 2026-02-12T01:21:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created full chart computation pipeline: local time -> UTC -> Julian Day -> 10 planetary positions -> house cusps -> house placement -> aspect detection -> ChartResult
- Implemented house calculation with both Placidus and Whole Sign, with cusp range logic handling 0/360 wrap-around for planet placement
- Built chart Firestore caching service with SHA-256 inputHash, cache lookup, store, retrieval, and batch delete
- Handles timeUnknown edge case: uses noon, nullifies house assignments and ASC/MC

## Task Commits

Each task was committed atomically:

1. **Task 1: Create astro/houses.ts and astro/chart.ts orchestrator** - `e37482b` (feat)
2. **Task 2: Create chart Firestore caching service** - `3311c3c` (feat)

## Files Created/Modified
- `functions/src/astro/houses.ts` - calculateHouses (cusp computation) and findHouseForLongitude (planet placement)
- `functions/src/astro/chart.ts` - computeNatalChart orchestrator with ComputeChartInput interface
- `functions/src/services/chart.ts` - computeInputHash, findCachedChart, storeChart, getChartByProfileId, deleteChartsByProfileId

## Decisions Made
- 03-02: Cusp range iteration for house placement (handles both normal and wrap-around cases uniformly)
- 03-02: Placidus failure at extreme latitudes falls back to Whole Sign with console warning
- 03-02: timeUnknown uses noon (12:00), sets ASC/MC to null, leaves house assignments null
- 03-02: SHA-256 hash of pipe-delimited canonical string (birthDate|birthTime|lat|lng|timezone|houseSystem)
- 03-02: Firestore batch delete for chart cleanup (efficient for multi-chart profiles)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- computeNatalChart produces complete ChartResult from birth data
- Chart caching service ready for use in getChart endpoint (03-03)
- All astro modules compose cleanly: constants -> ephemeris -> zodiac/houses -> chart
- Ready for 03-03-PLAN.md (getChart endpoint with caching)

---
*Phase: 03-astro-engine*
*Completed: 2026-02-11*
