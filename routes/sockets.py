"""SocketIO event handlers for the online multiplayer mode."""

from __future__ import annotations

from flask import request
from flask_socketio import emit, join_room as sio_join, leave_room as sio_leave

from extensions import socketio
from game.engine import (
    Phase,
    create_room,
    join_room,
    get_room,
    delete_room,
    remove_player,
    start_game,
    advance_to_clues,
    submit_clue,
    cast_vote,
    all_votes_in,
    resolve_round,
)

# ---- connection tracking -------------------------------------------------

sid_to_room: dict[str, tuple[str, str]] = {}   # sid -> (room_code, player_name)


def _broadcast_state(code: str) -> None:
    """Send personalised state to every player in the room."""
    gs = get_room(code)
    if gs is None:
        return
    for pname, player in gs.players.items():
        target_sid = player.sid
        if target_sid:
            emit("state_update", gs.to_dict(for_player=pname), room=target_sid)


# ---- events -------------------------------------------------------------

@socketio.on("connect")
def on_connect():
    pass


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    info = sid_to_room.pop(sid, None)
    if info:
        code, pname = info
        gs = get_room(code)
        if gs and gs.phase == Phase.LOBBY:
            remove_player(code, pname)
            sio_leave(code, sid)
            _broadcast_state(code)
        elif gs:
            # Mark as disconnected but keep in game
            p = gs.players.get(pname)
            if p:
                p.sid = None
            emit("player_disconnected", {"name": pname}, room=code)


@socketio.on("create_room")
def on_create_room(data):
    host_name = data.get("name", "").strip()
    impostor_help = data.get("impostor_help", False)
    if not host_name:
        emit("error", {"msg": "Name is required."})
        return
    gs = create_room(host_name, mode="online", impostor_help=impostor_help)
    gs.players[host_name].sid = request.sid
    sio_join(gs.room_code)
    sid_to_room[request.sid] = (gs.room_code, host_name)
    emit("room_created", {"code": gs.room_code})
    _broadcast_state(gs.room_code)


@socketio.on("join_room")
def on_join_room(data):
    code = data.get("code", "").strip().upper()
    name = data.get("name", "").strip()
    if not code or not name:
        emit("error", {"msg": "Room code and name are required."})
        return
    try:
        gs = join_room(code, name, sid=request.sid)
    except ValueError as e:
        emit("error", {"msg": str(e)})
        return
    sio_join(code)
    sid_to_room[request.sid] = (code, name)
    emit("room_joined", {"code": code})
    _broadcast_state(code)


@socketio.on("reconnect_room")
def on_reconnect_room(data):
    code = data.get("code", "").strip().upper()
    name = data.get("name", "").strip()
    gs = get_room(code)
    if gs and name in gs.players:
        gs.players[name].sid = request.sid
        sio_join(code)
        sid_to_room[request.sid] = (code, name)
        _broadcast_state(code)
    else:
        emit("error", {"msg": "Could not reconnect."})


@socketio.on("start_game")
def on_start_game(data):
    code = data.get("code", "").strip().upper()
    gs = get_room(code)
    if gs is None:
        emit("error", {"msg": "Room not found."})
        return
    info = sid_to_room.get(request.sid)
    if not info or info[1] != gs.host:
        emit("error", {"msg": "Only the host can start the game."})
        return
    try:
        start_game(code)
    except ValueError as e:
        emit("error", {"msg": str(e)})
        return
    _broadcast_state(code)


@socketio.on("players_ready")
def on_players_ready(data):
    code = data.get("code", "").strip().upper()
    gs = get_room(code)
    if gs is None:
        return
    advance_to_clues(code)
    _broadcast_state(code)


@socketio.on("submit_clue")
def on_submit_clue(data):
    code = data.get("code", "").strip().upper()
    name = data.get("name", "").strip()
    clue = data.get("clue", "").strip()
    if not clue:
        emit("error", {"msg": "Clue cannot be empty."})
        return
    try:
        submit_clue(code, name, clue)
    except ValueError as e:
        emit("error", {"msg": str(e)})
        return
    _broadcast_state(code)


@socketio.on("cast_vote")
def on_cast_vote(data):
    code = data.get("code", "").strip().upper()
    voter = data.get("voter", "").strip()
    target = data.get("target", "").strip()
    try:
        cast_vote(code, voter, target)
    except ValueError as e:
        emit("error", {"msg": str(e)})
        return
    _broadcast_state(code)

    if all_votes_in(code):
        result = resolve_round(code)
        socketio.emit("round_result", result, room=code)
        _broadcast_state(code)


@socketio.on("next_round_ready")
def on_next_round_ready(data):
    code = data.get("code", "").strip().upper()
    gs = get_room(code)
    if gs and gs.phase == Phase.ROLES:
        _broadcast_state(code)


@socketio.on("delete_room")
def on_delete_room(data):
    code = data.get("code", "").strip().upper()
    gs = get_room(code)
    if gs is None:
        emit("error", {"msg": "Room not found."})
        return

    info = sid_to_room.get(request.sid)
    if not info or info[0] != code or info[1] != gs.host:
        emit("error", {"msg": "Only the host can delete the room."})
        return

    socketio.emit("room_deleted", {"code": code}, room=code)

    stale_sids = [sid for sid, room_info in sid_to_room.items() if room_info[0] == code]
    for sid in stale_sids:
        sid_to_room.pop(sid, None)
        sio_leave(code, sid)

    delete_room(code)
