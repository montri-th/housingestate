/**
 * Dataset vocabulary, decoding, shared filter and summary helpers of CityMETER · Housing Estate.
 *
 * data/estates.json is built by scripts/build-data.py from the research master “CityMETER Housing Estate Thailand —
 * Research Master 2026-11-18” (registry research.TH.housing_estate). Two grains that are never added to each other
 * (DATA_METHOD.md §2):
 *   record  — one DOL website record of the production snapshot (23_NATIONAL_MASTER, 19,753): the plots it reports, the
 *             production district and province it is counted in. A record is a registration, not a village. The measure
 *             is read over records, summed per production district (`unit` below: one row per district, the totals of
 *             its records) and per province. Records themselves load after the first paint (data/records.json).
 *   project — one entry of a publisher's catalogue the research team collected (01_PROJECTS, 1,538): name, brand,
 *             publisher, house type, the labels the source shows, and — for the drawn ones — the reference pin the
 *             research team selected (27_MAP_REFERENCES). A project never adds to a province's records or plots.
 *
 * Two measures (a contract, see DATA_METHOD.md §2):
 *   plots (default) — Σ plots the records report (selected_reported_plot_total; “แปลง”, LI `li.supply`).
 *   records         — DOL records (“รายการ”, LDS `count`).
 * A plot type (บ้านเดี่ยว · บ้านแฝด · บ้านแถว · อาคารพาณิชย์ · ที่ดินเปล่า · อื่น ๆ) narrows the measure to the plots of
 * that type and the records that report it. Nothing here merges, moves or mutates a record.
 */
import {seriesOf} from './cues.js';
import {productionHref} from './shell/area-path.js';

export const METRICS = Object.freeze({
  plots: Object.freeze({id: 'plots', one: 'แปลง', label: 'แปลงจัดสรร', subject: 'แปลงจัดสรร', per: 'แปลง'}),
  records: Object.freeze({id: 'records', one: 'รายการ', label: 'รายการจัดสรร', subject: 'รายการจัดสรร', per: 'รายการ'}),
});
export const metricOf = id => METRICS[id] || METRICS.plots;
/** Unit words for a measure. */
export const unitWords = (metric = '') => ({...metricOf(metric), mode: metricOf(metric).id});
/** The value a district row (or a record) adds to a measure: its plots, or its records. */
export const unitValue = (u, metric = 'plots') => (metric === 'records' ? (u?.records ?? 1) || 0 : (Number.isFinite(u?.plots) && u.plots > 0 ? u.plots : 0));
/** The value of an aggregate ({count, plots, records}) under a measure. */
export const valueOf = (a, metric = 'plots') => (metric === 'records' ? a?.records || 0 : a?.plots || 0);

/** The plot types of a DOL record (12_PRODUCTION_SOURCE G–L), in the order of every `types` array. */
export const PLOT_TYPES = Object.freeze([
  Object.freeze({id: 'detached', th: 'บ้านเดี่ยว', short: 'บ้านเดี่ยว'}),
  Object.freeze({id: 'twin', th: 'บ้านแฝด', short: 'บ้านแฝด'}),
  Object.freeze({id: 'row', th: 'บ้านแถว / ทาวน์โฮม', short: 'บ้านแถว'}),
  Object.freeze({id: 'commercial', th: 'อาคารพาณิชย์', short: 'พาณิชย์'}),
  Object.freeze({id: 'land', th: 'ที่ดินเปล่า', short: 'ที่ดินเปล่า'}),
  Object.freeze({id: 'other', th: 'อื่น ๆ', short: 'อื่น ๆ'}),
]);
export const HOUSE_PLOTS = Object.freeze(['detached', 'twin', 'row']);
const plotIndex = id => PLOT_TYPES.findIndex(t => t.id === id);

/** Short labels of the house types of a project (01_PROJECTS D) for tight places. */
export const TYPE_SHORT = Object.freeze({
  detached: 'บ้านเดี่ยว', semi_detached: 'บ้านแฝด', townhouse: 'ทาวน์โฮม', mixed_low_rise: 'หลายประเภท',
  low_rise_unspecified: 'แนวราบ', shophouse: 'อาคารพาณิชย์', home_office: 'โฮมออฟฟิศ',
});

/** What a publisher's list is (02_COMPANIES E). */
export const COVERAGE_TH = Object.freeze({partial: 'บัญชีบนเว็บบางส่วน', complete: 'ครบตามบัญชีของแหล่ง'});

/**
 * Symbol size on the map: one size for every project (a project carries no plots of its own). Radius (px) by zoom; the
 * legend and the HTML pins use the same numbers.
 */
