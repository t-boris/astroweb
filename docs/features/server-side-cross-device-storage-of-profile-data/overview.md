---
type: feature
id: server-side-cross-device-storage-of-profile-data
title: Server-side, cross-device storage of profile data and AI readings
status: verified
owner: Boris Tsekinovsky
created: 2026-10-12
provenance: Created from the feature intake
understanding:
  Problem: known
  Target Users: known
  Primary Workflow: known
  Permissions: known
  Failure Scenarios: partial
  Data Model: partial
  Notifications: n/a
  Security: partial
  Analytics: n/a
  Dependencies: known
  Acceptance Criteria: partial
understanding_notes:
  Problem: "Profile records are already in Firestore. What is device-bound is the anonymous identity (deviceId) and AI content kept only in localStorage: deep texts, Oracle history and paid compatibility readings."
  Target Users: Signed-in owners of profiles, plus anonymous users. Anonymous users are warned and invited to sign in.
  Primary Workflow: Sign in on any device and see your profiles and all their content from the server. Anonymous users see a notice with a sign-in button. Sign-in is required before any paid action. Local content is uploaded to the server once.
  Permissions: Access follows the existing ownership rules (ownerUid / ownerDeviceId), only through callable Functions.
  Failure Scenarios: Upload failures, duplicates during the one-time upload and lost anonymous profiles are partly covered. The remaining edge cases are for the implementer and the review.
  Data Model: oracleHistory already exists on the server. The storage layout for deep texts and compatibility readings is an implementation detail.
  Notifications: Not needed.
  Security: No direct client access to Firestore. Ownership checks follow owner.ts. Implementation details remain open.
  Analytics: Out of scope.
  Dependencies: Firebase Auth (Google), callable Functions, claimProfiles and the existing oracleHistory.
  Acceptance Criteria: Set out in REQ-001 to REQ-007 and the new requirement. They will be refined during review.
questions_left: 0
issue: "#10"
---

# Server-side, cross-device storage of profile data and AI readings

## Idea

A user who signs in on any device or browser sees the same profiles and everything attached to them (paid AI readings, compatibility readings, Oracle history, relocation settings). Nothing the user created or paid for should exist only in one browser's localStorage.

## Problem

The request says profiles live in browser localStorage. The code shows the profile records themselves are already in Firestore and are listed by account (ownerUid) when signed in. What is device-bound is (a) the anonymous identity — a deviceId in localStorage, so anonymous users lose access to their profiles when they switch browser or clear storage — and (b) per-profile AI content that is persisted only in localStorage: deep interpretation texts and Oracle history (InterpretationView), paid ✦2 compatibility readings (RelationshipView). On another device these are missing even after sign-in, although the user paid for them.

## Scope

IN: making paid/generated per-profile content (deep interpretation texts, Oracle Q/A history, compatibility readings) stored server-side and loaded from the server on any device for the profile owner; anonymous (deviceId) users keep free usage, but their profiles stay device-bound until they sign in with Google; sign-in (followed by claimProfiles) is required before buying stars or any paid action (DEC-001); content that already exists only in a browser's localStorage is uploaded to the server once, automatically, when the owner opens the profile on that device, and is served from the server from then on (DEC-002); the upload runs only for a signed-in caller and only for profiles already claimed by that account (ownerUid set, after claimProfiles) — deviceId-only callers are rejected, and anonymous users' local content stays in the browser until they sign in (DEC-004). OUT: changing the profile record storage itself (already Firestore); UI language and analytics-consent preferences (intentionally device-local); the daily forecast client cache (the server already caches it in forecastCache); adding new sign-in providers beyond Google; admin tooling.

## Existing behaviour

- Profiles are read from Firestore. Signed-in: listProfilesByUid(uid) (cross-device). Anonymous: listProfilesByOwner(deviceId). (`functions/src/api/listProfiles.ts`)
- Dual ownership: ownerUid (account) or ownerDeviceId (legacy anonymous). Once a profile has ownerUid, device access is refused. (`functions/src/services/owner.ts`)
- The anonymous identity is a random deviceId persisted in localStorage. This is the only device-bound part of profile ownership. (`web/src/hooks/useDeviceId.ts`)
- On Google sign-in (signInWithPopup) the client calls claimProfiles(deviceId). It sets ownerUid on that device's anonymous profiles and merges the device star wallet into the account wallet. The call is idempotent. (`functions/src/api/claimProfiles.ts, web/src/components/Layout.tsx:88, web/src/pages/Account.tsx:99`)
- Deep interpretation texts (deepTexts) and the Oracle history shown in the UI are read and written only in localStorage, keyed per profileId. (`web/src/components/chart/InterpretationView.tsx:119-163`)
- The server already records Oracle Q/A in oracleHistory/{profileId}/items, but only for signed-in users, and the web UI does not read it back. (`functions/src/api/askOracle.ts:109-122, functions/src/services/dossier.ts:218`)
- Paid (✦2) compatibility readings are kept only in localStorage (last 20 per profile). The code comments say paid readings must never vanish. (`web/src/components/chart/RelationshipView.tsx:82-191`)
- Feature unlocks (star spends) are stored server-side on the profile. Unlock status already follows the profile; the generated text does not. (`functions/src/api/unlockFeature.ts`)
- Relocation settings go to localStorage and are also saved to the profile via updateProfile (currentPlace/Lat/Lng, relocationEnabled). They are already server-backed. (`web/src/pages/ProfileDetail.tsx:345-380`)
- The daily forecast is cached in localStorage per day/language and also server-side in forecastCache. It is a cache, not user data. (`web/src/components/chart/ForecastView.tsx, functions/src/api/getForecast.ts`)
- This spec already planned to move the Oracle history server-side (oracleHistory/{profileId}/items) and to deny all direct client Firestore access: everything goes through callable Functions. (`tasks/personal-astrologer-spec.md:238`)
