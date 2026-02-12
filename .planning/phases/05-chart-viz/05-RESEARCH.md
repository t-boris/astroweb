# Phase 5: Chart Visualization - Research

**Researched:** 2026-02-12
**Domain:** SVG natal chart wheel rendering, interactive SVG in React, astrological glyph rendering
**Confidence:** HIGH

<research_summary>
## Summary

Researched SVG natal chart wheel construction (geometry, coordinate math, arc drawing), interactive SVG patterns in React (hover, tooltips, filtering), existing open-source astrology chart renderers, and astrological glyph rendering options.

**Chart wheel geometry:** Natal charts use concentric rings — outer zodiac ring (12 signs, 30° each), house cusp lines (variable angles), planet placement ring, and inner area for aspect lines. The Ascendant is placed at the 9 o'clock position (left), with signs progressing counterclockwise. Key formula: `svg_angle = 180 - (ecliptic_degree - ascendant_degree)`.

**SVG in React:** Inline SVG with React components is the recommended approach. Use a fixed viewBox (e.g., `0 0 1000 1000`) for responsive scaling. Hover interactions work best with a hybrid approach: React state for "active planet" + CSS transitions for visual changes. Tooltips use HTML overlays positioned via SVG-to-screen coordinate conversion (`getScreenCTM`).

**Existing libraries:** Several open-source chart renderers exist (@astrodraw/astrochart, AstrologyChart2, astrology-chart-wheel) but none are ideal as dependencies for a React+TS project. Better to build custom components using their architectural patterns as reference — particularly the separation of data/calculation from rendering.

**Primary recommendation:** Build custom React SVG components with a component hierarchy (ChartWheel > ZodiacRing > HouseCusps > AspectLines > PlanetMarkers). Use Unicode glyphs for zodiac/planet symbols (well-supported). Implement simple radial offset for planet label collision avoidance. Use React state + CSS transitions for hover/filter interactions.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React (inline SVG) | 19.x | SVG rendering via JSX | Full control, no extra dependencies, excellent React DX |
| — (pure math utils) | — | Polar-to-Cartesian, arc paths | ~20 lines of trig, no library needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.563.0 | UI icons (filter toggles, actions) | Already installed, NOT for astro glyphs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom SVG components | @astrodraw/astrochart | No React integration, no TypeScript types, DOM manipulation |
| Custom SVG components | astrology-chart-wheel (npm) | Very new (Aug 2025), 1 star, limited customization |
| Unicode glyphs | Astronomicon web font | Font adds complexity; Unicode symbols work in all modern browsers |
| Unicode glyphs | Inline SVG paths per glyph | Most reliable but verbose; overkill for MVP |
| Simple radial offset | D3 force-directed layout | Massive dependency for a simple collision problem |

**No installation needed** — all rendering uses React's built-in SVG support, Unicode characters, and custom math utilities.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Component Hierarchy
```
web/src/components/chart/
├── NatalChart.tsx          # Container: state, data transform, layout
├── ZodiacRing.tsx          # 12 sign sectors (30° arcs with glyphs)
├── HouseCusps.tsx          # 12 cusp lines + house numbers
├── PlanetMarkers.tsx       # Planet glyphs at correct degrees
├── AspectLines.tsx         # Lines connecting planet pairs
├── ChartTooltip.tsx        # HTML tooltip overlay
├── AspectFilters.tsx       # Toggle buttons for aspect types
└── utils/
    └── chartMath.ts        # Coordinate conversion, arc paths
```

### Pattern 1: Concentric Ring Architecture
**What:** Chart wheel is built from concentric circles with specific radius ratios
**When to use:** Always — this is the standard natal chart structure

```
Ring layout (from outside in):
- Outer border:     r = 100% (e.g., 480 in viewBox 1000)
- Zodiac ring:      r = 90-100% (outer) to 75-80% (inner) — 12 sign sectors
- House ring:       r = 75-80% (outer) to 55-60% (inner) — house cusp lines
- Planet ring:      r = ~65% — planet glyph placement
- Aspect area:      r = 0-55% — aspect lines drawn inside this circle
```

### Pattern 2: ASC-Anchored Rotation
**What:** The entire chart rotates so the Ascendant degree sits at 9 o'clock (left)
**When to use:** Always for traditional natal chart display

