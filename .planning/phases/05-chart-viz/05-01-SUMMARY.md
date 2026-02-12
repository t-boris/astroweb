---
phase: 05-chart-viz
plan: 01
subsystem: ui
tags: [svg, chart-wheel, zodiac, houses, firebase-functions, dark-theme]

# Dependency graph
requires:
  - phase: 03-astro-engine
    provides: getChart API endpoint, ChartResult type
  - phase: 04-profile-ui
    provides: ProfileDetail page shell with chart placeholder
provides:
  - SVG chart math utilities (coordinate conversion, arc/sector paths)
  - Zodiac/planet/aspect glyph and color constants
  - getChart API client wrapper
  - NatalChart SVG container with dark cosmic background
  - ZodiacRing component (12 sign sectors with element coloring)
  - HouseCusps component (12 cusp lines with house numbers)
  - Chart data fetching integrated into ProfileDetail
affects: [05-chart-viz, 06-data-tables]

# Tech tracking
tech-stack:
  added: []
  patterns: [SVG viewBox coordinate system, ecliptic-to-SVG angle conversion, annular wedge sector paths]

key-files:
  created:
    - web/src/components/chart/utils/chartMath.ts
    - web/src/components/chart/utils/constants.ts
    - web/src/api/charts.ts
    - web/src/components/chart/NatalChart.tsx
    - web/src/components/chart/ZodiacRing.tsx
    - web/src/components/chart/HouseCusps.tsx
  modified:
    - web/src/pages/ProfileDetail.tsx
    - web/public/locales/en/translation.json
    - web/public/locales/ru/translation.json

key-decisions:
  - "ASC placed at 9 o'clock via eclipticToSvgAngle formula: 180 - (eclipticDeg - ascDeg)"
  - "SVG Y-inversion handled in polarToCartesian: cy - radius * sin(rad)"
  - "Sweep flag 0 (counterclockwise) for outer arcs, 1 for inner arcs in sector paths"
  - "Dark cosmic background: radial gradient from #0f0f2e to #070714"
  - "Element colors at 8% opacity fill for subtle sector tinting on dark background"

patterns-established:
  - "Chart component structure: NatalChart orchestrator renders child SVG groups (ZodiacRing, HouseCusps)"
  - "Chart math utilities are pure functions with no React dependency"
  - "CHART_LAYOUT central constants define all radii and sizing"

issues-created: []

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 5 Plan 01: SVG Chart Wheel Base Summary

**SVG natal chart wheel with dark cosmic background, 12 zodiac sign sectors with element-colored fills/glyphs, and 12 house cusp lines with ASC/MC emphasis — integrated into ProfileDetail via getChart API**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T02:32:03Z
- **Completed:** 2026-02-12T02:35:52Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Chart math utilities: 5 pure functions for coordinate conversion and SVG path generation
- Glyph/color constants: 8 exports covering zodiac signs, planets, aspects, elements, and layout geometry
- getChart API wrapper following established httpsCallable pattern
- NatalChart SVG container with dark cosmic radial gradient and glow filters for future use
- ZodiacRing renders 12 sign sectors with element-colored fills and Unicode zodiac glyphs
- HouseCusps renders 12 cusp lines with house numbers, ASC and MC visually emphasized
- ProfileDetail fetches chart data after profile loads and renders NatalChart replacing the placeholder
- i18n keys for chart loading and error states in EN and RU

## Task Commits

Each task was committed atomically:

1. **Task 1: Chart math utilities + glyph/color constants + chart API wrappers** - `ca5cfcf` (feat)
2. **Task 2: NatalChart container + ZodiacRing + HouseCusps + ProfileDetail integration** - `8c5cd3f` (feat)

## Files Created/Modified
- `web/src/components/chart/utils/chartMath.ts` - Pure math: eclipticToSvgAngle, polarToCartesian, describeArc, describeSector
- `web/src/components/chart/utils/constants.ts` - Glyph maps, element colors, aspect colors, chart layout geometry
- `web/src/api/charts.ts` - getChart httpsCallable wrapper
- `web/src/components/chart/NatalChart.tsx` - SVG container with dark cosmic background and child components
- `web/src/components/chart/ZodiacRing.tsx` - 12 zodiac sign sectors with element coloring and glyphs
- `web/src/components/chart/HouseCusps.tsx` - 12 house cusp lines with house numbers
- `web/src/pages/ProfileDetail.tsx` - Chart data fetching and NatalChart rendering
- `web/public/locales/en/translation.json` - Added chartLoading/chartError, removed chartPlaceholder
- `web/public/locales/ru/translation.json` - Added chartLoading/chartError, removed chartPlaceholder

## Decisions Made
- ASC at 9 o'clock: eclipticToSvgAngle returns 180 - (eclipticDeg - ascDeg)
- SVG Y-inversion in polarToCartesian: cy - radius * sin(rad)
- Sector paths use sweep flag 0 for outer arcs, 1 for inner reverse arcs
- Dark cosmic background: radial gradient #0f0f2e to #070714
- Element colors at 8% opacity fill for subtle dark-theme sector tinting
- Chart fetch fires after profile loads in same useEffect to avoid waterfall timing issues

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness
- Chart wheel foundation complete, ready for 05-02 (planet placement and aspect lines)
- SVG filters (glow, line-glow) defined in NatalChart defs for 05-02 use
- CHART_LAYOUT constants (planetRadius, aspectRadius) ready for planet and aspect line placement

---
*Phase: 05-chart-viz*
*Completed: 2026-02-12*
