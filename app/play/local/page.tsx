"use client"

import { GameProvider } from "@/components/game/game-provider"
import { GameOrchestrator } from "@/components/game/game-orchestrator"

export default function LocalPlayPage() {
  return (
    <GameProvider mode="pass-and-play">
      <GameOrchestrator />
    </GameProvider>
  )
}
