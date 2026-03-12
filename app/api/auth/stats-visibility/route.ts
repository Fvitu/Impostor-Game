import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { setUserLeaderboardVisibility } from "@/lib/user-stats";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
	try {
		const token = request.cookies.get("impostor_session")?.value;
		const user = await getAuthenticatedUser(token);

		if (!user) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		const body = (await request.json()) as { includeInPublicLeaderboard?: boolean };
		if (typeof body.includeInPublicLeaderboard !== "boolean") {
			return NextResponse.json({ error: "Invalid visibility preference" }, { status: 400 });
		}

		const stats = await setUserLeaderboardVisibility(user.id, user.username, body.includeInPublicLeaderboard);

		return NextResponse.json({ stats });
	} catch {
		return NextResponse.json({ error: "Failed to update leaderboard visibility" }, { status: 500 });
	}
}