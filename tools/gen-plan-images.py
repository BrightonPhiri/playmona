"""PlayMona Plus plan images.

Makes one square picture per Plus plan from the brand art. Linkwa shows it on the
checkout page (image_url) and the Plus page shows it on each plan card.

  assets/images/plus/plus_day.jpg ... plus_lifetime.jpg  (800 x 800)

Prices are left out on purpose: admins can change them, the pictures stay right.
To use your own art, save it over these files with the same names (square works best).

Usage:  python tools/gen-plan-images.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SIZE = 800


def path(*parts):
    return os.path.join(ROOT, *parts)


# id, big label, line under it, background art, crop centre (0..1 across the art), pill colours
PLANS = [
    ('plus_day', '1 Day', 'Everything unlocked for a day', 'assets/images/ui/bg-islands.webp', 0.62, ((25, 195, 240), (30, 123, 255))),
    ('plus_week', '1 Week', 'Everything unlocked for a week', 'assets/images/ui/bg-knowledge.webp', 0.50, ((46, 200, 75), (16, 150, 110))),
    ('plus_month', '1 Month', 'Everything unlocked for a month', 'assets/images/ui/hero-cosmic.webp', 0.72, ((30, 123, 255), (139, 60, 247))),
    ('plus_year', '1 Year', 'Everything unlocked for a year', 'assets/images/ui/app-bg.webp', 0.50, ((139, 60, 247), (255, 47, 143))),
    ('plus_lifetime', 'Lifetime', 'Pay once, play forever', 'assets/images/ui/gamenight.webp', 0.50, ((255, 200, 61), (255, 138, 31))),
]


def font(name, size, weight):
    """The site's variable fonts at a fixed weight (they default to the thinnest)."""
    f = ImageFont.truetype(path('assets', 'fonts', name), size)
    f.set_variation_by_axes([weight])
    return f


def square_crop(img, cx):
    w, h = img.size
    side = min(w, h)
    left = int(max(0, min(w - side, cx * w - side / 2)))
    return img.crop((left, 0, left + side, side)).resize((SIZE, SIZE), Image.LANCZOS)


def gradient(size, c1, c2):
    """Left-to-right gradient, as an RGB image."""
    w, h = size
    g = Image.new('RGB', (w, 1))
    for x in range(w):
        t = x / max(1, w - 1)
        g.putpixel((x, 0), tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return g.resize((w, h))


def shade(img):
    """Darkens the bottom (for the label) and a little at the top (for the brand)."""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for y in range(SIZE):
        bottom = max(0.0, (y - SIZE * 0.38) / (SIZE * 0.62))
        top = max(0.0, 1 - y / (SIZE * 0.22))
        a = int(250 * bottom ** 1.1 + 120 * top ** 1.5)
        d.line([(0, y), (SIZE, y)], fill=(8, 12, 38, min(240, a)))
    return Image.alpha_composite(img.convert('RGBA'), overlay)


def glow_mark(img, mark, box):
    """The logo with a soft light behind it."""
    x, y, s = box
    m = mark.resize((s, s), Image.LANCZOS)
    halo = Image.new('RGBA', img.size, (0, 0, 0, 0))
    halo.paste((255, 255, 255, 0), (0, 0, *img.size))
    a = m.split()[3].point(lambda v: int(v * 0.85))
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    glow.paste(Image.new('RGBA', (s, s), (120, 160, 255, 255)), (x, y), a)
    glow = glow.filter(ImageFilter.GaussianBlur(s // 6))
    img = Image.alpha_composite(img, glow)
    img.alpha_composite(m, (x, y))
    return img


def text_shadow(img, xy, text, f, fill, blur=6, offset=3):
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((xy[0], xy[1] + offset), text, font=f, fill=(0, 0, 20, 200))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(img).text(xy, text, font=f, fill=fill)
    return img


def make(plan, mark):
    pid, label, line, art, cx, colours = plan
    img = square_crop(Image.open(path(art)).convert('RGB'), cx)
    if pid == 'plus_year':
        img = glow_mark(img.convert('RGBA'), mark, (SIZE // 2 - 190, 70, 380)).convert('RGB')
    img = shade(img)

    # Brand: small logo and "PlayMona Plus" top left
    small = mark.resize((76, 76), Image.LANCZOS)
    img.alpha_composite(small, (40, 34))
    img = text_shadow(img, (128, 40), 'PlayMona', font('baloo.woff2', 50, 800), (255, 255, 255))
    brand_w = ImageDraw.Draw(img).textlength('PlayMona ', font=font('baloo.woff2', 50, 800))
    img = text_shadow(img, (128 + brand_w, 40), 'Plus', font('baloo.woff2', 50, 800), (255, 200, 61))

    # The plan, in a gradient pill
    big = font('baloo.woff2', 150, 800)
    d = ImageDraw.Draw(img)
    l, t, r, b = d.textbbox((0, 0), label, font=big)
    tw, th = r - l, b - t
    pad_x, pad_y = 54, 34
    pw, ph = tw + pad_x * 2, th + pad_y * 2
    px, py = (SIZE - pw) // 2, 470
    pill_mask = Image.new('L', (pw, ph), 0)
    ImageDraw.Draw(pill_mask).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=ph // 2, fill=255)
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 20, 170), (px, py + 12), pill_mask)
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(16)))
    img.paste(gradient((pw, ph), *colours), (px, py), pill_mask)
    # thin light edge on the top half for a "toy" look
    edge = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle((3, 3, pw - 4, ph - 4), radius=ph // 2 - 3, outline=(255, 255, 255, 90), width=3)
    img.alpha_composite(edge, (px, py))
    dark_text = pid == 'plus_lifetime'
    img = text_shadow(img, (px + pad_x - l, py + pad_y - t), label, big, (40, 22, 0) if dark_text else (255, 255, 255), blur=4, offset=2 if not dark_text else 0)

    # The line under it
    small_f = font('nunito.woff2', 38, 800)
    sw = ImageDraw.Draw(img).textlength(line, font=small_f)
    img = text_shadow(img, ((SIZE - sw) / 2, py + ph + 34), line, small_f, (235, 240, 255))
    return img.convert('RGB')


def main():
    mark = Image.open(path('assets', 'brand', 'mark.png')).convert('RGBA')
    os.makedirs(path('assets', 'images', 'plus'), exist_ok=True)
    for plan in PLANS:
        out = path('assets', 'images', 'plus', plan[0] + '.jpg')
        make(plan, mark).save(out, 'JPEG', quality=84, optimize=True, progressive=True)
        print(out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
