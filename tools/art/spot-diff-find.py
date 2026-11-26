"""Finds the differences between a Spot the Difference pair.

Codex makes picture A, then edits A into picture B, so the two match
everywhere except the changed spots (plus faint re-encoding noise). This
script blurs both, keeps the pixels that differ a lot, groups them into
spots and writes, for each spot, in 0..1 picture coordinates:

  b  the spot's box (where a tap counts and the circle goes)
  p  a larger box around it that is safe to paint back from picture A
     when the level uses fewer differences (it never covers another spot)

Usage:  python tools/art/spot-diff-find.py market-day [--expect 10] [--threshold 60]

Reads   assets/playmona_assets/spot-difference/<id>-a.png and -b.png
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
WORK = 320          # the diff runs at this size: fast, and noise averages out
PAD = 0.012         # padding round each spot's box
PATCH = 2.0         # patch box = spot box scaled by this ...
PATCH_MIN = 1.4     # ... but no smaller than this, or the edge may show


def load(pid, side):
    return Image.open(os.path.join(RAW, '%s-%s.png' % (pid, side))).convert('RGB')


def diff_mask(a, b, threshold):
    small = (WORK, WORK * a.size[1] // a.size[0])
    A = np.asarray(a.filter(ImageFilter.GaussianBlur(3)).resize(small, Image.BOX), dtype=np.int16)
    B = np.asarray(b.filter(ImageFilter.GaussianBlur(3)).resize(small, Image.BOX), dtype=np.int16)
    d = np.abs(A - B).max(axis=2).astype(np.uint8)
    mask = Image.fromarray(((d >= threshold) * 255).astype(np.uint8))
    # Join the pieces of one change (a cat's outline, a crate of limes) into one blob.
    mask = mask.filter(ImageFilter.MaxFilter(7))
    return np.asarray(mask) > 0


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
            while q:
                cy, cx = q.popleft()
                n += 1
                x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if n >= min_frac * w * h:
                out.append([x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h])
    return out


def padded(box):
    x0, y0, x1, y1 = box
    return [max(0, x0 - PAD), max(0, y0 - PAD), min(1, x1 + PAD), min(1, y1 + PAD)]


def scaled(box, k):
    x0, y0, x1, y1 = box
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * k / 2, (y1 - y0) * k / 2
    return [max(0, cx - hw), max(0, cy - hh), min(1, cx + hw), min(1, cy + hh)]


def overlaps(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def patch_for(i, boxes):
    k = PATCH
    while k > PATCH_MIN:
        p = scaled(boxes[i], k)
        if not any(overlaps(p, b) for j, b in enumerate(boxes) if j != i):
            return p, k
        k -= 0.05
    return scaled(boxes[i], PATCH_MIN), PATCH_MIN


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
    ap.add_argument('--expect', type=int, default=10)
    ap.add_argument('--threshold', type=int, default=60)
    ap.add_argument('--min', type=float, default=0.0004, help='smallest spot, as a share of the picture')
    args = ap.parse_args()

    a, b = load(args.id, 'a'), load(args.id, 'b')
    if a.size != b.size:
        sys.exit('%s: A is %s but B is %s; they must match' % (args.id, a.size, b.size))
    found = blobs(diff_mask(a, b, args.threshold), args.min)
    found.sort(key=lambda r: (round((r[1] + r[3]) / 2 * 3), (r[0] + r[2]) / 2))   # reading order by thirds
    boxes = [padded(r) for r in found]
    patches, scales = zip(*[patch_for(i, boxes) for i in range(len(boxes))]) if boxes else ((), ())

    os.makedirs(OUT, exist_ok=True)
    spots = [{'b': xywh(bx), 'p': xywh(px)} for bx, px in zip(boxes, patches)]
    with open(os.path.join(OUT, args.id + '.json'), 'w') as f:
        json.dump(spots, f, indent=1)
    review(b, boxes, patches, os.path.join(RAW, args.id + '-spots.jpg'))

    for i, (bx, k) in enumerate(zip(boxes, scales)):
        note = '' if k >= 1.6 else '   (tight patch x%.2f: check the edge)' % k
        print('%2d  %-14s box %s%s' % (i + 1, where(bx), xywh(bx), note))
    print('%s: %d spots (expected %d)' % (args.id, len(boxes), args.expect))
    sys.exit(0 if len(boxes) == args.expect else 1)


if __name__ == '__main__':
    main()
