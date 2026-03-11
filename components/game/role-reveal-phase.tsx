"use client"

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGame } from "./game-provider"
import { Button } from "@/components/ui/button"
import { getActivePlayersForClues, getRoundStarter } from "@/lib/game-logic";
import { Eye, EyeOff, ChevronRight } from "lucide-react";
import { GameNavbar } from "@/components/game/game-navbar";

export function RoleRevealPhase() {

  const { t } = useTranslation("game");
  const { game, dispatch } = useGame()
	const activePlayers = getActivePlayersForClues(game);
	const roundStarter = getRoundStarter(game);
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);
	const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPlayer = activePlayers[currentIndex];

  const handlePointerDown = () => {
		if (holdTimeoutRef.current) {
			clearTimeout(holdTimeoutRef.current);
		}
		setIsRevealed(true);
		holdTimeoutRef.current = setTimeout(() => {
			setCanAdvance(true);
		}, 500);
  };

  const handlePointerUp = () => {
		setIsRevealed(false);
		if (holdTimeoutRef.current) {
			clearTimeout(holdTimeoutRef.current);
			holdTimeoutRef.current = null;
		}
  };

  const handlePointerLeave = () => {
		setIsRevealed(false);
		if (holdTimeoutRef.current) {
			clearTimeout(holdTimeoutRef.current);
			holdTimeoutRef.current = null;
		}
  };

	useEffect(() => {
		return () => {
			if (holdTimeoutRef.current) {
				clearTimeout(holdTimeoutRef.current);
			}
		};
	}, []);

  const handleNext = () => {
		setIsRevealed(false);
		setCanAdvance(false);
		if (currentIndex + 1 < activePlayers.length) {
			setCurrentIndex(currentIndex + 1);
		} else {
			dispatch({ type: "START_CLUES" });
		}
  };

  if (!currentPlayer) return null;

  // Use shared navbar
  const Header = (
		<GameNavbar
			backHref="/"
			title={t("roleReveal.playerOf", { current: currentIndex + 1, total: activePlayers.length })}
			subtitle={t("common:round", { number: game.currentRound })}
			round={game.currentRound}
		/>
  );

  const isImpostor = currentPlayer.role === "impostor"

	const renderHiddenFace = () => (
		<div className="flex flex-col items-center justify-center py-6">
			<EyeOff className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
			<p className="text-sm text-muted-foreground">{t("roleReveal.holdInstruction")}</p>
		</div>
	);

	const renderRevealedFace = (revealedImpostor: boolean) => (
		<div>
			<p className="text-xs font-mono tracking-widest uppercase mb-3 text-muted-foreground">{t("roleReveal.yourRole")}</p>
			<p className={`text-2xl font-bold mb-4 ${revealedImpostor ? "text-primary" : "text-success"}`}>
				{revealedImpostor ? t("common:theImpostor") : t("common:friend")}
			</p>
			{revealedImpostor ? (
				<div>
					<p className="text-sm text-muted-foreground mb-2">{t("roleReveal.youDoNotKnow")}</p>
					<div className="mt-3 rounded-lg bg-secondary/50 px-4 py-3">
						<p className="text-xs text-muted-foreground mb-1">{t("common:category")}</p>
						<p className="text-lg font-bold text-foreground">{game.category}</p>
					</div>
					{game.impostorHelp && (
						<div className="mt-3 rounded-lg bg-secondary/50 px-4 py-3">
							<p className="text-xs text-muted-foreground mb-1">{t("roleReveal.categoryHint")}</p>
							<p className="text-lg font-bold text-foreground">{game.hint}</p>
						</div>
					)}
					{!game.impostorHelp && <p className="text-xs text-muted-foreground italic mt-3">{t("roleReveal.noHints")}</p>}
				</div>
			) : (
				<div>
					<p className="text-xs text-muted-foreground mb-1">{t("roleReveal.theSecretWord")}</p>
					<p className="text-3xl font-bold text-foreground">{game.secretWord}</p>
					<div className="mt-3 rounded-lg bg-secondary/50 px-4 py-3">
						<p className="text-xs text-muted-foreground mb-1">{t("common:category")}</p>
						<p className="text-lg font-bold text-foreground">{game.category}</p>
					</div>
				</div>
			)}
		</div>
	);

  return (
		<div className="min-h-dvh flex flex-col">
			{Header}
			<div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
				<div className="w-full max-w-sm mx-auto text-center flex flex-col justify-center gap-4 py-4 animate-page-enter">
					{/* Round indicator */}
					<div className="mb-4">
						<p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-1">
							{t("common:round", { number: game.currentRound })}
						</p>
						<p className="text-sm text-muted-foreground">{t("roleReveal.playerOf", { current: currentIndex + 1, total: activePlayers.length })}</p>
					</div>

					{/* Player Name */}
					<h2 className="text-2xl font-bold text-foreground mb-1">{currentPlayer.name}</h2>
					<p className="text-sm text-muted-foreground mb-4">{t("roleReveal.passDevice")}</p>

					{/* Role Card */}
					<div
						className={`relative rounded-2xl border-2 p-6 mb-6 transition-all duration-300 min-h-[220px] flex flex-col justify-center ${
							isRevealed ? (isImpostor ? "border-primary bg-primary/10" : "border-success bg-success/10") : "glow-box border-border"
						}`}>
						<div className="grid">
							<div className="invisible col-start-1 row-start-1 pointer-events-none" aria-hidden="true">
								<div className="grid">
									<div className="col-start-1 row-start-1">{renderHiddenFace()}</div>
									<div className="col-start-1 row-start-1">{renderRevealedFace(false)}</div>
									<div className="col-start-1 row-start-1">{renderRevealedFace(true)}</div>
								</div>
							</div>
							<div className={`${isRevealed ? "visible" : "invisible pointer-events-none"} col-start-1 row-start-1`} aria-hidden={!isRevealed}>
								{renderRevealedFace(isImpostor)}
							</div>
							<div
								className={`${isRevealed ? "invisible pointer-events-none" : "visible"} col-start-1 row-start-1 flex flex-col items-center justify-center`}
								aria-hidden={isRevealed}>
								{renderHiddenFace()}
							</div>
						</div>
					</div>

					{/* Controls */}
					<div className="space-y-3">
						{roundStarter && currentIndex + 1 === activePlayers.length && (
							<p className="text-xs text-center text-muted-foreground">{t("roleReveal.startingPlayer", { name: roundStarter.name })}</p>
						)}
						<Button
							onPointerDown={handlePointerDown}
							onPointerUp={handlePointerUp}
							onPointerCancel={handlePointerUp}
							onPointerLeave={handlePointerLeave}
							size="lg"
							className="w-full h-14 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80 select-none touch-none">
							<Eye className="h-5 w-5 mr-2" />
							{t("roleReveal.holdToReveal")}
						</Button>
						<Button
							onClick={handleNext}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
							disabled={!canAdvance}>
							{currentIndex + 1 < activePlayers.length ? (
								<span className="inline-flex items-center justify-center">
									{t("roleReveal.nextPlayer")}
									<ChevronRight className="h-5 w-5 ml-2" />
								</span>
							) : game.textChatEnabled ? (
								t("roleReveal.startCluePhase")
							) : (
								t("roleReveal.startVotingPhase")
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
  );
}
