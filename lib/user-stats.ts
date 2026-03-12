import { getRedisClient } from "./redis";
import { getUserById } from "./auth";

const STATS_KEY_PREFIX = "impostor:stats:";
const CATEGORY_POINTS_KEY_PREFIX = "impostor:stats:categories:";
const CATEGORY_STATS_KEY_PREFIX = "impostor:stats:catstats:";
const LEADERBOARD_KEY = "impostor:leaderboard";

export interface UserStats {
	userId: string;
	username: string;
	totalPoints: number;
	gamesPlayedAsImpostor: number;
	gamesPlayedAsInnocent: number;
	winsAsImpostor: number;
	winsAsInnocent: number;
	includeInPublicLeaderboard: boolean;
}

function getStatsKey(userId: string): string {
	return `${STATS_KEY_PREFIX}${userId}`;
}

function getCategoryPointsKey(userId: string): string {
	return `${CATEGORY_POINTS_KEY_PREFIX}${userId}`;
}

function getCategoryLeaderboardKey(category: string): string {
	return `${LEADERBOARD_KEY}:cat:${category}`;
}

function getCategoryStatsKey(userId: string): string {
	return `${CATEGORY_STATS_KEY_PREFIX}${userId}`;
}

function defaultStats(userId: string, username: string): UserStats {
	return {
		userId,
		username,
		totalPoints: 0,
		gamesPlayedAsImpostor: 0,
		gamesPlayedAsInnocent: 0,
		winsAsImpostor: 0,
		winsAsInnocent: 0,
		includeInPublicLeaderboard: true,
	};
}

function normalizeStats(stats: UserStats): UserStats {
	return {
		...stats,
		includeInPublicLeaderboard: stats.includeInPublicLeaderboard ?? true,
	};
}

async function getStoredCategoryPoints(userId: string): Promise<Record<string, number>> {
	const redis = await getRedisClient();
	const storedPoints = await redis.hGetAll(getCategoryPointsKey(userId));

	return Object.fromEntries(
		Object.entries(storedPoints)
			.map(([category, points]) => [category, Number(points)] as const)
				.filter(([, points]) => Number.isFinite(points)),
	);
}

async function syncLeaderboardMembership(userId: string, stats: UserStats): Promise<void> {
	const redis = await getRedisClient();
	const categoryPoints = await getStoredCategoryPoints(userId);
	const multi = redis.multi();

	if (stats.includeInPublicLeaderboard && stats.totalPoints > 0) {
		multi.zAdd(LEADERBOARD_KEY, { score: stats.totalPoints, value: userId });
	} else {
		multi.zRem(LEADERBOARD_KEY, userId);
	}

	for (const [category, points] of Object.entries(categoryPoints)) {
		// Ensure users who have played in a category appear in that category leaderboard
		// even if their points are zero (so losses / zero-score games are visible).
		if (stats.includeInPublicLeaderboard) {
			multi.zAdd(getCategoryLeaderboardKey(category), { score: points, value: userId });
		} else {
			multi.zRem(getCategoryLeaderboardKey(category), userId);
		}
	}

	await multi.exec();
}

