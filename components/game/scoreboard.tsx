"use client"

import type { GameState } from "@/lib/game-logic"
import { Button } from "@/components/ui/button"
import { Trophy, Medal, Shield, EyeOff, RotateCcw, Home } from "lucide-react"
import Link from "next/link"

interface ScoreboardProps {
  game: GameState
  backPath: string
}

export function Scoreboard({ game, backPath }: ScoreboardProps) {
  const sortedPlayers = [...game.players].sort((a, b) => b.totalScore - a.totalScore)
  const winner = game.winner
  const impostor = game.players.find((p) => p.role === "impostor")

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <div className="text-center pt-12 pb-8 px-4">
        <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
          winner === "friends" ? "bg-accent/10" : "bg-primary/10"
        }`}>
          <Trophy className={`h-10 w-10 ${winner === "friends" ? "text-accent" : "text-primary"}`} />
        </div>
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-2">
          Game Over
        </p>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {winner === "friends" ? "Friends Win!" : "The Impostor Wins!"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {winner === "friends"
            ? "The Impostor was discovered and eliminated!"
            : "The Impostor survived all rounds undetected!"}
        </p>

        {/* Impostor Reveal */}
        {impostor && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-5 py-2">
            <EyeOff className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {"The Impostor was "}
              <span className="text-primary font-bold">{impostor.name}</span>
            </span>
          </div>
        )}

        {/* Secret Word */}
        <div className="mt-4">
          <span className="text-xs font-mono text-muted-foreground">
            {"Secret Word: "}
          </span>
          <span className="text-sm font-bold text-foreground">{game.secretWord}</span>
          <span className="text-xs font-mono text-muted-foreground ml-2">
            {"("}
            {game.category}
            {")"}
          </span>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex-1 px-4 pb-8 max-w-lg mx-auto w-full">
        <p className="text-xs font-mono text-muted-foreground uppercase mb-4">Final Scores</p>
        <div className="space-y-3">
          {sortedPlayers.map((player, index) => {
            const isImpostor = player.role === "impostor"
            const isFirst = index === 0
            return (
              <div
                key={player.id}
                className={`rounded-xl border p-4 transition-all ${
                  isFirst
                    ? "border-warning/30 bg-warning/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      isFirst
                        ? "bg-warning text-warning-foreground"
                        : index === 1
                        ? "bg-muted text-foreground"
                        : index === 2
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary text-secondary-foreground"
                    }`}>
                      {isFirst ? (
                        <Medal className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-mono font-bold">{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{player.name}</span>
                        {isImpostor ? (
                          <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-mono">
                            Impostor
                          </span>
                        ) : (
                          <span className="text-xs rounded-full bg-accent/10 text-accent px-2 py-0.5 font-mono">
                            Friend
                          </span>
                        )}
                        {player.isEliminated && (
                          <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-mono">
                            Out
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-1">
                        {player.scores.map((score, i) => (
                          <span key={i} className="text-xs font-mono text-muted-foreground">
                            {"R"}
                            {i + 1}
                            {": +"}
                            {score}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground font-mono">
                      {player.totalScore}
                    </p>
                    <p className="text-xs text-muted-foreground">pts</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Round History */}
        <div className="mt-8">
          <p className="text-xs font-mono text-muted-foreground uppercase mb-4">Round History</p>
          <div className="space-y-3">
            {game.roundResults.map((result) => (
              <div key={result.round} className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-foreground">
                    {"Round "}
                    {result.round}
                  </span>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                    result.wasTie
                      ? "bg-secondary text-secondary-foreground"
                      : !result.impostorSurvived
                      ? "bg-accent/10 text-accent"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {result.wasTie ? "Tie" : !result.impostorSurvived ? "Impostor Found" : "Impostor Survived"}
                  </span>
                </div>
                {result.eliminatedPlayer && (
                  <p className="text-xs text-muted-foreground">
                    {"Eliminated: "}
                    <span className="text-foreground">
                      {game.players.find((p) => p.id === result.eliminatedPlayer)?.name}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <Button
            asChild
            size="lg"
            className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href={backPath}>
              <RotateCcw className="h-5 w-5 mr-2" />
              Play Again
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground"
          >
            <Link href="/">
              <Home className="h-5 w-5 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
