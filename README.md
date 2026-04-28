# Network Checkers

Multiplayer checkers built with Next.js App Router.

## Change The API URL

The app reads the game API URL in one place: `lib/game-api-config.ts`.

It checks these environment variables in order:

1. `GAME_API_URL`
1. `NEXT_PUBLIC_GAME_API_URL`

Use this local default when the UI and API run together:

```bash
GAME_API_URL=/api/game
```

Use a full URL when the API lives somewhere else:

```bash
GAME_API_URL=https://your-api-site.com/api/game
```

Restart the dev server after changing `.env*` files.

The value flows like this:

- `app/page.tsx` reads `getGameApiUrl()`.
- `components/checkers-client.tsx` receives `gameApiUrl` as a prop.
- `apis/game-api-client.ts` uses that URL for create, join, load, and move requests.

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

If `GAME_API_URL` points to another domain, that API must allow CORS for your site.

## JSON Datastore

The API reads and writes active game state directly in `data/sessions.json`.

Each stored session includes:

- auto-generated game id
- player names and board state
- dynamic score updates
- winner and loser metadata once a match finishes
- created/updated timestamps and session status (`waiting`, `active`, `finished`)

No environment variables are required for this datastore mode.
The browser does not keep an active game in tab storage; the JSON file is the source of truth for saved games.

## Why Persistence Can Fail

This project's default "database" is a JSON file, not a managed database service.

- Local development writes to `data/sessions.json`.
- Serverless platforms may block writes to project files or reset them across cold starts, scale-out, or redeploys.
- Common symptom: a game id that existed earlier returns `404 Game not found`.

For reliable production persistence, move writes to a durable database/store used by all instances.

### Concurrency Notes

The repository serializes mutations and uses atomic file replacement to reduce the risk of JSON corruption during rapid updates.

### Deployment Notes

This JSON datastore is best suited for local development and temporary review environments.
On serverless platforms, file-based persistence can reset across cold starts or redeployments.

## Routing Notes

Gameplay UI is served from `/` only.
There is no dedicated `/game` page route.
