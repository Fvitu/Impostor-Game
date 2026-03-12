"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock, Clipboard, DoorOpen, Wifi } from "lucide-react";
import { SessionAccessPanel } from "@/components/auth/session-access-panel";
import { useAuth } from "@/components/auth-provider";
import { GameNavbar } from "@/components/game/game-navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validatePlayerName } from "@/lib/player-name";
import { clearWaitingSession, getSavedPlayerName, saveWaitingSession } from "@/lib/storage";

interface OnlineLobbyProps {
	onJoined: (code: string, playerId: string, isHost: boolean) => void;
}

type LobbyMode = "choose" | "session-gate" | "create" | "join" | "waiting";
type PendingAction = "create" | "join" | null;

function getValidGuestSessionName(): string {
	const savedName = getSavedPlayerName();
	const validation = validatePlayerName(savedName);
	return validation.isValid ? validation.value : "";
}

export function OnlineLobby({ onJoined }: OnlineLobbyProps) {
	const { t } = useTranslation(["online", "auth"]);
	const { user } = useAuth();
	const [mode, setMode] = useState<LobbyMode>("choose");
	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const [guestSessionName, setGuestSessionName] = useState("");
	const [roomCode, setRoomCode] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [waitingPlayerId, setWaitingPlayerId] = useState("");
	const [waitingPosition, setWaitingPosition] = useState(0);
	const [waitingRoomCode, setWaitingRoomCode] = useState("");

	useEffect(() => {
		setGuestSessionName(getValidGuestSessionName());
	}, []);

	const sessionName = user?.username ?? guestSessionName;
	const hasSessionIdentity = sessionName.length > 0;

	const openFlow = (nextAction: Exclude<PendingAction, null>) => {
		setPendingAction(nextAction);
		setError("");
		setLoading(false);
		setMode(hasSessionIdentity ? nextAction : "session-gate");
	};

	const handleSessionResolved = () => {
		if (pendingAction) {
			setMode(pendingAction);
		}
	};

	const handleGuestResolved = (guestName: string) => {
		setGuestSessionName(guestName);
		handleSessionResolved();
	};

	const handleCreate = async () => {
		if (!sessionName) {
			setMode("session-gate");
			return;
		}

		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/rooms/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ hostName: sessionName }),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error);
			}

			onJoined(data.code, data.playerId, true);
		} catch (reason: unknown) {
			setError(reason instanceof Error ? reason.message : t("lobby.failedCreate"));
		} finally {
			setLoading(false);
		}
	};

	const handleJoin = async (codeParam?: string) => {
		const codeToUse = (codeParam ?? roomCode).trim().toUpperCase();
		if (!sessionName) {
			setMode("session-gate");
			return;
		}

		if (!codeToUse) {
			return;
		}

		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/rooms/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: codeToUse, playerName: sessionName }),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error);
			}

			if (data.status === "waiting") {
				setWaitingPlayerId(data.waitingPlayerId);
				setWaitingPosition(data.position);
				setWaitingRoomCode(data.code);
				saveWaitingSession({ roomCode: data.code, waitingPlayerId: data.waitingPlayerId, playerName: sessionName });
				setMode("waiting");
				return;
			}

			onJoined(data.code, data.playerId, false);
		} catch (reason: unknown) {
			setError(reason instanceof Error ? reason.message : t("lobby.failedJoin"));
		} finally {
			setLoading(false);
		}
	};

	const handlePasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText();
			const sanitized =
				(text || "")
					.toUpperCase()
					.match(/[A-Z0-9]/g)
					?.join("")
					.slice(0, 5) ?? "";

			if (!sanitized) {
				setError(t("lobby.noValidCode"));
				return;
			}

			setRoomCode(sanitized);
			if (hasSessionIdentity) {
				await handleJoin(sanitized);
			}
		} catch {
			setError(t("lobby.clipboardError"));
		}
	};

	const pollWaiting = useCallback(async () => {
		if (mode !== "waiting" || !waitingRoomCode || !waitingPlayerId) {
			return;
		}

		try {
			const res = await fetch(`/api/rooms/state?code=${waitingRoomCode}&wid=${waitingPlayerId}`);
			if (!res.ok) {
				if (res.status === 404 || res.status === 410) {
					clearWaitingSession();
					setMode("join");
					setError(t("lobby.roomNoLongerAvailable"));
				}
				return;
			}

			const data = await res.json();
			if (data.promoted) {
				clearWaitingSession();
				onJoined(data.code, data.playerId, false);
				return;
			}

			if (data.waiting) {
				setWaitingPosition(data.position);
			}
		} catch {
			// silently retry
		}
	}, [mode, onJoined, t, waitingPlayerId, waitingRoomCode]);

	useEffect(() => {
		if (mode !== "waiting") {
			return;
		}

		const interval = setInterval(pollWaiting, 4000);
		return () => clearInterval(interval);
	}, [mode, pollWaiting]);

	const handleLeaveWaitingList = async () => {
		try {
			await fetch("/api/rooms/action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "leave-waiting-list", code: waitingRoomCode, waitingPlayerId }),
			});
		} catch {
			// ignore
		}

		clearWaitingSession();
		setMode("choose");
		setWaitingPlayerId("");
		setWaitingRoomCode("");
	};

	const renderSessionCard = () => (
		<div className="rounded-lg border border-border bg-secondary/40 px-4 py-4">
			<p className="text-sm font-medium text-foreground">{user ? t("lobby.sessionAccountTitle") : t("lobby.sessionGuestTitle")}</p>
			<p className="text-xs text-muted-foreground mt-1">
				{user ? t("lobby.sessionAccountDescription", { username: sessionName }) : t("lobby.sessionGuestDescription", { username: sessionName })}
			</p>
		</div>
	);

	return (
		<div className="min-h-dvh flex flex-col">
			<GameNavbar backHref="/" title={t("lobby.title")} subtitle={t("lobby.subtitle")} />

			<div className="flex-1 flex flex-col items-center justify-center px-4 max-w-sm mx-auto w-full">
				{mode === "choose" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<div className="text-center mb-8">
							<Wifi className="h-12 w-12 text-primary mx-auto mb-4" />
							<h2 className="text-xl font-bold text-foreground">{t("lobby.onlineMultiplayer")}</h2>
							<p className="text-sm text-muted-foreground mt-2">{t("lobby.eachPlayerJoins")}</p>
						</div>
						<Button
							onClick={() => openFlow("create")}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							{t("lobby.createRoom")}
						</Button>
						<Button
							onClick={() => openFlow("join")}
							size="lg"
							variant="outline"
							className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
							{t("lobby.joinRoom")}
						</Button>
					</div>
				)}

				{mode === "session-gate" && pendingAction && (
					<SessionAccessPanel
						title={pendingAction === "create" ? t("lobby.createRoom") : t("lobby.joinRoom")}
						description={pendingAction === "create" ? t("lobby.createRoomAuthDescription") : t("lobby.joinRoomAuthDescription")}
						guestNote={t("auth:guestNote")}
						showChooseBack
						onBack={() => {
							setPendingAction(null);
							setMode("choose");
						}}
						onAuthenticated={handleSessionResolved}
						onGuest={handleGuestResolved}
					/>
				)}

				{mode === "create" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<Button
							variant="ghost"
							onClick={() => {
								setPendingAction(null);
								setMode("choose");
								setError("");
							}}
							className="mb-6 text-muted-foreground">
							<ArrowLeft className="h-4 w-4 mr-2" />
							{t("lobby.back")}
						</Button>
						<h2 className="text-xl font-bold text-foreground mb-6">{t("lobby.createRoom")}</h2>
						<div className="space-y-4">
							{renderSessionCard()}
							{error && <p className="text-sm text-destructive">{error}</p>}
							<Button
								onClick={handleCreate}
								disabled={!hasSessionIdentity || loading}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								{loading ? t("lobby.creating") : t("lobby.createRoomBtn")}
							</Button>
						</div>
					</div>
				)}

				{mode === "join" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<Button
							variant="ghost"
							onClick={() => {
								setPendingAction(null);
								setMode("choose");
								setError("");
							}}
							className="mb-6 text-muted-foreground">
							<ArrowLeft className="h-4 w-4 mr-2" />
							{t("lobby.back")}
						</Button>
						<h2 className="text-xl font-bold text-foreground mb-6">{t("lobby.joinRoom")}</h2>
						<div className="space-y-4">
							{renderSessionCard()}
							<div>
								<label htmlFor="room-code" className="block text-sm font-medium text-foreground mb-2">
									{t("lobby.roomCode")}
								</label>
								<div className="flex gap-2 items-center">
									<Input
										id="room-code"
										placeholder={t("lobby.roomCodePlaceholder")}
										value={roomCode}
										onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
										maxLength={5}
										className="h-12 text-base text-center tracking-[0.3em] font-mono border-border text-foreground placeholder:text-muted-foreground uppercase flex-1"
										autoComplete="off"
									/>
									<Button
										variant="ghost"
										size="icon"
										onClick={handlePasteFromClipboard}
										disabled={loading}
										className="h-12 w-12 shrink-0 text-muted-foreground hover:text-foreground"
										aria-label={t("lobby.pasteRoomCode")}>
										<Clipboard className="h-4 w-4" />
									</Button>
								</div>
							</div>
							{error && <p className="text-sm text-destructive">{error}</p>}
							<Button
								onClick={() => {
									void handleJoin();
								}}
								disabled={!hasSessionIdentity || roomCode.trim().length !== 5 || loading}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								{loading ? t("lobby.joining") : t("lobby.joinRoomBtn")}
							</Button>
						</div>
					</div>
				)}

				{mode === "waiting" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<div className="text-center">
							<Clock className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
							<h2 className="text-xl font-bold text-foreground mb-2">{t("lobby.waitingRoom")}</h2>
							<p className="text-sm text-muted-foreground mt-2">
								{t("lobby.gameInProgress")} <span className="font-mono font-bold text-foreground">{waitingRoomCode}</span>
							</p>
							<p className="text-sm text-muted-foreground mt-1">{t("lobby.waitingPosition", { position: waitingPosition })}</p>
							<div className="mt-6">
								<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
								<p className="text-xs text-muted-foreground font-mono">{t("lobby.waitingForFinish")}</p>
							</div>
							<Button
								variant="outline"
								onClick={handleLeaveWaitingList}
								className="mt-6 w-full h-12 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
								<DoorOpen className="h-4 w-4 mr-2" />
								{t("lobby.leaveWaitingRoom")}
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}