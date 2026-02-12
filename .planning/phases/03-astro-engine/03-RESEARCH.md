# Phase 3: Astro Computation Engine - Research

**Researched:** 2026-02-12
**Domain:** Swiss Ephemeris natal chart computation in Firebase Cloud Functions
**Confidence:** HIGH

<research_summary>
## Summary

Researched the Swiss Ephemeris npm ecosystem, natal chart computation patterns, aspect calculation algorithms, and chart result caching for Firebase Cloud Functions (Node.js 22, Gen 2).

The `sweph` package (v2.10.3-b-1, by timotejroiko) is the best option: 100% Swiss Ephemeris API coverage, modern TypeScript/ESM support, Moshier ephemeris built-in (no data files needed, 0.1 arcsec precision). It requires native C compilation during `npm install`, which works on Cloud Functions' Linux x64 build environment. License is dual AGPL-3.0/LGPL-3.0 — LGPL requires a 700 CHF professional license from Astrodienst. For MVP without commercial license, pin to `sweph@2.10.0` under GPL-2.0 (SaaS loophole — no network-use clause).

Natal chart computation follows a clear pipeline: local time → UTC → Julian Day → planetary positions (swe_calc_ut) → house cusps (swe_houses) → house placement (swe_house_pos or manual) → aspect detection. Aspects use a wrap-around-safe angular difference formula with fixed 6° orbs. Caching uses SHA-256 input hash stored in Firestore.

**Primary recommendation:** Use `sweph` with Moshier ephemeris mode (no data files), compute all 10 bodies + ASC/MC, detect 5 major aspects across 65 pairs, cache via inputHash in Firestore charts collection.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sweph | 2.10.3-b-1 | Swiss Ephemeris Node.js bindings | 100% SE API, TypeScript, Moshier built-in, N-API stable |
| crypto (Node.js built-in) | — | SHA-256 input hashing | Built into Node.js, no extra dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| luxon | 3.x | Timezone-aware date conversion | Convert local birth time + IANA timezone → UTC |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sweph (native) | sweph-wasm (WASM) | No native build, but AGPL-only, less proven (v2.6.9) |
| sweph (native) | circular-natal-horoscope-js | Pure JS, MIT license, but less precision/control |
| luxon | date-fns-tz | Lighter, but luxon has better DateTime API for this use case |
| luxon | Temporal API | Modern but not yet stable in Node.js 22 |

**Installation (functions):**
```bash
cd functions && npm install sweph luxon && npm install -D @types/luxon
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Module Structure
```
functions/src/
├── astro/
│   ├── ephemeris.ts       # Swiss Ephemeris wrapper (init, calc_ut, houses)
│   ├── zodiac.ts          # Longitude → sign/degree conversion
│   ├── aspects.ts         # Aspect detection algorithm
│   ├── houses.ts          # House placement logic
│   ├── chart.ts           # computeNatalChart orchestrator
│   └── constants.ts       # Body IDs, aspect definitions, zodiac signs
├── services/
│   ├── profile.ts         # (existing)
│   └── chart.ts           # Chart caching service (Firestore)
├── api/
│   ├── computeNatalChart.ts  # Cloud Function endpoint
│   └── getChart.ts           # Cloud Function with cache
└── types/
    └── index.ts           # (existing, has ChartResult etc.)
```

### Pattern 1: Swiss Ephemeris Initialization (Singleton)
**What:** Initialize Moshier ephemeris once at module load, not per-request
**When to use:** Always — avoids re-initialization overhead on warm starts
```typescript
import sweph from 'sweph';

// Initialize once at module load
sweph.set_ephe_path(null);  // null = Moshier mode, no data files

// Export configured instance for use in other modules
export { sweph };
```

### Pattern 2: Computation Pipeline
**What:** Transform birth data through a clear pipeline with typed intermediate results
**When to use:** For the computeNatalChart function
```
Input: Profile data (date, time, lat, lng, timezone, houseSystem)
  ↓
Step 1: Local time + timezone → UTC (luxon)
  ↓
Step 2: UTC → Julian Day Number (sweph.julday)
  ↓
Step 3: Julian Day → Planetary positions × 10 (sweph.calc_ut)
  ↓
