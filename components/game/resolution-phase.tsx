"use client"

import { useGame } from "./game-provider"
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Trophy, Skull, ArrowRight, RotateCcw } from "lucide-react"
import Link from "next/link"
import { GameNavbar } from "@/components/game/game-navbar";
import { saveLocalPlayers, saveResultsGame, clearLocalGameState } from "@/lib/storage";

export function ResolutionPhase() {
	const { t } = useTranslation('game')
	const { game, dispatch } = useGame();
	const lastResult = game.roundResults[game.roundResults.length - 1];

	if (!lastResult) return null;

	const eliminatedPlayer = lastResult.eliminatedPlayer ? game.players.find((p) => p.id === lastResult.eliminatedPlayer) : null;
	const roundVoterIds = Object.keys(lastResult.votes);
	const roundPlayers = game.players.filter((p) => roundVoterIds.includes(p.id));
	const voteCountByPlayer = roundPlayers.map((player) => {
		const receivedVotes = Object.values(lastResult.votes).filter((targetId) => targetId === player.id).length;
		return { player, receivedVotes };
	});
	const maxVotesReceived = Math.max(1, ...voteCountByPlayer.map((entry) => entry.receivedVotes));

	const Header = <GameNavbar backHref="/" title={""} subtitle={t('common:roundResult', { number: game.currentRound })} round={game.currentRound} />;

	return (
		<div className="min-h-dvh flex flex-col">
			{Header}
			<div className="flex-1 flex items-center justify-center px-4">
				<div className="w-full max-w-sm mx-auto text-center animate-page-enter">
					<p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-4">
						{t('common:roundResult', { number: game.currentRound })}
					</p>

					{lastResult.wasTie ? (
						<div>
							<div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
								<RotateCcw className="h-8 w-8 text-muted-foreground" />
							</div>
							<h2 className="text-2xl font-bold text-foreground mb-3">{t('resolution.tieTitle')}</h2>
							<p className="text-sm text-muted-foreground mb-2">{t('resolution.tieDescription')}</p>
							<p className="text-sm text-muted-foreground">{t('resolution.tieSurvivalPoints')}</p>
						</div>
					) : eliminatedPlayer ? (
						<div>
							{!lastResult.impostorSurvived ? (
								<>
									<div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
										<Trophy className="h-8 w-8 text-success" />
									</div>
									<h2 className="text-2xl font-bold text-success mb-3">{t('resolution.impostorFound')}</h2>
									<p className="text-sm text-muted-foreground mb-2">
										<span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
										{" "}{t('resolution.wasImpostor')}
									</p>
									<p className="text-sm text-muted-foreground">
										{t('resolution.secretWordWas')}{" "}
										<span className="font-bold text-foreground">{game.secretWord}</span>
									</p>
								</>
							) : (
								<>
									<div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
										<Skull className="h-8 w-8 text-destructive" />
									</div>
									<h2 className="text-2xl font-bold text-destructive mb-3">{t('resolution.wrongPerson')}</h2>
									<p className="text-sm text-muted-foreground mb-2">
										<span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
										{" "}{t('resolution.wasFriend')}
									</p>
									<p className="text-sm text-muted-foreground">{t('resolution.impostorSurvives')}</p>
								</>
							)}
						</div>
					) : null}

					{/* Vote Results */}
					<div className="mt-8 mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t('resolution.voteResults')}</p>
						<div className="space-y-2">
							{voteCountByPlayer
								.sort((a, b) => b.receivedVotes - a.receivedVotes || a.player.name.localeCompare(b.player.name))
								.map(({ player, receivedVotes }) => {
									const barWidth = `${(receivedVotes / maxVotesReceived) * 100}%`;
									const isEliminatedThisRound = lastResult.eliminatedPlayer === player.id;
									return (
										<div key={player.id} className="glow-box rounded-lg px-4 py-3">
											<div className="flex items-center justify-between mb-2">
												<span className="text-sm text-foreground">{player.name}</span>
												<span className="text-xs text-muted-foreground font-mono">
													{t('resolution.voteCount', { count: receivedVotes })}
												</span>
											</div>
											<div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
												<div className="h-full bg-primary" style={{ width: barWidth }} />
											</div>
											{isEliminatedThisRound && <p className="text-xs text-muted-foreground mt-2">{t('resolution.eliminatedThisRound')}</p>}
										</div>
									);
								})}
						</div>
					</div>

					{/* Continue or End */}
					{game.phase === "game-over" ? (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground mb-4">
								{t('common:gameOver')}{" "}{game.winner === "friends" ? t('common:friendsWin') : t('common:impostorsWin')}
							</p>
							<Link
								href="/play/local/results"
								onClick={() => {
									saveResultsGame(game);
									saveLocalPlayers(game.players.map((p) => p.name));
									clearLocalGameState();
								}}>
								<Button size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
									<Trophy className="h-5 w-5 mr-2" />
									{t('common:viewFinalScores')}
								</Button>
							</Link>
							<Button
								onClick={() => dispatch({ type: "REPLAY" })}
								variant="outline"
								size="lg"
								className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground mt-2">
								<RotateCcw className="h-5 w-5 mr-2" />
								{t('common:playAgainSamePlayers')}
							</Button>
						</div>
					) : (
						<Button
							onClick={() => dispatch({ type: "NEXT_ROUND" })}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							{t('common:nextRound')}
							<ArrowRight className="h-5 w-5 ml-2" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}