"use client"

import { useState } from "react"
import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { getActivePlayersForVoting, allVotesIn } from "@/lib/game-logic"
import { Vote, Check, ChevronRight, MessageSquare } from "lucide-react"

export function VotingPhase() {
  const { game, dispatch } = useGame()
  const activePlayers = getActivePlayersForVoting(game)
  const [currentVoterIndex, setCurrentVoterIndex] = useState(0)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [phase, setPhase] = useState<"pass" | "vote">("pass")

  const currentVoter = activePlayers[currentVoterIndex]

  // Gather all clues for this round
  const cluesThisRound = activePlayers.map((p) => ({
    id: p.id,
    name: p.name,
    clue: p.clues[game.currentRound - 1] || "No clue",
  }))

  const handleVote = () => {
    if (!selectedTarget || !currentVoter) return
    dispatch({ type: "SUBMIT_VOTE", voterId: currentVoter.id, targetId: selectedTarget })
    setSelectedTarget(null)
    setPhase("pass")

    if (currentVoterIndex + 1 < activePlayers.length) {
      setCurrentVoterIndex(currentVoterIndex + 1)
    }
  }

  // Check if all votes are in after dispatching
  const allVoted = allVotesIn(game)
  const readyToResolve = allVoted || currentVoterIndex >= activePlayers.length

  if (readyToResolve && allVoted) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-sm animate-slide-up">
          <Vote className="h-12 w-12 text-primary mx-auto mb-6 animate-pulse-glow" />
          <h2 className="text-2xl font-bold text-foreground mb-3">All Votes Are In</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Gather everyone around to reveal the results.
          </p>
          <Button
            onClick={() => dispatch({ type: "RESOLVE_ROUND" })}
            size="lg"
            className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Reveal Results
          </Button>
        </div>
      </div>
    )
  }

  if (!currentVoter) return null

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono tracking-widest text-primary uppercase">
              {"Round "}
              {game.currentRound}
              {" - Voting"}
            </p>
            <h1 className="text-lg font-bold text-foreground mt-1">Cast Your Vote</h1>
          </div>
          <span className="text-xs font-mono text-muted-foreground rounded-full bg-secondary px-3 py-1">
            {currentVoterIndex + 1}
            {"/"}
            {activePlayers.length}
          </span>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col">
        {/* Clue Summary */}
        <div className="mb-6">
          <p className="text-xs font-mono text-muted-foreground uppercase mb-3">
            Clue Summary
          </p>
          <div className="space-y-2">
            {cluesThisRound.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg bg-card border border-border px-4 py-2.5"
              >
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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

        {/* Voting Area */}
        <div className="flex-1 flex flex-col">
          {phase === "pass" ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{currentVoter.name}</h2>
              <p className="text-sm text-muted-foreground mb-8">
                Pass the device to this player
              </p>
              <Button
                onClick={() => setPhase("vote")}
                size="lg"
                className="w-full max-w-xs h-14 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                <ChevronRight className="h-5 w-5 mr-2" />
                {"I'm Ready to Vote"}
              </Button>
            </div>
          ) : (
            <div className="animate-slide-up">
              <p className="text-sm text-muted-foreground mb-1 text-center">
                {currentVoter.name}
                {", who is The Impostor?"}
              </p>
              <p className="text-xs text-center text-muted-foreground mb-6">
                Tap a player to select, then confirm
              </p>
              <div className="space-y-2 mb-6">
                {activePlayers
                  .filter((p) => p.id !== currentVoter.id)
                  .map((player) => (
                    <button
                      key={player.id}
                      onClick={() => setSelectedTarget(player.id)}
                      className={`w-full flex items-center justify-between rounded-lg border px-4 py-4 transition-all ${
                        selectedTarget === player.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-foreground hover:border-muted-foreground"
                      }`}
                    >
                      <span className="text-sm font-medium">{player.name}</span>
                      {selectedTarget === player.id && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))}
              </div>
              <Button
                onClick={handleVote}
                disabled={!selectedTarget}
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Vote className="h-5 w-5 mr-2" />
                Confirm Vote
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
