---
type: plan
feature: server-side-cross-device-storage-of-profile-data
title: Server-side, cross-device storage of profile AI content
issues:
  - id: I-1
    title: Enforce account sign-in on purchase, unlock and paid-reading endpoints
    summary: "Backend: make the star purchase, feature unlock, paid compatibility reading and askOracle callables reject callers authenticated only by deviceId. They must return an authentication error before any star is spent or any content is stored. Keep the existing ownership checks (owner.ts) and the dual-ownership read paths for free features unchanged. Add tests for anonymous rejection, and check that no charge or history write happens on rejection or on a refunded failure."
    requirements: [REQ-006, REQ-004]
    decisions: [DEC-001]
    status: in-progress
  - id: I-2
    title: Client sign-in gate before paid actions
    summary: "Frontend: when an anonymous user starts buying stars, unlocking a feature, generating a paid compatibility reading or asking the Oracle, show the Google sign-in prompt. After sign-in, run claimProfiles(deviceId) and wait for it to finish, then continue the original action. Nothing is charged before sign-in. Free features keep working without an account."
    requirements: [REQ-006, REQ-004, REQ-001]
    decisions: [DEC-001]
    status: todo
  - id: I-3
    title: Server-side storage and read API for deep texts and compatibility readings
    summary: "Backend: add Firestore storage linked to each profile for generated deep interpretation texts and compatibility readings. Write them when they are generated, and expose owner-only read callables that follow the existing ownership rules. Make the Firestore security rules deny all direct client access to these collections and to oracleHistory. A re-read never regenerates content or spends stars."
    requirements: [REQ-002, REQ-003, REQ-005]
    decisions: [DEC-001]
    status: in-progress
  - id: I-4
    title: Oracle history read endpoint and client switch
    summary: "Backend: add an owner-only callable that reads oracleHistory/{profileId}/items, and make sure every answered Q/A is written there, but not on refund. Frontend: InterpretationView loads Oracle history from this endpoint instead of from localStorage."
    requirements: [REQ-004, REQ-005]
    decisions: [DEC-001]
    status: in-progress
  - id: I-5
    title: "Client: load deep texts and compatibility readings from the server"
    summary: "Frontend: InterpretationView and RelationshipView read deep texts and compatibility readings from the server for the profile owner, and localStorage stops being the source of truth. Content created on one device shows up on another device on the same account without paying again, and it survives clearing browser storage."
    requirements: [REQ-002, REQ-003, REQ-001]
    decisions: [DEC-001]
    status: todo
  - id: I-6
    title: Idempotent upload endpoint for legacy local-only content
    summary: "Backend: add a callable that accepts deep texts, Oracle history and compatibility readings for a profile. It requires account authentication, rejects deviceId-only callers, and rejects profiles whose ownerUid is missing or belongs to another account. Writes are deduplicated with content-derived keys so that repeated uploads create no duplicates. The endpoint never changes star balances or unlock flags. Add payload size limits and tests."
    requirements: [REQ-007, REQ-002, REQ-003, REQ-004, REQ-005]
    decisions: [DEC-002, DEC-004]
    status: in-progress
  - id: I-7
    title: Client one-time upload of local-only content after claim
    summary: "Frontend: when a signed-in owner opens a claimed profile, and only after claimProfiles has completed, detect local-only deep texts, Oracle history and readings, upload them once, mark them as uploaded, and from then on read the content from the server. Anonymous users never trigger an upload, and their localStorage content stays unchanged."
    requirements: [REQ-007, REQ-002, REQ-003, REQ-004]
    decisions: [DEC-002, DEC-004]
    status: todo
  - id: I-8
    title: Anonymous 'Sign in to save' notice in the profile list
    summary: "Frontend: show anonymous users who have at least one profile an unobtrusive notice in the profile list. It says their profiles are stored only in this browser and offers a 'Sign in to save' action that starts Google sign-in and then claimProfiles. The notice is hidden for signed-in users and does not block any use of profiles."
    requirements: [REQ-008, REQ-001]
    decisions: [DEC-003]
    status: todo
  - id: I-9
    title: Delete server-side content with its profile and on request
    summary: "Backend: deleteProfile removes deepTexts, compatibilityReadings and oracleHistory items of the profile after the ownership check (DEC-007). New owner-only callable deleteProfileContentItem removes one Oracle entry or one compatibility reading by id (DEC-008). Client: the existing delete buttons call it for server-backed entries and only touch localStorage for anonymous users."
    requirements: [REQ-009]
    decisions: [DEC-005, DEC-007, DEC-008]
    status: in-progress
