# Network Checkers

Multiplayer checkers built with Next.js App Router.

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

1. Start the development server:

```bash
pnpm dev
```

1. Open [http://localhost:3000](http://localhost:3000).

## Game API

- `GET /api/game?id=<GAME_ID>`
  Returns a game session by id.
- `POST /api/game`
  Uses one of these actions:
  - `{ "action": "create", "playerName": "..." }`
  - `{ "action": "join", "gameId": "CHK-XXXXXXXX", "playerName": "..." }`
  - `{ "action": "move", "gameId": "CHK-XXXXXXXX", "fromX": 0, "fromY": 0, "toX": 1, "toY": 1, "playerColor": "r" }`
- `GET /api/sessions`
  Returns all stored sessions from the JSON datastore.

## JSON Datastore

The API repository bootstraps from `data/sessions.json` (tracked seed) and writes active runtime state to `data/.sessions.runtime.json`.

Each stored session includes:

- auto-generated game id
- player names and board state
- dynamic score updates
- winner and loser metadata once a match finishes
- created/updated timestamps and session status (`waiting`, `active`, `finished`)

No environment variables are required for this datastore mode.

### Concurrency Notes

The repository serializes mutations and uses atomic file replacement to reduce the risk of JSON corruption during rapid updates.

### Deployment Notes

This JSON datastore is best suited for local development and temporary review environments.
On serverless platforms, file-based persistence can reset across cold starts or redeployments.

## Routing Notes

Gameplay UI is served from `/` only.
There is no dedicated `/game` page route.
