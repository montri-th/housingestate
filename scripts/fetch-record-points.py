#!/usr/bin/env python3
"""Fetch the point CityMETER production draws for every DOL record (its estate layer), with a receipt per tile.

Production's estate layer serves its records as Mapbox vector tiles (layer `layer-estate-poi`, one point per record,
properties dol_id and the plot totals), filtered to one district:

  https://landometer.com/api/v2/citymeter-v3/base/info/lv1/{province uuid}         districts: uuid, code, extent (3857)
  https://landometer.com/api/v2/citymeter-v3/estate/info/estate/{z}/{x}/{y}?inTileType=DISTRICT&inTileId={uuid}

Every district of data/records.json is read at --zoom (default 11: a tile unit is about 4.8 m) over every tile its
production extent touches. Each body is written unchanged to DIR/tiles/{district code}_{x}_{y}.mvt and listed in
DIR/manifest.json = {zoom, readAt, provinces: {uuid: {url, sha256}}, tiles: [{district, uuid, x, y, url, status, bytes,
sha256}]}. scripts/build-record-points.py reads them. The bodies stay in the build directory (production data,
re-readable from the same public endpoints); only the points and the receipt totals are published.

Usage: python3 -I scripts/fetch-record-points.py --out DIR [--zoom 11] [--workers 4]
"""
import argparse, concurrent.futures, datetime, hashlib, json, math, os, time, urllib.request

API = 'https://landometer.com/api/v2/citymeter-v3/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6378137.0
HALF = math.pi * R


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'CityMETER-HousingEstate-build/1.0'})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.status, r.read()
        except Exception:  # noqa: BLE001 — retried, then raised
            if attempt == 3:
                raise
            time.sleep(2 + attempt * 3)


def tiles_over(extent, z):
    """Tiles at zoom z that an EPSG:3857 extent [minx, miny, maxx, maxy] touches."""
    size = 2 * HALF / 2 ** z
    x0, x1 = int((extent[0] + HALF) // size), int((extent[2] + HALF) // size)
    y0, y1 = int((HALF - extent[3]) // size), int((HALF - extent[1]) // size)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--zoom', type=int, default=11)
    ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'tiles'), exist_ok=True)
    records = json.load(open(os.path.join(ROOT, 'data/records.json'), encoding='utf-8'))
    index = json.load(open(os.path.join(ROOT, 'data/area-index.json'), encoding='utf-8'))
    wanted = set(records['districts'])
    read_at = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    provinces, districts = {}, {}
    for p in index['provinces']:
        url = f"{API}base/info/lv1/{p['uuid']}"
        status, body = get(url)
        if status != 200:
            raise SystemExit(f'STOP: {url} answered {status}')
        provinces[p['uuid']] = {'url': url, 'sha256': hashlib.sha256(body).hexdigest()}
        for d in json.loads(body)['value']['districtInfos']:
            if d['code'] in wanted:
                districts[d['code']] = d
    missing = sorted(wanted - set(districts))
    if missing:
        raise SystemExit(f'STOP: no production district for {missing[:5]}')

    jobs = [(code, d['id'], x, y) for code, d in sorted(districts.items()) for x, y in tiles_over(d['extent'], a.zoom)]

    def fetch(job):
        code, uuid, x, y = job
        url = f'{API}estate/info/estate/{a.zoom}/{x}/{y}?inTileType=DISTRICT&inTileId={uuid}'
        status, body = get(url)
        with open(os.path.join(a.out, 'tiles', f'{code}_{x}_{y}.mvt'), 'wb') as fh:
            fh.write(body)
        return {'district': code, 'uuid': uuid, 'x': x, 'y': y, 'url': url, 'status': status, 'bytes': len(body),
                'sha256': hashlib.sha256(body).hexdigest()}

    with concurrent.futures.ThreadPoolExecutor(a.workers) as ex:
        tiles = list(ex.map(fetch, jobs))
    bad = [t for t in tiles if t['status'] != 200]
    if bad:
        raise SystemExit(f'STOP: {len(bad)} tiles did not answer 200, first {bad[0]["url"]}')
    manifest = {'zoom': a.zoom, 'readAt': read_at, 'provinces': provinces, 'tiles': tiles}
    json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'districts': len(districts), 'tiles': len(tiles), 'withPoints': sum(1 for t in tiles if t['bytes']),
                      'readAt': read_at}))


if __name__ == '__main__':
    main()
