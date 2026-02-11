# Phase 1: Foundation & Firebase Setup - Research

**Researched:** 2026-02-11
**Domain:** Firebase + React + Vite + shadcn/ui + Tailwind + i18n monorepo setup
**Confidence:** HIGH

<research_summary>
## Summary

Researched the current state of the Firebase + React + Vite ecosystem for building a monorepo with Cloud Functions backend. Key findings: use Cloud Functions 2nd gen (Node.js 22 support), Tailwind CSS v4 with shadcn/ui (OKLCH theming, tw-animate-css), React Router v7 (simplified packages), and react-i18next with HTTP backend for JSON translation files.

Critical structural finding: `functions/` directory **must** have its own `package.json` — Firebase deploys it in isolation. Shared code between frontend and functions requires tarball packaging for deployment. The Swiss Ephemeris native module (`sweph`) compiles on Google's Linux build servers during deploy, but has AGPL-3.0 license implications for SaaS. WASM alternative (`swisseph-wasm`) exists but is immature (v0.0.4).

**Primary recommendation:** Scaffold with Vite + React 19 + Tailwind v4 + shadcn/ui (Vega style), use Cloud Functions 2nd gen with Node.js 22, structure as monorepo from day one with separate `functions/` package. Defer astro library choice to Phase 3 but prepare the structure for it.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.x | UI framework | Latest stable, shadcn/ui supports it |
| react-router | 7.12.0 | Client-side routing | Non-breaking upgrade from v6, no more react-router-dom needed |
| tailwindcss | 4.1.18 | Utility CSS framework | Major v4 rewrite, OKLCH colors, @theme directive |
| firebase | 11.x | Client SDK | Current major version |
| firebase-functions | 7.0.5 | Cloud Functions SDK | Gen 2 API, Node.js 22, TypeScript 5 |
| firebase-admin | 13.x | Admin SDK (in functions) | Firestore server-side access |
| vite | 6.x | Build tool | Fast dev server, ESM-native |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-i18next | 16.5.4 | React i18n bindings | Hook-based translations (useTranslation) |
| i18next | 24.x | Core i18n library | Translation engine |
| i18next-http-backend | latest | Load translation JSON files | Async loading from public/locales/ |
| i18next-browser-languagedetector | latest | Auto-detect user language | Browser language, localStorage, URL params |
| tw-animate-css | latest | Animation utilities | Replaced tailwindcss-animate for Tailwind v4 |
| typescript | 5.x | Type system | Required by firebase-functions v7 (targets ES2022) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Router v7 | TanStack Router | TanStack is newer, type-safe, but less ecosystem adoption |
| react-i18next | FormatJS/react-intl | react-intl is ICU-focused; i18next has simpler JSON format |
| shadcn/ui (Radix) | shadcn/ui (Base UI) | Base UI is newer option since Dec 2025; Radix is battle-tested |

**Installation (frontend):**
```bash
npm create vite@latest web -- --template react-ts
cd web
npx shadcn@latest init  # or: npx shadcn create (for style selection)
npm install react-router react-i18next i18next i18next-http-backend i18next-browser-languagedetector
```

**Installation (functions):**
```bash
npm install firebase-functions@latest firebase-admin@latest
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```
astroweb/
├── firebase.json                 # Hosting + Functions + Emulators config
├── firestore.rules               # Deny all (functions-only access)
├── .firebaserc                   # Project alias
├── package.json                  # Root (workspaces, scripts)
├── web/                          # React frontend (Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   └── locales/              # i18n translation files
│   │       ├── en/translation.json
│   │       └── ru/translation.json
│   └── src/
│       ├── main.tsx
│       ├── i18n.ts               # i18next config
│       ├── lib/
│       │   ├── firebase.ts       # Firebase client init + emulator connect
│       │   └── utils.ts          # shadcn/ui cn() helper
│       ├── components/
│       │   └── ui/               # shadcn/ui components
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── ProfileCreate.tsx
│       │   └── ProfileDetail.tsx
│       └── hooks/
├── functions/                    # Cloud Functions (SEPARATE package.json)
│   ├── package.json              # firebase-functions, firebase-admin, sweph
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Function exports
│       └── services/
└── packages/                     # Shared code (optional)
    └── shared/                   # Types, constants
        ├── package.json
        └── src/
            └── types.ts          # ChartResult, Profile, etc.
```

### Pattern 1: Firebase Client with Emulator Auto-Connect
**What:** Single firebase.ts that auto-connects to emulators in development
**When to use:** Always — prevents accidental production data access during dev
**Example:**
```typescript
// web/src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const app = initializeApp({
  projectId: "astroweb-dev",
  // ... other config
});

export const db = getFirestore(app);
export const functions = getFunctions(app);

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
```

### Pattern 2: Cloud Functions 2nd Gen with TypeScript
**What:** Use `onRequest` / `onCall` from `firebase-functions/v2/https` (Gen 2 API)
**When to use:** All new functions — Gen 2 supports Node.js 22, better scaling
**Example:**
```typescript
// functions/src/index.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const db = getFirestore();

