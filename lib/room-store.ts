// In-memory room store for online multiplayer
// In production, this would be backed by Redis or a database

import type { GameState, Player } from "./game-logic"
import {
	createGame,
	createPlayer,
	assignRoles,
	replayGame,
	startNextRound as startNextRoundState,
	submitClue,
	submitVote,
	resolveRound,
	allVotesIn,
	generateRoomCode,
	MAX_PLAYERS,
	applyBonuses,
} from "./game-logic";

const DISCONNECT_THRESHOLD = 10_000; // 10 seconds without heartbeat

export interface DisconnectPause {
	playerId: string;
	playerName: string;
	hostDecision: "pending" | "waiting";
}

export interface WaitingPlayer {
	id: string;
	name: string;
	joinedAt: number;
}

export interface Room {
	code: string;
	hostId: string;
	originalHostId: string;
	game: GameState;
	lastActivity: number;
	impostorHelp: boolean;
	textChatEnabled: boolean;
	playerHeartbeats: Record<string, number>;
	disconnectPause: DisconnectPause | null;
	originalPlayerIds: string[];
	kickedPlayerIds: string[];
	leftPlayerNames: string[];
	voluntaryLeftPlayerNames: string[];
	waitingList: WaitingPlayer[];
	ended: boolean;
}

// In-memory store (resets on server restart)
const rooms = new Map<string, Room>()

// Cleanup old rooms every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [code, room] of rooms) {
      if (now - room.lastActivity > 30 * 60 * 1000) {
        rooms.delete(code)
      }
    }
  }, 5 * 60 * 1000)
}

export function createRoom(hostName: string): { room: Room; playerId: string } {
  const code = generateRoomCode()
  const game = createGame("online")
  const host = createPlayer(hostName)
  game.players.push(host)

  const room: Room = {
		code,
		hostId: host.id,
		originalHostId: host.id,
		game,
		lastActivity: Date.now(),
		impostorHelp: false,
		textChatEnabled: true,
		playerHeartbeats: { [host.id]: Date.now() },
		disconnectPause: null,
		originalPlayerIds: [],
		kickedPlayerIds: [],
		leftPlayerNames: [],
		voluntaryLeftPlayerNames: [],
		waitingList: [],
		ended: false,
  };

  rooms.set(code, room)
  return { room, playerId: host.id }
}

export function getRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase())
  if (room) room.lastActivity = Date.now()
  return room
}

export type JoinRoomResult =
	| { type: "joined"; room: Room; playerId: string }
	| { type: "rejoined"; room: Room; playerId: string }
	| { type: "waiting"; room: Room; waitingPlayerId: string; position: number }
	| { type: "blocked"; reason: string };

