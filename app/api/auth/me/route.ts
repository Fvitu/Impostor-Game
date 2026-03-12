import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getUserStats } from "@/lib/user-stats";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	try {
		const token = request.cookies.get("impostor_session")?.value;
		const user = await getAuthenticatedUser(token);

		if (!user) {
			return NextResponse.json({ user: null });
		}

		const stats = await getUserStats(user.id);

		return NextResponse.json({ user, stats });
	} catch {
		return NextResponse.json({ user: null });
	}
}
