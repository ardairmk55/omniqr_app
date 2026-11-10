"""API and payload smoke tests."""
import base64

import cv2
import numpy as np
import pytest

from app import create_app
from app.services.payloads import build_payload


@pytest.fixture()
def client():
    return create_app({"TESTING": True, "MAX_CONTENT_LENGTH": 2 * 1024 * 1024}).test_client()


@pytest.mark.parametrize("kind,data,expected", [
    ("url", {"value":"example.com"}, "https://example.com"), ("text", {"value":"Merhaba dünya"}, "Merhaba dünya"),
    ("wifi", {"ssid":"Ağ;adı", "password":"şifre"}, "WIFI:T:WPA;S:Ağ\\;adı;P:şifre;H:false;;"),
    ("vcard", {"name":"Ada"}, "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEND:VCARD"), ("email", {"to":"a@b.com"}, "mailto:a@b.com?subject=&body="),
    ("phone", {"value":"+90555"}, "tel:+90555"), ("sms", {"phone":"+90555", "message":"Merhaba"}, "SMSTO:+90555:Merhaba"),
    ("whatsapp", {"phone":"+90 555", "message":"Merhaba dünya"}, "https://wa.me/90555?text=Merhaba%20d%C3%BCnya"),
    ("geo", {"lat":"41.01", "lng":"28.97"}, "geo:41.01,28.97"),
    ("event", {"title":"Demo", "start":"2026-11-10T12:00", "end":"2026-11-10T13:00"}, "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Demo\nDTSTART:20261110T120000\nDTEND:20261110T130000\nEND:VEVENT\nEND:VCALENDAR"),
    ("social", {"value":"example.com/omni"}, "https://example.com/omni")
])
def test_payloads(kind, data, expected):
    assert build_payload(kind, data) == expected


def test_generate_round_trip(client):
    payload = "OmniQR merhaba"
    response = client.post("/api/generate", json={"payload": payload})
    assert response.status_code == 200
    image = cv2.imdecode(np.frombuffer(base64.b64decode(response.json["image"]), np.uint8), cv2.IMREAD_COLOR)
    decoded, points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    assert points is not None and decoded == payload


@pytest.mark.parametrize("kind,data", [
    ("url", {"value": "example.org"}), ("text", {"value": "Merhaba dünya"}),
    ("wifi", {"ssid": "Omni Ağ", "password": "güvenli;şifre", "security": "WPA"}),
    ("vcard", {"name": "Ada Yılmaz", "phone": "+905551112233"}),
    ("email", {"to": "ada@example.org", "subject": "Merhaba", "body": "Nasılsın?"}),
    ("phone", {"value": "+905551112233"}), ("sms", {"phone": "+905551112233", "message": "Merhaba"}),
    ("whatsapp", {"phone": "+90 555 111 2233", "message": "Merhaba"}),
    ("geo", {"lat": "41.01", "lng": "28.97"}),
    ("event", {"title": "OmniQR", "start": "2026-11-10T12:00", "end": "2026-11-10T13:00"}),
    ("social", {"value": "social.example.org/omniqr"}),
])
def test_each_payload_round_trips(client, kind, data):
    response = client.post("/api/generate", json={"type": kind, "data": data})
    assert response.status_code == 200
    image = cv2.imdecode(np.frombuffer(base64.b64decode(response.json["image"]), np.uint8), cv2.IMREAD_COLOR)
    decoded, points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    assert points is not None
    assert decoded == build_payload(kind, data)


@pytest.mark.parametrize("shape", ["square", "rounded", "circle", "gapped"])
def test_module_shapes_round_trip(client, shape):
    response = client.post("/api/generate", json={"payload": "shape test", "shape": shape})
    image = cv2.imdecode(np.frombuffer(base64.b64decode(response.json["image"]), np.uint8), cv2.IMREAD_COLOR)
    decoded, points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    assert points is not None and decoded == "shape test"


def test_batch_limit(client):
    assert client.post("/api/batch", json={"rows": ["x"] * 201}).status_code == 400


@pytest.mark.parametrize("file_format,signature", [
    ("png", b"\x89PNG"), ("jpeg", b"\xff\xd8"), ("webp", b"RIFF"), ("pdf", b"%PDF"), ("svg", b"<svg"),
])
def test_export_formats(client, file_format, signature):
    response = client.post("/api/export", json={"payload": "vector export", "format": file_format, "resolution": 512})
    assert response.status_code == 200
    content = base64.b64decode(response.json["file"])
    assert (signature in content) if file_format == "svg" else content.startswith(signature)


def test_export_rejects_unsupported_resolution(client):
    response = client.post("/api/export", json={"payload": "x", "format": "png", "resolution": 8192})
    assert response.status_code == 400
    assert response.json["error"]["code"] == "INVALID_RESOLUTION"


def test_malformed_json_shapes_return_error_envelope(client):
    response = client.post("/api/generate", json=["not", "an", "object"])
    assert response.status_code == 400
    assert response.json["error"]["code"] == "MISSING_VALUE"


def test_health(client):
    assert client.get("/api/health").json["status"] == "ok"


@pytest.mark.parametrize("path", ["/", "/offline", "/sw.js", "/manifest.webmanifest", "/favicon.ico"])
def test_app_shell_routes(client, path):
    assert client.get(path).status_code == 200
