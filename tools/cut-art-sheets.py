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
  cards.cut "drawings" cuts each separate drawing by where its centre is, for sheets whose
           drawings cross the grid lines (default: by grid cell)
           "photos" keeps each cell's full-bleed photo: the white gutter is trimmed off and the
           photo cropped to a centred square (no background removal). Guess It! uses this.
  "{topic}" in cards.to is replaced by the sheet's "topic".

Per-sheet options (Mission Trail; every one falls back to "cards"):
  cols, rows, to, size, max_kb   this sheet's grid, destination, card size and size limit
  fit "trim"     keep the object's own shape (no square card), longest edge = size
  fit "frames"   animation frames: one shared canvas, bottom-aligned, so nothing jitters
  crops          { id: [x0, y0, x1, y1] } manual boxes for objects off the grid
  textures       [{ from, to, size, max_kb }] seamless ground textures (cross-faded edges),
                 shown repeated 3 x 3 in textures-sheet.jpg
  singles        [{ from, to, size, max_kb }] one picture on a plain background, cut out
  backdrops      [{ from, to, size: [w, h], max_kb }] a full-bleed picture (a room behind a
                 Mission Trail pick scene): centre-cropped to w:h and resized, background kept
Self-test: python tools/test/cut-sheets-selftest.py
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


def boxes_by_drawing(alpha, cols, rows):
    """For sheets whose drawings cross the grid lines: each separate drawing goes to the
    cell its centre falls in, so nothing is clipped and no neighbour's line comes along.
    Returns (boxes, masks): per cell the box of its drawings and a mask of just them."""
    w, h = alpha.size
    solid = np.asarray(alpha.point(lambda v: 255 if v > 40 else 0)) > 0
    k = max(3, (min(w, h) // 300) | 1)
    joined = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k))
    lab = joined.convert('I')
    arr = np.asarray(lab).copy()
    labels, val = [], 1000
    while True:
        ys, xs = np.nonzero(arr == 255)
        if not len(ys):
            break
        ImageDraw.floodfill(lab, (int(xs[0]), int(ys[0])), val)
        arr = np.asarray(lab).copy()
        part = (arr == val) & solid
        if part.any():
            pys, pxs = np.nonzero(part)
            labels.append((val, int(part.sum()), float(pxs.mean()), float(pys.mean()),
                           (int(pxs.min()), int(pys.min()), int(pxs.max()) + 1, int(pys.max()) + 1)))
        val += 1
    big = max([x[1] for x in labels] or [1])
    cells = [[] for _ in range(cols * rows)]
    for v, n, cx, cy, bb in labels:
        if n < big * 0.004:
            continue   # dust
        bw, bh = bb[2] - bb[0], bb[3] - bb[1]
        at_edge = bb[0] <= 3 or bb[1] <= 3 or bb[2] >= w - 3 or bb[3] >= h - 3
        if at_edge and (bw > 12 * bh or bh > 12 * bw):
            continue   # the paper's edge or a frame line, not a drawing
        c = min(cols - 1, int(cx * cols / w))
        r = min(rows - 1, int(cy * rows / h))
        cells[r * cols + c].append((v, n, bb))
    # A small blob far from its cell's main drawing is a speck (sheet edge, noise), not part of it.
    reach = 0.15 * min(w / cols, h / rows)
    for i, parts in enumerate(cells):
        if not parts:
            continue
        main = max(parts, key=lambda p: p[1])
        mx0, my0, mx1, my1 = main[2]
        def near(bb):
            return bb[2] >= mx0 - reach and bb[0] <= mx1 + reach and bb[3] >= my0 - reach and bb[1] <= my1 + reach
        cells[i] = [p[0] for p in parts if p is main or p[1] >= main[1] * 0.05 or near(p[2])]
    boxes, masks = [], []
    for vals in cells:
        if not vals:
            boxes.append(None)
            masks.append(None)
            continue
        m = np.isin(arr, vals)
        ys, xs = np.nonzero(m & solid)
        boxes.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        masks.append(m)
    return boxes, masks


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


