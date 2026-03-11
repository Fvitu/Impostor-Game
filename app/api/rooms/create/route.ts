import { NextRequest, NextResponse } from "next/server"
import { createRoom } from "@/lib/room-store"

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { hostName } = await request.json()
    if (!hostName || typeof hostName !== "string" || hostName.trim().length === 0) {
      return NextResponse.json({ error: "Host name is required" }, { status: 400 })
    }

    const { room, playerId } = await createRoom(hostName.trim());
    return NextResponse.json({
      code: room.code,
      playerId,
      game: room.game,
    })
  } catch {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 })
  }
}
