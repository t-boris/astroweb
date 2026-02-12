---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [firebase, monorepo, cloud-functions, typescript, node22, gen2]

# Dependency graph
requires: []
provides:
  - Root monorepo with npm workspaces (web, functions)
  - Firebase configuration (Hosting, Functions, Firestore, Emulators)
  - Cloud Functions scaffold with Gen 2 hello function
  - Firestore deny-all security rules
affects: [01-02, 01-03, 02-01, 02-02, 03-01]

# Tech tracking
tech-stack:
  added: [firebase-functions@7, firebase-admin@13, typescript@5]
  patterns: [npm-workspaces-monorepo, cloud-functions-gen2, deny-all-firestore-rules]

key-files:
  created: [package.json, firebase.json, .firebaserc, firestore.rules, .gitignore, functions/package.json, functions/tsconfig.json, functions/src/index.ts, web/package.json]
  modified: []

key-decisions:
  - "Created web/package.json placeholder for workspace resolution (web scaffold comes in 01-02)"
  - "Used npm workspaces with hoisted dependencies (standard npm behavior)"

patterns-established:
  - "Gen 2 Cloud Functions exclusively (import from firebase-functions/v2/https)"
  - "Emulator ports: functions 5001, firestore 8080, hosting 5173, UI 4000 (macOS safe)"
  - "Firestore deny-all rules (all access through Cloud Functions only)"

issues-created: []

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 1 Plan 1: Firebase Project Initialization + Monorepo Structure Summary

**npm workspaces monorepo with Firebase config (Hosting, Functions Gen 2, Firestore deny-all, Emulators) and Cloud Functions scaffold targeting Node.js 22**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T23:58:37Z
- **Completed:** 2026-02-12T00:00:05Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Root monorepo with npm workspaces resolving web and functions packages
- Firebase configuration with Hosting, Functions, Firestore, and Emulator Suite on macOS-safe ports
- Cloud Functions scaffold using Gen 2 API exclusively, targeting Node.js 22
- Firestore deny-all security rules enforcing functions-only data access
- TypeScript compiles cleanly, npm install succeeds from root

## Task Commits

Each task was committed atomically:

1. **Task 1: Create root monorepo structure with Firebase configuration** - `7ecafa2` (feat)
2. **Task 2: Create Cloud Functions scaffold with Gen 2 setup** - `8ac479e` (feat)

## Files Created/Modified
- `package.json` - Root monorepo with npm workspaces and Firebase scripts
- `firebase.json` - Hosting + Functions + Firestore + Emulators configuration
- `.firebaserc` - Firebase project alias (astroweb-dev placeholder)
- `firestore.rules` - Deny all direct client access
- `.gitignore` - Standard ignores for node_modules, dist, .firebase, logs, env files
- `functions/package.json` - Cloud Functions package with firebase-functions v7+, firebase-admin v13+
- `functions/tsconfig.json` - TypeScript config targeting ES2022, CommonJS output
- `functions/src/index.ts` - Gen 2 onCall hello function with firebase-admin init
- `web/package.json` - Placeholder for workspace resolution (scaffold in 01-02)

## Decisions Made
- Created minimal web/package.json placeholder so npm workspaces resolve correctly during `npm install` (web scaffold comes in plan 01-02)
- Dependencies hoisted to root node_modules via standard npm workspace behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created web/package.json placeholder for workspace resolution**
- **Found during:** Task 2 (npm install)
- **Issue:** Root package.json declares "web" workspace but web/ directory didn't exist, which would cause npm install to fail
- **Fix:** Created minimal web/package.json with name and private: true
- **Files modified:** web/package.json
- **Verification:** npm install completes successfully, both workspaces resolve
- **Committed in:** 8ac479e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for npm workspaces to resolve. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Monorepo structure ready for React+Vite scaffold in plan 01-02
- Functions directory ready for additional Cloud Functions in Phase 2
- Emulator configuration complete and ready for development

---
*Phase: 01-foundation*
*Completed: 2026-02-11*
