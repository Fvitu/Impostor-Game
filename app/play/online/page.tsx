"use client"

import { useState, useEffect } from "react";
import { OnlineLobby } from "@/components/online/online-lobby"
import { OnlineGameView } from "@/components/online/online-game-view"
import { getSavedOnlineSession, saveOnlineSession, clearOnlineSession, getWaitingSession, clearWaitingSession } from "@/lib/storage";

export default function OnlinePlayPage() {
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

			try {
				// Verify the session is still valid
				const res = await fetch(`/api/rooms/state?code=${saved.roomCode}&pid=${saved.playerId}`);
				if (res.status === 410) {
					// Room was ended by host
					clearOnlineSession();
					setChecking(false);
					return;
				}
				if (res.ok) {
					const data = await res.json();
					// Check if our player is still in the room
					const stillInRoom = data.game?.players?.some((p: { id: string }) => p.id === saved.playerId);
					if (stillInRoom) {
						setSession({
							code: saved.roomCode,
							playerId: saved.playerId,
							isHost: saved.playerId === data.hostId,
						});
						// Update session with latest host status
						saveOnlineSession({
							...saved,
							isHost: saved.playerId === data.hostId,
						});
						setChecking(false);
						return;
					}
				}
			} catch {
				// Room doesn't exist or network error
			}

			// Session is invalid, clear it
			clearOnlineSession();
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
					<p className="text-sm text-muted-foreground">Checking for active session...</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return <OnlineLobby onJoined={handleJoined} />;
	}

	return <OnlineGameView roomCode={session.code} playerId={session.playerId} isHost={session.isHost} onExit={() => setSession(null)} />;
}
