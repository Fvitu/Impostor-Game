# The Impostor Game

A multiplayer social deduction game built with **Next.js 16** and **React 19**.

Players receive hidden roles (Friend or Impostor), share clues, vote, and try to identify the impostor before it is too late.

## Features

- **Two play modes**:
  - **Pass & Play** (single device): `/play/local`
  - **Online Rooms** (host + join by code): `/play/online`
- Configurable match setup:
  - 4–16 players
  - 1–4 impostors (auto-limited by player count)
  - Optional impostor category hint
  - Optional clue/chat phase
  - Optional individual voting mode
- Persistent local session support via `localStorage`:
  - Resume local match after refresh
  - Resume online session (short-lived)
  - Preserve waiting-list and results state
- Online reconnection and disconnect handling:
  - Host can wait for reconnect or dismiss disconnected players
  - Host transfer if original host disconnects

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS v4, Radix UI primitives, Lucide icons
- **State**:
  - Local mode: React context/reducer (`components/game/game-provider.tsx`)
  - Online mode: server in-memory room store (`lib/room-store.ts`)

## Project Structure

```text
app/
  page.tsx                     # Landing page
  play/local/page.tsx          # Pass & Play entry
  play/online/page.tsx         # Online lobby + game container
  api/rooms/*                  # Online room API routes

components/
  game/*                       # Core game phases and orchestration
  online/*                     # Online lobby and room UI
  landing/*                    # Home page sections
  ui/*                         # Shared design system components

lib/
  game-logic.ts                # Pure game engine and scoring
  room-store.ts                # In-memory online room state
  storage.ts                   # Browser localStorage persistence helpers
```

## Requirements

- **Node.js 20+**
- **pnpm** (recommended; lockfile included)

## Getting Started

```bash
pnpm install
pnpm dev
```

Open: `http://localhost:3000`

### Other scripts

```bash
pnpm build   # production build
pnpm start   # run production server
pnpm lint    # lint project
```

## How the Game Works

### Core phases

1. **Setup**: add players and configure options.
2. **Role reveal**: each player checks role privately.
3. **Clues** (optional): active players provide one clue each.
4. **Voting**: players vote for a suspect (or host resolves if voting mode disabled).
5. **Resolution**: elimination + round scoring + next round or game end.

### Win conditions

- **Friends win** when all impostors are eliminated.
- **Impostors win** when only 2 active players remain and at least one impostor survives.

### Scoring

- **Friend**: +2 each round if voting an impostor.
- **Impostor**: +2 each round survived.
- **Bonus**:
  - Friends: +10 if team wins and player voted correctly every round.
  - Impostor: +10 if impostor side wins.

## Online API

Base path: `/api/rooms`

### `POST /api/rooms/create`

Create room as host.

Request:

```json
{ "hostName": "Alice" }
```

### `POST /api/rooms/join`

Join room by code. Can return:
- `joined`
- `rejoined`
- `waiting` (room in progress)
- `blocked` (kicked or voluntarily left)

Request:

```json
{ "code": "ABCDE", "playerName": "Bob" }
```

### `GET /api/rooms/state?code=ABCDE&pid=PLAYER_ID`

Get room/game state and heartbeat update for active player.

Optional waiting-list polling:

`GET /api/rooms/state?code=ABCDE&wid=WAITING_PLAYER_ID`

### `POST /api/rooms/action`

Perform room/game action using:

```json
{
  "action": "start|start-voting|clue|vote|next-round|remove-player|replay|dismiss-disconnected|wait-for-reconnect|player-leaving|leave-room-voluntary|leave-waiting-list|end-game|verify-session",
  "code": "ABCDE",
  "playerId": "..."
}
```

Additional fields depend on action (`clue`, `targetId`, `targetPlayerId`, `waitingPlayerId`, etc.).

## Important Architecture Notes

- Online rooms are stored **in memory** (`Map` in `lib/room-store.ts`).
- Room state is lost on server restart/redeploy.
- Idle rooms are cleaned up automatically (~30 minutes inactivity).
- This implementation is ideal for local/dev/small deployments.
- For production-scale reliability, replace room store with Redis or a database.

## Current Game Limits

- Max players per room: **16**
- Max impostors per game: **4** (depends on player count)
- Disconnect detection threshold: ~**10 seconds** without heartbeat

## Future Improvements

- Persistent online room backend (Redis/PostgreSQL)
- Authentication / anti-impersonation for online lobbies
- Automated tests for game logic and API routes
- WebSocket or SSE for real-time room updates (instead of polling)

## License

No license file is currently defined in this repository.
