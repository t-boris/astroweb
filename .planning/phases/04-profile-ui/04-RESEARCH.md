# Phase 4: Profile UI & Geocoding - Research

**Researched:** 2026-02-12
**Domain:** Geocoding, timezone lookup, Firebase callable functions from React
**Confidence:** HIGH

<research_summary>
## Summary

Researched geocoding APIs (Nominatim vs Photon), timezone-from-coordinates solutions (APIs vs server-side libraries), and the Firebase `httpsCallable` client pattern for calling Cloud Functions from React.

**Geocoding:** Photon (photon.komoot.io) is recommended over Nominatim for web apps because Nominatim **strictly forbids autocomplete/typeahead** usage (instant ban). Photon uses the same OpenStreetMap data, requires no API key, and explicitly supports search-as-you-type. Both return lat/lng + structured address.

**Timezone lookup:** `geo-tz` npm package (v8.1.5) provides exact IANA timezone from coordinates using boundary data — no external API needed. ~70-100MB disk but fine for Cloud Functions (500MB limit). Zero rate limits, zero API keys.

**Firebase client:** `httpsCallable<Req, Res>(functions, 'name')` with TypeScript generics. CORS handled automatically by onCall. Errors map to `FirebaseError` with `functions/` prefix codes.

**Primary recommendation:** Use Photon for place search with debounced typeahead, `geo-tz` in a Cloud Function for timezone lookup, and typed `httpsCallable` wrappers for all API calls.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Photon API | — | Geocoding (place → lat/lng) | Free, no API key, supports autocomplete (Nominatim forbids it) |
| geo-tz | 8.1.5 | Lat/lng → IANA timezone | Exact boundary matching, no external API, MIT license |
| firebase/functions | 12.x | httpsCallable client SDK | Already installed, typed generics, auto-CORS |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @photostructure/tz-lookup | 11.4.0 | Client-side timezone preview | Optional: 72KB, instant (~0.05ms), ~90% accurate in populated areas |
| firebase/app | 12.x | FirebaseError import | Error handling for callable functions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Photon | Nominatim | Nominatim forbids autocomplete; OK for submit-only search |
| Photon | LocationIQ | 5K req/day free, requires API key, higher limits |
| geo-tz (server) | TimeZoneDB API | Free but 1 req/sec limit, requires API key |
| geo-tz (server) | Google Timezone API | 10K/month free, requires key + billing account |
| geo-tz (server) | @photostructure/tz-lookup | 72KB but ~10% error rate in populated areas — unacceptable for astrology |

**Installation (functions):**
```bash
cd functions && npm install geo-tz
```

**No client installation needed** — Photon is a fetch API call, Firebase SDK already installed.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Photon Place Search with Debounce
**What:** Client-side typeahead calling Photon API with debounced input
**When to use:** Profile create/edit form place search field
```
User types "Chica" → 300ms debounce → fetch Photon → dropdown shows results
User selects "Chicago, IL, USA" → lat/lng extracted from GeoJSON
```
**Endpoint:** `GET https://photon.komoot.io/api?q={query}&limit=5&lang=en`
**Response:** GeoJSON FeatureCollection with `geometry.coordinates[lon, lat]` and `properties.{city, state, country, countrycode}`

### Pattern 2: Server-Side Timezone Resolution
**What:** Cloud Function uses geo-tz to convert coordinates to IANA timezone
**When to use:** After geocoding returns lat/lng, before saving profile
```
Client sends { lat, lng } → Cloud Function → geo-tz.find(lat, lng) → "America/Chicago"
```
**Options for integration:**
- **Option A (preferred):** Add timezone lookup to `createProfile`/`updateProfile` Cloud Functions — server resolves timezone from lat/lng, client doesn't send timezone at all.
- **Option B:** Separate `lookupTimezone` Cloud Function called by client before form submission.
- **Option C:** Client sends timezone from `@photostructure/tz-lookup`, server verifies with geo-tz.

### Pattern 3: Typed httpsCallable Wrappers
**What:** Create a typed API client layer in web/src/api/ that wraps httpsCallable calls
**When to use:** Every Cloud Function call from the frontend
```typescript
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import type { CreateProfilePayload, Profile } from "../types";

export async function createProfile(payload: CreateProfilePayload): Promise<Profile> {
  const fn = httpsCallable<CreateProfilePayload, Profile>(functions, "createProfile");
  const result = await fn(payload);
  return result.data;
}
```
**Error handling:**
```typescript
import { FirebaseError } from "firebase/app";
// error.code is "functions/invalid-argument", "functions/not-found", etc.
```

