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
const ROOM_TTL_SECONDS = 10 * 60;
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

async function loadRoom(code: string): Promise<Room | undefined> {
	const redis = await getRedisClient();
	const raw = await redis.get(getRoomKey(code));
	if (!raw) return undefined;

	try {
		const parsed = JSON.parse(raw) as Partial<Room>;
		if (!parsed || typeof parsed !== "object" || !parsed.game || !parsed.hostId || !parsed.code) {
			await redis.del(getRoomKey(code));
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
		await redis.del(getRoomKey(code));
		return undefined;
	}
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

export async function joinRoom(code: string, playerName: string): Promise<JoinRoomResult | null> {
	const room = await loadRoom(code);
	if (!room || room.ended) return null;

	const nameLower = getPlayerNameKey(playerName);
	const wasVoluntary = room.voluntaryLeftPlayerNames.includes(nameLower);
	const kickedPlayer = room.game.players.find((player) => player.name.toLowerCase() === nameLower && room.kickedPlayerIds.includes(player.id));
	if (kickedPlayer && !wasVoluntary) {
		return { type: "blocked", reason: "You were removed from this room" };
	}

	if (room.game.phase === "setup") {
		if (room.game.players.length >= MAX_PLAYERS) return null;
		if (room.game.players.some((player) => player.name.toLowerCase() === nameLower)) return null;

		const player = createPlayer(playerName);
		room.game.players.push(player);
		room.playerHeartbeats[player.id] = Date.now();
		await finalizeRoomUpdate(room);
		return { type: "joined", room, playerId: player.id };
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

			room.game.players = room.game.players.map((player) => (player.id === existingPlayer.id ? { ...player, isEliminated: false } : player));

			if (wasVoluntary) {
				room.voluntaryLeftPlayerNames = room.voluntaryLeftPlayerNames.filter((name) => name !== nameLower);
				room.kickedPlayerIds = room.kickedPlayerIds.filter((id) => id !== existingPlayer.id);
			}

			await finalizeRoomUpdate(room);
			return { type: "rejoined", room, playerId: existingPlayer.id };
		}
	}

	const alreadyWaiting = room.waitingList.find((waitingPlayer) => waitingPlayer.name.toLowerCase() === nameLower);
	if (alreadyWaiting) {
		return { type: "blocked", reason: "You are already on the waiting list for this room" };
	}

	if (room.waitingList.length + room.game.players.length >= MAX_PLAYERS) {
		return null;
	}

	const waitingPlayer: WaitingPlayer = {
		id: crypto.randomUUID(),
		name: playerName,
		joinedAt: Date.now(),
	};
	room.waitingList.push(waitingPlayer);
	await finalizeRoomUpdate(room);
	return { type: "waiting", room, waitingPlayerId: waitingPlayer.id, position: room.waitingList.length };
}

export async function startRoomGame(
	code: string,
	hostId: string,
	impostorHelp: boolean,
	textChatEnabled: boolean,
	impostorCount: number = 1,
	categorySelection?: GameCategorySelection,
	language: SupportedLanguage | string = "en",
): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.players.length < 3) return null;

	const requestedCategorySelection = categorySelection ?? room.game.selectedCategory;
	const resolvedCategorySelection = migrateCategorySelection(requestedCategorySelection);

	room.impostorHelp = impostorHelp;
	room.textChatEnabled = textChatEnabled;
	room.game.impostorHelp = impostorHelp;
	room.game.textChatEnabled = textChatEnabled;
	room.game.impostorCount = impostorCount;
	room.game.selectedCategory = resolvedCategorySelection;
	room.originalPlayerIds = room.game.players.map((player) => player.id);
	room.originalHostId = room.hostId;
	room.game = assignRoles(room.game, { language, categorySelection: resolvedCategorySelection });
	room.game.phase = "clues";
	return finalizeRoomUpdate(room);
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

export async function submitRoomClue(code: string, playerId: string, clue: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.game.phase !== "clues") return null;
	if (!room.game.textChatEnabled) return null;

	const activePlayers = getActivePlayersForClues(room.game);
	const currentPlayer = activePlayers[room.game.currentPlayerIndex];
	if (!currentPlayer || currentPlayer.id !== playerId) return null;

	room.game = submitClue(room.game, playerId, clue);
	return finalizeRoomUpdate(room);
}

export async function startRoomVoting(code: string, hostId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
	if (room.game.phase !== "clues") return null;
	if (room.game.textChatEnabled) return null;

	room.game.phase = "voting";
	return finalizeRoomUpdate(room);
}

export async function submitRoomVote(code: string, voterId: string, targetId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.game.phase !== "voting") return null;

	const voter = room.game.players.find((player) => player.id === voterId);
	const target = room.game.players.find((player) => player.id === targetId);
	if (!voter || voter.isEliminated) return null;
	if (!target || target.isEliminated) return null;
	if (voterId === targetId) return null;

	room.game = submitVote(room.game, voterId, targetId);
	if (allVotesIn(room.game)) {
		room.game = resolveRound(room.game);
	}

	return finalizeRoomUpdate(room);
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
	room.game.roundResults = [
		...room.game.roundResults,
		{
			round: room.game.currentRound,
			votes,
			eliminatedPlayer: eliminatedPlayerId,
			wasTie: false,
			impostorSurvived: eliminatedPlayer?.role !== "impostor",
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

		let room: Room;
		try {
			const parsed = JSON.parse(raw) as Partial<Room>;
			if (!parsed || typeof parsed !== "object" || !parsed.game || !parsed.hostId || !parsed.code) {
				const deleted = await redis.multi().del(key).exec();
				if (deleted === null) {
					continue;
				}
				return null;
			}

			room = {
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
			const deleted = await redis.multi().del(key).exec();
			if (deleted === null) {
				continue;
			}
			return null;
		}

		updateHeartbeat(room, playerId);
		checkAndSetDisconnectPause(room);
		room.lastActivity = Date.now();

		const execResult = await redis.multi().set(key, JSON.stringify(room), { EX: ROOM_TTL_SECONDS }).exec();
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
	return room.game.players
		.filter((player) => !player.isEliminated)
		.filter((player) => {
			const lastSeen = room.playerHeartbeats[player.id];
			return !lastSeen || now - lastSeen > DISCONNECT_THRESHOLD;
		})
		.map((player) => player.id);
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

	if (room.playerHeartbeats[playerId]) {
		room.playerHeartbeats[playerId] = 0;
		await finalizeRoomUpdate(room);
	}
}

export async function replayRoom(code: string, hostId: string): Promise<Room | null> {
	const room = await loadRoom(code);
	if (!room || room.hostId !== hostId) return null;
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

	return finalizeRoomUpdate(room);
}

export async function isPlayerInRoom(code: string, playerId: string): Promise<boolean> {
	const room = await loadRoom(code);
	if (!room) return false;
	return getPresentPlayers(room).some((player) => player.id === playerId);
}

export async function leaveRoomVoluntarily(code: string, playerId: string): Promise<void> {
	const room = await loadRoom(code);
	if (!room) return;

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
		await finalizeRoomUpdate(room);
		return;
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

	await finalizeRoomUpdate(room);
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

	room.ended = true;
	return finalizeRoomUpdate(room, ENDED_ROOM_TTL_SECONDS);
}
