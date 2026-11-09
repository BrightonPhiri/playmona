"""Turns a downloaded logo picture into a WebP for Logo Rush.

    python -I tools/logos/towebp.py <in> <out.webp> <max side px>

Keeps transparency, trims empty transparent edges, fits the longest side to
<max> pixels. Used by tools/logos/fetch.js. Needs Pillow.
"""
import sys
from PIL import Image


def main(src, out, size):
    im = Image.open(src)
    im.load()
    im = im.convert('RGBA')
    box = im.getchannel('A').getbbox()
    if box:
        im = im.crop(box)
    im.thumbnail((size, size), Image.LANCZOS)
    im.save(out, 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
