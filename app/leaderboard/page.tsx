"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { GameNavbar } from "@/components/game/game-navbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trophy, Crown, Skull, Users, RefreshCw, Percent } from "lucide-react";
import { getCategoryOptions, type GameCategoryId } from "@/lib/game-data";
import { useLanguage } from "@/hooks/use-language";

interface LeaderboardEntry {
	rank: number;
	userId: string;
	username: string;
	totalPoints: number;
	winsAsImpostor: number;
	winsAsInnocent: number;
	totalGames: number;
	winRate: number;
}

export default function LeaderboardPage() {
	const { t } = useTranslation("leaderboard");
	const { language } = useLanguage();
	const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedCategory, setSelectedCategory] = useState<string>("all");

	const categoryOptions = getCategoryOptions(language);

	const fetchLeaderboard = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams();
			if (selectedCategory && selectedCategory !== "all") {
				params.set("category", selectedCategory);
			}
			const res = await fetch(`/api/leaderboard?${params.toString()}`);
			if (res.ok) {
				const data = await res.json();
				setEntries(data.entries ?? []);
			}
		} catch {
			// silently fail
		}
		setLoading(false);
	}, [selectedCategory]);

	useEffect(() => {
		fetchLeaderboard();
	}, [fetchLeaderboard]);

	return (
		<div className="min-h-dvh flex flex-col animate-page-enter">
			<GameNavbar backHref="/" title={t("title")} subtitle={t("subtitle")} />

			<div className="flex-1 flex flex-col px-4 py-6 max-w-3xl mx-auto w-full">
				{/* Category filter */}
				<div className="mb-6">
					<div className="flex items-center gap-2 mb-3">
						<Trophy className="h-5 w-5 text-primary" />
						<h2 className="text-lg font-bold text-foreground">{t("filterByCategory")}</h2>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant={selectedCategory === "all" ? "default" : "outline"}
							size="sm"
							onClick={() => setSelectedCategory("all")}
							className={
								selectedCategory === "all"
									? "bg-primary text-primary-foreground hover:bg-primary/90"
									: "border-border text-foreground hover:bg-secondary hover:text-secondary-foreground"
							}>
							{t("allCategories")}
						</Button>
						{categoryOptions.map((cat) => (
							<Button
								key={cat.id}
								variant={selectedCategory === cat.id ? "default" : "outline"}
								size="sm"
								onClick={() => setSelectedCategory(cat.id)}
								className={
									selectedCategory === cat.id
										? "bg-primary text-primary-foreground hover:bg-primary/90"
										: "border-border text-foreground hover:bg-secondary hover:text-secondary-foreground"
								}>
								{cat.label}
							</Button>
						))}
					</div>
				</div>

				{/* Leaderboard table */}
				<div className="glow-box rounded-xl overflow-hidden">
					{loading ? (
						<div className="flex items-center justify-center py-16">
							<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
						</div>
					) : entries.length === 0 ? (
						<div className="text-center py-16">
							<Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
							<p className="text-muted-foreground">{t("noEntries")}</p>
							<p className="text-xs text-muted-foreground mt-2">{t("noEntriesHint")}</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow className="border-border">
									<TableHead className="w-12 text-center">#</TableHead>
									<TableHead>{t("player")}</TableHead>
									<TableHead className="text-center">
										<div className="flex items-center justify-center gap-1">
											<Trophy className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">{t("points")}</span>
										</div>
									</TableHead>
									<TableHead className="text-center">
										<div className="flex items-center justify-center gap-1">
											<Skull className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">{t("winsImpostor")}</span>
										</div>
									</TableHead>
									<TableHead className="text-center">
										<div className="flex items-center justify-center gap-1">
											<Crown className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">{t("winsInnocent")}</span>
										</div>
									</TableHead>
									<TableHead className="text-center">
										<div className="flex items-center justify-center gap-1">
											<Users className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">{t("games")}</span>
										</div>
									</TableHead>
									<TableHead className="text-center">
										<div className="flex items-center justify-center gap-1">
											<Percent className="h-3.5 w-3.5" />
											<span className="hidden sm:inline">{t("winRate")}</span>
										</div>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{entries.map((entry) => (
									<TableRow key={entry.userId} className="border-border">
										<TableCell className="text-center font-mono text-muted-foreground">
											{entry.rank <= 3 ? (
												<span
													className={
														entry.rank === 1
															? "text-yellow-400 font-bold"
															: entry.rank === 2
																? "text-gray-300 font-bold"
																: "text-amber-600 font-bold"
													}>
													{entry.rank}
												</span>
											) : (
												entry.rank
											)}
										</TableCell>
										<TableCell className="font-medium text-foreground">{entry.username}</TableCell>
										<TableCell className="text-center font-mono text-primary font-bold">{entry.totalPoints}</TableCell>
										<TableCell className="text-center font-mono text-muted-foreground">{entry.winsAsImpostor}</TableCell>
										<TableCell className="text-center font-mono text-muted-foreground">{entry.winsAsInnocent}</TableCell>
										<TableCell className="text-center font-mono text-muted-foreground">{entry.totalGames}</TableCell>
										<TableCell className="text-center font-mono text-muted-foreground">{entry.winRate.toFixed(1)}%</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>

				{/* Refresh button */}
				<div className="flex justify-center mt-4">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void fetchLeaderboard()}
						disabled={loading}
						className="text-muted-foreground hover:text-foreground">
						<RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
						{t("refresh")}
					</Button>
				</div>
			</div>
		</div>
	);
}
