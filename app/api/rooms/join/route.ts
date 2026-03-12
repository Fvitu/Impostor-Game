import { NextRequest, NextResponse } from "next/server"
import { joinRoom } from "@/lib/room-store"
import { validatePlayerName } from "@/lib/player-name";

export const runtime = "nodejs";

// AUDIT: Maximum allowed length for room codes. Room codes are generated as
// short uppercase alphanumeric strings; anything longer is not a valid code
// and could be used to abuse Redis key storage or bypass normalisation.
const MAX_CODE_LENGTH = 10;

export async function POST(request: NextRequest) {
  try {
		const { code, playerName } = await request.json();
		const normalizedCode = typeof code === "string" ? code.toUpperCase().trim() : "";
		const normalizedPlayerName = typeof playerName === "string" ? playerName.trim() : "";

		if (!normalizedCode || !normalizedPlayerName) {
			return NextResponse.json({ error: "Room code and player name are required" }, { status: 400 });
		}

		// AUDIT: Enforce a hard length limit on room codes before any further
		// processing. This prevents oversized strings from reaching Redis key
		// construction (getRoomKey) and avoids potential abuse of unbounded input.
		if (normalizedCode.length > MAX_CODE_LENGTH) {
			return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
		}

		// AUDIT: validatePlayerName already enforces a 2-20 character limit and
		// restricts the character set to [A-Za-z0-9_-], preventing injection and
		// oversized payloads in the player name field.
		const validatedPlayerName = validatePlayerName(normalizedPlayerName);
		if (!validatedPlayerName.isValid) {
			return NextResponse.json({ error: validatedPlayerName.error }, { status: 400 });
		}

		// AUDIT: joinRoom uses a non-atomic loadRoom -> modify -> finalizeRoomUpdate
		// pattern. Two players joining simultaneously could both read the same room
		// state with N players, both see it's not full, and both add themselves,
		// potentially exceeding MAX_PLAYERS (TOCTOU race condition). This should be
		// migrated to updateRoomAtomically in room-store.ts for a complete fix.
		const result = await joinRoom(normalizedCode, validatedPlayerName.value);
		if (!result) {
			return NextResponse.json({ error: "Room not found or full" }, { status: 404 });
		}

		if (result.type === "blocked") {
			return NextResponse.json({ error: result.reason }, { status: 403 });
		}

		if (result.type === "waiting") {
			return NextResponse.json({
				status: "waiting",
				code: result.room.code,
				waitingPlayerId: result.waitingPlayerId,
				position: result.position,
			});
		}

		// AUDIT: For rejoin during active play, sanitize the game state to prevent
		// role and secret word leaks. Without this, the full unsanitized room.game
		// (including every player's role and the secretWord) is sent to the client.
		// This mirrors the sanitisation logic used in the state polling endpoint.
		if (result.type === "rejoined" && result.room.game.phase !== "setup") {
			const sanitizedPlayers = result.room.game.players.map((p) => {
				if (p.id === result.playerId) return p;
				return { ...p, role: null };
			});
			const me = result.room.game.players.find((p) => p.id === result.playerId);
			const isImpostor = me?.role === "impostor";
			const sanitizedGame = {
				...result.room.game,
				players: sanitizedPlayers,
				secretWord: isImpostor ? "" : result.room.game.secretWord,
				hint: isImpostor && result.room.game.impostorHelp ? result.room.game.hint : "",
			};
			return NextResponse.json({
				status: result.type,
				code: result.room.code,
				playerId: result.playerId,
				game: sanitizedGame,
			});
		}

		// "joined" (setup phase) — full game state is safe to send since roles
		// have not been assigned yet.
		return NextResponse.json({
			status: result.type,
			code: result.room.code,
			playerId: result.playerId,
			game: result.room.game,
		});
  } catch {
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 })
  }
}
