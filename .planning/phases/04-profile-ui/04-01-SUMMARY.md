---
phase: 04-profile-ui
plan: 01
subsystem: ui
tags: [react, firebase, httpsCallable, shadcn, i18n, localStorage]

# Dependency graph
requires:
  - phase: 02-profile-backend
    provides: Cloud Functions CRUD API (createProfile, listProfiles, deleteProfile, getProfile, updateProfile)
  - phase: 01-foundation
    provides: React + Vite scaffold, shadcn/ui, routing, i18n, Firebase client
provides:
  - useDeviceId hook for device-based ownership
  - Typed API client wrappers for all 5 profile endpoints
  - Home page with profile list, delete, loading/error/empty states
affects: [04-02, 04-03, 05-01, 06-02]

# Tech tracking
tech-stack:
  added: [radix-ui/alert-dialog (via shadcn)]
  patterns: [httpsCallable typed wrappers, localStorage device ID, controlled AlertDialog for confirmations]

key-files:
  created:
    - web/src/hooks/useDeviceId.ts
    - web/src/api/profiles.ts
    - web/src/components/ui/card.tsx
    - web/src/components/ui/alert-dialog.tsx
  modified:
    - web/src/pages/Home.tsx
    - web/public/locales/en/translation.json
    - web/public/locales/ru/translation.json

key-decisions:
  - "listProfiles API wrapper unwraps backend { profiles } envelope to return clean Profile[]"
  - "AlertDialog is controlled via open/onOpenChange state (not trigger-based) for programmatic delete flow"

patterns-established:
  - "API client pattern: typed httpsCallable wrappers in web/src/api/ with no error handling (callers decide)"
  - "Device ID pattern: useDeviceId hook + getDeviceId utility, localStorage key astroweb_device_id"

issues-created: []

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 4 Plan 01: Home Page + Profile List Summary

**useDeviceId hook with localStorage UUID persistence, 5 typed httpsCallable API wrappers, and Home page with Card-based profile list and AlertDialog delete confirmation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T01:52:10Z
- **Completed:** 2026-02-12T01:54:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- useDeviceId hook generates and persists UUID in localStorage, with non-hook getDeviceId utility
- 5 typed API wrappers (createProfile, listProfiles, getProfile, updateProfile, deleteProfile) using httpsCallable
- Home page fetches and displays profiles on mount with Card UI
- Delete confirmation dialog using AlertDialog with profile name interpolation
- Loading, error, and empty states fully implemented
- i18n keys added for EN and RU

## Task Commits

Each task was committed atomically:

1. **Task 1: DeviceId hook + typed API client wrappers** - `cfd4637` (feat)
2. **Task 2: Home page with profile list and delete** - `0c4be9e` (feat)

## Files Created/Modified
- `web/src/hooks/useDeviceId.ts` - React hook + utility for device ID generation/persistence
- `web/src/api/profiles.ts` - Typed httpsCallable wrappers for all 5 profile endpoints
- `web/src/components/ui/card.tsx` - shadcn Card component (auto-generated)
- `web/src/components/ui/alert-dialog.tsx` - shadcn AlertDialog component (auto-generated)
- `web/src/pages/Home.tsx` - Profile list with cards, delete dialog, loading/error/empty states
- `web/public/locales/en/translation.json` - Added home.loading, home.error, delete dialog keys, profile field labels
- `web/public/locales/ru/translation.json` - Russian translations for all new keys

## Decisions Made
- 04-01: listProfiles wrapper unwraps backend `{ profiles }` envelope — backend returns `{ profiles: Profile[] }` but wrapper returns clean `Profile[]`
- 04-01: Controlled AlertDialog (open/onOpenChange) rather than trigger-based — allows programmatic open from any delete button
- 04-01: useEffect cleanup with cancelled flag prevents state updates on unmounted component

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] listProfiles response shape mismatch**
- **Found during:** Task 1 (API client wrappers)
- **Issue:** Plan specified `httpsCallable<{ ownerDeviceId: string }, Profile[]>` but backend `listProfiles` returns `{ profiles: Profile[] }` (wrapped in object)
- **Fix:** Changed generic to `{ profiles: Profile[] }` and return `result.data.profiles` to unwrap
- **Files modified:** web/src/api/profiles.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** cfd4637 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct API integration. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Home page functional, ready for profile create/edit form (04-02)
- API client and deviceId hook available for all subsequent plans
- Card and AlertDialog components installed for reuse

---
*Phase: 04-profile-ui*
*Completed: 2026-02-12*
