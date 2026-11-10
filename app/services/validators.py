"""Input validation helpers."""

MAX_PAYLOAD_LENGTH = 1800


def validate_payload(payload: str) -> None:
    if not payload or not payload.strip():
        raise ValueError("MISSING_VALUE")
    if len(payload.encode("utf-8")) > MAX_PAYLOAD_LENGTH:
        raise ValueError("PAYLOAD_TOO_LONG")


def validate_colors(foreground: str, background: str) -> None:
    import re
    pattern = re.compile(r"^#[0-9a-fA-F]{6}$")
    if not pattern.fullmatch(foreground or "") or not pattern.fullmatch(background or ""):
        raise ValueError("INVALID_COLOR")
