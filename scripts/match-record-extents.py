#!/usr/bin/env python3
"""Give DOL records an extent: the OpenStreetMap residential area their production point stands in (release 0.3.0).

    python3 -I scripts/match-record-extents.py --pbf <thailand.osm.pbf> --tabs <tabs-dir> [--out data/record-extents.json]

Needs pyosmium and shapely (pip install osmium shapely). Reads the OpenStreetMap extract (Geofabrik's Thailand file:
its replication time is the OSM base), data/records.json and data/record-points.json, and — as a check only, never
copied — the land area the DOL record page states (17_DOL_DETAILS, the research team's reading of 5,215 pages).

Areas: closed ways and multipolygons tagged landuse=residential or landuse=construction, or place=neighbourhood /
quarter, of 2,000 m² – 3 km² (the band of scripts/match-extents.py). A record's point is looked up in the smallest area
that holds it. An area becomes the extent of a record only when it is that estate's:

  name    the area carries a name and it is the record's (a name score of 0.86 or more, or one whole name of six
          letters or more holding the other, after the words every estate shares are set aside; numbers that differ —
          another phase or soi — never match)
  size    the area has no name, every record whose point it holds is one estate (one name once phases are set aside),
          those records' plots fit it (80 – 650 m² of area per plot: the 5th–90th percentile of the areas their own
          name confirms) and, where the DOL page states the land, the area is 0.2 – 4 times that land

An area named for the record may also be its extent when the point stands within 30 m outside it (the rule of
scripts/match-extents.py). A named area that does not carry the record's name (another estate's, or only the same road or district words), an
unnamed area holding records of several estates, and a point production put several estates at (a shared point of
several names) give no extent, except to a record an area's own name confirms (the smallest such area that holds the
point, even when a smaller unnamed one does). Everything else keeps no extent of its own (js/app.js then shows a paired project's, if any). Writes the
areas once, simplified within 0.5 m, with the records that take each: {meta, areas: {osm id: {tag, name, m2, rings}},
records: {record id: [osm id, how]}}.
"""
import argparse, collections, csv, datetime, difflib, hashlib, importlib.util, json, math, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAND = (2000, 3_000_000)
# m² of area per plot: the 5th–90th percentile of the areas their own name confirms (1,512 areas, 2026-11-18).
PER_PLOT = (80, 650)
DOL_RATIO = (0.2, 4.0)
STRONG = 0.86
NEAR_M = 30
PHASE = re.compile(r'(เฟส|phase|ระยะที่|โซน|zone)\s*\S*', re.I)

spec = importlib.util.spec_from_file_location('match_extents', os.path.join(ROOT, 'scripts/match-extents.py'))
mx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mx)


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def extract(pbf):
    """[(osm id, tags, m², shapely geometry)] of the residential areas of the extract, and the extract's OSM base."""
    import osmium
    import shapely.wkb
    from shapely.affinity import scale
    reader = osmium.io.Reader(pbf, osmium.osm.osm_entity_bits.NOTHING)
    base = reader.header().get('osmosis_replication_timestamp') or ''
    reader.close()
    wkb = osmium.geom.WKBFactory()
    tags_wanted = osmium.filter.TagFilter(('landuse', 'residential'), ('landuse', 'construction'), ('place', 'neighbourhood'), ('place', 'quarter'))
    fp = osmium.FileProcessor(pbf).with_locations().with_areas(tags_wanted).with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
    out = []
    for o in fp:
        if not o.is_area():
            continue
        tags = {k: o.tags.get(k) for k in ('landuse', 'place', 'name', 'name:th', 'name:en', 'residential') if o.tags.get(k)}
        if not (tags.get('landuse') in ('residential', 'construction') or tags.get('place') in ('neighbourhood', 'quarter')):
            continue
        try:
            g = shapely.wkb.loads(wkb.create_multipolygon(o), hex=True)
        except Exception:  # noqa: BLE001 — an area osmium cannot close stays out
            continue
        if g.is_empty:
            continue
        lat = (g.bounds[1] + g.bounds[3]) / 2
        m2 = scale(g, xfact=111320 * math.cos(math.radians(lat)), yfact=110574, origin=(0, 0)).area
        if BAND[0] <= m2 <= BAND[1]:
            out.append((('w' if o.from_way() else 'r') + str(o.orig_id()), tags, m2, g))
    return out, base


