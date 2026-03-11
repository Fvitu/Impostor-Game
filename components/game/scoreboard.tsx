"use client"

import type { GameState } from "@/lib/game-logic"
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Trophy, Medal, Shield, EyeOff, RotateCcw, Home } from "lucide-react"
import Link from "next/link"
import { saveLocalPlayers } from "@/lib/storage";

interface ScoreboardProps {
	game: GameState;
	backPath: string;
	onReplay?: () => void;
}

export function Scoreboard({ game, backPath, onReplay }: ScoreboardProps) {
	const { t } = useTranslation('scoreboard')
	const sortedPlayers = [...game.players].sort((a, b) => b.totalScore - a.totalScore);
	const winner = game.winner;
	const impostors = game.players.filter((p) => p.role === "impostor");

	return (
		<div className="min-h-dvh flex flex-col animate-page-enter">
			{/* Header */}
			<div className="text-center pt-12 pb-8 px-4 animate-page-enter animate-page-enter-delay-1">
				<div
					className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
						winner === "friends" ? "bg-success/10" : "bg-primary/10"
					}`}>
					<Trophy className={`h-10 w-10 ${winner === "friends" ? "text-success" : "text-primary"}`} />
				</div>
				<p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-2">{t('gameOver')}</p>
				<h1 className="text-3xl font-bold text-foreground mb-2">{winner === "friends" ? t('friendsWin') : t('impostorsWin')}</h1>
				<p className="text-sm text-muted-foreground">
					{winner === "friends" ? t('friendsWinDesc') : t('impostorsWinDesc')}
				</p>

				{/* Impostor Reveal */}
				{impostors.length > 0 && (
					<div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-5 py-2">
						<EyeOff className="h-4 w-4 text-primary" />
						<span className="text-sm font-medium text-foreground">
							{t('impostorsLabel')}
							<span className="text-primary font-bold">{impostors.map((p) => p.name).join(", ")}</span>
						</span>
					</div>
				)}

				{/* Secret Word */}
				<div className="mt-4">
					<span className="text-xs font-mono text-muted-foreground">{t('secretWordLabel')}</span>
					<span className="text-sm font-bold text-foreground">{game.secretWord}</span>
					<span className="text-xs font-mono text-muted-foreground ml-2">
						{"("}
						{game.category}
						{")"}
					</span>
				</div>
			</div>

			{/* Scoreboard */}
			<div className="flex-1 px-4 pb-8 max-w-lg mx-auto w-full animate-page-enter animate-page-enter-delay-2">
				<p className="text-xs font-mono text-muted-foreground uppercase mb-4">{t('finalScores')}</p>
				<div className="space-y-3">
					{sortedPlayers.map((player, index) => {
						const isImpostor = player.role === "impostor";
						const isFirst = index === 0;
						return (
							<div
								key={player.id}
								className={`rounded-xl border p-4 transition-all animate-page-enter ${isFirst ? "border-warning/30 bg-warning/5" : "glow-box"}`}
								style={{ animationDelay: `${Math.min(index * 45, 220)}ms` }}>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										{/* Rank */}
										<div
											className={`flex h-10 w-10 items-center justify-center rounded-full ${
												isFirst
													? "bg-warning text-warning-foreground"
													: index === 1
														? "bg-muted text-foreground"
														: index === 2
															? "bg-primary/20 text-primary"
															: "bg-secondary text-secondary-foreground"
											}`}>
											{isFirst ? <Medal className="h-5 w-5" /> : <span className="text-sm font-mono font-bold">{index + 1}</span>}
										</div>
										<div>
											<div className="flex items-center gap-2">
												<span className="text-sm font-bold text-foreground">{player.name}</span>
												{isImpostor ? (
													<span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-mono">{t('impostor')}</span>
												) : (
													<span className="text-xs rounded-full bg-success/10 text-success px-2 py-0.5 font-mono">{t('friend')}</span>
												)}
												{player.isEliminated && (
													<span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-mono">{t('out')}</span>
												)}
											</div>
											<div className="flex gap-2 mt-1">
												{player.scores.map((score, i) => (
													<span key={i} className="text-xs font-mono text-muted-foreground">
														{t('roundScore', { round: i + 1, score })}
													</span>
												))}
											</div>
										</div>
									</div>
									<div className="text-right">
										<p className="text-2xl font-bold text-foreground font-mono">{player.totalScore}</p>
										<p className="text-xs text-muted-foreground">{t('pts')}</p>
									</div>
								</div>
							</div>
						);
					})}
				</div>

				{/* Round History */}
				<div className="mt-8">
					<p className="text-xs font-mono text-muted-foreground uppercase mb-4">{t('roundHistory')}</p>
					<div className="space-y-3">
						{game.roundResults.map((result) => (
							<div key={result.round} className="glow-box rounded-lg px-4 py-3">
								<div className="flex items-center justify-between mb-2">
									<span className="text-sm font-bold text-foreground">
										{t('roundLabel', { number: result.round })}
									</span>
									<span
										className={`text-xs font-mono px-2 py-0.5 rounded-full ${
											result.wasTie
												? "bg-secondary text-secondary-foreground"
												: !result.impostorSurvived
													? "bg-success/10 text-success"
													: "bg-primary/10 text-primary"
										}`}>
										{result.wasTie ? t('tie') : !result.impostorSurvived ? t('impostorFound') : t('impostorSurvived')}
									</span>
								</div>
								{result.eliminatedPlayer && (
									<p className="text-xs text-muted-foreground">
										{t('eliminated')}
										<span className="text-foreground">{game.players.find((p) => p.id === result.eliminatedPlayer)?.name}</span>
									</p>
								)}
							</div>
						))}
					</div>
				</div>

				{/* Actions */}
				<div className="mt-8 space-y-3">
					{onReplay ? (
						<Button onClick={onReplay} size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							<RotateCcw className="h-5 w-5 mr-2" />
							{t('common:playAgain')}
						</Button>
					) : (
						<Button
							asChild
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
							onClick={() => saveLocalPlayers(game.players.map((p) => p.name))}>
							<Link href={backPath}>
								<RotateCcw className="h-5 w-5 mr-2" />
								{t('common:playAgain')}
							</Link>
						</Button>
					)}
					<Button
						asChild
						size="lg"
						variant="outline"
						className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
						<Link href="/">
							<Home className="h-5 w-5 mr-2" />
							{t('common:backToHome')}
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
