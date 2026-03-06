"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Wifi, UserPlus, Pencil, Check, Clock, DoorOpen, Clipboard } from "lucide-react";
import Link from "next/link";
import { GameNavbar } from "@/components/game/game-navbar";
import { getSavedPlayerName, savePlayerName, saveWaitingSession, clearWaitingSession } from "@/lib/storage";

interface OnlineLobbyProps {
	onJoined: (code: string, playerId: string, isHost: boolean) => void;
}

export function OnlineLobby({ onJoined }: OnlineLobbyProps) {
	const [mode, setMode] = useState<"choose" | "create" | "join" | "waiting">("choose");
	const [name, setName] = useState("");
	const [nameEditable, setNameEditable] = useState(true);
	const [roomCode, setRoomCode] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [waitingPlayerId, setWaitingPlayerId] = useState("");
	const [waitingPosition, setWaitingPosition] = useState(0);
	const [waitingRoomCode, setWaitingRoomCode] = useState("");

	// Load saved name on mount
	useEffect(() => {
		const savedName = getSavedPlayerName();
		if (savedName) {
			setName(savedName);
			setNameEditable(false); // Lock name, show pencil to edit
		}
	}, []);

	const handleCreate = async () => {
		if (!name.trim()) return;
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/rooms/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ hostName: name.trim() }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			savePlayerName(name.trim());
			onJoined(data.code, data.playerId, true);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to create room");
		} finally {
			setLoading(false);
		}
	};

	const handleJoin = async (codeParam?: string) => {
		const codeToUse = (codeParam ?? roomCode).trim().toUpperCase();
		if (!name.trim() || !codeToUse) return;
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/rooms/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: codeToUse, playerName: name.trim() }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);

			savePlayerName(name.trim());

			if (data.status === "waiting") {
				// Player added to waiting list
				setWaitingPlayerId(data.waitingPlayerId);
				setWaitingPosition(data.position);
				setWaitingRoomCode(data.code);
				saveWaitingSession({ roomCode: data.code, waitingPlayerId: data.waitingPlayerId, playerName: name.trim() });
				setMode("waiting");
			} else {
				// Joined or rejoined
				onJoined(data.code, data.playerId, data.status === "joined" && false);
			}
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to join room");
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
				setError("No valid room code found in clipboard");
				return;
			}
			setRoomCode(sanitized);
			// Auto-join if name exists
			if (name.trim()) {
				await handleJoin(sanitized);
			}
		} catch (err) {
			setError("Unable to read from clipboard");
		}
	};

	// Poll for waiting list promotion
	const pollWaiting = useCallback(async () => {
		if (mode !== "waiting" || !waitingRoomCode || !waitingPlayerId) return;
		try {
			const res = await fetch(`/api/rooms/state?code=${waitingRoomCode}&wid=${waitingPlayerId}`);
			if (!res.ok) {
				if (res.status === 404 || res.status === 410) {
					// Room gone or player removed from waiting list
					clearWaitingSession();
					setMode("join");
					setError("The room is no longer available");
				}
				return;
			}
			const data = await res.json();
			if (data.promoted) {
				// Player has been added to the game
				clearWaitingSession();
				onJoined(data.code, data.playerId, false);
			} else if (data.waiting) {
				setWaitingPosition(data.position);
			}
		} catch {
			// Silently retry
		}
	}, [mode, waitingRoomCode, waitingPlayerId, onJoined]);

	useEffect(() => {
		if (mode !== "waiting") return;
		const interval = setInterval(pollWaiting, 2000);
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

	// Reusable name input with edit toggle
	const renderNameField = (inputId: string) => (
		<div>
			<label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-2">
				Your Name
			</label>
			<div className="flex gap-2">
				<Input
					id={inputId}
					placeholder="Enter your name..."
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={20}
					disabled={!nameEditable}
					className={`h-12 text-base border-border text-foreground placeholder:text-muted-foreground ${!nameEditable ? "opacity-70" : ""}`}
					autoComplete="off"
				/>
				{!nameEditable ? (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setNameEditable(true)}
						className="h-12 w-12 shrink-0 text-muted-foreground hover:text-foreground"
						aria-label="Edit name">
						<Pencil className="h-4 w-4" />
					</Button>
				) : name.trim() && getSavedPlayerName() ? (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => {
							savePlayerName(name.trim());
							setNameEditable(false);
						}}
						className="h-12 w-12 shrink-0 text-muted-foreground hover:text-foreground"
						aria-label="Confirm name">
						<Check className="h-4 w-4" />
					</Button>
				) : null}
			</div>
		</div>
	);

	return (
		<div className="min-h-dvh flex flex-col">
			<GameNavbar backHref="/" title={"Play Online"} subtitle={"Create or join a room"} />

			<div className="flex-1 flex flex-col items-center justify-center px-4 max-w-sm mx-auto w-full">
				{mode === "choose" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<div className="text-center mb-8">
							<Wifi className="h-12 w-12 text-primary mx-auto mb-4" />
							<h2 className="text-xl font-bold text-foreground">Online Multiplayer</h2>
							<p className="text-sm text-muted-foreground mt-2">Each player joins from their own device</p>
						</div>
						<Button
							onClick={() => setMode("create")}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							Create a Room
						</Button>
						<Button
							onClick={() => setMode("join")}
							size="lg"
							variant="outline"
							className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
							Join a Room
						</Button>
					</div>
				)}

				{mode === "create" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<Button
							variant="ghost"
							onClick={() => {
								setMode("choose");
								setError("");
							}}
							className="mb-6 text-muted-foreground">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back
						</Button>
						<h2 className="text-xl font-bold text-foreground mb-6">Create a Room</h2>
						<div className="space-y-4">
							{renderNameField("host-name")}
							{error && <p className="text-sm text-destructive">{error}</p>}
							<Button
								onClick={handleCreate}
								disabled={!name.trim() || loading}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								{loading ? "Creating..." : "Create Room"}
							</Button>
						</div>
					</div>
				)}

				{mode === "join" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<Button
							variant="ghost"
							onClick={() => {
								setMode("choose");
								setError("");
							}}
							className="mb-6 text-muted-foreground">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back
						</Button>
						<h2 className="text-xl font-bold text-foreground mb-6">Join a Room</h2>
						<div className="space-y-4">
							{renderNameField("join-name")}
							<div>
								<label htmlFor="room-code" className="block text-sm font-medium text-foreground mb-2">
									Room Code
								</label>
								<div className="flex gap-2 items-center">
									<Input
										id="room-code"
										placeholder="e.g. ABC12"
										value={roomCode}
										onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
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
										aria-label="Paste room code from clipboard">
										<Clipboard className="h-4 w-4" />
									</Button>
								</div>
							</div>
							{error && <p className="text-sm text-destructive">{error}</p>}
							<Button
								onClick={handleJoin}
								disabled={!name.trim() || !roomCode.trim() || loading}
								size="lg"
								className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
								<UserPlus className="h-5 w-5 mr-2" />
								{loading ? "Joining..." : "Join Room"}
							</Button>
						</div>
					</div>
				)}

				{mode === "waiting" && (
					<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
						<div className="text-center">
							<Clock className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
							<h2 className="text-xl font-bold text-foreground mb-2">Waiting Room</h2>
							<p className="text-sm text-muted-foreground mt-2">
								A game is in progress in room <span className="font-mono font-bold text-foreground">{waitingRoomCode}</span>
							</p>
							<p className="text-sm text-muted-foreground mt-1">
								{"You're #"}
								{waitingPosition}
								{" on the waiting list. You'll automatically join when the current game ends."}
							</p>
							<div className="mt-6">
								<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
								<p className="text-xs text-muted-foreground font-mono">Waiting for game to finish...</p>
							</div>
							<Button
								variant="outline"
								onClick={handleLeaveWaitingList}
								className="mt-6 w-full h-12 border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
								<DoorOpen className="h-4 w-4 mr-2" />
								Leave Waiting Room
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
