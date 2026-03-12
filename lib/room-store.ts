import type { GameState } from "./game-logic";
import {
	MAX_PLAYERS,
	allVotesIn,
	applyBonuses,
	assignRoles,
	createGame,
	createPlayer,
	generateRoomCode,
	getActivePlayersForClues,
	getMaxImpostorCount,
	replayGame,
	resolveRound,
	startNextRound as startNextRoundState,
	submitClue,
	submitVote,
} from "./game-logic";
import { DEFAULT_CATEGORY_SELECTION, isCategorySelection, migrateCategorySelection, type GameCategorySelection } from "./game-data";
import type { SupportedLanguage } from "./i18n";
import { getRedisClient } from "./redis";

const DISCONNECT_THRESHOLD = 15_000;
// FIX: Room TTL increased to 30 minutes (configurable) so rooms survive
// brief disconnections and players have a reasonable reconnection window.
const ROOM_TTL_SECONDS = 30 * 60;
const ENDED_ROOM_TTL_SECONDS = 10;
const ROOM_KEY_PREFIX = "impostor:room:";
const ROOM_UPDATE_MAX_RETRIES = 5;

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

export type JoinRoomResult =
	| { type: "joined"; room: Room; playerId: string }
	| { type: "rejoined"; room: Room; playerId: string }
	| { type: "waiting"; room: Room; waitingPlayerId: string; position: number }
	| { type: "blocked"; reason: string };

function normalizeCode(code: string): string {
	return code.toUpperCase().trim();
}

function getRoomKey(code: string): string {
	return `${ROOM_KEY_PREFIX}${normalizeCode(code)}`;
}

function addUnique<T>(items: T[], value: T): void {
	if (!items.includes(value)) {
		items.push(value);
	}
}

function getPlayerNameKey(name: string): string {
	return name.toLowerCase();
}

function getPresentPlayers(room: Room) {
	return room.game.players.filter((player) => {
		const playerNameKey = getPlayerNameKey(player.name);
		return !room.kickedPlayerIds.includes(player.id) && !room.voluntaryLeftPlayerNames.includes(playerNameKey);
	});
}

function ensureHost(room: Room): void {
	if (room.game.players.some((player) => player.id === room.hostId)) {
		return;
	}

	const activePresentPlayers = getPresentPlayers(room).filter((player) => !player.isEliminated);
	if (activePresentPlayers.length > 0) {
		room.hostId = activePresentPlayers[0].id;
		return;
	}

	const presentPlayers = getPresentPlayers(room);
	if (presentPlayers.length > 0) {
		room.hostId = presentPlayers[0].id;
	}
}

function promoteWaitingPlayersIntoSetup(room: Room): void {
	if (room.game.phase !== "setup") return;

	while (room.game.players.length < MAX_PLAYERS && room.waitingList.length > 0) {
		const waitingPlayer = room.waitingList.shift();
		if (!waitingPlayer) break;

		const nameKey = getPlayerNameKey(waitingPlayer.name);
		if (room.game.players.some((player) => player.id === waitingPlayer.id || getPlayerNameKey(player.name) === nameKey)) {
			continue;
		}

		const player = createPlayer(waitingPlayer.name);
		player.id = waitingPlayer.id;
		room.game.players.push(player);
		room.playerHeartbeats[player.id] = Date.now();
	}
}

function shouldDeleteRoom(room: Room): boolean {
	return getPresentPlayers(room).length === 0 && room.waitingList.length === 0;
}

