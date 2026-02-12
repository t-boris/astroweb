# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Accurate, reproducible natal chart computation with a polished interactive visualization — the complete flow from birth data input to chart interpretation must work end-to-end.
**Current focus:** Phase 5 in progress — Chart Visualization

## Current Position

Phase: 5 of 7 (Chart Visualization)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-12 — Completed 05-01-PLAN.md

Progress: █████████░ 62%

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 2.2 min
- Total execution time: 29 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Foundation | 3/3 | 8 min | 2.7 min |
| 2 - Profile Backend | 2/3 | 4 min | 2 min |
| 3 - Astro Engine | 3/3 | 6 min | 2 min |
| 4 - Profile UI | 3/3 | 7 min | 2.3 min |
| 5 - Chart Viz | 1/3 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 04-01 (2 min), 04-02 (4 min), 04-03 (1 min), 05-01 (4 min)
- Trend: Consistent

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 01-01: Created web/package.json placeholder for workspace resolution
- 01-01: npm workspaces with hoisted dependencies (standard npm behavior)
- 01-02: Tailwind v4 CSS-based config (no tailwind.config.js)
- 01-02: shadcn/ui New York style with neutral base color
- 01-02: Firebase client uses import.meta.env.DEV for emulator auto-connect
- 01-03: React Router v7 single package (not react-router-dom)
- 01-03: i18next HTTP backend loading from /locales/ public directory
- 01-03: Duplicated types in web/ and functions/ (no shared package for MVP)
- 01-03: Single "translation" namespace for i18n
- 02-01: Hand-rolled validation (no Zod/Joi) for simple field checks
- 02-01: ISO string timestamps in Firestore (not Firestore Timestamp objects)
- 02-01: Idempotent deleteProfile, re-fetch after update for full Profile return
- 02-02: Thin Cloud Functions delegating to service layer (no business logic in function)
- 02-02: Fetch-then-verify ownership pattern for all mutations
- 02-02: Consistent HttpsError codes: invalid-argument, not-found, permission-denied, internal
- 03-01: sweph constants via `constants` sub-object import, not direct exports
- 03-01: Moshier ephemeris init with `set_ephe_path('')` at module load
- 03-01: sweph houses returns 0-indexed tuple, converted to plain array
- 03-01: Fixed 6-degree orb for all 5 major aspects
- 03-02: Cusp range iteration for house placement (handles 0/360 wrap-around)
- 03-02: Placidus failure fallback to Whole Sign at extreme latitudes
- 03-02: timeUnknown uses noon, nullifies ASC/MC and house assignments
- 03-02: SHA-256 inputHash from canonical pipe-delimited string for chart caching
- 03-02: Firestore batch delete for chart cleanup
- 03-03: computeNatalChart returns raw ChartResult; getChart wraps with { cached, chart }
- 03-03: Both endpoints share identical validation and ownership check patterns
- 03-03: Cache check before compute in both endpoints avoids redundant ephemeris calls
- 04-01: listProfiles wrapper unwraps backend { profiles } envelope to return clean Profile[]
- 04-01: Controlled AlertDialog (open/onOpenChange) for programmatic delete flow
- 04-01: API client pattern: typed httpsCallable wrappers in web/src/api/ with no error handling
- 04-02: geo-tz v8.1.5 works with CJS static import (no dynamic import needed)
- 04-02: Server-side timezone resolution in createProfile/updateProfile (client never sends timezone)
- 04-02: timezone optional in CreateProfilePayload; service uses type assertion since API guarantees it
- 04-02: PlaceSearch uses Photon API with 300ms debounce and AbortController
- 04-03: FirebaseError not-found detection via err.message.includes('not-found') for 404 vs generic errors
- 04-03: Controlled AlertDialog with deleting state disables buttons during async delete
- 05-01: ASC at 9 o'clock via eclipticToSvgAngle: 180 - (eclipticDeg - ascDeg)
- 05-01: SVG Y-inversion in polarToCartesian: cy - radius * sin(rad)
- 05-01: Dark cosmic background radial gradient #0f0f2e to #070714
- 05-01: Element colors at 8% opacity fill for dark-theme sector tinting
- 05-01: Chart fetch fires after profile load in same useEffect

### Deferred Issues

None yet.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 05-01-PLAN.md (Phase 5, plan 1 of 3)
Resume file: None
