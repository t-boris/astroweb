# Phase 7: Testing & Production Readiness — Context

## Vision

Balanced approach across computation testing, production hardening, and UI polish. All three areas equally important — this is the final phase before the app is real.

## How It Works

### Computation Testing
- **Reference chart verification**: Use well-known birth data (historical figures with published natal charts) to verify Swiss Ephemeris calculations produce correct planetary positions, house cusps, and aspects.
- Goal: Reproducibility guarantee — same input always yields same output, and that output matches established astrological references.

### Rate Limiting
- **Skip for MVP**: No rate limiting implementation. It's an MVP — deal with abuse if/when it happens. Budget saved for testing and polish.

### Error Handling
- Clear, user-facing error messages on the UI (bad timezone, missing coordinates, computation failures).
- Structured logs in Cloud Functions for debugging.

### Responsive / Mobile
- **Chart readable on phone**: Chart wheel scales down, tables scroll horizontally, forms work on mobile. Functional adaptation, not a mobile-first redesign.
- No layout overhaul — just make sure nothing breaks on smaller screens.

## What's Essential
1. Computation tests with reference data proving accuracy
2. Meaningful error messages (not raw Firebase errors)
3. Chart and tables usable on mobile screens

## What's NOT Essential
- Rate limiting (deferred)
- Mobile-first redesign
- Exhaustive test coverage (focus on core computation)

## Decisions
- Use published reference charts (celebrity/historical) for test fixtures
- No rate limiting in MVP
- Responsive = functional on phone, not optimized for phone