export const PIN_SCALE = Object.freeze([[5, 3], [7, 3.6], [9, 4.4], [11, 5.4], [13, 6.6], [15, 7.6], [17, 8.6], [19, 9.4]]);
export function pinRadius(zoom) {
  const s = PIN_SCALE;
  if (!(zoom > s[0][0])) return s[0][1];
  for (let i = 1; i < s.length; i++) if (zoom <= s[i][0]) return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * (zoom - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
  return s.at(-1)[1];
}
/** The same size as a MapLibre expression: `factor` × radius + `add` px, capped (zoom stays the top-level input). */
export function pinSizeExpression(factor = 1, add = 0, cap = 1e6) {
  return ['interpolate', ['linear'], ['zoom'], ...PIN_SCALE.flatMap(([z, k]) => [z, Math.min(cap, factor * k) + add])];
}

/** Every province of the production base info, keyed by the production route code (/v3/citymeter/{code}). */
let PROVINCE_LIST = [];
export function setProvinces(list) { PROVINCE_LIST = Object.freeze((list || []).map(p => Object.freeze({code: p.id, dopa: p.code, th: p.name, en: p.nameEn}))); }
export const provinces = () => PROVINCE_LIST;
export const provinceByCode = code => PROVINCE_LIST.find(p => p.code === String(code || '').toUpperCase()) || null;
/** Accept a production code (BKK), a DOPA code (10) or an English/Thai name; returns the production code or ''. */
export const provinceCodeFrom = value => {
  const v = String(value || '').trim();
  const p = PROVINCE_LIST.find(x => x.code === v.toUpperCase() || x.dopa === v || x.en.toLowerCase() === v.toLowerCase() || x.th === v);
  return p ? p.code : '';
};

/** A usable coordinate inside Thailand's bounding box (never invented). */
export const hasPoint = r => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude) &&
  r.latitude >= 5 && r.latitude <= 21 && r.longitude >= 97 && r.longitude <= 106;

const lower = v => String(v || '').toLocaleLowerCase('th-TH');
const COLLATOR = new Intl.Collator('th');

/**
 * Decode data/estates.json into records plus dictionaries. `index` (js/areas.js#buildAreaIndex) gives the names of
 * provinces and districts; every province code of the file must be a production province.
 */
export function decodeDataset(json, index = null) {
  if (!json?.districts?.id || !json?.projects?.key || !Array.isArray(json?.companies)) throw new Error('Invalid housing estate dataset');
  const meta = json.meta || {};
  const codes = json.provinces || [];
  if (index) for (const c of codes) if (!index.provinceById.get(c)) throw new Error(`Unknown province ${c}`);
  const provinceName = c => index?.provinceById.get(c)?.name || '';
  const provinceEn = c => index?.provinceById.get(c)?.nameEn || '';
  const types = (meta.houseTypes || []).map((t, i) => ({id: t.id, th: t.th, en: t.en, index: i, series: seriesOf(t.id), short: TYPE_SHORT[t.id] || t.th}));
  const plotTypes = PLOT_TYPES.map((t, i) => ({...t, index: i, en: meta.plotTypes?.[i]?.en || '', field: meta.plotTypes?.[i]?.field || ''}));
  const stations = (json.stations || []).map(s => ({...s}));

  const companies = json.companies.map((c, i) => ({id: c.key, index: i, kind: 'dev', name: c.name, items: c.items || 0, coverage: c.coverage || '',
    url: c.url || '', drawn: c.drawn || 0, sites: [], brands: []}));
  const brandNames = json.brands?.name || [];
  (json.brands?.company || []).forEach((ci, i) => companies[ci]?.brands.push(brandNames[i]));

  const D = json.districts;
  const units = D.id.map((id, i) => {
    const area = index?.byId.get(id) || null;
    const province = codes[D.province[i]];
    const u = {id, kind: 'unit', name: area?.name || id, nameEn: area?.nameEn || '', province, records: D.records[i], plots: D.plots[i],
      types: D.types[i], typeRecords: D.typeRecords[i], count: 1, series: 0, base: null};
    u.search = lower([u.name, u.nameEn, provinceName(province), provinceEn(province)].join(' '));
    return u;
  });

  const P = json.projects;
  const station = (i, m) => (i >= 0 && stations[i] ? {station: stations[i], m} : null);
  const sites = P.key.map((key, i) => {
    const t = types[P.type[i]] || null;
    const company = companies[P.company[i]];
    const lat = P.lat[i], lon = P.lon[i];
    const district = P.district[i] || '';
    const province = P.province[i] || P.sourceProvince[i] || '';
    const s = {id: key, kind: 'site', index: i, name: P.name[i], brand: P.brand[i] >= 0 ? brandNames[P.brand[i]] || '' : '', company, type: t, series: t?.series || 9,
      latitude: Number.isFinite(lat) ? lat : null, longitude: Number.isFinite(lon) ? lon : null, pin: P.pin[i] || '', province, district,
      provinceFrom: P.province[i] ? 'point' : P.sourceProvince[i] ? 'source' : '',
      status: P.status[i] || [], launch: P.launch[i] || '', launchWindow: P.launchWindow[i] || '', price: P.price[i], band: P.band[i] || '',
      alias: Boolean(P.alias[i]), rail: station(P.rail[i], P.railM[i]), rail2: station(P.rail2[i], P.rail2M[i]),
      pairs: P.pairs[i] || 0, events: P.events[i] || 0, legal: P.legal[i] || 0, extentM2: P.extentM2[i] ?? null,
      extent: P.extentM2[i] ? i : -1, unit: null, importance: 0};
    const area = district ? index?.byId.get(district) : null;
    s.search = lower([s.name, s.brand, company?.name, area?.name, area?.nameEn, provinceName(province), provinceEn(province)].join(' '));
    company?.sites.push(s);
    return s;
  });
  // Labels (js/labels.js): a project with an extent first, then the rest (presentation order only, never a rank).
  for (const s of sites) s.importance = s.extent >= 0 ? 0.5 : 0.1;
  for (const u of companies) u.sites.sort(siteOrder);

  const A = json.areas || {};
  const areaTotals = new Map(codes.map((c, i) => [c, {code: c, records: A.records?.[i] || 0, plots: A.plots?.[i] || 0, types: A.types?.[i] || [],
    typeRecords: A.typeRecords?.[i] || [], scope: A.scope?.[i] || [], nameless: A.nameless?.[i] || 0, held: A.held?.[i] || 0}]));
  return {meta, types, plotTypes, typeById: new Map(types.map(t => [t.id, t])), companies, units, sites, roster: [], stations, provinces: codes, areaTotals};
}

