"""Branding, translation, and PWA asset invariants."""
import json
import re
from pathlib import Path

from PIL import Image

from app import create_app

ROOT = Path(__file__).resolve().parents[1]


def test_translation_keys_have_full_parity():
    tr = json.loads((ROOT / "app/static/i18n/tr.json").read_text(encoding="utf-8"))
    en = json.loads((ROOT / "app/static/i18n/en.json").read_text(encoding="utf-8"))
    assert set(tr) == set(en)


def test_generated_brand_assets_exist_at_expected_sizes():
    expected = {
        "favicon-16.png": (16, 16), "favicon-32.png": (32, 32), "favicon-48.png": (48, 48),
        "apple-touch-icon.png": (180, 180), "icon-192.png": (192, 192),
        "icon-512.png": (512, 512), "icon-maskable-512.png": (512, 512),
    }
    for name, size in expected.items():
        path = ROOT / "app/static/icons" / name
        assert path.is_file()
        with Image.open(path) as image:
            assert image.size == size
    assert (ROOT / "app/static/icons/favicon.ico").is_file()
    assert (ROOT / "app/static/brand/logo-mark-light.png").is_file()
    assert Image.open(ROOT / "app/static/og-card.png").size == (1200, 630)


def test_manifest_references_existing_required_icons():
    manifest = json.loads((ROOT / "app/static/manifest.webmanifest").read_text(encoding="utf-8"))
    icons = {icon["purpose"]: icon for icon in manifest["icons"]}
    assert "any" in icons and "maskable" in icons
    for icon in manifest["icons"]:
        assert (ROOT / "app" / "static" / icon["src"].removeprefix("/static/")).is_file()
    assert len(manifest["screenshots"]) == 2
    for screenshot in manifest["screenshots"]:
        assert (ROOT / "app" / "static" / screenshot["src"].removeprefix("/static/")).is_file()


def test_footer_has_prominent_safe_developer_link():
    html = create_app({"TESTING": True}).test_client().get("/").get_data(as_text=True)
    footer = re.search(r"<footer\b.*?</footer>", html, re.DOTALL).group(0)
    assert re.search(r'<a class="footer-developer" href="https://ardaportfoy\.vercel\.app" target="_blank" rel="noopener noreferrer"', footer)
    assert 'data-i18n="footerDeveloperName">Arda</span>' in footer


def test_footer_has_no_technology_badges_or_stats():
    html = create_app({"TESTING": True}).test_client().get("/").get_data(as_text=True)
    footer = re.search(r"<footer\b.*?</footer>", html, re.DOTALL).group(0).casefold()
    assert not any(term in footer for term in ("flask", "tailwind", "qrcode", "tech-strip", "trust-count"))


def test_footer_version_comes_from_package_version():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    html = create_app({"TESTING": True}).test_client().get("/").get_data(as_text=True)
    footer = re.search(r"<footer\b.*?</footer>", html, re.DOTALL).group(0)
    assert f">v{package['version']}</span>" in footer


def test_rendered_translation_references_exist():
    html = create_app({"TESTING": True}).test_client().get("/").get_data(as_text=True)
    keys = set(re.findall(r'data-i18n(?:-aria|-alt)?="([A-Za-z0-9]+)"', html))
    tr = json.loads((ROOT / "app/static/i18n/tr.json").read_text(encoding="utf-8"))
    en = json.loads((ROOT / "app/static/i18n/en.json").read_text(encoding="utf-8"))
    assert keys <= set(tr) and keys <= set(en)


def test_navigation_and_footer_hash_links_have_rendered_targets():
    from html.parser import HTMLParser

    class Targets(HTMLParser):
        def __init__(self):
            super().__init__()
            self.ids = set()
            self.hashes = set()

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if attrs.get("id"):
                self.ids.add(attrs["id"])
            if tag in {"a", "area"} and attrs.get("href", "").startswith("#"):
                self.hashes.add(attrs["href"][1:])

    parser = Targets()
    parser.feed(create_app({"TESTING": True}).test_client().get("/").get_data(as_text=True))
    assert parser.hashes <= parser.ids