```typescript
// Convert ecliptic longitude to SVG angle
// ASC placed at 180° (9 o'clock / left side)
function eclipticToSvgAngle(eclipticDegree: number, ascDegree: number): number {
  return 180 - (eclipticDegree - ascDegree);
}

// Convert SVG angle to x,y coordinates
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),  // Subtract: SVG Y-axis is inverted
  };
}
```

**Key insight:** Signs progress counterclockwise. House 1 starts at ASC (left). The `180 -` in the formula handles the SVG coordinate flip (SVG 0° = right/3 o'clock, astro convention = left/9 o'clock).

### Pattern 3: Hybrid Hover (React State + CSS Transitions)
**What:** React state tracks which planet is hovered; CSS handles the visual transitions
**When to use:** Any interactive SVG with hover highlighting

```typescript
// Parent manages hover state
const [hoveredPlanet, setHoveredPlanet] = useState<string | null>(null);

// Each element checks hover state for styling
<g
  className={cn(
    "transition-opacity duration-200",
    hoveredPlanet && hoveredPlanet !== planet.id && "opacity-20",
    hoveredPlanet === planet.id && "opacity-100"
  )}
  onMouseEnter={() => setHoveredPlanet(planet.id)}
  onMouseLeave={() => setHoveredPlanet(null)}
>
```

**Why hybrid:** Pure CSS `:hover` can't cross SVG groups (hovering a planet can't affect aspect lines in a different `<g>`). React state propagates across components; CSS transitions keep it smooth.

### Pattern 4: SVG Arc Drawing
**What:** Drawing arc segments for zodiac sign sectors using SVG path `A` command
**When to use:** Zodiac ring rendering (12 sectors of 30° each)

```typescript
function describeArc(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = 0; // counterclockwise
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}
```

### Anti-Patterns to Avoid
- **Using Canvas instead of SVG:** Lose all interactivity (hover, click, tooltips). SVG is correct for this use case.
- **Creating SVG elements imperatively (DOM manipulation):** Use React JSX for SVG — full component model, proper re-rendering.
- **Rendering aspect lines on top of planets:** Aspect lines go in the inner circle BEHIND planet markers. Layer order matters.
- **Using a D3 force layout for collision avoidance:** Massive dependency for a problem solvable with a simple sort + offset algorithm.
- **Calculating positions on every render:** Memoize coordinate calculations with `useMemo`.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zodiac/planet glyphs | Custom SVG icon paths | Unicode characters: ♈♉♊♋♌♍♎♏♐♑♒♓ ☉☽☿♀♂♃♄♅♆♇ | Well-supported in all modern browsers, zero dependencies |
| SVG responsive scaling | Manual resize listeners | SVG `viewBox` + CSS `width: 100%` | viewBox handles all scaling natively |
| Smooth hover transitions | JavaScript animation loops | CSS `transition-opacity duration-200` on SVG elements | Hardware-accelerated, zero JS overhead |
| Aspect type colors | Complex color computation | Static map: `{ trine: "blue", square: "red", ... }` | Fixed set of 5 aspect types, no computation needed |
| Coordinate conversion | External math library | 3 utility functions (~20 lines total) | polarToCartesian, eclipticToSvgAngle, describeArc |

**Key insight:** The chart wheel is geometrically simple — concentric circles, radial lines, and arcs. The math is basic trigonometry (sin, cos). No libraries needed beyond React's SVG support and ~20 lines of utility functions.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: SVG Y-Axis Inversion
**What goes wrong:** Signs/planets appear in wrong positions (mirrored vertically)
**Why it happens:** SVG Y-axis increases downward, but math convention is Y-up. So `sin(angle)` must be negated for SVG.
**How to avoid:** Use `y: cy - r * Math.sin(rad)` (subtract, not add). Encapsulate in a single `polarToCartesian` function used everywhere.
**Warning signs:** Aries appearing at bottom instead of left, planets in wrong quadrant.