function parseRoom(raw: string): Room | undefined {
	try {
		const parsed = JSON.parse(raw) as Partial<Room>;
		if (!parsed || typeof parsed !== "object" || !parsed.game || !parsed.hostId || !parsed.code) {
			return undefined;
		}

		return {
			...parsed,
			code: normalizeCode(parsed.code),
			originalHostId: parsed.originalHostId ?? parsed.hostId,
			lastActivity: parsed.lastActivity ?? Date.now(),
			impostorHelp: parsed.impostorHelp ?? false,
			textChatEnabled: parsed.textChatEnabled ?? true,
			playerHeartbeats: parsed.playerHeartbeats ?? {},
			disconnectPause: parsed.disconnectPause ?? null,
			originalPlayerIds: parsed.originalPlayerIds ?? [],
			kickedPlayerIds: parsed.kickedPlayerIds ?? [],
			leftPlayerNames: parsed.leftPlayerNames ?? [],
			voluntaryLeftPlayerNames: parsed.voluntaryLeftPlayerNames ?? [],
			waitingList: parsed.waitingList ?? [],
			ended: parsed.ended ?? false,
		} as Room;
	} catch {
		return undefined;
	}
}

async function loadRoom(code: string): Promise<Room | undefined> {
	const redis = await getRedisClient();
	const raw = await redis.get(getRoomKey(code));
	if (!raw) return undefined;

	const room = parseRoom(raw);
	if (!room) {
		await redis.del(getRoomKey(code));
	}
	return room;
}

// FIX: Generic optimistic-locking update for room mutations that may race
// (e.g. two players voting simultaneously). Uses WATCH/MULTI/EXEC with retries.
async function updateRoomAtomically(code: string, mutate: (room: Room) => Room | null, ttlSeconds: number = ROOM_TTL_SECONDS): Promise<Room | null> {
	const redis = await getRedisClient();
	const key = getRoomKey(code);

	for (let attempt = 0; attempt < ROOM_UPDATE_MAX_RETRIES; attempt++) {
		await redis.watch(key);
		const raw = await redis.get(key);
		if (!raw) {
			await redis.unwatch();
			return null;
		}

		const room = parseRoom(raw);
		if (!room) {
			// Corrupted — try to clean up atomically
			let deleted;
			try {
				deleted = await redis.multi().del(key).exec();
			} catch (err: any) {
				if (String(err).includes("One (or more) of the watched keys has been changed")) {
					continue; // WATCH conflict, retry
				}
				throw err;
			}
			if (deleted === null) continue; // WATCH conflict, retry
			return null;
		}

		const updated = mutate(room);
		if (!updated) {
			// mutate signals the operation is invalid
			await redis.unwatch();
			return null;
		}

		// Apply common post-mutation logic
		promoteWaitingPlayersIntoSetup(updated);
		ensureHost(updated);

		if (shouldDeleteRoom(updated)) {
			let deleted;
			try {
				deleted = await redis.multi().del(key).exec();
			} catch (err: any) {
				if (String(err).includes("One (or more) of the watched keys has been changed")) {
					continue; // WATCH conflict, retry
				}
				throw err;
			}
			if (deleted === null) continue; // WATCH conflict, retry
			return null;
		}

		updated.lastActivity = Date.now();
		let execResult;
		try {
			execResult = await redis.multi().set(key, JSON.stringify(updated), { EX: ttlSeconds }).exec();
		} catch (err: any) {
			if (String(err).includes("One (or more) of the watched keys has been changed")) {
				continue; // WATCH conflict, retry
			}
			throw err;
		}
		if (execResult === null) {
			continue; // WATCH conflict, retry
		}

		return updated;
	}

	// All retries exhausted — fall back to non-atomic update
	const room = await loadRoom(code);
	if (!room) return null;
	const updated = mutate(room);
	if (!updated) return null;
	return finalizeRoomUpdate(updated, ttlSeconds);
}

export async function saveRoom(room: Room, ttlSeconds: number = ROOM_TTL_SECONDS): Promise<Room> {
	room.lastActivity = Date.now();
	const redis = await getRedisClient();
	await redis.set(getRoomKey(room.code), JSON.stringify(room), { EX: ttlSeconds });
	return room;
}

export async function deleteRoom(code: string): Promise<void> {
	const redis = await getRedisClient();
	await redis.del(getRoomKey(code));
}

