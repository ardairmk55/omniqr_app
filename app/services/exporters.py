"""Format and resolution conversions for generated QR artwork."""
from io import BytesIO

import qrcode
from PIL import Image
from qrcode.image.svg import SvgPathImage

from app.services.qr_engine import DRAWERS, ERRORS, render_qr
from app.services.validators import validate_colors, validate_payload


def export_qr(payload: str, foreground: str, background: str, correction: str, shape: str, border: int, file_format: str, resolution: int = 1024) -> tuple[bytes, str, str]:
    """Return an exported QR asset as bytes, MIME type, and extension."""
    validate_payload(payload)
    validate_colors(foreground, background)
    if file_format not in {"png", "jpeg", "webp", "pdf", "svg"}:
        raise ValueError("INVALID_FORMAT")
    if resolution not in {512, 1024, 2048, 4096}:
        raise ValueError("INVALID_RESOLUTION")
    if correction not in ERRORS or shape not in DRAWERS or not 0 <= border <= 12:
        raise ValueError("INVALID_OPTIONS")
    if file_format == "svg":
        qr = qrcode.QRCode(version=None, error_correction=ERRORS[correction], box_size=1, border=border)
        qr.add_data(payload)
        qr.make(fit=True)
        svg_type = type("OmniSvgPathImage", (SvgPathImage,), {"QR_PATH_STYLE": {**SvgPathImage.QR_PATH_STYLE, "fill": foreground}})
        image = qr.make_image(image_factory=svg_type, background=background)
        out = BytesIO()
        image.save(out)
        return out.getvalue(), "image/svg+xml", "svg"

    png, _, _ = render_qr(payload, foreground, background, correction, shape, border, 10)
    image = Image.open(BytesIO(png)).convert("RGB")
    image = image.resize((resolution, resolution), Image.Resampling.NEAREST)
    out = BytesIO()
    if file_format == "pdf":
        image.save(out, format="PDF", resolution=300)
        return out.getvalue(), "application/pdf", "pdf"
    if file_format == "jpeg":
        image.save(out, format="JPEG", quality=95, optimize=True)
        return out.getvalue(), "image/jpeg", "jpg"
    if file_format == "webp":
        image.save(out, format="WEBP", quality=100, lossless=True, method=4)
        return out.getvalue(), "image/webp", "webp"
    image.save(out, format="PNG", optimize=True)
    return out.getvalue(), "image/png", "png"
