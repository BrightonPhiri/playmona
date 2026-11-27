#!/usr/bin/env python3
"""Writes one Mission Trail busy room into js/data/missionTrailRooms.js.

Steps for a room (Batch 3, docs/art/missionTrail-batch3-prompts.md):
  1. python tools/art/spot-diff-find.py <room> --game missionTrail --expect 12
     finds the 12 hidden things (tools/art/missionTrail-spots/<room>.json) and draws
     assets/playmona_assets/mission-trail/busy/<room>-spots.jpg with each spot numbered.
  2. Look at that picture and name the spots in number order:
     python tools/art/missiontrail-rooms.py <room> keys,umbrella,watch,...
     Each name is an objects picture id (js/missiontrail/assets.js PLANNED.objects); a - skips
     a spot that is only a stray redraw (players never see the empty picture, so it can stay).
  3. python tools/cut-art-sheets.py missionTrail cuts <room>-hidden.png into
     assets/images/games/missionTrail/rooms/<room>.webp; then node tools/gen-asset-manifest.js.

The data file holds plain JSON between its marker lines, so this rewrites it whole.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'js', 'data', 'missionTrailRooms.js')
SPOTS = os.path.join(ROOT, 'tools', 'art', 'missionTrail-spots')
START = 'FF.data.missionTrailRooms = '


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    room, names = sys.argv[1], [n.strip() for n in sys.argv[2].split(',') if n.strip()]
    spots = json.load(open(os.path.join(SPOTS, room + '.json'), encoding='utf-8'))
    if len(names) != len(spots):
        sys.exit('%s has %d spots but %d names were given' % (room, len(spots), len(names)))
    pairs = [(n, sp) for n, sp in zip(names, spots) if n != '-']
    names = [n for n, sp in pairs]
    if len(set(names)) != len(names):
        sys.exit('a name is given twice')
    bad = [n for n in names if not re.match(r'^[a-z0-9-]+$', n)]
    if bad:
        sys.exit('not picture ids: ' + ', '.join(bad))

    text = open(DATA, encoding='utf-8').read()
    at = text.index(START) + len(START)
    end = text.rindex('};') + 1
    rooms = json.loads(text[at:end])
    rooms[room] = {'objects': [{'id': n, 'b': [round(v, 3) for v in sp['b']]} for n, sp in pairs]}

    lines = ['{']
    keys = sorted(rooms)
    for i, k in enumerate(keys):
        objs = rooms[k]['objects']
        lines.append('  %s: { "objects": [' % json.dumps(k))
        for j, o in enumerate(objs):
            lines.append('    %s%s' % (json.dumps(o, separators=(', ', ': ')), ',' if j < len(objs) - 1 else ''))
        lines.append('  ] }%s' % (',' if i < len(keys) - 1 else ''))
    lines.append('}')
    open(DATA, 'w', encoding='utf-8', newline='\n').write(text[:at] + '\n'.join(lines) + text[end:])
    print('%s: %d things written to %s' % (room, len(names), os.path.relpath(DATA, ROOT)))


if __name__ == '__main__':
    main()
