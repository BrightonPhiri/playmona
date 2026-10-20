"""PlayMora brand asset generator.

Turns the source artwork (logo, avatar sheets, background paintings) into the
web-ready files the app uses:

  assets/brand/     logo mark, lockup, app icons, favicons, social image
  assets/avatars/   48 character avatars (transparent WebP, 192px)
  assets/images/ui/ background art (WebP, desktop + mobile sizes)

Usage:
  python tools/gen-brand-assets.py "C:/path/to/source/images"

Background removal only clears white that is connected to the image edge
(a flood fill), so white parts inside a picture (the robot, the play
triangle in the logo) stay solid.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else 'C:/Users/Brighton/OneDrive/Documents/www/familygame/assets/images'

NAVY = (11, 16, 48)

# Avatar sheets, read left to right, top to bottom. Ids are stable: saved
# profiles refer to them, so never renumber - only append.
SHEETS = [
    ("PlayMora's vibrant 4x4 avatar lineup.png", [
        ('corgi', 'Corgi', 'animals'), ('penguin', 'Penguin', 'animals'), ('squirrel', 'Squirrel', 'animals'), ('koala', 'Koala', 'animals'),
        ('nia', 'Nia', 'people'), ('kenji', 'Kenji', 'people'), ('amara', 'Amara', 'people'), ('grandpa-joe', 'Joe', 'people'),
        ('otter', 'Otter', 'animals'), ('toucan', 'Toucan', 'animals'), ('raccoon', 'Raccoon', 'animals'), ('husky', 'Husky', 'animals'),
        ('ravi', 'Ravi', 'people'), ('layla', 'Layla', 'people'), ('ruby', 'Ruby', 'people'), ('capybara', 'Capybara', 'animals'),
    ]),
    ("PlayMora's colorful 16-character avatar grid.png", [
        ('fox', 'Fox', 'animals'), ('bolt', 'Bolt the robot', 'fantasy'), ('dragon', 'Dragon', 'fantasy'), ('panda', 'Panda', 'animals'),
        ('zib', 'Zib the alien', 'fantasy'), ('wizard', 'Wizard', 'fantasy'), ('lion', 'Lion', 'animals'), ('unicorn', 'Unicorn', 'fantasy'),
        ('malik', 'Malik', 'people'), ('ninja', 'Ninja', 'fantasy'), ('tabby', 'Tabby cat', 'animals'), ('nova', 'Nova', 'people'),
        ('monster', 'Monster', 'fantasy'), ('axolotl', 'Axolotl', 'animals'), ('astronaut', 'Astronaut', 'people'), ('chameleon', 'Chameleon', 'animals'),
    ]),
    ("Colorful Gaming Avatar Collection.png", [
        ('leo', 'Leo', 'people'), ('zuri', 'Zuri', 'people'), ('pixel', 'Pixel the robot', 'fantasy'), ('bao', 'Bao the panda', 'animals'),
        ('sofia', 'Sofia', 'people'), ('jay', 'Jay', 'people'), ('mika', 'Mika', 'people'), ('finn', 'Finn', 'people'),
        ('tunde', 'Tunde', 'people'), ('rosa', 'Rosa', 'people'), ('whiskers', 'Whiskers', 'animals'), ('kai', 'Kai', 'people'),
        ('imani', 'Imani', 'people'), ('ollie', 'Ollie', 'people'), ('mei', 'Mei', 'people'), ('sam', 'Sam', 'people'),
    ]),
]


def out(*parts):
    p = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def edge_background(img, tol=236):
    """Boolean mask of near-white pixels connected to the image border."""
    arr = np.asarray(img.convert('RGB'))
    white = (arr >= tol).all(axis=2)
    mask = Image.fromarray(np.where(white, 255, 0).astype('uint8'), 'L').copy()  # writable
    w, h = mask.size
    seeds = [(x, 0) for x in range(0, w, 7)] + [(x, h - 1) for x in range(0, w, 7)] + \
            [(0, y) for y in range(0, h, 7)] + [(w - 1, y) for y in range(0, h, 7)]
    for s in seeds:
        if mask.getpixel(s) == 255:
            ImageDraw.floodfill(mask, s, 128)
    return np.asarray(mask) == 128


def cut_out(img, bg):
    """RGBA image with the edge-connected background removed and soft edges."""
    alpha = Image.fromarray(np.where(bg, 0, 255).astype('uint8'), 'L')
    # Pull the edge in one pixel (drops the white anti-alias fringe), then soften.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = img.convert('RGBA')
    rgba.putalpha(alpha)
    return rgba


def keep_center_shape(cell):
    """Drop slivers of neighbouring circles: keep only the opaque shape that
    contains the centre of the cell."""
    a = np.asarray(cell.getchannel('A'))
    solid = Image.fromarray(np.where(a > 40, 255, 0).astype('uint8'), 'L').copy()
    w, h = solid.size
    ImageDraw.floodfill(solid, (w // 2, h // 2), 128)
    keep = np.asarray(solid) == 128
    # Grow the kept region by a few pixels so soft edges survive.
    keep_img = Image.fromarray(np.where(keep, 255, 0).astype('uint8'), 'L').filter(ImageFilter.MaxFilter(7))
    alpha = np.minimum(a, np.asarray(keep_img))
    out_img = cell.copy()
    out_img.putalpha(Image.fromarray(alpha.astype('uint8'), 'L'))
    return out_img


def square(im, size, pad=0.0):
    bbox = im.getbbox()
    im = im.crop(bbox)
    w, h = im.size
    side = int(max(w, h) * (1 + pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas.resize((size, size), Image.LANCZOS)


def avatars():
    manifest = []
    for fname, names in SHEETS:
        sheet = Image.open(os.path.join(SRC, fname)).convert('RGB')
        bg = edge_background(sheet)
        cut = cut_out(sheet, bg)
        w, h = sheet.size
        cw, ch = w // 4, h // 4
        for i, (aid, label, group) in enumerate(names):
            cx, cy = (i % 4) * cw, (i // 4) * ch
            cell = cut.crop((cx, cy, cx + cw, cy + ch))
            cell = keep_center_shape(cell)
            sq = square(cell, 192, pad=0.02)
            sq.save(out('assets', 'avatars', aid + '.webp'), 'WEBP', quality=82, method=6)
            manifest.append((aid, label, group))
    return manifest


def logo():
    src = Image.open(os.path.join(SRC, 'PlayMora colorful ribbon logo.png')).convert('RGB')
    bg = edge_background(src)
    cut = cut_out(src, bg)
    w, h = src.size
    # The mark (P + dots) sits above the wordmark.
    mark = cut.crop((0, 0, w, int(h * 0.67)))
    mark_sq = square(mark, 512, pad=0.04)
    mark_sq.save(out('assets', 'brand', 'mark.png'))
    square(mark, 256, pad=0.04).save(out('assets', 'brand', 'mark-256.webp'), 'WEBP', quality=90, method=6)
    lockup = cut.crop(cut.getbbox())
    lockup.thumbnail((900, 900), Image.LANCZOS)
    lockup.save(out('assets', 'brand', 'lockup-on-light.png'))

    # App icons: navy tile, mark inside the maskable safe zone.
    for size, name, scale in [(512, 'icon-512.png', 0.66), (192, 'icon-192.png', 0.66),
                              (180, 'apple-touch-icon.png', 0.72), (48, 'favicon-48.png', 0.86), (32, 'favicon-32.png', 0.9)]:
        tile = Image.new('RGBA', (size, size), NAVY + (255,))
        m = mark_sq.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
        tile.paste(m, ((size - m.width) // 2, (size - m.height) // 2), m)
        if name.startswith('favicon'):
            # Rounded tile for browser tabs.
            r = Image.new('L', (size, size), 0)
            ImageDraw.Draw(r).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 4, fill=255)
            tile.putalpha(r)
        tile.save(out('assets', 'brand', name))
    return mark_sq


def backgrounds():
    jobs = [
        ('Joyful Cosmic Adventure Above Mini Planet.png', 'hero-cosmic'),
        ('Pastel Floating Islands and Lavender Castle.png', 'bg-islands'),
        ('Floating Books, Puzzles, and Starry Islands.png', 'bg-knowledge'),
    ]
    for src_name, base in jobs:
        im = Image.open(os.path.join(SRC, src_name)).convert('RGB')
        for width, suffix, q in [(1600, '', 72), (820, '-sm', 70)]:
            r = im.copy()
            r.thumbnail((width, width), Image.LANCZOS)
            r.save(out('assets', 'images', 'ui', base + suffix + '.webp'), 'WEBP', quality=q, method=6)


def social(mark):
    """1200x630 link-preview image: cosmic art, mark and name."""
    bg = Image.open(os.path.join(SRC, 'Joyful Cosmic Adventure Above Mini Planet.png')).convert('RGB')
    bg = bg.resize((1200, int(1200 * bg.height / bg.width)), Image.LANCZOS).crop((0, 0, 1200, 630))
    canvas = bg.convert('RGBA')
    m = mark.resize((230, 230), Image.LANCZOS)
    canvas.paste(m, (70, 120), m)
    d = ImageDraw.Draw(canvas)
    font_paths = ['C:/Windows/Fonts/seguibl.ttf', 'C:/Windows/Fonts/arialbd.ttf']
    font = next((ImageFont.truetype(p, 104) for p in font_paths if os.path.exists(p)), ImageFont.load_default())
    small = next((ImageFont.truetype(p, 34) for p in font_paths if os.path.exists(p)), ImageFont.load_default())
    d.text((70, 370), 'PlayMora', font=font, fill=(255, 255, 255))
    d.text((74, 500), 'GAMES FOR EVERYONE. EVERYWHERE.', font=small, fill=(255, 214, 92))
    canvas.convert('RGB').save(out('assets', 'brand', 'og-image.jpg'), 'JPEG', quality=84)


def write_manifest(items):
    lines = ["/* Generated by tools/gen-brand-assets.py - do not edit by hand. */",
             "window.FF = window.FF || {};",
             "FF.AVATAR_LIST = ["]
    for aid, label, group in items:
        lines.append("  { id: '%s', name: '%s', group: '%s' }," % (aid, label.replace("'", "\\'"), group))
    lines[-1] = lines[-1].rstrip(',')
    lines.append("];")
    with open(out('js', 'data', 'avatars.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    items = avatars()
    mark = logo()
    backgrounds()
    social(mark)
    write_manifest(items)
    print('avatars:', len(items))
