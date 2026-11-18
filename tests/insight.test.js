/**
 * The Aha (js/area-insight.js) and the province frames (js/provinces.js). Snapshot numbers here are fixtures of the
 * shipped data (the CityMETER production snapshot the research master read on 2026-11-18), never UI constants: the
 * page computes them from the data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';
import {summarizeInsight, topWithoutTie} from '../js/area-insight.js';
import {buildProvinceModel} from '../js/provinces.js';
import {provinces, filterUnits} from '../js/model.js';
import {RAMP_STEPS} from '../js/scales.js';

test('first Aha (snapshot fixture, plots): Bangkok, Pathum Thani and Chon Buri hold 46% of the allocated plots', () => {
  const {data} = load();
  const i = summarizeInsight(data.units, {metric: 'plots', provinces: provinces()});
  assert.equal(i.mode, 'national');
  assert.deepEqual(i.ids, ['BKK', 'PTE', 'CBI']);
  assert.deepEqual(i.items.map(p => p.value), [539167, 379282, 318375]);
  assert.equal(i.total, 2689640, 'the selected plot totals of the 19,753 records (the 13 held totals stay out)');
  assert.equal(Math.round((i.value / i.total) * 100), 46);
  // The same provinces among house plots only (บ้านเดี่ยว · บ้านแฝด · บ้านแถว): the second bar names its base.
  assert.deepEqual(i.comparison, {value: 1101249, total: 2335133, kind: 'house'});
  assert.equal(i.zero.length, 0, 'every province holds a record of the snapshot');
});

test('the records measure counts DOL records; it has no house-plot comparison', () => {
  const {data} = load();
  const i = summarizeInsight(data.units, {metric: 'records', provinces: provinces()});
  assert.deepEqual(i.ids, ['BKK', 'CBI', 'PTE']);
  assert.equal(i.total, 19753);
  assert.equal(i.comparison, null);
});

test('a province Aha names up to three production districts, with the province total and the national total', () => {
  const {data} = load();
  const i = summarizeInsight(data.units, {metric: 'plots', province: 'CMI', provinces: provinces()});
  assert.equal(i.mode, 'province');
  assert.deepEqual(i.items.map(x => x.name), ['เมืองเชียงใหม่', 'สันทราย', 'สันกำแพง']);
  assert.equal(i.total, 104635);
  assert.equal(i.total, data.units.filter(u => u.province === 'CMI').reduce((s, u) => s + u.plots, 0));
  assert.ok(i.value <= i.total && i.nationalTotal === 2689640);
});

test('the focus never cuts through a tie, never takes every item that holds the measure; one item alone is its own finding', () => {
  const v = values => values.map((value, k) => ({id: `x${k}`, value}));
  assert.deepEqual(topWithoutTie(v([9, 8, 7, 6])).map(x => x.value), [9, 8, 7]);
  assert.deepEqual(topWithoutTie(v([9, 8, 7, 7])).map(x => x.value), [9, 8], 'a tie at the cut → fewer');
  assert.deepEqual(topWithoutTie(v([5, 5])).map(x => x.value), [], 'every item tied → none');
  assert.deepEqual(topWithoutTie(v([9, 8, 7])).map(x => x.value), [9, 8], 'never every item that holds the measure');
  assert.deepEqual(topWithoutTie(v([4])).map(x => x.value), [4]);
});

test('the Aha follows the plot type: the measure narrows to that type and the provinces without it are named', () => {
  const {data} = load();
  const commercial = filterUnits(data.units, {type: 'commercial'});
  const i = summarizeInsight(commercial, {metric: 'plots', provinces: provinces(), type: 'commercial'});
  assert.deepEqual(i.ids, ['PTE', 'BKK', 'CBI']);
  assert.equal(i.total, 142094);
  assert.equal(i.zero.length, 4, 'provinces with no shophouse plot in the snapshot');
  assert.equal(i.comparison, null, 'a plot-type filter is already a narrower base');
  // A row keeps only its records that report the type; every row's records report it.
  assert.ok(commercial.every(u => u.records > 0 && u.plots === u.base.types[3]));
  const none = summarizeInsight([], {metric: 'plots', provinces: provinces()});
  assert.equal(none.items.length, 0);
  assert.equal(none.zero.length, 77);
});

test('province frames: EVID-05 — a province with no record is a measured zero, every frame takes one of the 41 LDS samples', () => {
  const {data, provincesGeo} = load();
  const m = buildProvinceModel(data.units, provincesGeo, {metric: 'plots'});
  assert.equal(m.provinces.length, 77);
  assert.equal(m.zeroCount, 0);
  assert.equal(m.ramp.scaleId, 'li.supply');
  assert.equal(RAMP_STEPS, 41);
  for (const p of m.provinces) assert.ok(m.ramp.lut.includes(p.fill), `${p.code}: an LDS sample`);
  const top = m.provinces.reduce((a, b) => (b.value > a.value ? b : a));
  assert.equal(top.code, 'BKK');
  assert.equal(top.fill, m.ramp.lut[40], 'the highest value closes the ramp');
  assert.equal(buildProvinceModel(data.units, provincesGeo, {metric: 'records'}).ramp.scaleId, 'count');
  const land = buildProvinceModel(filterUnits(data.units, {type: 'land'}), provincesGeo, {metric: 'plots'});
  assert.equal(land.zeroCount, 5);
  for (const p of land.provinces) if (p.value === 0) assert.equal(p.state, 'measured_zero', p.code);
});
