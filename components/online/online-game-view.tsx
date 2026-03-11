"use client"

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import type { GameState } from "@/lib/game-logic"
import { MAX_PLAYERS, getActivePlayersForClues, getActivePlayersForVoting, getMaxImpostorCount, getRoundStarter } from "@/lib/game-logic";
import type { DisconnectPause } from "@/lib/room-store";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DEFAULT_CATEGORY_SELECTION, getCategoryLabel, getCategoryOptions, migrateCategorySelection, type GameCategorySelection } from "@/lib/game-data";
import { CategoryMultiSelect } from "@/components/game/category-multi-select";
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
	const { t, i18n } = useTranslation("online");
	const router = useRouter();
	const [game, setGame] = useState<GameState | null>(null);
	const [hostId, setHostId] = useState<string>("");
	const [disconnectPause, setDisconnectPause] = useState<DisconnectPause | null>(null);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);
	const [impostorHelp, setImpostorHelp] = useState(false);
	const [textChatEnabled, setTextChatEnabled] = useState(true);
	const [impostorCount, setImpostorCount] = useState(1);
	const [categorySelection, setCategorySelection] = useState<GameCategorySelection>(DEFAULT_CATEGORY_SELECTION);
	const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
	const [roomEnded, setRoomEnded] = useState(false);
	const isIntentionalExitRef = useRef(false);
	const pendingMutationCountRef = useRef(0);
	const mutationVersionRef = useRef(0);

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
		const nextCategory = migrateCategorySelection(game.selectedCategory);
		setCategorySelection(nextCategory);
	}, [game?.phase, game?.impostorHelp, game?.textChatEnabled, game?.impostorCount, game?.selectedCategory]);

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
			if (isIntentionalExitRef.current) {
				return;
			}
			const data = new Blob([JSON.stringify({ action: "player-leaving", code: roomCode, playerId })], { type: "application/json" });
			navigator.sendBeacon("/api/rooms/action", data);
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [roomCode, playerId]);

	// Poll for game state
	const fetchState = useCallback(async () => {
		const requestMutationVersion = mutationVersionRef.current;
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
			if (pendingMutationCountRef.current > 0 || requestMutationVersion !== mutationVersionRef.current) {
				return;
			}
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
		isIntentionalExitRef.current = true;
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

	const [isTabVisible, setIsTabVisible] = useState(true);

	useEffect(() => {
		const handleVisibilityChange = () => setIsTabVisible(document.visibilityState === "visible");
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, []);

	useEffect(() => {
		fetchState();
		const baseInterval = game?.phase === "setup" ? 2000 : 3000;
		const interval = setInterval(fetchState, isTabVisible ? baseInterval : 8000);
		return () => clearInterval(interval);
	}, [fetchState, game?.phase, isTabVisible]);

	const doAction = async (action: string, extra: Record<string, unknown> = {}) => {
		setError("");
		pendingMutationCountRef.current += 1;
		mutationVersionRef.current += 1;
		try {
			const res = await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action, code: roomCode, playerId, ...extra }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			setGame(data.game);
			if (typeof data.hostId === "string") {
				setHostId(data.hostId);
			}
			if ("disconnectPause" in data) {
				setDisconnectPause(data.disconnectPause ?? null);
			}
			return true;
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : t("game.actionFailed"));
			return false;
		} finally {
			pendingMutationCountRef.current = Math.max(0, pendingMutationCountRef.current - 1);
		}
	};
	const persistHostSettings = async (next: {
		impostorHelp?: boolean;
		textChatEnabled?: boolean;
		impostorCount?: number;
		categorySelection?: GameCategorySelection;
	}) => {
		setGame((previousGame) => {
			if (!previousGame || previousGame.phase !== "setup") {
				return previousGame;
			}

			const maxImpostors = getMaxImpostorCount(previousGame.players.length);
			const nextImpostorCount =
				typeof next.impostorCount === "number" ? Math.max(1, Math.min(maxImpostors, Math.floor(next.impostorCount))) : previousGame.impostorCount;

			return {
				...previousGame,
				impostorHelp: next.impostorHelp ?? previousGame.impostorHelp,
				textChatEnabled: next.textChatEnabled ?? previousGame.textChatEnabled,
				impostorCount: nextImpostorCount,
				selectedCategory: next.categorySelection ?? previousGame.selectedCategory,
			};
		});

		pendingMutationCountRef.current += 1;
		mutationVersionRef.current += 1;

		try {
			const res = await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "set-settings", code: roomCode, playerId, ...next }),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error ?? t("game.actionFailed"));
			}
			setGame(data.game);
			setError("");
		} catch {
			setError(t("game.actionFailed"));
			fetchState();
		} finally {
			pendingMutationCountRef.current = Math.max(0, pendingMutationCountRef.current - 1);
		}
	};

	const copyCode = () => {
		navigator.clipboard.writeText(roomCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleLeaveRoom = async () => {
		isIntentionalExitRef.current = true;
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
		isIntentionalExitRef.current = true;
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
					<h2 className="text-xl font-bold text-foreground mb-2">{t("gameEnded.title")}</h2>
					<p className="text-sm text-muted-foreground mb-6">{t("gameEnded.description")}</p>
					<Button
						onClick={() => {
							clearOnlineSession();
							onExit?.();
							router.push("/play/online");
						}}
						size="lg"
						className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
						{t("common:backToLobby")}
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
					<p className="text-sm text-muted-foreground">{t("game.connectingToRoom")}</p>
				</div>
			</div>
		);
	}

	const me = game.players.find((p) => p.id === playerId);
	const amHost = playerId === hostId;
	const categoryOptions = getCategoryOptions(i18n.language);
	const selectedCategoryLabel = getCategoryLabel(categorySelection, i18n.language);

	// SETUP / WAITING ROOM
	if (game.phase === "setup") {
		return (
			<div className="min-h-dvh flex flex-col">
				<GameNavbar
					onBack={handleBackToLobby}
					title={t("game.waitingRoom")}
					subtitle={<span className="text-xs font-mono text-muted-foreground">{t("game.playersJoined", { count: game.players.length })}</span>}
				/>

				<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full animate-page-enter">
					{/* Room Code */}
					<div className="text-center mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-2">{t("game.roomCode")}</p>
						<div className="flex items-center justify-center gap-3">
							<span className="text-4xl font-mono font-bold tracking-[0.3em] text-primary">{roomCode}</span>
							<Button
								variant="ghost"
								size="icon"
								onClick={copyCode}
								className={`group ${copied ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-destructive"}`}>
								{copied ? <Check className="h-5 w-5 group-hover:text-black" /> : <Copy className="h-5 w-5 group-hover:text-black" />}
								<span className="sr-only">{t("game.copyCode")}</span>
							</Button>
						</div>
						<p className="text-xs text-muted-foreground mt-2">{t("game.shareCode")}</p>
					</div>

					{/* Player List */}
					<div className="mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t("game.players")}</p>
						<div className="space-y-2">
							{game.players.map((player, index) => (
								<div key={player.id} className="glow-box flex items-center justify-between rounded-lg px-4 py-3">
									<div className="flex items-center gap-3">
										<span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-mono font-bold text-secondary-foreground">
											{index + 1}
										</span>
										<span className="text-sm font-medium text-foreground">
											{player.name}
											{player.id === playerId && <span className="text-xs text-muted-foreground ml-1">({t("game.you")})</span>}
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
											<span className="sr-only">{t("game.removePlayer", { name: player.name })}</span>
										</Button>
									)}
								</div>
							))}
						</div>
					</div>

					{/* Host Controls */}
					{amHost && (
						<div className="space-y-4">
							<div className="glow-box rounded-lg px-4 py-4">
								<div className="mb-3">
									<p className="text-sm font-medium text-foreground">{t("game.wordCategory")}</p>
									<p className="text-xs text-muted-foreground">{t("game.wordCategoryDesc")}</p>
								</div>
								<CategoryMultiSelect
									value={categorySelection}
									onChange={(value) => {
										setCategorySelection(value);
										persistHostSettings({ categorySelection: value });
									}}
									options={categoryOptions}
									allLabel={t("game.allCategories")}
									displayLabel={selectedCategoryLabel}
								/>
							</div>
							<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
								<div>
									<p className="text-sm font-medium text-foreground">{t("game.impostorHint")}</p>
									<p className="text-xs text-muted-foreground">{t("game.showCategory")}</p>
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
									<p className="text-sm font-medium text-foreground">{t("game.textChat")}</p>
									<p className="text-xs text-muted-foreground">{t("game.textChatDesc")}</p>
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
												<p className="text-sm font-medium text-foreground">{t("game.numberOfImpostors")}</p>
												<p className="text-xs text-muted-foreground">
													{t("game.maxImpostorsFor", { max: maxImp, count: game.players.length })}
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
								onClick={() => doAction("start", { impostorHelp, textChatEnabled, impostorCount, categorySelection, language: i18n.language })}
								disabled={game.players.length < 3}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
								<Play className="h-5 w-5 mr-2" />
								{t("common:startGame")}
							</Button>
							{game.players.length < 3 && (
								<p className="text-xs text-center text-muted-foreground font-mono">
									{t("common:needMorePlayers", { count: 3 - game.players.length })}
								</p>
							)}
						</div>
					)}
					{!amHost && (
						<div className="py-4">
							<div className="space-y-4 text-left mb-6">
								<div className="glow-box rounded-lg px-4 py-4">
									<div className="mb-3">
										<p className="text-sm font-medium text-foreground">{t("game.wordCategory")}</p>
										<p className="text-xs text-muted-foreground">{t("game.wordCategoryDesc")}</p>
									</div>
									<p className="text-sm font-semibold text-foreground">
										{getCategoryLabel(migrateCategorySelection(game.selectedCategory), i18n.language)}
									</p>
								</div>
								<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
									<div>
										<p className="text-sm font-medium text-foreground">{t("game.impostorHint")}</p>
										<p className="text-xs text-muted-foreground">{t("game.showCategory")}</p>
									</div>
									<Switch checked={Boolean(game.impostorHelp)} disabled />
								</div>
								<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
									<div>
										<p className="text-sm font-medium text-foreground">{t("game.textChat")}</p>
										<p className="text-xs text-muted-foreground">{t("game.textChatDesc")}</p>
									</div>
									<Switch checked={game.textChatEnabled !== false} disabled />
								</div>
								{game.players.length >= 3 && (
									<div className="glow-box flex items-center justify-between rounded-lg px-4 py-4">
										<div>
											<p className="text-sm font-medium text-foreground">{t("game.numberOfImpostors")}</p>
											<p className="text-xs text-muted-foreground">
												{t("game.maxImpostorsFor", { max: getMaxImpostorCount(game.players.length), count: game.players.length })}
											</p>
										</div>
										<span className="text-lg font-bold font-mono text-foreground">{Math.max(1, game.impostorCount || 1)}</span>
									</div>
								)}
							</div>
							<Users className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
							<p className="text-sm text-muted-foreground">{t("game.waitingForHost")}</p>
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
	doAction: (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
	onLeaveRoom: () => void;
}) {
	const { t } = useTranslation("online");
	if (disconnectPause.hostDecision === "waiting") {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
				<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
					<Clock className="h-12 w-12 text-warning mx-auto mb-4 animate-pulse" />
					<h3 className="text-lg font-bold text-foreground mb-2">{t("disconnect.waitingReconnection")}</h3>
					<p className="text-sm text-muted-foreground mb-6">{t("disconnect.waitingFor", { name: disconnectPause.playerName })}</p>
					{amHost && (
						<Button
							variant="outline"
							onClick={() => doAction("dismiss-disconnected", { targetPlayerId: disconnectPause.playerId })}
							className="w-full border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive hover:text-white">
							<UserX className="h-4 w-4 mr-2" />
							{t("disconnect.removeInstead")}
						</Button>
					)}
					<Button variant="ghost" onClick={onLeaveRoom} className="w-full mt-3 text-muted-foreground hover:text-foreground">
						<DoorOpen className="h-4 w-4 mr-2" />
						{t("common:leaveRoom")}
					</Button>
				</div>
			</div>
		);
	}

	if (amHost) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
				<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
					<AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
					<h3 className="text-lg font-bold text-foreground mb-2">{t("disconnect.playerDisconnected")}</h3>
					<p className="text-sm text-muted-foreground mb-6">{t("disconnect.hostDecision", { name: disconnectPause.playerName })}</p>
					<div className="space-y-3">
						<Button
							onClick={() => doAction("dismiss-disconnected", { targetPlayerId: disconnectPause.playerId })}
							className="w-full h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90">
							<UserX className="h-4 w-4 mr-2" />
							{t("disconnect.removeAndContinue")}
						</Button>
						<Button
							variant="outline"
							onClick={() => doAction("wait-for-reconnect", { targetPlayerId: disconnectPause.playerId })}
							className="w-full h-12 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
							<Clock className="h-4 w-4 mr-2" />
							{t("disconnect.waitForReturn")}
						</Button>
						<Button variant="ghost" onClick={onLeaveRoom} className="w-full text-muted-foreground hover:text-foreground">
							<DoorOpen className="h-4 w-4 mr-2" />
							{t("common:leaveRoom")}
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
				<h3 className="text-lg font-bold text-foreground mb-2">{t("disconnect.playerDisconnected")}</h3>
				<p className="text-sm text-muted-foreground mb-4">{t("disconnect.nonHostWaiting", { name: disconnectPause.playerName })}</p>
				<Button variant="ghost" onClick={onLeaveRoom} className="w-full text-muted-foreground hover:text-foreground">
					<DoorOpen className="h-4 w-4 mr-2" />
					{t("common:leaveRoom")}
				</Button>
			</div>
		</div>
	);
}