export async function touchRoom(code: string, ttlSeconds: number = ROOM_TTL_SECONDS): Promise<void> {
	const redis = await getRedisClient();
	await redis.expire(getRoomKey(code), ttlSeconds);
}

async function finalizeRoomUpdate(room: Room, ttlSeconds: number = ROOM_TTL_SECONDS): Promise<Room | null> {
	promoteWaitingPlayersIntoSetup(room);
	ensureHost(room);

	if (shouldDeleteRoom(room)) {
		await deleteRoom(room.code);
		return null;
	}

	return saveRoom(room, ttlSeconds);
}

async function tryCreateRoom(room: Room): Promise<boolean> {
	const redis = await getRedisClient();
	const result = await redis.set(getRoomKey(room.code), JSON.stringify(room), { EX: ROOM_TTL_SECONDS, NX: true });
	return result === "OK";
}

function evaluateGameOver(room: Room): void {
	const remainingActive = room.game.players.filter((player) => !player.isEliminated);
	const remainingImpostors = remainingActive.filter((player) => player.role === "impostor");

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

export async function createRoom(hostName: string): Promise<{ room: Room; playerId: string }> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = generateRoomCode();
		const game = createGame("online");
		const host = createPlayer(hostName);
		game.players.push(host);

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

		if (await tryCreateRoom(room)) {
			return { room, playerId: host.id };
		}
	}

	throw new Error("Failed to generate a unique room code");
}

export async function getRoom(code: string): Promise<Room | undefined> {
	return loadRoom(code);
}

// AUDIT: Refactored to use updateRoomAtomically to prevent race condition
// where two players joining simultaneously could exceed MAX_PLAYERS via
// non-atomic read-modify-write. Uses a closure variable to capture the
// result type since the mutate callback can only return Room | null.
export async function joinRoom(code: string, playerName: string): Promise<JoinRoomResult | null> {
	let joinResult: JoinRoomResult | null = null;

	const updatedRoom = await updateRoomAtomically(code, (room) => {
		if (room.ended) {
			joinResult = null;
			return null;
		}

		const nameLower = getPlayerNameKey(playerName);
		const wasVoluntary = room.voluntaryLeftPlayerNames.includes(nameLower);
		const kickedPlayer = room.game.players.find((player) => player.name.toLowerCase() === nameLower && room.kickedPlayerIds.includes(player.id));
		if (kickedPlayer && !wasVoluntary) {
			joinResult = { type: "blocked", reason: "You were removed from this room" };
			return null;
		}

		if (room.game.phase === "setup") {
			if (room.game.players.length >= MAX_PLAYERS) {
				joinResult = null;
				return null;
			}
			if (room.game.players.some((player) => player.name.toLowerCase() === nameLower)) {
				joinResult = null;
				return null;
			}

			const player = createPlayer(playerName);
			room.game.players.push(player);
			room.playerHeartbeats[player.id] = Date.now();
			joinResult = { type: "joined", room, playerId: player.id };
			return room;
		}

		const existingPlayer = room.game.players.find((player) => player.name.toLowerCase() === nameLower);
		if (existingPlayer) {
			const isOriginal = room.originalPlayerIds.includes(existingPlayer.id);

			if ((isOriginal || wasVoluntary) && (wasVoluntary || !room.kickedPlayerIds.includes(existingPlayer.id))) {
				room.playerHeartbeats[existingPlayer.id] = Date.now();

				if (existingPlayer.id === room.originalHostId && room.hostId !== existingPlayer.id) {
					room.hostId = existingPlayer.id;
				}

				if (room.disconnectPause?.playerId === existingPlayer.id) {
					room.disconnectPause = null;
				}

				// FIX: Only un-eliminate the player if they voluntarily left.
				// Players who were properly voted out during gameplay should stay eliminated
				// to preserve game integrity. Disconnect-reconnect players keep their state
				// (role, score, clues) intact — only the heartbeat is refreshed.
				if (wasVoluntary) {
					room.game.players = room.game.players.map((player) => (player.id === existingPlayer.id ? { ...player, isEliminated: false } : player));
				}

				if (wasVoluntary) {
					room.voluntaryLeftPlayerNames = room.voluntaryLeftPlayerNames.filter((name) => name !== nameLower);
					room.kickedPlayerIds = room.kickedPlayerIds.filter((id) => id !== existingPlayer.id);
				}

				joinResult = { type: "rejoined", room, playerId: existingPlayer.id };
				return room;
			}
		}

		// Non-setup phase: game in progress.
		// New players cannot join the active game but can join the waiting list.
		const alreadyWaiting = room.waitingList.find((waitingPlayer) => waitingPlayer.name.toLowerCase() === nameLower);
		if (alreadyWaiting) {
			joinResult = { type: "blocked", reason: "You are already on the waiting list for this room" };
			return null;
		}

		if (room.waitingList.length + room.game.players.length >= MAX_PLAYERS) {
			joinResult = null;
			return null;
		}

		const waitingPlayer: WaitingPlayer = {
			id: crypto.randomUUID(),
			name: playerName,
			joinedAt: Date.now(),
		};
		room.waitingList.push(waitingPlayer);
		joinResult = { type: "waiting", room, waitingPlayerId: waitingPlayer.id, position: room.waitingList.length };
		return room;
	});

	// If updateRoomAtomically returned null and joinResult is still null,
	// the room wasn't found (or ended/full)
	if (!updatedRoom && !joinResult) return null;

	return joinResult;
}