/**
 * District rows under the filters: the plot type (`type`) narrows every row to the plots of that type and the records
 * that report it (a row without any leaves the scope); province; search over the district and its province.
 */
export function filterUnits(units, f = {}) {
  const q = lower(f.search).trim();
  const k = f.type ? plotIndex(f.type) : -1;
  const out = [];
  for (const u of units) {
    if (f.province && u.province !== f.province) continue;
    if (q && !u.search.includes(q)) continue;
    if (k < 0) { out.push(u); continue; }
    const plots = u.types?.[k] || 0, records = u.typeRecords?.[k] || 0;
    if (records > 0) out.push({...u, plots, records, base: u});
  }
  return out;
}

/** Projects under the filters (house type · publisher · province of the pin or the source · search). */
export function filterSites(sites, f = {}) {
  const q = lower(f.search).trim();
  return sites.filter(s => (!f.house || s.type?.id === f.house) && (!f.dev || s.company?.id === f.dev) &&
    (!f.province || s.province === f.province) && (!q || s.search.includes(q)));
}

/** No quiet roster in this dataset (the University family's context dots). */
export const filterRoster = () => [];

/** Totals of a set of district rows. */
export function summarize(units = []) {
  const provs = new Set();
  let plots = 0, records = 0;
  for (const u of units) { plots += u.plots || 0; records += u.records || 0; provs.add(u.province); }
  return {count: units.length, plots, records, districts: units.length, provinces: provs.size};
}

/** Plots (or records) per plot type of a set of district rows — every type listed, zero included. */
export function typeMixOf(units, types = PLOT_TYPES, metric = 'plots') {
  const by = types.map((t, i) => ({...t, index: i, id: t.id, plots: 0, records: 0, value: 0, count: 0}));
  for (const u of units) {
    const row = u.base || u;
    row.types?.forEach((v, i) => { if (by[i]) { by[i].plots += v; } });
    row.typeRecords?.forEach((v, i) => { if (by[i]) { by[i].records += v; by[i].count += v; } });
  }
  for (const x of by) x.value = metric === 'records' ? x.records : x.plots;
  return by;
}

/** Projects per house type (projects carry no plots: a count of projects). */
export function siteTypeMixOf(sites, types) {
  const by = new Map(types.map(t => [t.id, {...t, count: 0}]));
  for (const s of sites) if (s.type) by.get(s.type.id).count++;
  return [...by.values()];
}

/** Per-province totals of a set of district rows: Map(code → {code, value, count, plots, records}). */
export function provinceTotals(units, metric = 'plots') {
  const by = new Map();
  for (const u of units) {
    let p = by.get(u.province);
    if (!p) by.set(u.province, p = {code: u.province, value: 0, count: 0, plots: 0, records: 0});
    p.value += unitValue(u, metric); p.count++; p.plots += u.plots || 0; p.records += u.records || 0;
  }
  return by;
}