### Anti-Patterns to Avoid
- **Calling Nominatim on every keystroke:** Violates usage policy, will get banned. Use Photon for typeahead.
- **Using approximate timezone (tz-lookup) as authoritative:** 10% error rate in populated areas is unacceptable for astrology. Always use geo-tz server-side.
- **Sending raw fetch() to Cloud Functions:** Use httpsCallable — handles CORS, error mapping, and data envelope automatically.
- **Hardcoding timezone list for manual selection:** Error-prone UX. Auto-resolve from coordinates instead.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Place search / geocoding | Custom address parsing or geocoding server | Photon API (photon.komoot.io) | Free, no key, supports typeahead, uses OSM data |
| Timezone from coordinates | UTC offset lookup tables or manual mapping | geo-tz npm package | Exact boundary data, handles DST, 400+ timezone zones |
| Debounced search input | Custom setTimeout/clearTimeout logic | Simple debounce util (3 lines) or lodash.debounce | Edge cases with cleanup, race conditions |
| Cloud Function client calls | Raw fetch with CORS headers | httpsCallable from Firebase SDK | Auto-CORS, error mapping, type safety |
| Form validation | Complex validation framework | Hand-rolled (already established pattern in Phase 2) | Simple field checks, already have validation pattern |

**Key insight:** The geocoding and timezone problems look simple but have edge cases (DST boundaries, disputed territories, ocean coordinates). Use established solutions that handle these.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Nominatim Autocomplete Ban
**What goes wrong:** App gets IP-banned from Nominatim
**Why it happens:** Sending requests on every keystroke violates Nominatim's strict usage policy
**How to avoid:** Use Photon (photon.komoot.io) which explicitly supports autocomplete
**Warning signs:** Getting 403/429 responses from nominatim.openstreetmap.org

### Pitfall 2: Photon Coordinates Are [lon, lat] Not [lat, lng]
**What goes wrong:** Swapped latitude and longitude
**Why it happens:** GeoJSON standard uses [longitude, latitude] order, but most forms show lat first
**How to avoid:** Always destructure as `const [lon, lat] = feature.geometry.coordinates`
**Warning signs:** Places appearing in the wrong hemisphere or ocean

### Pitfall 3: Race Conditions in Typeahead
**What goes wrong:** Selecting a result shows data from a different (earlier) search
**Why it happens:** Slower response for query "Chi" arrives after faster response for "Chica"
**How to avoid:** Use AbortController to cancel in-flight requests when new input arrives
**Warning signs:** Dropdown flickering or showing wrong results

### Pitfall 4: geo-tz Cold Start in Cloud Functions
**What goes wrong:** First timezone lookup takes 2-5 seconds
**Why it happens:** geo-tz loads ~70MB of boundary data on first call
**How to avoid:** Use `setCache({ preload: true })` at module level so data loads during function init. Consider min instances = 1 for production.
**Warning signs:** First profile creation after deploy is very slow, subsequent ones are fast

### Pitfall 5: Missing geo-tz in functions package.json
**What goes wrong:** Deploy fails or timezone lookup returns empty
**Why it happens:** geo-tz installed in root instead of functions/ directory
**How to avoid:** Always `cd functions && npm install geo-tz` — Cloud Functions only deploy functions/node_modules
**Warning signs:** "Cannot find module 'geo-tz'" in Cloud Functions logs

### Pitfall 6: FirebaseError Code Prefix
**What goes wrong:** Error code comparison fails
**Why it happens:** Client-side error codes are prefixed with "functions/" (e.g., "functions/not-found"), not bare codes
**How to avoid:** Always compare with prefix: `error.code === "functions/not-found"`
**Warning signs:** Error handling not catching expected errors
</common_pitfalls>

<code_examples>
## Code Examples

### Photon Geocoding Search
```typescript
// Source: Photon API documentation (photon.komoot.io)
const PHOTON_URL = "https://photon.komoot.io/api";

async function searchPlaces(query: string, lang = "en", limit = 5): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({ q: query, lang, limit: String(limit) });
  const response = await fetch(`${PHOTON_URL}?${params}`);
  const data = await response.json();
  return data.features; // GeoJSON features
}

// Each feature:
// feature.geometry.coordinates = [lon, lat] (NOTE: lon first!)
// feature.properties.name = "Chicago"
// feature.properties.city = "Chicago"
// feature.properties.state = "Illinois"
// feature.properties.country = "United States"
// feature.properties.countrycode = "us"
```

### geo-tz Server-Side Timezone Lookup
```typescript
// Source: geo-tz npm documentation
import { find, setCache } from "geo-tz";

// Preload at module level for warm lookups
setCache({ preload: true });

function getTimezone(lat: number, lng: number): string {
  const results = find(lat, lng);
  return results[0] || "UTC"; // First result is primary timezone
}

// Example: getTimezone(41.8781, -87.6298) → "America/Chicago"
```

### Typed httpsCallable Client Wrapper
```typescript
// Source: Firebase documentation + firebase-js-sdk
import { httpsCallable } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import { functions } from "../lib/firebase";

export async function callFunction<Req, Res>(name: string, data: Req): Promise<Res> {
  const fn = httpsCallable<Req, Res>(functions, name);
  const result = await fn(data);
  return result.data;
}

// Error handling:
try {
  const profile = await callFunction<CreateProfilePayload, Profile>("createProfile", payload);
} catch (error) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/invalid-argument": // validation error
      case "functions/not-found":        // resource not found
      case "functions/permission-denied": // ownership check failed
      case "functions/internal":          // server error
    }
  }
}
```

