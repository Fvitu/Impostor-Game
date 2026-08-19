import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ServicePingResult {
	status: "healthy" | "unhealthy" | "skipped";
	latencyMs?: number;
	details?: string;
	error?: string;
}

export async function GET(request: NextRequest) {
	const startTime = Date.now();

	// Verify CRON_SECRET if configured (Vercel Cron automatically attaches this header)
	const cronSecret = process.env.CRON_SECRET;
	if (cronSecret) {
		const authHeader = request.headers.get("authorization");
		if (authHeader !== `Bearer ${cronSecret}`) {
			return NextResponse.json(
				{
					ok: false,
					error: "Unauthorized",
					timestamp: new Date().toISOString(),
				},
				{ status: 401 }
			);
		}
	}

	const results: Record<string, ServicePingResult> = {};

	// 1. Supabase ping (if Supabase credentials are provided)
	const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseKey =
		process.env.SUPABASE_SERVICE_ROLE_KEY ||
		process.env.SUPABASE_ANON_KEY ||
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
		process.env.SUPABASE_KEY;

	if (supabaseUrl && supabaseKey) {
		const supaStart = Date.now();
		try {
			// Perform a lightweight REST request to keep the Supabase project active
			const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
			const res = await fetch(url, {
				method: "GET",
				headers: {
					apikey: supabaseKey,
					Authorization: `Bearer ${supabaseKey}`,
				},
				cache: "no-store",
			});

			const latencyMs = Date.now() - supaStart;
			if (res.ok || res.status === 200 || res.status === 404 || res.status === 401) {
				// Any response from the Supabase gateway registers network activity and keeps DB alive
				results.supabase = {
					status: "healthy",
					latencyMs,
					details: `HTTP ${res.status} from Supabase REST gateway`,
				};
			} else {
				results.supabase = {
					status: "unhealthy",
					latencyMs,
					details: `HTTP ${res.status}: ${res.statusText}`,
				};
			}
		} catch (error) {
			results.supabase = {
				status: "unhealthy",
				latencyMs: Date.now() - supaStart,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	} else if (supabaseUrl && !supabaseKey) {
		results.supabase = {
			status: "skipped",
			details: "SUPABASE_URL found but no API key configured",
		};
	}

	// 2. Redis database ping (primary database used by Impostor Game)
	if (process.env.REDIS_URL) {
		const redisStart = Date.now();
		try {
			const redis = await getRedisClient();
			const pong = await redis.ping();
			const latencyMs = Date.now() - redisStart;

			results.redis = {
				status: pong === "PONG" ? "healthy" : "unhealthy",
				latencyMs,
				details: `Redis response: ${pong}`,
			};
		} catch (error) {
			results.redis = {
				status: "unhealthy",
				latencyMs: Date.now() - redisStart,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	} else {
		results.redis = {
			status: "skipped",
			details: "REDIS_URL not configured",
		};
	}

	const totalDurationMs = Date.now() - startTime;
	const allHealthy = Object.values(results).every(
		(r) => r.status === "healthy" || r.status === "skipped"
	);

	return NextResponse.json({
		ok: allHealthy,
		timestamp: new Date().toISOString(),
		totalDurationMs,
		results,
		message: "Keep-alive ping executed successfully",
	});
}