export const createProfile = onCall(async (request) => {
  const { data } = request;
  // validate, create in Firestore
  const ref = await db.collection("profiles").add(data);
  return { profileId: ref.id };
});
```

### Pattern 3: i18next with HTTP Backend + JSON Files
**What:** Load translations from JSON files in public/locales/
**When to use:** Any app with i18n — keeps translations out of bundle
**Example:**
```typescript
// web/src/i18n.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "ru"],
    interpolation: { escapeValue: false },
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
  });

export default i18n;
```

### Anti-Patterns to Avoid
- **Direct Firestore access from client:** All operations through Cloud Functions for this project (security requirement)
- **Gen 1 functions with Node.js 22:** Node.js 22 only works on Gen 2. Gen 1 caps at Node.js 20
- **`functions.config()` API:** Removed in firebase-functions v7. Use `defineSecret()` / `defineString()` from params module
- **`tailwindcss-animate`:** Deprecated for Tailwind v4. Use `tw-animate-css` instead
- **`react-router-dom` package:** In React Router v7, just use `react-router` (single package)
- **Workspace-linked packages in functions/:** Firebase deploys functions/ in isolation. Cannot resolve `workspace:*` references. Use tarball approach for shared code
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI components | Custom buttons/inputs/modals | shadcn/ui | Battle-tested, accessible, Tailwind-native |
| i18n system | Custom translation loader | react-i18next + i18next-http-backend | Language detection, async loading, interpolation, pluralization built-in |
| Form validation | Manual validation logic | React Hook Form (or HTML5 built-in for simple forms) | Complex state management, field arrays, async validation |
| Design tokens | Custom CSS variable system | Tailwind v4 @theme + shadcn/ui CSS variables | OKLCH colors, automatic dark mode, responsive |
| Animation | Custom CSS animations | tw-animate-css | Pairs with shadcn/ui, optimized for Tailwind v4 |
| Routing | Custom history/URL management | React Router v7 | Nested routes, loaders, error boundaries |
| Firebase emulator connection | Manual env checks | `connectXxxEmulator` functions | Official API, proper error handling |

**Key insight:** The Firebase + React ecosystem has mature solutions for every aspect of Phase 1. The only custom code needed is project-specific configuration and glue.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: macOS Port 5000 Conflict (AirPlay Receiver)
**What goes wrong:** Firebase Hosting emulator won't start on port 5000
**Why it happens:** macOS Monterey+ uses port 5000 for AirPlay Receiver
**How to avoid:** Set hosting emulator to port 5173 (Vite's default) or 8080 in firebase.json
**Warning signs:** "Port 5000 already in use" error on emulator start

### Pitfall 2: Gen 1 vs Gen 2 Function Syntax
**What goes wrong:** Functions deploy but don't trigger, or Node.js 22 fails
**Why it happens:** Mixing Gen 1 (`functions.https.onCall`) and Gen 2 (`onCall` from `firebase-functions/v2/https`) syntax
**How to avoid:** Use Gen 2 imports exclusively: `import { onCall } from "firebase-functions/v2/https"`
**Warning signs:** "Runtime 'nodejs22' is not supported on GCF Gen1" error

### Pitfall 3: Shared Code in Monorepo Deployment
**What goes wrong:** Functions deploy fails with "E404 Not Found" for shared packages
**Why it happens:** Firebase deploys functions/ in isolation; workspace:* links don't resolve on build server
**How to avoid:** For MVP, duplicate shared types in both packages. For later: use tarball packaging with predeploy script
**Warning signs:** Build errors mentioning workspace packages during `firebase deploy`

### Pitfall 4: Tailwind v4 CSS Import Order
**What goes wrong:** Styles don't apply or override incorrectly
**Why it happens:** Tailwind v4 uses `@import "tailwindcss"` instead of v3's `@tailwind` directives. Order matters.
**How to avoid:** Follow shadcn/ui init exactly. Use `@theme inline` for CSS variables
**Warning signs:** Components render without styles, or dark mode doesn't work

### Pitfall 5: Vite VITE_ Environment Variable Prefix
**What goes wrong:** Environment variables undefined in client code
**Why it happens:** Vite only exposes variables prefixed with `VITE_` to client code
**How to avoid:** Use `import.meta.env.VITE_*` for client-accessible vars, `import.meta.env.DEV` for mode detection
**Warning signs:** `undefined` when accessing `process.env.*` in browser code
</common_pitfalls>

<code_examples>
## Code Examples

### firebase.json Configuration (Emulators + Hosting + Functions)
```json
// Source: Firebase official docs
{
  "hosting": {
    "public": "web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs22",
      "ignore": ["node_modules", ".git"]
    }
  ],
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5173 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

### shadcn/ui Initialization for Vite
```bash
# Source: ui.shadcn.com/docs/installation
npx shadcn@latest init
# Or with style selection (Dec 2025+):
npx shadcn create
# Styles: Vega (classic), Nova (compact), Maia (soft), Lyra (boxy), Mira (dense)
```

