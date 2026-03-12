import { createClient } from "redis";

type AppRedisClient = ReturnType<typeof createClient>;

const REDIS_CONNECT_TIMEOUT_MS = 5_000;
const REDIS_MAX_RECONNECT_RETRIES = 2;
const REDIS_ERROR_LOG_WINDOW_MS = 10_000;

type RedisGlobals = typeof globalThis & {
	__impostorRedisClient__?: AppRedisClient;
	__impostorRedisConnectPromise__?: Promise<AppRedisClient>;
	__impostorRedisLastErrorKey__?: string;
	__impostorRedisLastErrorAt__?: number;
};

function getRedisUrl(): string {
	const redisUrl = process.env.REDIS_URL?.trim();
	if (!redisUrl) {
		throw new Error("REDIS_URL is not configured. Add REDIS_URL to your environment, for example: redis://default:password@localhost:6379");
	}

	return redisUrl;
}

function getRedisErrorCode(error: unknown): string {
	if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
		return error.code;
	}

	return "UNKNOWN";
}

function getRedisErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function isFatalRedisError(error: unknown): boolean {
	const code = getRedisErrorCode(error);
	const message = getRedisErrorMessage(error).toUpperCase();

	return code === "EACCES" || message.includes("WRONGPASS") || message.includes("NOAUTH") || message.includes("AUTH");
}

function resetRedisClient(globals: RedisGlobals, client?: AppRedisClient): void {
	if (client && globals.__impostorRedisClient__ === client) {
		globals.__impostorRedisClient__ = undefined;
	}

	globals.__impostorRedisConnectPromise__ = undefined;
}

function logRedisError(globals: RedisGlobals, error: unknown): void {
	const now = Date.now();
	const code = getRedisErrorCode(error);
	const message = getRedisErrorMessage(error);
	const key = `${code}:${message}`;

	if (globals.__impostorRedisLastErrorKey__ === key && now - (globals.__impostorRedisLastErrorAt__ ?? 0) < REDIS_ERROR_LOG_WINDOW_MS) {
		return;
	}

	globals.__impostorRedisLastErrorKey__ = key;
	globals.__impostorRedisLastErrorAt__ = now;
	console.error("Redis client error", error);
}

function createAppRedisClient(globals: RedisGlobals): AppRedisClient {
	const client = createClient({
		url: getRedisUrl(),
		socket: {
			connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
			reconnectStrategy: (retries, cause) => {
				if (isFatalRedisError(cause) || retries >= REDIS_MAX_RECONNECT_RETRIES) {
					return false;
				}

				return Math.min(250 * 2 ** retries, 1_000);
			},
		},
	});

	client.on("ready", () => {
		globals.__impostorRedisLastErrorKey__ = undefined;
		globals.__impostorRedisLastErrorAt__ = undefined;
	});

	client.on("end", () => {
		resetRedisClient(globals, client);
	});

	client.on("error", (error) => {
		logRedisError(globals, error);
		if (isFatalRedisError(error)) {
			resetRedisClient(globals, client);
		}
	});

	return client;
}

export async function getRedisClient(): Promise<AppRedisClient> {
	const globals = globalThis as RedisGlobals;
	const existingClient = globals.__impostorRedisClient__;
	// If we already have a ready client, use it.
	if (existingClient?.isReady) {
		return existingClient;
	}

	// If a connect is already in progress, wait for it.
	if (globals.__impostorRedisConnectPromise__) {
		return globals.__impostorRedisConnectPromise__;
	}

	// If there is an existing client but it's not ready, reset it and create a fresh one.
	if (existingClient && !existingClient.isReady) {
		resetRedisClient(globals, existingClient);
	}

	// Create a new client and store the connect promise so concurrent callers reuse it.
	const client = globals.__impostorRedisClient__ ?? createAppRedisClient(globals);
	globals.__impostorRedisClient__ = client;

	const connectPromise = (client.isReady ? Promise.resolve(client) : client.connect().then(() => client))
		.then((connectedClient) => {
			if (!connectedClient.isReady) {
				throw new Error("Redis client connected without becoming ready");
			}
			return connectedClient;
		})
		.catch((error) => {
			logRedisError(globals, error);
			try {
				// Attempt best-effort cleanup
				// Some client implementations expose destroy/disconnect/quit
				// Try them safely.
				// @ts-ignore
				client.disconnect && client.disconnect();
			} catch {}
			try {
				// @ts-ignore
				client.destroy && client.destroy();
			} catch {}
			resetRedisClient(globals, client);
			throw error;
		})
		.finally(() => {
			if (globals.__impostorRedisConnectPromise__ === connectPromise) {
				globals.__impostorRedisConnectPromise__ = undefined;
			}
		});

	globals.__impostorRedisConnectPromise__ = connectPromise;
	return connectPromise;
}