export function joinRoom(code: string, playerName: string): JoinRoomResult | null {
	const room = getRoom(code.toUpperCase());
	if (!room) return null;
	if (room.ended) return null;

	const nameLower = playerName.toLowerCase();

	// Check if player was kicked - blocked (kicks are permanent)
	const kickedPlayer = room.game.players.find((p) => p.name.toLowerCase() === nameLower && room.kickedPlayerIds.includes(p.id));
	if (kickedPlayer) {
		return { type: "blocked", reason: "You were removed from this room" };
	}

	// Setup phase - normal join
	if (room.game.phase === "setup") {
		if (room.game.players.length >= MAX_PLAYERS) return null;
		if (room.game.players.some((p) => p.name.toLowerCase() === nameLower)) return null;

		const player = createPlayer(playerName);
		room.game.players.push(player);
		room.playerHeartbeats[player.id] = Date.now();
		room.lastActivity = Date.now();
		return { type: "joined", room, playerId: player.id };
	}

	// Game in progress - check for rejoin (original player returning)
	const existingPlayer = room.game.players.find((p) => p.name.toLowerCase() === nameLower);

	if (existingPlayer) {
		const isOriginal = room.originalPlayerIds.includes(existingPlayer.id);
		const wasVoluntary = room.voluntaryLeftPlayerNames.includes(nameLower);

		// Allow rejoin for original players or those who left voluntarily (but not for kicked players)
		if ((isOriginal || wasVoluntary) && !room.kickedPlayerIds.includes(existingPlayer.id)) {
			room.playerHeartbeats[existingPlayer.id] = Date.now();

			// If this was the original host, transfer host back
			if (existingPlayer.id === room.originalHostId && room.hostId !== existingPlayer.id) {
				room.hostId = existingPlayer.id;
			}

			// Clear disconnect pause if it was for this player
			if (room.disconnectPause?.playerId === existingPlayer.id) {
				room.disconnectPause = null;
			}

			// Restore player if they were marked eliminated due to leaving
			room.game.players = room.game.players.map((p) => (p.id === existingPlayer.id ? { ...p, isEliminated: false } : p));

			// Remove voluntary-left marker if present
			if (wasVoluntary) {
				room.voluntaryLeftPlayerNames = room.voluntaryLeftPlayerNames.filter((n) => n !== nameLower);
			}

			room.lastActivity = Date.now();
			return { type: "rejoined", room, playerId: existingPlayer.id };
		}
	}

	// Game in progress, new player - add to waiting list
	const alreadyWaiting = room.waitingList.find((w) => w.name.toLowerCase() === nameLower);
	if (alreadyWaiting) {
		return { type: "blocked", reason: "You are already on the waiting list for this room" };
	}

	if (room.waitingList.length + room.game.players.length >= MAX_PLAYERS) {
		return null;
	}

	const waitingPlayer: WaitingPlayer = {
		id: Math.random().toString(36).substring(2, 9),
		name: playerName,
		joinedAt: Date.now(),
	};
	room.waitingList.push(waitingPlayer);
	room.lastActivity = Date.now();
	return { type: "waiting", room, waitingPlayerId: waitingPlayer.id, position: room.waitingList.length };
}

export function startRoomGame(code: string, hostId: string, impostorHelp: boolean, textChatEnabled: boolean, impostorCount: number = 1): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.players.length < 3) return null;

	room.impostorHelp = impostorHelp;
	room.textChatEnabled = textChatEnabled;
	room.game.impostorHelp = impostorHelp;
	room.game.textChatEnabled = textChatEnabled;
	room.game.impostorCount = impostorCount;
	room.originalPlayerIds = room.game.players.map((p) => p.id);
	room.originalHostId = room.hostId;
	room.game = assignRoles(room.game);
	room.game.phase = "clues";
	room.lastActivity = Date.now();
	return room;
}

export function updateRoomSettings(
	code: string,
	hostId: string,
	settings: { impostorHelp?: boolean; textChatEnabled?: boolean; impostorCount?: number },
): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "setup") return null;

	if (typeof settings.impostorHelp === "boolean") {
		room.impostorHelp = settings.impostorHelp;
		room.game.impostorHelp = settings.impostorHelp;
	}

	if (typeof settings.textChatEnabled === "boolean") {
		room.textChatEnabled = settings.textChatEnabled;
		room.game.textChatEnabled = settings.textChatEnabled;
	}

	if (typeof settings.impostorCount === "number") {
		room.game.impostorCount = Math.max(1, Math.floor(settings.impostorCount));
	}

	room.lastActivity = Date.now();
	return room;
}

export function submitRoomClue(code: string, playerId: string, clue: string): Room | null {
  const room = getRoom(code)
  if (!room || room.game.phase !== "clues") return null
  if (!room.game.textChatEnabled) return null;

  const activePlayers = room.game.players.filter((p) => !p.isEliminated)
  const currentPlayer = activePlayers[room.game.currentPlayerIndex]
  if (!currentPlayer || currentPlayer.id !== playerId) return null

  room.game = submitClue(room.game, playerId, clue)
  room.lastActivity = Date.now()
  return room
}

export function startRoomVoting(code: string, hostId: string): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "clues") return null;
	if (room.game.textChatEnabled) return null;

	room.game.phase = "voting";
	room.lastActivity = Date.now();
	return room;
}

