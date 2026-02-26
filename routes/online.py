"""Blueprint for Online Multiplayer routes."""

from flask import Blueprint, render_template, request, redirect, url_for, session

online_bp = Blueprint("online", __name__, template_folder="../templates")


@online_bp.route("/")
def lobby():
    return render_template("index.html")


@online_bp.route("/room/<code>")
def room(code: str):
    return render_template("index.html")