Step 4: Julian Day + coords → House cusps + ASC/MC (sweph.houses)
  ↓
Step 5: Planets + cusps → House placement (sweph.house_pos or manual)
  ↓
Step 6: Planets + ASC/MC → Aspect detection (angular difference algorithm)
  ↓
Output: ChartResult { meta, points[], houses, aspects[] }
```

### Pattern 3: Cache-Through getChart
**What:** Check inputHash cache before computing, store result after computing
**When to use:** getChart endpoint — avoids recomputation for unchanged profiles
```
getChart(profileId, houseSystem)
  → fetch profile
  → compute inputHash(birthDate, birthTime, lat, lng, timezone, houseSystem)
  → query charts where profileId + inputHash match
  → cache hit? return cached result
  → cache miss? compute → store → return
```

### Anti-Patterns to Avoid
- **Calling swe_set_ephe_path() per request:** Initialize once at module level
- **Using Firestore Timestamp for computedAt:** Use ISO strings (matches existing pattern)
- **Computing aspects as a matrix:** Use triangular iteration (i < j) to avoid duplicates
- **Explicit cache invalidation:** Not needed — new inputHash naturally misses old cache
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Planetary positions | VSOP87 or custom orbital mechanics | sweph.calc_ut with Moshier | Sub-arcsecond accuracy, handles precession/nutation |
| House cusps | Manual Placidus trigonometry | sweph.houses | Complex spherical geometry, polar edge cases |
| Planet-in-house | Custom cusp range logic (for unequal houses) | sweph.house_pos | Handles 3D (ecliptic latitude), all house systems |
| Julian Day conversion | Manual formula | sweph.julday | Handles Gregorian/Julian calendar edge cases |
| Timezone conversion | Manual UTC offset tables | luxon DateTime | IANA timezone database, DST rules, historical changes |
| Aspect angular difference | Naive subtraction | Wrap-around formula: `raw > 180 ? 360 - raw : raw` | Handles 360°/0° boundary correctly |

**Key insight:** Swiss Ephemeris has 30+ years of astronomical computation refinement. Every astronomical calculation should go through sweph — the only custom code should be astrological interpretation (zodiac signs, aspects, house placement for Whole Sign).
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: UTC Conversion Before Julian Day
**What goes wrong:** Incorrect planetary positions (off by hours)
**Why it happens:** Passing local time directly to sweph.julday instead of converting to UTC first
**How to avoid:** Always convert local time + IANA timezone → UTC before calling any Swiss Ephemeris function. Use luxon: `DateTime.fromObject({year, month, day, hour, minute}, {zone: timezone}).toUTC()`
**Warning signs:** Planetary positions don't match reference charts for the same birth data

### Pitfall 2: Decimal Hour Format
**What goes wrong:** Times parsed incorrectly
**Why it happens:** sweph.julday expects `hour` as a decimal (14:30 = 14.5), not separate hour/minute
**How to avoid:** Convert: `const decimalHour = hour + minute / 60 + second / 3600`
**Warning signs:** All planets off by a fixed amount (e.g., 30 minutes → ~0.25° Moon error)

### Pitfall 3: Placidus Failure at High Latitudes
**What goes wrong:** House calculation returns invalid cusps
**Why it happens:** Placidus house system cannot be computed for latitudes above ~66.5° (polar circles)
**How to avoid:** Check latitude range, fall back to Whole Sign for extreme latitudes. Or catch the error and return a meaningful message.
**Warning signs:** NaN or zero values in cusp array, error string from swe_houses

### Pitfall 4: House Cusp Array 1-Indexed
**What goes wrong:** Off-by-one errors in house assignments
**Why it happens:** sweph.houses returns cusps[0] as unused; real data is in cusps[1] through cusps[12]
**How to avoid:** Always use indices 1-12, or convert to 0-indexed array explicitly after retrieval
**Warning signs:** House 1 cusp showing wrong value, all houses shifted by one

### Pitfall 5: Aspect Wrap-Around at 0°/360°
**What goes wrong:** Missing aspects between planets near 0° Aries
**Why it happens:** Naive `Math.abs(lon1 - lon2)` gives 350° instead of 10° for planets at 355° and 5°
**How to avoid:** Use: `const raw = Math.abs(lon1 - lon2) % 360; return raw > 180 ? 360 - raw : raw;`
**Warning signs:** "Missing" conjunctions or oppositions for planets in late Pisces / early Aries

### Pitfall 6: Native Module Build Failure on Deploy
**What goes wrong:** Firebase deploy fails with node-gyp errors
**Why it happens:** sweph requires C compilation; Cloud Build environment may lack specific tools
**How to avoid:** Test deploy early (before writing all computation logic). Have sweph-wasm as fallback.
**Warning signs:** "node-gyp rebuild" errors during `firebase deploy --only functions`
</common_pitfalls>

<code_examples>
## Code Examples

### Swiss Ephemeris Initialization and Planetary Calculation
```typescript
// Source: sweph npm docs + Swiss Ephemeris programming interface
import sweph from 'sweph';

