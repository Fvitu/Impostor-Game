"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, LoaderCircle, LogOut, Mail, PencilLine, Shield, Trophy, UserRound, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

function formatPercent(value: number): string {
	return `${Math.round(value)}%`;
}

export function UserStatsPanel() {
	const { t } = useTranslation("landing");
	const { user, stats, logout, updateLeaderboardVisibility, updateUsername } = useAuth();
	const [usernameDraft, setUsernameDraft] = useState(user?.username ?? "");
	const [savingUsername, setSavingUsername] = useState(false);
	const [usernameError, setUsernameError] = useState("");
	const [usernameSuccess, setUsernameSuccess] = useState(false);
	const [savingPreference, setSavingPreference] = useState(false);
	const [error, setError] = useState("");
	const [includeInPublicLeaderboard, setIncludeInPublicLeaderboard] = useState(stats?.includeInPublicLeaderboard ?? true);

	useEffect(() => {
		setUsernameDraft(user?.username ?? "");
	}, [user?.username]);

	useEffect(() => {
		setIncludeInPublicLeaderboard(stats?.includeInPublicLeaderboard ?? true);
	}, [stats?.includeInPublicLeaderboard]);

	const totals = useMemo(() => {
		const totalPoints = stats?.totalPoints ?? 0;
		const totalGames = (stats?.gamesPlayedAsImpostor ?? 0) + (stats?.gamesPlayedAsInnocent ?? 0);
		const totalWins = (stats?.winsAsImpostor ?? 0) + (stats?.winsAsInnocent ?? 0);
		const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

		return {
			totalPoints,
			totalGames,
			winsAsImpostor: stats?.winsAsImpostor ?? 0,
			winsAsInnocent: stats?.winsAsInnocent ?? 0,
			winRate,
		};
	}, [stats]);

	if (!user?.email) {
		return null;
	}

	const handleUsernameSave = async () => {
		const nextUsername = usernameDraft.trim();
		if (!nextUsername || nextUsername === user.username) {
			return;
		}

		setSavingUsername(true);
		setUsernameError("");
		setUsernameSuccess(false);

		const result = await updateUsername(nextUsername);
		if (result.error) {
			setUsernameError(result.error);
			setSavingUsername(false);
			return;
		}

		setUsernameSuccess(true);
		setSavingUsername(false);
		window.setTimeout(() => setUsernameSuccess(false), 1800);
	};

	const handlePreferenceChange = async (nextValue: boolean) => {
		setSavingPreference(true);
		setError("");
		setIncludeInPublicLeaderboard(nextValue);

		const result = await updateLeaderboardVisibility(nextValue);
		if (result.error) {
			setIncludeInPublicLeaderboard(stats?.includeInPublicLeaderboard ?? true);
			setError(t("hero.statsPanel.visibilityError"));
		}

		setSavingPreference(false);
	};

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
			<div className="glow-box rounded-2xl border border-border/70 px-5 py-5">
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2 text-xl font-semibold text-foreground">
							<BarChart3 className="h-5 w-5 text-primary" />
							<span>{t("hero.statsPanel.title")}</span>
						</div>
						<p className="mt-2 text-sm text-muted-foreground">{t("hero.statsPanel.description")}</p>
						<div className="mt-4 space-y-3">
							<div className="space-y-2">
								<p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">{t("hero.statsPanel.usernameLabel")}</p>
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
									<div className="flex-1">
										<Input
											value={usernameDraft}
											onChange={(event) => {
												setUsernameDraft(event.target.value);
												setUsernameError("");
												setUsernameSuccess(false);
											}}
											maxLength={20}
											autoComplete="off"
											disabled={savingUsername}
											className="border-border bg-background/60 text-foreground"
										/>
									</div>
									<Button onClick={() => void handleUsernameSave()} disabled={savingUsername || usernameDraft.trim() === user.username} className="min-w-32 bg-primary text-primary-foreground hover:bg-primary/90">
										{savingUsername ? <LoaderCircle className="h-4 w-4 animate-spin" /> : usernameSuccess ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
										{savingUsername ? t("hero.statsPanel.saving") : usernameSuccess ? t("hero.statsPanel.saved") : t("hero.statsPanel.changeUsername")}
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">{t("hero.statsPanel.usernameRules")}</p>
								{usernameError ? <p className="text-xs text-destructive">{usernameError}</p> : null}
							</div>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Mail className="h-4 w-4" />
								<span className="break-all">{user.email}</span>
							</div>
						</div>
					</div>
					<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => void logout()}>
						<LogOut className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="border-border/70 bg-card/70 py-0">
					<CardContent className="flex items-center gap-3 p-4">
						<Trophy className="h-5 w-5 text-primary" />
						<div>
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("hero.statsPanel.totalPoints")}</p>
							<p className="text-2xl font-bold text-foreground">{totals.totalPoints}</p>
						</div>
					</CardContent>
				</Card>
				<Card className="border-border/70 bg-card/70 py-0">
					<CardContent className="flex items-center gap-3 p-4">
						<Users className="h-5 w-5 text-primary" />
						<div>
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("hero.statsPanel.totalGames")}</p>
							<p className="text-2xl font-bold text-foreground">{totals.totalGames}</p>
						</div>
					</CardContent>
				</Card>
				<Card className="border-border/70 bg-card/70 py-0">
					<CardContent className="flex items-center gap-3 p-4">
						<Shield className="h-5 w-5 text-primary" />
						<div>
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("hero.statsPanel.winsAsImpostor")}</p>
							<p className="text-2xl font-bold text-foreground">{totals.winsAsImpostor}</p>
						</div>
					</CardContent>
				</Card>
				<Card className="border-border/70 bg-card/70 py-0">
					<CardContent className="flex items-center gap-3 p-4">
						<UserRound className="h-5 w-5 text-primary" />
						<div>
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("hero.statsPanel.winsAsInnocent")}</p>
							<p className="text-2xl font-bold text-foreground">{totals.winsAsInnocent}</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
				<div className="glow-box rounded-2xl border border-border/70 px-5 py-5">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-medium text-foreground">{t("hero.statsPanel.winRate")}</p>
							<p className="text-xs text-muted-foreground">
								{totals.totalGames > 0 ? t("hero.statsPanel.winRateDescription") : t("hero.statsPanel.noGamesYet")}
							</p>
						</div>
						<p className="text-3xl font-bold text-primary">{formatPercent(totals.winRate)}</p>
					</div>
				</div>

				<div className="glow-box rounded-2xl border border-border/70 px-5 py-5">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<p className="text-sm font-medium text-foreground">{t("hero.statsPanel.visibilityTitle")}</p>
							<p className="text-xs leading-relaxed text-muted-foreground">{t("hero.statsPanel.visibilityDescription")}</p>
						</div>
						<div className="flex items-center gap-3">
							{savingPreference ? <LoaderCircle className="h-4 w-4 animate-spin text-primary" /> : null}
							<Switch checked={includeInPublicLeaderboard} onCheckedChange={(checked) => void handlePreferenceChange(checked)} disabled={savingPreference} aria-label={t("hero.statsPanel.visibilityTitle")} />
						</div>
					</div>
					<p className="mt-3 text-xs font-mono text-muted-foreground">
						{includeInPublicLeaderboard ? t("hero.statsPanel.visibilityEnabled") : t("hero.statsPanel.visibilityDisabled")}
					</p>
					{error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
				</div>
			</div>
		</div>
	);
}