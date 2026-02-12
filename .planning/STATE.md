# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Accurate, reproducible natal chart computation with a polished interactive visualization — the complete flow from birth data input to chart interpretation must work end-to-end.
**Current focus:** Phase 3 — Astro Computation Engine

## Current Position

Phase: 3 of 7 (Astro Computation Engine)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-11 — Completed 03-02-PLAN.md

Progress: ████████░░ 38%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 2.1 min
- Total execution time: 17 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Foundation | 3/3 | 8 min | 2.7 min |
| 2 - Profile Backend | 2/3 | 4 min | 2 min |
| 3 - Astro Engine | 2/3 | 5 min | 2.5 min |

**Recent Trend:**
- Last 5 plans: 02-01 (2 min), 02-02 (2 min), 03-01 (3 min), 03-02 (2 min)
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

### Deferred Issues

None yet.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 03-02-PLAN.md
Resume file: None
