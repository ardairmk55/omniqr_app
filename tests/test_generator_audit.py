"""Round-trip coverage for QR payloads, rendered exports, and locale data."""
import base64
import io
import json
from pathlib import Path

import cairosvg
import cv2
import numpy as np
import pymupdf
import pytest
from PIL import Image

from app import create_app
from app.services.payloads import build_payload

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    ("url", {"value": "https://example.com/omniqr"}),
    ("text", {"value": "Merhaba dunya OmniQR"}),
    ("wifi", {"ssid": "Omni-Agi", "password": "guvenli-sifre", "security": "WPA", "hidden": "false"}),
    ("vcard", {"name": "Cagri Yilmaz", "phone": "+905551112233", "email": "cagri@example.com"}),
    ("email", {"to": "ada@example.com", "subject": "Merhaba", "body": "Nasılsın?"}),
    ("phone", {"value": "+905551112233"}),
    ("sms", {"phone": "+905551112233", "message": "Selam dunya"}),
    ("whatsapp", {"phone": "+90 555 111 2233", "message": "Merhaba dunya"}),
    ("geo", {"lat": "41.0082", "lng": "28.9784"}),
    ("event", {"title": "OmniQR Meeting", "start": "2026-11-12T12:00", "end": "2026-11-12T13:00"}),
    ("social", {"value": "https://example.com/profile"}),
]
FORMATS = {
    "png": ("image/png", "png"), "svg": ("image/svg+xml", "svg"),
    "jpeg": ("image/jpeg", "jpg"), "webp": ("image/webp", "webp"),
    "pdf": ("application/pdf", "pdf"),
}


@pytest.fixture()
def client():
    return create_app({"TESTING": True, "MAX_CONTENT_LENGTH": 2 * 1024 * 1024}).test_client()


def rasterize(content: bytes, file_format: str) -> np.ndarray:
    if file_format == "svg":
        content = cairosvg.svg2png(bytestring=content, output_width=500, output_height=500)
    elif file_format == "pdf":
        document = pymupdf.open(stream=content, filetype="pdf")
        content = document[0].get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).tobytes("png")
    image = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    return image


def assert_decodes(content: bytes, file_format: str, expected: str) -> None:
    image = rasterize(content, file_format)
    if image.shape[0] > 2500 or image.shape[1] > 2500:
        image = cv2.resize(image, (2048, 2048), interpolation=cv2.INTER_NEAREST)
    decoded, points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    assert points is not None
    assert decoded == expected


@pytest.mark.parametrize("kind,data", CASES)
@pytest.mark.parametrize("file_format", FORMATS)
def test_every_content_type_round_trips_every_export(client, kind, data, file_format):
    response = client.post("/api/export", json={"type": kind, "data": data, "format": file_format, "resolution": 512})
    assert response.status_code == 200
    result = response.json
    content = base64.b64decode(result["file"], validate=True)
    mime, extension = FORMATS[file_format]
    assert result["mime"] == mime
    assert result["extension"] == extension
    assert len(content) > 100
    if file_format == "svg":
        assert b"<path" in content and b"<image" not in content
    if file_format == "jpeg":
        assert Image.open(io.BytesIO(content)).mode == "RGB"
    assert_decodes(content, file_format, build_payload(kind, data))


@pytest.mark.parametrize("resolution", [512, 1024, 2048, 4096])
def test_png_export_decodes_at_each_offered_resolution(client, resolution):
    data = {"value": "https://example.com/qr-proof"}
    response = client.post("/api/export", json={"type": "url", "data": data, "format": "png", "resolution": resolution})
    assert response.status_code == 200
    result = response.json
    content = base64.b64decode(result["file"], validate=True)
    image = Image.open(io.BytesIO(content))
    assert image.size == (resolution, resolution)
    assert result["mime"] == "image/png" and result["extension"] == "png"
    assert_decodes(content, "png", build_payload("url", data))


def test_i18n_keys_have_exact_parity():
    translations = [json.loads((ROOT / f"app/static/i18n/{lang}.json").read_text(encoding="utf-8")) for lang in ("tr", "en")]
    assert translations[0].keys() == translations[1].keys()


def test_vcard_escapes_delimiters_and_newlines():
    payload = build_payload("vcard", {"name": 'Çağrı, "Arda";\nContact', "email": "a@example.com"})
    assert payload == "BEGIN:VCARD\nVERSION:3.0\nFN:Çağrı\\, \"Arda\"\\;\\nContact\nEMAIL:a@example.com\nEND:VCARD"


def test_qr_api_defaults_to_espresso_ink(client):
    result = client.post("/api/generate", json={"payload": "default ink"})
    assert result.status_code == 200
    image = cv2.imdecode(np.frombuffer(base64.b64decode(result.json["image"]), np.uint8), cv2.IMREAD_COLOR)
    pixels = image.reshape(-1, 3)
    assert any((pixels == np.array([27, 31, 42])).all(axis=1))
