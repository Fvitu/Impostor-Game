"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation";
import type { GameState } from "@/lib/game-logic"
import { MAX_PLAYERS, getMaxImpostorCount } from "@/lib/game-logic";
import type { DisconnectPause } from "@/lib/room-store";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
	Copy,
	Check,
	Play,
	X,
	Users,
	Eye,
	EyeOff,
	MessageSquare,
	Send,
	Vote,
	ChevronRight,
	Trophy,
	Skull,
	RotateCcw,
	ArrowRight,
	ArrowLeft,
	Crown,
	AlertTriangle,
	Clock,
	UserX,
	Minus,
	Plus,
	LogOut,
	Power,
	DoorOpen,
} from "lucide-react";
import Link from "next/link"
import { GameNavbar } from "@/components/game/game-navbar";
import { saveOnlineSession, refreshOnlineSession, clearOnlineSession, saveResultsGame } from "@/lib/storage";

interface OnlineGameViewProps {
	roomCode: string;
	playerId: string;
	isHost: boolean;
	onExit?: () => void;
}

export function OnlineGameView({ roomCode, playerId, isHost, onExit }: OnlineGameViewProps) {
	const router = useRouter();
	const [game, setGame] = useState<GameState | null>(null);
	const [hostId, setHostId] = useState<string>("");
	const [disconnectPause, setDisconnectPause] = useState<DisconnectPause | null>(null);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);
	const [impostorHelp, setImpostorHelp] = useState(false);
	const [textChatEnabled, setTextChatEnabled] = useState(true);
	const [impostorCount, setImpostorCount] = useState(1);
	const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
	const [roomEnded, setRoomEnded] = useState(false);

	// Auto-adjust impostor count when player count changes
	useEffect(() => {
		if (game) {
			const maxImp = getMaxImpostorCount(game.players.length);
			if (impostorCount > maxImp) {
				setImpostorCount(maxImp);
			}
		}
	}, [game?.players.length, impostorCount]);

	// Keep local setup controls in sync with room state, including after reload/reconnect.
	useEffect(() => {
		if (!game || game.phase !== "setup") return;
		setImpostorHelp(Boolean(game.impostorHelp));
		setTextChatEnabled(game.textChatEnabled !== false);
		setImpostorCount(Math.max(1, game.impostorCount || 1));
	}, [game?.phase, game?.impostorHelp, game?.textChatEnabled, game?.impostorCount]);

	// Save session to localStorage on mount and keep it refreshed
	useEffect(() => {
		saveOnlineSession({
			roomCode,
			playerId,
			isHost,
			playerName: "", // Will be populated from game state
		});
	}, [roomCode, playerId, isHost]);

	// Notify server when user leaves the page
	useEffect(() => {
		const handleBeforeUnload = () => {
			const data = new Blob([JSON.stringify({ action: "player-leaving", code: roomCode, playerId })], { type: "application/json" });
			navigator.sendBeacon("/api/rooms/action", data);
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [roomCode, playerId]);

	// Poll for game state
	const fetchState = useCallback(async () => {
		try {
			const res = await fetch(`/api/rooms/state?code=${roomCode}&pid=${playerId}`);
			if (!res.ok) {
				// Room ended by host
				if (res.status === 410) {
					setRoomEnded(true);
					clearOnlineSession();
					return;
				}
				// Room no longer exists, clear session
				if (res.status === 404) {
					clearOnlineSession();
				}
				return;
			}
			const data = await res.json();
			setGame(data.game);
			setHostId(data.hostId);
			setDisconnectPause(data.disconnectPause ?? null);
			// Refresh session timestamp on each successful poll
			refreshOnlineSession();
			// Update the session with player name
			const me = data.game?.players?.find((p: { id: string }) => p.id === playerId);
			if (me) {
				saveOnlineSession({
					roomCode,
					playerId,
					isHost: playerId === data.hostId,
					playerName: me.name,
				});
			}
		} catch {
			// silently retry
		}
	}, [roomCode, playerId]);

	const handleBackToLobby = async () => {
		try {
			await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "leave-room-voluntary", code: roomCode, playerId }),
			});
		} catch {
			// ignore
		}
		clearOnlineSession();
		onExit?.();
		router.push("/play/online");
	};

	useEffect(() => {
		fetchState();
		const interval = setInterval(fetchState, 1500);
		return () => clearInterval(interval);
	}, [fetchState]);

	const doAction = async (action: string, extra: Record<string, unknown> = {}) => {
		setError("");
		try {
			const res = await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action, code: roomCode, playerId, ...extra }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			setGame(data.game);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Action failed");
		}
	};

	const persistHostSettings = async (next: { impostorHelp?: boolean; textChatEnabled?: boolean; impostorCount?: number }) => {
		try {
			await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "set-settings", code: roomCode, playerId, ...next }),
			});
		} catch {
			// Polling will reconcile eventual state.
		}
	};

	const copyCode = () => {
		navigator.clipboard.writeText(roomCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleLeaveRoom = async () => {
		try {
			await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "leave-room-voluntary", code: roomCode, playerId }),
			});
		} catch {
			// ignore
		}
		clearOnlineSession();
		onExit?.();
		router.push("/play/online");
	};

	const handleEndGame = async () => {
		try {
			await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "end-game", code: roomCode, playerId }),
			});
		} catch {
			// ignore
		}
		clearOnlineSession();
		onExit?.();
		router.push("/play/online");
	};

	// Room ended by host
	if (roomEnded) {
		return (
			<div className="min-h-dvh bg-background flex items-center justify-center px-4">
				<div className="w-full max-w-sm text-center animate-slide-up">
					<Power className="h-12 w-12 text-destructive mx-auto mb-4" />
					<h2 className="text-xl font-bold text-foreground mb-2">Game Ended</h2>
					<p className="text-sm text-muted-foreground mb-6">The host has ended the game for everyone.</p>
					<Button
						onClick={() => {
							clearOnlineSession();
							onExit?.();
							router.push("/play/online");
						}}
						size="lg"
						className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
						Back to Lobby
					</Button>
				</div>
			</div>
		);
	}

	if (!game) {
		return (
			<div className="min-h-dvh bg-background flex items-center justify-center">
				<div className="text-center animate-page-enter">
					<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
					<p className="text-sm text-muted-foreground">Connecting to room...</p>
				</div>
			</div>
		);
	}

	const me = game.players.find((p) => p.id === playerId);
	const amHost = playerId === hostId;

	// SETUP / WAITING ROOM
	if (game.phase === "setup") {
		return (
			<div className="min-h-dvh flex flex-col">
				<GameNavbar
					onBack={handleBackToLobby}
					title={"Waiting Room"}
					subtitle={<span className="text-xs font-mono text-muted-foreground">{game.players.length + " players joined"}</span>}
				/>

				<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full animate-page-enter">
					{/* Room Code */}
					<div className="text-center mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-2">Room Code</p>
						<div className="flex items-center justify-center gap-3">
							<span className="text-4xl font-mono font-bold tracking-[0.3em] text-primary">{roomCode}</span>
							<Button variant="ghost" size="icon" onClick={copyCode} className="text-muted-foreground">
								{copied ? <Check className="h-5 w-5 text-black" /> : <Copy className="h-5 w-5" />}
								<span className="sr-only">Copy code</span>
							</Button>
						</div>
						<p className="text-xs text-muted-foreground mt-2">Share this code with your friends</p>
					</div>

					{/* Player List */}
					<div className="mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-3">Players</p>
						<div className="space-y-2">
							{game.players.map((player, index) => (
								<div key={player.id} className="glow-box flex items-center justify-between rounded-lg px-4 py-3">
									<div className="flex items-center gap-3">
										<span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-mono font-bold text-secondary-foreground">
											{index + 1}
										</span>
										<span className="text-sm font-medium text-foreground">
											{player.name}
											{player.id === playerId && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
										</span>
										{player.id === hostId && <Crown className="h-4 w-4 text-warning" />}
									</div>
									{amHost && player.id !== playerId && (
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => doAction("remove-player", { targetPlayerId: player.id })}
											className="text-muted-foreground hover:text-destructive group">
											<X className="h-4 w-4 group-hover:text-black" />
											<span className="sr-only">Remove {player.name}</span>
										</Button>
									)}
								</div>
							))}
						</div>
					</div>

					{/* Host Controls */}
					{amHost && (
						<div className="space-y-4">
							<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
								<div>
									<p className="text-sm font-medium text-foreground">Impostor Hint</p>
									<p className="text-xs text-muted-foreground">Show category to Impostor</p>
								</div>
								<Switch
									checked={impostorHelp}
									onCheckedChange={(checked) => {
										setImpostorHelp(checked);
										persistHostSettings({ impostorHelp: checked });
									}}
								/>
							</div>
							<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
								<div>
									<p className="text-sm font-medium text-foreground">Text Chat During Match</p>
									<p className="text-xs text-muted-foreground">If disabled, host starts voting manually.</p>
								</div>
								<Switch
									checked={textChatEnabled}
									onCheckedChange={(checked) => {
										setTextChatEnabled(checked);
										persistHostSettings({ textChatEnabled: checked });
									}}
								/>
							</div>
							{game.players.length >= 3 &&
								(() => {
									const maxImp = getMaxImpostorCount(game.players.length);
									return (
										<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
											<div>
												<p className="text-sm font-medium text-foreground">Number of Impostors</p>
												<p className="text-xs text-muted-foreground">
													Max {maxImp} for {game.players.length} players
												</p>
											</div>
											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													size="icon-sm"
													onClick={() => {
														const next = Math.max(1, impostorCount - 1);
														setImpostorCount(next);
														persistHostSettings({ impostorCount: next });
													}}
													disabled={impostorCount <= 1}
													className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
													<Minus className="h-4 w-4" />
												</Button>
												<span className="w-8 text-center text-lg font-bold font-mono text-foreground">{impostorCount}</span>
												<Button
													variant="outline"
													size="icon-sm"
													onClick={() => {
														const next = Math.min(maxImp, impostorCount + 1);
														setImpostorCount(next);
														persistHostSettings({ impostorCount: next });
													}}
													disabled={impostorCount >= maxImp}
													className="border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
													<Plus className="h-4 w-4" />
												</Button>
											</div>
										</div>
									);
								})()}
							<Button
								onClick={() => doAction("start", { impostorHelp, textChatEnabled, impostorCount })}
								disabled={game.players.length < 3}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
								<Play className="h-5 w-5 mr-2" />
								{"Start Game"}
							</Button>
							{game.players.length < 3 && (
								<p className="text-xs text-center text-muted-foreground font-mono">
									{"Need at least "}
									{3 - game.players.length}
									{" more player"}
									{3 - game.players.length !== 1 ? "s" : ""}
								</p>
							)}
						</div>
					)}
					{!amHost && (
						<div className="text-center py-8">
							<Users className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
							<p className="text-sm text-muted-foreground">Waiting for the host to start the game...</p>
						</div>
					)}

					{error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
				</div>
			</div>
		);
	}

	// IN-GAME PHASES
	return (
		<OnlineInGame
			game={game}
			playerId={playerId}
			amHost={amHost}
			doAction={doAction}
			error={error}
			disconnectPause={disconnectPause}
			roomCode={roomCode}
			showLeaveConfirm={showLeaveConfirm}
			setShowLeaveConfirm={setShowLeaveConfirm}
			onLeaveRoom={handleLeaveRoom}
			onEndGame={handleEndGame}
		/>
	);
}