// Initialize Moshier ephemeris (no data files needed)
sweph.set_ephe_path(null);

// Body constants
const BODIES = [
  { id: sweph.SUN,     name: 'Sun' },
  { id: sweph.MOON,    name: 'Moon' },
  { id: sweph.MERCURY, name: 'Mercury' },
  { id: sweph.VENUS,   name: 'Venus' },
  { id: sweph.MARS,    name: 'Mars' },
  { id: sweph.JUPITER, name: 'Jupiter' },
  { id: sweph.SATURN,  name: 'Saturn' },
  { id: sweph.URANUS,  name: 'Uranus' },
  { id: sweph.NEPTUNE, name: 'Neptune' },
  { id: sweph.PLUTO,   name: 'Pluto' },
];

const flags = sweph.FLG_SPEED | sweph.FLG_MOSEPH; // Speed + Moshier mode

// Compute one body
const result = sweph.calc_ut(jd, sweph.SUN, flags);
// result.longitude  = ecliptic longitude 0-360
// result.latitude   = ecliptic latitude
// result.distance   = distance in AU
// result.longitudeSpeed = deg/day (negative = retrograde)
```

### House Cusps Calculation
```typescript
// Source: Swiss Ephemeris programming interface
// Placidus
const placidus = sweph.houses(jd, latitude, longitude, 'P');
// placidus.cusps[1..12] = house cusp longitudes
// placidus.ascmc[0] = Ascendant
// placidus.ascmc[1] = Midheaven (MC)
// placidus.ascmc[2] = ARMC (needed for house_pos)

// Whole Sign
const wholeSigns = sweph.houses(jd, latitude, longitude, 'W');
```

### Zodiac Sign Conversion
```typescript
const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

