---
type: feature
id: explain-my-natal-chart
title: Explain my natal chart
status: draft
owner: Boris Tsekinovsky
created: 2026-11-23
provenance: Created by an AI agent through MarkView from Owner request 2026-11-23 ("Сделай мне отдельную фичу ... по натальной карте вытащить всю информацию, где родился и все остальное, и по ней создавать профиль"), plan misty-popping-treehouse
understanding:
  Problem: known
  Target Users: known
  Primary Workflow: known
  Permissions: known
  Failure Scenarios: known
  Data Model: known
  Notifications: n/a
  Security: known
  Analytics: partial
  Dependencies: known
  Acceptance Criteria: known
schema: 1
related: natal-chart-parity-and-verification
---

# Explain my natal chart

## Idea

A signed-in user uploads a picture of a natal chart (Astro-Seek, Astro.com, our own download, any app). The site reads the printed positions with a vision model, recovers roughly when and where the person was born (a solver on the ephemeris, not the AI), writes a short story about who the person is and their main traits, and lets the user give the person a name and save them as an additional profile. It is a second path next to "Create profile": RU "Объясни мою натальную карту". Price: 1 ✦ per picture (reading, birth and story), refunded when no birth can be recovered; the same picture again is free; the picture itself is never stored.

## Problem

## Scope
