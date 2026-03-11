"use client"

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGame } from "./game-provider"
import { MAX_PLAYERS, getMaxImpostorCount } from "@/lib/game-logic";
import { getCategoryOptions, getCategoryLabel } from "@/lib/game-data";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CategoryMultiSelect } from "@/components/game/category-multi-select";
import { X, UserPlus, Play, Minus, Plus } from "lucide-react";
import { GameNavbar } from "@/components/game/game-navbar";
import { getSavedLocalPlayers, clearLocalPlayers } from "@/lib/storage";

export function SetupPhase() {
  const { t, i18n } = useTranslation("setup");
  const { game, dispatch } = useGame()
  const [name, setName] = useState("")
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);

  // Load saved player names on mount (for replay)
  useEffect(() => {
		if (loadedFromStorage) return;
		if (game.players.length > 0) {
			// Already have players (e.g., restored from saved state)
			setLoadedFromStorage(true);
			return;
		}
		const savedNames = getSavedLocalPlayers();
		if (savedNames.length > 0) {
			savedNames.forEach((savedName) => {
				dispatch({ type: "ADD_PLAYER", name: savedName });
			});
			clearLocalPlayers();
		}
		setLoadedFromStorage(true);
  }, [loadedFromStorage, dispatch, game.players.length]);

  const handleAddPlayer = () => {
    const trimmed = name.trim()
		if (trimmed && game.players.length < MAX_PLAYERS) {
			dispatch({ type: "ADD_PLAYER", name: trimmed });
			setName("");
		}
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddPlayer()
  }

	const canStart = game.players.length >= 3;
	const maxImpostors = getMaxImpostorCount(game.players.length);
	const categoryOptions = getCategoryOptions(i18n.language);
	const selectedCategoryLabel = getCategoryLabel(game.selectedCategory, i18n.language);

	// Auto-adjust impostor count when player count changes
	useEffect(() => {
		if (game.impostorCount > maxImpostors) {
			dispatch({ type: "SET_IMPOSTOR_COUNT", count: maxImpostors });
		}
	}, [maxImpostors, game.impostorCount, dispatch]);

  return (
		<div className="min-h-dvh flex flex-col">
			<GameNavbar backHref="/" title={t("passAndPlay")} subtitle={t("setupYourGame")} />

			<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full animate-page-enter">
				{/* Player Input */}
				<div className="mb-8">
					<label htmlFor="player-name" className="block text-sm font-medium text-foreground mb-2">
						{t("addPlayers")}
					</label>
					<div className="flex gap-2">
						<Input
							id="player-name"
							placeholder={t("enterPlayerName")}
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={handleKeyDown}
							maxLength={20}
							className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
							autoComplete="off"
						/>
						<Button
							onClick={handleAddPlayer}
							disabled={!name.trim() || game.players.length >= MAX_PLAYERS}
							size="lg"
							className="h-12 px-4 bg-primary text-primary-foreground shrink-0">
							<UserPlus className="h-5 w-5" />
							<span className="sr-only">{t("addPlayer")}</span>
						</Button>
					</div>
					<p className="text-xs text-muted-foreground mt-2 font-mono">
						{t("common:playerCount", { count: game.players.length, max: MAX_PLAYERS })}
						{game.players.length < 3 && ` ${t("common:playerCountMinimum")}`}
					</p>
				</div>

				{/* Player List */}
				<div className="mb-8">
					{game.players.length > 0 && (
						<div className="space-y-2">
							{game.players.map((player, index) => (
								<div key={player.id} className="glow-box flex items-center justify-between rounded-lg px-4 py-3 animate-slide-up">
									<div className="flex items-center gap-3">
										<span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-mono font-bold text-secondary-foreground">
											{index + 1}
										</span>
										<span className="text-sm font-medium text-foreground">{player.name}</span>
									</div>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => dispatch({ type: "REMOVE_PLAYER", playerId: player.id })}
										className="text-muted-foreground hover:text-destructive">
										<X className="h-4 w-4" />
										<span className="sr-only">{t("removePlayer", { name: player.name })}</span>
									</Button>
								</div>
							))}
						</div>
					)}
					{game.players.length === 0 && (
						<div className="rounded-lg border border-dashed border-border py-12 text-center">
							<p className="text-sm text-muted-foreground">{t("noPlayersYet")}</p>
						</div>
					)}
				</div>

				{/* Impostor Count Selector */}
				{game.players.length >= 3 && (
					<div className="mb-4 glow-box flex items-center justify-between rounded-lg px-4 py-4">
						<div>
							<p className="text-sm font-medium text-foreground">{t("numberOfImpostors")}</p>
							<p className="text-xs text-muted-foreground">{t("maxImpostorsFor", { max: maxImpostors, count: game.players.length })}</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon-sm"
								onClick={() => dispatch({ type: "SET_IMPOSTOR_COUNT", count: Math.max(1, game.impostorCount - 1) })}
								disabled={game.impostorCount <= 1}
								className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
								<Minus className="h-4 w-4" />
							</Button>
							<span className="w-8 text-center text-lg font-bold font-mono text-foreground">{game.impostorCount}</span>
							<Button
								variant="outline"
								size="icon-sm"
								onClick={() => dispatch({ type: "SET_IMPOSTOR_COUNT", count: Math.min(maxImpostors, game.impostorCount + 1) })}
								disabled={game.impostorCount >= maxImpostors}
								className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
								<Plus className="h-4 w-4" />
							</Button>
						</div>
					</div>
				)}

				<div className="mb-4 glow-box rounded-lg px-4 py-4">
					<div className="mb-3">
						<p className="text-sm font-medium text-foreground">{t("wordCategory")}</p>
						<p className="text-xs text-muted-foreground">{t("wordCategoryDesc")}</p>
					</div>
					<CategoryMultiSelect
						value={game.selectedCategory}
						onChange={(value) => {
							dispatch({ type: "SET_CATEGORY_SELECTION", category: value });
						}}
						options={categoryOptions}
						allLabel={t("allCategories")}
						displayLabel={selectedCategoryLabel}
					/>
				</div>

				{/* Impostor Help Toggle */}
				<div className="mb-8 glow-box flex items-center justify-between rounded-lg px-4 py-4">
					<div>
						<p className="text-sm font-medium text-foreground">{t("impostorHint")}</p>
						<p className="text-xs text-muted-foreground">{t("impostorHintDesc")}</p>
					</div>
					<Switch checked={game.impostorHelp} onCheckedChange={(checked) => dispatch({ type: "SET_IMPOSTOR_HELP", help: checked })} />
				</div>

				<div className="mb-4 glow-box flex items-center justify-between rounded-lg px-4 py-4">
					<div>
						<p className="text-sm font-medium text-foreground">{t("textChat")}</p>
						<p className="text-xs text-muted-foreground">{t("textChatDesc")}</p>
					</div>
					<Switch checked={game.textChatEnabled} onCheckedChange={(checked) => dispatch({ type: "SET_TEXT_CHAT_ENABLED", enabled: checked })} />
				</div>

				<div className="mb-8 glow-box flex items-center justify-between rounded-lg px-4 py-4">
					<div>
						<p className="text-sm font-medium text-foreground">{t("individualVoting")}</p>
						<p className="text-xs text-muted-foreground">{t("individualVotingDesc")}</p>
					</div>
					<Switch
						checked={game.individualVotingEnabled}
						onCheckedChange={(checked) => dispatch({ type: "SET_INDIVIDUAL_VOTING_ENABLED", enabled: checked })}
					/>
				</div>

				{/* Start Game */}
				<Button
					onClick={() => dispatch({ type: "START_GAME", language: i18n.language, categorySelection: game.selectedCategory })}
					disabled={!canStart}
					size="lg"
					className="w-full h-14 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
					<Play className="h-5 w-5 mr-2" />
					{t("common:startGame")}
				</Button>
				{!canStart && (
					<p className="text-xs text-center text-muted-foreground mt-3 font-mono">
						{t("common:needMorePlayers", { count: 3 - game.players.length })}
					</p>
				)}
			</div>
		</div>
  );
}
