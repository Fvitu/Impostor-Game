"""Core game engine: state management, scoring, voting, round progression."""

from __future__ import annotations

import random
import string
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from game.words import WORD_BANK

# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class Phase(str, Enum):
    LOBBY = "lobby"
    ROLES = "roles"
    CLUES = "clues"
    VOTING = "voting"
    RESOLUTION = "resolution"
    GAME_OVER = "game_over"


class Role(str, Enum):
    FRIEND = "friend"
    IMPOSTOR = "impostor"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Player:
    name: str
    sid: str | None = None          # SocketIO session id (None for pass‑and‑play)
    role: Role = Role.FRIEND
    alive: bool = True
    clue: str = ""
    vote_target: str | None = None  # name of player voted against
    scores: list[int] = field(default_factory=list)   # per‑round points
    voted_impostor_rounds: list[bool] = field(default_factory=list)

    @property
    def total_score(self) -> int:
        return sum(self.scores)

    def to_dict(self, reveal: bool = False) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "alive": self.alive,
            "clue": self.clue,
            "total_score": self.total_score,
            "scores": self.scores,
        }
        if reveal:
            d["role"] = self.role.value
        return d


@dataclass
class GameState:
    room_code: str
    host: str                               # player name of creator
    mode: str = "online"                    # "online" | "local"
    impostor_help: bool = False             # whether impostor knows category
    phase: Phase = Phase.LOBBY
    round_number: int = 0                   # 1‑indexed when game starts
    max_rounds: int = 3
    secret_word: str = ""
    category: str = ""
    players: dict[str, Player] = field(default_factory=dict)
    clue_order: list[str] = field(default_factory=list)
    current_clue_index: int = 0
    created_at: float = field(default_factory=time.time)

    # -- helpers ----------------------------------------------------------

    @property
    def alive_players(self) -> list[Player]:
        return [p for p in self.players.values() if p.alive]

    @property
    def impostor(self) -> Player | None:
        for p in self.players.values():
            if p.role == Role.IMPOSTOR:
                return p
        return None

    @property
    def impostor_alive(self) -> bool:
        imp = self.impostor
        return imp is not None and imp.alive

    def player_count(self) -> int:
        return len(self.players)

    def alive_count(self) -> int:
        return len(self.alive_players)

    def to_dict(self, for_player: str | None = None) -> dict[str, Any]:
        """Serialise state for the client. Roles are hidden unless game is over."""
        reveal = self.phase == Phase.GAME_OVER
        players_list = [p.to_dict(reveal=reveal) for p in self.players.values()]
        d: dict[str, Any] = {
            "room_code": self.room_code,
            "host": self.host,
            "mode": self.mode,
            "phase": self.phase.value,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "impostor_help": self.impostor_help,
            "players": players_list,
            "clue_order": self.clue_order,
            "current_clue_index": self.current_clue_index,
            "alive_count": self.alive_count(),
        }
        # Only reveal word to the right people
        if for_player and for_player in self.players:
            p = self.players[for_player]
            if p.role == Role.FRIEND or self.phase == Phase.GAME_OVER:
                d["secret_word"] = self.secret_word
                d["category"] = self.category
            elif p.role == Role.IMPOSTOR and self.impostor_help:
                d["category"] = self.category
                d["secret_word"] = ""
            else:
                d["secret_word"] = ""
                d["category"] = ""
        else:
            if self.phase == Phase.GAME_OVER:
                d["secret_word"] = self.secret_word
                d["category"] = self.category
            else:
                d["secret_word"] = ""
                d["category"] = ""
        return d


# ---------------------------------------------------------------------------
# In‑memory store of rooms  (swap to Redis for horizontal scaling)
# ---------------------------------------------------------------------------

rooms: dict[str, GameState] = {}


def _generate_code(length: int = 6) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if code not in rooms:
            return code


# ---------------------------------------------------------------------------
# Room lifecycle
# ---------------------------------------------------------------------------

def create_room(host_name: str, mode: str = "online", impostor_help: bool = False) -> GameState:
    code = _generate_code()
    gs = GameState(room_code=code, host=host_name, mode=mode, impostor_help=impostor_help)
    gs.players[host_name] = Player(name=host_name)
    rooms[code] = gs
    return gs


def join_room(code: str, player_name: str, sid: str | None = None) -> GameState:
    gs = rooms.get(code)
    if gs is None:
        raise ValueError("Room not found.")
    if gs.phase != Phase.LOBBY:
        raise ValueError("Game already in progress.")
    if player_name in gs.players:
        raise ValueError("Name already taken in this room.")
    gs.players[player_name] = Player(name=player_name, sid=sid)
    return gs


def get_room(code: str) -> GameState | None:
    return rooms.get(code)


def remove_player(code: str, player_name: str) -> None:
    gs = rooms.get(code)
    if gs and player_name in gs.players:
        del gs.players[player_name]
        if not gs.players:
            rooms.pop(code, None)


def delete_room(code: str) -> None:
    rooms.pop(code, None)


# ---------------------------------------------------------------------------
# Game flow helpers
# ---------------------------------------------------------------------------

def _pick_word() -> tuple[str, str]:
    category = random.choice(list(WORD_BANK.keys()))
    word = random.choice(WORD_BANK[category])
    return category, word