### Pitfall 2: Sign Sector Direction
**What goes wrong:** Zodiac signs appear clockwise instead of counterclockwise
**Why it happens:** Confusing SVG angle direction with astrological convention. Astrology: signs progress counterclockwise (Aries→Taurus→Gemini going counterclockwise). SVG angles go clockwise by default.
**How to avoid:** The `180 - angle` formula in `eclipticToSvgAngle` handles this correctly. Verify Aries→Taurus→Gemini goes counterclockwise from the ASC.
**Warning signs:** Looking at the chart and sign order is reversed.

### Pitfall 3: Planet Label Collision (Stelliums)
**What goes wrong:** 3+ planet glyphs overlap and become unreadable when close together
**Why it happens:** Multiple planets within 5-10° of each other (common — especially Sun/Mercury/Venus)
**How to avoid:** Simple radial offset algorithm: sort planets by degree, if adjacent planets are within minimum separation (e.g., 8°), push the second one outward by a fixed offset, connect with a thin leader line.
**Warning signs:** Test with a chart containing Sun conjunct Mercury conjunct Venus — all three should be readable.

### Pitfall 4: Large-Arc Flag in SVG Arcs
**What goes wrong:** Arc draws the wrong way around the circle (short arc vs long arc)
**Why it happens:** SVG `A` command's `large-arc-flag` controls which of two possible arcs to draw. For 30° zodiac sectors, it must be `0` (short arc). For sectors > 180° (shouldn't happen for signs, but could for highlighted ranges), it must be `1`.
**How to avoid:** `const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;`
**Warning signs:** One zodiac sector spans 330° instead of 30°.

### Pitfall 5: Touch Target Size on Mobile
**What goes wrong:** Planet glyphs are impossible to tap on mobile devices
**Why it happens:** Unicode text or small circles have tiny hit areas
**How to avoid:** Add an invisible `<circle r="20">` behind each planet glyph as a touch target (with `fill="transparent"`). Minimum touch target: 44x44 CSS pixels.
**Warning signs:** Works on desktop, impossible to interact with on phone.

### Pitfall 6: Tooltip Positioning with viewBox Scaling
**What goes wrong:** Tooltip appears in wrong position or jumps around on resize
**Why it happens:** SVG viewBox coordinates don't match screen coordinates. A point at (500, 300) in viewBox space could be at any screen position depending on container size.
**How to avoid:** Use `svgElement.getScreenCTM()` to transform SVG coordinates to screen coordinates before positioning the HTML tooltip.
**Warning signs:** Tooltip is offset from the planet, especially on different screen sizes.
</common_pitfalls>

<code_examples>
## Code Examples

### Core Coordinate Utilities
```typescript
// Source: Standard trigonometry + SVG coordinate conventions
// Verified against: AstroChart (github.com/Kibo/AstroChart) utils.js

const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert ecliptic longitude to SVG angle.
 * Places the Ascendant at 9 o'clock (180° in SVG terms).
 * Signs progress counterclockwise.
 */
export function eclipticToSvgAngle(eclipticDegree: number, ascDegree: number): number {
  return 180 - (eclipticDegree - ascDegree);
}

/**
 * Convert polar coordinates (angle in degrees, radius) to Cartesian (x, y).
 * Accounts for SVG's inverted Y-axis.
 */
export function polarToCartesian(
  cx: number, cy: number, radius: number, angleDeg: number
): { x: number; y: number } {
  const rad = angleDeg * DEG_TO_RAD;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),  // Subtract for SVG Y-inversion
  };
}

/**
 * Create an SVG arc path between two angles on a circle.
 * Used for zodiac sign sectors and house arcs.
 */
export function describeArc(
  cx: number, cy: number, radius: number,
  startAngle: number, endAngle: number
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`,
  ].join(" ");
}

/**
 * Create an SVG sector path (pie slice) between two angles.
 * Used for colored zodiac sign backgrounds.
 */
export function describeSector(
  cx: number, cy: number,
  innerRadius: number, outerRadius: number,
  startAngle: number, endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}
```

### Unicode Glyph Maps
```typescript
// Source: Unicode standard (Miscellaneous Symbols block U+2600-U+26FF)

export const ZODIAC_GLYPHS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

export const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};

export const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: "☌", opposition: "☍", trine: "△", square: "□", sextile: "⚹",
};
```

### Element Color Scheme
```typescript
// Source: Traditional astrological element associations

