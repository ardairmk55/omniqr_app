"""Generate OmniQR brand, favicon, PWA, and social-card assets from the logo source."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "app" / "static"
ICON_DIR = STATIC / "icons"
BRAND_DIR = STATIC / "brand"
PAPER = (245, 240, 230)
INK = (25, 58, 50)
CLAY = (186, 76, 50)


def find_source() -> Path:
    preferred = [BRAND_DIR / "logo-source.png", BRAND_DIR / "logo-source.svg"]
    candidates = preferred + sorted(STATIC.rglob("logo-source.*"))
    for path in candidates:
        if path.is_file():
            return path
    fallback = ICON_DIR / "icon-512.png"
    if fallback.is_file():
        return fallback
    raise FileNotFoundError("Place logo-source.png or logo-source.svg in app/static/brand/.")


def open_source(path: Path) -> Image.Image:
    if path.suffix.lower() == ".svg":
        try:
            import cairosvg
        except ImportError as exc:
            raise RuntimeError("SVG logo input requires CairoSVG. Install it with `pip install cairosvg`.") from exc
        from io import BytesIO

        return Image.open(BytesIO(cairosvg.svg2png(url=str(path), output_width=1600))).convert("RGBA")
    return ImageOps.exif_transpose(Image.open(path)).convert("RGBA")


def crop_mark(source: Image.Image) -> Image.Image:
    """Extract the central QR emblem while discarding the source's paper tile."""
    width, height = source.size
    # The supplied mark is centered above the OmniQR wordmark. Relative crop
    # keeps this robust to equivalent exports at a different pixel size.
    crop = source.crop((int(width * .055), int(height * .055), int(width * .85), int(height * .635)))
    pixels = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            red, green, blue, alpha = pixels[x, y]
            saturation = max(red, green, blue) - min(red, green, blue)
            luminance = (red * 299 + green * 587 + blue * 114) // 1000
            # Keep the saturated terracotta/brown mark and gently discard the
            # warm-white stock, including its nearly neutral paper shadows.
            ink_strength = max(0, min(255, (saturation - 13) * 5, (215 - luminance) * 3 + 30))
            pixels[x, y] = (red, green, blue, min(alpha, ink_strength))
    return crop.crop(crop.getbbox())


def contain(image: Image.Image, box: int, fraction: float = .72) -> Image.Image:
    image = image.copy()
    image.thumbnail((int(box * fraction), int(box * fraction)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((box - image.width) // 2, (box - image.height) // 2))
    return canvas


def monochrome(mark: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    output = Image.new("RGBA", mark.size, (*color, 0))
    output.putalpha(mark.getchannel("A"))
    return output


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    fonts = Path("C:/Windows/Fonts")
    paths = [fonts / ("georgiab.ttf" if bold else "georgia.ttf"), fonts / ("segoeuib.ttf" if bold else "segoeui.ttf")]
    for path in paths:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    source_path = find_source()
    source = open_source(source_path)
    mark = crop_mark(source)
    mark.save(BRAND_DIR / "logo-mark.png", optimize=True)
    monochrome(mark, INK).save(BRAND_DIR / "logo-mark-mono.png", optimize=True)
    monochrome(mark, PAPER).save(BRAND_DIR / "logo-mark-light.png", optimize=True)

    for size in (16, 32, 48):
        contain(monochrome(mark, INK), size, .82).save(ICON_DIR / f"favicon-{size}.png", optimize=True)
    contain(monochrome(mark, INK), 48, .82).save(ICON_DIR / "favicon.png", optimize=True)
    Image.open(ICON_DIR / "favicon-48.png").save(
        ICON_DIR / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    for size in (192, 512):
        icon = Image.new("RGBA", (size, size), (*PAPER, 255))
        icon.alpha_composite(contain(mark, size, .72))
        icon.convert("RGB").save(ICON_DIR / f"icon-{size}.png", optimize=True)
    maskable = Image.new("RGBA", (512, 512), (*PAPER, 255))
    maskable.alpha_composite(contain(mark, 512, .64))  # safe within the central 80% mask zone
    maskable.convert("RGB").save(ICON_DIR / "icon-maskable-512.png", optimize=True)
    Image.new("RGBA", (180, 180), (*PAPER, 255)).save(ICON_DIR / "apple-touch-icon.png")
    apple = Image.open(ICON_DIR / "apple-touch-icon.png").convert("RGBA")
    apple.alpha_composite(contain(mark, 180, .72))
    apple.convert("RGB").save(ICON_DIR / "apple-touch-icon.png", optimize=True)

    card = Image.new("RGB", (1200, 630), PAPER)
    draw = ImageDraw.Draw(card)
    draw.rectangle((54, 54, 1146, 576), outline=(220, 214, 201), width=2)
    draw.rectangle((54, 54, 73, 73), fill=CLAY)
    mark_card = contain(mark, 430, .76)
    card.paste(mark_card, (80, 100), mark_card)
    draw.text((560, 230), "OmniQR Studio", fill=INK, font=font(64, True))
    draw.text((566, 316), "A PRIVATE QR PRINT WORKSHOP", fill=CLAY, font=font(24))
    draw.text((566, 365), "Tasarım · Üretim · Gizlilik", fill=INK, font=font(22))
    card.save(STATIC / "og-card.png", optimize=True)


if __name__ == "__main__":
    main()
