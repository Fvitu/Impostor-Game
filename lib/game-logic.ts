// Complete game logic engine for The Impostor
import type { SupportedLanguage } from "@/lib/i18n";
import { DEFAULT_CATEGORY_SELECTION, isCategorySelection, pickRandomWord, type GameCategorySelection } from "@/lib/game-data";

export interface Player {
  id: string
  name: string
  role: "friend" | "impostor" | null
  isEliminated: boolean
  scores: number[]
  totalScore: number
  clues: string[]
  votedFor: string | null
}

export interface GameState {
	id: string;
	mode: "pass-and-play" | "online";
	phase: "setup" | "roles" | "clues" | "voting" | "resolution" | "game-over";
	players: Player[];
	roundPlayerOrder: string[];
	currentRound: number;
	secretWord: string;
	hint: string;
	category: string;
	categoryId: string;
	selectedCategory: GameCategorySelection;
	impostorHelp: boolean;
	textChatEnabled: boolean;
	individualVotingEnabled: boolean;
	impostorCount: number;
	currentPlayerIndex: number;
	roundResults: RoundResult[];
	winner: "friends" | "impostor" | null;
}

export interface RoundResult {
	round: number;
	votes: Record<string, string>;
	eliminatedPlayer: string | null;
	wasTie: boolean;
	impostorSurvived: boolean;
	// If this elimination was forced because the player left, was kicked, or disconnected
	// then `abandoned` is true and `abandonedRole` contains their role at the time.
	abandoned?: boolean;
	abandonedRole?: "impostor" | "friend" | null;
}

export const MAX_PLAYERS = 16;
export const MAX_IMPOSTORS = 4;

function generateId(): string {
	// AUDIT: Use crypto.randomUUID() instead of Math.random() to prevent ID guessing.
	// Player IDs serve as the sole authentication for game actions (voting, clue submission).
	return crypto.randomUUID();
}

export function createPlayer(name: string): Player {
  return {
    id: generateId(),
    name,
    role: null,
    isEliminated: false,
    scores: [],
    totalScore: 0,
    clues: [],
    votedFor: null,
  }
}

export function createGame(mode: "pass-and-play" | "online"): GameState {
  return {
		id: generateId(),
		mode,
		phase: "setup",
		players: [],
		roundPlayerOrder: [],
		currentRound: 1,
		secretWord: "",
		hint: "",
		category: "",
		categoryId: "",
		selectedCategory: DEFAULT_CATEGORY_SELECTION,
		impostorHelp: false,
		// Disable text chat by default for pass-and-play (offline) games.
		textChatEnabled: mode === "online",
		individualVotingEnabled: true,
		impostorCount: 1,
		currentPlayerIndex: 0,
		roundResults: [],
		winner: null,
  };
}

export function addPlayer(game: GameState, name: string): GameState {
	if (game.players.length >= MAX_PLAYERS) {
		return game;
	}
  const player = createPlayer(name)
  return { ...game, players: [...game.players, player] }
}

export function removePlayer(game: GameState, playerId: string): GameState {
  return { ...game, players: game.players.filter((p) => p.id !== playerId) }
}

interface AssignRolesOptions {
	language?: SupportedLanguage | string;
	categorySelection?: GameCategorySelection;
}

function createRoundPlayerOrder(players: Player[]): string[] {
	return shuffle(players.map((player) => player.id));
}

function getRoundOrderedActivePlayers(game: GameState): Player[] {
	const activePlayers = game.players.filter((player) => !player.isEliminated);
	if (activePlayers.length <= 1) {
		return activePlayers;
	}

	const activePlayersById = new Map(activePlayers.map((player) => [player.id, player]));
	const orderedPlayers: Player[] = [];
	const seenPlayerIds = new Set<string>();

	for (const playerId of game.roundPlayerOrder ?? []) {
		const player = activePlayersById.get(playerId);
		if (!player) {
			continue;
		}

		orderedPlayers.push(player);
		seenPlayerIds.add(playerId);
	}

	for (const player of activePlayers) {
		if (seenPlayerIds.has(player.id)) {
			continue;
		}

		orderedPlayers.push(player);
	}

	return orderedPlayers;
}