// AUDIT: Refactored to use updateRoomAtomically to prevent race condition
// where concurrent startRoomGame calls could corrupt state via non-atomic
// read-modify-write.
export async function startRoomGame(
	code: string,
	hostId: string,
	impostorHelp: boolean,
	textChatEnabled: boolean,
	impostorCount: number = 1,
	categorySelection?: GameCategorySelection,
	language: SupportedLanguage | string = "en",
): Promise<Room | null> {
	return updateRoomAtomically(code, (room) => {
		if (room.hostId !== hostId) return null;
		if (room.game.players.length < 3) return null;

		// AUDIT: Validate impostorCount bounds — clamp to [1, maxAllowed].
		// Without Math.max(1, ...), a negative impostorCount would pass through
		// Math.min and result in zero impostors being assigned.
		const maxImpostors = getMaxImpostorCount(room.game.players.length);
		const validImpostorCount = Math.max(1, Math.min(maxImpostors, Math.floor(impostorCount)));

		const requestedCategorySelection = categorySelection ?? room.game.selectedCategory;
		const resolvedCategorySelection = migrateCategorySelection(requestedCategorySelection);

		room.impostorHelp = impostorHelp;
		room.textChatEnabled = textChatEnabled;
		room.game.impostorHelp = impostorHelp;
		room.game.textChatEnabled = textChatEnabled;
		room.game.impostorCount = validImpostorCount;
		room.game.selectedCategory = resolvedCategorySelection;
		room.originalPlayerIds = room.game.players.map((player) => player.id);
		room.originalHostId = room.hostId;
		room.game = assignRoles(room.game, { language, categorySelection: resolvedCategorySelection });
		room.game.phase = "clues";
		return room;
	});
}

export async function updateRoomSettings(
	code: string,
	hostId: string,
	settings: { impostorHelp?: boolean; textChatEnabled?: boolean; impostorCount?: number; categorySelection?: unknown },
): Promise<Room | null> {
	const room = await loadRoom(code);
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
		const maxImpostors = getMaxImpostorCount(room.game.players.length);
		room.game.impostorCount = Math.max(1, Math.min(maxImpostors, Math.floor(settings.impostorCount)));
	}

	if (settings.categorySelection !== undefined) {
		room.game.selectedCategory = migrateCategorySelection(settings.categorySelection);
	}

	return finalizeRoomUpdate(room);
}

