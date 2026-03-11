"use client"

import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import type { GameState } from "@/lib/game-logic"
import {
	createGame,
	addPlayer,
	removePlayer,
	assignRoles,
	startNextRound,
	startCluePhase,
	submitClue,
	submitVote,
	resolveRound,
	replayGame,
} from "@/lib/game-logic";
import { DEFAULT_CATEGORY_SELECTION, type GameCategorySelection } from "@/lib/game-data";
import { saveLocalGameState, clearLocalGameState, saveLocalPlayers } from "@/lib/storage";

type GameAction =
	| { type: "RESET"; mode: "pass-and-play" | "online" }
	| { type: "ADD_PLAYER"; name: string }
	| { type: "REMOVE_PLAYER"; playerId: string }
	| { type: "SET_IMPOSTOR_HELP"; help: boolean }
	| { type: "SET_TEXT_CHAT_ENABLED"; enabled: boolean }
	| { type: "SET_INDIVIDUAL_VOTING_ENABLED"; enabled: boolean }
	| { type: "SET_CATEGORY_SELECTION"; category: GameCategorySelection }
	| { type: "SET_IMPOSTOR_COUNT"; count: number }
	| { type: "START_GAME"; language?: string; categorySelection?: GameCategorySelection }
	| { type: "START_CLUES" }
	| { type: "START_VOTING" }
	| { type: "SUBMIT_CLUE"; playerId: string; clue: string }
	| { type: "SUBMIT_VOTE"; voterId: string; targetId: string }
	| { type: "ELIMINATE_PLAYER"; playerId: string }
	| { type: "RESOLVE_ROUND" }
	| { type: "NEXT_ROUND" }
	| { type: "SET_STATE"; state: GameState }
	| { type: "REPLAY" };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
		case "RESET":
			return createGame(action.mode);
		case "ADD_PLAYER":
			return addPlayer(state, action.name);
		case "REMOVE_PLAYER":
			return removePlayer(state, action.playerId);
		case "SET_IMPOSTOR_HELP":
			return { ...state, impostorHelp: action.help };
		case "SET_TEXT_CHAT_ENABLED":
			return { ...state, textChatEnabled: action.enabled };
		case "SET_INDIVIDUAL_VOTING_ENABLED":
			return { ...state, individualVotingEnabled: action.enabled };
		case "SET_CATEGORY_SELECTION":
			return { ...state, selectedCategory: action.category };
		case "SET_IMPOSTOR_COUNT":
			return { ...state, impostorCount: action.count };
		case "START_GAME":
			return assignRoles(state, {
				language: action.language,
				categorySelection: action.categorySelection ?? state.selectedCategory ?? DEFAULT_CATEGORY_SELECTION,
			});
		case "START_CLUES":
			return startCluePhase(state);
		case "START_VOTING":
			if (state.phase !== "clues") return state;
			return { ...state, phase: "voting" };
		case "SUBMIT_CLUE":
			return submitClue(state, action.playerId, action.clue);
		case "SUBMIT_VOTE":
			return submitVote(state, action.voterId, action.targetId);
		case "ELIMINATE_PLAYER":
			return resolveRound(state, action.playerId);
		case "RESOLVE_ROUND":
			return resolveRound(state);
		case "NEXT_ROUND":
			return startNextRound(state);
		case "SET_STATE":
			return action.state;
		case "REPLAY":
			return replayGame(state);
		default:
			return state;
  }
}

interface GameContextType {
  game: GameState
  dispatch: React.Dispatch<GameAction>
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children, mode, initialState }: { children: ReactNode; mode: "pass-and-play" | "online"; initialState?: GameState }) {
	const [game, dispatch] = useReducer(gameReducer, initialState ?? createGame(mode));

	// Persist local game state on every change (pass-and-play only)
	useEffect(() => {
		if (mode !== "pass-and-play") return;

		// Clear saved state when game is fully reset (no players left)
		if (game.phase === "setup" && game.players.length === 0) {
			clearLocalGameState();
			return;
		}

		// Save game state for resume
		saveLocalGameState(game);

		// Also save player names for replay recall
		if (game.players.length > 0) {
			saveLocalPlayers(game.players.map((p) => p.name));
		}
	}, [game, mode]);

	return <GameContext.Provider value={{ game, dispatch }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error("useGame must be used within a GameProvider")
  }
  return context
}
