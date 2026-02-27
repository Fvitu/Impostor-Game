import { NextRequest, NextResponse } from "next/server"
import { startRoomGame, submitRoomClue, submitRoomVote, startNextRound, removePlayerFromRoom } from "@/lib/room-store"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, code, playerId } = body

    switch (action) {
      case "start": {
        const { impostorHelp } = body
        const room = startRoomGame(code, playerId, impostorHelp ?? false)
        if (!room) return NextResponse.json({ error: "Cannot start game" }, { status: 400 })
        return NextResponse.json({ game: room.game })
      }

      case "clue": {
        const { clue } = body
        if (!clue || typeof clue !== "string") {
          return NextResponse.json({ error: "Clue is required" }, { status: 400 })
        }
        const room = submitRoomClue(code, playerId, clue.trim())
        if (!room) return NextResponse.json({ error: "Cannot submit clue" }, { status: 400 })
        return NextResponse.json({ game: room.game })
      }

      case "vote": {
        const { targetId } = body
        if (!targetId) return NextResponse.json({ error: "Target is required" }, { status: 400 })
        const room = submitRoomVote(code, playerId, targetId)
        if (!room) return NextResponse.json({ error: "Cannot submit vote" }, { status: 400 })
        return NextResponse.json({ game: room.game })
      }

      case "next-round": {
        const room = startNextRound(code, playerId)
        if (!room) return NextResponse.json({ error: "Cannot start next round" }, { status: 400 })
        return NextResponse.json({ game: room.game })
      }

      case "remove-player": {
        const { targetPlayerId } = body
        const room = removePlayerFromRoom(code, playerId, targetPlayerId)
        if (!room) return NextResponse.json({ error: "Cannot remove player" }, { status: 400 })
        return NextResponse.json({ game: room.game })
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "Action failed" }, { status: 500 })
  }
}