export function submitRoomVote(code: string, voterId: string, targetId: string): Room | null {
  const room = getRoom(code)
  if (!room || room.game.phase !== "voting") return null

  const voter = room.game.players.find((p) => p.id === voterId);
  const target = room.game.players.find((p) => p.id === targetId);

  if (!voter || voter.isEliminated) return null;
  if (!target || target.isEliminated) return null;
  if (voterId === targetId) return null;

  room.game = submitVote(room.game, voterId, targetId)

  // Auto-resolve when all votes are in
  if (allVotesIn(room.game)) {
    room.game = resolveRound(room.game)
  }

  room.lastActivity = Date.now()
  return room
}

export function startNextRound(code: string, hostId: string): Room | null {
  const room = getRoom(code)
  if (!room || room.hostId !== hostId) return null
  if (room.game.phase !== "resolution") return null;

  room.game = startNextRoundState(room.game);
  room.lastActivity = Date.now()
  return room
}

export function removePlayerFromRoom(code: string, hostId: string, playerId: string): Room | null {
  const room = getRoom(code)
  if (!room || room.hostId !== hostId) return null
  if (room.game.phase !== "setup") return null
	const targetPlayer = room.game.players.find((p) => p.id === playerId);
	room.game.players = room.game.players.filter((p) => p.id !== playerId);
	delete room.playerHeartbeats[playerId];
	// Track as kicked so the client can detect and redirect the removed player
	room.kickedPlayerIds.push(playerId);
	if (targetPlayer) room.leftPlayerNames.push(targetPlayer.name.toLowerCase());
  room.lastActivity = Date.now()
  return room
}

// ─── Heartbeat & Disconnect ─────────────────────────────────────────

export function updateHeartbeat(code: string, playerId: string): void {
	const room = rooms.get(code.toUpperCase());
	if (room && room.game.players.some((p) => p.id === playerId)) {
		room.playerHeartbeats[playerId] = Date.now();

		// If this player was the one we're paused for and they came back, clear the pause
		if (room.disconnectPause && room.disconnectPause.playerId === playerId) {
			room.disconnectPause = null;
		}

		// If the original host returned, transfer host back to them
		if (
			playerId === room.originalHostId &&
			room.hostId !== playerId &&
			!room.kickedPlayerIds.includes(playerId)
		) {
			room.hostId = playerId;
		}
	}
}

export function getDisconnectedPlayerIds(room: Room): string[] {
	if (room.game.phase === "setup") return [];
	const now = Date.now();
	return room.game.players
		.filter((p) => !p.isEliminated)
		.filter((p) => {
			const lastSeen = room.playerHeartbeats[p.id];
			return !lastSeen || now - lastSeen > DISCONNECT_THRESHOLD;
		})
		.map((p) => p.id);
}

export function checkAndSetDisconnectPause(room: Room): void {
	if (room.game.phase === "setup" || room.game.phase === "game-over") return;

	const disconnectedIds = getDisconnectedPlayerIds(room);

	// If the currently paused player reconnected, clear pause
	if (room.disconnectPause && !disconnectedIds.includes(room.disconnectPause.playerId)) {
		room.disconnectPause = null;
	}

	// If the host is disconnected, transfer host to next connected player
	if (disconnectedIds.includes(room.hostId)) {
		const connectedPlayers = room.game.players.filter(
			(p) => !p.isEliminated && !disconnectedIds.includes(p.id)
		);
		if (connectedPlayers.length > 0) {
			room.hostId = connectedPlayers[0].id;
		}
	}

	// If no pause set yet and there's a new disconnect, set it
	if (!room.disconnectPause && disconnectedIds.length > 0) {
		const player = room.game.players.find((p) => p.id === disconnectedIds[0]);
		if (player) {
			room.disconnectPause = {
				playerId: player.id,
				playerName: player.name,
				hostDecision: "pending",
			};
		}
	}
}

export function setDisconnectWait(code: string, hostId: string, playerId: string): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (!room.disconnectPause || room.disconnectPause.playerId !== playerId) return null;

	room.disconnectPause.hostDecision = "waiting";
	room.lastActivity = Date.now();
	return room;
}

