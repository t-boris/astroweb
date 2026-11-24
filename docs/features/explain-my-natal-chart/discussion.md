# Discussion — Explain my natal chart

### Agent · 2026-11-24

Shipped 2026-11-24: backend PR #38, page PR #39 (2.32.0), panel label wrap PR #40 (2.32.1). Live Admin test: Claude Sonnet 5.5 read the bundled Astro-Seek picture in 4.8 s for $0.01; the solver gives 30 Mar 2002 03:30 ±1 min near Cape Town (±21 km). Live page checked read-only (owner signed in, picture chosen, "Прочитать карту · ✦1", balance shown; not pressed). Found on the way: Photon's reverse lookup is /reverse, not /api/reverse (404), so the profile form's map click had always named the place "Selected Location"; fixed in the shared lib/places.ts (nearest town). Open: DEC-003 (limits) still proposed; the privacy page covers only analytics and says nothing about AI processing of birth data or pictures (true before this feature too).
