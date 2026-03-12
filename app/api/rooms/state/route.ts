import { NextRequest, NextResponse } from "next/server"
import { getRoom, touchRoom, updateRoomHeartbeat } from "@/lib/room-store";
import type { GameState, Player } from "@/lib/game-logic"

export const runtime = "nodejs";

// Sanitize game state so players can't see each other's roles during active play
function sanitizeGameState(game: GameState, requestingPlayerId: string): GameState {
	// During resolution or game-over, reveal everything
	if (game.phase === "resolution" || game.phase === "game-over") {
		return game;
	}

	// During active play, only reveal the requesting player's own role
	const sanitizedPlayers: Player[] = game.players.map((p) => {
		if (p.id === requestingPlayerId) {
			return p; // Player can see their own role
		}
		return {
			...p,
			role: null, // Hide other players' roles
		};
	});

	// Hide secret word from the impostor
	const me = game.players.find((p) => p.id === requestingPlayerId);
	const isImpostor = me?.role === "impostor";

	// AUDIT: Hint reveals information about the secret word. Only impostors with
	// impostorHelp enabled should see it; friends must never see it, and impostors
	// without impostorHelp must not see it either.
	const showHint = isImpostor && game.impostorHelp;

	return {
		...game,
		players: sanitizedPlayers,
		secretWord: isImpostor ? "" : game.secretWord,
		hint: showHint ? game.hint : "",
	};
}

export async function GET(request: NextRequest) {
	const code = request.nextUrl.searchParams.get("code");
	const pid = request.nextUrl.searchParams.get("pid");
	const wid = request.nextUrl.searchParams.get("wid");

	if (!code) {
		return NextResponse.json({ error: "Room code required" }, { status: 400 });
	}

	const room = await getRoom(code.toUpperCase());
	if (!room) {
		return NextResponse.json({ error: "Room not found" }, { status: 404 });
	}

	// If room has been ended by host, notify clients
	if (room.ended) {
		return NextResponse.json({ ended: true }, { status: 410 });
	}

	// Handle waiting list player polling
	if (wid) {
		const pos = room.waitingList.findIndex((waitingPlayer) => waitingPlayer.id === wid);
		if (pos < 0) {
			// Not on waiting list anymore - check if promoted to game
			const inGame = room.game.players.some((p) => p.id === wid);
			if (inGame) {
				await touchRoom(room.code);
				// AUDIT: Promoted waiting-list players must receive sanitized state,
				// otherwise their first poll response leaks all roles and secretWord.
				const sanitizedGame = sanitizeGameState(room.game, wid);
				return NextResponse.json({
					promoted: true,
					playerId: wid,
					code: room.code,
					hostId: room.hostId,
					game: room.game.phase === "setup" ? room.game : sanitizedGame,
				});
			}
			return NextResponse.json({ error: "Not on waiting list" }, { status: 404 });
		}
		await touchRoom(room.code);
		return NextResponse.json({
			waiting: true,
			position: pos + 1,
			totalWaiting: room.waitingList.length,
			roomPhase: room.game.phase,
			playerCount: room.game.players.length,
		});
	}

	// Update heartbeat for the requesting player
	if (pid) {
		// FIX: Check kicked status from the atomically-loaded room inside
		// updateRoomHeartbeat, not from the stale initial getRoom() load,
		// to avoid a ToCToU race where a player gets kicked between the two reads.
		const updatedRoom = await updateRoomHeartbeat(room.code, pid);
		if (!updatedRoom) {
			return NextResponse.json({ error: "Room not found" }, { status: 404 });
		}

		if (updatedRoom.kickedPlayerIds.includes(pid)) {
			return NextResponse.json({ error: "You were removed from this room" }, { status: 410 });
		}

		const sanitizedGame = sanitizeGameState(updatedRoom.game, pid);

		return NextResponse.json({
			code: updatedRoom.code,
			hostId: updatedRoom.hostId,
			game: updatedRoom.game.phase === "setup" ? updatedRoom.game : sanitizedGame,
			disconnectPause: updatedRoom.disconnectPause,
			waitingListCount: updatedRoom.waitingList.length,
		});
	}

	// AUDIT: Without a pid, we cannot verify the caller is a room member or
	// sanitize the game state for them. Returning full state here previously
	// leaked secretWord, all player roles, and hints to unauthenticated callers.
	return NextResponse.json({ error: "Player ID (pid) is required" }, { status: 400 });
}
