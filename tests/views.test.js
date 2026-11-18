/**
 * Panel views (js/panel.js) on the shipped data: one provenance line per view, no caveat on screen, a project's records
 * always named as records (never the project's size), labels and prices as the source showed them, the breadcrumb of
 * production, the Google actions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';
import {renderOverview, renderSite, renderCompany, renderDistrict, renderRecord, renderStation, renderBuilding, renderFilterChips, searchBlock, pct,
  thaiPeriod} from '../js/panel.js';
import {buildOverview, buildSiteDetail, buildCompanyProfile, buildDistrictProfile, buildRecordProfile, buildStationProfile, buildBuildingProfile,
  buildSearch} from '../js/profile-model.js';
import {summarizeInsight} from '../js/area-insight.js';
import {buildBreadcrumb, renderBreadcrumb, DATASET} from '../js/breadcrumb.js';
import {contextActions} from '../js/ask.js';
import {renderInsightChart} from '../js/charts.js';
import {unitWords, provinces, provinceByCode, siteOrder, recordOrder, hasPoint, productionLink, filterSites} from '../js/model.js';
import {GROUP_SERIES, CUES} from '../js/cues.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const nameOf = c => provinceByCode(c)?.th || c;

function views() {
  const {data, index, records, portfolio, extents} = load();
  const ctx = {meta: data.meta, portfolioMeta: portfolio.meta, unit: unitWords('plots'), index, osmDate: '2026-11-10'};
  const out = {};
  const national = buildOverview(data.units, data.sites, {houseTypes: data.types, allUnits: data.units, nameOf, stations: data.stations});
  out.overview = renderOverview({insight: summarizeInsight(data.units, {provinces: provinces(), nameOf}), overview: national, ctx});
  const cmiUnits = data.units.filter(u => u.province === 'CMI'), cmiSites = data.sites.filter(s => s.province === 'CMI');
  out.province = renderOverview({insight: summarizeInsight(data.units, {province: 'CMI', provinces: provinces(), nameOf}),
    overview: buildOverview(cmiUnits, cmiSites, {province: 'CMI', houseTypes: data.types, allUnits: data.units, nameOf, stations: data.stations}), ctx});
  const paired = data.sites.find(s => s.pairs > 0 && s.extent >= 0 && s.legal > 0);
  out.site = renderSite(buildSiteDetail(paired, {data, portfolio, records, extent: extents.byKey.get(paired.id)}), ctx);
  out.siteLoading = renderSite(buildSiteDetail(paired, {data, portfolio: null, records: null}), ctx);
  const plain = data.sites.find(s => !hasPoint(s) && !s.pairs);
  out.siteNoPin = renderSite(buildSiteDetail(plain, {data, portfolio, records}), ctx);
  out.company = renderCompany(buildCompanyProfile(paired.company, {portfolio, houseTypes: data.types}), ctx);
  const district = data.units.find(u => u.id === '1012');
  out.district = renderDistrict(buildDistrictProfile(district, {data, records}), ctx);
  out.districtLoading = renderDistrict(buildDistrictProfile(district, {data, records: null}), ctx);
  const record = records.records.find(r => r.pairs.length && r.name);
  out.record = renderRecord(buildRecordProfile(record, {data}), ctx);
  const nameless = records.records.find(r => !r.name && !r.gov && r.plots != null);
  out.recordNameless = renderRecord(buildRecordProfile(nameless, {data}), ctx);
  const held = records.records.find(r => r.held);
  out.recordHeld = renderRecord(buildRecordProfile(held, {data}), ctx);
  const near = data.sites.find(s => s.rail);
  out.station = renderStation(buildStationProfile(near.rail.station, {sites: data.sites}), ctx);
  out.building = renderBuilding(buildBuildingProfile({key: 'osm:1', kind: 'osm', height: 9, site: paired}), ctx);
  return {out, data, paired, plain, district, record, nameless, held, records, ctx, index};
}

test('every panel view ends with one provenance line — dataset · source · date · boundary, then the method — and carries no caveat on screen', () => {
  const {out} = views();
  const caveat = /ข้อจำกัด|ข้อควรระวัง|โปรดทราบ|อาจไม่|ไม่รับประกัน|ประมาณการ|caveat/i;
  for (const [name, html] of Object.entries(out)) {
    assert.equal((html.match(/class="hint panel-foot provenance"/g) || []).length, 1, `${name}: one provenance line`);
    const t = text(html.slice(html.indexOf('panel-foot provenance')));
    assert.ok(/ชุดข้อมูล\s*CityMETER Housing Estate/.test(t), `${name}: dataset`);
    assert.ok(/แหล่ง\s*จาก \S/.test(t), `${name}: source`);
    assert.ok(/ตรวจ \d{1,2} \S+ 25\d\d/.test(t), `${name}: date`);
    assert.ok(/ขอบเขต \S/.test(t), `${name}: boundary`);
    assert.ok(/วิธีนับ/.test(t), `${name}: method`);
    assert.ok(!caveat.test(text(html)), `${name}: no caveat on screen — ${(text(html).match(new RegExp(`.{0,40}(${caveat.source}).{0,40}`)) || [''])[0]}`);
    assert.ok(!/ส่วนแบ่งตลาด|ยอดขาย|ขายดี|อัตราการขาย|อุปสงค์|ความต้องการซื้อ|หมู่บ้านทั้งหมด|จำนวนหมู่บ้าน|บ้านที่สร้างเสร็จ/.test(text(html)), `${name}: no claim the data cannot carry`);
  }
});

test('first screen: the Aha with numerator and denominator, the house-plot comparison as two bars with both bases', () => {
  const {out} = views();
  const t = text(out.overview);
  assert.match(t, /46% ของแปลงจัดสรรทั้งประเทศ อยู่ใน 3 จังหวัดนี้/);
  assert.match(t, /กรุงเทพมหานคร · ปทุมธานี · ชลบุรี/);
  assert.match(t, /1,236,824 จาก 2,689,640 แปลง/);
  assert.match(out.overview, /title="1,101,249 จาก 2,335,133 แปลง บ้านเดี่ยว บ้านแฝด และบ้านแถว ในจังหวัดเหล่านี้"/);
  assert.match(t, /เฉพาะแปลงบ้าน \(บ้านเดี่ยว · บ้านแฝด · บ้านแถว\)/);
  assert.match(t, /2,689,640 แปลงจัดสรร/);
  assert.match(t, /19,753 รายการ/);
  assert.ok(!/ไม่มีรายการ \d+ จังหวัด/.test(t), 'every province holds a record: no zero line');
});

test('a province: its districts with the most of the measure, its national rank and share, its projects on the map', () => {
  const {out} = views();
  const t = text(out.province);
  assert.match(t, /66% ของแปลงจัดสรรในเชียงใหม่ อยู่ใน 3 อำเภอนี้/);
  assert.match(t, /อำเภอเมืองเชียงใหม่ · อำเภอสันทราย · อำเภอสันกำแพง/);
  assert.match(t, /อันดับ 8 จาก 77 จังหวัดที่มีรายการ/);
  assert.match(t, /4% ของประเทศ/);
  assert.match(t, /อำเภอที่มีแปลงจัดสรรมากที่สุด/);
  assert.match(t, /โครงการในจังหวัดนี้ 94 โครงการ/);
});

test('a project: its records named as records with how each pair was found, its extent in rai, evidence verbatim; no figure of its own', () => {
  const {out, paired, ctx} = views();
  const t = text(out.site);
  assert.match(t, /รายการจัดสรรที่จับคู่/);
  assert.match(t, new RegExp(`กรอบราว [\\d,.]+ ไร่`));
  assert.ok(Object.values(ctx.meta.pairs).some(w => t.includes(w.th)), 'the pair level in words');
  assert.match(t, /นิติบุคคลตามหลักฐาน/);
  assert.ok(!/แปลงจัดสรร \d|\d+ แปลงจัดสรร/.test(t.slice(0, t.indexOf('รายการจัดสรรที่จับคู่'))), 'the project carries no plots of its own');
  assert.match(out.siteLoading, /กำลังโหลดรายการจัดสรร/);
  assert.match(out.siteLoading, /กำลังโหลดหลักฐานของโครงการ/);
  assert.match(text(out.siteNoPin), /ไม่มีจุดบนแผนที่/);
  assert.ok(!/Street View/.test(out.siteNoPin), 'no point, no Street View');
  assert.match(out.site, new RegExp(`data-action="select-company" data-id="${paired.company.id}"`));
});

test('a district: plots by type, its rank and share in the province, its records most plots first and its projects; a production link', () => {
  const {out, records} = views();
  const t = text(out.district);
  assert.match(t, /เขตยานนาวา/);
  assert.match(t, /2,411 แปลงจัดสรร/);
  assert.match(t, /อันดับ 30 จาก 47 เขตที่มีรายการในจังหวัด/);
  assert.match(out.district, /href="https:\/\/landometer\.com\/v3\/citymeter\/BKK\/D\/1012\?d=estate"/);
  const list = [...records.byDistrict.get('1012')].sort(recordOrder);
  assert.equal(list.length, 41);
  assert.match(out.district, new RegExp(`data-action="select-record" data-id="${list[0].id}"`));
  assert.match(out.districtLoading, /กำลังโหลดรายการจัดสรร/);
});

test('a DOL record: plots by type, scope in words, the DOL page; a nameless record says so; a held total is not counted', () => {
  const {out, record, nameless} = views();
  assert.match(out.record, new RegExp(`href="https://www\\.dol\\.go\\.th/land/${record.id}/"`));
  assert.match(text(out.record), /โครงการที่จับคู่/);
  assert.match(text(out.recordNameless), /ไม่มีชื่อโครงการในระเบียน/);
  assert.ok(nameless.plots != null);
  assert.match(text(out.recordHeld), /ไม่นับ แปลง/);
  assert.ok(!/รหัสหน้าเว็บ\s*$/.test(text(out.record)));
});

test('developer, station and building panels', () => {
  const {out, paired} = views();
  assert.match(text(out.company), new RegExp(`${paired.company.items.toLocaleString('en-US')} โครงการ`));
  assert.match(text(out.company), /บัญชีโครงการบนเว็บ/);
  assert.match(text(out.station), /สถานี\S+/);
  assert.match(text(out.station), /รัศมี 1 กม\. จากสถานี/);
  assert.match(text(out.building), /อาคารในกรอบโครงการ/);
  assert.match(text(out.building), /สูงราว 9 ม\./);
});

test('breadcrumb follows production: ประเทศไทย › จังหวัด › เขต/อำเภอ › the project (no production link on the project)', () => {
  const {paired, index} = views();
  assert.equal(DATASET, 'estate', 'the estate layer of CityMETER production');
  const area = index.byId.get(paired.district);
  const crumbs = buildBreadcrumb({province: paired.province, area: {id: area.id, name: area.name, province: area.province}, site: {id: paired.id, name: paired.name, province: paired.province}});
  assert.deepEqual(crumbs.map(c => c.level), ['country', 'province', 'area', 'site']);
  assert.equal(crumbs[1].href, `https://landometer.com/v3/citymeter/${paired.province}?d=estate`);
  assert.equal(crumbs[2].href, `https://landometer.com/v3/citymeter/${paired.province}/D/${area.id}?d=estate`);
  assert.equal(crumbs[3].href, undefined);
  assert.match(renderBreadcrumb(crumbs), new RegExp(`aria-current="location">${paired.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  assert.equal(productionLink({province: 'CMI'}), 'https://landometer.com/v3/citymeter/CMI?d=estate');
});

test('house types bind to LDS series by stable id with the series shape cue; no star (it would read as a rating)', () => {
  const {data} = views();
  assert.equal(data.types.length, 7);
  for (const t of data.types) {
    assert.equal(t.series, GROUP_SERIES[t.id], t.id);
    assert.notEqual(CUES[t.series - 1], 'star', t.id);
  }
  assert.equal(new Set(data.types.map(t => t.series)).size, 7, 'one series per type');
});

test('lists: projects on the map first, an extent first, then name — deterministic; records most plots first', () => {
  const {data, records} = views();
  const list = [...data.sites].sort(siteOrder);
  for (let i = 1; i < list.length; i++) assert.ok(hasPoint(list[i - 1]) >= hasPoint(list[i]));
  const recs = [...records.records].sort(recordOrder);
  for (let i = 1; i < recs.length; i++) assert.ok((recs[i - 1].plots ?? -1) >= (recs[i].plots ?? -1));
});

test('the search is a finder: projects, developers, districts and records it names, never the measure', () => {
  const {data, records, index} = views();
  const r = buildSearch('พฤกษา', {data, records, index, provinces: provinces()});
  assert.ok(r.siteCount > 0 && r.recordCount > 0 && r.companyCount > 0);
  assert.match(searchBlock(r), /ผลค้นหา “พฤกษา”/);
  assert.equal(filterSites(data.sites, {search: 'พฤกษา'}).length, r.siteCount);
  const loading = buildSearch('พฤกษา', {data, records: null, index, provinces: provinces()});
  assert.match(searchBlock(loading), /กำลังโหลดรายการจัดสรรเพื่อค้นหา/);
  assert.match(searchBlock(buildSearch('zzzz-ไม่มี', {data, records, index, provinces: provinces()})), /ล้างคำค้นหา/);
});

test('Google actions: public names and points only, https, the question of the view; Street View only with a point', () => {
  const {paired} = views();
  const site = contextActions({kind: 'site', site: paired, area: {place: 'เขตประเวศ', province: 'กรุงเทพมหานคร'}, point: {lat: paired.latitude, lon: paired.longitude}}, 'th');
  assert.deepEqual(site.map(a => a.id), ['ai', 'maps', 'streetview']);
  for (const a of site) assert.match(a.href, /^https:\/\/www\.google\.com\//);
  assert.ok(!/udm=/.test(site[0].href), 'never straight into AI Mode');
  const company = contextActions({kind: 'company', company: paired.company}, 'th');
  assert.deepEqual(company.map(a => a.id), ['ai'], 'no point, no Street View');
  const nameless = contextActions({kind: 'record', record: {name: ''}, area: {place: 'เขตคันนายาว', province: 'กรุงเทพมหานคร'}}, 'th');
  assert.deepEqual(nameless.map(a => a.id), ['maps'], 'a record without a name asks nothing about a name');
  const en = contextActions({kind: 'overview'}, 'en');
  assert.match(decodeURIComponent(en[0].href), /housing estate market in Thailand/);
});

test('filter chips escape user text, name the filters and offer one clear-all', () => {
  const html = renderFilterChips({search: '<b>x</b>', type: 'detached', house: 'townhouse', province: 'CMI'}, {type: {detached: 'บ้านเดี่ยว'}, house: {townhouse: 'ทาวน์เฮ้าส์ / ทาวน์โฮม'}, province: {CMI: 'เชียงใหม่'}});
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /แปลงบ้านเดี่ยว/);
  assert.match(html, /โครงการทาวน์เฮ้าส์/);
  assert.match(html, /เชียงใหม่/);
  assert.equal((html.match(/data-id="all"/g) || []).length, 1);
});

test('shares print whole percentages; a non-zero part never prints as 0%; periods read in the Buddhist era', () => {
  assert.equal(pct(1, 1000), '<1%');
  assert.equal(pct(0, 10), '0%');
  assert.equal(pct(5, 0), '—');
  assert.equal(pct(1236824, 2689640), '46%');
  assert.equal(thaiPeriod('2025'), '2568');
  assert.equal(thaiPeriod('2026-05'), 'พ.ค. 2569');
  assert.equal(thaiPeriod('2025-11-15/2025-11-16'), '15 พ.ย. 2568–16 พ.ย. 2568');
});

test('charts: provinces in the map colour, plot types, districts ranked — a click emits its selection', () => {
  const {data} = views();
  const el = {innerHTML: '', querySelectorAll: () => []};
  const doc = globalThis.document;
  globalThis.document = {getElementById: () => el};
  try {
    for (const view of ['provinces', 'types', 'districts']) {
      renderInsightChart({elementId: 'chart', view, units: data.units, allUnits: data.units, unit: unitWords('plots')});
      assert.match(el.innerHTML, /class="chart-bars"/, view);
    }
    renderInsightChart({elementId: 'chart', view: 'provinces', units: data.units, allUnits: data.units, unit: unitWords('plots')});
    assert.match(el.innerHTML, /สีเดียวกับแผนที่/);
    renderInsightChart({elementId: 'chart', view: 'districts', units: data.units.filter(u => u.province === 'CMI'), allUnits: data.units, unit: unitWords('records'), province: 'CMI', metric: 'records'});
    assert.match(el.innerHTML, /อำเภอที่มีรายการจัดสรรมากที่สุด/);
  } finally { globalThis.document = doc; }
});
