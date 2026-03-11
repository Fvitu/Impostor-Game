"use client"

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GameProvider } from "@/components/game/game-provider"
import { GameOrchestrator } from "@/components/game/game-orchestrator"
import { getSavedLocalGameState, clearLocalGameState } from "@/lib/storage";
import type { GameState } from "@/lib/game-logic";
import { DEFAULT_CATEGORY_SELECTION, isCategorySelection } from "@/lib/game-data";
import { Button } from "@/components/ui/button";
import { RotateCcw, Play, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { GameNavbar } from "@/components/game/game-navbar";

/** Fix game state integrity issues that could cause infinite loops on resume */
function validateResumedState(state: GameState): GameState {
	// If in clues phase but text chat is disabled, skip to voting
	if (state.phase === "clues" && !state.textChatEnabled) {
		return { ...state, phase: "voting", currentPlayerIndex: 0 };
	}

	// If in clues phase, ensure currentPlayerIndex is within bounds
	if (state.phase === "clues") {
		const activePlayers = state.players.filter((p) => !p.isEliminated);
		if (state.currentPlayerIndex >= activePlayers.length) {
			return { ...state, phase: "voting", currentPlayerIndex: 0 };
		}
	}

	// Ensure impostorCount exists (for older saved states)
	if (!state.impostorCount) {
		state = { ...state, impostorCount: 1 };
	}

	// Ensure selectedCategory exists and is valid (for older saved states)
	if (!state.selectedCategory || !isCategorySelection(state.selectedCategory)) {
		state = { ...state, selectedCategory: DEFAULT_CATEGORY_SELECTION };
	}

	// Ensure hint exists (for older saved states)
	if (typeof state.hint !== "string") {
		state = { ...state, hint: "" };
	}

	return state;
}

export default function LocalPlayPage() {
  const { t } = useTranslation(["setup", "common"]);
  const [initialState, setInitialState] = useState<GameState | undefined>(undefined);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState(0); // Force re-mount of GameProvider

  useEffect(() => {
		const saved = getSavedLocalGameState();
		if (saved && saved.phase !== "game-over") {
			// Restore any non-finished state, including setup preferences/players.
			const restored = validateResumedState(saved);
			setInitialState(restored);
			if (restored.phase !== "setup") {
				setShowResumePrompt(true);
			}
		} else if (saved && saved.phase === "game-over") {
			// Game is over, clear the saved state
			clearLocalGameState();
		}
		setLoaded(true);
  }, []);

  if (!loaded) {
		return (
			<div className="min-h-dvh bg-background flex items-center justify-center">
				<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
			</div>
		);
  }

  if (showResumePrompt && initialState) {
		return (
			<div className="min-h-dvh flex flex-col">
				<GameNavbar backHref="/" title={t("setup:passAndPlay")} subtitle={t("setup:gameInProgress")} />
				<div className="flex-1 flex items-center justify-center px-4">
					<div className="w-full max-w-sm mx-auto text-center animate-page-enter">
						<RotateCcw className="h-12 w-12 text-primary mx-auto mb-6" />
						<h2 className="text-2xl font-bold text-foreground mb-3">{t("setup:resumeGame")}</h2>
						<p className="text-sm text-muted-foreground mb-2">{t("setup:inProgressDesc", { count: initialState.players.length })}</p>
						<p className="text-sm text-muted-foreground mb-8">
							{t("setup:roundPhase", { round: initialState.currentRound, phase: initialState.phase })}
						</p>
						<div className="space-y-3">
							<Button
								onClick={() => {
									setShowResumePrompt(false);
									// initialState is already set, GameProvider will use it
								}}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								<Play className="h-5 w-5 mr-2" />
								{t("setup:resumeButton")}
							</Button>
							<Button
								onClick={() => {
									clearLocalGameState();
									setInitialState(undefined);
									setShowResumePrompt(false);
									setKey((k) => k + 1);
								}}
								variant="outline"
								size="lg"
								className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
								<RotateCcw className="h-5 w-5 mr-2" />
								{t("setup:startNewGame")}
							</Button>
						</div>
					</div>
				</div>
			</div>
		);
  }

  return (
		<GameProvider key={key} mode="pass-and-play" initialState={initialState}>
			<GameOrchestrator />
		</GameProvider>
  );
}
