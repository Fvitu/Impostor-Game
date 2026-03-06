"use client"

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Scoreboard } from "@/components/game/scoreboard"
import type { GameState } from "@/lib/game-logic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import { getSavedOnlineSession, clearOnlineSession, getResultsGame, clearResultsGame } from "@/lib/storage";

export default function OnlineResultsPage() {
	const router = useRouter();
	const [game, setGame] = useState<GameState | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [replaying, setReplaying] = useState(false);

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

	const session = getSavedOnlineSession();
	const isHost = session?.isHost ?? false;

	const handleReplay = async () => {
		if (!session) {
			clearOnlineSession();
			clearResultsGame();
			router.push("/play/online");
			return;
		}

		if (!isHost) {
			// Non-host: just go back to the online game page to wait for host replay
			clearResultsGame();
			router.push("/play/online");
			return;
		}

		setReplaying(true);
		try {
			const res = await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "replay", code: session.roomCode, playerId: session.playerId }),
			});
			clearResultsGame();
			if (res.ok) {
				router.push("/play/online");
			} else {
				clearOnlineSession();
				router.push("/play/online");
			}
		} catch {
			clearOnlineSession();
			clearResultsGame();
			router.push("/play/online");
		}
	};

	return (
		<>
			{replaying && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
					<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
				</div>
			)}
			<Scoreboard game={game} backPath="/play/online" onReplay={handleReplay} />
		</>
	);
}
