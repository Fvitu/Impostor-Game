import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getRedisClient } from "./redis";
import { validatePlayerName } from "./player-name";

const BCRYPT_ROUNDS = 10;

// AUDIT: If JWT_SECRET is not set, JWTs are signed with a publicly-known key.
// In development we keep a default to avoid blocking local dev, but in
// production the application must fail fast to prevent token forgery.
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
	throw new Error("JWT_SECRET must be set in production environment");
}
const JWT_SECRET_RAW = process.env.JWT_SECRET || "impostor-game-default-secret-change-me";
if (!process.env.JWT_SECRET) {
	console.warn(
		"[AUTH WARNING] JWT_SECRET environment variable is not set. " +
		"Using insecure default secret. Set JWT_SECRET in production to prevent token forgery."
	);
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const JWT_EXPIRY = "7d";

const USER_KEY_PREFIX = "impostor:user:";
const EMAIL_INDEX_PREFIX = "impostor:email:";
const USERNAME_INDEX_PREFIX = "impostor:username:";

export interface UserRecord {
	id: string;
	email: string;
	username: string;
	passwordHash: string;
	createdAt: number;
}

export interface SafeUser {
	id: string;
	email: string;
	username: string;
	createdAt: number;
}

function generateUserId(): string {
	return crypto.randomUUID();
}

function getUserKey(userId: string): string {
	return `${USER_KEY_PREFIX}${userId}`;
}

function getEmailIndexKey(email: string): string {
	return `${EMAIL_INDEX_PREFIX}${email.toLowerCase().trim()}`;
}

function getUsernameIndexKey(username: string): string {
	return `${USERNAME_INDEX_PREFIX}${username.toLowerCase().trim()}`;
}

function toSafeUser(user: UserRecord): SafeUser {
	return {
		id: user.id,
		email: user.email,
		username: user.username,
		createdAt: user.createdAt,
	};
}

export async function createUser(email: string, username: string, password: string): Promise<{ user: SafeUser } | { error: string }> {
	const redis = await getRedisClient();
	const normalizedEmail = email.toLowerCase().trim();
	const normalizedUsername = username.toLowerCase().trim();

	const id = generateUserId();
	const passwordHash = await hash(password, BCRYPT_ROUNDS);
	const user: UserRecord = {
		id,
		email: normalizedEmail,
		username: username.trim(),
		passwordHash,
		createdAt: Date.now(),
	};

	// FIX: Use SET NX for email and username indexes to prevent race conditions.
	// Two concurrent registrations with the same email/username could both pass the
	// old check-then-write pattern. NX ensures only the first writer wins atomically.
	const emailSet = await redis.set(getEmailIndexKey(normalizedEmail), id, { NX: true });
	if (emailSet !== "OK") {
		return { error: "Email is already registered" };
	}

	const usernameSet = await redis.set(getUsernameIndexKey(normalizedUsername), id, { NX: true });
	if (usernameSet !== "OK") {
		// Roll back the email index since username is taken
		await redis.del(getEmailIndexKey(normalizedEmail));
		return { error: "Username is already taken" };
	}

	// Both indexes claimed — store the user record
	await redis.set(getUserKey(id), JSON.stringify(user));

	return { user: toSafeUser(user) };
}

export async function authenticateUser(identifier: string, password: string): Promise<{ user: SafeUser } | { error: string }> {
	const redis = await getRedisClient();
	const normalized = identifier.toLowerCase().trim();

	// Try email first, then username
	let userId = await redis.get(getEmailIndexKey(normalized));
	if (!userId) {
		userId = await redis.get(getUsernameIndexKey(normalized));
	}
	if (!userId) {
		return { error: "Invalid credentials" };
	}

	const raw = await redis.get(getUserKey(userId));
	if (!raw) {
		return { error: "Invalid credentials" };
	}

	const user: UserRecord = JSON.parse(raw);
	const valid = await compare(password, user.passwordHash);
	if (!valid) {
		return { error: "Invalid credentials" };
	}

	return { user: toSafeUser(user) };
}

export async function getUserById(userId: string): Promise<SafeUser | null> {
	const redis = await getRedisClient();
	const raw = await redis.get(getUserKey(userId));
	if (!raw) return null;

	const user: UserRecord = JSON.parse(raw);
	return toSafeUser(user);
}

export async function updateUsername(userId: string, nextUsername: string): Promise<{ user: SafeUser } | { error: string }> {
	const redis = await getRedisClient();
	const validation = validatePlayerName(nextUsername);
	if (!validation.isValid) {
		return { error: validation.error ?? "Invalid username" };
	}

	const raw = await redis.get(getUserKey(userId));
	if (!raw) {
		return { error: "User not found" };
	}

	const user: UserRecord = JSON.parse(raw);
	const normalizedCurrentUsername = user.username.toLowerCase().trim();
	const normalizedNextUsername = validation.value.toLowerCase().trim();

	if (normalizedCurrentUsername === normalizedNextUsername) {
		user.username = validation.value;
		await redis.set(getUserKey(userId), JSON.stringify(user));
		return { user: toSafeUser(user) };
	}

	const usernameSet = await redis.set(getUsernameIndexKey(normalizedNextUsername), userId, { NX: true });
	if (usernameSet !== "OK") {
		return { error: "Username is already taken" };
	}

	user.username = validation.value;

	const multi = redis.multi();
	multi.set(getUserKey(userId), JSON.stringify(user));
	multi.del(getUsernameIndexKey(normalizedCurrentUsername));
	await multi.exec();

	return { user: toSafeUser(user) };
}

export async function createSessionToken(user: SafeUser): Promise<string> {
	return new SignJWT({ userId: user.id, username: user.username })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(JWT_EXPIRY)
		.sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<{ userId: string; username: string } | null> {
	try {
		const { payload } = await jwtVerify(token, JWT_SECRET);
		if (typeof payload.userId === "string" && typeof payload.username === "string") {
			return { userId: payload.userId, username: payload.username };
		}
		return null;
	} catch {
		return null;
	}
}

export async function getAuthenticatedUser(cookieValue: string | undefined): Promise<SafeUser | null> {
	if (!cookieValue) return null;
	const session = await verifySessionToken(cookieValue);
	if (!session) return null;
	return getUserById(session.userId);
}
