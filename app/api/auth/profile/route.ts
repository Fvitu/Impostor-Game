import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getAuthenticatedUser, updateUsername } from "@/lib/auth";
import { setStatsUsername } from "@/lib/user-stats";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
	try {
		const token = request.cookies.get("impostor_session")?.value;
		const authUser = await getAuthenticatedUser(token);

		if (!authUser) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		const body = (await request.json()) as { username?: string };
		if (!body.username || typeof body.username !== "string") {
			return NextResponse.json({ error: "Username is required" }, { status: 400 });
		}

		const result = await updateUsername(authUser.id, body.username);
		if ("error" in result) {
			const status = result.error === "Username is already taken" ? 409 : 400;
			return NextResponse.json({ error: result.error }, { status });
		}

		const stats = await setStatsUsername(result.user.id, result.user.username);
		const nextToken = await createSessionToken(result.user);

		const response = NextResponse.json({ user: result.user, stats });
		response.cookies.set("impostor_session", nextToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 7 * 24 * 60 * 60,
			path: "/",
		});

		return response;
	} catch {
		return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
	}
}
