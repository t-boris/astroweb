---
phase: 07-testing-polish
plan: 02
subsystem: api, ui
tags: [firebase-functions, logger, i18n, error-handling, retry, structured-logging]

# Dependency graph
requires:
  - phase: 02-profile-backend
    provides: Cloud Functions API handlers
  - phase: 04-profile-ui
    provides: UI pages (Home, ProfileCreate, ProfileDetail)
provides:
  - Structured logging in all Cloud Functions via firebase-functions logger
  - Translated user-facing error messages (EN + RU)
  - Retry buttons on all error states
affects: [07-testing-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structured logging with firebase-functions/v2 logger (info at entry, error in catch)"
    - "Error mapping helper pattern: getErrorMessage(err, fallbackKey) per page"
    - "Retry via state counter in useEffect dependency array"

key-files:
  created: []
  modified:
    - functions/src/api/computeNatalChart.ts
    - functions/src/api/createProfile.ts
    - functions/src/api/deleteProfile.ts
    - functions/src/api/getChart.ts
    - functions/src/api/getProfile.ts
    - functions/src/api/listProfiles.ts
    - functions/src/api/updateProfile.ts
    - functions/src/astro/chart.ts
    - functions/src/astro/ephemeris.ts
    - web/src/pages/Home.tsx
    - web/src/pages/ProfileCreate.tsx
    - web/src/pages/ProfileDetail.tsx
    - web/public/locales/en/translation.json
    - web/public/locales/ru/translation.json

key-decisions:
  - "Structured logging: firebase-functions/v2 logger with function name + relevant IDs"
  - "Error mapping per page (inline helper) rather than shared utility"
  - "Retry via retryCount/chartRetryCount/loadRetryCount state in useEffect deps"
  - "Separated chart fetch into its own useEffect for independent retry"

patterns-established:
  - "Logger pattern: logger.info at entry, logger.error before re-throw in catch"
  - "Error mapping: getErrorMessage(err, fallbackKey) translates Firebase codes to i18n keys"
  - "Retry pattern: state counter + useEffect dependency for re-triggering data fetch"

issues-created: []

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 7 Plan 2: Error Handling Summary

**Structured firebase-functions logging in all Cloud Functions with translated user-facing error messages and retry buttons across all UI pages**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T03:28:07Z
- **Completed:** 2026-02-12T03:32:07Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- All 7 Cloud Functions use structured firebase-functions logger (entry + error logging)
- No console.log/warn remaining in any production code (api/ and astro/ directories)
- Error i18n keys added in both EN and RU (10 error message keys each)
- All UI error messages use translated i18n strings (no raw Firebase errors shown to users)
- Retry buttons on Home page, ProfileDetail chart error, and ProfileCreate load error
- Chart fetch separated into independent useEffect for isolated retry

## Task Commits

Each task was committed atomically:

1. **Task 1: Add structured logging to Cloud Functions** - `e4cc3a5` (feat)
2. **Task 2: Improve UI error handling with translated messages and retry** - `afab6ef` (feat)

## Files Created/Modified
- `functions/src/api/computeNatalChart.ts` - Added logger import, entry/cache/error logging
- `functions/src/api/createProfile.ts` - Added logger import, entry/error logging
- `functions/src/api/deleteProfile.ts` - Added logger import, entry/error logging
- `functions/src/api/getChart.ts` - Added logger import, entry/cache/error logging
- `functions/src/api/getProfile.ts` - Added logger import, entry/error logging
- `functions/src/api/listProfiles.ts` - Added logger import, entry/error logging
- `functions/src/api/updateProfile.ts` - Added logger import, entry/error logging
- `functions/src/astro/chart.ts` - Replaced console.warn with logger.warn for Placidus fallback
- `functions/src/astro/ephemeris.ts` - Replaced console.warn with logger.warn for latitude warning
- `web/src/pages/Home.tsx` - Error mapping, translated errors, retry button
- `web/src/pages/ProfileCreate.tsx` - Error mapping, translated errors, retry button on load error
- `web/src/pages/ProfileDetail.tsx` - Error mapping, translated errors, retry for chart, separate chart useEffect
- `web/public/locales/en/translation.json` - Added errors section with 10 keys
- `web/public/locales/ru/translation.json` - Added errors section with 10 Russian translations

## Decisions Made
- 07-02: Structured logging uses firebase-functions/v2 logger (not console) for Cloud Logging integration
- 07-02: Error mapping helper is inline per page (not shared utility) for simplicity and context-specific fallbacks
- 07-02: Retry via state counter in useEffect dependency array (retryCount, chartRetryCount, loadRetryCount)
- 07-02: Chart fetch separated into own useEffect for independent retry without re-fetching profile

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Replaced console.warn in astro/ephemeris.ts with logger.warn**
- **Found during:** Task 1 (structured logging)
- **Issue:** Plan specified only astro/chart.ts for console.warn replacement, but ephemeris.ts also had console.warn in production code
- **Fix:** Added logger import and replaced console.warn with logger.warn in ephemeris.ts
- **Files modified:** functions/src/astro/ephemeris.ts
- **Verification:** grep confirms no console.log/warn in any functions/src/ production code
- **Committed in:** e4cc3a5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical), 0 deferred
**Impact on plan:** Auto-fix necessary for consistent structured logging across all production code. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Ready for 07-03-PLAN.md (responsive polish)
- Error handling complete across both Cloud Functions and UI
- All error messages internationalized

---
*Phase: 07-testing-polish*
*Completed: 2026-02-12*
