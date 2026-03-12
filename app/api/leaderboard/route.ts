import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, getLeaderboardByCategory } from "@/lib/user-stats";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	try {
		const category = request.nextUrl.searchParams.get("category");

		// AUDIT: Validate category to prevent Redis key injection
		if (category && !/^[a-zA-Z0-9_-]+$/.test(category)) {
			return NextResponse.json({ error: "Invalid category" }, { status: 400 });
		}

		const limitParam = request.nextUrl.searchParams.get("limit");
		const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 100);

		let entries;
		if (category && category !== "all") {
			entries = await getLeaderboardByCategory(category, limit);
		} else {
			entries = await getLeaderboard(limit);
		}

		return NextResponse.json({ entries });
	} catch {
		return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
	}
}
