// Complete game logic engine for The Impostor

export interface Player {
  id: string
  name: string
  role: "friend" | "impostor" | null
  isEliminated: boolean
  scores: number[]
  totalScore: number
  clues: string[]
  votedFor: string | null
}

export interface GameState {
  id: string
  mode: "pass-and-play" | "online"
  phase: "setup" | "roles" | "clues" | "voting" | "resolution" | "game-over"
  players: Player[]
  currentRound: number
  maxRounds: number
  secretWord: string
  category: string
  impostorHelp: boolean
  currentPlayerIndex: number
  roundResults: RoundResult[]
  winner: "friends" | "impostor" | null
}

export interface RoundResult {
  round: number
  votes: Record<string, string>
  eliminatedPlayer: string | null
  wasTie: boolean
  impostorSurvived: boolean
}

export const WORD_BANK: Record<string, string[]> = {
  Animals: ["Dog", "Cat", "Elephant", "Penguin", "Dolphin", "Eagle", "Tiger", "Giraffe", "Octopus", "Bear"],
  Food: ["Pizza", "Sushi", "Taco", "Burger", "Pasta", "Ice Cream", "Chocolate", "Salad", "Ramen", "Steak"],
  Countries: ["Japan", "Brazil", "France", "Australia", "Egypt", "Canada", "Mexico", "India", "Italy", "Spain"],
  Sports: ["Soccer", "Basketball", "Tennis", "Swimming", "Boxing", "Cricket", "Volleyball", "Golf", "Hockey", "Baseball"],
  Movies: ["Titanic", "Avatar", "Inception", "Frozen", "Gladiator", "Jaws", "Rocky", "Matrix", "Shrek", "Coco"],
  Professions: ["Doctor", "Firefighter", "Teacher", "Chef", "Pilot", "Astronaut", "Detective", "Artist", "Engineer", "Scientist"],
  Objects: ["Umbrella", "Guitar", "Telescope", "Candle", "Compass", "Mirror", "Clock", "Backpack", "Keyboard", "Scissors"],
  Places: ["Beach", "Hospital", "Library", "Airport", "Stadium", "Museum", "Park", "Castle", "Market", "School"],
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export function createPlayer(name: string): Player {
  return {
    id: generateId(),
    name,
    role: null,
    isEliminated: false,
    scores: [],
    totalScore: 0,
    clues: [],
    votedFor: null,
  }
}

export function createGame(mode: "pass-and-play" | "online"): GameState {
  return {
    id: generateId(),
    mode,
    phase: "setup",
    players: [],
    currentRound: 1,
    maxRounds: 3,
    secretWord: "",
    category: "",
    impostorHelp: false,
    currentPlayerIndex: 0,
    roundResults: [],
    winner: null,
  }
}

export function addPlayer(game: GameState, name: string): GameState {
  const player = createPlayer(name)
  return { ...game, players: [...game.players, player] }
}

export function removePlayer(game: GameState, playerId: string): GameState {
  return { ...game, players: game.players.filter((p) => p.id !== playerId) }
}

export function assignRoles(game: GameState): GameState {
  const categories = Object.keys(WORD_BANK)
  const category = categories[Math.floor(Math.random() * categories.length)]
  const words = WORD_BANK[category]
  const secretWord = words[Math.floor(Math.random() * words.length)]

  const activePlayers = game.players.filter((p) => !p.isEliminated)
  const impostorIndex = Math.floor(Math.random() * activePlayers.length)

  const updatedPlayers = game.players.map((player) => {
    if (player.isEliminated) return player
    const activeIndex = activePlayers.findIndex((p) => p.id === player.id)
    return {
      ...player,
      role: activeIndex === impostorIndex ? ("impostor" as const) : ("friend" as const),
      votedFor: null,
      clues: [...player.clues],
    }
  })

  return {
    ...game,
    phase: "roles",
    players: updatedPlayers,
    secretWord,
    category,
    currentPlayerIndex: 0,
  }
}

export function startCluePhase(game: GameState): GameState {
  return {
    ...game,
    phase: "clues",
    currentPlayerIndex: 0,
  }
}

export function submitClue(game: GameState, playerId: string, clue: string): GameState {
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  const currentActiveIndex = activePlayers.findIndex((p) => p.id === playerId)

  const updatedPlayers = game.players.map((p) => {
    if (p.id === playerId) {
      return { ...p, clues: [...p.clues, clue] }
    }
    return p
  })

  const nextActiveIndex = currentActiveIndex + 1
  const allCluesGiven = nextActiveIndex >= activePlayers.length

  return {
    ...game,
    players: updatedPlayers,
    currentPlayerIndex: allCluesGiven ? 0 : nextActiveIndex,
    phase: allCluesGiven ? "voting" : "clues",
  }
}

export function submitVote(game: GameState, voterId: string, targetId: string): GameState {
  const updatedPlayers = game.players.map((p) => {
    if (p.id === voterId) {
      return { ...p, votedFor: targetId }
    }
    return p
  })

  return { ...game, players: updatedPlayers }
}

export function allVotesIn(game: GameState): boolean {
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  return activePlayers.every((p) => p.votedFor !== null)
}

export function resolveRound(game: GameState): GameState {
  const activePlayers = game.players.filter((p) => !p.isEliminated)
  const impostor = game.players.find((p) => p.role === "impostor" && !p.isEliminated)!

  // Count votes
  const voteCounts: Record<string, number> = {}
  activePlayers.forEach((p) => {
    if (p.votedFor) {
      voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1
    }
  })

  // Find max votes
  const maxVotes = Math.max(...Object.values(voteCounts))
  const playersWithMaxVotes = Object.entries(voteCounts).filter(([, count]) => count === maxVotes)
  const isTie = playersWithMaxVotes.length > 1

  let eliminatedPlayerId: string | null = null
  let impostorSurvived = true

  if (!isTie) {
    eliminatedPlayerId = playersWithMaxVotes[0][0]
    impostorSurvived = eliminatedPlayerId !== impostor.id
  }

  // Build votes record
  const votes: Record<string, string> = {}
  activePlayers.forEach((p) => {
    if (p.votedFor) votes[p.id] = p.votedFor
  })

  const roundResult: RoundResult = {
    round: game.currentRound,
    votes,
    eliminatedPlayer: eliminatedPlayerId,
    wasTie: isTie,
    impostorSurvived,
  }

  // Calculate scores for this round
  let updatedPlayers = game.players.map((p) => {
    if (p.isEliminated) return p
    const roundScore = calculateRoundScore(p, impostor.id, eliminatedPlayerId, isTie)
    const newScores = [...p.scores, roundScore]
    return {
      ...p,
      scores: newScores,
      totalScore: newScores.reduce((a, b) => a + b, 0),
      votedFor: null,
    }
  })

  // Eliminate player if no tie
  if (eliminatedPlayerId) {
    updatedPlayers = updatedPlayers.map((p) => {
      if (p.id === eliminatedPlayerId) {
        return { ...p, isEliminated: true }
      }
      return p
    })
  }

  const roundResults = [...game.roundResults, roundResult]

  // Check game end conditions
  const impostorEliminated = eliminatedPlayerId === impostor.id
  const isLastRound = game.currentRound >= game.maxRounds

  let gameOver = false
  let winner: "friends" | "impostor" | null = null

  if (impostorEliminated) {
    gameOver = true
    winner = "friends"
  } else if (isLastRound) {
    gameOver = true
    winner = "impostor"
  }

  // Apply bonuses if game is over
  if (gameOver) {
    updatedPlayers = applyBonuses(updatedPlayers, impostor.id, winner!)
  }

  return {
    ...game,
    players: updatedPlayers,
    roundResults,
    currentRound: gameOver ? game.currentRound : game.currentRound + 1,
    phase: gameOver ? "game-over" : "resolution",
    winner,
    currentPlayerIndex: 0,
  }
}

function calculateRoundScore(
  player: Player,
  impostorId: string,
  eliminatedId: string | null,
  isTie: boolean
): number {
  if (player.role === "impostor") {
    // Impostor gets +2 for surviving (tie or friend eliminated)
    return isTie || eliminatedId !== player.id ? 2 : 0
  } else {
    // Friend gets +2 for voting the impostor
    return player.votedFor === impostorId ? 2 : 0
  }
}

function applyBonuses(players: Player[], impostorId: string, winner: "friends" | "impostor"): Player[] {
  return players.map((p) => {
    if (p.role === "impostor" && winner === "impostor") {
      // Impostor bonus +10 for surviving all 3 rounds
      return { ...p, totalScore: p.totalScore + 10 }
    } else if (p.role === "friend" && winner === "friends") {
      // Check if friend voted correctly every round
      const votedCorrectlyEveryRound = p.scores.every((s) => s === 2)
      if (votedCorrectlyEveryRound) {
        return { ...p, totalScore: p.totalScore + 10 }
      }
    }
    return p
  })
}

export function getActivePlayersForClues(game: GameState): Player[] {
  return game.players.filter((p) => !p.isEliminated)
}

export function getActivePlayersForVoting(game: GameState): Player[] {
  return game.players.filter((p) => !p.isEliminated)
}

export function getCurrentCluePlayer(game: GameState): Player | null {
  const active = getActivePlayersForClues(game)
  return active[game.currentPlayerIndex] ?? null
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
