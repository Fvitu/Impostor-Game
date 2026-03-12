"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { UserStats } from "@/lib/user-stats";

interface AuthUser {
	id: string;
	email: string;
	username: string;
	createdAt: number;
}

interface AuthContextValue {
	user: AuthUser | null;
	stats: UserStats | null;
	loading: boolean;
	login: (identifier: string, password: string) => Promise<{ error?: string }>;
	register: (email: string, username: string, password: string) => Promise<{ error?: string }>;
	logout: () => Promise<void>;
	updateUsername: (username: string) => Promise<{ error?: string }>;
	updateLeaderboardVisibility: (includeInPublicLeaderboard: boolean) => Promise<{ error?: string }>;
	refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [stats, setStats] = useState<UserStats | null>(null);
	const [loading, setLoading] = useState(true);

	const refreshUser = useCallback(async () => {
		try {
			const res = await fetch("/api/auth/me");
			if (res.ok) {
				const data = await res.json();
				setUser(data.user ?? null);
				setStats(data.stats ?? null);
			} else {
				setUser(null);
				setStats(null);
			}
		} catch {
			setUser(null);
			setStats(null);
		}
	}, []);

	useEffect(() => {
		refreshUser().finally(() => setLoading(false));
	}, [refreshUser]);

	const login = useCallback(async (identifier: string, password: string): Promise<{ error?: string }> => {
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ identifier, password }),
			});
			const data = await res.json();
			if (!res.ok) {
				return { error: data.error || "Login failed" };
			}
			setUser(data.user);
			await refreshUser();
			return {};
		} catch {
			return { error: "Login failed" };
		}
	}, [refreshUser]);

	const register = useCallback(async (email: string, username: string, password: string): Promise<{ error?: string }> => {
		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, username, password }),
			});
			const data = await res.json();
			if (!res.ok) {
				return { error: data.error || "Registration failed" };
			}
			setUser(data.user);
			await refreshUser();
			return {};
		} catch {
			return { error: "Registration failed" };
		}
	}, [refreshUser]);

	const logout = useCallback(async () => {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch {
			// ignore
		}
		setUser(null);
		setStats(null);
	}, []);

	const updateUsername = useCallback(async (username: string): Promise<{ error?: string }> => {
		try {
			const res = await fetch("/api/auth/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			});
			const data = await res.json();
			if (!res.ok) {
				return { error: data.error || "Failed to update profile" };
			}

			setUser(data.user ?? null);
			setStats(data.stats ?? null);
			return {};
		} catch {
			return { error: "Failed to update profile" };
		}
	}, []);

	const updateLeaderboardVisibility = useCallback(async (includeInPublicLeaderboard: boolean): Promise<{ error?: string }> => {
		try {
			const res = await fetch("/api/auth/stats-visibility", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ includeInPublicLeaderboard }),
			});
			const data = await res.json();
			if (!res.ok) {
				return { error: data.error || "Failed to update leaderboard visibility" };
			}

			setStats(data.stats ?? null);
			return {};
		} catch {
			return { error: "Failed to update leaderboard visibility" };
		}
	}, []);

	return (
		<AuthContext.Provider value={{ user, stats, loading, login, register, logout, updateUsername, updateLeaderboardVisibility, refreshUser }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return ctx;
}
