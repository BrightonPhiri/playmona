"""Finds the differences between a Spot the Difference pair.

Codex makes picture A, then edits A into picture B, so the two match
everywhere except the changed spots (plus faint re-encoding noise). This
script blurs both, keeps the pixels that differ a lot, groups them into
spots and writes, for each spot, in 0..1 picture coordinates:

  b  the spot's box (where a tap counts and the circle goes)
  p  a larger box around it that is safe to paint back from picture A
     when the level uses fewer differences (it never covers another spot)

Usage:  python tools/art/spot-diff-find.py market-day [--expect 10] [--threshold 60]
        python tools/art/spot-diff-find.py farm-yard --merge 5+6,8+9 --restore 3

Spot numbers in --merge and --restore are the ones a plain run prints.
  --merge 5+6     the pieces of one change become one spot
  --restore 3     a change Codex made by mistake is painted back from A
                  into B
  --split 9:y=0.79  two changes the finder joined are cut apart along a line
                  (after merging: 2:... cuts the group --merge 2+5)
                  (or 9:box=x0,y0,x1,y1: the pixels inside the box go apart)
Spots whose box covers part of another spot's change are linked (written as
"g": the game makes them live together or paints them back together).

  --recolor 0.86,0.51,0.95,0.65:0:220
                  adds a change by hand: inside the box, pixels of hue 0
                  (+/- 30 degrees) are turned to hue 220. Numbers in the
                  other options come from a run that has the same --recolor.
  --restore-box x0,y0,x1,y1
                  paints an area back from A (redraw Codex did round a change);
                  numbers in the other options come from a run with the same box
The first --restore, --restore-box or --recolor keeps Codex's B as <id>-b-original.png and
every later run starts again from that file.

Reads   assets/playmona_assets/spot-difference/<id>-a.png and -b.png
        (--game hiddenObject: assets/playmona_assets/hidden-object/<id>-empty.png and -hidden.png,
         writing tools/art/hiddenObject-spots/<id>.json; --game missionTrail: the same from
         assets/playmona_assets/mission-trail/busy/, writing tools/art/missionTrail-spots/<id>.json)
Writes  tools/art/spotDifference-spots/<id>.json
        assets/playmona_assets/spot-difference/<id>-spots.jpg (review picture)
Exits 1 unless it finds exactly --expect spots.
"""
import argparse
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'assets', 'playmona_assets', 'spot-difference')
OUT = os.path.join(ROOT, 'tools', 'art', 'spotDifference-spots')
SIDES = ('a', 'b')
# Hidden Object uses the same finder: an empty scene and the same scene with objects added.
GAMES = {
    'spotDifference': ('spot-difference', 'spotDifference-spots', ('a', 'b')),
    'hiddenObject': ('hidden-object', 'hiddenObject-spots', ('empty', 'hidden')),
    # Mission Trail's busy rooms (then tools/art/missiontrail-rooms.py names the spots).
    'missionTrail': ('mission-trail/busy', 'missionTrail-spots', ('empty', 'hidden')),
}
WORK = 320          # the diff runs at this size: fast, and noise averages out
CORE = 30           # a spot's own changed pixels (no padding): a patch must not cover another spot's
PAD = 0.012         # padding round each spot's box
PATCH = 2.0         # patch box = spot box scaled by this, where no other spot is in the way


def load(pid, side):
    return Image.open(os.path.join(RAW, '%s-%s.png' % (pid, side))).convert('RGB')


def load_b(pid):
    orig = os.path.join(RAW, '%s-%s-original.png' % (pid, SIDES[1]))
    return Image.open(orig).convert('RGB') if os.path.exists(orig) else load(pid, SIDES[1])


def numbers(text):
    return [[int(n) for n in group.split('+')] for group in text.split(',') if group.strip()] if text else []


def keep_original(pid):
    orig = os.path.join(RAW, '%s-%s-original.png' % (pid, SIDES[1]))
    if not os.path.exists(orig):
        os.replace(os.path.join(RAW, '%s-%s.png' % (pid, SIDES[1])), orig)