updated: 2026-10-12
---

# Implementation plan — Server-side, cross-device storage of profile data and AI readings

## I-1: Enforce account sign-in on purchase, unlock and paid-reading endpoints

Backend: make the star purchase, feature unlock, paid compatibility reading and askOracle callables reject callers authenticated only by deviceId. They must return an authentication error before any star is spent or any content is stored. Keep the existing ownership checks (owner.ts) and the dual-ownership read paths for free features unchanged. Add tests for anonymous rejection, and check that no charge or history write happens on rejection or on a refunded failure.

Requirements: REQ-006, REQ-004
Decisions: DEC-001

## I-2: Client sign-in gate before paid actions

Frontend: when an anonymous user starts buying stars, unlocking a feature, generating a paid compatibility reading or asking the Oracle, show the Google sign-in prompt. After sign-in, run claimProfiles(deviceId) and wait for it to finish, then continue the original action. Nothing is charged before sign-in. Free features keep working without an account.

Requirements: REQ-006, REQ-004, REQ-001
Decisions: DEC-001

## I-3: Server-side storage and read API for deep texts and compatibility readings

Backend: add Firestore storage linked to each profile for generated deep interpretation texts and compatibility readings. Write them when they are generated, and expose owner-only read callables that follow the existing ownership rules. Make the Firestore security rules deny all direct client access to these collections and to oracleHistory. A re-read never regenerates content or spends stars.

Requirements: REQ-002, REQ-003, REQ-005
Decisions: DEC-001

## I-4: Oracle history read endpoint and client switch

Backend: add an owner-only callable that reads oracleHistory/{profileId}/items, and make sure every answered Q/A is written there, but not on refund. Frontend: InterpretationView loads Oracle history from this endpoint instead of from localStorage.

Requirements: REQ-004, REQ-005
Decisions: DEC-001

## I-5: Client: load deep texts and compatibility readings from the server

Frontend: InterpretationView and RelationshipView read deep texts and compatibility readings from the server for the profile owner, and localStorage stops being the source of truth. Content created on one device shows up on another device on the same account without paying again, and it survives clearing browser storage.

Requirements: REQ-002, REQ-003, REQ-001
Decisions: DEC-001

## I-6: Idempotent upload endpoint for legacy local-only content

Backend: add a callable that accepts deep texts, Oracle history and compatibility readings for a profile. It requires account authentication, rejects deviceId-only callers, and rejects profiles whose ownerUid is missing or belongs to another account. Writes are deduplicated with content-derived keys so that repeated uploads create no duplicates. The endpoint never changes star balances or unlock flags. Add payload size limits and tests.

Requirements: REQ-007, REQ-002, REQ-003, REQ-004, REQ-005
Decisions: DEC-002, DEC-004

## I-7: Client one-time upload of local-only content after claim

Frontend: when a signed-in owner opens a claimed profile, and only after claimProfiles has completed, detect local-only deep texts, Oracle history and readings, upload them once, mark them as uploaded, and from then on read the content from the server. Anonymous users never trigger an upload, and their localStorage content stays unchanged.

Requirements: REQ-007, REQ-002, REQ-003, REQ-004
Decisions: DEC-002, DEC-004

## I-8: Anonymous 'Sign in to save' notice in the profile list

Frontend: show anonymous users who have at least one profile an unobtrusive notice in the profile list. It says their profiles are stored only in this browser and offers a 'Sign in to save' action that starts Google sign-in and then claimProfiles. The notice is hidden for signed-in users and does not block any use of profiles.

Requirements: REQ-008, REQ-001
Decisions: DEC-003

## I-9: Delete server-side content with its profile and on request

deleteProfile cascades to the three content collections; deleteProfileContentItem deletes one Oracle entry or one compatibility reading (owner only).

Requirements: REQ-009
Decisions: DEC-005, DEC-007, DEC-008
