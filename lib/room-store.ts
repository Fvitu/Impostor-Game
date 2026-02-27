// In-memory room store for online multiplayer
// In production, this would be backed by Redis or a database

import type { GameState, Player } from "./game-logic"
import {
  createGame,
  createPlayer,
  assignRoles,
  submitClue,
  submitVote,
  resolveRound,
  allVotesIn,
  generateRoomCode,
} from "./game-logic"

export interface Room {
  code: string
  hostId: string
  game: GameState
  lastActivity: number
  impostorHelp: boolean
}

// In-memory store (resets on server restart)
const rooms = new Map<string, Room>()

// Cleanup old rooms every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [code, room] of rooms) {
      if (now - room.lastActivity > 30 * 60 * 1000) {
        rooms.delete(code)
      }
    }
  }, 5 * 60 * 1000)
}

export function createRoom(hostName: string): { room: Room; playerId: string } {
  const code = generateRoomCode()
  const game = createGame("online")
  const host = createPlayer(hostName)
  game.players.push(host)

  const room: Room = {
    code,
    hostId: host.id,
    game,
    lastActivity: Date.now(),
    impostorHelp: false,
  }

  rooms.set(code, room)
  return { room, playerId: host.id }
}

export function getRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase())
  if (room) room.lastActivity = Date.now()
  return room
}

export function joinRoom(code: string, playerName: string): { room: Room; playerId: string } | null {
  const room = getRoom(code.toUpperCase())
  if (!room) return null
  if (room.game.phase !== "setup") return null
  if (room.game.players.length >= 12) return null
  if (room.game.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase())) return null

  const player = createPlayer(playerName)
  room.game.players.push(player)
  room.lastActivity = Date.now()
  return { room, playerId: player.id }
}

export function startRoomGame(code: string, hostId: string, impostorHelp: boolean): Room | null {
  const room = getRoom(code)
  if (!room || room.hostId !== hostId) return null
  if (room.game.players.length < 4) return null

  room.impostorHelp = impostorHelp
  room.game.impostorHelp = impostorHelp
  room.game = assignRoles(room.game)
  // Move directly to clues phase since each player can see their own role via the API
  room.game.phase = "clues"
  room.lastActivity = Date.now()
  return room
}

export function submitRoomClue(code: string, playerId: string, clue: string): Room | null {
  const room = getRoom(code)
  if (!room || room.game.phase !== "clues") return null

  const activePlayers = room.game.players.filter((p) => !p.isEliminated)
  const currentPlayer = activePlayers[room.game.currentPlayerIndex]
  if (!currentPlayer || currentPlayer.id !== playerId) return null

  room.game = submitClue(room.game, playerId, clue)
  room.lastActivity = Date.now()
  return room
}

export function submitRoomVote(code: string, voterId: string, targetId: string): Room | null {
  const room = getRoom(code)
  if (!room || room.game.phase !== "voting") return null

  room.game = submitVote(room.game, voterId, targetId)

  // Auto-resolve when all votes are in
  if (allVotesIn(room.game)) {
    room.game = resolveRound(room.game)
  }

  room.lastActivity = Date.now()
  return room
}

export function startNextRound(code: string, hostId: string): Room | null {
  const room = getRoom(code)
  if (!room || room.hostId !== hostId) return null
  if (room.game.phase !== "resolution" && room.game.phase !== "roles") return null

  room.game = assignRoles(room.game)
  room.game.phase = "clues"
  room.lastActivity = Date.now()
  return room
}

export function removePlayerFromRoom(code: string, hostId: string, playerId: string): Room | null {
  const room = getRoom(code)
  if (!room || room.hostId !== hostId) return null
  if (room.game.phase !== "setup") return null

  room.game.players = room.game.players.filter((p) => p.id !== playerId)
  room.lastActivity = Date.now()
  return room
}
