"""Self-test for the cut-art-sheets.py options Mission Trail added:
trimmed cuts that keep an object's shape, frame sets that share one size
and baseline, manual crop boxes, and textures made to tile.

Usage: python tools/test/cut-sheets-selftest.py   (exits 1 on a failure)
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('cutter', os.path.join(HERE, '..', 'cut-art-sheets.py'))
cutter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cutter)

failures = []


def check(name, cond, detail=''):
    print(('  PASS  ' if cond else '  FAIL  ') + name + ('' if cond else '  ' + detail))
    if not cond:
        failures.append(name)


def white_sheet(w, h, rects):
    img = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    for r, colour in rects:
        d.rectangle(r, fill=colour, outline=(60, 40, 30), width=3)
    return img


# 1. A trimmed cut keeps the object's shape (a tall house stays tall).
sheet = white_sheet(600, 400, [((60, 40, 140, 360), (200, 60, 60)), ((330, 150, 610 - 40, 250), (60, 120, 200))])
rgba, alpha = cutter.alpha_mask(sheet)
boxes, _ = cutter.boxes_in_grid(alpha, 2, 1)
tall = cutter.trim_card(rgba, boxes[0], 200)
wide = cutter.trim_card(rgba, boxes[1], 200)
check('trim keeps a tall object tall', max(tall.size) == 200 and abs(tall.size[0] / tall.size[1] - 81 / 321) < 0.03, str(tall.size))
check('trim keeps a wide object wide', max(wide.size) == 200 and abs(wide.size[1] / wide.size[0] - 101 / 241) < 0.03, str(wide.size))

# 2. Frames share one canvas, bottom-aligned, so a walk cycle does not jitter.
frames_sheet = white_sheet(400, 300, [
    ((30, 40, 70, 130), (220, 180, 40)), ((230, 20, 290, 130), (220, 180, 40)),
    ((40, 180, 80, 280), (220, 180, 40)), ((240, 200, 270, 280), (220, 180, 40))])
rgba2, alpha2 = cutter.alpha_mask(frames_sheet)
boxes2, _ = cutter.boxes_in_grid(alpha2, 2, 2)
cards = cutter.frame_cards(rgba2, boxes2, 120)
sizes = set(c.size for c in cards)
check('frames all have one size', len(sizes) == 1, str(sizes))
bottoms = set()
for c in cards:
    a = np.asarray(c.getchannel('A')) > 40
    bottoms.add(int(np.nonzero(a.any(axis=1))[0].max()))
check('frames all stand on the same bottom row', max(bottoms) - min(bottoms) <= 1, str(bottoms))

# 3. A manual crop box wins over the grid cell.
box = cutter.box_for({'crops': {'house': [10, 20, 110, 220]}}, 'house', (1, 2, 3, 4))
check('a manual crop overrides the grid box', box == (10, 20, 110, 220), str(box))
check('without a crop the grid box is used', cutter.box_for({}, 'house', (1, 2, 3, 4)) == (1, 2, 3, 4))

# 4. A texture is made to tile: its left and right (and top and bottom) edges meet.
grad = np.zeros((300, 300, 3), dtype=np.uint8)
grad[:, :, 0] = np.linspace(0, 255, 300)[None, :]
grad[:, :, 1] = np.linspace(0, 255, 300)[:, None]
tile = np.asarray(cutter.make_tileable(Image.fromarray(grad, 'RGB'), 128)).astype(int)
check('texture size', tile.shape[:2] == (128, 128), str(tile.shape))
lr = np.abs(tile[:, 0, 0] - tile[:, -1, 0]).mean()
tb = np.abs(tile[0, :, 1] - tile[-1, :, 1]).mean()
check('texture left edge meets right edge', lr < 8, '%.1f' % lr)
check('texture top edge meets bottom edge', tb < 8, '%.1f' % tb)

print('\n%d failed' % len(failures))
sys.exit(1 if failures else 0)
