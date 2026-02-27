"use client"

import { createContext, useContext, useReducer, type ReactNode } from "react"
import type { GameState } from "@/lib/game-logic"
import {
  createGame,
  addPlayer,
  removePlayer,
  assignRoles,
  startCluePhase,
  submitClue,
  submitVote,
  resolveRound,
} from "@/lib/game-logic"

type GameAction =
  | { type: "RESET"; mode: "pass-and-play" | "online" }
  | { type: "ADD_PLAYER"; name: string }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "SET_IMPOSTOR_HELP"; help: boolean }
  | { type: "START_GAME" }
  | { type: "START_CLUES" }
  | { type: "SUBMIT_CLUE"; playerId: string; clue: string }
  | { type: "SUBMIT_VOTE"; voterId: string; targetId: string }
  | { type: "RESOLVE_ROUND" }
  | { type: "NEXT_ROUND" }
  | { type: "SET_STATE"; state: GameState }

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "RESET":
      return createGame(action.mode)
    case "ADD_PLAYER":
      return addPlayer(state, action.name)
    case "REMOVE_PLAYER":
      return removePlayer(state, action.playerId)
    case "SET_IMPOSTOR_HELP":
      return { ...state, impostorHelp: action.help }
    case "START_GAME":
      return assignRoles(state)
    case "START_CLUES":
      return startCluePhase(state)
    case "SUBMIT_CLUE":
      return submitClue(state, action.playerId, action.clue)
    case "SUBMIT_VOTE":
      return submitVote(state, action.voterId, action.targetId)
    case "RESOLVE_ROUND":
      return resolveRound(state)
    case "NEXT_ROUND":
      return assignRoles(state)
    case "SET_STATE":
      return action.state
    default:
      return state
  }
}

interface GameContextType {
  game: GameState
  dispatch: React.Dispatch<GameAction>
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children, mode }: { children: ReactNode; mode: "pass-and-play" | "online" }) {
  const [game, dispatch] = useReducer(gameReducer, createGame(mode))

  return (
    <GameContext.Provider value={{ game, dispatch }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error("useGame must be used within a GameProvider")
  }
  return context
}
