# The Impostor

A multiplayer social deduction game where players share clues about a secret word and vote to expose the hidden impostor.

## Screenshots

<!-- Landing / home screen -->
![Landing](public/readme/Landing.png)

<!-- Setup — adding players and configuring the game -->
![Setup](public/readme/Setup.png)

<!-- Role reveal — each player checks their role privately -->
![Role Reveal](public/readme/Role-reveal.png)

<!-- Round resolution — who was eliminated -->
![Resolution](public/readme/Resolution.png)

## What is this

Each round, every player except the impostor(s) receives the same secret word. Impostors do not know the word but know the category hint if the host enables that option. Players take turns giving a one-word clue that suggests they know the secret without revealing it outright. After clues, everyone votes to eliminate a suspect.

Innocents win by eliminating all impostors. Impostors win by surviving until only two active players remain.

It is a party game for 3–16 players. It works well in person on a single device using Pass & Play, or remotely where each player joins with their phone.

The structure is deliberately simple: no accounts required to play, no timers enforced by the server, and game state is kept in Redis so online rooms survive page refreshes and short network drops.

## Game modes

### Pass & Play

All players share one device. After each player sees their role privately, they pass the device to the next person. The clue and voting phases happen in sequence on screen. Game state is saved to `localStorage` so an accidental refresh does not lose progress.

### Online Rooms

The host creates a room and shares a 5-character code. Each player joins from their own device. The host controls game settings and advancement. State is polled from the server every few seconds — there is no WebSocket connection; updates arrive via HTTP polling against `/api/rooms/state`.

Players who join while a game is already in progress are placed on a waiting list and automatically promoted into the next replay.

## How it works

### Creating and joining

1. Host navigates to `/play/online` and enters their name to create a room. The server returns a 5-character room code (e.g. `ABCDE`).
2. Other players enter the code and their name at `/play/online`. Names must be 2–20 characters, letters/numbers/hyphens/underscores only, and must be unique within the room.
3. The host sees all joined players in the lobby and can remove players before starting.

### Starting the game

The host configures settings before starting:
- Number of impostors (1–4, limited by player count — see table below)
- Category selection (one or more of 16 categories, or all at once)
- Whether impostors receive a category hint
- Whether the clue phase is enabled
- Whether voting is individual (each player votes) or host-controlled

| Players | Max impostors |
|---------|--------------|
| 2–4     | 1            |
| 5       | 2            |
| 6–7     | 3            |
| 8+      | 4            |

When the host starts, the server picks a random word from the selected categories, assigns roles by randomly selecting the configured number of impostors from active players, and advances to the clue phase (or voting if clues are disabled).

### Role reveal

In Pass & Play, each player taps to see their role, then passes the device. In online mode, each player sees their own role via the state polling response — other players' roles are hidden from the API response during active play.

Innocents see the secret word. Impostors see only the category (if `impostorHelp` is on) or nothing.

### Clue phase

If `textChatEnabled` is true, players submit clues in the order determined by a shuffled round order. Players can give only one clue per round. After all active players have submitted, the game advances to voting.

In Pass & Play with clues disabled, the host manually advances to voting after the group has discussed out loud.

### Voting

All active (non-eliminated) players cast one vote each. A player cannot vote for themselves. When all votes are in, the round resolves automatically. In online mode, if a player disconnects mid-vote, the host can dismiss them (counting as eliminated) or wait for reconnect.

### Resolution

The player with the most votes is eliminated. On a tie, nobody is eliminated and the round ends with no elimination. Round scores are applied immediately.

After resolution, the host advances to the next round. If the game is over (all impostors eliminated, or 2 or fewer active players remain with an impostor alive), the results screen shows the full scoreboard including roles.

### Reconnection and disconnects

Players who stop sending heartbeats for more than 15 seconds are detected as disconnected. The host sees a prompt to wait or dismiss. Dismissed players are marked eliminated and removed from the active game. If the host disconnects, host role transfers to the first connected active player. The original host reclaims host status on reconnect.

Rooms expire after 30 minutes of inactivity. When the host ends the game explicitly, the room is marked ended and clients receive a `410` response, clearing their session.

## Scoring

Scores are tracked per round and accumulated across replays within the same room session.