def photo_tiles(img, cols, rows):
    """For "photos" sheets: per grid cell, the box of its photo with the white gutter trimmed
    (a few pixels further in, so no pale anti-aliased rim is kept), or None."""
    rgb = img.convert('RGB')
    w, h = rgb.size
    px = np.asarray(rgb)
    photo = px.min(axis=2) < WHITE_CUTOFF
    out = []
    for r in range(rows):
        for c in range(cols):
            x0, y0, x1, y1 = int(c * w / cols), int(r * h / rows), int((c + 1) * w / cols), int((r + 1) * h / rows)
            bb = trimmed_bbox(photo[y0:y1, x0:x1])
            if not bb:
                out.append(None)
                continue
            inset = 3
            out.append((x0 + bb[0] + inset, y0 + bb[1] + inset, x0 + bb[2] - inset, y0 + bb[3] - inset))
    return rgb, out


def photo_card(rgb, box, size):
    """The middle square of a tile's photo, resized to size x size."""
    bw, bh = box[2] - box[0], box[3] - box[1]
    side = min(bw, bh)
    x0 = box[0] + (bw - side) // 2
    y0 = box[1] + (bh - side) // 2
    return rgb.crop((x0, y0, x0 + side, y0 + side)).resize((size, size), Image.LANCZOS)


def dest_for(cards, sheet, pid):
    return path(sheet.get('to', cards['to']).replace('{topic}', sheet.get('topic', '')).replace('{id}', pid))


def box_for(sheet, pid, grid_box):
    """A sheet's manual crop box for this id, else the box found in its grid cell."""
    crops = sheet.get('crops') or {}
    return tuple(crops[pid]) if pid in crops else grid_box


def trim_card(rgba, box, size):
    """The object trimmed to its outline, keeping its shape, longest edge = size."""
    obj = rgba.crop(box)
    ow, oh = obj.size
    scale = size / max(ow, oh)
    return obj.resize((max(1, round(ow * scale)), max(1, round(oh * scale))), Image.LANCZOS)


