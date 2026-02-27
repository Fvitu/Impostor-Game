"use client"

import { useState } from "react"
import { OnlineLobby } from "@/components/online/online-lobby"
import { OnlineGameView } from "@/components/online/online-game-view"

export default function OnlinePlayPage() {
  const [session, setSession] = useState<{
    code: string
    playerId: string
    isHost: boolean
  } | null>(null)

  if (!session) {
    return (
      <OnlineLobby
        onJoined={(code, playerId, isHost) =>
          setSession({ code, playerId, isHost })
        }
      />
    )
  }

  return (
    <OnlineGameView
      roomCode={session.code}
      playerId={session.playerId}
      isHost={session.isHost}
    />
  )
}
