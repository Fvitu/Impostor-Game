"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Wifi, UserPlus } from "lucide-react"
import Link from "next/link"

interface OnlineLobbyProps {
  onJoined: (code: string, playerId: string, isHost: boolean) => void
}

export function OnlineLobby({ onJoined }: OnlineLobbyProps) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose")
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onJoined(data.code, data.playerId, true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create room")
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim() || !roomCode.trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode.trim().toUpperCase(), playerName: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onJoined(data.code, data.playerId, false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join room")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <Button asChild variant="ghost" size="icon">
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to home</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Play Online</h1>
          <p className="text-xs text-muted-foreground font-mono">Create or join a room</p>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-sm mx-auto w-full">
        {mode === "choose" && (
          <div className="w-full space-y-4 animate-slide-up">
            <div className="text-center mb-8">
              <Wifi className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground">Online Multiplayer</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Each player joins from their own device
              </p>
            </div>
            <Button
              onClick={() => setMode("create")}
              size="lg"
              className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create a Room
            </Button>
            <Button
              onClick={() => setMode("join")}
              size="lg"
              variant="outline"
              className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground"
            >
              Join a Room
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="w-full animate-slide-up">
            <Button
              variant="ghost"
              onClick={() => { setMode("choose"); setError("") }}
              className="mb-6 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h2 className="text-xl font-bold text-foreground mb-6">Create a Room</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="host-name" className="block text-sm font-medium text-foreground mb-2">
                  Your Name
                </label>
                <Input
                  id="host-name"
                  placeholder="Enter your name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? "Creating..." : "Create Room"}
              </Button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="w-full animate-slide-up">
            <Button
              variant="ghost"
              onClick={() => { setMode("choose"); setError("") }}
              className="mb-6 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h2 className="text-xl font-bold text-foreground mb-6">Join a Room</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="join-name" className="block text-sm font-medium text-foreground mb-2">
                  Your Name
                </label>
                <Input
                  id="join-name"
                  placeholder="Enter your name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  className="h-12 text-base bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label htmlFor="room-code" className="block text-sm font-medium text-foreground mb-2">
                  Room Code
                </label>
                <Input
                  id="room-code"
                  placeholder="e.g. ABC12"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="h-12 text-base text-center tracking-[0.3em] font-mono bg-secondary border-border text-foreground placeholder:text-muted-foreground uppercase"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                onClick={handleJoin}
                disabled={!name.trim() || !roomCode.trim() || loading}
                size="lg"
                className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <UserPlus className="h-5 w-5 mr-2" />
                {loading ? "Joining..." : "Join Room"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
