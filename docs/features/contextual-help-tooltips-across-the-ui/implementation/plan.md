---
type: plan
feature: contextual-help-tooltips-across-the-ui
title: Contextual help tooltips across the UI
issues:
  - id: I-1
    title: Shared HelpBubble component (popover, hybrid pointer/touch, accessible)
    summary: Add the shadcn Popover/Tooltip primitives under web/src/components/ui and build a single HelpBubble component taking an i18n help key. On pointer devices it opens on hover after a short delay and on keyboard focus, and closes on Escape or when the pointer leaves. On touch devices it either wraps a non-actionable element (tap opens help) or renders a small '?' icon next to an actionable element, so the element's own action is not triggered. Tapping outside closes it. It renders a short paragraph in full without truncation, keeps itself inside the viewport at mobile widths, exposes the text to screen readers, has no on/off setting and fires no analytics event.
    requirements: [REQ-005, REQ-001]
    decisions: [DEC-001, DEC-002, DEC-005, DEC-006]
  - id: I-2
    title: Help i18n key structure and EN/RU parity test
    summary: Define a help.* namespace in web/public/locales/{en,ru}/translation.json, with groups for astrology terms, tabs and controls. Add an automated test that fails when a help key is missing or empty in either language. Make sure HelpBubble re-renders when the language changes, without a page reload.
    requirements: [REQ-004]
    decisions: [DEC-001, DEC-004]
  - id: I-3
    title: Astrology term help content and wiring (planets, signs, houses, aspects, house systems, orb/exactness)
    summary: Write static, generic EN and RU texts for every planet, sign, house, aspect type and house system, plus orb and exactness. Each text is a definition plus 1–2 sentences on why it matters, at most about 3 sentences, with no links. Attach HelpBubble to these terms in PlanetsTable, AspectsTable, HouseAreasView and AspectFilters, add a read-only house-system label with help to the Houses tab (DEC-007), and attach help to the orb and exactness column headers. Leave the data content of ChartTooltip unchanged.
    requirements: [REQ-001, REQ-004]
    decisions: [DEC-001, DEC-002, DEC-004, DEC-007]
  - id: I-4
    title: Profile tab help bubbles
    summary: Add a HelpBubble to every profile detail tab in ProfileDetail.tsx (chart, planets, aspects, houses, interpretation, oracle, transits, compatibility, astrologer, premium content), with EN and RU texts on what the tab contains and what the user gets from it. On touch devices the tabs use the '?' icon, so a single tap still switches tabs.
    requirements: [REQ-002, REQ-004]
    decisions: [DEC-001, DEC-002, DEC-003, DEC-004]
  - id: I-5
    title: Profile-screen controls help (filters, toggles, icon buttons, Oracle/Premium indicators)
    summary: On the profile screen, add help bubbles to icon-only buttons (replacing or complementing the native title attribute, e.g. in InterpretationView and RelationshipView), Oracle indicators (title, star cost, stars balance; no model name is shown, DEC-011), and Premium/credit (stars) indicators, with EN and RU texts.
    requirements: [REQ-003, REQ-004]
    decisions: [DEC-001, DEC-002, DEC-003, DEC-004, DEC-011]
  - id: I-6
    title: End-user screens help coverage (profile creation, home, account, Premium/wallet, letters, compatibility)
    summary: Go through the remaining end-user screens and the Layout. Add HelpBubble to controls and labels whose purpose is not self-evident, including the icon buttons in Home and Layout, wallet/credits and letters, with EN and RU texts. Cover the AstrologerNotes page (DEC-008). Add a check that the admin screen gets no help bubbles.
    requirements: [REQ-003, REQ-004, REQ-005]
    decisions: [DEC-001, DEC-002, DEC-003, DEC-004, DEC-008]
updated: 2026-10-13
---

# Implementation plan — Contextual help tooltips across the UI

## I-1: Shared HelpBubble component (popover, hybrid pointer/touch, accessible)

Add the shadcn Popover/Tooltip primitives under web/src/components/ui and build a single HelpBubble component taking an i18n help key. On pointer devices it opens on hover after a short delay and on keyboard focus, and closes on Escape or when the pointer leaves. On touch devices it either wraps a non-actionable element (tap opens help) or renders a small '?' icon next to an actionable element, so the element's own action is not triggered. Tapping outside closes it. It renders a short paragraph in full without truncation, keeps itself inside the viewport at mobile widths, exposes the text to screen readers, has no on/off setting and fires no analytics event.

Requirements: REQ-005, REQ-001
Decisions: DEC-001, DEC-002, DEC-005, DEC-006

## I-2: Help i18n key structure and EN/RU parity test

Define a help.* namespace in web/public/locales/{en,ru}/translation.json, with groups for astrology terms, tabs and controls. Add an automated test that fails when a help key is missing or empty in either language. Make sure HelpBubble re-renders when the language changes, without a page reload.

Requirements: REQ-004
Decisions: DEC-001, DEC-004

## I-3: Astrology term help content and wiring (planets, signs, houses, aspects, house systems, orb/exactness)

Write static, generic EN and RU texts for every planet, sign, house, aspect type and house system, plus orb and exactness. Each text is a definition plus 1–2 sentences on why it matters, at most about 3 sentences, with no links. Attach HelpBubble to these terms in PlanetsTable, AspectsTable, HouseAreasView and AspectFilters, add a read-only house-system label with help to the Houses tab (DEC-007), and attach help to the orb and exactness column headers. Leave the data content of ChartTooltip unchanged.

Requirements: REQ-001, REQ-004
Decisions: DEC-001, DEC-002, DEC-004, DEC-007

## I-4: Profile tab help bubbles

Add a HelpBubble to every profile detail tab in ProfileDetail.tsx (chart, planets, aspects, houses, interpretation, oracle, transits, compatibility, astrologer, premium content), with EN and RU texts on what the tab contains and what the user gets from it. On touch devices the tabs use the '?' icon, so a single tap still switches tabs.

Requirements: REQ-002, REQ-004
Decisions: DEC-001, DEC-002, DEC-003, DEC-004

## I-5: Profile-screen controls help (filters, toggles, icon buttons, Oracle/Premium indicators)

On the profile screen, add help bubbles to icon-only buttons (replacing or complementing the native title attribute, e.g. in InterpretationView and RelationshipView), Oracle indicators (title, star cost, stars balance; no model name is shown, DEC-011), and Premium/credit (stars) indicators, with EN and RU texts.

Requirements: REQ-003, REQ-004
Decisions: DEC-001, DEC-002, DEC-003, DEC-004, DEC-011

## I-6: End-user screens help coverage (profile creation, home, account, Premium/wallet, letters, compatibility)

Go through the remaining end-user screens and the Layout. Add HelpBubble to controls and labels whose purpose is not self-evident, including the icon buttons in Home and Layout, wallet/credits and letters, with EN and RU texts. Cover the AstrologerNotes page (DEC-008). Add a check that the admin screen gets no help bubbles.

Requirements: REQ-003, REQ-004, REQ-005
Decisions: DEC-001, DEC-002, DEC-003, DEC-004, DEC-008
