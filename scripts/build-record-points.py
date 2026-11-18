#!/usr/bin/env python3
"""Build data/record-points.json: the point CityMETER production draws for every DOL record of data/records.json.

Reads the tiles and the manifest of scripts/fetch-record-points.py (production's estate layer, one point per record,
filtered to its district), decodes them with the small vector-tile reader below (no dependency) and writes one point
per record, in the order of data/records.json `cols.id`:

  x, y     longitude and latitude × 100,000 (integers; a tile unit at zoom 11 is about 4.8 m)
  meta     source, endpoint, zoom, read time, tile and province receipts (counts and one SHA-256 over them), the
           counts of records alone at their point and sharing it, and the largest share

Stops (nothing written) when a record has no point, a record appears in two tiles at points more than two tile units
apart, a point lies outside its production district's box in data/area-index.json, or a tile holds a record the records
file does not. The point is production's, as its layer draws it; this build never moves, merges or snaps one.

Usage: python3 -I scripts/build-record-points.py --fetched DIR [--out data/record-points.json]
"""
import argparse, collections, hashlib, json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6378137.0
HALF = math.pi * R
ENDPOINT = 'https://landometer.com/api/v2/citymeter-v3/estate/info/estate/{z}/{x}/{y}?inTileType=DISTRICT&inTileId={district uuid}'


def varint(b, i):
    shift = result = 0
    while True:
        byte = b[i]; i += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, i
        shift += 7


def fields(b):
    """(field number, wire type, value) of one protobuf message; length-delimited values as bytes."""
    i, n = 0, len(b)
    while i < n:
        key, i = varint(b, i)
        f, w = key >> 3, key & 7
        if w == 0:
            v, i = varint(b, i)
        elif w == 1:
            v, i = b[i:i + 8], i + 8
        elif w == 2:
            ln, i = varint(b, i)
            v, i = b[i:i + ln], i + ln
        elif w == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError(f'wire type {w}')
        yield f, w, v


def packed(b):
    out, i = [], 0
    while i < len(b):
        v, i = varint(b, i)
        out.append(v)
    return out


def zigzag(v):
    return (v >> 1) ^ -(v & 1)


def value(b):
    import struct
    for f, w, v in fields(b):
        if f == 1: return v.decode('utf-8')
        if f == 2: return struct.unpack('<f', v)[0]
        if f == 3: return struct.unpack('<d', v)[0]
        if f in (4, 5): return v if f == 5 or v < 2 ** 63 else v - 2 ** 64
        if f == 6: return zigzag(v)
        if f == 7: return bool(v)
    return None


def points(tile):
    """[(properties, (x, y) in tile units, extent)] of every point feature of every layer."""
    out = []
    for f, _, layer in fields(tile):
        if f != 3:
            continue
        keys, vals, feats, extent = [], [], [], 4096
        for lf, _, lv in fields(layer):
            if lf == 3: keys.append(lv.decode('utf-8'))
            elif lf == 4: vals.append(value(lv))
            elif lf == 2: feats.append(lv)
            elif lf == 5: extent = lv
        for feat in feats:
            tags, geom, gtype = [], [], 0
            for ff, _, fv in fields(feat):
                if ff == 2: tags = packed(fv)
                elif ff == 3: gtype = fv
                elif ff == 4: geom = packed(fv)
            if gtype != 1 or len(geom) < 3 or geom[0] & 7 != 1:
                continue
            props = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags) - 1, 2)}
            out.append((props, (zigzag(geom[1]), zigzag(geom[2])), extent))
    return out


