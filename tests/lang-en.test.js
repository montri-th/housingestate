/**
 * English of the map chips (js/map-layers.js: the chip's title, then its verb, as its aria-label). Every province and
 * district chip of the area index must read in English with no Thai left: the live walk of 0.1.3 on citymeter.pages.dev
 * found all 77 province chips and the 47 district chips of Bangkok in window.__citymeterI18n.missing (0.1.4).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDictionary, registerNames, keepThai, translate} from '../js/shell/i18n.js';
import HOUSING_EN from '../js/lang-en.js';
import {buildAreaIndex} from '../js/areas.js';
import {readJSON} from './helpers.js';

const THAI = /[ก-ฺเ-๎]/;
const index = buildAreaIndex(readJSON('data/area-index.json'));
registerDictionary(HOUSING_EN);
// The names as js/lang.js#registerDataNames registers them from the area index.
const pairs = [], thai = [];
for (const p of index.provinces) if (p.nameEn) pairs.push([p.name, p.nameEn], [`จังหวัด${p.name}`, p.nameEn]);
for (const a of index.areas) {
  const word = `${a.province === 'BKK' ? 'เขต' : 'อำเภอ'}${a.name}`;
  if (a.nameEn) pairs.push([a.name, a.nameEn], [word, a.nameEn]); else thai.push(a.name, word);
}
registerNames(pairs);
keepThai(thai);

test('every province and district chip reads in English, both measures first', () => {
  // The one district the area index has no English for keeps its Thai name; everything else in its chip is English.
  assert.deepEqual(index.areas.filter(a => !a.nameEn).map(a => a.id), ['4029']);
  assert.equal(translate('อำเภอเวียงเก่า · 254 แปลง · 11 รายการ กดเพื่อดูเขตหรืออำเภอ'),
    'อำเภอเวียงเก่า · 254 plots · 11 records, select to view the district');
  const named = new Set(thai);
  const left = [];
  for (const p of index.provinces) {
    for (const label of [`${p.name} · 41,213 แปลง · 3,787 รายการ กดเพื่อดูจังหวัด`, `${p.name} · 1 รายการ · 1 แปลง กดเพื่อดูจังหวัด`]) {
      const en = translate(label);
      if (en == null || THAI.test(en)) left.push(label);
    }
  }
  for (const a of index.areas) {
    const word = a.province === 'BKK' ? 'เขต' : 'อำเภอ';
    for (const label of [`${word}${a.name} · 254 แปลง · 11 รายการ กดเพื่อดูเขตหรืออำเภอ`, `${word}${a.name} · 11 รายการ · 254 แปลง กดเพื่อดูเขตหรืออำเภอ`]) {
      const en = translate(label);
      if (en == null || (THAI.test(en) && !named.has(en.split(' · ')[0]))) left.push(label);
    }
  }
  assert.deepEqual(left.slice(0, 5), [], `${left.length} chip labels stay Thai`);
  assert.equal(translate('กรุงเทพมหานคร · 41,213 แปลง · 3,787 รายการ กดเพื่อดูจังหวัด'),
    'Bangkok · 41,213 plots · 3,787 records, select to view the province');
  assert.equal(translate('เขตวัฒนา · 254 แปลง · 11 รายการ กดเพื่อดูเขตหรืออำเภอ'),
    'Watthana · 254 plots · 11 records, select to view the district');
  assert.equal(translate('เขตวัฒนา · 1 รายการ · 1 แปลง กดเพื่อดูเขตหรืออำเภอ'),
    'Watthana · 1 record · 1 plot, select to view the district');
  // The panel's province rows keep their own form.
  assert.equal(translate('กรุงเทพมหานคร 3,787 รายการ กดเพื่อดูจังหวัด'), 'Bangkok, 3,787 records, select to view the province');
});