function longitudeToZodiac(lon: number): { sign: string; degreeInSign: number } {
  const normalized = ((lon % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  return {
    sign: ZODIAC_SIGNS[signIndex],
    degreeInSign: normalized % 30,
  };
}
```

### Aspect Detection with Wrap-Around
```typescript
function angularDifference(lon1: number, lon2: number): number {
  const raw = Math.abs(lon1 - lon2) % 360;
  return raw > 180 ? 360 - raw : raw;
}

const ASPECT_DEFS = [
  { type: 'conjunction' as const, angle: 0 },
  { type: 'sextile' as const,    angle: 60 },
  { type: 'square' as const,     angle: 90 },
  { type: 'trine' as const,      angle: 120 },
  { type: 'opposition' as const, angle: 180 },
];
const ORB = 6;

function detectAspect(nameA: string, lonA: number, nameB: string, lonB: number) {
  const diff = angularDifference(lonA, lonB);
  for (const def of ASPECT_DEFS) {
    const deviation = Math.abs(diff - def.angle);
    if (deviation <= ORB) {
      return {
        a: nameA, b: nameB, type: def.type,
        orb: Math.round(deviation * 100) / 100,
        exactness: Math.round((1 - deviation / ORB) * 100) / 100,
      };
    }
  }
  return null;
}
```

### Input Hash for Caching
```typescript
import { createHash } from 'crypto';

function computeInputHash(inputs: {
  birthDate: string; birthTime: string | null;
  lat: number; lng: number; timezone: string; houseSystem: string;
}): string {
  const canonical = [
    inputs.birthDate,
    inputs.birthTime ?? 'NULL',
    inputs.lat.toFixed(6),
    inputs.lng.toFixed(6),
    inputs.timezone,
    inputs.houseSystem,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| swisseph (mivion) callback API | sweph (timotejroiko) sync API | 2023+ | Modern TypeScript, ESM, synchronous returns |
| Downloading .se1 ephemeris files | Moshier mode (built-in) | Always available | No file management for 0.1 arcsec precision |
| Manual UTC offset tables | luxon / Temporal API | Ongoing | IANA timezone database, historical DST |
| GPL-2.0 only | Dual AGPL-3.0 / LGPL-3.0 | sweph v2.10.1+ | LGPL option with pro license for commercial use |

**New tools/patterns to consider:**
- **sweph-wasm (v2.6.9):** WASM fallback if native build fails, but AGPL-only
- **N-API stability:** sweph uses N-API, so it survives Node.js version upgrades without recompilation

**Deprecated/outdated:**
- **swisseph (mivion):** Callback-style API, superseded by sweph (timotejroiko)
- **Manual ephemeris file bundling:** Unnecessary with Moshier mode for astrological precision
</sota_updates>

<open_questions>
## Open Questions

1. **Swiss Ephemeris license for commercial SaaS**
   - What we know: `sweph` is dual AGPL-3.0/LGPL-3.0. LGPL requires 700 CHF pro license. GPL-2.0 available at v2.10.0 (SaaS loophole).
   - What's unclear: Whether the project will go commercial (needs pro license) or stay open-source (AGPL fine)
   - Recommendation: Use latest `sweph` for MVP. If going commercial, purchase pro license (700 CHF one-time) or pin to v2.10.0 under GPL-2.0.

2. **Native module deployment reliability**
   - What we know: sweph uses node-gyp + N-API, Cloud Functions build env has gcc/make. Similar native packages (sharp) work.
   - What's unclear: Whether sweph specifically compiles cleanly on current Cloud Build images
   - Recommendation: Test deploy early in Phase 3 (plan 03-01). Have sweph-wasm as documented fallback.

3. **ASC/MC in aspects**
   - What we know: Including ASC/MC in aspects is standard astrological practice (65 pairs vs 45)
   - What's unclear: Whether to include in MVP or defer
   - Recommendation: Include — it's 20 extra pairs with the same algorithm, minimal additional work
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Swiss Ephemeris Programming Interface: https://www.astro.com/swisseph/swephprg.htm
- sweph npm package: https://www.npmjs.com/package/sweph (v2.10.3-b-1)
- sweph GitHub: https://github.com/timotejroiko/sweph
- Swiss Ephemeris source: https://github.com/aloistr/swisseph (swephexp.h constants)
- Node.js crypto module: https://nodejs.org/api/crypto.html

### Secondary (MEDIUM confidence)
- sweph-wasm: https://github.com/ptprashanttripathi/sweph-wasm (v2.6.9)
- circular-natal-horoscope-js: https://github.com/0xStarcat/CircularNatalHoroscopeJS
- Swiss Ephemeris license/price: https://www.astro.com/swisseph/swephprice_e.htm
- swephR house calculation reference (R wrapper docs, same underlying C API)
- Firebase Cloud Functions dependencies: https://firebase.google.com/docs/functions/handle-dependencies

### Tertiary (LOW confidence — needs validation during implementation)
- sweph native compilation on Cloud Functions build environment (inferred from sharp precedent)
- WASM cold start vs native cold start performance comparison (estimated, not benchmarked)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Swiss Ephemeris via sweph npm package
- Ecosystem: sweph, sweph-wasm, luxon, Node.js crypto
- Patterns: Computation pipeline, Moshier mode, cache-through, aspect detection
- Pitfalls: UTC conversion, decimal hours, Placidus polar limits, 1-indexed cusps, wrap-around

**Confidence breakdown:**
- Standard stack: HIGH — verified with npm, GitHub, official SE docs
- Architecture: HIGH — computation pipeline is well-established in astrology software
- Pitfalls: HIGH — documented in SE programming interface and community
- Code examples: HIGH — from sweph npm docs and SE programming interface
- Native deploy: MEDIUM — inferred from similar packages, needs validation

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days — sweph ecosystem stable)
</metadata>

---

*Phase: 03-astro-engine*
*Research completed: 2026-02-12*
*Ready for planning: yes*
