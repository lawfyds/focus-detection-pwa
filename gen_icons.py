from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(size, path):
    img = Image.new('RGBA', (size, size), (26, 26, 46, 255))
    draw = ImageDraw.Draw(img)
    pad = size // 6
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=size // 8,
        fill=(74, 144, 217, 255)
    )
    cx, cy = size // 2, size // 2
    r = size // 5
    draw.ellipse([cx - r, cy - r // 2, cx + r, cy + r // 2], outline='white', width=max(2, size // 40))
    pupil_r = r // 3
    draw.ellipse([cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r], fill='white')
    bar_y = cy + r + size // 12
    bar_w = size // 3
    bar_h = max(3, size // 30)
    draw.rounded_rectangle(
        [cx - bar_w // 2, bar_y, cx + bar_w // 2, bar_y + bar_h],
        radius=bar_h // 2,
        fill=(255, 255, 255, 180)
    )
    fill_w = int(bar_w * 0.7)
    draw.rounded_rectangle(
        [cx - bar_w // 2, bar_y, cx - bar_w // 2 + fill_w, bar_y + bar_h],
        radius=bar_h // 2,
        fill=(0, 230, 118, 255)
    )
    img.save(path)
    print(f"Generated {path}")

base = os.path.dirname(os.path.abspath(__file__))
icons_dir = os.path.join(base, 'icons')
os.makedirs(icons_dir, exist_ok=True)
make_icon(192, os.path.join(icons_dir, 'icon-192.png'))
make_icon(512, os.path.join(icons_dir, 'icon-512.png'))