def recolor(b, rule):
    """x0,y0,x1,y1:fromHue:toHue (degrees) -> B with that colour changed inside the box."""
    box, h_from, h_to = rule.split(':')
    x0, y0, x1, y1 = [float(v) for v in box.split(',')]
    w, h = b.size
    hsv = np.asarray(b.convert('HSV'), dtype=np.int16).copy()
    f, t = float(h_from) * 256 / 360, float(h_to) * 256 / 360
    near = np.abs(((hsv[..., 0] - f + 128) % 256) - 128) <= 30 * 256 / 360
    inside = np.zeros(near.shape, dtype=bool)
    inside[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = True
    pick = near & inside & (hsv[..., 1] >= 70) & (hsv[..., 2] >= 40)
    hsv[..., 0] = np.where(pick, (hsv[..., 0] - f + t) % 256, hsv[..., 0])
    changed = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')
    mask = Image.fromarray((pick * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    return Image.composite(changed, b, mask)


def restore(a, b, boxes, pid, pad=0.01):
    """Paint the given 0..1 boxes of A over B with soft edges; save B (keeping the original once)."""
    w, h = b.size
    mask = Image.new('L', b.size, 0)
    dr = ImageDraw.Draw(mask)
    for x0, y0, x1, y1 in boxes:
        dr.rectangle([(x0 - pad) * w, (y0 - pad) * h, (x1 + pad) * w, (y1 + pad) * h], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(4))
    return Image.composite(a, b, mask)


def diff_mask(a, b, threshold):
    small = (WORK, WORK * a.size[1] // a.size[0])
    A = np.asarray(a.filter(ImageFilter.GaussianBlur(3)).resize(small, Image.BOX), dtype=np.int16)
    B = np.asarray(b.filter(ImageFilter.GaussianBlur(3)).resize(small, Image.BOX), dtype=np.int16)
    d = np.abs(A - B).max(axis=2).astype(np.uint8)
    mask = Image.fromarray(((d >= threshold) * 255).astype(np.uint8))
    # Join the pieces of one change (a cat's outline, a crate of limes) into one blob.
    mask = mask.filter(ImageFilter.MaxFilter(7))
    return np.asarray(mask) > 0, d


def blobs(mask, min_frac):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            n, x0, y0, x1, y1 = 0, x, y, x, y
            px = []
            while q:
                cy, cx = q.popleft()
                n += 1
                px.append((cy, cx))
                x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if n >= min_frac * w * h:
                out.append({'box': [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h], 'px': px, 'w': w, 'h': h})
    return out


def box_of(px, w, h):
    ys, xs = zip(*px)
    return [min(xs) / w, min(ys) / h, (max(xs) + 1) / w, (max(ys) + 1) / h]


def split(blob, rule):
    """Cut one blob in two: along x=v or y=v, or box=x0,y0,x1,y1 (the pixels inside go apart)."""
    axis, v = rule.split('=')
    w, h = blob['w'], blob['h']
    if axis.strip() == 'box':
        x0, y0, x1, y1 = [float(t) for t in v.split(',')]
        inside = lambda p: x0 * w <= p[1] < x1 * w and y0 * h <= p[0] < y1 * h
    else:
        k = 1 if axis.strip() == 'x' else 0
        lim = float(v) * (w if k else h)
        inside = lambda p: p[k] < lim
    sides = [[p for p in blob['px'] if inside(p)], [p for p in blob['px'] if not inside(p)]]
    if not all(sides):
        sys.exit('split %s leaves one side empty' % rule)
    return sides


def padded(box):
    x0, y0, x1, y1 = box
    return [max(0, x0 - PAD), max(0, y0 - PAD), min(1, x1 + PAD), min(1, y1 + PAD)]


def scaled(box, k):
    x0, y0, x1, y1 = box
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * k / 2, (y1 - y0) * k / 2
    return [max(0, cx - hw), max(0, cy - hh), min(1, cx + hw), min(1, cy + hh)]


def overlaps(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def covers(cell, px):
    x0, y0, x1, y1 = cell
    return any(y0 <= py < y1 and x0 <= pxx < x1 for py, pxx in px)


def link(cells, cores):
    """Spots whose box covers another spot's changed pixels are linked (the game deals
    them together). Returns a group number per spot, None when it stands alone."""
    n = len(cells)
    parent = list(range(n))
    def top(i):
        while parent[i] != i:
            i = parent[i]
        return i
    for i in range(n):
        for j in range(n):
            if i != j and covers(cells[i], cores[j]):
                parent[top(i)] = top(j)
    roots = [top(i) for i in range(n)]
    sizes = {r: roots.count(r) for r in roots}
    names, out = {}, []
    for r in roots:
        if sizes[r] == 1:
            out.append(None)
        else:
            names.setdefault(r, len(names) + 1)
            out.append(names[r])
    return out


def counts_ok(groups, counts=(5, 7)):
    """True when every level's count can be dealt exactly from the singles and groups."""
    sizes = [groups.count(g) for g in set(groups) if g is not None] + [1] * groups.count(None)
    reach = {0}
    for k in sizes:
        reach |= {r + k for r in reach}
    return all(c in reach for c in counts)


def patch_for(i, cells, pxsets, groups):
    """Grow spot i's box side by side towards PATCH, never over the changed pixels of a spot
    outside its group. Works on the WORK grid. Returns (patch box, smallest margin left)."""
    x0, y0, x1, y1 = cells[i]
    others = np.zeros((WORK, WORK), dtype=bool)
    for j, px in enumerate(pxsets):
        if j != i and (groups[i] is None or groups[j] != groups[i]):
            for (py, pxx) in px:
                others[py, pxx] = True
    want_x = max(round(0.02 * WORK), round((PATCH - 1) / 2 * (x1 - x0)))
    want_y = max(round(0.02 * WORK), round((PATCH - 1) / 2 * (y1 - y0)))
    m = [0, 0, 0, 0]                       # left, top, right, bottom
    grew = True
    while grew:
        grew = False
        L, T, R, B = x0 - m[0], y0 - m[1], x1 + m[2], y1 + m[3]
        steps = [(0, L - 1 >= 0 and m[0] < want_x and not others[T:B, L - 1].any()),
                 (1, T - 1 >= 0 and m[1] < want_y and not others[T - 1, L:R].any()),
                 (2, R < WORK and m[2] < want_x and not others[T:B, R].any()),
                 (3, B < WORK and m[3] < want_y and not others[B, L:R].any())]
        for side, ok in steps:
            if ok:
                m[side] += 1
                grew = True
    L, T, R, B = x0 - m[0], y0 - m[1], x1 + m[2], y1 + m[3]
    inner = [m[k] for k, edge in enumerate((L <= 0, T <= 0, R >= WORK, B >= WORK)) if not edge]
    return [L / WORK, T / WORK, R / WORK, B / WORK], (min(inner) / WORK if inner else 1)


def xywh(box):
    return [round(box[0], 3), round(box[1], 3), round(box[2] - box[0], 3), round(box[3] - box[1], 3)]


def where(box):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    row = 'top' if cy < 1 / 3 else 'bottom' if cy > 2 / 3 else 'middle'
    col = 'left' if cx < 1 / 3 else 'right' if cx > 2 / 3 else 'centre'
    return row + ' ' + col


def review(b, boxes, patches, dest):
    size = 1000
    img = b.resize((size, size), Image.LANCZOS)
    dr = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=28)
    except TypeError:
        font = ImageFont.load_default()
    for i, (bx, px) in enumerate(zip(boxes, patches)):
        dr.rectangle([v * size for v in px], outline=(80, 160, 255), width=2)
        dr.ellipse([v * size for v in bx], outline=(255, 214, 0), width=5)
        dr.text((bx[0] * size + 4, bx[1] * size - 30), str(i + 1), fill=(255, 255, 255), font=font,
                stroke_width=3, stroke_fill=(0, 0, 0))
    img.save(dest, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--game', default='spotDifference', choices=sorted(GAMES), help='whose pictures (hiddenObject: <id>-empty/-hidden)')
    ap.add_argument('--expect', type=int, default=10)
    ap.add_argument('--threshold', type=int, default=60)
    ap.add_argument('--min', type=float, default=0.0004, help='smallest spot, as a share of the picture')
    ap.add_argument('--merge', default='', help='e.g. 5+6,8+9+10: pieces of one change')
    ap.add_argument('--restore', default='', help='e.g. 3,16: stray changes to paint back from A')
    ap.add_argument('--split', action='append', default=[], help='e.g. 9:y=0.79 (repeatable)')
    ap.add_argument('--recolor', action='append', default=[], help='x0,y0,x1,y1:fromHue:toHue (repeatable)')
    ap.add_argument('--restore-box', action='append', default=[], help='x0,y0,x1,y1: paint this area back from A (repeatable)')
    args = ap.parse_args()
    global RAW, OUT, SIDES
    folder, out, SIDES = GAMES[args.game]
    RAW = os.path.join(ROOT, 'assets', 'playmona_assets', folder)
    OUT = os.path.join(ROOT, 'tools', 'art', out)

    a, b = load(args.id, SIDES[0]), load_b(args.id)
    if a.size != b.size:
        sys.exit('%s: A is %s but B is %s; they must match' % (args.id, a.size, b.size))
    for rule in args.recolor:
        b = recolor(b, rule)
    if args.restore_box:
        b = restore(a, b, [[float(v) for v in r.split(',')] for r in args.restore_box], args.id, pad=0)
    order = lambda r: (round((r[1] + r[3]) / 2 * 3), (r[0] + r[2]) / 2)   # reading order by thirds
    mask, d = diff_mask(a, b, args.threshold)
    found = sorted(blobs(mask, args.min), key=lambda bl: order(bl['box']))
    merges, restores = numbers(args.merge), sum(numbers(args.restore), [])
    splits = {int(r.split(':')[0]): r.split(':')[1] for r in args.split}
    used = restores + sum(merges, [])
    if any(n < 1 or n > len(found) for n in used + list(splits)) or len(set(used)) != len(used):
        sys.exit('%s: --merge/--restore/--split numbers must be 1..%d and used once each' % (args.id, len(found)))
    if any(n in restores or (n in sum(merges, []) and not any(g[0] == n for g in merges)) for n in splits):
        sys.exit('%s: --split takes a spot number, or the first number of a --merge group' % args.id)
    if restores:
        b = restore(a, b, [found[n - 1]['box'] for n in restores], args.id)
    if restores or args.recolor or args.restore_box:
        keep_original(args.id)
        b.save(os.path.join(RAW, '%s-%s.png' % (args.id, SIDES[1])))
    # each change: its first spot number -> its pixels (merges join, then splits cut)
    items = {n: found[n - 1]['px'] for n in range(1, len(found) + 1) if n not in restores and n not in sum(merges, [])}
    for g in merges:
        items[g[0]] = sum([found[n - 1]['px'] for n in g], [])
    pxsets = []
    for n, px in items.items():
        if n in splits:
            pxsets += split({'px': px, 'w': WORK, 'h': WORK}, splits[n])
        else:
            pxsets.append(px)
    pxsets.sort(key=lambda px: order(box_of(px, WORK, WORK)))
    boxes = [padded(box_of(px, WORK, WORK)) for px in pxsets]
    cells = [[int(np.floor(v * WORK)) if k < 2 else int(np.ceil(v * WORK)) for k, v in enumerate(bx)] for bx in boxes]
    cores = [[(y, x) for (y, x) in px if d[y, x] >= CORE] for px in pxsets]
    groups = link(cells, cores)
    plans = [patch_for(i, cells, cores, groups) for i in range(len(boxes))]
    patches = [pl[0] for pl in plans]
    os.makedirs(OUT, exist_ok=True)
    spots = [dict({'b': xywh(bx), 'p': xywh(px)}, **({'g': g} if g else {})) for bx, px, g in zip(boxes, patches, groups)]
    with open(os.path.join(OUT, args.id + '.json'), 'w') as f:
        json.dump(spots, f, indent=1)
    review(b, boxes, patches, os.path.join(RAW, args.id + '-spots.jpg'))

    for i, (bx, (_, margin), g) in enumerate(zip(boxes, plans, groups)):
        note = '' if margin >= 0.012 else '   (narrow fade %.3f: check the edge)' % margin
        if g:
            note += '   linked: group %d' % g
        print('%2d  %-14s box %s%s' % (i + 1, where(bx), xywh(bx), note))
    ok = counts_ok(groups)
    print('%s: %d spots (expected %d)%s' % (args.id, len(boxes), args.expect,
          '' if ok else ', but the linked groups make 5 or 7 impossible to deal'))
    sys.exit(0 if len(boxes) == args.expect and ok else 1)

if __name__ == '__main__':
    main()
