---
phase: 04-profile-ui
plan: 02
subsystem: ui
tags: [react, geo-tz, photon, geocoding, shadcn, i18n, cloud-functions]

# Dependency graph
requires:
  - phase: 04-profile-ui
    provides: useDeviceId hook, typed API client wrappers, Home page
  - phase: 02-profile-backend
    provides: Cloud Functions CRUD API (createProfile, updateProfile, getProfile)
  - phase: 01-foundation
    provides: React + Vite scaffold, shadcn/ui, routing, i18n, Firebase client
provides:
  - Server-side timezone auto-resolution via geo-tz in Cloud Functions
  - PlaceSearch component with Photon geocoding typeahead
  - Create/Edit profile form with validation and timeUnknown toggle
  - Optional timezone in CreateProfilePayload (server resolves from coords)
affects: [04-03, 05-01, 06-02]

# Tech tracking
tech-stack:
  added: [geo-tz, radix-ui/switch (via shadcn)]
  patterns: [server-side timezone resolution from coordinates, Photon geocoding typeahead with debounce+AbortController, shared create/edit form via URL params]

key-files:
  created:
    - functions/src/utils/timezone.ts
    - web/src/components/PlaceSearch.tsx
    - web/src/components/ui/input.tsx
    - web/src/components/ui/label.tsx
    - web/src/components/ui/switch.tsx
  modified:
    - functions/src/api/createProfile.ts
    - functions/src/api/updateProfile.ts
    - functions/src/types/index.ts
    - functions/src/validation/profile.ts
    - functions/src/services/profile.ts
    - web/src/types/index.ts
    - web/src/pages/ProfileCreate.tsx
    - web/public/locales/en/translation.json
    - web/public/locales/ru/translation.json
    - functions/package.json
    - package-lock.json

key-decisions:
  - "geo-tz v8.1.5 works with CJS static import (no dynamic import needed)"
  - "Server-side timezone resolution in createProfile/updateProfile (client never sends timezone)"
  - "timezone made optional in CreateProfilePayload; service uses type assertion since API guarantees it"
  - "PlaceSearch uses Photon API with 300ms debounce and AbortController for race condition prevention"

patterns-established:
  - "Server-side geo enrichment: Cloud Functions resolve derived data (timezone) from coordinates"
  - "Geocoding typeahead: debounce + AbortController + click-outside dismissal"
  - "Shared create/edit form: single component with useParams-based mode detection"

issues-created: []

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 4 Plan 02: Create/Edit Profile Form Summary

**geo-tz server-side timezone resolution in Cloud Functions, PlaceSearch with Photon geocoding typeahead, and full create/edit profile form with validation and timeUnknown toggle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T01:57:10Z
- **Completed:** 2026-02-12T02:01:31Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Installed geo-tz v8.1.5 in Cloud Functions for coordinate-to-IANA timezone lookup
- createProfile auto-resolves timezone from lat/lng when not provided by client
- updateProfile re-resolves timezone when coordinates change
- PlaceSearch component with Photon geocoding: debounced typeahead, AbortController, correct [lon,lat] extraction
- Full ProfileCreate form: name, birthDate, birthTime, timeUnknown toggle, place search, coordinates preview
- Client-side validation matching backend rules (name required/max 100, date required, time required if known, place required)
- Edit mode loads existing profile and populates form
- i18n keys added for form fields and validation messages (EN + RU)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install geo-tz + server-side timezone resolution** - `af36ef1` (feat)
2. **Task 2: PlaceSearch component + Create/Edit profile form** - `dc22afa` (feat)

## Files Created/Modified
- `functions/src/utils/timezone.ts` - getTimezoneFromCoords utility using geo-tz
- `functions/src/api/createProfile.ts` - Auto-resolves timezone from coords if not provided
- `functions/src/api/updateProfile.ts` - Re-resolves timezone when coordinates change
- `functions/src/types/index.ts` - timezone made optional in CreateProfilePayload
- `functions/src/validation/profile.ts` - timezone validation changed from required to optional
- `functions/src/services/profile.ts` - Type assertion for timezone (guaranteed by API)
- `web/src/types/index.ts` - timezone made optional in CreateProfilePayload (synced)
- `web/src/components/PlaceSearch.tsx` - Photon geocoding typeahead component
- `web/src/components/ui/input.tsx` - shadcn Input component
- `web/src/components/ui/label.tsx` - shadcn Label component
- `web/src/components/ui/switch.tsx` - shadcn Switch component
- `web/src/pages/ProfileCreate.tsx` - Full create/edit profile form
- `web/public/locales/en/translation.json` - Form and validation i18n keys (EN)
- `web/public/locales/ru/translation.json` - Form and validation i18n keys (RU)
- `functions/package.json` - Added geo-tz dependency
- `package-lock.json` - Updated lockfile

## Decisions Made
- geo-tz v8.1.5 supports CJS static import (no dynamic import workaround needed) — simpler code
- Server resolves timezone from coordinates in createProfile/updateProfile — client never needs to send timezone
- timezone made optional in CreateProfilePayload with type assertion in service layer (API layer guarantees it before service is called)
- PlaceSearch uses Photon API (not Nominatim) per research — Nominatim forbids autocomplete

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Profile service type mismatch after making timezone optional**
- **Found during:** Task 1 (timezone resolution integration)
- **Issue:** Making timezone optional in CreateProfilePayload caused TypeScript error in profile service where it builds a Profile object (timezone: string required but payload.timezone could be undefined)
- **Fix:** Added type assertion `payload.timezone as string` in service since the API layer guarantees timezone is set before calling the service
- **Files modified:** functions/src/services/profile.ts
- **Verification:** functions build passes
- **Committed in:** af36ef1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for type safety. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Create/edit form functional, ready for profile detail page enhancements (04-03)
- PlaceSearch component reusable for any geocoding needs
- Server-side timezone resolution operational for all profile mutations
- All shadcn form components (input, label, switch) available for future forms

---
*Phase: 04-profile-ui*
*Completed: 2026-02-12*
