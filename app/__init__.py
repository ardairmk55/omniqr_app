"""OmniQR Studio Flask application factory."""
import json
from pathlib import Path

from flask import Flask, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.config import Config
from app.routes.api import api
from app.routes.pages import pages


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    app.register_blueprint(pages)
    app.register_blueprint(api, url_prefix="/api")
    Limiter(get_remote_address, app=app, default_limits=["120 per hour"], storage_uri="memory://")

    @app.context_processor
    def template_metadata():
        package = Path(app.root_path).parent / "package.json"
        try:
            version = json.loads(package.read_text(encoding="utf-8"))["version"]
        except (OSError, KeyError, json.JSONDecodeError):
            version = "1.0.0"
        return {"app_version": version}

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": {"code": "NOT_FOUND", "details": {}}}), 404

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify({"error": {"code": "PAYLOAD_TOO_LONG", "details": {}}}), 413

    @app.errorhandler(429)
    def too_many_requests(_error):
        return jsonify({"error": {"code": "RATE_LIMITED", "details": {}}}), 429

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; "
            "script-src 'self'; connect-src 'self'; font-src 'self'; "
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        )
        if app.config.get("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    return app
