# Discussion — Natal Chart Parity and Verification

### Answer to Q-001 · 2026-11-21

Достаточно ли для приёмки совпадения с Astro-Seek при одинаковых настройках, или нужна также независимая проверка координат?

A. Сверить полные карты с Astro-Seek и дополнительно проверить долготы основных тел по независимому источнику.

### Answer to Q-002 · 2026-11-21

Какая система домов должна открываться по умолчанию и может ли пользователь её менять?

A. Оставить Koch по умолчанию и дать выбор между Koch, Whole Sign и Placidus.

### AI updated the requirements · 2026-11-21

DEC-008, DEC-009 written into REQ-005.

### AI updated the requirements · 2026-11-21

DEC-010 written into REQ-002, REQ-005.

### AI updated the requirements · 2026-11-21

DEC-011 written into REQ-003.

### AI updated the requirements · 2026-11-21

DEC-012 written into REQ-002, REQ-005.

### Boris Tsekinovsky · 2026-11-21

Answers given at the start of implementation (2026-11-21), recorded as DEC-013 and DEC-014:
- Independent longitude source: JPL Horizons snapshots (DEC-013).
- Added points, motion data and the expanded aspect set go in new additive fields; points and aspects keep their current contents (DEC-014).
- The 18 modified files and 2 untracked paths left in the working tree by earlier work (direct-checkout pricing and wording, Gemini key pattern, AI task descriptions, a status edit in the admin-control-of-ai-models-and-prompts overview) go into this pull request as separate commits.

Clarification of scope, in the owner's words: «То, как мы рисуем натальную карту, тоже должно включать в себя все вот эти вот функциональности, которые были в картинках, которые я тебе присылал в этом requirements.» The wheel drawing itself must include every functional element visible in the three images, not only the data views. Written into REQ-001 as a wheel element inventory (source SRC-005).

### Agent · 2026-11-21

Astro-Seek references captured for datasets A-D at default orbs and at fixed 15 degrees (8 files, 15 positions and 12 cusps each). Findings: default orbs are 7/10 degrees for conjunction, square, opposition and trine, 4/6 for sextile, 2.5 for the six minors (DEC-017, proposed). Astro-Seek never aspects ASC to MC, and its Fortune-to-Vertex rows use Vertex at 0 degrees Aries, which is a reference defect. The owner chose the by-horizon day or night rule for Part of Fortune (DEC-016, accepted).
