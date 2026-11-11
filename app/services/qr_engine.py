"""QR image rendering backed by python-qrcode."""
from functools import lru_cache
from io import BytesIO

import qrcode
from qrcode.constants import (
    ERROR_CORRECT_H,
    ERROR_CORRECT_L,
    ERROR_CORRECT_M,
    ERROR_CORRECT_Q,
)
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import SolidFillColorMask
from qrcode.image.styles.moduledrawers import (
    CircleModuleDrawer,
    GappedSquareModuleDrawer,
    RoundedModuleDrawer,
)

from app.services.validators import validate_colors, validate_payload

ERRORS = {"L": ERROR_CORRECT_L, "M": ERROR_CORRECT_M, "Q": ERROR_CORRECT_Q, "H": ERROR_CORRECT_H}
DRAWERS = {"square": None, "rounded": RoundedModuleDrawer, "circle": CircleModuleDrawer, "gapped": GappedSquareModuleDrawer}


def _rgb(color: str) -> tuple[int, int, int]:
    """Convert a validated #RRGGBB value to the tuple Pillow expects."""
    return tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))


@lru_cache(maxsize=96)
def render_qr(payload: str, foreground: str = "#2a1f1b", background: str = "#f5f0e6", correction: str = "M", shape: str = "square", border: int = 4, size: int = 10) -> tuple[bytes, int, int]:
    """Render a bounded PNG and return bytes, version, and module count."""
    validate_payload(payload)
    validate_colors(foreground, background)
    if correction not in ERRORS or shape not in DRAWERS or not 0 <= border <= 12 or not 4 <= size <= 32:
        raise ValueError("INVALID_OPTIONS")
    qr = qrcode.QRCode(version=None, error_correction=ERRORS[correction], box_size=size, border=border)
    qr.add_data(payload)
    qr.make(fit=True)
    kwargs = {"image_factory": StyledPilImage, "color_mask": SolidFillColorMask(front_color=_rgb(foreground), back_color=_rgb(background))}
    if DRAWERS[shape]:
        kwargs["module_drawer"] = DRAWERS[shape]()
    image = qr.make_image(**kwargs).convert("RGB")
    out = BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue(), qr.version, len(qr.modules)
