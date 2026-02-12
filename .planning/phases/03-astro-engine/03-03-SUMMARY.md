---
phase: 03-astro-engine
plan: 03
subsystem: api
tags: [cloud-functions, onCall, cache-through, ownership-validation, HttpsError]

# Dependency graph
requires:
  - phase: 03-astro-engine/01
    provides: Swiss Ephemeris computation primitives (ephemeris, zodiac, aspects, constants)
  - phase: 03-astro-engine/02
    provides: computeNatalChart orchestrator, chart caching service, house calculation
  - phase: 02-profile-backend
    provides: profile service with getProfileById for ownership checks
provides:
  - computeNatalChart Cloud Function endpoint (compute + cache + return ChartResult)
  - getChart Cloud Function endpoint (cache-through with cached boolean)
  - 7 total Cloud Functions exported from index.ts
affects: [04-profile-ui, 05-chart-visualization, 06-data-tables]

# Tech tracking
tech-stack:
  added: []
  patterns: [cache-through-endpoint, ownership-check-before-compute, re-throw-HttpsError]

key-files:
  created:
    - functions/src/api/computeNatalChart.ts
    - functions/src/api/getChart.ts
  modified:
    - functions/src/index.ts

key-decisions:
  - "computeNatalChart returns ChartResult directly; getChart wraps with { cached, chart } for client clarity"
  - "Both endpoints enforce ownerDeviceId ownership before any computation"
  - "Cache check before compute in both functions avoids redundant ephemeris calls"

patterns-established:
  - "Ownership check pattern: fetch profile -> verify ownerDeviceId -> proceed or throw"
  - "Cache-through endpoint: computeInputHash -> findCachedChart -> compute if miss -> storeChart"
  - "HttpsError re-throw: catch block checks instanceof HttpsError to preserve error codes"

issues-created: []

# Metrics
duration: 1min
completed: 2026-02-12
---

# Phase 3 Plan 3: Cloud Function Endpoints Summary

**computeNatalChart and getChart onCall Cloud Functions with ownership validation, SHA-256 cache lookup, and structured HttpsError responses completing the Phase 3 astro engine**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-12T01:23:33Z
- **Completed:** 2026-02-12T01:24:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created computeNatalChart endpoint: validates input, checks ownership, uses cache, computes chart, stores result
- Created getChart endpoint: cache-through pattern returning { cached: boolean, chart: ChartResult } for client awareness
- Wired both functions into index.ts, bringing total Cloud Functions to 7
- Full TypeScript build succeeds with all astro modules, services, and API endpoints compiled

## Task Commits

Each task was committed atomically:

1. **Task 1: Create computeNatalChart and getChart Cloud Functions** - `14cfd42` (feat)
2. **Task 2: Wire up exports in index.ts and verify full build** - `526f0eb` (feat)

## Files Created/Modified
- `functions/src/api/computeNatalChart.ts` - onCall function: validates, ownership check, cache check, compute, store, return ChartResult
- `functions/src/api/getChart.ts` - onCall function: validates, ownership check, cache-through with { cached, chart } response
- `functions/src/index.ts` - Added computeNatalChart and getChart exports (7 total functions)

## Decisions Made
- 03-03: computeNatalChart returns raw ChartResult; getChart wraps with { cached, chart } to indicate freshness to client
- 03-03: Both endpoints share identical validation and ownership check patterns for consistency
- 03-03: Cache check happens before computation in both endpoints to avoid redundant ephemeris calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Phase 3 complete: full astro computation engine operational (primitives -> orchestrator -> caching -> endpoints)
- 7 Cloud Functions ready: 5 profile CRUD + 2 chart computation/retrieval
- Frontend can call computeNatalChart to force compute, or getChart for cache-through retrieval
- Ready for Phase 4: Profile UI & Geocoding

---
*Phase: 03-astro-engine*
*Completed: 2026-02-12*
