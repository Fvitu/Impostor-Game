import { NextRequest, NextResponse } from "next/server"
import { getRoom } from "@/lib/room-store"
import type { GameState, Player } from "@/lib/game-logic"

// Sanitize game state so players can't see each other's roles during active play
function sanitizeGameState(game: GameState, requestingPlayerId: string): GameState {
  // During resolution or game-over, reveal everything
  if (game.phase === "resolution" || game.phase === "game-over") {
    return game
  }

  // During active play, only reveal the requesting player's own role
  const sanitizedPlayers: Player[] = game.players.map((p) => {
    if (p.id === requestingPlayerId) {
      return p // Player can see their own role
    }
    return {
      ...p,
      role: null, // Hide other players' roles
    }
  })

  // Hide secret word from the impostor
  const me = game.players.find((p) => p.id === requestingPlayerId)
  const isImpostor = me?.role === "impostor"

  return {
    ...game,
    players: sanitizedPlayers,
    secretWord: isImpostor ? "" : game.secretWord,
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const pid = request.nextUrl.searchParams.get("pid")
  if (!code) {
    return NextResponse.json({ error: "Room code required" }, { status: 400 })
  }

  const room = getRoom(code.toUpperCase())
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 })
  }

  const sanitizedGame = pid ? sanitizeGameState(room.game, pid) : room.game

  return NextResponse.json({
    code: room.code,
    hostId: room.hostId,
    game: room.game.phase === "setup" ? room.game : sanitizedGame,
  })
}