| Situation | Points |
|-----------|--------|
| Innocent voted for an impostor this round | +2 |
| Impostor survived this round (tie or a innocent was eliminated) | +2 |
| Impostor team wins the match | +10 (each impostor) |
| Innocent team wins and this innocent voted correctly every round | +10 |

The +10 end-game bonus is added to `totalScore` only — it does not appear in the per-round `scores` array used for display during the game.

Scores reset to zero on a fresh game start but `totalScore` carries over when the room replays, allowing cumulative tracking across multiple games in the same session.

## Tech stack

```
Frontend
  - Next.js 16 (App Router)
  - React 19
  - TypeScript 5.7
  - Tailwind CSS v4
  - Radix UI (unstyled primitives)
  - Lucide icons
  - react-i18next / i18next (EN and ES)

Backend
  - Next.js API routes (Node.js runtime)
  - bcryptjs (password hashing)
  - jose (JWT signing and verification)

Storage
  - Redis (room state, user accounts, stats, leaderboard)
  - Browser localStorage (local game state, session resume, language preference)

Real-time
  - HTTP polling (no WebSockets)

Infrastructure / tooling
  - @ducanh2912/next-pwa (PWA, enabled in production only)
  - @vercel/analytics + @vercel/speed-insights
  - ESLint
```

## Environment variables

| Variable | Purpose | Required | Example |
|---|---|---|---|
| `REDIS_URL` | Connection string for Redis | Yes | `redis://default:password@localhost:6379` |
| `JWT_SECRET` | Secret key for signing session JWTs | Yes in production | `a-long-random-string` |

`JWT_SECRET` falls back to a hardcoded insecure default in development and throws at startup if missing in production (`NODE_ENV=production`).

`.env.local` template:

```bash
# Redis connection string
# Use rediss:// for TLS connections (e.g. Upstash, Redis Cloud)
REDIS_URL=redis://default:your-password@localhost:6379

# JWT secret for session tokens — use a long random string
JWT_SECRET=change-me-to-a-long-random-secret
```

## Getting started

### Prerequisites

- Node.js 20 or later
- npm (lock file is `package-lock.json`)
- A running Redis instance (required for online rooms and auth)

### Installation

1. Clone the repository.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment template and fill in your values:
   ```bash
   cp .env .env.local
   # edit .env.local and set REDIS_URL and JWT_SECRET
   ```

### Running locally

Start Redis (example using Docker):
```bash
docker run -d -p 6379:6379 redis:7
```

Start the dev server:
```bash
npm run dev
```

Open `http://localhost:3000`.

The PWA service worker is disabled in development. Pass & Play works without Redis. Online rooms and auth require a reachable `REDIS_URL`.

### Running in production

```bash
npm run build
npm start
```

Set `REDIS_URL` and `JWT_SECRET` in your hosting provider's environment variables before deploying. The app is PWA-ready in production; the service worker is registered automatically via `@ducanh2912/next-pwa`.

Note: `typescript.ignoreBuildErrors` is currently set to `true` in `next.config.mjs`, so TypeScript errors will not fail the production build.

### Other scripts

```bash
npm run lint    # ESLint
```

## Redis key patterns

| Key pattern | What it stores |
|---|---|
| `impostor:room:<CODE>` | Full room + game state (JSON), TTL 30 min |
| `impostor:user:<UUID>` | User record (email, username, password hash) |
| `impostor:email:<email>` | Maps normalized email to user UUID |
| `impostor:username:<name>` | Maps normalized username to user UUID |
| `impostor:stats:<UUID>` | Aggregate user stats (JSON) |
| `impostor:stats:categories:<UUID>` | Hash: categoryId → total points |
| `impostor:stats:catstats:<UUID>` | Hash: categoryId → per-category game stats (JSON) |
| `impostor:leaderboard` | Sorted set: userId → totalPoints |
| `impostor:leaderboard:cat:<category>` | Sorted set: userId → category points |
| `impostor:stats-saved:<CODE>:<PID>` | Dedup key for save-stats (TTL 10 min) |

## Contributing

The project has no automated tests yet. If you want to contribute, branch off `main`, keep changes focused, and open a PR with a description of what changed and why. TypeScript errors are currently suppressed at build time — fixes are welcome.

## License

MIT — see [LICENSE](LICENSE).