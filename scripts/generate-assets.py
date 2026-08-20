#!/usr/bin/env python3
"""
OpenContent IDE asset generator.

Generates PNG/SVG brand assets from the project palette:
  - RGB(21,21,21)   #151515  background
  - RGB(43,43,43)   #2b2b2b  panel
  - RGB(114,114,114)#727272  muted
  - #FFFFFF         foreground

Requires Pillow:
  pip install Pillow

Usage:
  python scripts/generate-assets.py
"""

import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Pillow is required to run this script. Install it with: pip install Pillow"
    ) from exc

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "public" / "brand"
SIZES = [16, 32, 180, 192, 512]

COLORS = {
    "bg": (21, 21, 21),
    "panel": (43, 43, 43),
    "muted": (114, 114, 114),
    "fg": (255, 255, 255),
}


def draw_logo(size: int) -> Image.Image:
    """Render the OpenContent IDE mark at the requested square size."""
    img = Image.new("RGBA", (size, size), COLORS["bg"])
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.18)
    stroke = max(1, int(size * 0.06))

    # Diamond / open prism shape
    cx = size // 2
    top = pad
    bottom = size - pad
    left = pad
    right = size - pad
    mid_y = (top + bottom) // 2

    # Outer shell
    draw.polygon(
        [(cx, top), (right, mid_y), (cx, bottom), (left, mid_y)],
        outline=COLORS["fg"],
        width=stroke,
    )
    # Horizontal crossbar
    draw.line(
        [(left + stroke, mid_y), (right - stroke, mid_y)],
        fill=COLORS["fg"],
        width=stroke,
    )
    # Inner vertical spine
    draw.line(
        [(cx, top + pad // 2), (cx, bottom - pad // 2)],
        fill=COLORS["muted"],
        width=max(1, stroke // 2),
    )

    return img


def generate_pngs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        img = draw_logo(size)
        img.save(OUTPUT_DIR / f"logo-{size}.png", "PNG")
        print(f"Generated {OUTPUT_DIR / f'logo-{size}.png'}")

    # Multi-resolution favicon
    favicon = Image.new("RGBA", (32, 32), COLORS["bg"])
    favicon.paste(draw_logo(32), (0, 0))
    favicon.save(OUTPUT_DIR / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)])
    print(f"Generated {OUTPUT_DIR / 'favicon.ico'}")


def generate_svgs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 3h12l4 8-10 10L2 11z"/>
  <path d="M2 11h20"/>
  <path d="M12 21 8 11l4-8 4 8z"/>
</svg>"""
    (OUTPUT_DIR / "logo.svg").write_text(svg, encoding="utf-8")
    print(f"Generated {OUTPUT_DIR / 'logo.svg'}")


if __name__ == "__main__":
    generate_pngs()
    generate_svgs()