function OnlineRoleCard({ game, isImpostor, roleRevealed, onToggle }: { game: GameState; isImpostor: boolean; roleRevealed: boolean; onToggle: () => void }) {
	const { t } = useTranslation(["online", "game", "common"]);

	const renderHiddenFace = () => (
		<div className="flex items-center gap-2 text-muted-foreground py-3">
			<EyeOff className="h-4 w-4" />
			<p className="text-sm">{t("clues.hidden", { ns: "online" })}</p>
		</div>
	);

	const renderRevealedFace = (revealedImpostor: boolean) => (
		<div className="space-y-3">
			<p className={`text-sm font-bold ${revealedImpostor ? "text-primary" : "text-success"}`}>
				{revealedImpostor ? t("theImpostor", { ns: "common" }) : t("friend", { ns: "common" })}
			</p>
			{revealedImpostor ? (
				<>
					<div>
						<p className="text-xs font-mono text-muted-foreground">{t("category", { ns: "common" })}</p>
						<p className="text-sm font-bold text-foreground">{game.category}</p>
					</div>
					{game.impostorHelp ? (
						<div>
							<p className="text-xs font-mono text-muted-foreground">{t("roleReveal.categoryHint", { ns: "game" })}</p>
							<p className="text-sm font-bold text-foreground">{game.hint}</p>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">{t("clues.noHint", { ns: "online" })}</p>
					)}
				</>
			) : (
				<>
					<div>
						<p className="text-xs font-mono text-muted-foreground">{t("secretWord", { ns: "common" })}</p>
						<p className="text-sm font-bold text-foreground">{game.secretWord}</p>
					</div>
					<div>
						<p className="text-xs font-mono text-muted-foreground">{t("category", { ns: "common" })}</p>
						<p className="text-sm font-bold text-foreground">{game.category}</p>
					</div>
				</>
			)}
		</div>
	);

	return (
		<div
			className={`rounded-xl p-4 mb-6 border ${
				roleRevealed ? (isImpostor ? "border-primary/30 bg-primary/5" : "border-success/30 bg-success/5") : "glow-box border-border"
			}`}>
			<div className="flex items-center justify-between mb-3">
				<p className="text-xs font-mono text-muted-foreground">{t("clues.yourRole", { ns: "online" })}</p>
				<button onClick={onToggle} className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
					{roleRevealed ? (
						<>
							{t("clues.tapToHide", { ns: "online" })}
							<EyeOff className="h-4 w-4" />
						</>
					) : (
						<>
							{t("clues.tapToReveal", { ns: "online" })}
							<Eye className="h-4 w-4" />
						</>
					)}
				</button>
			</div>

			<div className="grid">
				<div className="invisible col-start-1 row-start-1 pointer-events-none" aria-hidden="true">
					<div className="grid">
						<div className="col-start-1 row-start-1">{renderHiddenFace()}</div>
						<div className="col-start-1 row-start-1">{renderRevealedFace(false)}</div>
						<div className="col-start-1 row-start-1">{renderRevealedFace(true)}</div>
					</div>
				</div>
				<div className={`${roleRevealed ? "visible" : "invisible pointer-events-none"} col-start-1 row-start-1`} aria-hidden={!roleRevealed}>
					{renderRevealedFace(isImpostor)}
				</div>
				<div className={`${roleRevealed ? "invisible pointer-events-none" : "visible"} col-start-1 row-start-1`} aria-hidden={roleRevealed}>
					{renderHiddenFace()}
				</div>
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
	doAction: (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
	error: string;
	disconnectPause: DisconnectPause | null;
	roomCode: string;
	showLeaveConfirm: boolean;
	setShowLeaveConfirm: (v: boolean) => void;
	onLeaveRoom: () => void;
	onEndGame: () => void;
}) {
	const { t } = useTranslation("online");
	const [roleRevealed, setRoleRevealed] = useState(false);
	const [clue, setClue] = useState("");
	const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
	const [hasVoted, setHasVoted] = useState(false);
	const [submittingClue, setSubmittingClue] = useState(false);
	const [submittingVote, setSubmittingVote] = useState(false);

	const me = game.players.find((p) => p.id === playerId);
	const cluePlayers = getActivePlayersForClues(game);
	const votingPlayers = getActivePlayersForVoting(game);
	const activePlayers = game.phase === "voting" ? votingPlayers : cluePlayers;
	const roundStarter = getRoundStarter(game);
	const isImpostor = me?.role === "impostor";
	const currentCluePlayer = cluePlayers[game.currentPlayerIndex];
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

	useEffect(() => {
		if (game.phase !== "clues") {
			setSubmittingClue(false);
		}
		if (game.phase !== "voting") {
			setSubmittingVote(false);
		}
	}, [game.phase]);

	const handleSubmitClue = async () => {
		if (!clue.trim() || submittingClue) {
			return;
		}

		setSubmittingClue(true);
		const success = await doAction("clue", { clue: clue.trim() });
		if (success) {
			setClue("");
		}
		setSubmittingClue(false);
	};

	const handleSubmitVote = async () => {
		if (!selectedTarget || submittingVote) {
			return;
		}

		setSubmittingVote(true);
		const success = await doAction("vote", { targetId: selectedTarget });
		if (success) {
			setHasVoted(true);
		}
		setSubmittingVote(false);
	};

	const handleBackClick = () => {
		setShowLeaveConfirm(true);
	};

	// Leave confirmation overlay
	const leaveConfirmOverlay = showLeaveConfirm ? (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
			<div className="w-full max-w-sm glow-box rounded-xl p-6 text-center animate-slide-up">
				<AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
				<h3 className="text-lg font-bold text-foreground mb-2">{t("leave.title")}</h3>
				<p className="text-sm text-muted-foreground mb-6">{t("leave.description")}</p>
				<div className="space-y-3">
					<Button onClick={onLeaveRoom} className="w-full h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90">
						<ArrowLeft className="h-4 w-4 mr-2" />
						{t("leave.leaveGame")}
					</Button>
					{amHost && (
						<Button
							onClick={onEndGame}
							variant="outline"
							className="w-full h-12 border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive hover:text-white">
							<Power className="h-4 w-4 mr-2" />
							{t("leave.endForEveryone")}
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => setShowLeaveConfirm(false)}
						className="w-full h-12 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
						{t("leave.stayInGame")}
					</Button>
				</div>
			</div>
		</div>
	) : null;

	// Disconnect overlay (shown on top of any phase)
	const disconnectOverlay = disconnectPause ? (
		<DisconnectOverlay disconnectPause={disconnectPause} amHost={amHost} doAction={doAction} onLeaveRoom={onLeaveRoom} />
	) : null;

	const starterBanner = roundStarter ? (
		<div className="glow-box rounded-xl p-4 mb-6 text-center">
			<p className="text-xs font-mono text-muted-foreground uppercase mb-1">{t("clues.startingPlayerLabel")}</p>
			<p className="text-sm text-foreground">{t("clues.startingPlayer", { name: roundStarter.name })}</p>
		</div>
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
						title={t("clues.rolesActive")}
						subtitle={t("clues.waitingForVoting", { round: game.currentRound })}
						round={game.currentRound}
					/>
					<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col justify-center">
						<OnlineRoleCard game={game} isImpostor={isImpostor} roleRevealed={roleRevealed} onToggle={() => setRoleRevealed(!roleRevealed)} />
						{starterBanner}
						<div className="glow-box rounded-xl p-4 mb-6">
							<p className="text-sm text-muted-foreground text-center">{t("clues.textChatDisabled")}</p>
							<p className="text-sm text-muted-foreground text-center mt-1">{t("clues.hostWillDecide")}</p>
						</div>

						{amHost ? (
							<Button
								onClick={() => doAction("start-voting")}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								<Vote className="h-5 w-5 mr-2" />
								{t("clues.startVoting")}
							</Button>
						) : (
							<div className="text-center py-8">
								<MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
								<p className="text-sm text-muted-foreground">{t("clues.waitingHostVoting")}</p>
							</div>
						)}

						{error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
					</div>
				</div>
			);
		}

		const cluesThisRound = cluePlayers
			.filter((p) => p.clues.length >= game.currentRound)
			.map((p) => ({ name: p.name, clue: p.clues[game.currentRound - 1] }));

		return (
			<div className="min-h-dvh flex flex-col">
				{disconnectOverlay}
				{leaveConfirmOverlay}
				<GameNavbar
					onBack={handleBackClick}
					title={t("game:clues.title")}
					subtitle={t("game:clues.subtitle", { round: game.currentRound })}
					round={game.currentRound}
				/>
				<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
					<OnlineRoleCard game={game} isImpostor={isImpostor} roleRevealed={roleRevealed} onToggle={() => setRoleRevealed(!roleRevealed)} />
					{starterBanner}

					{/* Clues */}
					{cluesThisRound.length > 0 && (
						<div className="mb-6">
							<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t("clues.cluesGiven")}</p>
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
							<p className="text-sm font-bold text-foreground text-center mb-2">{t("clues.itsYourTurn")}</p>
							<p className="text-xs text-muted-foreground text-center mb-4">{t("clues.singleWordClue")}</p>
							<div className="flex gap-2">
								<Input
									placeholder={t("game:clues.yourCluePlaceholder")}
									value={clue}
									onChange={(e) => setClue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && clue.trim() && !submittingClue) {
											void handleSubmitClue();
										}
									}}
									maxLength={30}
									autoFocus
									className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
								/>
								<Button
									onClick={() => {
										void handleSubmitClue();
									}}
									disabled={!clue.trim() || submittingClue}
									size="lg"
									className="h-12 px-4 bg-primary text-primary-foreground shrink-0">
									<Send className="h-5 w-5" />
									<span className="sr-only">{t("game:clues.submitClue")}</span>
								</Button>
							</div>
						</div>
					) : (
						<div className="text-center py-8">
							<MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-pulse-glow" />
							<p className="text-sm text-muted-foreground">{t("clues.waitingForClue", { name: currentCluePlayer?.name })}</p>
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
		const cluesThisRound = votingPlayers.map((p) => ({
			id: p.id,
			name: p.name,
			clue: p.clues[game.currentRound - 1] || t("game:clues.noClue"),
		}));

		const votedCount = votingPlayers.filter((p) => p.votedFor !== null).length;
		const pendingVotes = Math.max(0, votingPlayers.length - votedCount);
		const amEliminated = Boolean(me?.isEliminated);

		return (
			<div className="min-h-dvh flex flex-col">
				{disconnectOverlay}
				{leaveConfirmOverlay}
				<GameNavbar
					onBack={handleBackClick}
					title={t("game:voting.title")}
					subtitle={t("game:voting.subtitle", { round: game.currentRound })}
					round={game.currentRound}
				/>
				<div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
					{/* Clue Summary */}
					{game.textChatEnabled && (
						<div className="mb-6">
							<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t("game:voting.clueSummary")}</p>
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
							<p className="text-sm text-muted-foreground">{t("game:voting.youWereEliminated")}</p>
							<p className="text-xs text-muted-foreground mt-1 font-mono">{t("game:voting.waitingForNextGame")}</p>
						</div>
					) : hasVoted || me?.votedFor ? (
						<div className="text-center py-8">
							<Check className="h-8 w-8 text-accent mx-auto mb-3" />
							<p className="text-sm text-muted-foreground">{t("game:voting.voteSubmitted")}</p>
							<p className="text-xs text-muted-foreground mt-1 font-mono">{t("voting.playersLeftToVote", { count: pendingVotes })}</p>
						</div>
					) : (
						<div className="animate-slide-up">
							<p className="text-sm font-bold text-foreground text-center mb-4">{t("game:voting.whoIsImpostor")}</p>
							<div className="space-y-2 mb-6">
								{votingPlayers
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
								onClick={() => {
									void handleSubmitVote();
								}}
								disabled={!selectedTarget || submittingVote}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
								<Vote className="h-5 w-5 mr-2" />
								{t("game:voting.confirmVote")}
							</Button>
							<p className="text-xs text-center text-muted-foreground mt-3 font-mono">{t("voting.playersLeftToVote", { count: pendingVotes })}</p>
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
						{t("common:roundResult", { number: lastResult.round })}
					</p>

					{lastResult.wasTie ? (
						<div>
							<RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
							<h2 className="text-2xl font-bold text-foreground mb-3">{t("game:resolution.tieTitle")}</h2>
							<p className="text-sm text-muted-foreground">{t("game:resolution.tieNoElimination")}</p>
						</div>
					) : (
						eliminatedPlayer && (
							<div>
								{!lastResult.impostorSurvived ? (
									<>
										<Trophy className="h-12 w-12 text-accent mx-auto mb-4" />
										<h2 className="text-2xl font-bold text-accent mb-3">{t("game:resolution.impostorFound")}</h2>
										<p className="text-sm text-muted-foreground">
											<span className="font-bold text-foreground">{eliminatedPlayer.name}</span> {t("game:resolution.wasImpostor")}
										</p>
									</>
								) : (
									<>
										<Skull className="h-12 w-12 text-destructive mx-auto mb-4" />
										<h2 className="text-2xl font-bold text-destructive mb-3">{t("game:resolution.wrongPerson")}</h2>
										<p className="text-sm text-muted-foreground">
											<span className="font-bold text-foreground">{eliminatedPlayer.name}</span> {t("game:resolution.wasFriendOnline")}
										</p>
									</>
								)}
							</div>
						)
					)}

					{/* Vote Results */}
					<div className="mt-8 mb-8">
						<p className="text-xs font-mono text-muted-foreground uppercase mb-3">{t("game:resolution.voteResults")}</p>
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
													{t("game:resolution.voteCount", { count: receivedVotes })}
												</span>
											</div>
											<div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
												<div className="h-full bg-primary" style={{ width: barWidth }} />
											</div>
											{isEliminatedThisRound && (
												<p className="text-xs text-muted-foreground mt-2">{t("game:resolution.eliminatedThisRound")}</p>
											)}
										</div>
									);
								})}
						</div>
					</div>

					{game.phase === "game-over" ? (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground mb-4">
								{t("common:gameOver")} {game.winner === "friends" ? t("common:friendsWin") : t("common:impostorsWin")}
							</p>
							<Link href="/play/online/results" onClick={() => saveResultsGame(game)}>
								<Button size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
									<Trophy className="h-5 w-5 mr-2" />
									{t("common:viewFinalScores")}
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
										{t("common:playAgainSamePlayers")}
									</Button>
									<Button onClick={onEndGame} variant="ghost" size="sm" className="w-full mt-2 text-destructive hover:bg-destructive/10">
										<Power className="h-4 w-4 mr-2" />
										{t("leave.endForEveryone")}
									</Button>
								</>
							) : (
								<div className="text-center py-4">
									<Users className="h-6 w-6 text-muted-foreground mx-auto mb-2 animate-pulse-glow" />
									<p className="text-sm text-muted-foreground">{t("resolution.waitingNewGame")}</p>
									<Button variant="ghost" size="sm" onClick={onLeaveRoom} className="mt-3 text-muted-foreground hover:text-foreground">
										<DoorOpen className="h-4 w-4 mr-2" />
										{t("common:leaveRoom")}
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
								{t("common:nextRound")}
								<ArrowRight className="h-5 w-5 ml-2" />
							</Button>
							<Button onClick={onEndGame} variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10">
								<Power className="h-4 w-4 mr-2" />
								{t("leave.endForEveryone")}
							</Button>
						</div>
					) : (
						<div className="text-center py-4">
							<p className="text-sm text-muted-foreground">{t("resolution.waitingNextRound")}</p>
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
				<p className="text-sm text-muted-foreground">{t("game.loadingGameState")}</p>
			</div>
		</div>
	);
}

// Replaced by shared GameNavbar
