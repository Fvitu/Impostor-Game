"use client"

import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { OnlineLobby } from "@/components/online/online-lobby"
import { OnlineGameView } from "@/components/online/online-game-view"
import { getSavedOnlineSession, saveOnlineSession, clearOnlineSession, getWaitingSession, clearWaitingSession } from "@/lib/storage";

export default function OnlinePlayPage() {
	const { t } = useTranslation('online');
	const [session, setSession] = useState<{
		code: string;
		playerId: string;
		isHost: boolean;
	} | null>(null);
	const [checking, setChecking] = useState(true);

	// On mount, check for saved online session and try to reconnect
	useEffect(() => {
		const tryReconnect = async () => {
			const saved = getSavedOnlineSession();
			if (!saved) {
				// Also check for waiting session
				const waiting = getWaitingSession();
				if (waiting) {
					// Don't auto-set session, let the lobby handle it
					clearWaitingSession();
				}
				setChecking(false);
				return;
			}

			// Try a few times before giving up — transient network errors or
			// quick server-side propagation can cause false negatives on reload.
			for (let attempt = 0; attempt < 4; attempt++) {
				try {
					const res = await fetch(`/api/rooms/state?code=${saved.roomCode}&pid=${saved.playerId}`);
					if (res.status === 410) {
						// Room was ended by host — definitely clear session
						clearOnlineSession();
						setChecking(false);
						return;
					}
					if (res.ok) {
						const data = await res.json();
						const stillInRoom = data.game?.players?.some((p: { id: string }) => p.id === saved.playerId);
						if (stillInRoom) {
							setSession({
								code: saved.roomCode,
								playerId: saved.playerId,
								isHost: saved.playerId === data.hostId,
							});
							saveOnlineSession({
								...saved,
								isHost: saved.playerId === data.hostId,
							});
							setChecking(false);
							return;
						}
					}
				} catch {
					// transient network error — retry
				}
				// small backoff between attempts
				await new Promise((r) => setTimeout(r, 350));
			}

			// Couldn't verify session now — keep saved session and let the
			// in-page polling attempt reconnection instead of aggressively
			// clearing the session on transient failures.
			setChecking(false);
		};

		tryReconnect();
	}, []);

	const handleJoined = (code: string, playerId: string, isHost: boolean) => {
		setSession({ code, playerId, isHost });
		// Session is also saved inside OnlineGameView
	};

	if (checking) {
		return (
			<div className="min-h-dvh bg-background flex items-center justify-center">
				<div className="text-center animate-page-enter">
					<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
					<p className="text-sm text-muted-foreground">{t('game.checkingSession')}</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return <OnlineLobby onJoined={handleJoined} />;
	}

	return <OnlineGameView roomCode={session.code} playerId={session.playerId} isHost={session.isHost} onExit={() => setSession(null)} />;
}
