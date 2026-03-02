"use client"

import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { Trophy, Skull, ArrowRight, RotateCcw } from "lucide-react"
import Link from "next/link"

export function ResolutionPhase() {
  const { game, dispatch } = useGame()
  const lastResult = game.roundResults[game.roundResults.length - 1]

  if (!lastResult) return null

  const eliminatedPlayer = lastResult.eliminatedPlayer
    ? game.players.find((p) => p.id === lastResult.eliminatedPlayer)
    : null
  const impostor = game.players.find((p) => p.role === "impostor")

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-slide-up">
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-4">
          {"Round "}
          {game.currentRound}
          {" Result"}
        </p>

        {lastResult.wasTie ? (
          <div>
            <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <RotateCcw className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">
              {"It's a Tie!"}
            </h2>
            <p className="text-sm text-muted-foreground mb-2">
              No one is eliminated this round.
            </p>
            <p className="text-sm text-muted-foreground">
              The Impostor earns survival points.
            </p>
          </div>
        ) : eliminatedPlayer ? (
          <div>
            {!lastResult.impostorSurvived ? (
              <>
                <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
                  <Trophy className="h-8 w-8 text-accent" />
                </div>
                <h2 className="text-2xl font-bold text-accent mb-3">
                  Impostor Found!
                </h2>
                <p className="text-sm text-muted-foreground mb-2">
                  <span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
                  {" was The Impostor!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {"The secret word was "}
                  <span className="font-bold text-foreground">{game.secretWord}</span>
                </p>
              </>
            ) : (
              <>
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                  <Skull className="h-8 w-8 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold text-destructive mb-3">
                  Wrong Person!
                </h2>
                <p className="text-sm text-muted-foreground mb-2">
                  <span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
                  {" was a Friend!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  The Impostor survives and earns points.
                </p>
              </>
            )}
          </div>
        ) : null}

        {/* Vote Breakdown */}
        <div className="mt-8 mb-8">
          <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Vote Breakdown</p>
          <div className="space-y-2">
            {Object.entries(lastResult.votes).map(([voterId, targetId]) => {
              const voter = game.players.find((p) => p.id === voterId)
              const target = game.players.find((p) => p.id === targetId)
              return (
                <div key={voterId} className="flex items-center justify-between rounded-lg bg-card border border-border px-4 py-2.5">
                  <span className="text-sm text-foreground">{voter?.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {"voted "}
                    <span className={target?.role === "impostor" ? "text-accent" : "text-muted-foreground"}>
                      {target?.name}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Continue or End */}
        {game.phase === "game-over" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              {"Game Over! "}
              {game.winner === "friends" ? "Friends win!" : "The Impostor wins!"}
            </p>
            <Link href={`/play/local/results?data=${encodeURIComponent(JSON.stringify(game))}`}>
              <Button
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Trophy className="h-5 w-5 mr-2" />
                View Final Scores
              </Button>
            </Link>
          </div>
        ) : (
          <Button
            onClick={() => dispatch({ type: "NEXT_ROUND" })}
            size="lg"
            className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {"Next Round"}
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}
