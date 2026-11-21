---
type: feature
id: natal-chart-parity-and-verification
title: Natal Chart Parity and Verification
status: verified
owner: Boris Tsekinovsky
created: 2026-11-21
provenance: Created from the feature intake
understanding:
  Problem: known
  Target Users: known
  Primary Workflow: known
  Permissions: known
  Failure Scenarios: known
  Data Model: known
  Notifications: n/a
  Security: known
  Analytics: n/a
  Dependencies: partial
  Acceptance Criteria: partial
schema: 1
understanding_notes:
  Problem: В карте профиля нужно воспроизвести функции из трёх примеров и подтвердить точность расчётов.
  Target Users: Пользователи AstroWeb, которые открывают натальную карту в своём профиле.
  Primary Workflow: По умолчанию открывается Koch. В натальном режиме и режиме релокации пользователь может выбрать Koch, Whole Sign или Placidus.
  Permissions: Сервер уже проверяет доступ к профилю. Для выбора системы домов дополнительные права не требуются.
  Failure Scenarios: Калькулятор уже использует Whole Sign при сбое расчёта домов и местный полдень при неизвестном времени. Требование уточняет, как это отражается на экране.
  Data Model: Дополнительные точки, признаки движения и данные аспектов уже перечислены в требованиях. Формат хранения определит реализация.
  Notifications: Уведомления для этой функции не требуются.
  Security: Расчёт и выбор системы домов используют существующую проверку доступа к карте профиля.
  Analytics: Продуктовая аналитика вне задачи. Результаты сверки входят в приёмку.
  Dependencies: Нужны воспроизводимые карты Astro-Seek и независимые эфемериды. Точный источник и параметры сверки определит исполнитель.
  Acceptance Criteria: Согласованы полная сверка с Astro-Seek и независимая проверка долгот десяти основных тел. Исполнитель фиксирует настройки примеров и допуски до оценки расхождений.
questions_left: 0
issue: "#22"
---

# Natal Chart Parity and Verification

## Idea

Extend the natal chart in AstroWeb to cover the information and views shown across the three supplied Astro-Seek examples. Verify both the existing and expanded calculations against reproducible reference charts.

## Problem

AstroWeb already computes and displays a natal chart, but its current views omit several reference points and summaries. Existing tests cover signs, ranges and chart structure. They leave numerical agreement and differences caused by house systems, point definitions and aspect rules unverified.

## Scope

In: the profile natal chart, visible functional coverage across all three references, and repeatable comparison of existing and new outputs. Out: pixel-for-pixel reproduction, changes to paid readings or PDF layouts, and an engine migration without a demonstrated calculation or coverage need.

## Existing behaviour

- The profile screen requests Koch and supports natal and relocation views. It already includes separate wheel, Planets, Aspects and Houses tabs. (`web/src/pages/ProfileDetail.tsx:295`)
- The chart endpoint accepts Koch, Placidus and Whole Sign. It checks profile ownership and serves cached results when available. The Houses tab displays the actual house system as a read-only label (`web/src/components/chart/HouseAreasView.tsx:408`). That behavior was chosen for the help feature (`docs/features/contextual-help-tooltips-across-the-ui/decisions/DEC-007.md`). (`functions/src/api/getChart.ts:20`)
- The tropical calculator converts local birth time to UTC and returns ten bodies, twelve cusps, ASC and MC. It falls back to Whole Sign if the requested house calculation fails. With unknown birth time it uses local noon, omits ASC, MC and house assignments, and still returns cusps. The Swiss Ephemeris wrapper uses Moshier and returns longitude speed, which the chart result currently discards (`functions/src/astro/ephemeris.ts`, `functions/src/types/index.ts`). (`functions/src/astro/chart.ts`)
- The calculator detects five major aspects with a fixed 6° orb. The aspect result includes orb magnitude and exactness. The profile shows these in a list, and the wheel has filters and point tooltips. ASC and MC can participate in calculated aspects, but the wheel skips their lines because it resolves endpoints only from the body list (`functions/src/astro/aspects.ts`, `web/src/components/chart/AspectsTable.tsx`, `web/src/components/chart/NatalChart.tsx`, `web/src/components/chart/AspectLines.tsx`). (`functions/src/astro/constants.ts`)
- The wheel labels house numbers and emphasizes cusps 1 and 10 when ASC and MC are available. It places the emphasized lines at the cusp longitudes. The Planets table already shows sign, degree and minute, and house (`web/src/components/chart/PlanetsTable.tsx`). Interpretation already has a four-element balance summary (`web/src/components/chart/InterpretationView.tsx:252`). (`web/src/components/chart/HouseCusps.tsx`)
- The Einstein reference test checks expected signs, value ranges, and result structure. The suite also covers Whole Sign spacing and unknown birth time. It does not establish arcminute-level agreement with the supplied charts. The project research proposes matched-setting comparisons and boundary cases (`docs/research/2026-11-21-natal-chart-frameworks.md`). (`functions/src/__tests__/chart.test.ts:35`)
- The Firestore cache key includes birth date, birth time, coordinates, time zone and requested house system. It has no calculation version. The natal calculator and its result also feed transit, prompt and PDF services (`functions/src/services/transits.ts`, `functions/src/services/prompts.ts`, `functions/src/services/pdf.ts`). (`functions/src/services/chart.ts:28`)
- The supplied Astro-Seek images are available locally. `post-picture-1.webp` and `post-picture-2.webp` show dated Whole Sign examples with location, an aspect matrix and element-by-modality totals. The first also shows a 0–30° position strip. The second adds Part of Fortune, Vertex and visible minor-aspect glyphs. `post-picture-12.webp` shows the wheel and its annotations without visible birth inputs or calculation settings. (`/Users/boris/Downloads/post-picture-1.webp`)