export function assignRoles(game: GameState, options: AssignRolesOptions = {}): GameState {
	const language = options.language ?? "en";
	const rawSelection = options.categorySelection ?? game.selectedCategory ?? DEFAULT_CATEGORY_SELECTION;
	const categorySelection = isCategorySelection(rawSelection) ? rawSelection : DEFAULT_CATEGORY_SELECTION;
	const selection = pickRandomWord(language, categorySelection);

	const activePlayers = game.players.filter((p) => !p.isEliminated);
	const maxAllowed = getMaxImpostorCount(activePlayers.length);
	const impostorCount = Math.min(game.impostorCount || 1, maxAllowed);
	const shuffledPlayerIds = shuffle(activePlayers.map((p) => p.id));
	const impostorIds = new Set(shuffledPlayerIds.slice(0, impostorCount));

	const updatedPlayers = game.players.map((player) => {
		if (player.isEliminated) return player;
		return {
			...player,
			role: impostorIds.has(player.id) ? ("impostor" as const) : ("friend" as const),
			votedFor: null,
			clues: [...player.clues],
		};
	});

	return {
		...game,
		phase: "roles",
		players: updatedPlayers,
		roundPlayerOrder: createRoundPlayerOrder(activePlayers),
		secretWord: selection.word,
		hint: selection.hint,
		category: selection.categoryLabel,
		categoryId: selection.categoryId,
		selectedCategory: categorySelection,
		currentPlayerIndex: 0,
	};
}

export function startCluePhase(game: GameState): GameState {
	const activePlayers = game.players.filter((player) => !player.isEliminated);
	const roundPlayerOrder = game.roundPlayerOrder.length === activePlayers.length ? game.roundPlayerOrder : createRoundPlayerOrder(activePlayers);

  return {
		...game,
		phase: game.textChatEnabled ? "clues" : "voting",
		roundPlayerOrder,
		currentPlayerIndex: 0,
  };
}

export function submitClue(game: GameState, playerId: string, clue: string): GameState {
  if (!game.textChatEnabled) {
		return game;
  }

	const activePlayers = getRoundOrderedActivePlayers(game);
  const currentActiveIndex = activePlayers.findIndex((p) => p.id === playerId)

  const updatedPlayers = game.players.map((p) => {
    if (p.id === playerId) {
      return { ...p, clues: [...p.clues, clue] }
    }
    return p
  })

  const nextActiveIndex = currentActiveIndex + 1
  const allCluesGiven = nextActiveIndex >= activePlayers.length

  return {
    ...game,
    players: updatedPlayers,
    currentPlayerIndex: allCluesGiven ? 0 : nextActiveIndex,
    phase: allCluesGiven ? "voting" : "clues",
  }
}

export function submitVote(game: GameState, voterId: string, targetId: string): GameState {
  if (game.phase !== "voting") {
		return game;
  }

  const voter = game.players.find((p) => p.id === voterId);
  const target = game.players.find((p) => p.id === targetId);

  if (!voter || voter.isEliminated) {
		return game;
  }

  if (!target || target.isEliminated) {
		return game;
  }

  if (voterId === targetId) {
		return game;
  }

  const updatedPlayers = game.players.map((p) => {
    if (p.id === voterId) {
      return { ...p, votedFor: targetId }
    }
    return p
  })

  return { ...game, players: updatedPlayers }
}

export function allVotesIn(game: GameState): boolean {
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  return activePlayers.every((p) => p.votedFor !== null)
}

