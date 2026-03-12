import { NextRequest, NextResponse } from "next/server"
import {
	startRoomGame,
	submitRoomClue,
	submitRoomVote,
	startNextRound,
	removePlayerFromRoom,
	startRoomVoting,
	replayRoom,
	updateRoomSettings,
	dismissDisconnectedPlayer,
	setDisconnectWait,
	notifyPlayerLeft,
	isPlayerInRoom,
	leaveRoomVoluntarily,
	leaveWaitingList,
	endGameForAll,
	getRoom,
} from "@/lib/room-store";
import { getAuthenticatedUser } from "@/lib/auth";
import { updateStatsAfterGame, recordCategoryPoints, recordCategoryGameResult } from "@/lib/user-stats";
import { getRedisClient } from "@/lib/redis";

export const runtime = "nodejs";

// AUDIT: Maximum allowed clue length enforced server-side.
// The client enforces maxLength=30, but an attacker can bypass it via curl.
// We use 50 as the server limit to allow a small margin above the UI limit.
const MAX_CLUE_LENGTH = 50;

// AUDIT: TTL for the stats-saved deduplication key (10 minutes).
// This prevents a player from calling save-stats multiple times to inflate scores.
const STATS_SAVED_TTL_SECONDS = 10 * 60;

// AUDIT: Strips HTML tags and trims whitespace to prevent stored XSS via clues.
// While React escapes output by default, defense-in-depth dictates we sanitize on input too.
function sanitizeClue(raw: string): string {
	return raw.replace(/<[^>]*>/g, "").trim();
}

// AUDIT: Returns the Redis key used to deduplicate save-stats calls per room+player.
function statsSavedKey(roomCode: string, playerId: string): string {
	return `impostor:stats-saved:${roomCode}:${playerId}`;
}

