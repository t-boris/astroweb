---
type: plan
feature: natal-chart-parity-and-verification
title: Natal Chart Parity and Verification
issues:
  - id: I-1
    title: Establish Astro-Seek fixtures and confirm calculation conventions
    summary: Inventory the visible aspect glyphs and prepare reproducible Astro-Seek fixtures for both dated Whole Sign birth datasets and Koch and Placidus controls. Where original settings cannot be independently confirmed, retain the screenshot for display checks and regenerate the chart with the same birth inputs and explicit settings. Record the evidence for each proposed node, Lilith, and Fortune definition in REQ-002 when confirmed. Route unresolved definitions to a separate decision and document the matched aspect settings for the fixtures.
    requirements: [REQ-002, REQ-003, REQ-005]
    decisions: [DEC-008, DEC-009, DEC-010, DEC-011, DEC-012]
  - id: I-2
    title: Add profile house-system selection and chart context
    summary: Add Koch, Whole Sign, and Placidus selection to the profile, with Koch as the default. Refresh all chart views from the same result for the active natal or relocation location. Show the date, time, and place used, and distinguish the requested system from the actual system shown in the Houses tab when a fallback occurs.
    requirements: [REQ-001]
    decisions: [DEC-009]
  - id: I-3
    title: Render wheel geometry and handle unknown birth times
    summary: Render zodiac degree ticks, numbered houses, and ASC, DSC, MC, and IC at their calculated longitudes, including Whole Sign charts where angles and cusps can differ. For unknown birth times, label remaining positions as local-noon estimates and suppress angles, cusps, house assignments, and dependent points and aspects across the profile.
    requirements: [REQ-001, REQ-002]
    decisions: []
  - id: I-4
    title: Calculate and display additional natal points and retrograde status
    summary: Extend the chart result with both lunar nodes, Black Moon Lilith, Chiron, Part of Fortune, Vertex, and applicable motion data. Use the confirmed definitions or resolve outstanding conventions before adopting them. Display the applicable points on the wheel and the reference rows in the position table, including ASC and MC, with consistent sign, degree, minute, house, and retrograde information across views.
    requirements: [REQ-002]
    decisions: [DEC-010, DEC-012]
  - id: I-5
    title: Add the aspect matrix and unify aspect calculations
    summary: Define eligible point pairs, supported aspect types, orb rules, and applying or separating rules using the reference inventory and matched fixtures. Calculate one expanded aspect set for the wheel, matrix, and Aspects list, including rendering wheel lines for qualifying angle endpoints. Verify that clearing filters reveals the same pairs and types in all three views, that shared values agree wherever displayed, and that filtering changes visibility only.
    requirements: [REQ-003]
    decisions: [DEC-011]
  - id: I-6
    title: Add element, modality, and degree summaries
    summary: Document which points each summary includes, then build the element-by-modality grid and the 0–30° degree strip from the same calculated chart positions. Verify that the grid membership and totals reconcile with the stated inclusion rules and that the strip places each included point at its degree within its sign.
    requirements: [REQ-004]
    decisions: []
  - id: I-7
    title: Run full-chart and independent longitude acceptance checks
    summary: Set angular tolerances and categorical comparison rules before evaluating results. Compare both dated Whole Sign datasets and the Koch and Placidus controls with Astro-Seek under recorded settings, and use the third image for display verification. Independently cross-check the ten standard body longitudes with an ephemeris independent of both calculation paths, recording the matched time, observing center, frame, and corrections. Report circular deviations and categorical mismatches, resolve discrepancies against the acceptance rules, and retain both comparisons and fixture provenance as release evidence.
    requirements: [REQ-005]
    decisions: [DEC-008, DEC-009, DEC-010, DEC-012]
  - id: I-8
    title: Verify existing cached charts match fresh calculations
    summary: Ensure a profile chart served from an existing cache entry exposes the same supported data as a fresh calculation with identical inputs. Verify the normal cache-hit path with entries created before the expanded result, covering added positions, motion, angles, aspects, and fields that depend on known birth time.
    requirements: [REQ-005]
    decisions: []