export function resolveRound(game: GameState, forcedEliminatedPlayerId?: string): GameState {
	const activePlayers = game.players.filter((p) => !p.isEliminated);
	const impostorIds = game.players.filter((p) => p.role === "impostor").map((p) => p.id);
	if (impostorIds.length === 0) {
		return game;
	}

	let eliminatedPlayerId: string | null = null;
	let isTie = false;

	if (forcedEliminatedPlayerId) {
		const forcedTarget = activePlayers.find((p) => p.id === forcedEliminatedPlayerId);
		if (!forcedTarget) {
			return game;
		}
		eliminatedPlayerId = forcedTarget.id;
	} else {
		const voteCounts: Record<string, number> = {};
		activePlayers.forEach((p) => {
			if (p.votedFor) {
				voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
			}
		});

		const voteCountValues = Object.values(voteCounts);
		if (voteCountValues.length === 0) {
			isTie = true;
		} else {
			const maxVotes = Math.max(...voteCountValues);
			const playersWithMaxVotes = Object.entries(voteCounts).filter(([, count]) => count === maxVotes);
			isTie = playersWithMaxVotes.length > 1;
			if (!isTie) {
				eliminatedPlayerId = playersWithMaxVotes[0][0];
			}
		}
	}

	const impostorEliminatedThisRound = eliminatedPlayerId ? impostorIds.includes(eliminatedPlayerId) : false;
	const impostorSurvived = !impostorEliminatedThisRound;

	// Build votes record
	const votes: Record<string, string> = {};
	activePlayers.forEach((p) => {
		if (p.votedFor) votes[p.id] = p.votedFor;
	});

	const roundResult: RoundResult = {
		round: game.currentRound,
		votes,
		eliminatedPlayer: eliminatedPlayerId,
		wasTie: isTie,
		impostorSurvived,
	};

	// Calculate scores for this round
	let updatedPlayers = game.players.map((p) => {
		if (p.isEliminated) return p;
		const roundScore = calculateRoundScore(p, impostorIds, eliminatedPlayerId, isTie);
		const newScores = [...p.scores, roundScore];
		return {
			...p,
			scores: newScores,
			// Keep a cumulative score across matches while staying in the same room/session.
			totalScore: p.totalScore + roundScore,
			votedFor: null,
		};
	});

	// Eliminate player if no tie
	if (eliminatedPlayerId) {
		updatedPlayers = updatedPlayers.map((p) => {
			if (p.id === eliminatedPlayerId) {
				return { ...p, isEliminated: true };
			}
			return p;
		});
	}

	const roundResults = [...game.roundResults, roundResult];

	// Check game end conditions
	const remainingActivePlayers = updatedPlayers.filter((p) => !p.isEliminated).length;
	const remainingImpostors = updatedPlayers.filter((p) => p.role === "impostor" && !p.isEliminated).length;

	let gameOver = false;
	let winner: "friends" | "impostor" | null = null;

	if (remainingImpostors === 0) {
		gameOver = true;
		winner = "friends";
	} else if (remainingActivePlayers <= 2) {
		gameOver = true;
		winner = "impostor";
	}

	// Apply bonuses if game is over
	if (gameOver) {
		updatedPlayers = applyBonuses(updatedPlayers, winner!);
	}

	return {
		...game,
		players: updatedPlayers,
		roundResults,
		currentRound: gameOver ? game.currentRound : game.currentRound + 1,
		phase: gameOver ? "game-over" : "resolution",
		winner,
		currentPlayerIndex: 0,
	};
}

export function startNextRound(game: GameState): GameState {
	if (game.phase !== "resolution" || game.winner) {
		return game;
	}

	const activePlayers = game.players.filter((player) => !player.isEliminated);

	return {
		...game,
		phase: game.textChatEnabled ? "clues" : "voting",
		roundPlayerOrder: createRoundPlayerOrder(activePlayers),
		currentPlayerIndex: 0,
	};
}

function calculateRoundScore(player: Player, impostorIds: string[], eliminatedId: string | null, isTie: boolean): number {
	if (player.role === "impostor") {
		// Impostor gets +2 for surviving (tie or friend eliminated)
		return isTie || eliminatedId !== player.id ? 2 : 0;
	} else {
		// Friend gets +2 for voting an impostor
		return player.votedFor !== null && impostorIds.includes(player.votedFor) ? 2 : 0;
	}
}

