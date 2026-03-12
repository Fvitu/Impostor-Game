import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

// AUDIT: Max-length limits prevent memory abuse on login attempts.
// bcrypt truncates at 72 bytes; identifier max 254 chars per RFC 5321 email limit.
const MAX_IDENTIFIER_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72;

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { identifier, password } = body;

		if (!identifier || typeof identifier !== "string" || identifier.trim().length === 0 || identifier.length > MAX_IDENTIFIER_LENGTH) {
			return NextResponse.json({ error: "Email or username is required" }, { status: 400 });
		}

		if (!password || typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
			// AUDIT: Reject passwords over 72 chars to avoid wasted bcrypt work.
			return NextResponse.json({ error: "Password is required" }, { status: 400 });
		}

		const result = await authenticateUser(identifier.trim(), password);

		if ("error" in result) {
			return NextResponse.json({ error: result.error }, { status: 401 });
		}

		const token = await createSessionToken(result.user);

		const response = NextResponse.json({ user: result.user });
		response.cookies.set("impostor_session", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 7 * 24 * 60 * 60,
			path: "/",
		});

		return response;
	} catch (err) {
		console.error("Login error:", err);
		const payload: any = { error: "Login failed" };
		if (process.env.NODE_ENV !== "production") {
			payload.details = err instanceof Error ? err.message : String(err);
		}
		return NextResponse.json(payload, { status: 500 });
	}
}
