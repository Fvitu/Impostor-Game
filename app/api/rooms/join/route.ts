import { NextRequest, NextResponse } from "next/server"
import { joinRoom } from "@/lib/room-store"

export async function POST(request: NextRequest) {
  try {
    const { code, playerName } = await request.json()
    if (!code || !playerName) {
      return NextResponse.json({ error: "Room code and player name are required" }, { status: 400 })
    }

    const result = joinRoom(code.toUpperCase().trim(), playerName.trim())
    if (!result) {
      return NextResponse.json({ error: "Room not found, full, game started, or name taken" }, { status: 404 })
    }

    return NextResponse.json({
      code: result.room.code,
      playerId: result.playerId,
      game: result.room.game,
    })
  } catch {
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 })
  }
}