def lonlat(z, x, y, px, py, extent):
    size = 2 * HALF / 2 ** z
    mx = -HALF + (x + px / extent) * size
    my = HALF - (y + py / extent) * size
    return mx / R * 180 / math.pi, math.degrees(2 * math.atan(math.exp(my / R)) - math.pi / 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetched', required=True)
    ap.add_argument('--out', default=os.path.join(ROOT, 'data/record-points.json'))
    a = ap.parse_args()
    manifest = json.load(open(os.path.join(a.fetched, 'manifest.json'), encoding='utf-8'))
    records = json.load(open(os.path.join(ROOT, 'data/records.json'), encoding='utf-8'))
    index = json.load(open(os.path.join(ROOT, 'data/area-index.json'), encoding='utf-8'))
    z = manifest['zoom']
    unit_m = 2 * HALF / 2 ** z / 4096
    ids = records['cols']['id']
    known = set(ids)
    seen = {}
    for t in sorted(manifest['tiles'], key=lambda t: (t['district'], t['x'], t['y'])):
        body = open(os.path.join(a.fetched, 'tiles', f"{t['district']}_{t['x']}_{t['y']}.mvt"), 'rb').read()
        if hashlib.sha256(body).hexdigest() != t['sha256']:
            raise SystemExit(f"STOP: {t['district']}_{t['x']}_{t['y']} differs from its receipt")
        for props, (px, py), extent in points(body):
            rid = str(props.get('dol_id'))
            if rid not in known:
                raise SystemExit(f'STOP: tile record {rid} is not in data/records.json')
            lon, lat = lonlat(z, t['x'], t['y'], px, py, extent)
            if rid in seen:
                p = seen[rid]
                d = math.hypot((p[0] - lon) * 111320 * math.cos(math.radians(lat)), (p[1] - lat) * 110574)
                if d > 2 * unit_m:
                    raise SystemExit(f'STOP: record {rid} at two points {d:.1f} m apart')
                continue
            seen[rid] = (lon, lat, t['district'])
    missing = [r for r in ids if r not in seen]
    if missing:
        raise SystemExit(f'STOP: {len(missing)} records without a point, first {missing[:3]}')
    A = index['areas']
    box = {A['id'][i]: A['bbox'][i] for i in range(len(A['id']))}
    districts = records['districts']
    x, y = [], []
    for i, rid in enumerate(ids):
        lon, lat, tile_district = seen[rid]
        district = districts[records['cols']['d'][i]]
        if tile_district != district:
            raise SystemExit(f'STOP: record {rid} came in the tiles of {tile_district}, records.json counts it in {district}')
        b = box.get(district)
        pad = 1e-4
        if b and not (b[0] - pad <= lon <= b[2] + pad and b[1] - pad <= lat <= b[3] + pad):
            raise SystemExit(f'STOP: record {rid} lies outside the box of district {district}')
        x.append(round(lon * 1e5)); y.append(round(lat * 1e5))
    at = collections.Counter(zip(x, y))
    alone = sum(1 for p in zip(x, y) if at[p] == 1)
    receipts = hashlib.sha256('\n'.join(f"{t['district']}_{t['x']}_{t['y']} {t['sha256']}" for t in
                                        sorted(manifest['tiles'], key=lambda t: (t['district'], t['x'], t['y']))).encode()).hexdigest()
    out = {
        'meta': {
            'dataset': 'CityMETER Housing Estate', 'part': 'record-points',
            'source': 'CityMETER production · estate layer (layer-estate-poi), the point production draws for each DOL record',
            'endpoint': ENDPOINT, 'zoom': z, 'unitM': round(unit_m, 2), 'readAt': manifest['readAt'],
            'receipts': {'provinces': len(manifest['provinces']), 'tiles': len(manifest['tiles']),
                         'tilesWithPoints': sum(1 for t in manifest['tiles'] if t['bytes']), 'sha256': receipts},
            'records': len(ids), 'points': len(at), 'alone': alone, 'shared': len(ids) - alone,
            'largestShare': max(at.values()), 'order': 'data/records.json cols.id',
            'idsSha256': hashlib.sha256('\n'.join(ids).encode()).hexdigest(),
            'rules': ['one point per DOL record, as production draws it; never moved, merged or snapped by this build',
                      'records at one point stay separate records; the page names every record at the point',
                      'x and y are longitude and latitude × 100,000'],
        },
        'x': x, 'y': y,
    }
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({k: out['meta'][k] for k in ('records', 'points', 'alone', 'shared', 'largestShare', 'readAt')}))


if __name__ == '__main__':
    main()
