"use client"

import { useState, useEffect, useCallback } from "react"
import type { GameState } from "@/lib/game-logic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Copy, Check, Play, X, Users, Eye, EyeOff, MessageSquare,
  Send, Vote, ChevronRight, Trophy, Skull, RotateCcw, ArrowRight, ArrowLeft, Crown
} from "lucide-react"
import Link from "next/link"

interface OnlineGameViewProps {
  roomCode: string
  playerId: string
  isHost: boolean
}

export function OnlineGameView({ roomCode, playerId, isHost }: OnlineGameViewProps) {
  const [game, setGame] = useState<GameState | null>(null)
  const [hostId, setHostId] = useState<string>("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [impostorHelp, setImpostorHelp] = useState(false)

  // Poll for game state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/state?code=${roomCode}&pid=${playerId}`)
      if (!res.ok) return
      const data = await res.json()
      setGame(data.game)
      setHostId(data.hostId)
    } catch {
      // silently retry
    }
  }, [roomCode])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 1500)
    return () => clearInterval(interval)
  }, [fetchState])

  const doAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setError("")
    try {
      const res = await fetch("/api/rooms/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code: roomCode, playerId, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGame(data.game)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action failed")
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!game) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Connecting to room...</p>
        </div>
      </div>
    )
  }

  const me = game.players.find((p) => p.id === playerId)
  const amHost = playerId === hostId

  // SETUP / WAITING ROOM
  if (game.phase === "setup") {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Button asChild variant="ghost" size="icon">
            <Link href="/play/online">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Leave room</span>
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">Waiting Room</h1>
            <p className="text-xs text-muted-foreground font-mono">
              {game.players.length}
              {" players joined"}
            </p>
          </div>
        </header>

        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
          {/* Room Code */}
          <div className="text-center mb-8">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-2">Room Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-mono font-bold tracking-[0.3em] text-primary">
                {roomCode}
              </span>
              <Button variant="ghost" size="icon" onClick={copyCode} className="text-muted-foreground">
                {copied ? <Check className="h-5 w-5 text-accent" /> : <Copy className="h-5 w-5" />}
                <span className="sr-only">Copy code</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Share this code with your friends</p>
          </div>

          {/* Player List */}
          <div className="mb-8">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Players</p>
            <div className="space-y-2">
              {game.players.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-mono font-bold text-secondary-foreground">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {player.name}
                      {player.id === playerId && (
                        <span className="text-xs text-muted-foreground ml-1">(you)</span>
                      )}
                    </span>
                    {player.id === hostId && (
                      <Crown className="h-4 w-4 text-warning" />
                    )}
                  </div>
                  {amHost && player.id !== playerId && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => doAction("remove-player", { targetPlayerId: player.id })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove {player.name}</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Host Controls */}
          {amHost && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Impostor Hint</p>
                  <p className="text-xs text-muted-foreground">Show category to Impostor</p>
                </div>
                <Switch checked={impostorHelp} onCheckedChange={setImpostorHelp} />
              </div>
              <Button
                onClick={() => doAction("start", { impostorHelp })}
                disabled={game.players.length < 4}
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Play className="h-5 w-5 mr-2" />
                {"Start Game"}
              </Button>
              {game.players.length < 4 && (
                <p className="text-xs text-center text-muted-foreground font-mono">
                  {"Need at least "}
                  {4 - game.players.length}
                  {" more player"}
                  {4 - game.players.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
          {!amHost && (
            <div className="text-center py-8">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
              <p className="text-sm text-muted-foreground">Waiting for the host to start the game...</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  // IN-GAME PHASES
  return (
    <OnlineInGame
      game={game}
      playerId={playerId}
      amHost={amHost}
      doAction={doAction}
      error={error}
    />
  )
}

// --- In-Game Component ---

function OnlineInGame({
  game,
  playerId,
  amHost,
  doAction,
  error,
}: {
  game: GameState
  playerId: string
  amHost: boolean
  doAction: (action: string, extra?: Record<string, unknown>) => Promise<void>
  error: string
}) {
  const [roleRevealed, setRoleRevealed] = useState(false)
  const [clue, setClue] = useState("")
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)

  const me = game.players.find((p) => p.id === playerId)
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  const isImpostor = me?.role === "impostor"
  const currentCluePlayer = activePlayers[game.currentPlayerIndex]
  const isMyTurnForClue = game.phase === "clues" && currentCluePlayer?.id === playerId

  // Reset vote state when phase changes
  useEffect(() => {
    if (game.phase === "voting") {
      setHasVoted(me?.votedFor !== null)
    }
    if (game.phase === "clues") {
      setHasVoted(false)
      setSelectedTarget(null)
    }
  }, [game.phase, me?.votedFor])

  // CLUES PHASE
  if (game.phase === "clues") {
    const cluesThisRound = activePlayers
      .filter((p) => p.clues.length >= game.currentRound)
      .map((p) => ({ name: p.name, clue: p.clues[game.currentRound - 1] }))

    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <OnlineHeader phase="Clue Phase" round={game.currentRound} maxRounds={game.maxRounds} />
        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
          {/* My Role Card */}
          <div className={`rounded-xl border-2 p-4 mb-6 ${isImpostor ? "border-primary/30 bg-primary/5" : "border-accent/30 bg-accent/5"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-muted-foreground">Your Role</p>
                <p className={`text-sm font-bold ${isImpostor ? "text-primary" : "text-accent"}`}>
                  {isImpostor ? "The Impostor" : "Friend"}
                </p>
              </div>
              {!isImpostor && (
                <div className="text-right">
                  <p className="text-xs font-mono text-muted-foreground">Secret Word</p>
                  <button
                    onClick={() => setRoleRevealed(!roleRevealed)}
                    className="flex items-center gap-1 text-sm font-bold text-foreground"
                  >
                    {roleRevealed ? (
                      <>
                        {game.secretWord}
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      </>
                    ) : (
                      <>
                        {"Tap to reveal"}
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </>
                    )}
                  </button>
                </div>
              )}
              {isImpostor && game.impostorHelp && (
                <div className="text-right">
                  <p className="text-xs font-mono text-muted-foreground">Category</p>
                  <p className="text-sm font-bold text-foreground">{game.category}</p>
                </div>
              )}
            </div>
          </div>

          {/* Clues */}
          {cluesThisRound.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Clues Given</p>
              <div className="space-y-2">
                {cluesThisRound.map((c) => (
                  <div key={c.name} className="flex items-center gap-3 rounded-lg bg-card border border-border px-4 py-3">
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                    <span className="text-sm text-muted-foreground ml-auto font-mono">{'"'}{c.clue}{'"'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Turn */}
          {isMyTurnForClue ? (
            <div className="animate-slide-up">
              <p className="text-sm font-bold text-foreground text-center mb-2">{"It's Your Turn!"}</p>
              <p className="text-xs text-muted-foreground text-center mb-4">Give a single-word clue</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Your clue..."
                  value={clue}
                  onChange={(e) => setClue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && clue.trim()) {
                      doAction("clue", { clue: clue.trim() })
                      setClue("")
                    }
                  }}
                  maxLength={30}
                  autoFocus
                  className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  onClick={() => {
                    if (clue.trim()) {
                      doAction("clue", { clue: clue.trim() })
                      setClue("")
                    }
                  }}
                  disabled={!clue.trim()}
                  size="lg"
                  className="h-12 px-4 bg-primary text-primary-foreground shrink-0"
                >
                  <Send className="h-5 w-5" />
                  <span className="sr-only">Submit clue</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
              <p className="text-sm text-muted-foreground">
                {"Waiting for "}
                <span className="font-bold text-foreground">{currentCluePlayer?.name}</span>
                {" to give a clue..."}
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {game.currentPlayerIndex + 1}
                {"/"}
                {activePlayers.length}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  // VOTING PHASE
  if (game.phase === "voting") {
    const cluesThisRound = activePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      clue: p.clues[game.currentRound - 1] || "No clue",
    }))

    const votedCount = activePlayers.filter((p) => p.votedFor !== null).length

    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <OnlineHeader phase="Voting" round={game.currentRound} maxRounds={game.maxRounds} />
        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
          {/* Clue Summary */}
          <div className="mb-6">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Clue Summary</p>
            <div className="space-y-2">
              {cluesThisRound.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg bg-card border border-border px-4 py-2.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-sm text-muted-foreground ml-auto font-mono">{'"'}{c.clue}{'"'}</span>
                </div>
              ))}
            </div>
          </div>

          {hasVoted || me?.votedFor ? (
            <div className="text-center py-8">
              <Check className="h-8 w-8 text-accent mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Vote submitted! Waiting for others...</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {votedCount}
                {"/"}
                {activePlayers.length}
                {" votes in"}
              </p>
            </div>
          ) : (
            <div className="animate-slide-up">
              <p className="text-sm font-bold text-foreground text-center mb-4">Who is The Impostor?</p>
              <div className="space-y-2 mb-6">
                {activePlayers
                  .filter((p) => p.id !== playerId)
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
                      {selectedTarget === player.id && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
              </div>
              <Button
                onClick={async () => {
                  if (selectedTarget) {
                    await doAction("vote", { targetId: selectedTarget })
                    setHasVoted(true)
                  }
                }}
                disabled={!selectedTarget}
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Vote className="h-5 w-5 mr-2" />
                Confirm Vote
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  // RESOLUTION / GAME OVER
  if (game.phase === "resolution" || game.phase === "game-over") {
    const lastResult = game.roundResults[game.roundResults.length - 1]
    if (!lastResult) return null

    const eliminatedPlayer = lastResult.eliminatedPlayer
      ? game.players.find((p) => p.id === lastResult.eliminatedPlayer)
      : null
    const impostor = game.players.find((p) => p.role === "impostor")

    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-slide-up">
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-4">
            {"Round "}
            {lastResult.round}
            {" Result"}
          </p>

          {lastResult.wasTie ? (
            <div>
              <RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-3">{"It's a Tie!"}</h2>
              <p className="text-sm text-muted-foreground">No one is eliminated.</p>
            </div>
          ) : eliminatedPlayer && (
            <div>
              {!lastResult.impostorSurvived ? (
                <>
                  <Trophy className="h-12 w-12 text-accent mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-accent mb-3">Impostor Found!</h2>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
                    {" was The Impostor!"}
                  </p>
                </>
              ) : (
                <>
                  <Skull className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-destructive mb-3">Wrong Person!</h2>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
                    {" was a Friend."}
                  </p>
                </>
              )}
            </div>
          )}

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

          {game.phase === "game-over" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                {"Game Over! "}
                {game.winner === "friends" ? "Friends win!" : "The Impostor wins!"}
              </p>
              <Link href={`/play/online/results?data=${encodeURIComponent(JSON.stringify(game))}`}>
                <Button size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
                  <Trophy className="h-5 w-5 mr-2" />
                  View Final Scores
                </Button>
              </Link>
            </div>
          ) : amHost ? (
            <Button
              onClick={() => doAction("next-round")}
              size="lg"
              className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {"Next Round"}
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Waiting for host to start next round...</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  // FALLBACK / WAITING (roles phase in online - auto-transition)
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="text-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading game state...</p>
      </div>
    </div>
  )
}

function OnlineHeader({ phase, round, maxRounds }: { phase: string; round: number; maxRounds: number }) {
  return (
    <header className="px-4 py-4 border-b border-border">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <div>
          <p className="text-xs font-mono tracking-widest text-primary uppercase">
            {"Round "}
            {round}
            {" - "}
            {phase}
          </p>
          <h1 className="text-lg font-bold text-foreground mt-1">The Impostor</h1>
        </div>
        <span className="text-xs font-mono text-muted-foreground rounded-full bg-secondary px-3 py-1">
          {"R"}
          {round}
          {"/"}
          {maxRounds}
        </span>
      </div>
    </header>
  )
}
