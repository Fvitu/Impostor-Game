"""Flask application factory with SocketIO integration."""

from flask import Flask
from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins="*", async_mode="eventlet")


def create_app(config_name: str = "development") -> Flask:
    from config import config_by_name

    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    # Register blueprints
    from routes.main import main_bp
    from routes.online import online_bp
    from routes.local import local_bp
    from routes.api import api_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(online_bp, url_prefix="/online")
    app.register_blueprint(local_bp, url_prefix="/local")
    app.register_blueprint(api_bp, url_prefix="/api")

    # Init SocketIO
    socketio.init_app(app)

    # Import socket event handlers (side‑effect import)
    import routes.sockets  # noqa: F401

    return app
