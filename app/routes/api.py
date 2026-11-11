"""JSON API for QR generation, validation, health, and batch exports."""
import base64
import zipfile
from io import BytesIO

from flask import Blueprint, jsonify, request, send_file

from app.services.exporters import MAX_EXPORT_BYTES, export_qr
from app.services.payloads import build_payload
from app.services.qr_engine import render_qr
from app.services.validators import MAX_PAYLOAD_LENGTH, validate_payload

api = Blueprint("api", __name__)


def error(code: str, status: int = 400, **details):
    return jsonify({"error": {"code": code, "details": details}}), status


def input_code(exc: Exception) -> str:
    """Keep client-facing error codes stable and avoid leaking internals."""
    code = str(exc)
    return code if code.isupper() and code.replace("_", "").isalnum() else "INVALID_INPUT"


def json_body() -> dict:
    """Return an object body or an empty object for malformed JSON shapes."""
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


@api.get("/health")
def health():
    return jsonify({"status": "ok", "service": "omniqr-studio"})


@api.post("/generate")
def generate():
    if request.headers.get("Origin") and request.headers["Origin"] != request.host_url.rstrip("/"):
        return error("CROSS_ORIGIN_DENIED", 403)
    body = json_body()
    try:
        payload = body.get("payload") or build_payload(body.get("type", "text"), body.get("data", {}))
        validate_payload(payload)
        image, version, modules = render_qr(payload, body.get("foreground", "#2a1f1b"), body.get("background", "#f5f0e6"), body.get("correction", "M"), body.get("shape", "square"), int(body.get("border", 4)), int(body.get("size", 10)))
        if len(image) > MAX_EXPORT_BYTES:
            raise ValueError("EXPORT_TOO_LARGE")
    except (ValueError, TypeError) as exc:
        return error(input_code(exc))
    return jsonify({"image": base64.b64encode(image).decode("ascii"), "mime": "image/png", "version": version, "modules": modules, "payload_length": len(payload), "hints": ["HIGH_DENSITY"] if version >= 8 else []})


@api.post("/validate")
def validate():
    if request.headers.get("Origin") and request.headers["Origin"] != request.host_url.rstrip("/"):
        return error("CROSS_ORIGIN_DENIED", 403)
    body = json_body()
    try:
        payload = body.get("payload") or build_payload(body.get("type", "text"), body.get("data", {}))
        validate_payload(payload)
    except (ValueError, TypeError) as exc:
        return error(input_code(exc))
    return jsonify({"valid": True, "bytes": len(payload.encode("utf-8")), "limit": MAX_PAYLOAD_LENGTH})


@api.post("/export")
def export():
    if request.headers.get("Origin") and request.headers["Origin"] != request.host_url.rstrip("/"):
        return error("CROSS_ORIGIN_DENIED", 403)
    body = json_body()
    try:
        payload = body.get("payload") or build_payload(body.get("type", "text"), body.get("data", {}))
        output, mime, extension = export_qr(
            payload,
            body.get("foreground", "#2a1f1b"),
            body.get("background", "#f5f0e6"),
            body.get("correction", "M"),
            body.get("shape", "square"),
            int(body.get("border", 4)),
            body.get("format", "png"),
            int(body.get("resolution", 1024)),
        )
    except (ValueError, TypeError) as exc:
        return error(input_code(exc))
    return jsonify({"file": base64.b64encode(output).decode("ascii"), "mime": mime, "extension": extension, "resolution": body.get("resolution", 1024)})


@api.post("/batch")
def batch():
    if request.headers.get("Origin") and request.headers["Origin"] != request.host_url.rstrip("/"):
        return error("CROSS_ORIGIN_DENIED", 403)
    body = json_body()
    rows = body.get("rows", [])
    if not isinstance(rows, list) or not 1 <= len(rows) <= 200:
        return error("INVALID_BATCH_SIZE", 400, max_rows=200)
    memory = BytesIO()
    try:
        with zipfile.ZipFile(memory, "w", zipfile.ZIP_DEFLATED) as archive:
            for index, row in enumerate(rows, 1):
                payload = row if isinstance(row, str) else build_payload(row.get("type", "text"), row.get("data", {}))
                png, _, _ = render_qr(payload)
                archive.writestr(f"qr-{index:03d}.png", png)
    except (ValueError, TypeError, AttributeError) as exc:
        return error(input_code(exc))
    memory.seek(0)
    return send_file(memory, mimetype="application/zip", as_attachment=True, download_name="omniqr-batch.zip")