export const ELEMENT_COLORS = {
  fire: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },   // Aries, Leo, Sagittarius
  earth: { bg: "#DCFCE7", border: "#22C55E", text: "#15803D" },   // Taurus, Virgo, Capricorn
  air: { bg: "#FEF9C3", border: "#EAB308", text: "#A16207" },     // Gemini, Libra, Aquarius
  water: { bg: "#DBEAFE", border: "#3B82F6", text: "#1D4ED8" },   // Cancer, Scorpio, Pisces
};

export const SIGN_ELEMENTS: Record<string, keyof typeof ELEMENT_COLORS> = {
  Aries: "fire", Taurus: "earth", Gemini: "air", Cancer: "water",
  Leo: "fire", Virgo: "earth", Libra: "air", Scorpio: "water",
  Sagittarius: "fire", Capricorn: "earth", Aquarius: "air", Pisces: "water",
};

export const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#A855F7",  // purple
  opposition: "#EF4444",   // red
  trine: "#3B82F6",        // blue
  square: "#F97316",       // orange
  sextile: "#22C55E",      // green
};
```

### Simple Collision Avoidance
```typescript
// Source: Adapted from AstroChart collision detection pattern

interface PlacedPlanet {
  id: string;
  degree: number;     // Original ecliptic degree
  placedAngle: number; // Adjusted angle after collision resolution
  radius: number;      // Radius (may be offset outward)
  hasLeader: boolean;  // Whether a leader line connects to original position
}

export function resolvePlanetCollisions(
  planets: Array<{ id: string; degree: number }>,
  ascDegree: number,
  baseRadius: number,
  minSeparationDeg = 8,
  offsetStep = 25,
): PlacedPlanet[] {
  // Convert to SVG angles and sort
  const sorted = planets
    .map((p) => ({
      id: p.id,
      degree: p.degree,
      svgAngle: eclipticToSvgAngle(p.degree, ascDegree),
    }))
    .sort((a, b) => a.svgAngle - b.svgAngle);

  const placed: PlacedPlanet[] = [];

  for (const planet of sorted) {
    let radius = baseRadius;
    let placedAngle = planet.svgAngle;
    let hasLeader = false;

    // Check collision with already-placed planets
    for (const existing of placed) {
      const angleDiff = Math.abs(placedAngle - existing.placedAngle);
      if (angleDiff < minSeparationDeg && radius === existing.radius) {
        radius += offsetStep; // Push outward
        hasLeader = true;
      }
    }

    placed.push({
      id: planet.id,
      degree: planet.degree,
      placedAngle,
      radius,
      hasLeader,
    });
  }

  return placed;
}
```

### Tooltip Coordinate Conversion
```typescript
// Source: SVG spec (getScreenCTM) + React pattern

