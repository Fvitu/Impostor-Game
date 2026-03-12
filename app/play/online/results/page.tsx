"use client"

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Scoreboard } from "@/components/game/scoreboard"
import type { GameState } from "@/lib/game-logic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import { getSavedOnlineSession, clearOnlineSession, getResultsGame, clearResultsGame } from "@/lib/storage";

export default function OnlineResultsPage() {
	const { t } = useTranslation("common");
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

	// Move session and polling hooks before any early returns so hook order is stable.
	const session = getSavedOnlineSession();
	const isHost = session?.isHost ?? false;

	// If we're sitting on the results page but the room restarts (host clicked replay),
	// poll the room state and automatically navigate back to the online room when it exists.
	useEffect(() => {
		let mounted = true;
		if (!session || !game) return;

		const checkRoom = async () => {
			try {
				const res = await fetch(`/api/rooms/state?code=${session.roomCode}&pid=${session.playerId}`);
				if (!mounted) return;
				if (res.status === 410 || res.status === 404) {
					// Room ended or removed -> clear and go back
					clearOnlineSession();
					clearResultsGame();
					router.push("/play/online");
					return;
				}

				if (!res.ok) return; // transient error

				const data = await res.json();
				// Detect explicit replay: server will reset game.phase to "setup"
				// while preserving the same game id when the host triggers a replay.
				if (data && data.game && data.game.phase === "setup" && game.phase === "game-over" && data.game.id === game.id) {
					clearResultsGame();
					router.push("/play/online");
				}
			} catch {
				// ignore network errors and retry
			}
		};

		const id = setInterval(checkRoom, 2500);
		void checkRoom();

		return () => {
			mounted = false;
			clearInterval(id);
		};
	}, [session, game, router]);

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
					<p className="text-sm text-muted-foreground mb-4">{t("noGameData")}</p>
					<Button asChild variant="outline" className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
						<Link href="/">
							<Home className="h-4 w-4 mr-2" />
							{t("backToHome")}
						</Link>
					</Button>
				</div>
			</div>
		);
	}

	const handleLeave = async () => {
		// If we have a saved online session and we're the host, tell the server to end the game
		if (session && isHost) {
			try {
				await fetch("/api/rooms/action", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "end-game", code: session.roomCode, playerId: session.playerId }),
				});
			} catch {
				// ignore network errors
			}
		}

		clearResultsGame();
		clearOnlineSession();
		router.push("/play/online");
	};

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
			<Scoreboard game={game} backPath="/play/online" onReplay={handleReplay} onLeave={handleLeave} isHost={isHost} />
		</>
	);
}