### Debounced Search Input Pattern
```typescript
// Debounce + AbortController for typeahead
let controller: AbortController | null = null;

function handleSearchInput(query: string) {
  controller?.abort(); // Cancel previous request
  if (query.length < 3) return;

  controller = new AbortController();
  const signal = controller.signal;

  setTimeout(async () => {
    if (signal.aborted) return;
    const results = await searchPlaces(query);
    if (!signal.aborted) {
      setResults(results); // Update UI
    }
  }, 300); // 300ms debounce
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nominatim for autocomplete | Photon for autocomplete | Always (policy existed) | Nominatim never allowed typeahead; Photon is the correct choice |
| Google Maps geocoding | Free OSM-based alternatives | Ongoing | No API key or billing needed |
| Manual timezone selection | geo-tz automatic resolution | geo-tz v7+ (2023) | Exact boundary data, zero API dependency |
| firebase.functions().httpsCallable | httpsCallable(functions, name) | Firebase v9+ modular SDK | Tree-shakeable, typed generics |

**New tools/patterns to consider:**
- **Photon reverse geocoding:** `GET https://photon.komoot.io/reverse?lat=X&lon=Y` — useful if allowing map pin drops
- **geo-tz v8 dataset options:** "Alike Since 1970" (default, recommended), "Comprehensive" (for pre-1970 births), "Same Since Now" (smallest)

**Deprecated/outdated:**
- **Nominatim for typeahead:** Never was allowed, but many tutorials incorrectly suggest it
- **tz-lookup (original Dark Sky):** Unmaintained, use @photostructure/tz-lookup fork if client-side needed
- **Firebase compat SDK:** `firebase.functions().httpsCallable()` — use modular imports
</sota_updates>

<open_questions>
## Open Questions

1. **Timezone resolution architecture**
   - What we know: geo-tz works server-side, gives exact IANA timezone from lat/lng
   - What's unclear: Should timezone be resolved in createProfile/updateProfile (server auto-resolves) or via a separate lookupTimezone function (client calls explicitly)?
   - Recommendation: Resolve in createProfile/updateProfile — simpler client, timezone always accurate. Client can show preview using Photon's country code + common sense, or add @photostructure/tz-lookup (72KB) for instant preview.

2. **geo-tz Cloud Functions deploy size**
   - What we know: geo-tz adds ~70-100MB to deployment. Cloud Functions limit is 500MB.
   - What's unclear: Whether this significantly increases cold start time on Gen 2 functions
   - Recommendation: Test deploy early. Use `setCache({ preload: true })` for warm performance. Consider min instances = 1 for production if cold start is problematic.

3. **Photon API reliability**
   - What we know: photon.komoot.io is free, hosted by Komoot. No SLA.
   - What's unclear: Uptime guarantees, long-term availability
   - Recommendation: Acceptable for MVP. If reliability becomes an issue, can self-host Photon or switch to LocationIQ (5K req/day free, requires key).
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Nominatim Search API: https://nominatim.org/release-docs/latest/api/Search/
- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- Photon Geocoder: https://photon.komoot.io/
- Photon GitHub: https://github.com/komoot/photon
- geo-tz npm: https://www.npmjs.com/package/geo-tz
- geo-tz GitHub: https://github.com/evansiroky/node-geo-tz
- Firebase Callable Functions: https://firebase.google.com/docs/functions/callable
- Firebase httpsCallable API: https://modularfirebase.web.app/reference/functions.httpscallable

### Secondary (MEDIUM confidence)
- @photostructure/tz-lookup: https://www.npmjs.com/package/@photostructure/tz-lookup
- TimeZoneDB API: https://timezonedb.com/api
- GeoNames Timezone: https://www.geonames.org/export/web-services.html

### Tertiary (LOW confidence — needs validation during implementation)
- Photon API rate limits ("be fair" — unspecified exact limits)
- geo-tz cold start impact on Gen 2 Cloud Functions (estimated, not benchmarked)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Photon geocoding API, geo-tz timezone library, Firebase httpsCallable
- Ecosystem: Photon, geo-tz, @photostructure/tz-lookup, Firebase modular SDK
- Patterns: Debounced typeahead, server-side timezone resolution, typed callable wrappers
- Pitfalls: Nominatim ban, coordinate order, race conditions, cold start, error code prefix

**Confidence breakdown:**
- Standard stack: HIGH — verified with official docs, npm, GitHub
- Architecture: HIGH — established patterns for geocoding + Firebase
- Pitfalls: HIGH — documented in Nominatim policy, GeoJSON spec, Firebase docs
- Code examples: HIGH — from official API documentation

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days — stable ecosystem)
</metadata>

---

*Phase: 04-profile-ui*
*Research completed: 2026-02-12*
*Ready for planning: yes*
