/**
 * Records' own extents (data/record-extents.json, scripts/match-record-extents.py; 0.3.0, owner 2026-11-18: “ไม่เห็น จะ
 * spatial join กับขอบเขต campus ของแต่ละหมู่บ้านจัดสรร ซึ่งต้อง highlight อาคาร 3d building mass ทุกอาคารภายในขอบเขตนั้น”):
 * the OpenStreetMap residential area that holds a record's production point (or lies within 30 m of it) and carries its
 * name, or an unnamed area of its one estate whose plots fit it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';

const inRing = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Metres from a point to a multipolygon (0 inside an outer ring and outside its holes). */
function metresTo(rings, lon, lat) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
  if (rings.some(poly => inRing(lon, lat, poly[0]) && !poly.slice(1).some(h => inRing(lon, lat, h)))) return 0;
  let best = Infinity;
  for (const poly of rings) for (const ring of poly) for (let k = 0; k < ring.length - 1; k++) {
    const ax = (ring[k][0] - lon) * kx, ay = (ring[k][1] - lat) * ky, bx = (ring[k + 1][0] - lon) * kx, by = (ring[k + 1][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

test('the file: OpenStreetMap credited, dated and hashed; every area in the band, closed; counts as stated', () => {
  const {recordExtentsRaw: raw} = load();
  const m = raw.meta;
  assert.match(m.source, /© OpenStreetMap contributors, ODbL-1\.0/);
  assert.match(m.extract.sha256, /^[0-9a-f]{64}$/);
  assert.equal(m.extract.osmBase, '2026-11-12T21:23:05Z');
  assert.deepEqual(m.band, [2000, 3000000]);
  const areas = Object.entries(raw.areas), records = Object.entries(raw.records);
  assert.equal(m.counts.areas, areas.length);
  assert.equal(m.counts.records, records.length);
  assert.equal(m.counts.byName + m.counts.bySize, records.length);
  for (const [osm, a] of areas) {
    assert.match(osm, /^[wr]\d+$/);
    assert.ok(a.m2 >= 2000 && a.m2 <= 3000000, `${osm}: in the band`);
    for (const poly of a.rings) for (const ring of poly) assert.deepEqual(ring[0], ring[ring.length - 1], `${osm}: closed`);
  }
  const used = new Set(records.map(([, v]) => v[0]));
  assert.deepEqual([...used].sort(), areas.map(([k]) => k).sort(), 'every area is some record’s and every record’s area is in the file');
});

test('a record takes the area its production point stands in, or one named for it within 30 m', () => {
  const {recordExtentsRaw: raw, records} = load();
  const byId = records.byId;
  let outside = 0;
  for (const [id, [osm, how]] of Object.entries(raw.records)) {
    const r = byId.get(id);
    assert.ok(r, `${id}: a record of data/records.json`);
    assert.ok(['name', 'size'].includes(how));
    const d = metresTo(raw.areas[osm].rings, r.lon, r.lat);
    // The geometry is simplified within 0.5 m and the points are tile units of about 4.8 m.
    assert.ok(d <= (how === 'name' ? 31 : 3), `${id}: ${d.toFixed(1)} m from ${osm} (${how})`);
    if (d > 0) outside++;
  }
  assert.ok(outside < Object.keys(raw.records).length / 5, 'most points stand inside their area');
});

test('decoded once per area; where a paired project has an extent of its own, the record takes the same area', () => {
  const {recordExtents, recordExtentsRaw: raw, records, extents} = load();
  assert.equal(recordExtents.byRecord.size, Object.keys(raw.records).length);
  const shared = Object.values(raw.records).map(v => v[0]).find((osm, i, all) => all.indexOf(osm) !== i);
  const two = [...recordExtents.byRecord.values()].filter(e => e.osm === shared);
  assert.ok(two.length >= 2 && two[0].geometry === two[1].geometry, 'records of one area share its geometry');
  let both = 0;
  for (const r of records.records) for (const {site} of r.pairs) {
    const own = recordExtents.byRecord.get(r.id), theirs = site.extent >= 0 ? extents.byKey.get(site.id) : null;
    if (own && theirs) { both++; assert.equal(own.osm, theirs.osm, `${r.id} and ${site.id}`); }
  }
  assert.ok(both >= 40, `${both} pairs where both have an extent`);
});
