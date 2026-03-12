import { NextRequest, NextResponse } from "next/server";
import { createUser, createSessionToken } from "@/lib/auth";
import { validatePlayerName } from "@/lib/player-name";

export const runtime = "nodejs";

// AUDIT: Max-length limits prevent memory abuse. bcrypt silently truncates at 72 bytes,
// so capping password input at 72 chars avoids wasted work and misleading security.
// Email max 254 chars per RFC 5321.
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { email, username, password } = body;

		if (!email || typeof email !== "string" || email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
			// AUDIT: Validates email format beyond a simple "@" check to reject clearly invalid addresses.
			return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
		}

		if (!username || typeof username !== "string") {
			return NextResponse.json({ error: "Username must be 2-20 characters" }, { status: 400 });
		}

		const validatedUsername = validatePlayerName(username);
		if (!validatedUsername.isValid) {
			return NextResponse.json({ error: validatedUsername.error }, { status: 400 });
		}

		if (!password || typeof password !== "string" || password.length < 6 || password.length > MAX_PASSWORD_LENGTH) {
			// AUDIT: Upper bound of 72 chars matches bcrypt's internal limit.
			return NextResponse.json({ error: "Password must be between 6 and 72 characters" }, { status: 400 });
		}

		const result = await createUser(email, validatedUsername.value, password);

		if ("error" in result) {
			return NextResponse.json({ error: result.error }, { status: 409 });
		}

		const token = await createSessionToken(result.user);

		const response = NextResponse.json({ user: result.user });
		response.cookies.set("impostor_session", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 7 * 24 * 60 * 60, // 7 days
			path: "/",
		});

		return response;
	} catch (err) {
		console.error("Registration error:", err);
		const payload: any = { error: "Registration failed" };
		if (process.env.NODE_ENV !== "production") {
			payload.details = err instanceof Error ? err.message : String(err);
		}
		return NextResponse.json(payload, { status: 500 });
	}
}
