---
type: feature
id: admin-control-of-ai-models-and-prompts
title: Admin control of AI models and prompts
status: exploring
owner: Boris Tsekinovsky
created: 2026-10-18
provenance: Created by an AI agent through MarkView from Owner request in chat, 2026-10-18
understanding:
  Problem: known
  Target Users: known
  Primary Workflow: partial
  Permissions: known
  Failure Scenarios: partial
  Data Model: partial
  Notifications: n/a
  Security: partial
  Analytics: n/a
  Dependencies: known
  Acceptance Criteria: partial
---

# Admin control of AI models and prompts

## Idea

The owner wants to see and control, from the Admin page, which AI model each backend AI feature uses and which prompts it sends, and to change both without a code deploy.

Today (code research 2026-10-18): every Claude call goes over raw HTTPS through two helpers (`generateClaudeTextResult` in functions/src/services/anthropic.ts, `callClaudeRaw` in services/claudeRaw.ts); no AI SDK and no other provider. Model ids are hard-coded per call site in four files (Opus 4.8 for Oracle, Oracle in letters, compatibility, letter analysis and letter writing; Sonnet 4.6 for deepen, forecast, premium PDF sections and the news digest; Haiku 4.5 for fact extraction); only deepen and forecast honour the `ANTHROPIC_MODEL` env var. Prompts are TypeScript functions that mix instruction text with chart/profile data, mostly with EN and RU variants (letter analysis/writing, news digest and fact extraction are partly single-language). `temperature` is tied to the model: some builders always send it, and Opus 4.8 and newer models reject it with HTTP 400, so a model switch can break a feature unless request parameters follow the model. Result caches (deepen, forecast, premium PDF, news) are keyed without model or prompt version. Admin access is one verified email checked on the frontend and in `assertAdmin`; the Admin page (English only) has Overview and Business tabs. Firestore rules deny all client access; there is no runtime config store (only `featureFlags/personalAstrologer`) and no admin audit log.

Scope IN: an AI section in the Admin page listing every AI task with its effective model; choosing the model per task from a safe server-side list of Claude, OpenAI and Gemini models (DEC-010, DEC-014), with each provider's web search for the news digest (DEC-016); a test run of unsaved settings (DEC-012); viewing and editing the prompt texts per task and language; defaults in code with reset, no version history (DEC-013); changes take effect without a deploy; server-side admin-only access. Scope OUT unless decided otherwise: per-user or A/B prompt variants, usage/cost dashboards beyond what exists, editing the internal continuation prompt, changing the chart data that is inserted into prompts.

## Problem

## Scope
