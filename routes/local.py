"""Blueprint for Pass‑and‑Play (single device) mode."""

from flask import Blueprint, render_template

local_bp = Blueprint("local", __name__, template_folder="../templates")


@local_bp.route("/")
def setup():
    return render_template("index.html")


@local_bp.route("/play")
def play():
    return render_template("index.html")
