"""Build standards-friendly text payloads for common QR content types."""
from urllib.parse import quote, urlencode


def _clean(value: object) -> str:
    return str(value or "").strip()


def build_payload(kind: str, data: dict) -> str:
    """Return encoded QR content, raising ValueError for incomplete inputs."""
    if not isinstance(kind, str) or not isinstance(data, dict):
        raise TypeError("INVALID_INPUT")
    d = {str(k): _clean(v) for k, v in (data or {}).items()}
    if kind in ("url", "text"):
        value = d.get("value", "")
        if not value:
            raise ValueError("MISSING_VALUE")
        return value if kind == "text" else (value if "://" in value else f"https://{value}")
    if kind == "wifi":
        ssid = d.get("ssid", "")
        if not ssid:
            raise ValueError("MISSING_SSID")
        security = d.get("security", "WPA")
        if security not in {"WPA", "WEP", "nopass"}:
            raise ValueError("INVALID_SECURITY")
        esc = lambda value: value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace(":", "\\:").replace('"', '\\"')
        return f"WIFI:T:{security};S:{esc(ssid)};P:{esc(d.get('password', ''))};H:{'true' if d.get('hidden') == 'true' else 'false'};;"
    if kind == "vcard":
        if not d.get("name"):
            raise ValueError("MISSING_NAME")
        escape = lambda value: value.replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")
        name = escape(d["name"])
        return "BEGIN:VCARD\nVERSION:3.0\nFN:" + name + (f"\nTEL:{escape(d['phone'])}" if d.get("phone") else "") + (f"\nEMAIL:{escape(d['email'])}" if d.get("email") else "") + "\nEND:VCARD"
    if kind == "email":
        if not d.get("to"):
            raise ValueError("MISSING_EMAIL")
        return f"mailto:{d['to']}?{urlencode({'subject': d.get('subject', ''), 'body': d.get('body', '')})}"
    if kind == "phone":
        if not d.get("value"):
            raise ValueError("MISSING_PHONE")
        return f"tel:{d['value']}"
    if kind == "sms":
        if not d.get("phone"):
            raise ValueError("MISSING_PHONE")
        return f"SMSTO:{d['phone']}:{d.get('message', '')}"
    if kind == "whatsapp":
        number = "".join(c for c in d.get("phone", "") if c.isdigit())
        if not number:
            raise ValueError("MISSING_PHONE")
        return f"https://wa.me/{number}" + (f"?text={quote(d['message'])}" if d.get("message") else "")
    if kind == "geo":
        try:
            lat, lng = float(d["lat"]), float(d["lng"])
        except (KeyError, ValueError):
            raise ValueError("INVALID_COORDINATES") from None
        if not -90 <= lat <= 90 or not -180 <= lng <= 180:
            raise ValueError("INVALID_COORDINATES")
        return f"geo:{lat:g},{lng:g}"
    if kind == "event":
        required = ("title", "start", "end")
        if any(not d.get(key) for key in required):
            raise ValueError("MISSING_EVENT_FIELDS")
        fmt = lambda v: v.replace("-", "").replace(":", "") + ("00" if len(v) == 16 else "")
        escape = lambda v: v.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
        return "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:" + escape(d["title"]) + f"\nDTSTART:{fmt(d['start'])}\nDTEND:{fmt(d['end'])}\nEND:VEVENT\nEND:VCALENDAR"
    if kind == "social":
        value = d.get("value", "")
        if not value:
            raise ValueError("MISSING_VALUE")
        return value if "://" in value else f"https://{value}"
    raise ValueError("INVALID_TYPE")
