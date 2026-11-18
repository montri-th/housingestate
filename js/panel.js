/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (+ data-id / data-value); the app binds one delegated handler.
 * Actions: select-site · select-company · select-unit · select-record · select-station · select-building ·
 * select-province · filter-type · filter-house · set-metric · back · explore-top · clear-focus · open-charts ·
 * open-table · clear-filter · leave-province.
 *
 * Copy (the Hotel rule of 2026-11-01, “เรื่องภาษา ขอที่ กระชับอ่านเข้าใจง่าย ใช้ symbol, logo, icon, charts มาช่วยทำให้
 * text กระชับ … ตรงกับ context ของ ICP ตาม product statement ไม่มี caveats เลย และเป็นธรรมชาติ”): short Thai in the words
 * of people reading land and housing supply — แปลงจัดสรร / รายการจัดสรร / โครงการ / ผู้พัฒนา / ผู้จัดสรร / เขต·อำเภอ /
 * จังหวัด / สถานี; pictograms and small bar charts carry what a sentence used to; no caveat on screen. Exactness comes
 * from the names themselves — “แปลงจัดสรร” is what the DOL records report, “รายการ” one record of the DOL website, a pair
 * of a project and a record is named by how the research team found it — a rank “จาก N”, the numerator and denominator
 * of every share (visible, or in the tile's title and accessible name), and from one provenance line per view: dataset ·
 * source · date · boundary, then “วิธีนับ” (DATA_METHOD.md, where the method and its limits live). Two measures
 * (js/model.js#METRICS): แปลงจัดสรร (default) · รายการจัดสรร. A project carries no plots of its own; the records paired
 * with it are listed as records. Labels, prices and launches are what the source showed, never a status the page
 * asserts. Distances are straight lines (the distance pictogram; “ระยะตรง” in titles). Sources, methods and ids sit in
 * one closed <details>.
 */
import {LANG} from './shell/i18n.js';
import {provinceByCode, hasPoint, stationLink, productionLink, dolLink, TYPE_SHORT, COVERAGE_TH} from './model.js';
import {areaWord} from './areas.js';
import {cueMarkup} from './cues.js';
import {actionBar} from './ask.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
/** Whole-number share; a non-zero part never prints as 0% ("<1%"). */
export const pct = (part, whole) => (!whole ? '—' : part && Math.round((part / whole) * 100) === 0 ? '<1%' : `${NUMBER.format(Math.round((part / whole) * 100))}%`);
/** A number and its unit never split across lines in running text. */
const nw = html => `<span class="nowrap">${html}</span>`;
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
/** Straight-line distance for display: "320 ม." / "1.4 กม.". */
export const meters = m => (!Number.isFinite(m) ? '' : m < 1000 ? `${num(Math.round(m / 10) * 10)} ม.` : `${(m / 1000).toLocaleString('th-TH', {maximumFractionDigits: 1})} กม.`);
/** Rai from square metres (1 ไร่ = 1,600 m²), for the approximate extents. */
export const rai = m2 => (m2 / 1600).toLocaleString('th-TH', {maximumFractionDigits: m2 < 16000 ? 1 : 0});
/** A decorative pictogram of the approved subset (js/navigation.js PICTOGRAM_CONTRACT); the text carries the meaning. */
const pic = (kind, cls = '') => `<i class="${cls ? `${cls} ` : ''}pictogram pic-${esc(kind)}" aria-hidden="true"></i>`;
/** The method and its limits (one link at the end of every provenance line). */
export const METHOD_URL = 'DATA_METHOD.md';

export function link(url, label, cls = 'source-link') {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

export function thaiDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d} ${months[m - 1]} ${y + 543}`;
}
/** A period as the source gave it: "2025" → "2568", "2026-05" → "พ.ค. 2569" (the Thai page uses พ.ศ.). */
export function thaiPeriod(period) {
  const text = String(period || '').trim();
  if (/^[\d-]+\/[\d-]+$/.test(text)) return text.split('/').map(thaiPeriod).join('–');
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(text);
  if (!m) return period || '';
  if (m[3]) return thaiDate(period);
  const y = Number(m[1]) + 543;
  return m[2] ? `${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][Number(m[2]) - 1]} ${y}` : String(y);
}
/** A starting price in million baht as the page showed it (never compared, averaged or ranked). */
export const millionBaht = v => (Number.isFinite(v) ? `${v.toLocaleString('th-TH', {maximumFractionDigits: 2})} ล้านบาท` : '');

/** Metric tile with a decorative pictogram; value may be a preformatted string. `detail` (numerator and denominator)
 *  is the tile's title and part of its accessible text. */
export function metricTile(value, label, kind = '', detail = '') {
  const shown = typeof value === 'string' ? value : num(value);
  return `<div class="metric${kind ? ` metric-${kind}` : ''}"${detail ? ` title="${esc(detail)}"` : ''}>${pic(kind || 'plain', 'metric-symbol')}<strong class="data-number">${esc(shown)}</strong><span>${esc(label)}</span>${detail ? `<span class="sr-only">${esc(detail)}</span>` : ''}</div>`;
}
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}>${pic(kind)}${esc(text)}</h3>`;

const provinceName = code => provinceByCode(code)?.th || code || '';
/** "อโศก (สุขุมวิท)" — next to the rail pictogram; "สถานีอโศก (สุขุมวิท)" in running text. */
const stationShort = s => (s ? `${s.name}${s.lines?.length ? ` (${s.lines.join(' · ')})` : ''}` : '');
/** "เขตจตุจักร" / "อำเภอเมืองเชียงใหม่" for a district record, '' without one. */
export const districtName = (a, province) => (a ? `${areaWord(province || a.province)}${a.name}` : '');
/** "อำเภอสันทราย · เชียงใหม่" for a district id. */
const placeOf = (id, province, index) => [districtName(id ? index?.byId.get(id) : null, province), provinceName(province)].filter(Boolean).join(' · ');
/** A publisher's name is said once: a project whose name begins with it does not repeat it. */
const companyLine = s => (s.company && !String(s.name || '').startsWith(s.company.name) ? s.company.name : '');
const typeName = t => t?.th || '';
/** The other figure of a row: records under the plots measure, plots under the records measure. */
const otherOf = (x, unit) => (unit.id === 'records' ? `${num(x.plots)} แปลง` : `${num(x.records)} รายการ`);
/** The name of a DOL record, or how the record stands without one. */
export const recordName = r => r.name || r.gov || 'ไม่มีชื่อโครงการในระเบียน';

/* ---------- provenance ---------- */

/**
 * The provenance line every view that shows numbers ends with: dataset · source · date · boundary (each part in
 * `data-prov`, its word for screen readers), then the method link. The researched catalogues, the companies' own
 * notices and reports, OpenStreetMap, rail and terrain join the source part when the view shows them.
 */
export function provenance(ctx = {}, boundary = '', {records = true, projects = false, official = false, osm = false, rail = false, terrain = false, points = ''} = {}) {
  const meta = ctx.meta || {};
  const sources = [records ? `ระเบียนจัดสรรที่ดิน กรมที่ดิน · CityMETER ${thaiDate(meta.readOn || '')}`.trim() : '', projects ? 'บัญชีโครงการของผู้พัฒนา' : '',
    // The points production draws for the records (data/record-points.json, 0.2.0), with the day they were read.
    points ? `จุดบนแผนที่ CityMETER ${thaiDate(points)}`.trim() : '',
    official ? 'ประกาศและรายงานของบริษัท' : '', osm ? 'OpenStreetMap' : '',
    rail ? `CityMETER Transit ${thaiDate(meta.context?.rail?.asOf || '')}`.trim() : '',
    terrain ? `SRTM 30 ม. (2543)${ctx.osmDate ? ` · OSM ${thaiDate(ctx.osmDate)}` : ''}` : ''].filter(Boolean);
  return `<p class="hint panel-foot provenance"><span class="prov-part" data-prov="dataset">${pic('dataset')}<span class="sr-only">ชุดข้อมูล </span>CityMETER Housing Estate</span> <span class="prov-part" data-prov="source"><span class="sr-only">แหล่ง</span>จาก ${esc(sources.join(' · '))}</span><span class="prov-part" data-prov="date">${pic('date')}<span class="sr-only">ตรวจ </span>${esc(thaiDate(meta.checkedOn || ''))}</span><span class="prov-part" data-prov="boundary">${pic('area')}<span class="sr-only">ขอบเขต </span>${esc(boundary)}</span><span class="prov-part prov-method"><a href="${METHOD_URL}" target="_blank" rel="noopener">วิธีนับ</a></span></p>`;
}

/* ---------- shared fragments ---------- */

/**
 * Bars per plot type of the DOL records (บ้านเดี่ยว · บ้านแฝด · บ้านแถว · อาคารพาณิชย์ · ที่ดินเปล่า · อื่น ๆ), in that order,
 * in the measure's colour; each filters the measure to that type. Under the records measure a bar counts the records
 * that report the type (a record reporting two types is in both bars).
 */
function plotTypeBars(types, unit, {action = true} = {}) {
  const list = types.filter(t => t.value > 0);
  if (!list.length) return `<p class="hint">ไม่มี${esc(unit.subject)}</p>`;
  const max = Math.max(1, ...list.map(t => t.value));
  const row = t => {
    const title = `${t.th} · ${num(t.plots)} แปลง · ${num(t.records)} รายการที่มีแปลงประเภทนี้`;
    const inner = `<span class="mix-label">${esc(t.short || t.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill size-fill" style="width:${Math.max(3, Math.round((t.value / max) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(t.value)}</span>`;
    return action
      ? `<li><button type="button" class="mix-row" data-action="filter-type" data-value="${esc(t.id)}" title="${esc(title)} (ดูเฉพาะประเภทนี้)">${inner}</button></li>`
      : `<li title="${esc(title)}">${inner}<span class="sr-only">${esc(title)}</span></li>`;
  };
  return `<ul class="mix-list" aria-label="ประเภทแปลง (${esc(unit.one)})">${list.map(row).join('')}</ul>`;
}

/** Projects per house type in the type's series colour + shape cue; each filters the projects to that type. */
function houseTypeBars(types, {action = true} = {}) {
  const list = types.filter(t => t.count > 0).sort((a, b) => b.count - a.count || a.index - b.index);
  if (!list.length) return '';
  const max = Math.max(1, ...list.map(t => t.count));
  const row = t => {
    const inner = `<span class="mix-label">${cueMarkup(t.series)}${esc(t.short || t.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill category-${t.series}" style="width:${Math.max(3, Math.round((t.count / max) * 100))}%"></span></span>
      <span class="mix-value data-number">${num(t.count)}</span>`;
    return action
      ? `<li><button type="button" class="mix-row" data-action="filter-house" data-value="${esc(t.id)}" title="${esc(t.th)} · ${num(t.count)} โครงการ (ดูเฉพาะประเภทนี้)">${inner}</button></li>`
      : `<li title="${esc(t.th)} · ${num(t.count)} โครงการ">${inner}</li>`;
  };
  return `<ul class="mix-list" aria-label="ประเภทบ้านของโครงการ (โครงการ)">${list.map(row).join('')}</ul>`;
}

/** Projects: cue (house type) + name, then publisher · place · distance. */
export function siteList(sites, {distance = null, showProvince = false, showCompany = true, index = null} = {}) {
  return `<ul class="outlet-list">${sites.map(s => {
    const d = distance?.get?.(s.id);
    const area = index && s.district ? index.byId.get(s.district) : null;
    const meta = [showCompany ? companyLine(s) : '', area ? districtName(area, s.province) : '', showProvince ? provinceName(s.province) : '',
      Number.isFinite(d) ? meters(d) : '', hasPoint(s) ? '' : 'ไม่มีจุดบนแผนที่'].filter(Boolean).join(' · ');
    return `<li><button type="button" class="brand-row" data-action="select-site" data-id="${esc(s.id)}">${cueMarkup(s.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(s.name)}</strong><span class="row-meta">${esc(meta)}</span></span></button></li>`;
  }).join('')}</ul>`;
}

/** DOL records: name (or how it stands without one), then plots · allocator · place. */
export function recordList(records, {index = null, showPlace = true, level = null} = {}) {
  return `<ul class="outlet-list record-list">${records.map(r => {
    const plots = r.plots == null ? 'ไม่นับแปลง' : `${num(r.plots)} แปลง`;
    const meta = [plots, level ? level(r) : '', r.allocator, showPlace ? placeOf(r.district, r.province, index) : ''].filter(Boolean).join(' · ');
    return `<li><button type="button" class="brand-row" data-action="select-record" data-id="${esc(r.id)}">${pic('area', 'row-pic')}<span class="row-text"><strong${r.name ? '' : ' class="is-quiet"'}>${esc(recordName(r))}</strong><span class="row-meta">${esc(meta)}</span></span></button></li>`;
  }).join('')}</ul>`;
}

/** "ดูทั้งหมด 1,234 รายการ" under a shortened list (opens the table). */
const moreButton = (count, one = 'รายการ') => `<p class="list-more"><button type="button" class="link-button" data-action="open-table">ดูทั้งหมด ${num(count)} ${esc(one)}</button></p>`;

/** Ranked rows with a bar (provinces in their ramp colour, districts in the measure's colour). */
function rankRows(list, unit, {action, label, sub = () => '', fill = () => '', limit = 10}) {
  const top = list.filter(x => x.value > 0).slice(0, limit);
  if (!top.length) return '';
  const max = Math.max(1, ...top.map(x => x.value));
  return `<ol class="rank-list">${top.map((x, i) => `<li><button type="button" class="rank-row" data-action="${esc(action)}" data-id="${esc(x.id)}" aria-label="อันดับ ${i + 1} ${esc(label(x))} ${num(x.value)} ${esc(unit.one)} ${esc(sub(x))}">
      <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
      <span class="rank-name">${esc(label(x))}<small>${esc(sub(x))}</small></span>
      <span class="rank-track" aria-hidden="true"><span class="rank-fill${fill(x) ? '' : ' size-fill'}" style="width:${Math.max(3, Math.round((x.value / max) * 100))}%${fill(x) ? `;background:${esc(fill(x))}` : ''}"></span></span>
      <span class="rank-value data-number" aria-hidden="true">${num(x.value)}</span></button></li>`).join('')}</ol>`;
}

/* ---------- search ---------- */

/** What the search found, above the overview (the measure stays the filters'). */
export function searchBlock(r) {
  if (!r) return '';
  const total = r.provinces.length + r.unitCount + r.companyCount + r.siteCount + (r.recordCount || 0);
  const chips = [
    ...r.provinces.map(p => `<button type="button" class="fact-chip" data-action="select-province" data-id="${esc(p.code)}">${pic('province')}${esc(p.th)}</button>`),
    ...r.units.map(u => `<button type="button" class="fact-chip" data-action="select-unit" data-id="${esc(u.id)}">${pic('area')}${esc(districtName(u, u.province))} · ${esc(provinceName(u.province))}</button>`),
    ...r.companies.map(c => `<button type="button" class="fact-chip" data-action="select-company" data-id="${esc(c.id)}">${pic('building')}${esc(c.name)}</button>`),
  ].join('');
  const sites = r.sites.length ? `<div class="section-heading">${heading('maps', 'โครงการ')}<span class="hint">${num(r.siteCount)} โครงการ</span></div>${siteList(r.sites, {index: r.index, showProvince: true})}` : '';
  const records = r.records === null
    ? '<p class="hint">กำลังโหลดรายการจัดสรรเพื่อค้นหา</p>'
    : r.records.length ? `<div class="section-heading">${heading('area', 'รายการจัดสรร')}<span class="hint">${num(r.recordCount)} รายการ</span></div>${recordList(r.records, {index: r.index})}${r.recordCount > r.records.length ? moreButton(r.recordCount) : ''}` : '';
  return `<section class="panel-section search-results" aria-label="ผลค้นหา"><div class="section-heading">${heading('ai', `ผลค้นหา “${r.query}”`)}<span class="hint">${total ? `${num(total)} รายการที่พบ` : 'ไม่พบ'}</span></div>
    ${chips ? `<div class="fact-chips">${chips}</div>` : ''}${sites}${records}
    ${total ? '' : '<div class="aha-actions"><button type="button" class="btn quiet" data-action="clear-filter" data-id="search">ล้างคำค้นหา</button></div>'}</section>`;
}

/* ---------- Aha ---------- */

/** The house-plot comparison as two bars: the same provinces' share of every plot and of house plots only. */
function houseCompare(insight, unit) {
  const c = insight.comparison;
  if (!c || unit.id !== 'plots' || !insight.items.length) return '';
  const detail = (v, t, what) => `${num(v)} จาก ${num(t)} แปลง${what}`;
  const bar = (label, v, t, what) => `<li title="${esc(detail(v, t, what))}"><span class="mix-label">${esc(label)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill size-fill" style="width:${Math.max(2, Math.round((v / t) * 100))}%"></span></span>
      <span class="mix-value data-number">${pct(v, t)}</span><span class="sr-only">${esc(detail(v, t, what))}</span></li>`;
  return `<div class="aha-rail"><p class="aha-rail-title">${pic('compare')}เฉพาะแปลงบ้าน (บ้านเดี่ยว · บ้านแฝด · บ้านแถว)</p>
    <ul class="mix-list rail-compare">${bar('ทุกประเภทแปลง', insight.value, insight.total, ' ในจังหวัดเหล่านี้')}${bar('เฉพาะแปลงบ้าน', c.value, c.total, ' บ้านเดี่ยว บ้านแฝด และบ้านแถว ในจังหวัดเหล่านี้')}</ul></div>`;
}

/** Provinces where no record is counted under the filters (measured zero of this snapshot). */
function zeroLine(insight) {
  if (!insight.zero?.length) return '';
  const names = insight.zero.map(c => `<button type="button" class="link-button" data-action="select-province" data-id="${esc(c)}">${esc(provinceName(c))}</button>`).join(' · ');
  return `<p class="aha-secondary" title="ไม่มีรายการจัดสรรของ snapshot นี้ในจังหวัดเหล่านี้ (ตามตัวกรอง)">${pic('province')}${nw(`ไม่มีรายการ ${num(insight.zero.length)} จังหวัด`)}: ${names}</p>`;
}

/** The Aha block of the overview (any measure): the finding, its numerator and denominator. */
export function ahaBlock({insight, summary, focusMode = 'auto', unit, province = ''}) {
  if (!summary.count) {
    return `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p><h2>ไม่พบรายการจัดสรรตามตัวกรองนี้</h2>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="all" class="btn">ล้างตัวกรอง</button>${province ? '<button type="button" class="btn quiet" data-action="leave-province">ดูทั้งประเทศ</button>' : ''}</div></section>`;
  }
  const items = insight.items || [];
  if (!items.length) {
    const where = province ? provinceName(province) : 'ประเทศไทย';
    return `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${num(unit.id === 'records' ? summary.records : summary.plots)}</span><span class="aha-headline">${esc(unit.one)} ใน${esc(where)} · ${num(unit.id === 'records' ? summary.plots : summary.records)} ${unit.id === 'records' ? 'แปลง' : 'รายการ'}</span></h2>
      <div class="aha-actions"><button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบ</button></div></section>`;
  }
  if (insight.mode === 'province') {
    const word = areaWord(province);
    const names = items.map(x => `<button type="button" class="link-button" data-action="select-unit" data-id="${esc(x.id)}">${esc(word)}${esc(x.name)}</button>`).join(' · ');
    return `<section class="aha is-auto" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${pct(insight.value, insight.total)}</span><span class="aha-headline">ของ${esc(unit.subject)}ใน${esc(provinceName(province))} อยู่ใน ${nw(`${num(items.length)} ${esc(word)}นี้`)}</span></h2>
      <p class="aha-copy">${names}<br>${nw(`<strong class="data-number">${num(insight.value)}</strong> จาก ${num(insight.total)} ${esc(unit.one)}`)}</p>
      <div class="aha-actions"><button type="button" data-action="open-charts" class="btn quiet" data-value="districts">เปรียบเทียบ${esc(word)}</button></div></section>`;
  }
  const names = items.map(p => `<button type="button" class="link-button" data-action="select-province" data-id="${esc(p.code)}">${esc(p.name)}</button>`).join(' · ');
  const toggle = focusMode === 'auto'
    ? '<button type="button" data-action="clear-focus" class="btn">ดูทุกจังหวัดเท่ากัน</button>'
    : `<button type="button" data-action="explore-top" class="btn primary">โฟกัส ${num(items.length)} จังหวัดนี้</button>`;
  return `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${pct(insight.value, insight.total)}</span><span class="aha-headline">ของ${esc(unit.subject)}ทั้งประเทศ อยู่ใน ${nw(`${num(items.length)} จังหวัดนี้`)}</span></h2>
      <p class="aha-copy">${names}<br>${nw(`<strong class="data-number">${num(insight.value)}</strong> จาก ${num(insight.total)} ${esc(unit.one)}`)}</p>
      ${houseCompare(insight, unit)}${zeroLine(insight)}
      <div class="aha-actions">${toggle}<button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบจังหวัด</button></div></section>`;
}

/* ---------- Overview ---------- */

/** Provinces ranked by the measure (the national overview), in the map's ramp colour. */
function provinceBlock(provinces, unit, fillOf) {
  if (provinces.length < 2) return '';
  const row = p => `<li><button type="button" class="province-row" data-action="select-province" data-id="${esc(p.code)}" aria-label="${esc(p.name)} ${num(p.value)} ${esc(unit.one)} กดเพื่อดูจังหวัด"><i class="province-swatch" style="background:${esc(fillOf(p.code))}" aria-hidden="true"></i><span class="province-name">${esc(p.name)}</span><span class="province-count data-number">${num(p.value)}<small>${esc(unit.one)}</small></span></button></li>`;
  const shown = provinces.slice(0, 8), rest = provinces.slice(8);
  return `<section class="panel-section" aria-labelledby="province-title">
    <div class="section-heading">${heading('province', `จังหวัดที่มี${unit.subject}มากที่สุด`, 'province-title')}<span class="hint">${num(provinces.length)} จังหวัด</span></div>
    <ul class="province-list">${shown.map(row).join('')}</ul>
    ${rest.length ? `<details class="more-provinces"><summary>อีก ${num(rest.length)} จังหวัด</summary><ul class="province-list">${rest.map(row).join('')}</ul></details>` : ''}</section>`;
}

/** The researched projects in a line of chips: how many, on the map, with an extent, near rail, launched in the window. */
function projectFacts(s, meta = {}) {
  if (!s.count) return '';
  const chip = (kind, text, title) => `<span class="fact-chip" title="${esc(title)}">${pic(kind)}${text}</span>`;
  const win = meta.window ? `${thaiDate(meta.window.from)}–${thaiDate(meta.window.to)}` : '';
  return `<div class="fact-chips">${chip('maps', nw(`${num(s.located)} โครงการบนแผนที่`), `โครงการในบัญชีของผู้พัฒนาที่ทีมวิจัยเก็บ ${num(s.count)} โครงการ มีหมุด ${num(s.located)} โครงการ`)}
    ${s.extents ? chip('area', nw(`${num(s.extents)} มีกรอบพื้นที่`), 'กรอบพื้นที่โดยประมาณจาก OpenStreetMap') : ''}
    ${s.launch ? chip('date', nw(`${num(s.launch)} เปิดตัวใน 3 ปี`), `ช่วงเปิดตัวที่ทีมวิจัยพบอยู่ใน ${win}`) : ''}
    ${s.rail ? chip('rail', nw(`${num(s.rail)} ใกล้รถไฟฟ้า ≤ 1 กม.`), 'หมุดของโครงการห่างสถานีที่เปิดแล้วไม่เกิน 1 กม. (ระยะตรง)') : ''}</div>`;
}

/** Publishers with the most projects in the scope. */
function companyBlock(list, {title = 'ผู้พัฒนาที่มีโครงการมากที่สุด'} = {}) {
  if (!list?.length) return '';
  const max = Math.max(1, ...list.map(x => x.count));
  return `<section class="panel-section"><div class="section-heading">${heading('building', title)}<span class="hint">โครงการ</span></div>
    <ol class="rank-list">${list.map((x, i) => `<li><button type="button" class="rank-row" data-action="select-company" data-id="${esc(x.id)}" aria-label="อันดับ ${i + 1} ${esc(x.name)} ${num(x.count)} โครงการ">
      <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
      <span class="rank-name">${esc(x.name)}<small>${esc(`${num(x.located)} บนแผนที่`)}</small></span>
      <span class="rank-track" aria-hidden="true"><span class="rank-fill size-fill" style="width:${Math.max(3, Math.round((x.count / max) * 100))}%"></span></span>
      <span class="rank-value data-number" aria-hidden="true">${num(x.count)}</span></button></li>`).join('')}</ol></section>`;
}

/** Stations of CityMETER · Transit with the most projects within 1 km. */
function stationBlock(list) {
  if (!list?.length) return '';
  return `<section class="panel-section"><div class="section-heading">${heading('rail', 'สถานีใกล้โครงการ')}<span class="hint" title="ระยะตรงจากสถานีที่เปิดแล้ว">${pic('distance', 'hint-pic')}≤ 1 กม.</span></div>
    <ol class="rank-list">${list.map((x, i) => `<li><button type="button" class="rank-row" data-action="select-station" data-id="${esc(x.station.id)}" aria-label="สถานี${esc(stationShort(x.station))} ${num(x.count)} โครงการ">
      <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
      <span class="rank-name">${esc(stationShort(x.station))}<small>${esc(x.sites.slice(0, 2).map(s => s.name).join(' · '))}</small></span>
      <span class="rank-value data-number" aria-hidden="true">${num(x.count)}</span></button></li>`).join('')}</ol></section>`;
}

/**
 * The overview of Thailand or of the province of the จังหวัด filter. focusMode: 'auto' (the Aha's provinces carry the
 * focus stroke) · 'none' (every province alike).
 */
export function renderOverview({insight, overview, focusMode = 'auto', fillOf = () => '', ctx = {}, search = null}) {
  const unit = ctx.unit, s = overview.summary, province = overview.province;
  const aha = ahaBlock({insight, summary: s, focusMode, unit, province});
  const share = province && insight.nationalTotal ? metricTile(pct(insight.total, insight.nationalTotal), 'ของประเทศ', 'compare', `${num(insight.total)} จาก ${num(insight.nationalTotal)} ${unit.one}`) : '';
  const word = province ? areaWord(province) : 'อำเภอ';
  const metrics = `<section class="metrics" aria-label="ตัวเลขรวมของข้อมูลที่เลือก">
    ${metricTile(s.plots, 'แปลงจัดสรร', 'area', 'ผลรวมแปลงที่รายการจัดสรรของกรมที่ดินรายงาน')}
    ${metricTile(s.records, 'รายการ', 'dataset', 'รายการจัดสรรที่ดินบนเว็บไซต์กรมที่ดิน (snapshot ของ CityMETER)')}
    ${metricTile(s.districts, province ? word : 'เขต·อำเภอ', 'province', `${province ? word : 'เขตและอำเภอ'}ที่มีรายการ`)}
    ${province ? share : metricTile(s.provinces, 'จังหวัด', 'province')}
  </section>`;
  const rank = province && overview.rank ? `<p class="rank-line">${pic('rank')}อันดับ ${num(overview.rank.rank)} จาก ${num(overview.rank.of)} จังหวัดที่มีรายการ</p>` : '';
  const types = s.count ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภทแปลง')}<span class="hint">${esc(unit.one)}</span></div>${plotTypeBars(overview.plotTypes, unit)}</section>` : '';
  let ranking = '';
  if (!province) ranking = provinceBlock(overview.provinces || [], unit, fillOf);
  else if (overview.districts?.length) {
    ranking = `<section class="panel-section"><div class="section-heading">${heading('area', `${word}ที่มี${unit.subject}มากที่สุด`)}<span class="hint" data-count="districts">${num(overview.districts.length)} ${esc(word)}</span></div>
      ${rankRows(overview.districts, unit, {action: 'select-unit', label: x => `${word}${x.name}`, sub: x => otherOf(x, unit), limit: 10})}</section>`;
  }
  const projects = overview.sites.count ? `<section class="panel-section"><div class="section-heading">${heading('maps', 'โครงการที่ทีมวิจัยเก็บ')}<span class="hint">${num(overview.sites.count)} โครงการ</span></div>
    ${projectFacts(overview.sites, ctx.meta)}${houseTypeBars(overview.sites.byType)}</section>` : '';
  const sitesHere = province && overview.sitesList?.length
    ? `<section class="panel-section"><div class="section-heading">${heading('maps', 'โครงการในจังหวัดนี้')}<span class="hint">${num(overview.sitesList.length)} โครงการ</span></div>${siteList(overview.sitesList.slice(0, 20), {index: ctx.index})}
      ${overview.sitesList.length > 20 ? `<p class="hint">อีก ${num(overview.sitesList.length - 20)} โครงการ</p>` : ''}</section>` : '';
  const place = province ? provinceName(province) : 'ประเทศไทย';
  return `${searchBlock(search)}${aha}${metrics}${rank}${types}${ranking}${projects}${companyBlock(overview.companies)}${sitesHere}${stationBlock(overview.stations)}
    ${actionBar({kind: 'overview', province: province ? place : ''})}
    ${provenance(ctx, `${place} · จังหวัดและอำเภอตามขอบเขตของ CityMETER`, {projects: overview.sites.count > 0, rail: overview.stations?.length > 0})}`;
}

/* ---------- Project ---------- */

/** Label words of a project as the source showed them (never a sales status the page asserts). */
const statusChips = (s, meta) => (s.status || []).filter(x => x !== 'listed')
  .map(x => `<span class="fact-chip is-label" title="ป้ายที่หน้าเว็บแสดงเมื่อทีมวิจัยอ่าน">${esc(meta.status?.[x]?.th || x)}</span>`).join('');

/** The DOL records the research team paired with the project, with how each pair was found. */
function pairSection(d, ctx) {
  if (!d.site.pairs) return '';
  if (d.pairs === null) return `<section class="panel-section"><div class="section-heading">${heading('area', 'รายการจัดสรรที่จับคู่')}</div><p class="hint">กำลังโหลดรายการจัดสรร</p></section>`;
  if (!d.pairs.length) return '';
  const words = ctx.meta?.pairs || {};
  return `<section class="panel-section"><div class="section-heading">${heading('area', 'รายการจัดสรรที่จับคู่')}<span class="hint" title="รายการบนเว็บไซต์กรมที่ดินที่ทีมวิจัยจับคู่กับโครงการนี้">${num(d.pairs.length)} รายการ</span></div>
    ${recordList(d.pairs.map(p => p.record), {index: ctx.index, level: r => words[d.pairs.find(p => p.record === r)?.level]?.th || ''})}</section>`;
}

/** Legal entities, parents and issuer facts the research team found for the project (verbatim roles, dated). */
function evidenceSection(d, ctx) {
  const e = d.entry;
  if (e === null) return d.site.legal || d.site.events ? '<section class="panel-section"><p class="hint">กำลังโหลดหลักฐานของโครงการ</p></section>' : '';
  const roles = ctx.portfolioMeta?.legalRoles || {}, events = ctx.portfolioMeta?.events || {};
  const parts = [];
  if (e.legal?.length) {
    parts.push(`<section class="panel-section"><div class="section-heading">${heading('aff', 'นิติบุคคลตามหลักฐาน')}<span class="hint">${num(e.legal.length)}</span></div>
      <ul class="quality-list">${e.legal.map(x => `<li><strong>${esc(x.name)}</strong><br><span class="hint">${esc([roles[x.role]?.th || '', x.date ? thaiDate(x.date) : ''].filter(Boolean).join(' · '))}</span> ${link(x.source, 'ที่มา')}</li>`).join('')}</ul></section>`);
  }
  if (e.parents?.length) {
    parts.push(`<section class="panel-section"><div class="section-heading">${heading('aff', 'บริษัทแม่')}</div>
      <ul class="quality-list">${e.parents.map(x => `<li>${esc(x.child)} → <strong>${esc(x.parent)}</strong>${x.share ? ` · ${esc(x.share)}` : ''}<br><span class="hint">ณ ${esc(thaiDate(x.asOf))}</span></li>`).join('')}</ul></section>`);
  }
  if (e.issuer?.length) {
    parts.push(`<section class="panel-section"><div class="section-heading">${heading('history', 'ในรายงานประจำปีของบริษัท')}</div>
      <ul class="quality-list">${e.issuer.map(x => `<li><strong>${esc(x.name)}</strong><br><span class="hint">${esc([x.year ? `เริ่มขาย ${thaiPeriod(x.year)}` : '', x.units ? `${x.units} หน่วย` : '', x.area ? `เนื้อที่ ${x.area} ไร่-งาน-วา` : '', x.place, x.asOf ? `ณ ${thaiDate(x.asOf)}` : ''].filter(Boolean).join(' · '))}</span> ${link(x.source, 'รายงาน')}</li>`).join('')}</ul></section>`);
  }
  if (e.events?.length) {
    parts.push(`<section class="panel-section"><div class="section-heading">${heading('date', 'เหตุการณ์ของโครงการ')}</div>
      <ul class="quality-list">${e.events.map(x => `<li><strong>${esc(events[x.class]?.th || '')}</strong>${x.period ? ` · ${esc(thaiPeriod(x.period))}` : ''}${Number.isFinite(x.price) ? ` · เริ่ม ${esc(millionBaht(x.price))}` : ''} ${link(x.source, 'ที่มา')}</li>`).join('')}</ul></section>`);
  }
  return parts.join('');
}

export function renderSite(d, ctx = {}) {
  if (!d) return '';
  const s = d.site, u = d.company, index = ctx.index, meta = ctx.meta || {};
  const area = s.district ? index?.byId.get(s.district) : null;
  const place = [districtName(area, s.province), provinceName(s.province)].filter(Boolean).join(' · ');
  const placeChip = s.district && d.unit
    ? `<button type="button" class="fact-chip" data-action="select-unit" data-id="${esc(s.district)}" title="รายการจัดสรรใน${esc(districtName(area, s.province))}">${pic('area')}${esc(place)}</button>`
    : s.province ? `<button type="button" class="fact-chip" data-action="select-province" data-id="${esc(s.province)}">${pic('area')}${esc(place)}</button>` : '';
  const extentChip = Number.isFinite(s.extentM2) && s.extentM2 > 0
    ? `<span class="fact-chip" title="ขนาดกรอบพื้นที่โดยประมาณจาก OpenStreetMap ไม่ใช่โฉนดหรือแนวเขตตามกฎหมาย">${pic('area')}${nw(`กรอบราว ${rai(s.extentM2)} ไร่`)}</span>` : '';
  const launchChip = s.launch
    ? `<span class="fact-chip" title="ช่วงเปิดตัวที่ทีมวิจัยพบ${s.launchWindow === 'in' && meta.window ? ` · อยู่ใน ${thaiDate(meta.window.from)}–${thaiDate(meta.window.to)}` : ''}">${pic('date')}${nw(`เปิดตัว ${esc(thaiPeriod(s.launch))}`)}</span>` : '';
  const priceChip = Number.isFinite(s.price) ? `<span class="fact-chip" title="ราคาเริ่มที่หน้าเว็บแสดงเมื่อทีมวิจัยอ่าน">${pic('fee')}${nw(`เริ่ม ${esc(millionBaht(s.price))}`)}</span>` : '';
  const railChip = s.rail ? `<button type="button" class="fact-chip" data-action="select-station" data-id="${esc(s.rail.station.id)}" title="สถานีที่เปิดแล้วที่ใกล้ที่สุด · ระยะตรง">${pic('rail')}${esc(stationShort(s.rail.station))} ${nw(esc(meters(s.rail.m)))}</button>` : '';
  const nextChip = s.rail2 && (!s.rail || s.rail2.m < s.rail.m)
    ? `<span class="fact-chip" title="สถานีที่กำลังสร้างที่ใกล้ที่สุด · ระยะตรง">${pic('construction')}${esc(stationShort(s.rail2.station))} ${nw(esc(meters(s.rail2.m)))} · กำลังสร้าง</span>` : '';
  const coords = hasPoint(s) ? `${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}` : '';
  const company = companyLine(s);
  const e = d.entry || {};
  const sameBrand = d.sameBrand.length ? `<section class="panel-section"><div class="section-heading">${heading('building', `โครงการอื่นของ ${s.brand}`)}<span class="hint">${num(d.sameBrand.length)} โครงการ</span></div>${siteList(d.sameBrand.slice(0, 8), {showProvince: true, showCompany: false})}${d.sameBrand.length > 8 ? `<p class="hint">อีก ${num(d.sameBrand.length - 8)} โครงการ</p>` : ''}</section>` : '';
  const near = d.near.length ? `<section class="panel-section"><div class="section-heading">${heading('compare', 'โครงการรอบ ๆ')}<span class="hint" title="ระยะตรงจากหมุดของโครงการนี้">${pic('distance', 'hint-pic')}≤ 3 กม.</span></div>${siteList(d.near.map(x => x.site), {distance: new Map(d.near.map(x => [x.site.id, x.d]))})}</section>` : '';
  const official = Boolean(e.legal?.length || e.issuer?.length || e.events?.length || e.parents?.length);
  const pinWord = meta.pins?.[s.pin]?.th || '';
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity"><span class="identity-cue">${cueMarkup(s.series)}</span><div>
        <p class="eyebrow eyebrow-cue">${esc(typeName(s.type))}</p>
        <h2>${esc(s.name)}</h2>
        <p class="branch-name">${s.brand && s.brand !== s.name ? `${esc(s.brand)} · ` : ''}<button type="button" class="link-button" data-action="select-company" data-id="${esc(u.id)}">${esc(company || u.name)}</button></p></div></div>
      <div class="fact-chips">${placeChip}${extentChip}${launchChip}${priceChip}${statusChips(s, meta)}${railChip}${nextChip}${coords ? '' : '<span class="fact-chip is-quiet">ไม่มีจุดบนแผนที่</span>'}</div>
      ${actionBar({kind: 'site', site: s, area: {place: districtName(area, s.province), province: provinceName(s.province)}, point: hasPoint(s) ? {lat: s.latitude, lon: s.longitude, role: 'point'} : null})}
      <details class="source-details"><summary>ที่มาและพิกัด</summary>
        <dl class="facts">
          <dt>จุด</dt><dd>${coords ? `<span class="data-number">${esc(coords)}</span><br><span class="hint">${esc(pinWord)}</span>` : 'ไม่มีจุด'}</dd>
          ${s.extent >= 0 ? '<dt>กรอบพื้นที่</dt><dd>OpenStreetMap (ODbL) · กรอบโดยประมาณ</dd>' : ''}
          ${e.priceText ? `<dt>ราคาตามหน้าเว็บ</dt><dd>${esc(e.priceText)}</dd>` : ''}
          <dt>บัญชีของ</dt><dd>${esc(u.name)}${u.coverage ? `<br><span class="hint">${esc(COVERAGE_TH[u.coverage] || '')}</span>` : ''}</dd>
          <dt>ตรวจ</dt><dd>${esc(thaiDate(meta.readOn || ''))}</dd>
          <dt>รหัส</dt><dd><span class="hint data-number">${esc(s.id)}</span></dd>
        </dl>
        <p class="links">${link(e.page, 'หน้าโครงการ')} ${link(e.catalogue, 'บัญชีโครงการ')} ${link(e.pinPage, 'หน้าที่มาของหมุด')}</p>
      </details>
    </section>
    ${pairSection(d, ctx)}
    ${evidenceSection(d, ctx)}
    ${hasPoint(s) ? `<section class="panel-section terrain-section"><div class="section-heading">${heading('elevation', 'ภูมิประเทศ')}</div>
      <div class="fact-chips terrain-chips" data-terrain-for="${esc(s.id)}"><span class="hint">กำลังอ่านภูมิประเทศ</span></div></section>` : ''}
    ${near}${sameBrand}
    ${d.siblings.length ? `<section class="panel-section"><div class="section-heading">${heading('building', `โครงการอื่นของ ${u.name}`)}<span class="hint">${num(d.siblings.length)} โครงการ</span></div>${siteList(d.siblings.slice(0, 8), {showProvince: true, showCompany: false})}${d.siblings.length > 8 ? `<p class="list-more"><button type="button" class="link-button" data-action="select-company" data-id="${esc(u.id)}">ดูทั้ง ${num(d.siblings.length + 1)} โครงการ</button></p>` : ''}</section>` : ''}
    ${provenance(ctx, place ? `${s.name} · ${place}` : s.name, {records: Boolean(d.pairs?.length), projects: true, official, osm: s.extent >= 0, rail: Boolean(s.rail || s.rail2), terrain: hasPoint(s)})}`;
}

/* ---------- Publisher (company) ---------- */

export function renderCompany(p, ctx = {}) {
  if (!p) return '';
  const u = p.company, f = p.facts, events = ctx.portfolioMeta?.events || {};
  const provinces = p.provinces.map(x => `<button type="button" class="fact-chip" data-action="select-province" data-id="${esc(x.code)}">${pic('province')}${esc(provinceName(x.code))} <span class="data-number">${num(x.count)}</span></button>`).join('');
  const brands = p.brands.length > 1 ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'แบรนด์')}<span class="hint">${num(p.brands.length)}</span></div>
    <div class="fact-chips">${p.brands.slice(0, 24).map(b => `<span class="fact-chip">${esc(b.name)} <span class="data-number">${num(b.count)}</span></span>`).join('')}</div></section>` : '';
  const ev = p.events === null ? '<p class="hint">กำลังโหลดเหตุการณ์ของบริษัท</p>' : p.events.length
    ? `<section class="panel-section"><div class="section-heading">${heading('date', 'โครงการเปิดตัวที่บริษัทรายงาน')}<span class="hint">${num(p.events.length)}</span></div>
      <ul class="quality-list">${p.events.slice(0, 12).map(x => `<li><strong>${esc(x.name)}</strong> · ${esc(events[x.class]?.th || '')}${x.period ? ` · ${esc(thaiPeriod(x.period))}` : ''}${Number.isFinite(x.price) ? ` · เริ่ม ${esc(millionBaht(x.price))}` : ''} ${link(x.source, 'ที่มา')}</li>`).join('')}</ul></section>` : '';
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity">${pic('building', 'identity-pic')}<div>
        <p class="eyebrow">ผู้พัฒนา · บัญชีโครงการบนเว็บ</p>
        <h2>${esc(u.name)}</h2>${u.coverage ? `<p class="subtle">${esc(COVERAGE_TH[u.coverage] || '')}</p>` : ''}</div></div>
      <div class="metrics compact">${metricTile(p.sites.length, 'โครงการ', 'maps', `โครงการในบัญชีที่ทีมวิจัยเก็บ ${num(p.sites.length)} โครงการ`)}${metricTile(f.located, 'บนแผนที่', 'maps')}${metricTile(f.extents, 'มีกรอบพื้นที่', 'area', 'กรอบพื้นที่โดยประมาณจาก OpenStreetMap')}</div>
      ${provinces ? `<div class="fact-chips">${provinces}</div>` : ''}
      ${actionBar({kind: 'company', company: u})}
      <p class="links">${link(u.url, 'บัญชีโครงการบนเว็บ')}</p>
    </section>
    ${p.byType.length ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภทบ้าน')}<span class="hint">โครงการ</span></div>${houseTypeBars(p.byType, {action: false})}</section>` : ''}
    ${brands}${ev}
    <section class="panel-section"><div class="section-heading">${heading('maps', 'โครงการ')}<span class="hint">${num(p.sites.length)} โครงการ</span></div>${siteList(p.sites.slice(0, 60), {showProvince: true, showCompany: false, index: ctx.index})}
      ${p.sites.length > 60 ? `<p class="hint">อีก ${num(p.sites.length - 60)} โครงการ</p>` : ''}</section>
    ${provenance(ctx, `${u.name} · ทุกโครงการในบัญชี`, {records: false, projects: true, official: Boolean(p.events?.length), osm: f.extents > 0})}`;
}

/* ---------- District ---------- */

export function renderDistrict(p, ctx = {}) {
  if (!p) return '';
  const u = p.unit, unit = ctx.unit, word = areaWord(u.province);
  const records = p.records === null ? '<section class="panel-section"><p class="hint">กำลังโหลดรายการจัดสรร</p></section>'
    : p.records.length ? `<section class="panel-section"><div class="section-heading">${heading('area', 'รายการจัดสรร')}<span class="hint">แปลงมากก่อน</span></div>${recordList(p.records.slice(0, 15), {index: ctx.index, showPlace: false})}${p.records.length > 15 ? moreButton(p.records.length) : ''}</section>` : '';
  const sites = p.sites.length ? `<section class="panel-section"><div class="section-heading">${heading('maps', 'โครงการที่ทีมวิจัยเก็บ')}<span class="hint">${num(p.sites.length)} โครงการ</span></div>${siteList(p.sites.slice(0, 20))}${p.sites.length > 20 ? `<p class="hint">อีก ${num(p.sites.length - 20)} โครงการบนแผนที่</p>` : ''}</section>` : '';
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity">${pic('area', 'identity-pic')}<div>
        <p class="eyebrow">${esc(word)} · <button type="button" class="link-button" data-action="select-province" data-id="${esc(u.province)}">${esc(provinceName(u.province))}</button></p>
        <h2>${esc(word)}${esc(u.name)}</h2>${u.nameEn ? `<p class="subtle">${esc(u.nameEn)}</p>` : ''}</div></div>
      <div class="metrics compact">${metricTile(u.plots, 'แปลงจัดสรร', 'area')}${metricTile(u.records, 'รายการ', 'dataset')}${metricTile(pct(p.share.value, p.share.total), `ของ${provinceName(u.province)}`, 'compare', `${num(p.share.value)} จาก ${num(p.share.total)} ${unit.one}`)}</div>
      ${p.rank ? `<p class="rank-line">${pic('rank')}อันดับ ${num(p.rank.rank)} จาก ${num(p.rank.of)} ${esc(word)}ที่มีรายการในจังหวัด</p>` : ''}
      ${actionBar({kind: 'district', area: {place: `${word}${u.name}`, province: provinceName(u.province)}})}
      <div class="detail-actions">${link(productionLink({province: u.province, district: u.id}), 'ดูใน CityMETER', 'btn quiet source-link')}</div>
    </section>
    <section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภทแปลง')}<span class="hint">${esc(unit.one)}</span></div>${plotTypeBars(p.types, unit)}</section>
    ${records}${sites}
    ${provenance(ctx, `${word}${u.name} · ${provinceName(u.province)} · ขอบเขตของ CityMETER`, {projects: p.sites.length > 0})}`;
}

/* ---------- DOL record ---------- */

export function renderRecord(p, ctx = {}) {
  if (!p) return '';
  const r = p.record, meta = ctx.meta || {}, index = ctx.index;
  const area = r.district ? index?.byId.get(r.district) : null;
  const place = [districtName(area, r.province), provinceName(r.province)].filter(Boolean).join(' · ');
  const scope = meta.scopes?.[r.scope]?.th || '';
  const plots = r.plots == null
    ? metricTile('ไม่นับ', 'แปลง', 'area', 'ยอดแยกประเภทของรายการนี้ไม่เท่ากับยอดรวม จึงไม่นับในผลรวมแปลง')
    : metricTile(r.plots, 'แปลง', 'area', 'จำนวนแปลงที่รายการนี้รายงาน');
  const types = r.types ? `<section class="panel-section"><div class="section-heading">${heading('segment', 'ประเภทแปลง')}<span class="hint">แปลง</span></div>${plotTypeBars(p.types.map(t => ({...t, plots: t.value, records: t.value ? 1 : 0})), {one: 'แปลง', subject: 'แปลง'}, {action: false})}</section>` : '';
  const names = [r.alt ? ['ชื่อบนหน้าเว็บกรมที่ดินตอนนี้', r.alt] : null, r.gov && r.gov !== r.name ? ['ชื่อตามรายงานของรัฐ', r.gov] : null, r.external ? ['ชื่อตามผู้พัฒนา', r.external] : null].filter(Boolean);
  const bkk = r.dolAddress?.[0] === 'กรุงเทพมหานคร';
  const address = r.dolAddress ? [r.dolAddress[2] ? `${bkk ? 'แขวง' : 'ตำบล'}${r.dolAddress[2]}` : '', r.dolAddress[1] ? `${bkk ? 'เขต' : 'อำเภอ'}${r.dolAddress[1]}` : '', r.dolAddress[0]].filter(Boolean).join(' · ') : '';
  const words = meta.pairs || {};
  // The other records production put at the same point (0.2.0): separate records, each opens on its own.
  const SHARED_ROWS = 12;
  const sharedRows = p.atPoint || [];
  const shared = sharedRows.length ? `<section class="panel-section"><div class="section-heading">${heading('maps', 'รายการที่จุดเดียวกัน')}<span class="hint">${num(sharedRows.length)} รายการ</span></div>
    ${recordList(sharedRows.slice(0, SHARED_ROWS), {index})}${sharedRows.length > SHARED_ROWS ? `<details class="more-records"><summary>อีก ${num(sharedRows.length - SHARED_ROWS)} รายการ</summary>${recordList(sharedRows.slice(SHARED_ROWS), {index})}</details>` : ''}</section>` : '';
  const pairs = p.pairs.length ? `<section class="panel-section"><div class="section-heading">${heading('maps', 'โครงการที่จับคู่')}<span class="hint" title="โครงการที่ทีมวิจัยจับคู่กับรายการนี้">${num(p.pairs.length)} โครงการ</span></div>
    <ul class="outlet-list">${p.pairs.map(x => `<li><button type="button" class="brand-row" data-action="select-site" data-id="${esc(x.site.id)}">${cueMarkup(x.site.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(x.site.name)}</strong><span class="row-meta">${esc([x.site.company?.name, words[x.level]?.th].filter(Boolean).join(' · '))}</span></span></button></li>`).join('')}</ul></section>` : '';
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity">${pic('area', 'identity-pic')}<div>
        <p class="eyebrow">รายการจัดสรรที่ดิน · กรมที่ดิน</p>
        <h2${r.name ? '' : ' class="is-quiet"'}>${esc(recordName(r))}</h2>
        ${r.allocator ? `<p class="branch-name" title="ผู้จัดสรรตามระเบียน">${esc(r.allocator)}</p>` : ''}</div></div>
      <div class="metrics compact">${plots}${scope ? metricTile(scope, 'ขอบเขตแปลง', 'segment') : ''}</div>
      <div class="fact-chips">${r.district && p.unit ? `<button type="button" class="fact-chip" data-action="select-unit" data-id="${esc(r.district)}" title="ขอบเขตที่ CityMETER นับรายการนี้">${pic('area')}${esc(place)}</button>` : `<span class="fact-chip">${pic('area')}${esc(place)}</span>`}</div>
      ${address ? `<p class="fact-line" title="ที่ตั้งตามหน้าเว็บไซต์กรมที่ดิน">${pic('maps', 'fact-icon')}${esc(address)}</p>` : ''}
      ${p.point ? `<p class="fact-line" title="จุดที่ CityMETER production วางรายการนี้บนแผนที่">${pic('maps', 'fact-icon')}จุดตาม CityMETER production${p.atPoint.length ? ` · จุดเดียวกับอีก ${num(p.atPoint.length)} รายการ` : ''}</p>` : ''}
      ${names.length ? `<dl class="facts compact-facts">${names.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${actionBar({kind: 'record', record: {name: r.name || r.gov || r.external, allocator: r.allocator}, area: {place: districtName(area, r.province), province: provinceName(r.province)}})}
      <div class="detail-actions">${link(dolLink(r.id), 'หน้าเว็บกรมที่ดิน', 'btn quiet source-link')}${link(productionLink({province: r.province, district: r.district}), 'ดูใน CityMETER', 'btn quiet source-link')}</div>
      <details class="source-details"><summary>ที่มา</summary>
        <dl class="facts"><dt>รหัสหน้าเว็บ</dt><dd><span class="hint data-number">${esc(r.id)}</span></dd><dt>ตรวจ</dt><dd>${esc(thaiDate(meta.readOn || ''))}</dd></dl>
      </details>
    </section>
    ${types}${pairs}${shared}
    ${provenance(ctx, `${recordName(r)} · ${place}`, {projects: p.pairs.length > 0, points: p.point ? String(p.pointsMeta?.readAt || '').slice(0, 10) : ''})}`;
}

/* ---------- Station (CityMETER · Transit) ---------- */

export function renderStation(p, ctx = {}) {
  if (!p) return '';
  const s = p.station;
  const building = s.status !== 'operating';
  const head = `<section class="detail-head station">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity">${pic('rail', 'identity-pic')}<div>
        <p class="eyebrow">สถานีรถไฟฟ้า${s.lines?.length ? ` · ${esc(s.lines.join(' · '))}` : ''}${building ? ` · ${pic('construction')}กำลังสร้าง` : ''}</p>
        <h2>สถานี${esc(s.name)}</h2>${s.nameEn ? (LANG === 'en' ? `<p class="subtle" lang="th" translate="no">สถานี${esc(s.name)}</p>` : `<p class="subtle">${esc(s.nameEn)}</p>`) : ''}</div></div>
      <div class="metrics compact">${metricTile(p.rows.length, 'โครงการ', 'maps')}${metricTile(p.extents, 'มีกรอบพื้นที่', 'area', 'กรอบพื้นที่โดยประมาณจาก OpenStreetMap')}${metricTile(meters(p.radius), 'รอบสถานี', 'distance', `ระยะตรงจากจุดอ้างอิงของสถานี ${meters(p.radius)}`)}</div>
      ${actionBar({kind: 'station', station: s, point: {lat: s.lat, lon: s.lon, role: 'station'}})}
      <div class="detail-actions">${link(stationLink(s), 'ดูใน CityMETER Transit', 'btn quiet source-link')}</div>
    </section>
`;
  const boundary = `รัศมี ${meters(p.radius)} จากสถานี${s.name}`;
  if (!p.rows.length) return `${head}<div class="empty-note" role="note"><strong>ไม่พบโครงการรอบสถานีนี้</strong></div>${provenance(ctx, boundary, {records: false, rail: true})}`;
  return `${head}    <section class="panel-section"><div class="section-heading">${heading('maps', 'โครงการ')}<span class="hint">ใกล้ก่อน</span></div>${siteList(p.rows, {distance: p.distance, index: ctx.index})}</section>
    ${provenance(ctx, boundary, {records: false, projects: true, rail: true})}`;
}

/* ---------- Building of an estate (display-time spatial join) ---------- */

/** Where a drawn building's outline and height come from (the Hotel rule of 2026-11-01, point 3). */
export const BUILDING_SOURCE_TH = Object.freeze({osm: 'OpenStreetMap', cm: 'CityMETER Building V4'});

export function renderBuilding(b, ctx = {}) {
  if (!b) return '';
  const source = BUILDING_SOURCE_TH[b.kind] || BUILDING_SOURCE_TH.osm;
  const height = b.height != null ? `<span title="ความสูงจาก ${esc(source)}">สูงราว ${num(Math.round(b.height))} ม.</span>` : '';
  return `<section class="detail-head building">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${pic('building')} ${b.site ? `<button type="button" class="link-button" data-action="select-site" data-id="${esc(b.site.id)}">${esc(b.site.name)}</button>` : 'อาคาร'}${height ? ` · ${height}` : ''}</p>
      <h2>อาคารในกรอบโครงการ</h2>
      <p class="subtle">ขอบอาคาร ${esc(source)}</p>
      ${actionBar({kind: 'building', site: b.site})}
    </section>
    ${provenance(ctx, `อาคารในกรอบ ${b.site?.name || 'โครงการ'} · ขอบอาคาร ${source}`, {records: false, projects: true, osm: true})}`;
}

/** Terrain chips (js/shell/terrain.js#terrainChips) as fact chips; '' when nothing is known. */
export function terrainChipsHTML(chips) {
  return chips.map(c => `<span class="fact-chip" title="${esc(c.title)}">${pic(c.kind)}${esc(c.text)}</span>`).join('');
}

/* ---------- Active filter chips ---------- */

export function renderFilterChips(values, labels) {
  const chips = [];
  const push = (key, text) => chips.push(`<li><button type="button" class="filter-chip" data-action="clear-filter" data-id="${esc(key)}" aria-label="ล้างตัวกรอง ${esc(text)}"><span>${esc(text)}</span><i aria-hidden="true">×</i></button></li>`);
  if (values.search) push('search', `ค้นหา “${values.search}”`);
  if (values.type) push('type', `แปลง${labels.type[values.type] || values.type}`);
  if (values.house) push('house', `โครงการ${labels.house[values.house] || TYPE_SHORT[values.house] || values.house}`);
  if (values.province) push('province', labels.province[values.province] || values.province);
  return chips.length ? `<ul class="filter-chips" aria-label="ตัวกรองที่ใช้อยู่">${chips.join('')}<li><button type="button" class="filter-chip clear-all" data-action="clear-filter" data-id="all">ล้างทั้งหมด</button></li></ul>` : '';
}

export {moreButton};