async function buildLeaderboardEntries(sortedSetKey: string, limit: number, category?: string): Promise<LeaderboardEntry[]> {
	const redis = await getRedisClient();
	const entries: LeaderboardEntry[] = [];
	const batchSize = Math.max(limit * 2, 25);
	let start = 0;

	while (entries.length < limit) {
		const topUserIds = await redis.zRange(sortedSetKey, start, start + batchSize - 1, { REV: true });
		if (topUserIds.length === 0) {
			break;
		}

		// AUDIT: Batch-fetch all user stats in one Redis round-trip instead of N individual GETs
		const statsKeys = topUserIds.map((userId) => getStatsKey(userId));
		const baseValues = await redis.mGet(statsKeys);

		// Batch-fetch category stats and category points separately (hGet cannot be combined into mGet)
		const catStatsValues = category
			? await Promise.all(topUserIds.map((userId) => redis.hGet(getCategoryStatsKey(userId), category)))
			: topUserIds.map(() => null);

		const catPointsValues = category
			? await Promise.all(topUserIds.map((userId) => redis.hGet(getCategoryPointsKey(userId), category)))
			: topUserIds.map(() => null);

		const rawStats = topUserIds.map((userId, i) => ({
			userId,
			base: baseValues[i] ?? null,
			catRaw: catStatsValues[i] ?? null,
			catPointsRaw: catPointsValues[i] ?? null,
		}));

		for (const item of rawStats) {
			if (!item.base) {
				continue;
			}

			const stats = normalizeStats(JSON.parse(item.base) as UserStats);
			if (!stats.includeInPublicLeaderboard) {
				continue;
			}

			// If a category is provided and we have per-category stats, use them
			let winsAsImpostor = stats.winsAsImpostor;
			let winsAsInnocent = stats.winsAsInnocent;
			let totalGames = stats.gamesPlayedAsImpostor + stats.gamesPlayedAsInnocent;

			// Default to the global totalPoints; may override with per-category points below
			let displayPoints = stats.totalPoints;

			if (category && item.catRaw) {
				try {
					const catStats = JSON.parse(item.catRaw) as {
						gamesPlayedAsImpostor?: number;
						gamesPlayedAsInnocent?: number;
						winsAsImpostor?: number;
						winsAsInnocent?: number;
					};

					winsAsImpostor = catStats.winsAsImpostor ?? 0;
					winsAsInnocent = catStats.winsAsInnocent ?? 0;
					totalGames = (catStats.gamesPlayedAsImpostor ?? 0) + (catStats.gamesPlayedAsInnocent ?? 0);
				} catch {
					// ignore parse errors and fall back to global stats
				}
			}

			// If category points are available, prefer them for the displayed totalPoints
			if (category && item.catPointsRaw) {
				const parsedPoints = Number(item.catPointsRaw);
				if (Number.isFinite(parsedPoints)) {
					displayPoints = parsedPoints;
				}
			}

			entries.push({
				rank: entries.length + 1,
				userId: stats.userId,
				username: stats.username,
				totalPoints: displayPoints,
				winsAsImpostor,
				winsAsInnocent,
				totalGames,
				winRate: totalGames > 0 ? Number(((winsAsImpostor + winsAsInnocent) / totalGames * 100).toFixed(1)) : 0,
			});

			if (entries.length === limit) {
				break;
			}
		}

		if (topUserIds.length < batchSize) {
			break;
		}

		start += batchSize;
	}

	return entries;
}

export async function getUserStats(userId: string): Promise<UserStats | null> {
	const redis = await getRedisClient();
	const raw = await redis.get(getStatsKey(userId));
	if (!raw) return null;
	return normalizeStats(JSON.parse(raw) as UserStats);
}

// AUDIT: TODO - updateStatsAfterGame uses a read-modify-write pattern that is not atomic.
// Two concurrent calls for the same user could race. Currently mitigated by dedup logic
// in the action route, but a proper fix would use Redis WATCH/MULTI or a Lua script.
export async function updateStatsAfterGame(
	userId: string,
	username: string,
	pointsEarned: number,
	role: "friend" | "impostor",
	won: boolean,
): Promise<UserStats> {
	const redis = await getRedisClient();
	const existing = await getUserStats(userId);
	const stats = existing ?? defaultStats(userId, username);

	stats.username = username;
	stats.totalPoints += pointsEarned;

	if (role === "impostor") {
		stats.gamesPlayedAsImpostor += 1;
		if (won) stats.winsAsImpostor += 1;
	} else {
		stats.gamesPlayedAsInnocent += 1;
		if (won) stats.winsAsInnocent += 1;
	}

	const multi = redis.multi();
	multi.set(getStatsKey(userId), JSON.stringify(stats));
	if (stats.includeInPublicLeaderboard && stats.totalPoints > 0) {
		multi.zAdd(LEADERBOARD_KEY, { score: stats.totalPoints, value: userId });
	} else {
		multi.zRem(LEADERBOARD_KEY, userId);
	}
	await multi.exec();

	return stats;
}

export interface LeaderboardEntry {
	rank: number;
	userId: string;
	username: string;
	totalPoints: number;
	winsAsImpostor: number;
	winsAsInnocent: number;
	totalGames: number;
	winRate: number;
}

export async function getLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
	return buildLeaderboardEntries(LEADERBOARD_KEY, limit);
}

