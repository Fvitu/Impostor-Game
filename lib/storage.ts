// Local storage utility for game persistence

import type { GameState } from "@/lib/game-logic";

const STORAGE_KEYS = {
	PLAYER_NAME: "impostor_player_name",
	LOCAL_PLAYERS: "impostor_local_players",
	LOCAL_GAME_STATE: "impostor_local_game",
	ONLINE_SESSION: "impostor_online_session",
	RESULTS_GAME: "impostor_results_game",
	WAITING_SESSION: "impostor_waiting_session",
} as const;

// ─── Player Name (online) ───────────────────────────────────────────

export function getSavedPlayerName(): string {
	if (typeof window === "undefined") return "";
	return localStorage.getItem(STORAGE_KEYS.PLAYER_NAME) || "";
}

export function savePlayerName(name: string): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
}

// ─── Local Players (offline replay) ─────────────────────────────────

export function getSavedLocalPlayers(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const data = localStorage.getItem(STORAGE_KEYS.LOCAL_PLAYERS);
		return data ? JSON.parse(data) : [];
	} catch {
		return [];
	}
}

export function saveLocalPlayers(names: string[]): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.LOCAL_PLAYERS, JSON.stringify(names));
}

export function clearLocalPlayers(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.LOCAL_PLAYERS);
}

// ─── Local Game State (offline resume) ──────────────────────────────

interface LocalGameWrapper {
	state: GameState;
	savedAt: number;
}

export function getSavedLocalGameState(): GameState | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_GAME_STATE);
		if (!raw) return null;
		const wrapper: LocalGameWrapper = JSON.parse(raw);
		// Expire after 24 hours
		if (Date.now() - wrapper.savedAt > 24 * 60 * 60 * 1000) {
			clearLocalGameState();
			return null;
		}
		return wrapper.state;
	} catch {
		clearLocalGameState();
		return null;
	}
}

export function saveLocalGameState(gameState: GameState): void {
	if (typeof window === "undefined") return;
	const wrapper: LocalGameWrapper = { state: gameState, savedAt: Date.now() };
	localStorage.setItem(STORAGE_KEYS.LOCAL_GAME_STATE, JSON.stringify(wrapper));
}

export function clearLocalGameState(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.LOCAL_GAME_STATE);
}

// ─── Online Session ─────────────────────────────────────────────────

export interface OnlineSession {
	roomCode: string;
	playerId: string;
	isHost: boolean;
	playerName: string;
}

interface OnlineSessionWrapper {
	session: OnlineSession;
	savedAt: number;
}

export function getSavedOnlineSession(): OnlineSession | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.ONLINE_SESSION);
		if (!raw) return null;
		const wrapper: OnlineSessionWrapper = JSON.parse(raw);
		// Expire after 60 minutes of not being refreshed
		if (Date.now() - wrapper.savedAt > 60 * 60 * 1000) {
			clearOnlineSession();
			return null;
		}
		return wrapper.session;
	} catch {
		clearOnlineSession();
		return null;
	}
}

export function saveOnlineSession(session: OnlineSession): void {
	if (typeof window === "undefined") return;
	const wrapper: OnlineSessionWrapper = { session, savedAt: Date.now() };
	localStorage.setItem(STORAGE_KEYS.ONLINE_SESSION, JSON.stringify(wrapper));
}

export function refreshOnlineSession(): void {
	if (typeof window === "undefined") return;
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.ONLINE_SESSION);
		if (!raw) return;
		const wrapper: OnlineSessionWrapper = JSON.parse(raw);
		wrapper.savedAt = Date.now();
		localStorage.setItem(STORAGE_KEYS.ONLINE_SESSION, JSON.stringify(wrapper));
	} catch {
		// ignore
	}
}

export function clearOnlineSession(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.ONLINE_SESSION);
}

// ─── Results Game (for scoreboard display) ──────────────────────────

export function saveResultsGame(game: GameState): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(STORAGE_KEYS.RESULTS_GAME, JSON.stringify(game));
}

export function getResultsGame(): GameState | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.RESULTS_GAME);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		clearResultsGame();
		return null;
	}
}

export function clearResultsGame(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.RESULTS_GAME);
}

// ─── Waiting Session (waiting list for online rooms) ────────────────

export interface WaitingSession {
	roomCode: string;
	waitingPlayerId: string;
	playerName: string;
}

interface WaitingSessionWrapper {
	session: WaitingSession;
	savedAt: number;
}

export function saveWaitingSession(session: WaitingSession): void {
	if (typeof window === "undefined") return;
	const wrapper: WaitingSessionWrapper = { session, savedAt: Date.now() };
	localStorage.setItem(STORAGE_KEYS.WAITING_SESSION, JSON.stringify(wrapper));
}

export function getWaitingSession(): WaitingSession | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.WAITING_SESSION);
		if (!raw) return null;
		const wrapper: WaitingSessionWrapper = JSON.parse(raw);
		// Expire after 30 minutes
		if (Date.now() - wrapper.savedAt > 30 * 60 * 1000) {
			clearWaitingSession();
			return null;
		}
		return wrapper.session;
	} catch {
		clearWaitingSession();
		return null;
	}
}

export function clearWaitingSession(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem(STORAGE_KEYS.WAITING_SESSION);
}