// FIX: Use atomic update for clue submission to prevent potential race
// with heartbeat updates modifying the same room concurrently.
export async function submitRoomClue(code: string, playerId: string, clue: string): Promise<Room | null> {
	return updateRoomAtomically(code, (room) => {
		if (room.game.phase !== "clues") return null;
		if (!room.game.textChatEnabled) return null;

		const activePlayers = getActivePlayersForClues(room.game);
		const currentPlayer = activePlayers[room.game.currentPlayerIndex];
		if (!currentPlayer || currentPlayer.id !== playerId) return null;

		room.game = submitClue(room.game, playerId, clue);
		return room;
	});
}

export async function startRoomVoting(code: string, hostId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "clues") return null;
	if (room.game.textChatEnabled) return null;

	room.game.phase = "voting";
	return finalizeRoomUpdate(room);
}

// FIX: Use atomic update for voting to prevent race conditions when
// two players submit votes simultaneously (concurrent read-modify-write).
export async function submitRoomVote(code: string, voterId: string, targetId: string): Promise<Room | null> {
	return updateRoomAtomically(code, (room) => {
		if (room.game.phase !== "voting") return null;

		const voter = room.game.players.find((player) => player.id === voterId);
		const target = room.game.players.find((player) => player.id === targetId);
		if (!voter || voter.isEliminated) return null;
		if (!target || target.isEliminated) return null;
		if (voterId === targetId) return null;

		room.game = submitVote(room.game, voterId, targetId);
		if (allVotesIn(room.game)) {
			room.game = resolveRound(room.game);
		}

		return room;
	});
}

export async function startNextRound(code: string, hostId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "resolution") return null;

	room.game = startNextRoundState(room.game);
	return finalizeRoomUpdate(room);
}

export async function removePlayerFromRoom(code: string, hostId: string, playerId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "setup") return null;

	const targetPlayer = room.game.players.find((player) => player.id === playerId);
	room.game.players = room.game.players.filter((player) => player.id !== playerId);
	delete room.playerHeartbeats[playerId];
	addUnique(room.kickedPlayerIds, playerId);
	if (targetPlayer) {
		addUnique(room.leftPlayerNames, getPlayerNameKey(targetPlayer.name));
	}
	return finalizeRoomUpdate(room);
}

export function updateHeartbeat(room: Room, playerId: string): void {
	if (!room.game.players.some((player) => player.id === playerId)) return;
	// FIX: Don't update heartbeats for kicked players — this prevents ghost
	// players from staying "alive" in the heartbeat map after being removed.
	if (room.kickedPlayerIds.includes(playerId)) return;

	room.playerHeartbeats[playerId] = Date.now();

	if (room.disconnectPause?.playerId === playerId) {
		room.disconnectPause = null;
	}

	if (playerId === room.originalHostId && room.hostId !== playerId && !room.kickedPlayerIds.includes(playerId)) {
		room.hostId = playerId;
	}
}

function ensureForcedEliminationResult(room: Room, eliminatedPlayerId: string): void {
	if (room.game.phase !== "game-over") {
		return;
	}

	const lastResult = room.game.roundResults[room.game.roundResults.length - 1];
	if (lastResult?.round === room.game.currentRound) {
		return;
	}

	const votes: Record<string, string> = {};
	for (const player of room.game.players) {
		if (player.votedFor) {
			votes[player.id] = player.votedFor;
		}
	}

	const eliminatedPlayer = room.game.players.find((player) => player.id === eliminatedPlayerId);

	// Detect whether the elimination was due to voluntary leave, kick, or disconnect
	const nameKey = eliminatedPlayer ? getPlayerNameKey(eliminatedPlayer.name) : null;
	const wasVoluntary = nameKey ? room.voluntaryLeftPlayerNames.includes(nameKey) : false;
	const wasKicked = room.kickedPlayerIds.includes(eliminatedPlayerId);
	const wasDisconnected = room.playerHeartbeats[eliminatedPlayerId] === 0;
	const abandoned = wasVoluntary || wasKicked || wasDisconnected;

	room.game.roundResults = [
		...room.game.roundResults,
		{
			round: room.game.currentRound,
			votes,
			eliminatedPlayer: eliminatedPlayerId,
			wasTie: false,
			impostorSurvived: eliminatedPlayer?.role !== "impostor",
			abandoned: abandoned || undefined,
			abandonedRole: eliminatedPlayer ? (eliminatedPlayer.role as "impostor" | "friend") : null,
		},
	];
}