// --- Disconnect Overlay ---

function DisconnectOverlay({
	disconnectPause,
	amHost,
	doAction,
	onLeaveRoom,
}: {
	disconnectPause: DisconnectPause;
	amHost: boolean;
	doAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
	onLeaveRoom: () => void;
}) {
	if (disconnectPause.hostDecision === "waiting") {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
				<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
					<Clock className="h-12 w-12 text-warning mx-auto mb-4 animate-pulse" />
					<h3 className="text-lg font-bold text-foreground mb-2">Waiting for Reconnection</h3>
					<p className="text-sm text-muted-foreground mb-6">
						Waiting for <span className="font-bold text-foreground">{disconnectPause.playerName}</span> to reconnect...
					</p>
					{amHost && (
						<Button
							variant="outline"
							onClick={() => doAction("dismiss-disconnected", { targetPlayerId: disconnectPause.playerId })}
							className="w-full border-destructive/30 text-destructive hover:bg-destructive/10">
							<UserX className="h-4 w-4 mr-2" />
							Remove Instead
						</Button>
					)}
					<Button variant="ghost" onClick={onLeaveRoom} className="w-full mt-3 text-muted-foreground hover:text-foreground">
						<DoorOpen className="h-4 w-4 mr-2" />
						Leave Room
					</Button>
				</div>
			</div>
		);
	}

	// Host decision pending
	if (amHost) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
				<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
					<AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
					<h3 className="text-lg font-bold text-foreground mb-2">Player Disconnected</h3>
					<p className="text-sm text-muted-foreground mb-6">
						<span className="font-bold text-foreground">{disconnectPause.playerName}</span> has left the game. What would you like to do?
					</p>
					<div className="space-y-3">
						<Button
							onClick={() => doAction("dismiss-disconnected", { targetPlayerId: disconnectPause.playerId })}
							className="w-full h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90">
							<UserX className="h-4 w-4 mr-2" />
							Remove and Continue
						</Button>
						<Button
							variant="outline"
							onClick={() => doAction("wait-for-reconnect", { targetPlayerId: disconnectPause.playerId })}
							className="w-full h-12 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
							<Clock className="h-4 w-4 mr-2" />
							Wait for Return
						</Button>
						<Button variant="ghost" onClick={onLeaveRoom} className="w-full text-muted-foreground hover:text-foreground">
							<DoorOpen className="h-4 w-4 mr-2" />
							Leave Room
						</Button>
					</div>
				</div>
			</div>
		);
	}

	// Non-host: show waiting message with leave button
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
			<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
				<AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4 animate-pulse" />
				<h3 className="text-lg font-bold text-foreground mb-2">Player Disconnected</h3>
				<p className="text-sm text-muted-foreground mb-4">
					<span className="font-bold text-foreground">{disconnectPause.playerName}</span> has disconnected. Waiting for the host to decide...
				</p>
				<Button variant="ghost" onClick={onLeaveRoom} className="w-full text-muted-foreground hover:text-foreground">
					<DoorOpen className="h-4 w-4 mr-2" />
					Leave Room
				</Button>
			</div>
		</div>
	);
}