### Vite Config with Proxy for Functions Emulator
```typescript
// Source: vite.dev/config/server-options
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### React Router v7 Setup
```typescript
// Source: reactrouter.com
// Note: v7 uses just "react-router", not "react-router-dom"
import { BrowserRouter, Routes, Route } from "react-router";
import Home from "./pages/Home";
import ProfileCreate from "./pages/ProfileCreate";
import ProfileDetail from "./pages/ProfileDetail";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile/new" element={<ProfileCreate />} />
        <Route path="/profile/:id" element={<ProfileDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tailwindcss-animate | tw-animate-css | March 2025 | Must use new import for Tailwind v4 |
| Tailwind v3 `@tailwind` directives | Tailwind v4 `@import "tailwindcss"` + `@theme inline` | Jan 2025 | New CSS-based config, no tailwind.config.js needed |
| HSL color values | OKLCH color format | Feb 2025 | shadcn/ui v4 uses OKLCH in CSS variables |
| react-router-dom + react-router | react-router (single package) | Nov 2024 | No more separate DOM package |
| Cloud Functions Gen 1 | Gen 2 (recommended) | 2023+ | Node.js 22 support, better scaling, Cloud Run based |
| functions.config() | params module (defineSecret, defineString) | firebase-functions v7 | Old API completely removed |
| Node.js 18/20 for Functions | Node.js 22 (Gen 2 only) | 2025 | Node.js 18 deprecated early 2025 |
| shadcn init | shadcn create (5 styles, Base UI option) | Dec 2025 | Component code rewritten to match chosen style |

**New tools/patterns to consider:**
- **shadcn create** with style selection (Vega, Nova, Maia, Lyra, Mira) — choose one that matches the app's aesthetic
- **Firebase Emulator Suite** — run everything locally, no cloud needed for dev
- **Tailwind v4 @theme inline** — CSS-first configuration, no JavaScript config file

**Deprecated/outdated:**
- **tailwindcss-animate** — use tw-animate-css
- **functions.config()** — use params module
- **react-router-dom** — just use react-router
- **Cloud Functions Gen 1** — use Gen 2 for new projects
- **tailwind.config.js** — Tailwind v4 uses CSS-based configuration
</sota_updates>

<open_questions>
## Open Questions

1. **Swiss Ephemeris license for SaaS**
   - What we know: `sweph` (best native package) uses AGPL-3.0. SaaS use requires open-sourcing or purchasing professional license (~CHF 800) from Astrodienst
   - What's unclear: Whether `swisseph-wasm` (v0.0.4) is stable enough as alternative, and its license terms
   - Recommendation: Defer to Phase 3 research. Structure project to make ephemeris library swappable

2. **shadcn/ui style choice**
   - What we know: 5 styles available (Vega/Nova/Maia/Lyra/Mira), each rewrites component code differently
   - What's unclear: Which style best fits an astrology app aesthetic
   - Recommendation: Use Vega (classic, default) for MVP. Can re-init with different style later

3. **Shared types between frontend and functions**
   - What we know: Workspace links don't work in Firebase deploy. Tarball approach is complex
   - What's unclear: Best approach for a small shared types package in MVP
   - Recommendation: For MVP, duplicate shared TypeScript interfaces in both web/ and functions/. Introduce shared package when the duplication becomes painful
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Firebase official docs: emulator setup, Cloud Functions Gen 2, organize functions
- ui.shadcn.com: Tailwind v4 migration, CLI docs, changelog
- reactrouter.com: v7 upgrade guide, API reference
- react.i18next.com: quick start guide, hooks API
- vite.dev: server proxy configuration

### Secondary (MEDIUM confidence)
- npm package pages: firebase-functions@7.0.5, tailwindcss@4.1.18, react-router@7.12.0, react-i18next@16.5.4
- Firebase GitHub issues: Gen 1 vs Gen 2 Node.js 22 support (#1653), monorepo deployment (#653)
- firecms.co blog: Firebase Functions monorepo deployments (tarball approach)

### Tertiary (LOW confidence — needs validation during implementation)
- swisseph-wasm package stability and license (very new, v0.0.4)
- @fusionstrings/swisseph-wasi compatibility with Cloud Functions runtime
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Firebase (Hosting, Functions Gen 2, Firestore, Emulators)
- Ecosystem: React 19, Vite 6, Tailwind v4, shadcn/ui, React Router v7, react-i18next
- Patterns: Monorepo structure, emulator auto-connect, Gen 2 functions, i18n with HTTP backend
- Pitfalls: Port conflicts, Gen 1/2 mixing, monorepo deploy, Tailwind v4 migration
- Forward-looking: Swiss Ephemeris package options and license implications (Phase 3 impact)

**Confidence breakdown:**
- Standard stack: HIGH — verified with official docs and npm
- Architecture: HIGH — Firebase monorepo patterns well-documented
- Pitfalls: HIGH — confirmed via GitHub issues and official docs
- Code examples: HIGH — from official documentation
- Astro library assessment: MEDIUM — some packages are very new

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days — ecosystem stable, no expected breaking changes)
</metadata>

---

*Phase: 01-foundation*
*Research completed: 2026-02-11*
*Ready for planning: yes*
