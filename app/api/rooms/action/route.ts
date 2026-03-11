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
} from "@/lib/room-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, code, playerId } = body

    switch (action) {
		case "start": {
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
			const room = await startRoomVoting(code, playerId);
			if (!room) return NextResponse.json({ error: "Cannot start voting" }, { status: 400 });
			return NextResponse.json({ game: room.game });
		}

		case "set-settings": {
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
			const { clue } = body;
			if (!clue || typeof clue !== "string") {
				return NextResponse.json({ error: "Clue is required" }, { status: 400 });
			}
			const room = await submitRoomClue(code, playerId, clue.trim());
			if (!room) return NextResponse.json({ error: "Cannot submit clue" }, { status: 400 });
			return NextResponse.json({ game: room.game });
		}

		case "vote": {
			const { targetId } = body;
			if (!targetId) return NextResponse.json({ error: "Target is required" }, { status: 400 });
			const room = await submitRoomVote(code, playerId, targetId);
			if (!room) return NextResponse.json({ error: "Cannot submit vote" }, { status: 400 });
			return NextResponse.json({ game: room.game });
		}

		case "next-round": {
			const room = await startNextRound(code, playerId);
			if (!room) return NextResponse.json({ error: "Cannot start next round" }, { status: 400 });
			return NextResponse.json({ game: room.game });
		}

		case "remove-player": {
			const { targetPlayerId } = body;
			const room = await removePlayerFromRoom(code, playerId, targetPlayerId);
			if (!room) return NextResponse.json({ error: "Cannot remove player" }, { status: 400 });
			return NextResponse.json({ game: room.game });
		}

		case "replay": {
			const room = await replayRoom(code, playerId);
			if (!room) return NextResponse.json({ error: "Cannot replay game" }, { status: 400 });
			return NextResponse.json({ game: room.game });
		}

		case "dismiss-disconnected": {
			const { targetPlayerId } = body;
			if (!targetPlayerId) return NextResponse.json({ error: "Target player required" }, { status: 400 });
			const room = await dismissDisconnectedPlayer(code, playerId, targetPlayerId);
			if (!room) return NextResponse.json({ error: "Cannot dismiss player" }, { status: 400 });
			return NextResponse.json({ game: room.game, disconnectPause: room.disconnectPause });
		}

		case "wait-for-reconnect": {
			const { targetPlayerId } = body;
			if (!targetPlayerId) return NextResponse.json({ error: "Target player required" }, { status: 400 });
			const room = await setDisconnectWait(code, playerId, targetPlayerId);
			if (!room) return NextResponse.json({ error: "Cannot set wait" }, { status: 400 });
			return NextResponse.json({ game: room.game, disconnectPause: room.disconnectPause });
		}

		case "player-leaving": {
			await notifyPlayerLeft(code, playerId);
			return NextResponse.json({ ok: true });
		}

		case "leave-room-voluntary": {
			await leaveRoomVoluntarily(code, playerId);
			return NextResponse.json({ ok: true });
		}

		case "leave-waiting-list": {
			const { waitingPlayerId } = body;
			await leaveWaitingList(code, waitingPlayerId || playerId);
			return NextResponse.json({ ok: true });
		}

		case "end-game": {
			const room = await endGameForAll(code, playerId);
			if (!room) return NextResponse.json({ error: "Cannot end game" }, { status: 400 });
			return NextResponse.json({ ended: true });
		}

		case "verify-session": {
			const valid = await isPlayerInRoom(code, playerId);
			return NextResponse.json({ valid });
		}

		default:
			return NextResponse.json({ error: "Unknown action" }, { status: 400 });
	}
  } catch {
    return NextResponse.json({ error: "Action failed" }, { status: 500 })
  }
}
