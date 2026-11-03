"""Bake Windows-style rounded corners into Tauri icon assets (transparent corners)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src-tauri" / "icons"
SRC_DIR = ROOT / "src-tauri" / "icon-source"
SRC = OUT_DIR / "icon.png"
# Keep a non-rounded backup outside icons/ so the build folder stays clean.
BACKUP = SRC_DIR / "icon-square-source.png"


def rounded(im: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    r = int(min(w, h) * radius_ratio)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    out = im.copy()
    out.putalpha(mask)
    return out


def main() -> None:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    if not BACKUP.exists():
        BACKUP.write_bytes(SRC.read_bytes())
        print(f"backup -> {BACKUP}")

    src = Image.open(BACKUP)
    # If source already has transparency at corners from a prior failed run,
    # composite onto white so the logo fill stays opaque inside the round rect.
    if src.mode == "RGBA":
        base = Image.new("RGBA", src.size, (255, 255, 255, 255))
        src = Image.alpha_composite(base, src.convert("RGBA"))

    rounded_512 = rounded(src)
    rounded_512.save(OUT_DIR / "icon.png", "PNG")

    for size, name in [(32, "32x32.png"), (128, "128x128.png")]:
        rounded_512.resize((size, size), Image.Resampling.LANCZOS).save(
            OUT_DIR / name, "PNG"
        )

    # Pillow embeds multiple sizes from the largest RGBA bitmap via `sizes=`.
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = OUT_DIR / "icon.ico"
    rounded_512.resize((256, 256), Image.Resampling.LANCZOS).save(
        ico_path, format="ICO", sizes=ico_sizes
    )

    (ROOT / "src" / "assets" / "app-icon.png").write_bytes(
        (OUT_DIR / "128x128.png").read_bytes()
    )
    (ROOT / "src" / "assets" / "app-icon.ico").write_bytes(ico_path.read_bytes())
    (ROOT / "public" / "favicon.ico").write_bytes(ico_path.read_bytes())

    corner = rounded_512.getpixel((0, 0))[3]
    center = rounded_512.getpixel((256, 256))[3]
    print("done")
    print(f"corner alpha={corner} center alpha={center}")
    print(f"ico bytes={ico_path.stat().st_size}")
    print(f"icons/ now: {[p.name for p in sorted(OUT_DIR.iterdir())]}")


if __name__ == "__main__":
    main()
