"use client"

import { useState, useCallback } from "react"
import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, ChevronRight } from "lucide-react"

export function RoleRevealPhase() {
  const { game, dispatch } = useGame()
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isHolding, setIsHolding] = useState(false)

  const currentPlayer = activePlayers[currentIndex]

  const handleReveal = useCallback(() => {
    setIsHolding(true)
    setIsRevealed(true)
  }, [])

  const handleHide = useCallback(() => {
    setIsHolding(false)
    setIsRevealed(false)
  }, [])

  const handleNext = () => {
    setIsRevealed(false)
    setIsHolding(false)
    if (currentIndex + 1 < activePlayers.length) {
      setCurrentIndex(currentIndex + 1)
    } else {
      dispatch({ type: "START_CLUES" })
    }
  }

  if (!currentPlayer) return null

  const isImpostor = currentPlayer.role === "impostor"

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Round indicator */}
        <div className="mb-8">
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-2">
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
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {currentPlayer.name}
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Pass the device to this player
        </p>

        {/* Role Card */}
        <div
          className={`relative rounded-2xl border-2 p-8 mb-8 transition-all duration-300 ${
            isRevealed
              ? isImpostor
                ? "border-primary bg-primary/10"
                : "border-accent bg-accent/10"
              : "border-border bg-card"
          }`}
        >
          {isRevealed ? (
            <div className="animate-slide-up">
              <p className="text-xs font-mono tracking-widest uppercase mb-3 text-muted-foreground">
                Your Role
              </p>
              <p
                className={`text-2xl font-bold mb-4 ${
                  isImpostor ? "text-primary" : "text-accent"
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
          ) : (
            <div className="py-4">
              <EyeOff className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <p className="text-sm text-muted-foreground">
                Hold the button below to see your role
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {!isRevealed ? (
            <Button
              onPointerDown={handleReveal}
              onPointerUp={handleHide}
              onPointerLeave={handleHide}
              size="lg"
              className="w-full h-14 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80 select-none touch-none"
            >
              <Eye className="h-5 w-5 mr-2" />
              Hold to Reveal
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              size="lg"
              className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {currentIndex + 1 < activePlayers.length ? (
                <>
                  {"Pass to Next Player"}
                  <ChevronRight className="h-5 w-5 ml-2" />
                </>
              ) : (
                "Start Clue Phase"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