export function dismissDisconnectedPlayer(code: string, hostId: string, targetPlayerId: string): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;

	const targetPlayer = room.game.players.find((p) => p.id === targetPlayerId);
	if (!targetPlayer) return null;

	// During setup, just remove them
	if (room.game.phase === "setup") {
		room.game.players = room.game.players.filter((p) => p.id !== targetPlayerId);
		delete room.playerHeartbeats[targetPlayerId];
		room.kickedPlayerIds.push(targetPlayerId);
		if (targetPlayer) room.leftPlayerNames.push(targetPlayer.name.toLowerCase());
		if (room.disconnectPause?.playerId === targetPlayerId) room.disconnectPause = null;
		room.lastActivity = Date.now();
		return room;
	}

	// During game, eliminate the player and track as kicked
	room.kickedPlayerIds.push(targetPlayerId);
	if (targetPlayer) room.leftPlayerNames.push(targetPlayer.name.toLowerCase());
	room.game.players = room.game.players.map((p) =>
		p.id === targetPlayerId ? { ...p, isEliminated: true } : p
	);

	// Handle clue phase - if it was their turn, adjust
	if (room.game.phase === "clues" && room.game.textChatEnabled) {
		const activePlayers = room.game.players.filter((p) => !p.isEliminated);
		if (room.game.currentPlayerIndex >= activePlayers.length) {
			room.game.phase = "voting";
			room.game.currentPlayerIndex = 0;
		}
	}

	// Handle voting phase - check if all remaining votes are in
	if (room.game.phase === "voting") {
		const activePlayers = room.game.players.filter((p) => !p.isEliminated);
		if (activePlayers.every((p) => p.votedFor !== null)) {
			room.game = resolveRound(room.game);
		}
	}

	// Check game end conditions
	const remainingActive = room.game.players.filter((p) => !p.isEliminated);
	const remainingImpostors = remainingActive.filter((p) => p.role === "impostor");
	if (remainingImpostors.length === 0) {
		room.game.phase = "game-over";
		room.game.winner = "friends";
		room.game.players = applyBonuses(room.game.players, "friends");
	} else if (remainingActive.length <= 2) {
		room.game.phase = "game-over";
		room.game.winner = "impostor";
		room.game.players = applyBonuses(room.game.players, "impostor");
	}

	// Clear disconnect pause
	if (room.disconnectPause?.playerId === targetPlayerId) {
		room.disconnectPause = null;
	}

	room.lastActivity = Date.now();
	return room;
}

export function notifyPlayerLeft(code: string, playerId: string): void {
	const room = rooms.get(code.toUpperCase());
	if (!room) return;

	// Mark the player's heartbeat as very old to trigger disconnect detection
	if (room.playerHeartbeats[playerId]) {
		room.playerHeartbeats[playerId] = 0;
	}
}

// ─── Replay ─────────────────────────────────────────────────────────

export function replayRoom(code: string, hostId: string): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "game-over") return null;

	// Filter out kicked players before replay
	room.game.players = room.game.players.filter(
		(p) => !room.kickedPlayerIds.includes(p.id)
	);

	// Filter out players who voluntarily left
	room.game.players = room.game.players.filter(
		(p) => !room.voluntaryLeftPlayerNames.includes(p.name.toLowerCase())
	);

	// Filter out disconnected players (no heartbeat)
	const now = Date.now();
	room.game.players = room.game.players.filter((p) => {
		const lastSeen = room.playerHeartbeats[p.id];
		return lastSeen && now - lastSeen < DISCONNECT_THRESHOLD * 3;
	});

	room.game = replayGame(room.game);
	room.disconnectPause = null;

	// Add waiting list players
	for (const wp of room.waitingList) {
		if (room.game.players.length >= MAX_PLAYERS) break;
		if (room.game.players.some((p) => p.name.toLowerCase() === wp.name.toLowerCase())) continue;
		const newPlayer = createPlayer(wp.name);
		newPlayer.id = wp.id; // Keep waiting player's ID so their session works
		room.game.players.push(newPlayer);
		room.playerHeartbeats[newPlayer.id] = Date.now();
	}
	room.waitingList = [];

	// Reset tracking for new game
	room.kickedPlayerIds = [];
	room.leftPlayerNames = [];
	room.voluntaryLeftPlayerNames = [];
	room.originalPlayerIds = [];

	// Reset heartbeats for all remaining players
	room.game.players.forEach((p) => {
		room.playerHeartbeats[p.id] = now;
	});
	room.lastActivity = now;
	return room;
}