export function applyBonuses(players: Player[], winner: "friends" | "impostor"): Player[] {
	return players.map((p) => {
		// Do not award match bonuses to players who were eliminated before
		// the end of the game — only survivors should receive the +10.
		if (p.isEliminated) {
			return p;
		}

		// Compute how much of the player's totalScore is already represented
		// by per-round `scores`. This helps us avoid re-applying the same
		// bonus multiple times (idempotency) and ensures the UI shows the
		// bonus by adding it to the last round's score.
		const scoresSum = p.scores.reduce((a, b) => a + b, 0);
		const implicitBonus = p.totalScore - scoresSum; // may be 0 or >=10 if bonus already applied

		const applyMatchBonus = (bonus: number) => {
			// If the implicitBonus already includes the match bonus, ensure
			// it's visible in the last score entry but don't change totalScore.
			if (implicitBonus >= bonus) {
				if (p.scores.length > 0) {
					const last = p.scores.length - 1;
					// If last score doesn't already include the bonus, add it.
					if (p.scores[last] < bonus) {
						const newScores = [...p.scores];
						newScores[last] = newScores[last] + bonus;
						return { ...p, scores: newScores };
					}
				} else {
					// totalScore already has the bonus but there are no per-round
					// scores; add a round entry to show it.
					return { ...p, scores: [...p.scores, bonus] };
				}
				return p;
			}

			// Otherwise, apply the bonus to both totalScore and the last round
			// score (or push a new round if none exists) so the UI reflects it.
			if (p.scores.length > 0) {
				const newScores = [...p.scores];
				const last = newScores.length - 1;
				newScores[last] = newScores[last] + bonus;
				return { ...p, scores: newScores, totalScore: p.totalScore + bonus };
			}
			return { ...p, scores: [...p.scores, bonus], totalScore: p.totalScore + bonus };
		};

		if (p.role === "impostor" && winner === "impostor") {
			return applyMatchBonus(10);
		} else if (p.role === "friend" && winner === "friends") {
			return applyMatchBonus(10);
		}

		return p;
	});
}

export function getActivePlayersForClues(game: GameState): Player[] {
	return getRoundOrderedActivePlayers(game);
}

export function getActivePlayersForVoting(game: GameState): Player[] {
	return getRoundOrderedActivePlayers(game);
}

export function getCurrentCluePlayer(game: GameState): Player | null {
  const active = getActivePlayersForClues(game)
  return active[game.currentPlayerIndex] ?? null
}

export function getRoundStarter(game: GameState): Player | null {
	return getRoundOrderedActivePlayers(game)[0] ?? null;
}

// NOTE: Room code space is limited (~31^5 = ~28M codes). The 20-attempt retry
// loop in room-store.ts provides collision handling for concurrent room creation.
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function getMaxImpostorCount(playerCount: number): number {
	if (playerCount <= 4) return 1;
	if (playerCount === 5) return 2;
	if (playerCount <= 7) return 3;
	return 4; // 8+
}

export function replayGame(game: GameState): GameState {
	const resetPlayers = game.players.map((p) => ({
		id: p.id,
		name: p.name,
		role: null as "friend" | "impostor" | null,
		isEliminated: false,
		scores: [],
		// Preserve cumulative score for players who stay in the same room/session.
		totalScore: p.totalScore,
		clues: [],
		votedFor: null,
	}));

	return {
		...createGame(game.mode),
		id: game.id,
		players: resetPlayers,
		hint: game.hint,
		selectedCategory: game.selectedCategory ?? DEFAULT_CATEGORY_SELECTION,
		impostorHelp: game.impostorHelp,
		textChatEnabled: game.textChatEnabled,
		individualVotingEnabled: game.individualVotingEnabled,
		impostorCount: game.impostorCount,
	};
}

function shuffle<T>(items: T[]): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const temp = result[i];
		result[i] = result[j];
		result[j] = temp;
	}
	return result;
}