def base_name(name):
    return mx.norm(PHASE.sub('', name or ''))


def name_fit(area_name, names):
    """'strong' when the area's name is one of the record's names, 'conflict' when it is plainly another, else 'mid'."""
    best, holds = 0.0, False
    for name in names:
        if not name:
            continue
        if mx.numbers(area_name) and mx.numbers(name) and not (mx.numbers(name) <= mx.numbers(area_name)):
            continue  # another phase or soi
        for a in mx.variants(area_name):
            for b in mx.variants(name):
                best = max(best, difflib.SequenceMatcher(None, a, b).ratio())
        # One whole name holding the other (never one script's part alone: “JSP City @ แพรกษา” is not “แพรกษา”).
        a, b = mx.norm(area_name), mx.norm(name)
        if min(len(a), len(b)) >= 6 and (a in b or b in a):
            holds = True
    if best >= STRONG or holds:
        return 'strong'
    return 'conflict' if best < 0.6 else 'mid'


def dol_land(tabs):
    """DOL land area (m²) of the records the research team read (17_DOL_DETAILS): a check, never copied."""
    land = {}
    path = os.path.join(tabs, '17_DOL_DETAILS.csv')
    if not os.path.exists(path):
        return land
    for r in csv.DictReader(open(path, encoding='utf-8')):
        try:
            deeds = json.loads(json.loads(r['deeds_area_raw_JSON']).get('title_deed_json') or '[]')
            m2 = sum((d.get('title_deed_rai') or 0) * 1600 + (d.get('title_deed_ngan') or 0) * 400 + (d.get('title_deed_wah') or 0) * 4 for d in deeds)
        except (ValueError, TypeError, AttributeError):
            continue
        if m2 > 0:
            land[r['DOL_website_record_ID_TEXT']] = m2
    return land