function svgToScreen(
  svgElement: SVGSVGElement,
  svgX: number,
  svgY: number
): { x: number; y: number } {
  const point = svgElement.createSVGPoint();
  point.x = svgX;
  point.y = svgY;
  const ctm = svgElement.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const screenPoint = point.matrixTransform(ctm);
  return { x: screenPoint.x, y: screenPoint.y };
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| D3.js for SVG chart rendering | React inline SVG components | React 16+ (2018+) | Full React component model, no DOM manipulation |
| External astro chart libraries | Custom React SVG components | Ongoing | Better TypeScript, React integration, customization |
| Flash/Canvas for interactive charts | SVG + CSS transitions | 2015+ | Accessible, scalable, interactive by default |
| Manual DOM event handling | React synthetic events on SVG | React standard | onMouseEnter/onMouseLeave work on SVG elements |
| Fixed-size chart images | viewBox + responsive CSS | SVG2 standard | Charts scale perfectly to any container size |

**New tools/patterns to consider:**
- **Pointer events API:** `onPointerEnter`/`onPointerLeave` unify mouse + touch (no separate touch handling needed)
- **CSS `transition` on SVG:** Modern browsers support CSS transitions on SVG `opacity`, `fill`, `stroke`, `transform`
- **ResizeObserver:** For responsive containers that hold the SVG chart

**Deprecated/outdated:**
- **D3 for simple charts in React:** Overkill when React can render SVG directly — D3's value is data manipulation, not DOM creation
- **Canvas for interactive charts:** Loses native interactivity (hover, click, accessibility)
- **Snap.svg / Raphaël:** Obsolete SVG manipulation libraries from pre-React era
</sota_updates>

<open_questions>
## Open Questions

1. **Unicode glyph rendering consistency**
   - What we know: ♈♉♊♋♌♍♎♏♐♑♒♓ and ☉☽☿♀♂♃♄♅♆♇ are in Unicode standard. Modern browsers render them.
   - What's unclear: Whether all symbols render identically across OS/browser/font combinations. Some symbols (♅ Uranus, ♇ Pluto) are less common.
   - Recommendation: Start with Unicode text. If rendering is inconsistent during testing, switch to inline SVG paths for problematic glyphs only.

2. **Performance with all aspect lines visible**
   - What we know: 10 planets = up to 45 pairs. With ASC/MC = 12 points = up to 66 pairs. Each is an SVG `<line>`.
   - What's unclear: Whether 66 `<line>` elements with CSS transitions cause jank on mobile.
   - Recommendation: Likely fine (SVG handles hundreds of elements). Monitor during implementation. If needed, reduce to major aspects only by default.

3. **House cusp rendering for Whole Sign vs Placidus**
   - What we know: Placidus has variable-width houses. Whole Sign has exactly 30° per house.
   - What's unclear: Best visual treatment for the difference — should Whole Sign houses align exactly with zodiac signs (they do by definition)?
   - Recommendation: For Whole Sign, house lines overlap with zodiac sign boundaries. For Placidus, house lines are independent. Both use the same rendering code — only the cusp degree array differs.

4. **Chart orientation: should it rotate on window resize?**
   - What we know: viewBox handles scaling. Chart should remain square.
   - What's unclear: Whether the chart should have a fixed aspect ratio container or fill available width.
   - Recommendation: Use `aspect-ratio: 1` on the container, max-width to prevent oversizing. Let viewBox handle the rest.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- SVG Path specification (arcs): https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Paths
- SVG coordinate system: https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Positions
- React SVG rendering: https://react.dev/reference/react-dom/components#svg-components
- AstroChart source code (coordinate math patterns): https://github.com/Kibo/AstroChart
- AstrologyChart2 (modern rewrite): https://github.com/Kibo/AstrologyChart2
- Unicode astrology symbols: https://en.wikipedia.org/wiki/Astrological_symbols
- SVG getScreenCTM (tooltip positioning): https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getScreenCTM

### Secondary (MEDIUM confidence)
- CircularNatalHoroscopeJS (dual coordinate system pattern): https://github.com/0xStarcat/CircularNatalHoroscopeJS
- astrology-chart-wheel (React component): https://github.com/hew/astrology-chart-wheel
- Astronomicon font (astrology web font): https://astronomicon.co/en/astronomicon-fonts/
- Smashing Magazine SVG arcs: https://www.smashingmagazine.com/2024/12/mastering-svg-arcs/
- LogRocket SVG in React guide: https://blog.logrocket.com/guide-svgs-react/

### Tertiary (LOW confidence — needs validation during implementation)
- Unicode glyph cross-browser consistency (assumed good, needs testing)
- CSS transition performance on 66 SVG lines (estimated fine, needs mobile testing)
- Radial offset collision avoidance (simple algorithm, may need tuning for 4+ planet clusters)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: SVG rendering in React (inline JSX)
- Ecosystem: No external chart libraries needed; pure React + SVG + math utils
- Patterns: Concentric ring architecture, ASC-anchored rotation, hybrid hover, arc drawing
- Pitfalls: Y-axis inversion, sign direction, label collision, arc flags, touch targets, tooltip positioning

**Confidence breakdown:**
- Standard stack: HIGH — verified with MDN docs, React docs, open-source implementations
- Architecture: HIGH — consistent patterns across multiple astro chart libraries
- Pitfalls: HIGH — documented in SVG spec, observed in existing libraries
- Code examples: HIGH — verified against AstroChart source and SVG spec

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days — stable SVG/React ecosystem)
</metadata>

---

*Phase: 05-chart-viz*
*Research completed: 2026-02-12*
*Ready for planning: yes*
