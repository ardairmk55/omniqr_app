"""HTML and installable app endpoints."""
from flask import (
    Blueprint,
    current_app,
    make_response,
    render_template,
    send_from_directory,
)

pages = Blueprint("pages", __name__)


@pages.get("/")
def index():
    return render_template("index.html")


@pages.get("/offline")
def offline():
    return render_template("offline.html")


@pages.get("/sw.js")
def service_worker():
    response = make_response(send_from_directory(current_app.static_folder, "sw.js"))
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["Content-Type"] = "application/javascript; charset=utf-8"
    response.headers["Cache-Control"] = "no-cache"
    return response


@pages.get("/manifest.webmanifest")
def manifest():
    return send_from_directory(current_app.static_folder, "manifest.webmanifest", mimetype="application/manifest+json")


@pages.get("/favicon.ico")
def favicon():
    return send_from_directory(f"{current_app.static_folder}/icons", "favicon.ico", mimetype="image/vnd.microsoft.icon")
