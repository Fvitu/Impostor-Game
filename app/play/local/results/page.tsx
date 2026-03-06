"use client"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Scoreboard } from "@/components/game/scoreboard"
import type { GameState } from "@/lib/game-logic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import { getResultsGame, clearResultsGame, saveLocalGameState } from "@/lib/storage";
import { replayGame } from "@/lib/game-logic";

export default function LocalResultsPage() {
	const router = useRouter();
	const [game, setGame] = useState<GameState | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		const savedGame = getResultsGame();
		if (savedGame) {
			setGame(savedGame);
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

	if (!game) {
		return (
			<div className="min-h-dvh bg-background flex items-center justify-center px-4">
				<div className="text-center animate-page-enter">
					<p className="text-sm text-muted-foreground mb-4">No game data found.</p>
					<Button asChild variant="outline" className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
						<Link href="/">
							<Home className="h-4 w-4 mr-2" />
							Back to Home
						</Link>
					</Button>
				</div>
			</div>
		);
	}

	const handleReplay = () => {
		clearResultsGame();
		// Persist a replay-ready setup state so local preferences and cumulative scores survive.
		saveLocalGameState(replayGame(game));
		router.push("/play/local");
	};

	return <Scoreboard game={game} backPath="/play/local" onReplay={handleReplay} />;
}
