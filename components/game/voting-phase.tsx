"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next";
import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { getActivePlayersForVoting, getRoundStarter, allVotesIn } from "@/lib/game-logic";
import { Vote, Check, ChevronRight, MessageSquare } from "lucide-react";
import { GameNavbar } from "@/components/game/game-navbar";

export function VotingPhase() {
  const { t } = useTranslation("game");
  const { game, dispatch } = useGame()
  const activePlayers = getActivePlayersForVoting(game)
	const roundStarter = getRoundStarter(game);
  const [currentVoterIndex, setCurrentVoterIndex] = useState(0)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [phase, setPhase] = useState<"pass" | "vote">("pass")

  const currentVoter = activePlayers[currentVoterIndex]

  // Gather all clues for this round
  const cluesThisRound = activePlayers.map((p) => ({
		id: p.id,
		name: p.name,
		clue: p.clues[game.currentRound - 1] || t("clues.noClue"),
  }));

  const hostControlledVoting = !game.individualVotingEnabled;

  if (hostControlledVoting) {
		return (
			<div className="min-h-dvh flex flex-col">
				<GameNavbar
					backHref="/"
					title={t("voting.hostElimination")}
					subtitle={t("voting.hostEliminationSubtitle", { round: game.currentRound })}
					round={game.currentRound}
				/>

				<div className="flex-1 flex items-center justify-center px-4">
					<div className="max-w-lg w-full py-6 mx-auto flex flex-col animate-page-enter">
						{game.textChatEnabled && (
							<div className="mb-6">
								<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t("voting.clueSummary")}</p>
								<div className="space-y-2">
									{cluesThisRound.map((c) => (
										<div key={c.id} className="glow-box flex items-center gap-3 rounded-lg px-4 py-2.5">
											<MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
											<span className="text-sm font-medium text-foreground">{c.name}</span>
											<span className="text-sm text-muted-foreground ml-auto font-mono">
												{'"'}
												{c.clue}
												{'"'}
											</span>
										</div>
									))}
								</div>
							</div>
						)}

						{!game.textChatEnabled && <p className="text-sm text-muted-foreground text-center mb-4">{t("voting.textChatDisabled")}</p>}
						{!game.textChatEnabled && roundStarter && (
							<p className="text-xs text-center text-muted-foreground mb-6">{t("voting.startingPlayer", { name: roundStarter.name })}</p>
						)}

						<div className="space-y-2 mb-6">
							{activePlayers.map((player) => (
								<button
									key={player.id}
									onClick={() => setSelectedTarget(player.id)}
									className={`w-full flex items-center justify-between rounded-lg border px-4 py-4 transition-all ${
										selectedTarget === player.id
											? "border-primary bg-primary/10 text-foreground"
											: "border-border glow-box text-foreground hover:border-muted-foreground"
									}`}>
									<span className="text-sm font-medium">{player.name}</span>
									{selectedTarget === player.id && <Check className="h-5 w-5 text-primary" />}
								</button>
							))}
						</div>

						<Button
							onClick={() => {
								if (selectedTarget) {
									dispatch({ type: "ELIMINATE_PLAYER", playerId: selectedTarget });
									setSelectedTarget(null);
								}
							}}
							disabled={!selectedTarget}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
							<Vote className="h-5 w-5 mr-2" />
							{t("voting.eliminateSelected")}
						</Button>
					</div>
				</div>
			</div>
		);
  }

  const handleVote = () => {
    if (!selectedTarget || !currentVoter) return
    dispatch({ type: "SUBMIT_VOTE", voterId: currentVoter.id, targetId: selectedTarget })
    setSelectedTarget(null)
    setPhase("pass")

    if (currentVoterIndex + 1 < activePlayers.length) {
      setCurrentVoterIndex(currentVoterIndex + 1)
    }
  }

  // Check if all votes are in after dispatching
  const allVoted = allVotesIn(game)
  const readyToResolve = allVoted || currentVoterIndex >= activePlayers.length

  if (readyToResolve && allVoted) {
    return (
		<div className="min-h-dvh flex flex-col items-center justify-center px-4">
			<div className="text-center max-w-sm animate-slide-up">
				<Vote className="h-12 w-12 text-primary mx-auto mb-6 animate-pulse-glow" />
				<h2 className="text-2xl font-bold text-foreground mb-3">{t("voting.allVotesIn")}</h2>
				<p className="text-sm text-muted-foreground mb-8">{t("voting.gatherEveryone")}</p>
				<Button
					onClick={() => dispatch({ type: "RESOLVE_ROUND" })}
					size="lg"
					className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
					{t("voting.revealResults")}
				</Button>
			</div>
		</div>
	);
  }

  if (!currentVoter) return null

  return (
		<div className="min-h-dvh flex flex-col">
			<GameNavbar backHref="/" title={t("voting.title")} subtitle={t("voting.subtitle", { round: game.currentRound })} round={game.currentRound} />

			<div className="flex-1 flex items-center justify-center px-4">
				<div className="max-w-lg w-full py-6 mx-auto flex flex-col animate-page-enter">
					{/* Clue Summary */}
					{game.textChatEnabled && (
						<div className="mb-6">
							<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t("voting.clueSummary")}</p>
							<div className="space-y-2">
								{cluesThisRound.map((c) => (
									<div key={c.id} className="glow-box flex items-center gap-3 rounded-lg px-4 py-2.5">
										<MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										<span className="text-sm font-medium text-foreground">{c.name}</span>
										<span className="text-sm text-muted-foreground ml-auto font-mono">
											{'"'}
											{c.clue}
											{'"'}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Voting Area */}
					<div className="flex-1 flex flex-col">
						{phase === "pass" ? (
							<div className="flex-1 flex flex-col items-center justify-center text-center animate-page-enter animate-page-enter-delay-1">
								{!game.textChatEnabled && roundStarter && (
									<p className="text-xs font-mono text-muted-foreground uppercase mb-3">
										{t("voting.startingPlayer", { name: roundStarter.name })}
									</p>
								)}
								<h2 className="text-2xl font-bold text-foreground mb-2">{currentVoter.name}</h2>
								<p className="text-sm text-muted-foreground mb-8">{t("voting.passDevice")}</p>
								<Button
									onClick={() => setPhase("vote")}
									size="lg"
									className="w-full max-w-xs h-14 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80">
									<ChevronRight className="h-5 w-5 mr-2" />
									{t("voting.imReadyToVote")}
								</Button>
							</div>
						) : (
							<div className="animate-slide-up">
								<p className="text-sm text-muted-foreground mb-1 text-center">{t("voting.whoIsImpostorName", { name: currentVoter.name })}</p>
								<p className="text-xs text-center text-muted-foreground mb-6">{t("voting.tapToSelect")}</p>
								<div className="space-y-2 mb-6">
									{activePlayers
										.filter((p) => p.id !== currentVoter.id)
										.map((player) => (
											<button
												key={player.id}
												onClick={() => setSelectedTarget(player.id)}
												className={`w-full flex items-center justify-between rounded-lg border px-4 py-4 transition-all ${
													selectedTarget === player.id
														? "border-primary bg-primary/10 text-foreground"
														: "border-border glow-box text-foreground hover:border-muted-foreground"
												}`}>
												<span className="text-sm font-medium">{player.name}</span>
												{selectedTarget === player.id && <Check className="h-5 w-5 text-primary" />}
											</button>
										))}
								</div>
								<Button
									onClick={handleVote}
									disabled={!selectedTarget}
									size="lg"
									className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
									<Vote className="h-5 w-5 mr-2" />
									{t("voting.confirmVote")}
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
  );
}
