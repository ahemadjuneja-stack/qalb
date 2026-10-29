#!/usr/bin/env python3
"""Qalb — premium icon apply: raw 1024 icon → saare Android densities
(ic_launcher, ic_launcher_round, ic_launcher_foreground) + splash refresh."""
import os
from PIL import Image, ImageDraw, ImageOps

RES = "/home/z/my-project/android/app/src/main/res"
RAW = "/tmp/qalb-icon-raw.png"

# green tile ke andar ka square crop (heart fully visible, koi gold frame nahi)
CROP = (220, 250, 810, 840)  # 590x590

src = Image.open(RAW).convert("RGBA")
tile = src.crop(CROP)
print("tile size:", tile.size)

# bg color sample (tile ka corner — dark emerald)
corner = tile.getpixel((8, 8))
print("corner color:", corner)

# ── 1. ic_launcher (square) + ic_launcher_round (circle mask) ──
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

for d, s in SIZES.items():
    os.makedirs(f"{RES}/{d}", exist_ok=True)
    sq = tile.resize((s, s), Image.LANCZOS)
    sq.save(f"{RES}/{d}/ic_launcher.png")

    # round: circle mask
    r = sq.copy()
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s - 1, s - 1], fill=255)
    r.putalpha(mask)
    r.save(f"{RES}/{d}/ic_launcher_round.png")

    # foreground: content ~56% of canvas (adaptive safe zone), transparent padding
    f = s * 108 // 48  # adaptive foreground 108dp base
    fg = Image.new("RGBA", (f, f), (0, 0, 0, 0))
    content_s = int(f * 0.56)
    content = tile.resize((content_s, content_s), Image.LANCZOS)
    # content ko circular nahi — square rounded corners ke saath paste
    fg.paste(content, ((f - content_s) // 2, (f - content_s) // 2), content)
    fg.save(f"{RES}/{d}/ic_launcher_foreground.png")
    print(f"{d}: launcher {s}px, round {s}px, fg {f}px")

# ── 2. ic_launcher_background color update ──
hex_color = "#{:02X}{:02X}{:02X}".format(corner[0], corner[1], corner[2])
values = f"{RES}/values"
os.makedirs(values, exist_ok=True)
colors_path = f"{values}/ic_launcher_background.xml"
with open(colors_path, "w") as fh:
    fh.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{hex_color}</color>\n</resources>\n')
print("colors:", hex_color)

# ── 3. splash refresh — round icon centered on dark bg ──
BG = (10, 10, 12)
round_512 = tile.resize((512, 512), Image.LANCZOS)
mask = Image.new("L", (512, 512), 0)
ImageDraw.Draw(mask).ellipse([0, 0, 511, 511], fill=255)
round_512.putalpha(mask)

for d in sorted(os.listdir(RES)):
    p = os.path.join(RES, d, "splash.png")
    if not (d.startswith("drawable") and os.path.exists(p)):
        continue
    with Image.open(p) as im:
        w, h = im.size
    splash = Image.new("RGBA", (w, h), BG + (255,))
    icon_s = int(min(w, h) * 0.30)
    if icon_s % 2:
        icon_s += 1
    ic = round_512.resize((icon_s, icon_s), Image.LANCZOS)
    splash.paste(ic, ((w - icon_s) // 2, (h - icon_s) // 2), ic)
    splash.convert("RGB").save(p)
    print(f"splash {d}: {w}x{h}, icon {icon_s}px")

print("DONE")
