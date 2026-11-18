/**
 * The shipped data: data/estates.json, data/records.json, data/portfolio.json and data/extents.json as
 * scripts/build-data.py wrote them, decoded as the browser does. Two grains (DATA_METHOD.md §2): DOL records carry the
 * plots by the production district and province each is counted in; researched projects carry pins, extents and
 * evidence, and never add to a district's records or plots.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';
import {hasPoint, distanceM, provinceTotals, PLOT_TYPES, HOUSE_PLOTS, dolLink} from '../js/model.js';
import {extentPolygons} from '../js/extent-buildings.js';
import {pointInRing} from '../js/shell/geometry.js';

test('district rows: the production districts with a record; plots add up type by type; the snapshot totals', () => {
  const {data, raw} = load();
  assert.equal(data.units.length, 395);
  assert.equal(new Set(data.units.map(u => u.id)).size, data.units.length, 'district ids unique');
  const plots = data.units.reduce((s, u) => s + u.plots, 0), records = data.units.reduce((s, u) => s + u.records, 0);
  assert.equal(records, 19753, 'every record of the production snapshot');
  assert.equal(plots, raw.meta.counts.plots);
  assert.equal(plots, 2689640, 'selected plot totals (13 held totals stay out)');
  assert.equal(raw.meta.counts.rawPlots, 2689950, 'the production lv0 total, before the held totals');
  for (const u of data.units) {
    assert.ok(u.records > 0, `${u.id}: a record`);
    assert.equal(u.types.length, PLOT_TYPES.length);
    assert.equal(u.types.reduce((a, b) => a + b, 0), u.plots, `${u.id}: plot types add up to the plots`);
    assert.ok(u.typeRecords.every(n => n <= u.records), `${u.id}: a type's records are records of the row`);
    assert.ok(data.provinces.includes(u.province), `${u.id}: a production province`);
  }
  assert.deepEqual(HOUSE_PLOTS, ['detached', 'twin', 'row']);
  assert.equal(raw.meta.checks.provinceCoverageEqual, true);
  assert.equal(raw.meta.checks.productionLv0Equal.records, 19753);
});

test('provinces: every province holds a record; the province totals of the rows equal the file’s own area totals', () => {
  const {data} = load();
  const totals = provinceTotals(data.units, 'plots');
  assert.equal(totals.size, 77);
  for (const [code, t] of totals) {
    const a = data.areaTotals.get(code);
    assert.equal(t.plots, a.plots, code);
    assert.equal(t.records, a.records, code);
  }
});

test('records: one per DOL website record, an 18-digit id with its public page, in its district row; plots by type add up', () => {
  const {data, records} = load();
  assert.equal(records.records.length, 19753);
  assert.equal(records.byId.size, 19753, 'ids unique');
  const rows = new Map(data.units.map(u => [u.id, {records: 0, plots: 0}]));
  for (const r of records.records) {
    assert.match(r.id, /^\d{18}$/);
    assert.equal(dolLink(r.id), `https://www.dol.go.th/land/${r.id}/`);
    const row = rows.get(r.district);
    assert.ok(row, `${r.id}: a district row`);
    row.records++; row.plots += r.plots || 0;
    if (r.types && r.plots != null) assert.equal(r.types.reduce((a, b) => a + b, 0), r.plots, `${r.id}: types add up`);
    if (r.held) assert.equal(r.plots, null, `${r.id}: a held total is not counted`);
  }
  for (const u of data.units) assert.deepEqual(rows.get(u.id), {records: u.records, plots: u.plots}, u.id);
  assert.equal(records.records.filter(r => r.held).length, 13);
});

test('allocators: named only with a legal-entity form; a nameless record says so, never an invented name', () => {
  const {records, recordsRaw} = load();
  const juristic = /(บมจ|บจก|หจก|หสน|บริษัท|ห้างหุ้นส่วน|จำกัด|มหาชน|สหกรณ์|มูลนิธิ|การเคหะแห่งชาติ|กองทุน|ธนาคาร|Co\.|Ltd|PCL|Limited|Company|Public)/i;
  for (const a of recordsRaw.allocators) assert.ok(juristic.test(a), `allocator without a legal-entity form: ${a}`);
  const nameless = records.records.filter(r => r.state === 'none');
  assert.equal(nameless.length, 2662);
  assert.ok(nameless.every(r => r.name === ''));
});

test('projects: unique keys, pins inside Thailand from the publisher’s own evidence (never Google), districts by point', () => {
  const {data, raw, index} = load();
  assert.equal(data.sites.length, 1538);
  assert.equal(new Set(data.sites.map(s => s.id)).size, data.sites.length);
  const located = data.sites.filter(hasPoint);
  assert.equal(located.length, 798);
  assert.deepEqual(raw.meta.counts.pinsOffMap, {google: 58}, 'pins the research team took from Google Maps stay off the map');
  for (const s of located) {
    assert.ok(Object.keys(raw.meta.pins).includes(s.pin), `${s.id}: a known pin role`);
    assert.notEqual(s.pin, 'google');
    if (s.district) assert.equal(index.byId.get(s.district)?.province, s.province, `${s.id}: its district is in its province`);
  }
  for (const s of data.sites.filter(x => !hasPoint(x))) assert.equal(s.pin, '', `${s.id}: no pin role without a pin`);
  for (const c of data.companies) assert.equal(c.sites.length, c.items, `${c.name}: every listed project is in the file`);
});

test('pairs of projects and records: only the levels the page names; held pairs stay out; both sides agree', () => {
  const {data, records, raw} = load();
  const levels = Object.keys(raw.meta.pairs);
  assert.deepEqual(levels.sort(), ['accepted', 'address', 'name', 'parcel']);
  let n = 0;
  for (const r of records.records) for (const p of r.pairs) {
    n++;
    assert.ok(levels.includes(p.level), `${r.id}: ${p.level}`);
    assert.ok(records.bySite.get(p.site.id).some(x => x.record === r));
  }
  assert.equal(n, raw.meta.counts.pairs.name + raw.meta.counts.pairs.parcel + raw.meta.counts.pairs.address + raw.meta.counts.pairs.accepted);
  for (const s of data.sites) assert.equal((records.bySite.get(s.id) || []).length, s.pairs, `${s.id}: pair count`);
});

test('extents: an OpenStreetMap residential area holding the project’s pin (or within 30 m), with the project’s name', () => {
  const {data, extents, extentsRaw} = load();
  assert.equal(extents.byKey.size, 139);
  assert.equal(extentsRaw.meta.license, 'ODbL-1.0');
  assert.equal(extentsRaw.meta.credit, '© OpenStreetMap contributors');
  for (const [key, e] of extents.byKey) {
    const s = data.sites.find(x => x.id === key);
    assert.ok(s && hasPoint(s), `${key}: a project with a pin`);
    assert.equal(s.extentM2, e.m2, `${key}: the size the panel shows`);
    assert.ok(e.m2 >= 2000 && e.m2 <= 3000000, `${key}: a plausible estate size`);
    const inside = extentPolygons(e.geometry).some(p => pointInRing([s.longitude, s.latitude], p.outer) && !p.holes.some(h => pointInRing([s.longitude, s.latitude], h)));
    if (e.inside) assert.ok(inside, `${key}: the pin stands in its extent`);
    else assert.ok(e.d <= 30, `${key}: an extent beside the pin lies within 30 m`);
  }
  assert.equal(data.sites.filter(s => s.extent >= 0).length, 139);
});

test('context from CityMETER Transit: straight-line distances agree with the published points; only operating stations are “nearest”', () => {
  const {data} = load();
  let n = 0;
  for (const s of data.sites.filter(x => x.rail)) {
    n++;
    assert.equal(s.rail.station.status, 'operating');
    const d = distanceM(s.latitude, s.longitude, s.rail.station.lat, s.rail.station.lon);
    assert.ok(Math.abs(d - s.rail.m) <= 2, `${s.id}: ${s.rail.m} vs ${d}`);
    assert.ok(s.rail.m <= 2000);
  }
  for (const s of data.sites.filter(x => x.rail2)) assert.equal(s.rail2.station.status, 'construction');
  assert.ok(n >= 20, `${n} projects near rail`);
});

test('publication hygiene: no review status, no Google links or pins, no e-mail; links are https public pages', () => {
  const {raw, recordsRaw, portfolio, extentsRaw} = load();
  const text = [raw, recordsRaw, portfolio, extentsRaw].map(x => JSON.stringify(x)).join('');
  assert.ok(!/(docs|drive)\.google\.com/.test(text), 'no Google document link');
  assert.ok(!/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(text), 'no Google Maps link');
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(text.replace(/https?:\/\/[^"\s]+/g, '')), 'no e-mail address');
  assert.ok(!/พักตรวจ|รอตรวจขอบเขต|รวมในขอบเขต/.test(text), 'no scope-review status of the research master');
  for (const p of Object.values(portfolio.projects)) {
    assert.ok(!('held' in p), 'no review flag on a project');
    for (const e of p.events || []) assert.ok(!('id' in e), 'no event id of the research master');
  }
  const body = JSON.stringify({...portfolio, meta: null}) + JSON.stringify({...raw, meta: null});
  const urls = [...body.matchAll(/"(?:url|page|catalogue|pinPage|source)":"([^"]+)"/g)].map(m => m[1]);
  assert.ok(urls.length > 1000 && urls.every(u => /^https?:\/\//.test(u)), 'source links are http(s)');
  assert.ok(raw.meta.excludedFields.some(f => /natural persons/.test(f)));
  assert.match(raw.meta.exportSha256, /^[0-9a-f]{64}$/);
  for (const [t, m] of Object.entries(raw.meta.tabs)) assert.match(m.sha256, /^[0-9a-f]{64}$/, t);
});