// ─── Room Verification ──────────────────────────────────────────────

export function isPlayerInRoom(code: string, playerId: string): boolean {
	const room = rooms.get(code.toUpperCase());
	if (!room) return false;
	return room.game.players.some((p) => p.id === playerId);
}

// ─── Voluntary Leave ────────────────────────────────────────────────

export function leaveRoomVoluntarily(code: string, playerId: string): void {
	const room = rooms.get(code.toUpperCase());
	if (!room) return;

	const player = room.game.players.find((p) => p.id === playerId);
	if (player) {
		room.voluntaryLeftPlayerNames.push(player.name.toLowerCase());
	}

	// If this player is the host, transfer host before they fully leave
	if (room.hostId === playerId) {
		const others = room.game.players.filter(
			(p) => p.id !== playerId && !p.isEliminated
		);
		if (others.length > 0) {
			room.hostId = others[0].id;
		}
	}

	// During setup, remove them entirely
	if (room.game.phase === "setup") {
		room.game.players = room.game.players.filter((p) => p.id !== playerId);
		delete room.playerHeartbeats[playerId];
		return;
	}

	// During active game, eliminate and handle phase adjustments
	if (room.game.phase !== "game-over") {
		room.game.players = room.game.players.map((p) =>
			p.id === playerId ? { ...p, isEliminated: true } : p
		);
		room.kickedPlayerIds.push(playerId);

		// Handle clue phase - if it was their turn, adjust
		if (room.game.phase === "clues" && room.game.textChatEnabled) {
			const activePlayers = room.game.players.filter((p) => !p.isEliminated);
			if (room.game.currentPlayerIndex >= activePlayers.length) {
				room.game.phase = "voting";
				room.game.currentPlayerIndex = 0;
			}
		}

		// Handle voting phase - check if all remaining votes are in
		if (room.game.phase === "voting") {
			const activePlayers = room.game.players.filter((p) => !p.isEliminated);
			if (activePlayers.every((p) => p.votedFor !== null)) {
				room.game = resolveRound(room.game);
			}
		}

		// Check game end conditions
		const remainingActive = room.game.players.filter((p) => !p.isEliminated);
		const remainingImpostors = remainingActive.filter((p) => p.role === "impostor");
		if (remainingImpostors.length === 0) {
			room.game.phase = "game-over";
			room.game.winner = "friends";
			room.game.players = applyBonuses(room.game.players, "friends");
		} else if (remainingActive.length <= 2) {
			room.game.phase = "game-over";
			room.game.winner = "impostor";
			room.game.players = applyBonuses(room.game.players, "impostor");
		}
	}

	// Clear disconnect pause if it was for this player
	if (room.disconnectPause?.playerId === playerId) {
		room.disconnectPause = null;
	}

	// Mark heartbeat as old
	if (room.playerHeartbeats[playerId]) {
		room.playerHeartbeats[playerId] = 0;
	}
}

// ─── Waiting List ───────────────────────────────────────────────────

export function leaveWaitingList(code: string, waitingPlayerId: string): void {
	const room = rooms.get(code.toUpperCase());
	if (!room) return;
	room.waitingList = room.waitingList.filter((w) => w.id !== waitingPlayerId);
}

export function isPlayerInWaitingList(code: string, waitingPlayerId: string): boolean {
	const room = rooms.get(code.toUpperCase());
	if (!room) return false;
	return room.waitingList.some((w) => w.id === waitingPlayerId);
}

export function getWaitingListPosition(code: string, waitingPlayerId: string): number {
	const room = rooms.get(code.toUpperCase());
	if (!room) return -1;
	const index = room.waitingList.findIndex((w) => w.id === waitingPlayerId);
	return index >= 0 ? index + 1 : -1;
}

// ─── End Game (force) ───────────────────────────────────────────────

export function endGameForAll(code: string, hostId: string): Room | null {
	const room = getRoom(code);
	if (!room || room.hostId !== hostId) return null;
	room.ended = true;
	room.lastActivity = Date.now();
	// Delete room after a short delay to allow clients to see the ended state
	setTimeout(() => {
		rooms.delete(code.toUpperCase());
	}, 10000);
	return room;
}
