# Roadmap: AstroWeb

## Overview

Build a natal astrology chart web application from scratch on Firebase. Starting with project scaffolding and infrastructure, then building the backend API and astro computation engine (Swiss Ephemeris), followed by the frontend UI for profile management and chart visualization, culminating with interpretations, testing, and production readiness.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation & Firebase Setup** — Project scaffold, Firebase init, React+Vite+TS, design system, routing, i18n
- [x] **Phase 2: Profile Backend & Data Layer** — Firestore schema, Cloud Functions CRUD, deviceId ownership, security rules
- [ ] **Phase 3: Astro Computation Engine** — Swiss Ephemeris integration, natal chart computation, aspects, caching
- [ ] **Phase 4: Profile UI & Geocoding** — Profile list, create/edit form, geocoding, profile detail shell
- [ ] **Phase 5: Chart Visualization** — SVG chart wheel, planet placement, aspect lines, hover interactions, filters
- [ ] **Phase 6: Data Tables & Interpretations** — Planets/aspects tables, tabbed view, rule-based interpretations
- [ ] **Phase 7: Testing & Production Readiness** — Unit/snapshot tests, rate limiting, error handling, responsive polish

## Phase Details

### Phase 1: Foundation & Firebase Setup
**Goal**: Working Firebase project with React SPA deployed to Hosting, design system configured, routing and i18n infrastructure in place
**Depends on**: Nothing (first phase)
**Research**: Unlikely (well-documented setup patterns)
**Plans**: 3 plans

Plans:
- [x] 01-01: Firebase project initialization + monorepo structure (Hosting, Functions, Firestore, Emulators)
- [x] 01-02: React + Vite + TypeScript + shadcn/ui + Tailwind scaffold
- [x] 01-03: Routing (react-router) + i18n (react-i18next) + shared TypeScript types/interfaces

### Phase 2: Profile Backend & Data Layer
**Goal**: Fully functional profile CRUD API via Cloud Functions with device-based ownership and locked-down Firestore
**Depends on**: Phase 1
**Research**: Unlikely (standard CRUD and Firestore patterns)
**Plans**: 3 plans

Plans:
- [x] 02-01: Firestore data model (profiles, charts collections) + security rules (deny all direct access)
- [x] 02-02: Cloud Functions: createProfile, updateProfile, listProfiles, deleteProfile
- [x] 02-03: DeviceId ownership validation + request payload validation (absorbed into 02-01 + 02-02)

### Phase 3: Astro Computation Engine
**Goal**: computeNatalChart Cloud Function producing accurate planetary positions, house cusps, and aspects using Swiss Ephemeris
**Depends on**: Phase 2
**Research**: Likely (native npm module in Cloud Functions)
**Research topics**: swisseph npm package build in Cloud Functions runtime, ephemeris data file bundling, Placidus vs Whole Sign calculation APIs, aspect calculation algorithms
**Plans**: 3 plans

Plans:
- [ ] 03-01: Swiss Ephemeris setup in Cloud Functions (swisseph npm, ephemeris files, native build verification)
- [ ] 03-02: computeNatalChart — planetary positions (10 bodies) + house cusps (Placidus + Whole Sign)
- [ ] 03-03: Aspect calculation (5 major types, fixed orbs) + inputHash caching + getChart endpoint

### Phase 4: Profile UI & Geocoding
**Goal**: Complete profile management UI — list, create, edit, delete profiles — with geocoding for place search
**Depends on**: Phase 2 (backend API ready)
**Research**: Likely (external geocoding API)
**Research topics**: OpenStreetMap Nominatim API (rate limits, response format), timezone lookup from coordinates (timezonefinder or API), CORS considerations from Firebase Hosting
**Plans**: 3 plans

Plans:
- [ ] 04-01: Home page + profile list (fetch from API, display name/date/place, delete action)
- [ ] 04-02: Create/Edit profile form (validation, time unknown toggle, timezone/coords preview)
- [ ] 04-03: Geocoding integration (Nominatim place search → lat/lng + timezone) + profile detail page shell

### Phase 5: Chart Visualization
**Goal**: Interactive SVG natal chart wheel with zodiac signs, houses, planets, and aspect lines
**Depends on**: Phase 3 (computation engine) + Phase 4 (profile detail page shell)
**Research**: Unlikely (SVG rendering, internal component work)
**Plans**: 3 plans

Plans:
- [ ] 05-01: SVG chart wheel base — zodiac ring (12 sign sectors with glyphs) + house cusp lines
- [ ] 05-02: Planet placement on wheel (glyph icons at correct degrees) + aspect lines inside circle
- [ ] 05-03: Hover interactions (highlight planet's aspects + tooltip) + aspect type filter toggles

### Phase 6: Data Tables & Interpretations
**Goal**: Complete profile detail view with planets/aspects tables and rule-based text interpretations
**Depends on**: Phase 3 (chart data) + Phase 4 (profile detail page)
**Research**: Unlikely (internal UI patterns, static JSON data)
**Plans**: 3 plans

Plans:
- [ ] 06-01: Planets table (body, sign, degree, house) + aspects table (body A, body B, type, orb)
- [ ] 06-02: Tabbed profile detail view (Chart / Planets / Aspects / Interpretation)
- [ ] 06-03: Rule-based interpretation engine + JSON data (Sun/Moon in sign, ASC/MC, top aspects) + display

### Phase 7: Testing & Production Readiness
**Goal**: Test coverage for core computation, production error handling, rate limiting, responsive UI
**Depends on**: Phase 3, Phase 5, Phase 6
**Research**: Unlikely (standard testing and hardening patterns)
**Plans**: 3 plans

Plans:
- [ ] 07-01: Unit tests for computeNatalChart (fixed birth data → expected planetary positions + house cusps)
- [ ] 07-02: Snapshot tests for interpretations + rate limiting on Cloud Functions
- [ ] 07-03: Error handling (UI error messages, structured logs in Functions) + responsive polish

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7
Note: Phase 4 can start after Phase 2 (parallel with Phase 3). Phase 5 and 6 both depend on Phase 3 + Phase 4.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Foundation & Firebase Setup | 3/3 | Complete | 2026-02-12 |
| 2. Profile Backend & Data Layer | 3/3 | Complete | 2026-02-12 |
| 3. Astro Computation Engine | 0/3 | Not started | - |
| 4. Profile UI & Geocoding | 0/3 | Not started | - |
| 5. Chart Visualization | 0/3 | Not started | - |
| 6. Data Tables & Interpretations | 0/3 | Not started | - |
| 7. Testing & Production Readiness | 0/3 | Not started | - |