export async function updateRoomHeartbeat(code: string, playerId: string): Promise<Room | null> {
	const redis = await getRedisClient();
	const key = getRoomKey(code);

	for (let attempt = 0; attempt < ROOM_UPDATE_MAX_RETRIES; attempt++) {
		await redis.watch(key);
		const raw = await redis.get(key);
		if (!raw) {
			await redis.unwatch();
			return null;
		}

		const room = parseRoom(raw);
		if (!room) {
			let deleted;
			try {
				deleted = await redis.multi().del(key).exec();
			} catch (err: any) {
				if (String(err).includes("One (or more) of the watched keys has been changed")) {
					continue;
				}
				throw err;
			}
			if (deleted === null) continue;
			return null;
		}

		updateHeartbeat(room, playerId);
		checkAndSetDisconnectPause(room);
		room.lastActivity = Date.now();

		let execResult;
		try {
			execResult = await redis.multi().set(key, JSON.stringify(room), { EX: ROOM_TTL_SECONDS }).exec();
		} catch (err: any) {
			if (String(err).includes("One (or more) of the watched keys has been changed")) {
				continue;
			}
			throw err;
		}
		if (execResult === null) {
			continue;
		}

		return room;
	}

	throw new Error("Failed to update room heartbeat");
}

export function getDisconnectedPlayerIds(room: Room): string[] {
	if (room.game.phase === "setup") return [];
	const now = Date.now();
	return (
		room.game.players
			.filter((player) => !player.isEliminated)
			// FIX: Exclude kicked and voluntarily-left players from disconnect detection.
			// These players remain in the array (for scoreboard) but should not trigger
			// disconnect pauses or be treated as ghost players.
			.filter((player) => !room.kickedPlayerIds.includes(player.id))
			.filter((player) => !room.voluntaryLeftPlayerNames.includes(getPlayerNameKey(player.name)))
			.filter((player) => {
				const lastSeen = room.playerHeartbeats[player.id];
				return !lastSeen || now - lastSeen > DISCONNECT_THRESHOLD;
			})
			.map((player) => player.id)
	);
}

export function checkAndSetDisconnectPause(room: Room): void {
	if (room.game.phase === "setup" || room.game.phase === "game-over") return;

	const disconnectedIds = getDisconnectedPlayerIds(room);

	if (room.disconnectPause && !disconnectedIds.includes(room.disconnectPause.playerId)) {
		room.disconnectPause = null;
	}

	if (disconnectedIds.includes(room.hostId)) {
		const connectedPlayers = room.game.players.filter((player) => !player.isEliminated && !disconnectedIds.includes(player.id));
		if (connectedPlayers.length > 0) {
			room.hostId = connectedPlayers[0].id;
		}
	}

	if (!room.disconnectPause && disconnectedIds.length > 0) {
		const player = room.game.players.find((candidate) => candidate.id === disconnectedIds[0]);
		if (player) {
			room.disconnectPause = {
				playerId: player.id,
				playerName: player.name,
				hostDecision: "pending",
			};
		}
	}
}

export async function setDisconnectWait(code: string, hostId: string, playerId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (!room.disconnectPause || room.disconnectPause.playerId !== playerId) return null;

	room.disconnectPause.hostDecision = "waiting";
	return finalizeRoomUpdate(room);
}