export async function getLeaderboardByCategory(category: string, limit: number = 50): Promise<LeaderboardEntry[]> {
	return buildLeaderboardEntries(getCategoryLeaderboardKey(category), limit, category);
}

export async function recordCategoryPoints(
	userId: string,
	category: string,
	points: number,
	includeInPublicLeaderboard: boolean = true,
): Promise<void> {
	if (points <= 0) {
		return;
	}

	const redis = await getRedisClient();
	const multi = redis.multi();
	multi.hIncrBy(getCategoryPointsKey(userId), category, points);
	if (includeInPublicLeaderboard) {
		multi.zIncrBy(getCategoryLeaderboardKey(category), points, userId);
	}
	await multi.exec();
}

// AUDIT: TODO - recordCategoryGameResult uses a read-modify-write pattern that is not atomic.
// Two concurrent calls for the same user+category could race. Currently mitigated by dedup
// logic in the action route, but a proper fix would use Redis WATCH/MULTI or a Lua script.
export async function recordCategoryGameResult(
	userId: string,
	category: string,
	role: "friend" | "impostor",
	won: boolean,
): Promise<void> {
	const redis = await getRedisClient();
	const key = getCategoryStatsKey(userId);
	const raw = await redis.hGet(key, category);
	let stats: {
		gamesPlayedAsImpostor: number;
		gamesPlayedAsInnocent: number;
		winsAsImpostor: number;
		winsAsInnocent: number;
	} = {
		gamesPlayedAsImpostor: 0,
		gamesPlayedAsInnocent: 0,
		winsAsImpostor: 0,
		winsAsInnocent: 0,
	};

	if (raw) {
		try {
			const parsed = JSON.parse(raw);
			stats = {
				gamesPlayedAsImpostor: Number(parsed.gamesPlayedAsImpostor ?? 0),
				gamesPlayedAsInnocent: Number(parsed.gamesPlayedAsInnocent ?? 0),
				winsAsImpostor: Number(parsed.winsAsImpostor ?? 0),
				winsAsInnocent: Number(parsed.winsAsInnocent ?? 0),
			};
		} catch {
			// ignore
		}
	}

	if (role === "impostor") {
		stats.gamesPlayedAsImpostor += 1;
		if (won) stats.winsAsImpostor += 1;
	} else {
		stats.gamesPlayedAsInnocent += 1;
		if (won) stats.winsAsInnocent += 1;
	}

	// Persist per-category stats (games played and wins), even if no points were
	// earned in this game. This ensures we can show players who played but
	// scored 0 in the category.
	await redis.hSet(key, category, JSON.stringify(stats));

	// Make sure the category leaderboard membership exists even if the user's
	// points for this category are zero. Fetch current category points (may be
	// 0 or undefined) and update the category sorted set accordingly.
	const pointsRaw = await redis.hGet(getCategoryPointsKey(userId), category);
	const points = Number(pointsRaw) || 0;
	const userStats = await getUserStats(userId);
	if (userStats?.includeInPublicLeaderboard) {
		await redis.zAdd(getCategoryLeaderboardKey(category), { score: points, value: userId });
	} else {
		await redis.zRem(getCategoryLeaderboardKey(category), userId);
	}
}

export async function setUserLeaderboardVisibility(
	userId: string,
	username: string,
	includeInPublicLeaderboard: boolean,
): Promise<UserStats> {
	const redis = await getRedisClient();
	const user = await getUserById(userId);
	const existing = await getUserStats(userId);
	const stats = existing ?? defaultStats(userId, user?.username ?? username);

	stats.username = user?.username ?? username;
	stats.includeInPublicLeaderboard = includeInPublicLeaderboard;

	await redis.set(getStatsKey(userId), JSON.stringify(stats));
	await syncLeaderboardMembership(userId, stats);

	return stats;
}

export async function setStatsUsername(userId: string, username: string): Promise<UserStats | null> {
	const redis = await getRedisClient();
	const existing = await getUserStats(userId);
	if (!existing) {
		return null;
	}

	const stats = {
		...existing,
		username,
	};

	await redis.set(getStatsKey(userId), JSON.stringify(stats));
	if (stats.includeInPublicLeaderboard) {
		await syncLeaderboardMembership(userId, stats);
	}

	return stats;
}
