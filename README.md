# astroweb

Monorepo for a Firebase-backed astrology web app:

- `web/`: React + TypeScript + Vite frontend (Tailwind, i18n)
- `functions/`: Firebase Cloud Functions (Gen 2, Node.js 22) for profiles, natal chart computation, and AI-powered interpretations (Anthropic Claude)

## Repo Layout

- `web/` Vite app (served via Firebase Hosting in prod)
- `functions/` Cloud Functions source (`src/`) and build output (`lib/`)
- `firebase.json` Firebase Hosting / Functions / emulator config
- `firestore.rules`, `firestore.indexes.json` Firestore configuration

## Prerequisites

- Node.js `22` (Functions runtime is `nodejs22`)
- Firebase CLI (`firebase`)

## Install

```bash
npm ci
```

This repo uses npm workspaces; installing at the repo root installs `web/` and `functions/`.

## Local Development

### Frontend (Vite)

```bash
npm run dev:web
```

Vite runs on `http://localhost:5173` by default.

### Backend (Firebase emulators)

In a second terminal:

```bash
firebase emulators:start --only functions,firestore,ui
```

Configured emulator ports (see `firebase.json`):

- Functions: `5001`
- Firestore: `8080`
- Emulator UI: `4000`

Note: `firebase emulators:start` (without `--only ...`) will also start the Hosting emulator. In this repo, Hosting is configured for port `5173`, which will conflict with Vite’s default port.

If you want to run Hosting emulator anyway, either:

- run Vite on a different port: `npm run dev --workspace=web -- --port 5174`
- or change the Hosting emulator port in `firebase.json`

## Environment Variables

Cloud Functions use the AI provider keys, stored in Secret Manager and bound to every function that runs an AI task:

- `ANTHROPIC_API_KEY` (Claude, used by the default settings)
- `OPENAI_API_KEY` (OpenAI; the placeholder `unset` keeps its models unavailable)
- `GEMINI_API_KEY` (Gemini Developer API, key of a billing-enabled project; `unset` keeps its models unavailable)

Which model each AI task uses, its output limit and its prompts are set in the Admin page, AI tab
(stored in Firestore `aiSettings/{taskId}`; code defaults in `functions/src/services/ai/`).
`ANTHROPIC_MODEL` is no longer read.

Local setup (example):

```bash
cat > functions/.env.local <<'EOF'
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=unset
GEMINI_API_KEY=unset
EOF
```

Do not commit real secrets. The repo-level `.gitignore` already ignores `.env` files.

## Key APIs (Cloud Functions)

Callable functions exported from `functions/src/index.ts`:

- Profiles: `createProfile`, `listProfiles`, `getProfile`, `updateProfile`, `deleteProfile`
- Charts: `computeNatalChart`, `getChart`
- AI: `deepenInterpretation`, `askOracle`, `askRelationship`

Ownership is enforced via `ownerDeviceId` (generated/persisted by the client in `web/src/hooks/useDeviceId.ts`).

## Tests

```bash
npm run test --workspace=functions
```

## Build

```bash
npm run build:web
npm run build:functions
```

Web build output is `web/dist` (Firebase Hosting `public` dir in `firebase.json`).

## Deploy

```bash
npm run build:web
npm run build:functions
firebase deploy
```

This deploys Hosting + Functions using the Firebase project set in `.firebaserc` (default: `astroweb-dev`).
