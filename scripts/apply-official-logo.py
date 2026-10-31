#!/usr/bin/env python3
"""Qalb v0.5.6 — OFFICIAL LOGO apply (user ka red-white QALB logo):
  1. Launcher icons (square/round/foreground) saari densities
  2. Splash screens (port/land) — red bg + white QALB
  3. In-app assets: qalb-logo.png (red) + qalb-logo-bw.png (dark theme B&W)
  4. Purane heart-wale banner/icon DELETE
"""
import os
from PIL import Image, ImageDraw

REPO = "/home/z/my-project/qalb"
RES = f"{REPO}/android/app/src/main/res"
SRC = "/home/z/my-project/upload/AddText_11-01-05.13.31.png"
BRAND_RED = "#bb0000"

logo = Image.open(SRC).convert("RGB")
print("logo:", logo.size)

# ── 1. In-app PNGs ─────────────────────────────────────────────
# red logo (light theme banner + header + login gate) — 1200px
logo.resize((1200, 1200), Image.LANCZOS).save(f"{REPO}/public/brand/qalb-logo.png", optimize=True)

# B&W variant (dark theme banner): red bg (#bb0000, lum≈40) → black,
# white letters 255. Smooth edge ramp: [40..255] → [0..255].
g = logo.convert("L")
bw = g.point(lambda p: max(0, min(255, int((p - 40) * 255 / 215))))
bw_rgb = Image.merge("RGB", (bw, bw, bw))
bw_rgb.resize((1200, 1200), Image.LANCZOS).save(f"{REPO}/public/brand/qalb-logo-bw.png", optimize=True)
print("in-app PNGs done")

# ── 2. Launcher icons ──────────────────────────────────────────
SIZES = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96,
         "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
for d, s in SIZES.items():
    os.makedirs(f"{RES}/{d}", exist_ok=True)
    sq = logo.resize((s, s), Image.LANCZOS)
    sq.save(f"{RES}/{d}/ic_launcher.png")
    # round — circle mask
    r = sq.convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s - 1, s - 1], fill=255)
    r.putalpha(mask)
    r.save(f"{RES}/{d}/ic_launcher_round.png")
    # adaptive foreground — content 58% safe zone, transparent bg
    f = s * 108 // 48
    fg = Image.new("RGBA", (f, f), (0, 0, 0, 0))
    cs = int(f * 0.58)
    fg.paste(logo.resize((cs, cs), Image.LANCZOS), ((f - cs) // 2, (f - cs) // 2))
    fg.save(f"{RES}/{d}/ic_launcher_foreground.png")
    print(f"{d}: {s}px done")

# adaptive icon background = brand red
os.makedirs(f"{RES}/values", exist_ok=True)
with open(f"{RES}/values/ic_launcher_background.xml", "w") as fh:
    fh.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BRAND_RED}</color>\n</resources>\n')

# ── 3. Splash — brand red bg + logo centered ───────────────────
for d in sorted(os.listdir(RES)):
    p = os.path.join(RES, d, "splash.png")
    if not (d.startswith("drawable") and os.path.exists(p)):
        continue
    with Image.open(p) as im:
        w, h = im.size
    sp = Image.new("RGB", (w, h), (0xbb, 0x00, 0x00))
    isz = int(min(w, h) * 0.34)
    if isz % 2:
        isz += 1
    sp.paste(logo.resize((isz, isz), Image.LANCZOS), ((w - isz) // 2, (h - isz) // 2))
    sp.save(p)
    print(f"splash {d}: {w}x{h}")

# ── 4. Purane heart-wale assets DELETE ─────────────────────────
for f in ["qalb-banner.png", "qalb-icon.png", "qalb-banner.jpg", "qalb-icon.jpg"]:
    p = f"{REPO}/public/brand/{f}"
    if os.path.exists(p):
        os.remove(p)
        print("removed:", f)
print("BRAND DIR:", sorted(os.listdir(f"{REPO}/public/brand")))
print("DONE")
