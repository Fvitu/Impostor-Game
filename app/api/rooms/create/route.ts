import { NextRequest, NextResponse } from "next/server"
import { createRoom } from "@/lib/room-store"
import { validatePlayerName } from "@/lib/player-name";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body;
	try {
		body = await request.json();
	} catch {
		// AUDIT: Return 400 for malformed JSON instead of falling through to generic 500
		return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
	}
	const { hostName } = body;
	if (!hostName || typeof hostName !== "string") {
		return NextResponse.json({ error: "Host name is required" }, { status: 400 });
	}

    const validatedHostName = validatePlayerName(hostName);
	if (!validatedHostName.isValid) {
		return NextResponse.json({ error: validatedHostName.error }, { status: 400 });
	}

	const { room, playerId } = await createRoom(validatedHostName.value);
    return NextResponse.json({
      code: room.code,
      playerId,
      game: room.game,
    })
  } catch {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 })
  }
}
