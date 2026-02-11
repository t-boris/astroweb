# AstroWeb

## What This Is

A web application that creates and visualizes natal astrology charts from birth data. Users enter birth details (date, time, place), the system computes planetary positions, house cusps, and aspects using Swiss Ephemeris, then renders an interactive SVG chart wheel with rule-based interpretations. Built on Firebase (Hosting + Cloud Functions + Firestore), deployed as a static SPA with serverless backend. No authentication in MVP — device-based ownership via Cloud Functions.

## Core Value

Accurate, reproducible natal chart computation with a polished interactive visualization — the complete flow from birth data input to chart interpretation must work end-to-end.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Birth profile CRUD (create, list, view, delete) via Cloud Functions
- [ ] Device-based ownership (UUID in localStorage, validated by Cloud Functions)
- [ ] Natal chart computation using Swiss Ephemeris (Sun through Pluto, 10 bodies)
- [ ] Two house systems: Placidus (default) + Whole Sign, with toggle
- [ ] Major aspects: conjunction, opposition, trine, square, sextile (fixed 6° orbs)
- [ ] Interactive SVG chart wheel (12 signs, 12 houses, planets, aspect lines)
- [ ] Planet hover → highlight aspects + tooltip
- [ ] Aspect filter toggles (show/hide by type)
- [ ] Planets table (body, sign, degree, house)
- [ ] Aspects table (body A, body B, type, orb, exactness)
- [ ] Rule-based interpretations (Sun in sign, Moon in sign, ASC/MC if time known, top 3-5 aspects)
- [ ] Interpretation data as structured JSON (key → template + tags)
- [ ] Geocoding: place search → lat/lng/timezone (free API, e.g., Nominatim + timezone lookup)
- [ ] i18n from start (English default, Russian)
- [ ] Firebase project setup: Hosting, Functions, Firestore, Emulator Suite
- [ ] Firestore security: deny all direct access, all data access through Cloud Functions only
- [ ] Rate limiting on Cloud Functions (basic spam protection)
- [ ] Chart caching via inputHash (don't recompute if input unchanged)
- [ ] Tabbed profile detail view: Chart wheel / Planets / Aspects / Interpretation
- [ ] Responsive UI with shadcn/ui + Tailwind
- [ ] Unit tests for computeNatalChart (fixed dates → expected positions)
- [ ] Snapshot tests for rule-based interpretations

### Out of Scope

- Authentication (Firebase Auth) — Phase 2, architecture prepared for migration
- Synastry (chart comparison) — Phase 2
- Transits / forecasts — Phase 2
- Lunar nodes, Lilith, Chiron — not in MVP body list
- LLM-generated interpretations — future enhancement, rule-based for MVP
- PNG/SVG/PDF export — Phase 2 (Release 2)
- Canvas/WebGL rendering — SVG for MVP, architecture allows migration
- Firebase Storage — not needed until export features
- Minor aspects (quincunx, semi-sextile, etc.) — future, data model supports it
- Custom orb settings — fixed orbs in MVP, UI placeholder possible later

## Context

- Greenfield project, empty repository
- Firebase project not yet created — full setup needed
- Swiss Ephemeris chosen for calculation accuracy (swisseph npm package, requires native build in Cloud Functions)
- Geocoding via free API (OpenStreetMap Nominatim or similar) to resolve place names to coordinates + IANA timezone
- Device ownership model: Cloud Functions validate deviceId passed by client, Firestore rules deny all direct client access
- Data model designed for future Auth migration: `ownerDeviceId` field will become `ownerUid`
- ChartResult format: `{ meta, points[], houses, aspects[] }` — structured for both storage and rendering
- Interpretation source: local JSON data files, structure `key → { template, tags }`
- i18n needed for: UI labels, form fields, error messages, interpretation texts

## Constraints

- **Platform**: Firebase only (Hosting, Functions, Firestore) — unified Google ecosystem
- **Frontend**: React + TypeScript + Vite + shadcn/ui + Tailwind
- **Backend**: Cloud Functions (Node.js/TypeScript) — astro libraries stay server-side
- **Astro engine**: Swiss Ephemeris (swisseph npm) — accuracy requirement
- **Security**: No direct Firestore access from client — all operations through Cloud Functions
- **Performance**: Chart computation < 2 seconds
- **Reproducibility**: Identical input must produce identical output
- **No Auth in MVP**: Device-based ownership via localStorage UUID

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Both house systems (Placidus + Whole Sign) from start | User preference, Placidus default | — Pending |
| Swiss Ephemeris over Astronomia | Gold standard accuracy, user choice | — Pending |
| i18n from start (EN default + RU) | User preference, avoids retrofit | — Pending |
| Geocoding included in MVP | Better UX, free API available | — Pending |
| Cloud Functions as API gateway | Security (no direct Firestore), hide astro libs from client | — Pending |
| Device-based ownership via Cloud Functions | Safe for public deploy without Auth | — Pending |
| SVG for chart visualization | Simplest for MVP, Canvas/WebGL possible later | — Pending |
| Firebase project setup from scratch | Nothing exists yet | — Pending |

---
*Last updated: 2026-02-11 after initialization*