/** District rows ranked by the measure (the province Aha and the district chart): {id, name, value, plots, records, …}. */
export function districtsOf(units, metric = 'plots') {
  return units.map(u => ({unit: u, id: u.id, name: u.name, province: u.province, series: 0, value: unitValue(u, metric), plots: u.plots, records: u.records, count: u.records}))
    .sort((a, b) => b.value - a.value || b.plots - a.plots || COLLATOR.compare(a.name, b.name));
}

/** District rows ranked by the measure (ties by plots, then name). */
export const unitOrder = (a, b) => b.plots - a.plots || b.records - a.records || COLLATOR.compare(a.name, b.name);
/** Projects in reading order: on the map first, an extent first, then name. */
export const siteOrder = (a, b) => (hasPoint(b) - hasPoint(a)) || ((b.extent >= 0) - (a.extent >= 0)) || COLLATOR.compare(a.name, b.name);

/** Straight-line distance in metres. */
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371008.8, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
};

/**
 * Production CityMETER: its estate layer (`?d=estate`) reads the same records by province and district — the deep link
 * of a province or a district in the shared path grammar (js/shell/area-path.js).
 */
export const PRODUCTION_DATASET = 'estate';
export function productionLink({province = '', district = ''} = {}) {
  if (!province) return productionHref(PRODUCTION_DATASET);
  return productionHref(PRODUCTION_DATASET, district ? {province, kind: 'D', code: district} : {province, kind: 'P', code: ''});
}
/** The DOL website page of a record (23_NATIONAL_MASTER DOL_url: https://www.dol.go.th/land/<id>/). */
export const dolLink = id => (/^\d{18}$/.test(String(id || '')) ? `https://www.dol.go.th/land/${id}/` : '');
/** Other demos of the same registry (context links). */
export const TRANSIT_SITE = 'https://montri-th.github.io/transit/';
export const stationLink = s => (s?.id ? `${TRANSIT_SITE}?station=${encodeURIComponent(s.id)}` : '');

/* ---------- records (data/records.json, after the first paint) ---------- */

/** Name states of a record (23 B): the source's name · none in the source · names that disagree · a government report's name. */
export const NAME_STATES = Object.freeze(['src', 'none', 'conflict', 'gov']);

/**
 * Decode data/records.json: one object per DOL record, with its production district row and the projects the research
 * team paired with it. `data` is the decoded estates dataset (its district rows and projects).
 */
export function decodeRecords(json, data) {
  if (!json?.cols?.id || !Array.isArray(json.cols.id)) throw new Error('Invalid records file');
  const C = json.cols, provinces = json.provinces || [], districts = json.districts || [], allocators = json.allocators || [], places = json.places || [];
  const unitById = new Map((data?.units || []).map(u => [u.id, u]));
  const held = new Set(json.held || []);
  const records = C.id.map((id, i) => {
    const alt = json.alt?.[i] || {};
    const addr = C.addr[i];
    const r = {id, kind: 'rec', index: i, name: C.name[i] || '', state: NAME_STATES[C.state[i]] || 'src', allocator: C.al[i] >= 0 ? allocators[C.al[i]] || '' : '',
      province: provinces[C.p[i]] || '', district: districts[C.d[i]] || '', plots: C.n[i], types: C.t[i] || null, scope: C.s[i],
      dolAddress: addr ? addr.map(k => (k >= 0 ? places[k] : '')) : null, alt: alt.alt || '', external: alt.ext || '', gov: alt.gov || '',
      held: held.has(i), pairs: (json.pairs?.[i] || []).map(([si, level]) => ({site: data?.sites?.[si] || null, level})).filter(p => p.site)};
    r.unit = unitById.get(r.district) || null;
    r.search = lower([r.name, r.alt, r.external, r.allocator, id].join(' '));
    return r;
  });
  const byId = new Map(records.map(r => [r.id, r]));
  const byDistrict = new Map();
  for (const r of records) { let l = byDistrict.get(r.district); if (!l) byDistrict.set(r.district, l = []); l.push(r); }
  const bySite = new Map();
  for (const r of records) for (const p of r.pairs) { let l = bySite.get(p.site.id); if (!l) bySite.set(p.site.id, l = []); l.push({record: r, level: p.level}); }
  return {meta: json.meta || {}, records, byId, byDistrict, bySite};
}

/** Records in reading order: plots first (held totals last), then the name, then the id. */
export const recordOrder = (a, b) => (b.plots ?? -1) - (a.plots ?? -1) || COLLATOR.compare(a.name || '~', b.name || '~') || (a.id < b.id ? -1 : 1);
/** The value a record adds under a measure and a plot type (null types: the record's total is held). */
export function recordValue(r, metric = 'plots', type = '') {
  const k = type ? plotIndex(type) : -1;
  if (metric === 'records') return k < 0 ? 1 : (r.types?.[k] || 0) > 0 ? 1 : 0;
  if (k < 0) return r.plots || 0;
  return r.types?.[k] || 0;
}
