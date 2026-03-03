"use client"

import { useState, useCallback } from "react"
import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, ChevronRight } from "lucide-react"
import Link from "next/link"
import { GameNavbar } from "@/components/game/game-navbar"

export function RoleRevealPhase() {

  const { game, dispatch } = useGame()
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [canAdvance, setCanAdvance] = useState(false)
  const [holdTimeout, setHoldTimeout] = useState<NodeJS.Timeout | null>(null)

  const currentPlayer = activePlayers[currentIndex]

  const handlePointerDown = () => {
    setIsHolding(true)
    setIsRevealed(true)
    setHoldTimeout(
      setTimeout(() => {
        setCanAdvance(true)
      }, 500)
    )
  }

  const handlePointerUp = () => {
    setIsHolding(false)
    setIsRevealed(false)
    if (holdTimeout) {
      clearTimeout(holdTimeout)
      setHoldTimeout(null)
    }
  }

  const handlePointerLeave = () => {
    setIsHolding(false)
    setIsRevealed(false)
    if (holdTimeout) {
      clearTimeout(holdTimeout)
      setHoldTimeout(null)
    }
  }

  const handleRevealAgain = () => {
    setIsRevealed(true)
  }

  const handleHideAgain = () => {
    setIsRevealed(false)
  }

  const handleNext = () => {
    setIsRevealed(false)
    setIsHolding(false)
    setCanAdvance(false)
    if (currentIndex + 1 < activePlayers.length) {
      setCurrentIndex(currentIndex + 1)
    } else {
      dispatch({ type: "START_CLUES" })
    }
  }

  if (!currentPlayer) return null

  // Use shared navbar
  const Header = (
    <GameNavbar
      backHref="/"
      title={`Player ${currentIndex + 1} of ${activePlayers.length}`}
      subtitle={"Round " + game.currentRound + " of " + game.maxRounds}
      round={game.currentRound}
      maxRounds={game.maxRounds}
    />
  )

  const isImpostor = currentPlayer.role === "impostor"

  return (
    <div className="min-h-dvh flex flex-col">
      {Header}
      <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
        <div className="w-full max-w-sm mx-auto text-center flex flex-col justify-center gap-4 py-4">
            {/* Round indicator */}
            <div className="mb-4">
              <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-1">
                {"Round "}
                {game.currentRound}
                {" of "}
                {game.maxRounds}
              </p>
              <p className="text-sm text-muted-foreground">
                {"Player "}
                {currentIndex + 1}
                {" of "}
                {activePlayers.length}
              </p>
            </div>

            {/* Player Name */}
            <h2 className="text-2xl font-bold text-foreground mb-1">
              {currentPlayer.name}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Pass the device to this player
            </p>

            {/* Role Card */}
            <div
              className={`relative rounded-2xl border-2 p-6 mb-6 transition-all duration-300 min-h-[220px] flex flex-col justify-center ${
                isRevealed
                  ? isImpostor
                    ? "border-primary bg-primary/10"
                    : "border-success bg-success/10"
                  : "border-border bg-card"
              }`}
            >
              {/* Render ambos bloques, pero solo uno visible */}
              <div style={{display: isRevealed ? 'block' : 'none'}}>
                <p className="text-xs font-mono tracking-widest uppercase mb-3 text-muted-foreground">
                  Your Role
                </p>
                <p
                  className={`text-2xl font-bold mb-4 ${
                    isImpostor ? "text-primary" : "text-success"
                  }`}
                >
                  {isImpostor ? "The Impostor" : "Friend"}
                </p>
                {isImpostor ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      You do NOT know the secret word.
                    </p>
                    {game.impostorHelp && (
                      <div className="mt-3 rounded-lg bg-secondary/50 px-4 py-3">
                        <p className="text-xs text-muted-foreground mb-1">Category Hint</p>
                        <p className="text-lg font-bold text-foreground">{game.category}</p>
                      </div>
                    )}
                    {!game.impostorHelp && (
                      <p className="text-xs text-muted-foreground italic">
                        No hints enabled for this game.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">The Secret Word</p>
                    <p className="text-3xl font-bold text-foreground">{game.secretWord}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {"Category: "}
                      {game.category}
                    </p>
                  </div>
                )}
              </div>
              <div style={{display: isRevealed ? 'none' : 'block'}}>
                <EyeOff className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  Hold the button below to see your role
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-3">
              <Button
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                size="lg"
                className="w-full h-14 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80 select-none touch-none"
              >
                <Eye className="h-5 w-5 mr-2" />
                Hold to Reveal
              </Button>
              <Button
                onClick={handleNext}
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
                disabled={!canAdvance}
              >
                {currentIndex + 1 < activePlayers.length ? (
                  <span className="inline-flex items-center justify-center">
                    {"Next Player"}
                    <ChevronRight className="h-5 w-5 ml-2" />
                  </span>
                ) : (
                  "Start Clue Phase"
                )}
              </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