def start_game(code: str) -> GameState:
    gs = rooms[code]
    if len(gs.players) < 4:
        raise ValueError("Need at least 4 players to start.")
    gs.round_number = 1
    _setup_round(gs)
    return gs


def _setup_round(gs: GameState) -> None:
    """Assign roles, pick word, set clue order for a new round."""
    category, word = _pick_word()
    gs.category = category
    gs.secret_word = word
    gs.phase = Phase.ROLES

    alive = gs.alive_players
    # Reset round‑specific fields
    for p in alive:
        p.role = Role.FRIEND
        p.clue = ""
        p.vote_target = None

    impostor = random.choice(alive)
    impostor.role = Role.IMPOSTOR

    # Randomise clue order
    gs.clue_order = [p.name for p in alive]
    random.shuffle(gs.clue_order)
    gs.current_clue_index = 0


def advance_to_clues(code: str) -> GameState:
    gs = rooms[code]
    gs.phase = Phase.CLUES
    return gs


def submit_clue(code: str, player_name: str, clue: str) -> GameState:
    gs = rooms[code]
    if gs.phase != Phase.CLUES:
        raise ValueError("Not in clue phase.")
    if player_name not in gs.players:
        raise ValueError("Player not in room.")
    p = gs.players[player_name]
    if not p.alive:
        raise ValueError("Eliminated players cannot give clues.")
    p.clue = clue.strip()[:120]  # cap length
    gs.current_clue_index += 1

    # If all alive players have given clues, move to voting
    if gs.current_clue_index >= len(gs.clue_order):
        gs.phase = Phase.VOTING
    return gs


def cast_vote(code: str, voter_name: str, target_name: str) -> GameState:
    gs = rooms[code]
    if gs.phase != Phase.VOTING:
        raise ValueError("Not in voting phase.")
    voter = gs.players.get(voter_name)
    target = gs.players.get(target_name)
    if not voter or not voter.alive:
        raise ValueError("Invalid voter.")
    if not target or not target.alive:
        raise ValueError("Invalid target.")
    if voter_name == target_name:
        raise ValueError("Cannot vote for yourself.")
    voter.vote_target = target_name
    return gs


def all_votes_in(code: str) -> bool:
    gs = rooms[code]
    for p in gs.alive_players:
        if p.vote_target is None:
            return False
    return True


def resolve_round(code: str) -> dict[str, Any]:
    """Tally votes, eliminate if majority, compute scores, advance round."""
    gs = rooms[code]
    gs.phase = Phase.RESOLUTION
    impostor = gs.impostor
    impostor_name = impostor.name if impostor else ""

    # Tally
    vote_counts: dict[str, int] = {}
    for p in gs.alive_players:
        t = p.vote_target
        if t:
            vote_counts[t] = vote_counts.get(t, 0) + 1

    max_votes = max(vote_counts.values()) if vote_counts else 0
    top_voted = [name for name, cnt in vote_counts.items() if cnt == max_votes]

    eliminated: str | None = None
    tie = len(top_voted) > 1

    if not tie:
        eliminated = top_voted[0] if top_voted else None
        if eliminated and eliminated in gs.players:
            gs.players[eliminated].alive = False

    # -- Scoring --
    impostor_survived = tie or (eliminated != impostor_name)

    for p in gs.alive_players:
        round_pts = 0
        if p.role == Role.FRIEND:
            if p.vote_target == impostor_name:
                round_pts += 2
                p.voted_impostor_rounds.append(True)
            else:
                p.voted_impostor_rounds.append(False)
        p.scores.append(round_pts)

    # Also score the eliminated player's vote for this round (they voted before being eliminated)
    if eliminated and eliminated in gs.players:
        elim_p = gs.players[eliminated]
        if elim_p.role == Role.FRIEND:
            round_pts = 2 if elim_p.vote_target == impostor_name else 0
            elim_p.voted_impostor_rounds.append(elim_p.vote_target == impostor_name)
            elim_p.scores.append(round_pts)

    if impostor and impostor.alive:
        impostor.scores.append(2)  # survived round

    # Determine game continuation
    game_over = False
    friends_win = False
    impostor_wins = False

    if not impostor_survived and eliminated == impostor_name:
        game_over = True
        friends_win = True
    elif gs.round_number >= gs.max_rounds:
        game_over = True
        impostor_wins = True
    elif gs.alive_count() <= 2:
        # If only 2 players remain, impostor essentially wins
        game_over = True
        impostor_wins = True

    # Bonus scoring
    if game_over:
        if friends_win and impostor:
            for p in gs.players.values():
                if p.role == Role.FRIEND and all(p.voted_impostor_rounds):
                    p.scores.append(10)
        if impostor_wins and impostor:
            impostor.scores.append(10)
        gs.phase = Phase.GAME_OVER
    else:
        gs.round_number += 1
        _setup_round(gs)

    result: dict[str, Any] = {
        "eliminated": eliminated,
        "tie": tie,
        "vote_counts": vote_counts,
        "game_over": game_over,
        "friends_win": friends_win,
        "impostor_wins": impostor_wins,
        "impostor_name": impostor_name,
        "round_number": gs.round_number,
        "state": gs.to_dict(),
    }
    return result