// --- In-Game Component ---

function OnlineInGame({
	game,
	playerId,
	amHost,
	doAction,
	error,
	disconnectPause,
	roomCode,
	showLeaveConfirm,
	setShowLeaveConfirm,
	onLeaveRoom,
	onEndGame,
}: {
	game: GameState;
	playerId: string;
	amHost: boolean;
	doAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
	error: string;
	disconnectPause: DisconnectPause | null;
	roomCode: string;
	showLeaveConfirm: boolean;
	setShowLeaveConfirm: (v: boolean) => void;
	onLeaveRoom: () => void;
	onEndGame: () => void;
}) {
	const [roleRevealed, setRoleRevealed] = useState(false);
	const [clue, setClue] = useState("");
	const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
	const [hasVoted, setHasVoted] = useState(false);

	const me = game.players.find((p) => p.id === playerId);
	const activePlayers = game.players.filter((p) => !p.isEliminated);
	const isImpostor = me?.role === "impostor";
	const currentCluePlayer = activePlayers[game.currentPlayerIndex];
	const isMyTurnForClue = game.phase === "clues" && currentCluePlayer?.id === playerId;

	// Reset vote state when phase changes
	useEffect(() => {
		if (game.phase === "voting") {
			setHasVoted(me?.votedFor !== null);
		}
		if (game.phase === "clues") {
			setHasVoted(false);
			setSelectedTarget(null);
		}
	}, [game.phase, me?.votedFor]);

	const handleBackClick = () => {
		setShowLeaveConfirm(true);
	};

	// Leave confirmation overlay
	const leaveConfirmOverlay = showLeaveConfirm ? (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
			<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
				<AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
				<h3 className="text-lg font-bold text-foreground mb-2">Leave Game?</h3>
				<p className="text-sm text-muted-foreground mb-6">Are you sure you want to leave this game? You will be disconnected from the room.</p>
				<div className="space-y-3">
					<Button onClick={onLeaveRoom} className="w-full h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90">
						<ArrowLeft className="h-4 w-4 mr-2" />
						Leave Game
					</Button>
					{amHost && (
						<Button onClick={onEndGame} variant="outline" className="w-full h-12 border-destructive/30 text-destructive hover:bg-destructive/10">
							<Power className="h-4 w-4 mr-2" />
							End Game for Everyone
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => setShowLeaveConfirm(false)}
						className="w-full h-12 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
						Stay in Game
					</Button>
				</div>
			</div>
		</div>
	) : null;

	// Disconnect overlay (shown on top of any phase)
	const disconnectOverlay = disconnectPause ? (
		<DisconnectOverlay disconnectPause={disconnectPause} amHost={amHost} doAction={doAction} onLeaveRoom={onLeaveRoom} />
	) : null;

	// CLUES PHASE
	if (game.phase === "clues") {
		if (!game.textChatEnabled) {
			return (
				<div className="min-h-dvh flex flex-col">
					{disconnectOverlay}
					{leaveConfirmOverlay}
					<GameNavbar
						onBack={handleBackClick}
						title={"Roles Active"}
						subtitle={"Round " + game.currentRound + " - Waiting for voting"}
						round={game.currentRound}
					/>
					<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col justify-center">
						<div className="glow-box rounded-xl p-4 mb-6">
							<p className="text-sm text-muted-foreground text-center">Text chat is disabled for this match.</p>
							<p className="text-sm text-muted-foreground text-center mt-1">The host will decide when voting starts.</p>
						</div>

						{amHost ? (
							<Button
								onClick={() => doAction("start-voting")}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								<Vote className="h-5 w-5 mr-2" />
								Start Voting
							</Button>
						) : (
							<div className="text-center py-8">
								<MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
								<p className="text-sm text-muted-foreground">Waiting for host to start voting...</p>
							</div>
						)}

						{error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
					</div>
				</div>
			);
		}

		const cluesThisRound = activePlayers
			.filter((p) => p.clues.length >= game.currentRound)
			.map((p) => ({ name: p.name, clue: p.clues[game.currentRound - 1] }));

		return (
			<div className="min-h-dvh flex flex-col">
				{disconnectOverlay}
				{leaveConfirmOverlay}
				<GameNavbar
					onBack={handleBackClick}
					title={"Give Your Clue"}
					subtitle={"Round " + game.currentRound + " - Clue Phase"}
					round={game.currentRound}
				/>
				<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
					{/* My Role Card */}
					<div
						className={`rounded-xl p-4 mb-6 border ${
							roleRevealed ? (isImpostor ? "border-primary/30 bg-primary/5" : "border-success/30 bg-success/5") : "glow-box border-border"
						}`}>
						<div className="flex items-center justify-between mb-3">
							<p className="text-xs font-mono text-muted-foreground">Your Role</p>
							<button onClick={() => setRoleRevealed(!roleRevealed)} className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
								{roleRevealed ? (
									<>
										{"Tap to hide"}
										<EyeOff className="h-4 w-4" />
									</>
								) : (
									<>
										{"Tap to reveal"}
										<Eye className="h-4 w-4" />
									</>
								)}
							</button>
						</div>

						{roleRevealed ? (
							<div className="space-y-3">
								<p className={`text-sm font-bold ${isImpostor ? "text-primary" : "text-success"}`}>{isImpostor ? "The Impostor" : "Friend"}</p>
								{isImpostor ? (
									game.impostorHelp ? (
										<div>
											<p className="text-xs font-mono text-muted-foreground">Category</p>
											<p className="text-sm font-bold text-foreground">{game.category}</p>
										</div>
									) : (
										<p className="text-sm text-muted-foreground">No hint enabled for this match.</p>
									)
								) : (
									<div>
										<p className="text-xs font-mono text-muted-foreground">Secret Word</p>
										<p className="text-sm font-bold text-foreground">{game.secretWord}</p>
									</div>
								)}
							</div>
						) : (
							<div className="flex items-center gap-2 text-muted-foreground">
								<EyeOff className="h-4 w-4" />
								<p className="text-sm">Hidden</p>
							</div>
						)}
					</div>

					{/* Clues */}
					{cluesThisRound.length > 0 && (
						<div className="mb-6">
							<p className="text-xs font-mono text-muted-foreground uppercase mb-3">Clues Given</p>
							<div className="space-y-2">
								{cluesThisRound.map((c) => (
									<div key={c.name} className="glow-box flex items-center gap-3 rounded-lg px-4 py-3">
										<MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
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

					{/* My Turn */}
					{isMyTurnForClue ? (
						<div className="animate-slide-up">
							<p className="text-sm font-bold text-foreground text-center mb-2">{"It's Your Turn!"}</p>
							<p className="text-xs text-muted-foreground text-center mb-4">Give a single-word clue</p>
							<div className="flex gap-2">
								<Input
									placeholder="Your clue..."
									value={clue}
									onChange={(e) => setClue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && clue.trim()) {
											doAction("clue", { clue: clue.trim() });
											setClue("");
										}
									}}
									maxLength={30}
									autoFocus
									className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
								/>
								<Button
									onClick={() => {
										if (clue.trim()) {
											doAction("clue", { clue: clue.trim() });
											setClue("");
										}
									}}
									disabled={!clue.trim()}
									size="lg"
									className="h-12 px-4 bg-primary text-primary-foreground shrink-0">
									<Send className="h-5 w-5" />
									<span className="sr-only">Submit clue</span>
								</Button>
							</div>
						</div>
					) : (
						<div className="text-center py-8">
							<MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
							<p className="text-sm text-muted-foreground">
								{"Waiting for "}
								<span className="font-bold text-foreground">{currentCluePlayer?.name}</span>
								{" to give a clue..."}
							</p>
							<p className="text-xs text-muted-foreground mt-1 font-mono">
								{game.currentPlayerIndex + 1}
								{"/"}
								{activePlayers.length}
							</p>
						</div>
					)}

					{error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
				</div>
			</div>
		);
	}

	// VOTING PHASE
	if (game.phase === "voting") {
		const cluesThisRound = activePlayers.map((p) => ({
			id: p.id,
			name: p.name,
			clue: p.clues[game.currentRound - 1] || "No clue",
		}));

		const votedCount = activePlayers.filter((p) => p.votedFor !== null).length;
		const pendingVotes = Math.max(0, activePlayers.length - votedCount);
		const amEliminated = Boolean(me?.isEliminated);

		return (
			<div className="min-h-dvh flex flex-col">
				{disconnectOverlay}
				{leaveConfirmOverlay}
				<GameNavbar onBack={handleBackClick} title={"Cast Your Vote"} subtitle={"Round " + game.currentRound + " - Voting"} round={game.currentRound} />
				<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
					{/* Clue Summary */}
					{game.textChatEnabled && (
						<div className="mb-6">
							<p className="text-xs font-mono text-muted-foreground uppercase mb-3">Clue Summary</p>
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

					{amEliminated ? (
						<div className="text-center py-8">
							<p className="text-sm text-muted-foreground">You were eliminated and cannot vote.</p>
							<p className="text-xs text-muted-foreground mt-1 font-mono">Waiting for next game</p>
						</div>
					) : hasVoted || me?.votedFor ? (
						<div className="text-center py-8">
							<Check className="h-8 w-8 text-accent mx-auto mb-3" />
							<p className="text-sm text-muted-foreground">Vote submitted! Waiting for others...</p>
							<p className="text-xs text-muted-foreground mt-1 font-mono">
								{pendingVotes}
								{" player"}
								{pendingVotes !== 1 ? "s" : ""}
								{" left to vote"}
							</p>
						</div>
					) : (
						<div className="animate-slide-up">
							<p className="text-sm font-bold text-foreground text-center mb-4">Who is The Impostor?</p>
							<div className="space-y-2 mb-6">
								{activePlayers
									.filter((p) => p.id !== playerId)
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
								onClick={async () => {
									if (selectedTarget) {
										await doAction("vote", { targetId: selectedTarget });
										setHasVoted(true);
									}
								}}
								disabled={!selectedTarget}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
								<Vote className="h-5 w-5 mr-2" />
								Confirm Vote
							</Button>
							<p className="text-xs text-center text-muted-foreground mt-3 font-mono">
								{pendingVotes}
								{" player"}
								{pendingVotes !== 1 ? "s" : ""}
								{" left to vote"}
							</p>
						</div>
					)}

					{error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
				</div>
			</div>
		);
	}

	// RESOLUTION / GAME OVER
	if (game.phase === "resolution" || game.phase === "game-over") {
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

		return (
			<div className="min-h-dvh flex flex-col items-center justify-center px-4">
				{disconnectOverlay}
				{leaveConfirmOverlay}
				<div className="w-full max-w-sm text-center animate-slide-up">
					<p className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-4">
						{"Round "}
						{lastResult.round}
						{" Result"}
					</p>

					{lastResult.wasTie ? (
						<div>
							<RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
							<h2 className="text-2xl font-bold text-foreground mb-3">{"It's a Tie!"}</h2>
							<p className="text-sm text-muted-foreground">No one is eliminated.</p>
						</div>
					) : (
						eliminatedPlayer && (
							<div>
								{!lastResult.impostorSurvived ? (
									<>
										<Trophy className="h-12 w-12 text-accent mx-auto mb-4" />
										<h2 className="text-2xl font-bold text-accent mb-3">Impostor Found!</h2>
										<p className="text-sm text-muted-foreground">
											<span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
											{" was an Impostor!"}
										</p>
									</>
								) : (
									<>
										<Skull className="h-12 w-12 text-destructive mx-auto mb-4" />
										<h2 className="text-2xl font-bold text-destructive mb-3">Wrong Person!</h2>
										<p className="text-sm text-muted-foreground">
											<span className="font-bold text-foreground">{eliminatedPlayer.name}</span>
											{" was a Friend."}
										</p>
									</>
								)}
							</div>
						)
					)}

					{/* Vote Results */}
					<div className="mt-8 mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-3">Vote Results</p>
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
													{receivedVotes}
													{" vote"}
													{receivedVotes !== 1 ? "s" : ""}
												</span>
											</div>
											<div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
												<div className="h-full bg-primary" style={{ width: barWidth }} />
											</div>
											{isEliminatedThisRound && <p className="text-xs text-muted-foreground mt-2">Eliminated this round</p>}
										</div>
									);
								})}
						</div>
					</div>

					{game.phase === "game-over" ? (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground mb-4">
								{"Game Over! "}
								{game.winner === "friends" ? "Friends win!" : "Impostors win!"}
							</p>
							<Link href="/play/online/results" onClick={() => saveResultsGame(game)}>
								<Button size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
									<Trophy className="h-5 w-5 mr-2" />
									View Final Scores
								</Button>
							</Link>
							{amHost ? (
								<>
									<Button
										onClick={() => doAction("replay")}
										variant="outline"
										size="lg"
										className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground mt-2">
										<RotateCcw className="h-5 w-5 mr-2" />
										Play Again (Same Players)
									</Button>
									<Button onClick={onEndGame} variant="ghost" size="sm" className="w-full mt-2 text-destructive hover:bg-destructive/10">
										<Power className="h-4 w-4 mr-2" />
										End Game for Everyone
									</Button>
								</>
							) : (
								<div className="text-center py-4">
									<Users className="h-6 w-6 text-muted-foreground mx-auto mb-2 animate-pulse-glow" />
									<p className="text-sm text-muted-foreground">Waiting for host to start a new game...</p>
									<Button variant="ghost" size="sm" onClick={onLeaveRoom} className="mt-3 text-muted-foreground hover:text-foreground">
										<DoorOpen className="h-4 w-4 mr-2" />
										Leave Room
									</Button>
								</div>
							)}
						</div>
					) : amHost ? (
						<div className="space-y-3">
							<Button
								onClick={() => doAction("next-round")}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								{"Next Round"}
								<ArrowRight className="h-5 w-5 ml-2" />
							</Button>
							<Button onClick={onEndGame} variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10">
								<Power className="h-4 w-4 mr-2" />
								End Game for Everyone
							</Button>
						</div>
					) : (
						<div className="text-center py-4">
							<p className="text-sm text-muted-foreground">Waiting for host to start next round...</p>
						</div>
					)}

					{error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
				</div>
			</div>
		);
	}

	// FALLBACK / WAITING (roles phase in online - auto-transition)
	return (
		<div className="min-h-dvh bg-background flex items-center justify-center px-4">
			{leaveConfirmOverlay}
			<div className="text-center">
				<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
				<p className="text-sm text-muted-foreground">Loading game state...</p>
			</div>
		</div>
	);
}

// Replaced by shared GameNavbar