def frame_cards(rgba, boxes, size):
    """Animation frames: every frame on one shared canvas (the largest box), centred and
    standing on the same bottom row, so the figure does not jump between frames."""
    real = [b for b in boxes if b]
    cw = max(b[2] - b[0] for b in real)
    ch = max(b[3] - b[1] for b in real)
    scale = size / max(cw, ch)
    out_size = (max(1, round(cw * scale)), max(1, round(ch * scale)))
    cards = []
    for b in boxes:
        if not b:
            cards.append(None)
            continue
        obj = rgba.crop(b)
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.paste(obj, ((cw - obj.size[0]) // 2, ch - obj.size[1]), obj)
        cards.append(canvas.resize(out_size, Image.LANCZOS))
    return cards


def make_tileable(img, size, band=0.12):
    """A texture that repeats without a seam: the last `band` of columns (then rows) is
    cross-faded into the first, so the new left edge continues from the new right edge."""
    arr = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w = arr.shape[:2]
    b = max(2, int(round(band * w)))
    ramp = np.linspace(0.0, 1.0, b, dtype=np.float32)[None, :, None]
    out = arr[:, :w - b].copy()
    out[:, :b] = arr[:, :b] * ramp + arr[:, w - b:] * (1 - ramp)
    bh = max(2, int(round(band * h)))
    ramp = np.linspace(0.0, 1.0, bh, dtype=np.float32)[:, None, None]
    out2 = out[:h - bh].copy()
    out2[:bh] = out[:bh] * ramp + out[h - bh:] * (1 - ramp)
    tile = Image.fromarray(np.clip(out2, 0, 255).astype(np.uint8), 'RGB')
    return tile.resize((size, size), Image.LANCZOS)


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


def backdrop(img, size):
    """Centre-crop a full-bleed picture to size's shape, then resize it to size (w, h)."""
    img = img.convert('RGB')
    w, h = size
    sw, sh = img.size
    if sw * h > sh * w:
        cw = int(round(sh * w / h))
        img = img.crop(((sw - cw) // 2, 0, (sw - cw) // 2 + cw, sh))
    else:
        ch = int(round(sw * h / w))
        img = img.crop((0, (sh - ch) // 2, sw, (sh - ch) // 2 + ch))
    return img.resize((w, h), Image.LANCZOS)


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
    items = [(it[0], s) for s in spec['sheets'] for it in s['items']]
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
    for i, (pid, owner) in enumerate(items):
        x = pad + (i % per_row) * (cell + pad)
        y = pad + (i // per_row) * (cell + label_h + pad)
        d.text((x, y + 2), pid, font=f, fill=(235, 235, 245))
        src = dest_for(cards, owner, pid)
        if os.path.exists(src):
            tile = check.copy()
            img = Image.open(src).convert('RGBA')
            k = cell / max(img.size)
            img = img.resize((max(1, round(img.size[0] * k)), max(1, round(img.size[1] * k))), Image.LANCZOS)
            tile.paste(img, ((cell - img.size[0]) // 2, cell - img.size[1]), img)
            sheet.paste(tile, (x, y + label_h))
        else:
            d.rectangle((x, y + label_h, x + cell - 1, y + label_h + cell - 1), outline=(220, 70, 90), width=2)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    sheet.save(dest, 'JPEG', quality=86)


def texture_sheet(spec, dest):
    """Each texture repeated 3 x 3, so a seam or a stamped pattern shows at a glance."""
    tiles = [t for t in spec.get('textures', []) if os.path.exists(path(t['to']))]
    if not tiles:
        return
    side, pad = 3 * 128, 12
    sheet = Image.new('RGB', (len(tiles) * (side + pad) + pad, side + 2 * pad + 18), (24, 22, 34))
    d = ImageDraw.Draw(sheet)
    for i, t in enumerate(tiles):
        img = Image.open(path(t['to'])).convert('RGB').resize((128, 128), Image.LANCZOS)
        x = pad + i * (side + pad)
        d.text((x, 4), os.path.basename(t['to']), font=label_font(13), fill=(235, 235, 245))
        for gy in range(3):
            for gx in range(3):
                sheet.paste(img, (x + gx * 128, 18 + pad + gy * 128))
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
        if cards.get('cut') == 'photos':
            rgb, tiles = photo_tiles(Image.open(src), cols, rows)
            print('%s  (%dx%d)' % (s['file'], rgb.size[0], rgb.size[1]))
            for i, (pid, _) in enumerate(s['items']):
                box = tiles[i] if i < len(tiles) else None
                if not box:
                    problems.append('%s #%d %s: no photo found in its cell' % (name, i + 1, pid))
                    continue
                bw, bh = box[2] - box[0], box[3] - box[1]
                if min(bw, bh) < 0.85 * max(bw, bh):
                    problems.append('%s #%d %s: tile is not square (%dx%d), its sides are cropped' % (name, i + 1, pid, bw, bh))
                if min(bw, bh) < cards['size'] * 0.7:
                    problems.append('%s #%d %s: tile is small (%d px), it will look soft' % (name, i + 1, pid, min(bw, bh)))
                kb, q = save_webp(photo_card(rgb, box, cards['size']), dest_for(cards, s, pid), cards['max_kb'])
                total_kb += kb
                count += 1
                print('  %-24s %5.1f KB  q%d' % (pid, kb, q))
            continue
        rgba, alpha = alpha_mask(Image.open(src))
        scols, srows = s.get('cols', cols), s.get('rows', rows)
        size, max_kb, fit = s.get('size', cards['size']), s.get('max_kb', cards['max_kb']), s.get('fit')
        by_drawing = cards.get('cut') == 'drawings'
        if by_drawing:
            boxes, masks = boxes_by_drawing(alpha, scols, srows)
        else:
            boxes, _ = boxes_in_grid(alpha, scols, srows)
        print('%s  (%dx%d)' % (s['file'], rgba.size[0], rgba.size[1]))
        if fit == 'frames':
            ids = [it[0] for it in s['items']]
            fboxes = [box_for(s, pid, boxes[i] if i < len(boxes) else None) for i, pid in enumerate(ids)]
            for i, pid in enumerate(ids):
                if not fboxes[i]:
                    problems.append('%s #%d %s: nothing found in its cell' % (name, i + 1, pid))
            if any(fboxes):
                for pid, card in zip(ids, frame_cards(rgba, fboxes, size)):
                    if card is None:
                        continue
                    kb, q = save_webp(card, dest_for(cards, s, pid), max_kb)
                    total_kb += kb
                    count += 1
                    print('  %-20s %5.1f KB  q%d  %dx%d' % (pid, kb, q, card.size[0], card.size[1]))
            continue
        for i, (pid, _) in enumerate(s['items']):
            box = box_for(s, pid, boxes[i] if i < len(boxes) else None)
            if not box:
                problems.append('%s #%d %s: nothing found in its cell' % (name, i + 1, pid))
                continue
            src_img = rgba
            if by_drawing:
                # Only this cell's drawings: a neighbour inside the box is left out.
                keep = Image.fromarray((masks[i] * 255).astype(np.uint8))
                src_img = rgba.copy()
                src_img.putalpha(ImageChops.multiply(rgba.getchannel('A'), keep))
            elif pid not in (s.get('crops') or {}) and touches_cell_edge(box, scols, srows, rgba.size):
                problems.append('%s #%d %s: runs into a neighbouring cell, check it' % (name, i + 1, pid))
            dest = dest_for(cards, s, pid)
            card = trim_card(src_img, box, size) if fit == 'trim' else card_from(src_img, box, size)
            kb, q = save_webp(card, dest, max_kb)
            total_kb += kb
            count += 1
            flag = '' if kb <= max_kb else '  OVER %d KB' % max_kb
            print('  %-20s %5.1f KB  q%d%s' % (pid, kb, q, flag))

    # Seamless ground textures, and single pictures cut from a plain background.
    for tx in spec.get('textures', []):
        src = os.path.join(source, tx['from'])
        if not os.path.exists(src):
            missing.append(os.path.relpath(src, ROOT))
            continue
        if check_only or (only and os.path.splitext(os.path.basename(tx['from']))[0] not in only):
            continue
        kb, q = save_webp(make_tileable(Image.open(src), tx['size']), path(tx['to']), tx['max_kb'])
        total_kb += kb
        count += 1
        print('  %-20s %5.1f KB  q%d  (texture)' % (os.path.basename(tx['to']), kb, q))
    for sg in spec.get('singles', []):
        src = os.path.join(source, sg['from'])
        if not os.path.exists(src):
            missing.append(os.path.relpath(src, ROOT))
            continue
        if check_only or (only and os.path.splitext(os.path.basename(sg['from']))[0] not in only):
            continue
        rgba, alpha = alpha_mask(Image.open(src))
        bb = trimmed_bbox(np.asarray(alpha.point(lambda v: 255 if v > 40 else 0)) > 0)
        if not bb:
            problems.append('%s: nothing found' % sg['from'])
            continue
        kb, q = save_webp(trim_card(rgba, bb, sg['size']), path(sg['to']), sg['max_kb'])
        total_kb += kb
        count += 1
        print('  %-20s %5.1f KB  q%d  (single)' % (os.path.basename(sg['to']), kb, q))
    for bd in spec.get('backdrops', []):
        src = os.path.join(source, bd['from'])
        if not os.path.exists(src):
            missing.append(os.path.relpath(src, ROOT))
            continue
        if check_only or (only and os.path.splitext(os.path.basename(bd['from']))[0] not in only):
            continue
        kb, q = save_webp(backdrop(Image.open(src), bd['size']), path(bd['to']), bd['max_kb'])
        total_kb += kb
        count += 1
        print('  %-20s %5.1f KB  q%d  (backdrop)' % (os.path.basename(bd['to']), kb, q))

    if not check_only and count and spec.get('textures'):
        texture_sheet(spec, os.path.join(source, 'textures-sheet.jpg'))
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