export async function dismissDisconnectedPlayer(code: string, hostId: string, targetPlayerId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;

	const targetPlayer = room.game.players.find((player) => player.id === targetPlayerId);
	if (!targetPlayer) return null;

	if (room.game.phase === "setup") {
		room.game.players = room.game.players.filter((player) => player.id !== targetPlayerId);
		delete room.playerHeartbeats[targetPlayerId];
		addUnique(room.kickedPlayerIds, targetPlayerId);
		addUnique(room.leftPlayerNames, getPlayerNameKey(targetPlayer.name));
		if (room.disconnectPause?.playerId === targetPlayerId) {
			room.disconnectPause = null;
		}
		return finalizeRoomUpdate(room);
	}

	addUnique(room.kickedPlayerIds, targetPlayerId);
	addUnique(room.leftPlayerNames, getPlayerNameKey(targetPlayer.name));
	room.game.players = room.game.players.map((player) => (player.id === targetPlayerId ? { ...player, isEliminated: true } : player));

	if (room.game.phase === "clues" && room.game.textChatEnabled) {
		const activePlayers = getActivePlayersForClues(room.game);
		if (room.game.currentPlayerIndex >= activePlayers.length) {
			room.game.phase = "voting";
			room.game.currentPlayerIndex = 0;
		}
	}

	if (room.game.phase === "voting") {
		const activePlayers = room.game.players.filter((player) => !player.isEliminated);
		if (activePlayers.every((player) => player.votedFor !== null)) {
			room.game = resolveRound(room.game);
		}
	}

	evaluateGameOver(room);
	ensureForcedEliminationResult(room, targetPlayerId);

	if (room.disconnectPause?.playerId === targetPlayerId) {
		room.disconnectPause = null;
	}

	return finalizeRoomUpdate(room);
}

export async function notifyPlayerLeft(code: string, playerId: string): Promise<void> {
	const room = await loadRoom(code);
	if (!room) return;

	// If the player leaves during setup (e.g. closed tab), treat as a voluntary leave
	// and remove them from the players list so they don't remain as a "ghost".
	const player = room.game.players.find((p) => p.id === playerId);
	if (room.game.phase === "setup") {
		if (player) {
			addUnique(room.voluntaryLeftPlayerNames, getPlayerNameKey(player.name));
		}

		if (room.hostId === playerId) {
			const others = room.game.players.filter((candidate) => candidate.id !== playerId && !candidate.isEliminated);
			if (others.length > 0) {
				room.hostId = others[0].id;
			}
		}

		room.game.players = room.game.players.filter((candidate) => candidate.id !== playerId);
		delete room.playerHeartbeats[playerId];
		await finalizeRoomUpdate(room);
		return;
	}

	// Fallback: mark heartbeat as zero so disconnect handling can pick it up
	if (room.playerHeartbeats[playerId]) {
		room.playerHeartbeats[playerId] = 0;
		await finalizeRoomUpdate(room);
	}
}

// AUDIT: Refactored to use updateRoomAtomically to prevent race condition
// where concurrent replay requests could corrupt state via non-atomic
// read-modify-write.
export async function replayRoom(code: string, hostId: string): Promise<Room | null> {
	return updateRoomAtomically(code, (room) => {
		if (room.hostId !== hostId) return null;
		if (room.game.phase !== "game-over") return null;

		room.game.players = room.game.players.filter((player) => !room.kickedPlayerIds.includes(player.id));
		room.game.players = room.game.players.filter((player) => !room.voluntaryLeftPlayerNames.includes(player.name.toLowerCase()));

		const now = Date.now();
		room.game.players = room.game.players.filter((player) => {
			const lastSeen = room.playerHeartbeats[player.id];
			return Boolean(lastSeen) && now - lastSeen < DISCONNECT_THRESHOLD * 3;
		});

		room.game = replayGame(room.game);
		room.disconnectPause = null;

		for (const waitingPlayer of room.waitingList) {
			if (room.game.players.length >= MAX_PLAYERS) break;
			if (room.game.players.some((player) => player.name.toLowerCase() === waitingPlayer.name.toLowerCase())) continue;
			const newPlayer = createPlayer(waitingPlayer.name);
			newPlayer.id = waitingPlayer.id;
			room.game.players.push(newPlayer);
			room.playerHeartbeats[newPlayer.id] = Date.now();
		}
		room.waitingList = [];

		room.kickedPlayerIds = [];
		room.leftPlayerNames = [];
		room.voluntaryLeftPlayerNames = [];
		room.originalPlayerIds = [];

		room.game.players.forEach((player) => {
			room.playerHeartbeats[player.id] = now;
		});

		return room;
	});
}

