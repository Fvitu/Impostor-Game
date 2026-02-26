"""REST API endpoints used by the SPA frontend."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from game.engine import create_room, get_room, join_room

api_bp = Blueprint("api", __name__)


@api_bp.get("/bootstrap")
def bootstrap():
    return jsonify(
        {
            "ok": True,
            "app": "El Impostor",
            "mode": "spa",
            "features": ["local", "online", "socketio", "fetch"],
        }
    )


@api_bp.post("/online/create")
def online_create_room():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    impostor_help = bool(payload.get("impostor_help", False))
    if not name:
        return jsonify({"ok": False, "error": "Name is required."}), 400

    room = create_room(name, mode="online", impostor_help=impostor_help)
    return jsonify({"ok": True, "code": room.room_code})


@api_bp.post("/online/join")
def online_join_room():
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().upper()
    name = (payload.get("name") or "").strip()
    if not code or not name:
        return jsonify({"ok": False, "error": "Room code and name are required."}), 400

    try:
        join_room(code, name)
    except ValueError as error:
        return jsonify({"ok": False, "error": str(error)}), 400

    return jsonify({"ok": True, "code": code})


@api_bp.get("/online/state/<code>")
def online_room_state(code: str):
    player_name = (request.args.get("name") or "").strip()
    room = get_room(code.upper())
    if room is None:
        return jsonify({"ok": False, "error": "Room not found."}), 404

    return jsonify({"ok": True, "state": room.to_dict(for_player=player_name or None)})
