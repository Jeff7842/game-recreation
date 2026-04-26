# Network Checkers

Multiplayer checkers built with Next.js App Router.

## Change The API URL

The game reads one setting:

```bash
GAME_API_URL=/api/game
```

Keep `/api/game` when the website and API are deployed together.
Change it to a full URL when the API lives somewhere else:

```bash
GAME_API_URL=https://your-api-site.com/api/game
```

That is the only URL the game screen uses for create, join, load, and move.

## Simple File Map

- `app/page.tsx`
  Opens the game screen and gives it the API URL.
- `components/checkers-client.tsx`
  Shows the screens, board, buttons, player names, and game id.
- `apis/game-api-client.ts`
  Browser helper. It builds the API URL and sends create, join, load, and move requests.
- `app/api/game/route.ts`
  API route. It receives requests and sends them to the game service.
- `apis/game-service.ts`
  Game rules helper. It creates games, joins players, and saves moves.
- `apis/json-session-store.ts`
  JSON file store. It reads and writes saved games.
- `lib/checkers.ts`
  Checkers board rules. It knows which move is allowed.

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
- `GET /api/game?gameId=<GAME_ID>`
  Also works. This is here so production links can use a clear name.
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
