"""Cuts generated picture sheets (a grid of objects) into small card pictures.

Some games need many small pictures (Memory Match has 192). Codex makes them as
sheets of 12 in a 4 x 3 grid, listed in tools/art/<gameId>.json under "sheets".
For each sheet this script:

  - removes the background: a transparent PNG keeps its alpha; a white sheet is
    flood-filled from the edges, so white parts inside an object stay,
  - finds the objects. It expects one per grid cell; a sheet whose objects do not
    sit one to a cell is reported so it can be redone,
  - trims each object to its outline, centres it on a transparent square with a
    small margin, resizes and saves WebP under max_kb,
  - writes a contact sheet next to the raw files, labelled with each id.

Usage:  python tools/cut-art-sheets.py memoryMatch
        python tools/cut-art-sheets.py memoryMatch --check            (only list missing sheets)
        python tools/cut-art-sheets.py memoryMatch --only animals-1   (redo some sheets)

Spec (tools/art/<gameId>.json):
  source   folder of raw art, relative to the repo
  cards    { to, size, max_kb, cols, rows }; "{id}" is replaced in to
  sheets   [{ file, title, items: [[id, description], ...] }] in reading order
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
QUALITIES = (86, 82, 78, 74, 70, 66, 60, 54)
WHITE_CUTOFF = 238      # brighter than this on every channel counts as background
MARGIN = 0.06           # empty border around each object, as a share of the card


def path(*parts):
    return os.path.join(ROOT, *parts)


def alpha_mask(img):
    """Alpha for the sheet: its own if it has a real one, else white removed from the edges."""
    rgba = img.convert('RGBA')
    a = rgba.getchannel('A')
    if a.getextrema()[0] < 250:
        return rgba, a
    rgb = rgba.convert('RGB')
    # Pixels near white on all channels are candidate background.
    r, g, b = rgb.split()
    lo = ImageChops.darker(ImageChops.darker(r, g), b)
    near_white = lo.point(lambda v: 255 if v >= WHITE_CUTOFF else 0)
    # Only the near-white region connected to the border is background, so a
    # white eye or tooth inside an object is kept.
    fill = near_white.copy()
    w, h = fill.size
    seeds = [(x, y) for x in range(0, w, 16) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 16) for x in (0, w - 1)]
    for s in seeds:
        if fill.getpixel(s) == 255:
            ImageDraw.floodfill(fill, s, 128)
    bg = fill.point(lambda v: 255 if v == 128 else 0)
    # Soften the cut: a one-pixel feather along the edge, and partial alpha for
    # pale anti-aliased edge pixels so no white halo is left.
    bg = bg.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    whiteness = lo.point(lambda v: max(0, min(255, (v - 200) * 255 // (WHITE_CUTOFF - 200))))
    edge_cut = ImageChops.multiply(bg, whiteness)
    alpha = ImageChops.invert(edge_cut)
    # Take the white back out of half-transparent edge pixels, so cards on a
    # dark face show no pale rim: colour = (seen - white * (1 - a)) / a.
    px = np.asarray(rgb, dtype=np.float32)
    a = np.asarray(alpha, dtype=np.float32)[..., None] / 255.0
    part = (a > 0.02) & (a < 0.98)
    clean = np.where(part, (px - 255.0 * (1.0 - a)) / np.maximum(a, 0.02), px)
    rgba = Image.fromarray(np.clip(clean, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    rgba.putalpha(alpha)
    return rgba, alpha


def boxes_in_grid(alpha, cols, rows):
    """The object's bounding box in each grid cell, or None when a cell is empty."""
    w, h = alpha.size
    solid = alpha.point(lambda v: 255 if v > 40 else 0)
    out = []
    for r in range(rows):
        for c in range(cols):
            cell = (int(c * w / cols), int(r * h / rows), int((c + 1) * w / cols), int((r + 1) * h / rows))
            bb = trimmed_bbox(np.asarray(solid.crop(cell)) > 0)
            if not bb:
                out.append(None)
                continue
            out.append((cell[0] + bb[0], cell[1] + bb[1], cell[0] + bb[2], cell[1] + bb[3]))
    return out, solid


def main_span(counts, keep=0.02):
    """First..last index of the runs of non-empty lines that carry real weight.
    A stray speck from a neighbouring cell sits apart, behind empty lines, and
    weighs next to nothing, so it is dropped instead of stretching the box."""
    runs, start = [], None
    for i, n in enumerate(list(counts) + [0]):
        if n and start is None:
            start = i
        elif not n and start is not None:
            runs.append((start, i, int(counts[start:i].sum())))
            start = None
    if not runs:
        return None
    big = max(r[2] for r in runs)
    kept = [r for r in runs if r[2] >= big * keep]
    return kept[0][0], kept[-1][1]


def trimmed_bbox(mask):
    """Bounding box (x0, y0, x1, y1) of the object in a cell mask, ignoring specks."""
    y0, y1, x0, x1 = 0, mask.shape[0], 0, mask.shape[1]
    for _ in range(2):
        ys = main_span(mask[y0:y1, x0:x1].sum(axis=1))
        if not ys:
            return None
        y0, y1 = y0 + ys[0], y0 + ys[1]
        xs = main_span(mask[y0:y1, x0:x1].sum(axis=0))
        x0, x1 = x0 + xs[0], x0 + xs[1]
    return x0, y0, x1, y1