export async function isPlayerInRoom(code: string, playerId: string): Promise<boolean> {
	const room = await loadRoom(code);
	if (!room) return false;
	return getPresentPlayers(room).some((player) => player.id === playerId);
}

// AUDIT: Refactored to use updateRoomAtomically to prevent race condition
// where two concurrent leave requests could corrupt room state via
// non-atomic read-modify-write.
export async function leaveRoomVoluntarily(code: string, playerId: string): Promise<void> {
	await updateRoomAtomically(code, (room) => {
		const player = room.game.players.find((candidate) => candidate.id === playerId);
		if (player) {
			addUnique(room.voluntaryLeftPlayerNames, getPlayerNameKey(player.name));
		}

		if (room.hostId === playerId) {
			const others = room.game.players.filter((candidate) => candidate.id !== playerId && !candidate.isEliminated);
			if (others.length > 0) {
				room.hostId = others[0].id;
			}
		}

		if (room.game.phase === "setup") {
			room.game.players = room.game.players.filter((candidate) => candidate.id !== playerId);
			delete room.playerHeartbeats[playerId];
			return room;
		}

		if (room.game.phase !== "game-over") {
			room.game.players = room.game.players.map((candidate) => (candidate.id === playerId ? { ...candidate, isEliminated: true } : candidate));

			if (room.game.phase === "clues" && room.game.textChatEnabled) {
				const activePlayers = getActivePlayersForClues(room.game);
				if (room.game.currentPlayerIndex >= activePlayers.length) {
					room.game.phase = "voting";
					room.game.currentPlayerIndex = 0;
				}
			}

			if (room.game.phase === "voting") {
				const activePlayers = room.game.players.filter((candidate) => !candidate.isEliminated);
				if (activePlayers.every((candidate) => candidate.votedFor !== null)) {
					room.game = resolveRound(room.game);
				}
			}

			evaluateGameOver(room);
			ensureForcedEliminationResult(room, playerId);
		}

		if (room.disconnectPause?.playerId === playerId) {
			room.disconnectPause = null;
		}

		if (room.playerHeartbeats[playerId]) {
			room.playerHeartbeats[playerId] = 0;
		}

		return room;
	});
}

export async function leaveWaitingList(code: string, waitingPlayerId: string): Promise<void> {
	const room = await loadRoom(code);
	if (!room) return;

	room.waitingList = room.waitingList.filter((waitingPlayer) => waitingPlayer.id !== waitingPlayerId);
	await finalizeRoomUpdate(room);
}

export async function isPlayerInWaitingList(code: string, waitingPlayerId: string): Promise<boolean> {
	const room = await loadRoom(code);
	if (!room) return false;
	return room.waitingList.some((waitingPlayer) => waitingPlayer.id === waitingPlayerId);
}

export async function getWaitingListPosition(code: string, waitingPlayerId: string): Promise<number> {
	const room = await loadRoom(code);
	if (!room) return -1;
	const index = room.waitingList.findIndex((waitingPlayer) => waitingPlayer.id === waitingPlayerId);
	return index >= 0 ? index + 1 : -1;
}

export async function endGameForAll(code: string, hostId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;

	// Mark the room as ended and mark all current players as kicked so
	// their next heartbeat/polling call will receive a 410 and clear
	// their session immediately.
	room.ended = true;
	const playerIds = room.game.players.map((p) => p.id);
	for (const id of playerIds) {
		addUnique(room.kickedPlayerIds, id);
	}
	return finalizeRoomUpdate(room, ENDED_ROOM_TTL_SECONDS);
}
