"use client"

import { useGame } from "./game-provider"
import { SetupPhase } from "./setup-phase"
import { RoleRevealPhase } from "./role-reveal-phase"
import { CluePhase } from "./clue-phase"
import { VotingPhase } from "./voting-phase"
import { ResolutionPhase } from "./resolution-phase"

export function GameOrchestrator() {
  const { game } = useGame()

  switch (game.phase) {
    case "setup":
      return <SetupPhase />
    case "roles":
      return <RoleRevealPhase />
    case "clues":
      return <CluePhase />
    case "voting":
      return <VotingPhase />
    case "resolution":
    case "game-over":
      return <ResolutionPhase />
    default:
      return <SetupPhase />
  }
}
