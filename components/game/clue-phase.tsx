"use client"

import { useState } from "react"
import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getCurrentCluePlayer, getActivePlayersForClues } from "@/lib/game-logic"
import { MessageSquare, Send, ChevronRight, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { GameNavbar } from "@/components/game/game-navbar"

export function CluePhase() {
  const { game, dispatch } = useGame()
  const [clue, setClue] = useState("")
  const [showInput, setShowInput] = useState(false)

  const activePlayers = getActivePlayersForClues(game)
  const currentPlayer = getCurrentCluePlayer(game)

  if (!currentPlayer) return null

  const handleSubmitClue = () => {
    const trimmed = clue.trim()
    if (trimmed) {
      dispatch({ type: "SUBMIT_CLUE", playerId: currentPlayer.id, clue: trimmed })
      setClue("")
      setShowInput(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmitClue()
  }

  // Gather previously submitted clues for this round
  const previousClues = activePlayers
    .filter((p) => {
      const clueIndex = game.currentRound - 1
      return p.clues.length > clueIndex
    })
    .map((p) => ({
      name: p.name,
      clue: p.clues[game.currentRound - 1],
    }))

  return (
    <div className="min-h-dvh flex flex-col">
      <GameNavbar
        backHref="/"
        title={"Give Your Clue"}
        subtitle={"Round " + game.currentRound + " - Clue Phase"}
        round={game.currentRound}
        maxRounds={game.maxRounds}
      />

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-lg w-full py-6 mx-auto flex flex-col">
        {/* Previous Clues */}
        {previousClues.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-3">
              Clues Given
            </p>
            <div className="space-y-2">
              {previousClues.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center gap-3 rounded-lg bg-card border border-border px-4 py-3"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-sm text-muted-foreground ml-auto font-mono">
                    {'"'}
                    {c.clue}
                    {'"'}
                  </span>
                </div>
             ))}
            </div>
          </div>
        )}

        {/* Current Player */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-full max-w-sm">
            <p className="text-sm text-muted-foreground mb-2">
              {"It's your turn"}
            </p>
            <h2 className="text-2xl font-bold text-foreground mb-8">{currentPlayer.name}</h2>

            {!showInput ? (
              <div>
                <p className="text-sm text-muted-foreground mb-6">
                  Pass the device to {currentPlayer.name}, then tap below to enter your clue.
                </p>
                <Button
                  onClick={() => setShowInput(true)}
                  size="lg"
                  className="w-full h-14 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  {"I'm Ready"}
                </Button>
              </div>
            ) : (
              <div className="animate-slide-up">
                <p className="text-xs text-muted-foreground mb-4">
                  Give a single-word clue about the secret word. Be subtle!
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Your clue..."
                    value={clue}
                    onChange={(e) => setClue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={30}
                    autoFocus
                    className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <Button
                    onClick={handleSubmitClue}
                    disabled={!clue.trim()}
                    size="lg"
                    className="h-12 px-4 bg-primary text-primary-foreground shrink-0"
                  >
                    <Send className="h-5 w-5" />
                    <span className="sr-only">Submit clue</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}
