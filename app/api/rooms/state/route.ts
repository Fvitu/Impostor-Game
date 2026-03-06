import { NextRequest, NextResponse } from "next/server"
import { getRoom, updateHeartbeat, checkAndSetDisconnectPause, getWaitingListPosition } from "@/lib/room-store";
import type { GameState, Player } from "@/lib/game-logic"

// Sanitize game state so players can't see each other's roles during active play
function sanitizeGameState(game: GameState, requestingPlayerId: string): GameState {
  // During resolution or game-over, reveal everything
  if (game.phase === "resolution" || game.phase === "game-over") {
    return game
  }

  // During active play, only reveal the requesting player's own role
  const sanitizedPlayers: Player[] = game.players.map((p) => {
    if (p.id === requestingPlayerId) {
      return p // Player can see their own role
    }
    return {
      ...p,
      role: null, // Hide other players' roles
    }
  })

  // Hide secret word from the impostor
  const me = game.players.find((p) => p.id === requestingPlayerId)
  const isImpostor = me?.role === "impostor"

  return {
    ...game,
    players: sanitizedPlayers,
    secretWord: isImpostor ? "" : game.secretWord,
  }
}

export async function GET(request: NextRequest) {
	const code = request.nextUrl.searchParams.get("code");
	const pid = request.nextUrl.searchParams.get("pid");
	const wid = request.nextUrl.searchParams.get("wid");

	if (!code) {
		return NextResponse.json({ error: "Room code required" }, { status: 400 });
	}

	const room = getRoom(code.toUpperCase());
	if (!room) {
		return NextResponse.json({ error: "Room not found" }, { status: 404 });
	}

	// If room has been ended by host, notify clients
	if (room.ended) {
		return NextResponse.json({ ended: true }, { status: 410 });
	}

	// Handle waiting list player polling
	if (wid) {
		const pos = getWaitingListPosition(code, wid);
		if (pos < 0) {
			// Not on waiting list anymore - check if promoted to game
			const inGame = room.game.players.some((p) => p.id === wid);
			if (inGame) {
				return NextResponse.json({
					promoted: true,
					playerId: wid,
					code: room.code,
					hostId: room.hostId,
					game: room.game,
				});
			}
			return NextResponse.json({ error: "Not on waiting list" }, { status: 404 });
		}
		return NextResponse.json({
			waiting: true,
			position: pos,
			totalWaiting: room.waitingList.length,
			roomPhase: room.game.phase,
			playerCount: room.game.players.length,
		});
	}

	// Update heartbeat for the requesting player
	if (pid) {
		// If the player had been kicked/removed, tell the client so it can redirect
		if (room.kickedPlayerIds.includes(pid)) {
			return NextResponse.json({ error: "You were removed from this room" }, { status: 410 });
		}
		updateHeartbeat(code.toUpperCase(), pid);
		// Check for disconnected players and set pause if needed
		checkAndSetDisconnectPause(room);
	}

	const sanitizedGame = pid ? sanitizeGameState(room.game, pid) : room.game;

	return NextResponse.json({
		code: room.code,
		hostId: room.hostId,
		game: room.game.phase === "setup" ? room.game : sanitizedGame,
		disconnectPause: room.disconnectPause,
		waitingListCount: room.waitingList.length,
	});
}