updated: 2026-11-21
schema: 1
---

# Implementation plan — Natal Chart Parity and Verification

## I-1: Establish Astro-Seek fixtures and confirm calculation conventions

Inventory the visible aspect glyphs and prepare reproducible Astro-Seek fixtures for both dated Whole Sign birth datasets and Koch and Placidus controls. Where original settings cannot be independently confirmed, retain the screenshot for display checks and regenerate the chart with the same birth inputs and explicit settings. Record the evidence for each proposed node, Lilith, and Fortune definition in REQ-002 when confirmed. Route unresolved definitions to a separate decision and document the matched aspect settings for the fixtures.

Requirements: REQ-002, REQ-003, REQ-005
Decisions: DEC-008, DEC-009, DEC-010, DEC-011, DEC-012

## I-2: Add profile house-system selection and chart context

Add Koch, Whole Sign, and Placidus selection to the profile, with Koch as the default. Refresh all chart views from the same result for the active natal or relocation location. Show the date, time, and place used, and distinguish the requested system from the actual system shown in the Houses tab when a fallback occurs.

Requirements: REQ-001
Decisions: DEC-009

## I-3: Render wheel geometry and handle unknown birth times

Render zodiac degree ticks, numbered houses, and ASC, DSC, MC, and IC at their calculated longitudes, including Whole Sign charts where angles and cusps can differ. For unknown birth times, label remaining positions as local-noon estimates and suppress angles, cusps, house assignments, and dependent points and aspects across the profile.

Requirements: REQ-001, REQ-002

## I-4: Calculate and display additional natal points and retrograde status

Extend the chart result with both lunar nodes, Black Moon Lilith, Chiron, Part of Fortune, Vertex, and applicable motion data. Use the confirmed definitions or resolve outstanding conventions before adopting them. Display the applicable points on the wheel and the reference rows in the position table, including ASC and MC, with consistent sign, degree, minute, house, and retrograde information across views.

Requirements: REQ-002
Decisions: DEC-010, DEC-012

## I-5: Add the aspect matrix and unify aspect calculations

Define eligible point pairs, supported aspect types, orb rules, and applying or separating rules using the reference inventory and matched fixtures. Calculate one expanded aspect set for the wheel, matrix, and Aspects list, including rendering wheel lines for qualifying angle endpoints. Verify that clearing filters reveals the same pairs and types in all three views, that shared values agree wherever displayed, and that filtering changes visibility only.

Requirements: REQ-003
Decisions: DEC-011

## I-6: Add element, modality, and degree summaries

Document which points each summary includes, then build the element-by-modality grid and the 0–30° degree strip from the same calculated chart positions. Verify that the grid membership and totals reconcile with the stated inclusion rules and that the strip places each included point at its degree within its sign.

Requirements: REQ-004

## I-7: Run full-chart and independent longitude acceptance checks

Set angular tolerances and categorical comparison rules before evaluating results. Compare both dated Whole Sign datasets and the Koch and Placidus controls with Astro-Seek under recorded settings, and use the third image for display verification. Independently cross-check the ten standard body longitudes with an ephemeris independent of both calculation paths, recording the matched time, observing center, frame, and corrections. Report circular deviations and categorical mismatches, resolve discrepancies against the acceptance rules, and retain both comparisons and fixture provenance as release evidence.

Requirements: REQ-005
Decisions: DEC-008, DEC-009, DEC-010, DEC-012

## I-8: Verify existing cached charts match fresh calculations

Ensure a profile chart served from an existing cache entry exposes the same supported data as a fresh calculation with identical inputs. Verify the normal cache-hit path with entries created before the expanded result, covering added positions, motion, angles, aspects, and fields that depend on known birth time.

Requirements: REQ-005
