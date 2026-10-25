"""Turns a game's raw generated art into the files the app ships.

Brighton generates the pictures in Codex from docs/art/<gameId>-prompts.md. Codex
saves large PNGs (about 1254 px, 2.5 MB) under assets/playmona_assets/, which git
ignores. This script reads tools/art/<gameId>.json and, for every picture:

  - says which files are still missing, so only those need generating,
  - crops to the target shape around the subject (the spec's "focus"),
  - resizes and saves WebP, lowering the quality until it fits under max_kb,
  - writes a contact sheet next to the raw files for reviewing the set.

Then it refreshes js/data/assetManifest.js so a new cover shows on the hub.

Usage:  python tools/process-game-art.py guessAnimal
        python tools/process-game-art.py guessAnimal --check        (only list missing files)
        python tools/process-game-art.py guessAnimal --only lion,cat (redo some pictures)

Spec format (tools/art/<gameId>.json):
  source   folder of raw art, relative to the repo
  ids      the picture ids, in review order
  sets     [{ name, from, to, size: [w, h], max_kb }]; "{id}" is replaced in from/to
  focus    { "<set>/<id>": [x, y] or [x, y, zoom] }; x and y are 0..1 across the
           raw image (default centre), zoom > 1 crops tighter (default 1)
  cover    optional { from, to, size, max_kb, focus }
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
QUALITIES = (82, 78, 74, 70, 66, 62, 58)


def path(*parts):
    return os.path.join(ROOT, *parts)


def crop_to(img, size, focus):
    """The largest box of the target shape around the focus point, then resized."""
    tw, th = size
    w, h = img.size
    fx, fy = focus[0], focus[1]
    zoom = focus[2] if len(focus) > 2 else 1.0
    ratio = tw / th
    cw, ch = (w, w / ratio) if w / h < ratio else (h * ratio, h)
    cw, ch = cw / zoom, ch / zoom
    left = min(max(0, fx * w - cw / 2), w - cw)
    top = min(max(0, fy * h - ch / 2), h - ch)
    box = tuple(int(round(v)) for v in (left, top, left + cw, top + ch))
    return img.crop(box).resize((tw, th), Image.LANCZOS)


def save_webp(img, dest, max_kb):
    """Saves at the best quality that fits under max_kb. Returns (kb, quality)."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for q in QUALITIES:
        img.save(dest, 'WEBP', quality=q, method=6)
        kb = os.path.getsize(dest) / 1024
        if kb <= max_kb:
            break
    return kb, q


def fill(template, pid):
    return template.replace('{id}', pid)


def label_font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contact_sheet(spec, made, dest):
    """One row per id with each set side by side, so a set can be judged at a glance."""
    cell, pad, label_h, per_row = 220, 12, 26, 3
    sets = [s['name'] for s in spec['sets']]
    group_w = len(sets) * (cell + 4) + pad
    ids = spec['ids']
    rows = (len(ids) + per_row - 1) // per_row
    sheet = Image.new('RGB', (per_row * group_w + pad, rows * (cell + label_h + pad) + pad), (24, 22, 34))
    d = ImageDraw.Draw(sheet)
    f = label_font(16)
    for i, pid in enumerate(ids):
        x = pad + (i % per_row) * group_w
        y = pad + (i // per_row) * (cell + label_h + pad)
        d.text((x, y + 3), pid, font=f, fill=(235, 235, 245))
        for j, name in enumerate(sets):
            box = (x + j * (cell + 4), y + label_h)
            out = made.get((name, pid))
            if out and os.path.exists(out):
                sheet.paste(Image.open(out).convert('RGB').resize((cell, cell), Image.LANCZOS), box)
            else:
                d.rectangle((box[0], box[1], box[0] + cell - 1, box[1] + cell - 1), outline=(220, 70, 90), width=3)
                d.text((box[0] + 12, box[1] + cell // 2 - 8), 'missing ' + name, font=f, fill=(220, 70, 90))
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
    focus = spec.get('focus', {})

    missing, made, total_kb, count = [], {}, 0.0, 0
    for s in spec['sets']:
        for pid in spec['ids']:
            src = os.path.join(source, fill(s['from'], pid))
            dest = path(fill(s['to'], pid))
            made[(s['name'], pid)] = dest
            if not os.path.exists(src):
                missing.append(os.path.relpath(src, ROOT))
                continue
            if check_only or (only and pid not in only):
                continue
            img = Image.open(src).convert('RGB')
            out = crop_to(img, s['size'], focus.get(s['name'] + '/' + pid, [0.5, 0.5]))
            kb, q = save_webp(out, dest, s['max_kb'])
            total_kb += kb
            count += 1
            flag = '' if kb <= s['max_kb'] else '  OVER ' + str(s['max_kb']) + ' KB'
            print('  %-34s %6.1f KB  q%d%s' % (os.path.relpath(dest, ROOT), kb, q, flag))

    cover = spec.get('cover')
    if cover:
        src = os.path.join(source, cover['from'])
        if not os.path.exists(src):
            missing.append(os.path.relpath(src, ROOT))
        elif not check_only and not only:
            img = Image.open(src).convert('RGB')
            kb, q = save_webp(crop_to(img, cover['size'], cover.get('focus', [0.5, 0.5])), path(cover['to']), cover['max_kb'])
            total_kb += kb
            count += 1
            print('  %-34s %6.1f KB  q%d' % (os.path.relpath(path(cover['to']), ROOT), kb, q))

    if not check_only:
        sheet = os.path.join(source, 'contact-sheet.jpg')
        contact_sheet(spec, made, sheet)
        print('\n%d images, %.1f MB in all. Contact sheet: %s' % (count, total_kb / 1024, os.path.relpath(sheet, ROOT)))
        if cover and count:
            subprocess.run(['node', path('tools', 'gen-asset-manifest.js')], check=False)

    if missing:
        print('\nMissing %d file(s):' % len(missing))
        for m in missing:
            print('  ' + m)
        return 1
    print('\nAll files present.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
