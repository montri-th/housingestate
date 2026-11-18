/**
 * Records at their production points (data/record-points.json, js/record-points.js; 0.2.0, owner 2026-11-18: “ทำไมไม่มี
 * หมู่บ้านใน production ที่ทำไว้แล้ว มี coordinate น่าจะครบแล้ว”): one point per DOL record of data/records.json, as
 * production draws it, in the records' order; the records at one point stay separate records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {load, readJSON} from './helpers.js';
import {decodeRecordPoints, recordsAtPoint, pointCollection, pointLabel} from '../js/record-points.js';

test('one point per record, in the order of data/records.json, inside its production district', () => {
  const {recordsRaw, pointsRaw, indexJSON} = load();
  const ids = recordsRaw.cols.id;
  assert.equal(pointsRaw.meta.idsSha256, createHash('sha256').update(ids.join('\n')).digest('hex'), 'the order is that of records.json');
  assert.equal(pointsRaw.x.length, ids.length);
  assert.equal(pointsRaw.y.length, ids.length);
  const A = indexJSON.areas, box = new Map(A.id.map((id, i) => [id, A.bbox[i]]));
  for (let i = 0; i < ids.length; i++) {
    const x = pointsRaw.x[i], y = pointsRaw.y[i];
    assert.ok(Number.isInteger(x) && Number.isInteger(y), `${ids[i]}: integers`);
    const b = box.get(recordsRaw.districts[recordsRaw.cols.d[i]]);
    if (b) assert.ok(x / 1e5 >= b[0] - 2e-4 && x / 1e5 <= b[2] + 2e-4 && y / 1e5 >= b[1] - 2e-4 && y / 1e5 <= b[3] + 2e-4, `${ids[i]}: inside its district`);
  }
  // The counts the method states are those of the file.
  const at = new Map();
  for (let i = 0; i < ids.length; i++) { const k = `${pointsRaw.x[i]},${pointsRaw.y[i]}`; at.set(k, (at.get(k) || 0) + 1); }
  const alone = [...at.values()].filter(n => n === 1).length;
  assert.deepEqual([pointsRaw.meta.records, pointsRaw.meta.points, pointsRaw.meta.alone, pointsRaw.meta.shared, pointsRaw.meta.largestShare],
    [ids.length, at.size, alone, ids.length - alone, Math.max(...at.values())]);
  assert.equal(pointsRaw.meta.zoom, 11);
  assert.match(pointsRaw.meta.readAt, /^2026-11-18T/);
});

test('the decoder attaches every point, groups the records of a point in reading order and refuses another file', () => {
  const {records, points} = load();
  assert.ok(records.records.every(r => Number.isFinite(r.lon) && Number.isFinite(r.lat) && r.at), 'every record has its point');
  let total = 0;
  for (const list of points.byKey.values()) {
    total += list.length;
    for (let i = 1; i < list.length; i++) assert.ok((list[i - 1].plots ?? -1) >= (list[i].plots ?? -1), 'most plots first');
  }
  assert.equal(total, records.records.length, 'no record lost or doubled');
  const big = [...points.byKey.values()].sort((a, b) => b.length - a.length)[0];
  assert.equal(recordsAtPoint(points, big[0]).length, big.length - 1, 'the others at the point, never the record itself');
  assert.throws(() => decodeRecordPoints({x: [1], y: [1]}, records), /Invalid record points file/);
});

test('the map marks: one per point, the count of a shared point, the filters and the focus province', () => {
  const {records, points} = load();
  const all = pointCollection(points);
  assert.equal(all.features.length, points.byKey.size);
  assert.ok(all.features.every(f => f.properties.focus === 1), 'no province chosen: every point in the focus');
  const shared = all.features.find(f => f.properties.n > 1);
  assert.equal(shared.properties.label, `${shared.properties.n.toLocaleString('th-TH')} รายการ`);
  assert.equal(pointLabel(points.byKey.get(shared.properties.key), 'en'), `${shared.properties.n.toLocaleString('en-US')} records`);
  const named = all.features.find(f => f.properties.n === 1 && /^(โครงการ|หมู่บ้าน)/.test(points.byKey.get(f.properties.key)[0].name || ''));
  if (named) assert.ok(!/^(โครงการ|หมู่บ้าน)/.test(named.properties.label), 'a leading โครงการ/หมู่บ้าน dropped');
  const bkk = pointCollection(points, {focusProvince: 'BKK'});
  for (const f of bkk.features) assert.equal(f.properties.focus, points.byKey.get(f.properties.key).some(r => r.province === 'BKK') ? 1 : 0);
  // The finder and the plot type narrow the marks to the records they keep.
  const keep = new Set(records.records.filter(r => r.province === 'NBI'));
  const some = pointCollection(points, {visible: keep});
  assert.equal(some.features.reduce((n, f) => n + f.properties.n, 0), keep.size);
});
