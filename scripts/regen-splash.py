#!/usr/bin/env python3
"""Qalb — splash screens ko 'Midnight Gold' theme me regenerate karta hai.
Dark ink background + gold crescent & star (centered)."""
import os
from PIL import Image, ImageDraw

RES = "/home/z/my-project/android/app/src/main/res"
BG = (10, 10, 12)        # #0A0A0C
GOLD = (221, 186, 95)    # #DDBA5F
GOLD_DIM = (168, 132, 42)

# (dir, file, w, h)
SPLASHES = []
for d in os.listdir(RES):
    full = os.path.join(RES, d)
    if not os.path.isdir(full) or not d.startswith("drawable"):
        continue
    p = os.path.join(full, "splash.png")
    if os.path.exists(p):
        with Image.open(p) as im:
            SPLASHES.append((d, im.size[0], im.size[1]))

if not SPLASHES:
    raise SystemExit("koi splash.png nahi mila")


def draw_crescent_star(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Gold crescent (do circles ka difference via ellipse outline) + star."""
    # crescent: full circle, phir offset circle ko BG se overwrite
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    off = r * 0.42
    r2 = r * 0.88
    draw.ellipse([cx - r2 + off, cy - r2 - off * 0.25, cx + r2 + off, cy + r2 - off * 0.25], fill=BG)
    # star: chhota 5-point polygon crescent ke right me
    import math
    sx, sy, sr = cx + r * 0.95, cy - r * 0.18, r * 0.30
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = sr if i % 2 == 0 else sr * 0.42
        pts.append((sx + rad * math.cos(ang), sy + rad * math.sin(ang)))
    draw.polygon(pts, fill=GOLD)


for d, w, h in SPLASHES:
    img = Image.new("RGB", (w, h), BG)
    dr = ImageDraw.Draw(img)
    # subtle top glow
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * 0.25, -h * 0.5, w * 1.35, h * 0.35], fill=26)
    gold_layer = Image.new("RGB", (w, h), GOLD_DIM)
    img = Image.composite(gold_layer, img, glow)
    dr = ImageDraw.Draw(img)
    # center emblem
    r = min(w, h) * 0.16
    draw_crescent_star(dr, w / 2, h * 0.44, r)
    # QALB wordmark (simple, geometric)
    # 'Q' as ring below crescent + text fallback nahi (font risk) — sirf crescent rakhte hain
    out = os.path.join(RES, d, "splash.png")
    img.save(out, "PNG")
    print(f"✓ {d}/splash.png  {w}x{h}")

print("Splash regeneration done — Midnight Gold theme.")
