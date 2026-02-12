---
phase: 01-foundation
plan: 03
subsystem: ui
tags: [react-router-v7, i18next, typescript, i18n, routing, translations]

# Dependency graph
requires:
  - 01-02
provides:
  - React Router v7 with BrowserRouter, Layout, and 4 routes
  - i18next with HTTP backend, EN + RU translations, language switcher
  - Shared TypeScript interfaces for Profile, ChartResult, and related types
affects: [02-01, 02-02, 02-03, 03-02, 03-03, 04-01, 04-02, 04-03, 05-01, 05-02, 06-01, 06-02, 06-03]

# Tech tracking
tech-stack:
  added: [react-router@7, react-i18next, i18next, i18next-http-backend, i18next-browser-languagedetector]
  patterns: [browser-router-with-layout-outlet, i18next-http-backend-loading, translation-key-driven-ui, duplicated-shared-types]

key-files:
  created: [web/src/components/Layout.tsx, web/src/components/LanguageSwitcher.tsx, web/src/pages/Home.tsx, web/src/pages/ProfileCreate.tsx, web/src/pages/ProfileDetail.tsx, web/src/i18n.ts, web/public/locales/en/translation.json, web/public/locales/ru/translation.json, web/src/types/index.ts, functions/src/types/index.ts]
  modified: [web/src/App.tsx, web/src/main.tsx, web/package.json, package-lock.json]

key-decisions:
  - "React Router v7 single-package import (not react-router-dom)"
  - "i18next HTTP backend loading translations from /locales/ public directory"
  - "Duplicated type definitions in web/ and functions/ (no shared package for MVP)"
  - "Single 'translation' namespace for i18n (no namespace splitting for MVP)"

patterns-established:
  - "Route structure: / (home), /profile/new (create), /profile/:id (detail), /profile/:id/edit (edit)"
  - "Layout with Outlet pattern for shared header/footer"
  - "All UI text via t() translation calls — no hardcoded user-facing strings"
  - "Translation keys nested by section: app.*, nav.*, home.*, profile.*, common.*, language.*"
  - "Type definitions duplicated between web/ and functions/ with sync comment"

issues-created: []

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 1 Plan 3: Routing + i18n + Shared Types Summary

**React Router v7 with 4 routes and shared Layout, i18next bilingual UI (EN/RU) with language switcher, and shared TypeScript interfaces for Profile and ChartResult**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T00:07:11Z
- **Completed:** 2026-02-12T00:10:13Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- React Router v7 configured with BrowserRouter, shared Layout (header + Outlet), and 4 routes (/, /profile/new, /profile/:id, /profile/:id/edit)
- i18next with HTTP backend loading translations from /locales/, LanguageDetector for auto-detection, and EN/RU translation files
- Language switcher component in header toggling between English and Russian
- All page shells use t() translation calls -- no hardcoded user-facing strings
- Shared TypeScript interfaces (Profile, CreateProfilePayload, ChartPoint, ChartHouses, ChartAspect, ChartMeta, ChartResult) defined in both web/ and functions/

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure React Router v7 with route structure and page shells** - `b7d298d` (feat)
2. **Task 2: Configure i18next with HTTP backend and EN/RU translations** - `4de973a` (feat)
3. **Task 3: Create shared TypeScript interfaces for Profile and ChartResult** - `73a7a8f` (feat)

## Files Created/Modified
- `web/src/App.tsx` - BrowserRouter with Routes and Layout wrapper
- `web/src/main.tsx` - i18n import and Suspense wrapper for async loading
- `web/src/i18n.ts` - i18next configuration with HttpBackend + LanguageDetector
- `web/src/components/Layout.tsx` - Shared layout with header (title + language switcher) and Outlet
- `web/src/components/LanguageSwitcher.tsx` - EN/RU toggle buttons using shadcn/ui Button
- `web/src/pages/Home.tsx` - Profiles page with Create Profile link
- `web/src/pages/ProfileCreate.tsx` - Create/Edit profile shell (detects edit mode from URL params)
- `web/src/pages/ProfileDetail.tsx` - Profile detail shell showing ID from URL params
- `web/public/locales/en/translation.json` - English translations for all UI keys
- `web/public/locales/ru/translation.json` - Russian translations for all UI keys
- `web/src/types/index.ts` - Shared TypeScript interfaces (web copy)
- `functions/src/types/index.ts` - Shared TypeScript interfaces (functions copy)
- `web/package.json` - Added react-router, react-i18next, i18next, i18next-http-backend, i18next-browser-languagedetector
- `package-lock.json` - Updated lockfile

## Decisions Made
- Used React Router v7 single package (not separate react-router-dom) per v7 convention
- i18next HTTP backend loads translations from public /locales/ directory at runtime
- Duplicated TypeScript type definitions in web/ and functions/ instead of shared package (avoids Firebase deployment complications)
- Single "translation" namespace sufficient for MVP scope
- LanguageSwitcher uses compact inline buttons (not dropdown) with shadcn/ui Button ghost/outline variants

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Phase 1 foundation complete: Firebase project, React SPA, design system, routing, i18n, and shared types all in place
- Ready for Phase 2: Profile backend and data layer (Firestore schema, Cloud Functions CRUD)
- TypeScript interfaces define the data contracts between frontend and backend
- Route structure defines where profile UI will render in Phase 4

---
*Phase: 01-foundation*
*Completed: 2026-02-12*
