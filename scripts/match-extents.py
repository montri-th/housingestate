#!/usr/bin/env python3
"""Pair the researched project pins with OpenStreetMap residential areas by place and name (skill osm-area-site-join).

    python3 -I scripts/match-extents.py <venues.csv> <pairs.txt> --sha <hex> [--out match.json]

venues.csv  venue_id,name,name_en,lon,lat — the drawn reference pins of data/estates.json, in the order the browser
            numbered them (osm_match.py venues)
pairs.txt   the pairs the browser found (osm_fetch.js: every OSM area that holds a pin or lies within 60 m of it), its
            SHA-256 checked against the browser's before anything is read

An area becomes a project's extent only when its name is the project's name (after the words every estate shares are
set aside: หมู่บ้าน, โครงการ, village, the …) and the pin stands in it, or within 30 m of its outline when the name is
the same. An area holding pins of other projects with other names stays out, and so does an area outside 2,000 m² –
3 km². Two entries of one project (the same name twice in the publisher's list) may share an area. Everything else
stays a pin. Writes match.json: {venue_id: {osm, score, inside, d, area, names}} and prints what it decided.
"""
import csv, difflib, hashlib, json, re, sys, unicodedata

THAI = re.compile('[฀-๿]')
GENERIC_TH = ['หมู่บ้านจัดสรร', 'หมู่บ้าน', 'โครงการ', 'เดอะ', 'ดิ ', 'บ้าน ']
GENERIC_EN = {'the', 'village', 'by', 'project', 'moo', 'baan', 'ban', 'home', 'homes', 'housing', 'estate'}
BAND = (2000, 3_000_000)


def args_of(a, k, d=None):
    return a[a.index(k) + 1] if k in a else d


THAI_DIGITS = str.maketrans('๐๑๒๓๔๕๖๗๘๙', '0123456789')
ROMAN = {'ii': '2', 'iii': '3', 'iv': '4', 'v': '5'}


def numbers(s):
    """The numbers a name carries (phase, soi, km): Thai digits read as digits, II–V as numbers."""
    s = unicodedata.normalize('NFKC', s or '').lower().translate(THAI_DIGITS)
    out = set(re.findall(r'\d+', s))
    out |= {ROMAN[w] for w in re.split(r'[^a-z]+', s) if w in ROMAN}
    return out


def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower().translate(THAI_DIGITS).replace('​', '')
    s = s.replace('ํา', 'ำ')
    words = re.split(r'[\s\-–—_.,()/@+&\'"!:;|]+', s)
    words = [w for w in words if w and w not in GENERIC_EN]
    s = ' '.join(words)
    for g in GENERIC_TH:
        s = s.replace(g.strip(), '')
    return re.sub(r'\s+', '', s)


def variants(name):
    out = {norm(name)}
    th = ''.join(ch if THAI.match(ch) or ch.isdigit() or ch == ' ' else ' ' for ch in name)
    la = ''.join(ch if not THAI.match(ch) else ' ' for ch in name)
    if len(norm(th)) >= 4:
        out.add(norm(th))
    if len(re.sub(r'[^a-z]', '', la.lower())) >= 4:
        out.add(norm(la))
    return {v for v in out if v}


def score(a_names, b_names):
    best = 0.0
    for a in a_names:
        for b in b_names:
            if not a or not b:
                continue
            r = 1.0 if a == b else difflib.SequenceMatcher(None, a, b).ratio()
            best = max(best, r)
    return round(best, 3)


def main(a):
    venues_path, pairs_path = a[0], a[1]
    sha = args_of(a, '--sha')
    out = args_of(a, '--out', 'match.json')
    text = open(pairs_path, encoding='utf-8').read().rstrip('\n')
    got = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if sha and got != sha:
        sys.exit(f'STOP: sha256 {got} differs from the browser ({sha})')
    lines = text.split('\n')
    meta = dict(kv.split(':', 1) for kv in lines[0].split('|')[1:])
    venues = list(csv.DictReader(open(venues_path, encoding='utf-8')))
    cands = {}
    for l in lines[1:]:
        f = l.split('|')
        vi, pid, inside, d, area, isb, np_, tag = int(f[0]), f[1], f[2] == '1', int(f[3]), int(f[4]), f[5] == '1', int(f[6]), f[7]
        names = [x for x in f[8:11] if x]
        if isb or not names:
            continue
        v = venues[vi]
        s = score(variants(v['name']), {n for nm in names for n in variants(nm)})
        if s < 1.0 and not any(numbers(v['name']) == numbers(nm) for nm in names):
            s = min(s, 0.5)          # another phase or another soi: never the same area by name alone
        cands.setdefault(vi, []).append({'osm': pid, 'inside': inside, 'd': d, 'area': area, 'np': np_, 'tag': tag,
                                         'names': names, 'score': s})
    chosen = {}
    for vi, cs in cands.items():
        ok = [c for c in cs if BAND[0] <= c['area'] <= BAND[1] and (
            (c['inside'] and c['score'] >= 0.86) or (not c['inside'] and c['d'] <= 30 and c['score'] >= 0.96))]
        if not ok:
            continue
        best = max(ok, key=lambda c: (c['score'], c['inside'], -c['d']))
        chosen[vi] = best
    # an area claimed by several pins: kept only for the pins whose name is the area's name as well as the best one
    by_osm = {}
    for vi, c in chosen.items():
        by_osm.setdefault(c['osm'], []).append(vi)
    result, dropped = {}, []
    for pid, vis in by_osm.items():
        top = max(chosen[v]['score'] for v in vis)
        keep = [v for v in vis if chosen[v]['score'] >= max(0.9, top - 0.02)]
        if len(vis) > 1 and len(keep) > 1:
            names = {norm(venues[v]['name']) for v in keep}
            if len(names) > 1 and top < 1.0:
                keep = [max(keep, key=lambda v: chosen[v]['score'])]
        for v in vis:
            if v in keep:
                c = chosen[v]
                result[venues[v]['venue_id']] = {'osm': pid, 'score': c['score'], 'inside': c['inside'], 'd': c['d'],
                                                 'area': c['area'], 'tag': c['tag'], 'names': c['names'], 'venue': venues[v]['name']}
            else:
                dropped.append((venues[v]['name'], pid, chosen[v]['score']))
    json.dump({'meta': {**meta, 'pairs_sha256': got, 'venues': len(venues)}, 'extents': result},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'venues': len(venues), 'withCandidates': len(cands), 'extents': len(result),
                      'areas': len({r['osm'] for r in result.values()}), 'dropped': len(dropped)}, ensure_ascii=False))
    for k, r in sorted(result.items(), key=lambda kv: kv[1]['score']):
        if r['score'] < 0.97 or not r['inside']:
            print(f"{r['score']:.2f} {'in ' if r['inside'] else f'{r[chr(100)]}m'} {r['venue'][:38]:38} ~ {' / '.join(r['names'])[:70]}")
    for d in dropped:
        print('dropped', d)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1:])