export async function POST(request: NextRequest) {
  try {
		// AUDIT FIX #4: Wrap request.json() in its own try/catch so that malformed
		// JSON bodies return a clear 400 instead of falling through to the generic 500.
		let body: any;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
		}

		const { action, code, playerId } = body;

		// AUDIT FIX #1: Validate that action and code are non-empty strings and playerId
		// is a string. Without this, null/undefined values propagate into room-store
		// functions causing crashes or undefined behavior (e.g. Redis key "impostor:room:undefined").
		if (typeof action !== "string" || action.length === 0) {
			return NextResponse.json({ error: "Missing or invalid action" }, { status: 400 });
		}
		if (typeof code !== "string" || code.length === 0) {
			return NextResponse.json({ error: "Missing or invalid room code" }, { status: 400 });
		}
		// AUDIT: playerId is required for most actions. The leave-waiting-list action
		// may use waitingPlayerId instead, so we only require playerId to be a string
		// when it is provided (it can be undefined for that specific action).
		if (playerId !== undefined && typeof playerId !== "string") {
			return NextResponse.json({ error: "Invalid playerId" }, { status: 400 });
		}

		switch (action) {
			case "start": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { impostorHelp, textChatEnabled, impostorCount, categorySelection, language } = body;
				const room = await startRoomGame(
					code,
					playerId,
					impostorHelp ?? false,
					textChatEnabled !== false,
					impostorCount ?? 1,
					categorySelection,
					language ?? "en",
				);
				if (!room) return NextResponse.json({ error: "Cannot start game" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "start-voting": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const room = await startRoomVoting(code, playerId);
				if (!room) return NextResponse.json({ error: "Cannot start voting" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "set-settings": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { impostorHelp, textChatEnabled, impostorCount, categorySelection } = body;
				const room = await updateRoomSettings(code, playerId, {
					impostorHelp,
					textChatEnabled,
					impostorCount,
					categorySelection,
				});
				if (!room) return NextResponse.json({ error: "Cannot update settings" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "clue": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { clue } = body;
				if (!clue || typeof clue !== "string") {
					return NextResponse.json({ error: "Clue is required" }, { status: 400 });
				}
				// AUDIT FIX #2: Sanitize clue (strip HTML tags) and enforce server-side
				// length limit. The client enforces maxLength=30 but an attacker can
				// send arbitrarily long or HTML-laden clues via direct API calls.
				const sanitized = sanitizeClue(clue);
				if (sanitized.length === 0) {
					return NextResponse.json({ error: "Clue is required" }, { status: 400 });
				}
				if (sanitized.length > MAX_CLUE_LENGTH) {
					return NextResponse.json({ error: "Clue too long" }, { status: 400 });
				}
				const room = await submitRoomClue(code, playerId, sanitized);
				if (!room) return NextResponse.json({ error: "Cannot submit clue" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "vote": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { targetId } = body;
				if (!targetId || typeof targetId !== "string") return NextResponse.json({ error: "Target is required" }, { status: 400 });
				const room = await submitRoomVote(code, playerId, targetId);
				if (!room) return NextResponse.json({ error: "Cannot submit vote" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "next-round": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const room = await startNextRound(code, playerId);
				if (!room) return NextResponse.json({ error: "Cannot start next round" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "remove-player": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { targetPlayerId } = body;
				if (!targetPlayerId || typeof targetPlayerId !== "string") return NextResponse.json({ error: "Target player required" }, { status: 400 });
				const room = await removePlayerFromRoom(code, playerId, targetPlayerId);
				if (!room) return NextResponse.json({ error: "Cannot remove player" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "replay": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const room = await replayRoom(code, playerId);
				if (!room) return NextResponse.json({ error: "Cannot replay game" }, { status: 400 });
				return NextResponse.json({ game: room.game });
			}

			case "dismiss-disconnected": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { targetPlayerId } = body;
				if (!targetPlayerId || typeof targetPlayerId !== "string") return NextResponse.json({ error: "Target player required" }, { status: 400 });
				const room = await dismissDisconnectedPlayer(code, playerId, targetPlayerId);
				if (!room) return NextResponse.json({ error: "Cannot dismiss player" }, { status: 400 });
				return NextResponse.json({ game: room.game, disconnectPause: room.disconnectPause });
			}

			case "wait-for-reconnect": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const { targetPlayerId } = body;
				if (!targetPlayerId || typeof targetPlayerId !== "string") return NextResponse.json({ error: "Target player required" }, { status: 400 });
				const room = await setDisconnectWait(code, playerId, targetPlayerId);
				if (!room) return NextResponse.json({ error: "Cannot set wait" }, { status: 400 });
				return NextResponse.json({ game: room.game, disconnectPause: room.disconnectPause });
			}

			case "player-leaving": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				await notifyPlayerLeft(code, playerId);
				return NextResponse.json({ ok: true });
			}

			case "leave-room-voluntary": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				await leaveRoomVoluntarily(code, playerId);
				return NextResponse.json({ ok: true });
			}

			case "leave-waiting-list": {
				const { waitingPlayerId } = body;
				// AUDIT: leave-waiting-list may use waitingPlayerId or fall back to playerId.
				// At least one of them must be a non-empty string.
				const effectiveId = waitingPlayerId || playerId;
				if (typeof effectiveId !== "string" || effectiveId.length === 0) {
					return NextResponse.json({ error: "Missing player identifier" }, { status: 400 });
				}
				await leaveWaitingList(code, effectiveId);
				return NextResponse.json({ ok: true });
			}

			case "end-game": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const room = await endGameForAll(code, playerId);
				if (!room) return NextResponse.json({ error: "Cannot end game" }, { status: 400 });
				return NextResponse.json({ ended: true });
			}

			case "verify-session": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				const valid = await isPlayerInRoom(code, playerId);
				return NextResponse.json({ valid });
			}

			case "save-stats": {
				if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
				// Save stats for the authenticated registered user after a game ends
				const token = request.cookies.get("impostor_session")?.value;
				const authUser = await getAuthenticatedUser(token);
				if (!authUser) {
					return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
				}

				const room = await getRoom(code);
				if (!room || room.game.phase !== "game-over") {
					return NextResponse.json({ error: "Game not over" }, { status: 400 });
				}

				const player = room.game.players.find((p) => p.id === playerId);
				if (!player || !player.role) {
					return NextResponse.json({ error: "Player not found" }, { status: 400 });
				}

				// AUDIT FIX #3: Server-side deduplication for save-stats.
				// The client has a statsSavedRef guard, but it can be bypassed by calling
				// the API directly. We set a Redis key with a short TTL the first time
				// stats are saved, and reject subsequent calls for the same room+player.
				const redis = await getRedisClient();
				const dedupKey = statsSavedKey(code, playerId);
				const alreadySaved = await redis.get(dedupKey);
				if (alreadySaved) {
					return NextResponse.json({ error: "Stats already saved for this game" }, { status: 409 });
				}

				// FIX: Use player.totalScore instead of summing player.scores, because
				// end-game bonuses (from applyBonuses) are only added to totalScore,
				// not to the per-round scores array. Using scores.reduce would miss those bonuses.
				const totalRoundScore = player.totalScore;
				const won = room.game.winner === (player.role === "impostor" ? "impostor" : "friends");
				const role = player.role === "impostor" ? ("impostor" as const) : ("friend" as const);

				const stats = await updateStatsAfterGame(authUser.id, authUser.username, totalRoundScore, role, won);

				// FIX: Use categoryId (stable identifier) instead of category (localized label)
				// so EN and ES games contribute to the same category leaderboard.
				const categoryId = room.game.categoryId || room.game.category;
				if (categoryId && totalRoundScore > 0) {
					await recordCategoryPoints(authUser.id, categoryId, totalRoundScore, stats.includeInPublicLeaderboard);
					// Record per-category games/wins so leaderboard can show category-specific stats
					await recordCategoryGameResult(authUser.id, categoryId, role, won);
				}

				// AUDIT: Mark stats as saved for this room+player so duplicate calls are rejected.
				await redis.set(dedupKey, "1", { EX: STATS_SAVED_TTL_SECONDS });

				return NextResponse.json({ stats });
			}

			default:
				return NextResponse.json({ error: "Unknown action" }, { status: 400 });
		}
  } catch {
    return NextResponse.json({ error: "Action failed" }, { status: 500 })
  }
}