def touches_cell_edge(box, cols, rows, size):
    """True when an object runs into its cell's border (likely spilling into a neighbour)."""
    w, h = size
    c = int((box[0] + box[2]) / 2 * cols / w)
    r = int((box[1] + box[3]) / 2 * rows / h)
    cx0, cy0, cx1, cy1 = c * w / cols, r * h / rows, (c + 1) * w / cols, (r + 1) * h / rows
    pad = 2
    inner_x = (box[0] > cx0 + pad or c == 0) and (box[2] < cx1 - pad or c == cols - 1)
    inner_y = (box[1] > cy0 + pad or r == 0) and (box[3] < cy1 - pad or r == rows - 1)
    return not (inner_x and inner_y)


def card_from(rgba, box, size):
    """The object centred on a transparent square card."""
    obj = rgba.crop(box)
    ow, oh = obj.size
    inner = size * (1 - 2 * MARGIN)
    scale = inner / max(ow, oh)
    obj = obj.resize((max(1, round(ow * scale)), max(1, round(oh * scale))), Image.LANCZOS)
    card = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    card.paste(obj, ((size - obj.size[0]) // 2, (size - obj.size[1]) // 2), obj)
    return card


def save_webp(img, dest, max_kb):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for q in QUALITIES:
        img.save(dest, 'WEBP', quality=q, method=6, alpha_quality=80)
        kb = os.path.getsize(dest) / 1024
        if kb <= max_kb:
            break
    return kb, q


def label_font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contact_sheet(spec, dest):
    """Every card on a checkerboard (to show any leftover halo), labelled with its id."""
    cell, pad, label_h, per_row = 128, 10, 18, 12
    cards = spec['cards']
    items = [it for s in spec['sheets'] for it in s['items']]
    rows = (len(items) + per_row - 1) // per_row
    sheet = Image.new('RGB', (per_row * (cell + pad) + pad, rows * (cell + label_h + pad) + pad), (24, 22, 34))
    check = Image.new('RGB', (cell, cell), (200, 200, 200))
    cd = ImageDraw.Draw(check)
    for y in range(0, cell, 16):
        for x in range(0, cell, 16):
            if (x // 16 + y // 16) % 2:
                cd.rectangle((x, y, x + 15, y + 15), fill=(160, 160, 160))
    d = ImageDraw.Draw(sheet)
    f = label_font(13)
    for i, (pid, _) in enumerate(items):
        x = pad + (i % per_row) * (cell + pad)
        y = pad + (i // per_row) * (cell + label_h + pad)
        d.text((x, y + 2), pid, font=f, fill=(235, 235, 245))
        src = path(cards['to'].replace('{id}', pid))
        if os.path.exists(src):
            tile = check.copy()
            img = Image.open(src).convert('RGBA').resize((cell, cell), Image.LANCZOS)
            tile.paste(img, (0, 0), img)
            sheet.paste(tile, (x, y + label_h))
        else:
            d.rectangle((x, y + label_h, x + cell - 1, y + label_h + cell - 1), outline=(220, 70, 90), width=2)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    sheet.save(dest, 'JPEG', quality=86)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    game = argv[1]
    check_only = '--check' in argv
    only = None
    if '--only' in argv:
        only = set(argv[argv.index('--only') + 1].split(','))

    with open(path('tools', 'art', game + '.json'), encoding='utf-8') as fh:
        spec = json.load(fh)
    source = path(spec['source'])
    cards = spec['cards']
    cols, rows = cards.get('cols', 4), cards.get('rows', 3)

    missing, problems, total_kb, count = [], [], 0.0, 0
    for s in spec['sheets']:
        name = os.path.splitext(os.path.basename(s['file']))[0]
        src = os.path.join(source, s['file'])
        if not os.path.exists(src):
            missing.append(os.path.relpath(src, ROOT))
            continue
        if check_only or (only and name not in only):
            continue
        rgba, alpha = alpha_mask(Image.open(src))
        boxes, _ = boxes_in_grid(alpha, cols, rows)
        print('%s  (%dx%d)' % (s['file'], rgba.size[0], rgba.size[1]))
        for i, (pid, _) in enumerate(s['items']):
            box = boxes[i] if i < len(boxes) else None
            if not box:
                problems.append('%s #%d %s: nothing found in its cell' % (name, i + 1, pid))
                continue
            if touches_cell_edge(box, cols, rows, rgba.size):
                problems.append('%s #%d %s: runs into a neighbouring cell, check it' % (name, i + 1, pid))
            dest = path(cards['to'].replace('{id}', pid))
            kb, q = save_webp(card_from(rgba, box, cards['size']), dest, cards['max_kb'])
            total_kb += kb
            count += 1
            flag = '' if kb <= cards['max_kb'] else '  OVER %d KB' % cards['max_kb']
            print('  %-20s %5.1f KB  q%d%s' % (pid, kb, q, flag))

    if not check_only and count:
        sheet = os.path.join(source, 'contact-sheet.jpg')
        contact_sheet(spec, sheet)
        print('\n%d cards, %.0f KB in all (%.1f KB each). Contact sheet: %s' % (count, total_kb, total_kb / count, os.path.relpath(sheet, ROOT)))
        subprocess.run(['node', path('tools', 'gen-asset-manifest.js')], check=False)

    if problems:
        print('\nCheck these:')
        for p in problems:
            print('  ' + p)
    if missing:
        print('\nMissing %d sheet(s):' % len(missing))
        for m in missing:
            print('  ' + m)
        return 1
    print('\nAll sheets present.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