def rings_of(g):
    from shapely.geometry import mapping
    g = g.simplify(0.5 / 111320, preserve_topology=True)
    geo = mapping(g)
    polys = [geo['coordinates']] if geo['type'] == 'Polygon' else list(geo['coordinates'])
    return [[[[round(x, 6), round(y, 6)] for x, y in ring] for ring in poly] for poly in polys]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pbf', required=True)
    ap.add_argument('--tabs', required=True)
    ap.add_argument('--out', default=os.path.join(ROOT, 'data/record-extents.json'))
    a = ap.parse_args()
    from shapely.geometry import Point
    from shapely.strtree import STRtree
    areas, base = extract(a.pbf)
    tree = STRtree([g for *_, g in areas])
    records = json.load(open(os.path.join(ROOT, 'data/records.json'), encoding='utf-8'))
    points = json.load(open(os.path.join(ROOT, 'data/record-points.json'), encoding='utf-8'))
    ids, names, plots = records['cols']['id'], records['cols']['name'], records['cols']['n']
    others = {int(k): [v.get('alt', ''), v.get('ext', ''), v.get('gov', '')] for k, v in (records.get('alt') or {}).items()}
    names_of = lambda i: [names[i]] + others.get(i, [])
    land = dol_land(a.tabs)

    at = collections.defaultdict(list)
    for i in range(len(ids)):
        at[(points['x'][i], points['y'][i])].append(i)
    holds = collections.defaultdict(list)          # area index -> record indexes whose point it holds (the smallest area)
    taken, why, touched = {}, collections.Counter(), set()
    area_name = lambda j: areas[j][1].get('name') or areas[j][1].get('name:th') or areas[j][1].get('name:en') or ''
    for (x, y), ix in at.items():
        p = Point(x / 1e5, y / 1e5)
        m_per_deg = 111320 * math.cos(math.radians(p.y))
        near = [(j, areas[j][3].distance(p) * m_per_deg) for j in tree.query(p.buffer(NEAR_M / m_per_deg))]
        near = [(j, d) for j, d in near if d <= NEAR_M]
        hits = sorted((j for j, d in near if d == 0), key=lambda j: areas[j][2])
        touched.update(j for j, _ in near)
        shared_point = len({base_name(names[k]) for k in ix}) > 1
        for i in ix:
            # An area that carries the record's own name wins: the smallest that holds the point, else the nearest
            # within NEAR_M (a point just outside its own estate stood in the neighbour's area, 2026-11-18: ศุภาลัย
            # เบลล่า บ้านสวน-เศรษฐกิจ, 9 m outside its own); a smaller unnamed area never wins over it.
            named = sorted(((j, d) for j, d in near if area_name(j) and name_fit(area_name(j), names_of(i)) == 'strong'),
                           key=lambda t: (t[1], areas[t[0]][2]))
            if named:
                taken[i] = (areas[named[0][0]][0], 'name'); why[('named:strong', True)] += 1
            elif hits:
                holds[hits[0]].append((i, shared_point))

    for j, rows in holds.items():
        osm, tags, m2, _ = areas[j]
        area_name_j = area_name(j)
        estates = {base_name(names[i]) for i, _ in rows}
        per_plot = m2 / max(1, sum(plots[i] or 0 for i, _ in rows))
        lands = [land.get(ids[i]) for i, _ in rows]
        fits_land = not all(lands) or DOL_RATIO[0] <= m2 / sum(lands) <= DOL_RATIO[1]
        for i, shared_point in rows:
            if area_name_j:
                # Not the record's name (a strong fit was taken above): the area is another estate's, or shares only
                # the road and district words (2026-11-18: ลัดดารมย์ ราชพฤกษ์-รัตนาธิเบศร์ held เดอะทรัสต์ ราชพฤกษ์-รัตนาธิเบศร์).
                fit = name_fit(area_name_j, names_of(i))
                ok, how, reason = False, 'size', 'named:' + fit
            else:
                ok = not shared_point and len(estates) == 1 and PER_PLOT[0] <= per_plot <= PER_PLOT[1] and fits_land
                how, reason = 'size', 'unnamed:' + ('one estate' if len(estates) == 1 else 'several estates')
            why[(reason, ok)] += 1
            if ok:
                taken[i] = (osm, how)

    used = {osm for osm, _ in taken.values()}
    by_osm = {a[0]: a for a in areas}
    out_areas = {}
    for osm in sorted(used):
        _, tags, m2, g = by_osm[osm]
        tag = f"landuse:{tags['landuse']}" if tags.get('landuse') else f"place:{tags.get('place', '')}"
        out_areas[osm] = {'tag': tag, 'name': tags.get('name') or tags.get('name:th') or '', 'm2': round(m2), 'rings': rings_of(g)}
    out_records = {ids[i]: list(v) for i, v in sorted(taken.items())}
    meta = {
        'dataset': 'CityMETER Housing Estate', 'part': 'record-extents',
        'source': 'OpenStreetMap — © OpenStreetMap contributors, ODbL-1.0 (https://www.openstreetmap.org/copyright)',
        'extract': {'file': os.path.basename(a.pbf), 'bytes': os.path.getsize(a.pbf), 'sha256': file_sha256(a.pbf), 'osmBase': base},
        'builtAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'tags': ['landuse=residential', 'landuse=construction', 'place=neighbourhood', 'place=quarter'],
        'band': list(BAND), 'perPlot': list(PER_PLOT), 'dolRatio': list(DOL_RATIO), 'strongName': STRONG,
        'counts': {'areasInBand': len(areas), 'areasWithin30mOfAPoint': len(touched), 'areas': len(out_areas), 'records': len(out_records),
                   'byName': sum(1 for v in taken.values() if v[1] == 'name'), 'bySize': sum(1 for v in taken.values() if v[1] == 'size')},
        'decisions': {f'{k[0]} → {"extent" if k[1] else "none"}': v for k, v in sorted(why.items())},
        'rules': ['the smallest residential area that holds the record’s production point (data/record-points.json)',
                  'name: the area’s name is the record’s; size: an unnamed area of one estate whose plots fit it',
                  'an approximate picture of where the estate is, never a deed, a legal boundary or a land size'],
    }
    json.dump({'meta': meta, 'areas': out_areas, 'records': out_records}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({'osmBase': base, **meta['counts']}, ensure_ascii=False))
    for k, v in meta['decisions'].items():
        print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
