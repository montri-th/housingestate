/**
 * View models of the reading panel. Pure: data in, plain objects out (js/panel.js renders them).
 *
 * Two grains (DATA_METHOD.md §2): the measure is read over DOL records by the production district and province each is
 * counted in; researched projects are places on the map and carry no plots of their own. A project shows the records the
 * research team paired with it as those records (“ระเบียนกรมที่ดินที่จับคู่”), never as the project's size. Distances are
 * straight lines between reference points.
 */
import {summarize, typeMixOf, siteTypeMixOf, provinceTotals, districtsOf, unitValue, distanceM, hasPoint, siteOrder, unitOrder,
  recordOrder, PLOT_TYPES} from './model.js';

const COLLATOR = new Intl.Collator('th');
/** A station's radius: the projects whose reference point lies within it (straight line). */
export const STATION_RADIUS_M = 1000;

/** Provinces ranked by the measure (each with its value, records and plots). */
export function rankProvinces(units, {metric = 'plots', nameOf = c => c} = {}) {
  return [...provinceTotals(units, metric).values()].map(p => ({...p, id: p.code, name: nameOf(p.code)}))
    .filter(p => p.value > 0).sort((a, b) => b.value - a.value || b.plots - a.plots || COLLATOR.compare(a.name, b.name));
}

/** Stations of CityMETER · Transit with the most projects (with a point) within `radius`, each project at its nearest one. */
export function stationsOf(sites, stations, {radius = STATION_RADIUS_M, limit = 6} = {}) {
  const by = new Map();
  for (const s of sites) {
    if (!hasPoint(s) || !s.rail || s.rail.m > radius) continue;
    let x = by.get(s.rail.station.id);
    if (!x) by.set(s.rail.station.id, x = {station: s.rail.station, count: 0, sites: []});
    x.count++; x.sites.push(s);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || COLLATOR.compare(a.station.name, b.station.name)).slice(0, limit);
}

/** Publishers of a set of projects, ranked by how many of them they list (ties by name). */
export function companiesOf(sites, {limit = 8} = {}) {
  const by = new Map();
  for (const s of sites) {
    if (!s.company) continue;
    let x = by.get(s.company.id);
    if (!x) by.set(s.company.id, x = {company: s.company, id: s.company.id, name: s.company.name, count: 0, located: 0});
    x.count++; if (hasPoint(s)) x.located++;
  }
  return [...by.values()].sort((a, b) => b.count - a.count || COLLATOR.compare(a.name, b.name)).slice(0, limit);
}

/** Facts of a set of projects: how many, on the map, with an extent, near rail, with a launch in the window. */
export function siteFacts(sites) {
  const located = sites.filter(hasPoint);
  return {count: sites.length, located: located.length, extents: sites.filter(s => s.extent >= 0).length,
    rail: located.filter(s => s.rail && s.rail.m <= STATION_RADIUS_M).length, launch: sites.filter(s => s.launchWindow === 'in').length,
    paired: sites.filter(s => s.pairs > 0).length};
}

/**
 * The overview of the selection: Thailand, or the province of the จังหวัด filter.
 * units: district rows of the scope (the province's, or every one); sites: projects of the scope (already narrowed by the
 * search, the house type and the province); allUnits: every district row of the filters without the province (the
 * province's national rank).
 */
export function buildOverview(units, sites, {province = '', metric = 'plots', allUnits = units, nameOf = c => c, stations = [], houseTypes = [], plotTypes = PLOT_TYPES} = {}) {
  const summary = summarize(units);
  const overview = {
    province, summary, metric,
    plotTypes: typeMixOf(units, plotTypes, metric),
    sites: {...siteFacts(sites), byType: siteTypeMixOf(sites, houseTypes)},
    companies: companiesOf(sites),
    stations: stationsOf(sites, stations),
  };
  if (!province) {
    overview.provinces = rankProvinces(units, {metric, nameOf});
  } else {
    overview.districts = districtsOf(units.filter(u => u.province === province), metric).filter(x => x.value > 0);
    const ranked = rankProvinces(allUnits, {metric, nameOf});
    const i = ranked.findIndex(p => p.code === province);
    overview.rank = i >= 0 ? {rank: i + 1, of: ranked.length} : null;
    overview.sitesList = [...sites].sort(siteOrder);
  }
  return overview;
}

/** Other projects near a project (straight line ≤ radius), nearest first: the context round an estate. */
export function sitesNear(site, sites, {radius = 3000, limit = 8} = {}) {
  if (!hasPoint(site)) return [];
  const out = [];
  for (const s of sites) {
    if (s === site || !hasPoint(s)) continue;
    const d = distanceM(site.latitude, site.longitude, s.latitude, s.longitude);
    if (d <= radius) out.push({site: s, d});
  }
  return out.sort((a, b) => a.d - b.d || COLLATOR.compare(a.site.name, b.site.name)).slice(0, limit);
}

/**
 * A project: its publisher, its own page and catalogue, the labels and launch the source showed, the legal roles,
 * parents and issuer facts the research team found, the DOL records paired with it (once data/records.json is in) and
 * the projects round it. `portfolio` (data/portfolio.json, by key) and `records` (decoded records) are null while loading.
 */
export function buildSiteDetail(site, {data, portfolio = null, records = null, extent = null} = {}) {
  const company = site.company;
  const entry = portfolio ? portfolio.projects?.[site.id] || {} : null;
  const pairs = records ? (records.bySite.get(site.id) || []).slice().sort((a, b) => recordOrder(a.record, b.record)) : null;
  const sameBrand = site.brand ? company.sites.filter(s => s !== site && s.brand === site.brand) : [];
  const siblings = company.sites.filter(s => s !== site && !sameBrand.includes(s));
  return {
    site, company, entry, pairs, extent,
    unit: site.district ? data.units.find(u => u.id === site.district) || null : null,
    sameBrand, siblings,
    near: sitesNear(site, data.sites),
    portfolioLoaded: Boolean(portfolio), recordsLoaded: Boolean(records),
  };
}

/** A publisher (02_COMPANIES): its listed projects, where they are, by house type and brand; the events it reported. */
export function buildCompanyProfile(company, {portfolio = null, houseTypes = []} = {}) {
  const sites = [...company.sites].sort(siteOrder);
  const provinces = new Map();
  for (const s of sites) if (s.province) provinces.set(s.province, (provinces.get(s.province) || 0) + 1);
  const brands = new Map();
  for (const s of sites) if (s.brand) brands.set(s.brand, (brands.get(s.brand) || 0) + 1);
  return {company, sites, facts: siteFacts(sites), byType: siteTypeMixOf(sites, houseTypes).filter(t => t.count > 0).sort((a, b) => b.count - a.count),
    provinces: [...provinces].map(([code, count]) => ({code, count})).sort((a, b) => b.count - a.count || COLLATOR.compare(a.code, b.code)),
    brands: [...brands].map(([name, count]) => ({name, count})).sort((a, b) => b.count - a.count || COLLATOR.compare(a.name, b.name)),
    events: portfolio ? portfolio.companyEvents?.[company.id] || [] : null, portfolioLoaded: Boolean(portfolio)};
}

/**
 * A production district (เขต/อำเภอ): its records and plots by plot type, its share and rank in the province, the
 * projects whose pin lies in it and its records (once data/records.json is in), most plots first.
 */
export function buildDistrictProfile(unit, {data, records = null, metric = 'plots', sites = data.sites} = {}) {
  const inProvince = data.units.filter(u => u.province === unit.province);
  const ranked = districtsOf(inProvince, metric).filter(x => x.value > 0);
  const i = ranked.findIndex(x => x.id === unit.id);
  const provinceTotal = inProvince.reduce((s, u) => s + unitValue(u, metric), 0);
  const list = records ? [...(records.byDistrict.get(unit.id) || [])].sort(recordOrder) : null;
  return {unit, metric, types: typeMixOf([unit], PLOT_TYPES, metric), rank: i >= 0 ? {rank: i + 1, of: ranked.length} : null,
    share: {value: unitValue(unit, metric), total: provinceTotal},
    sites: sites.filter(s => s.district === unit.id).sort(siteOrder), records: list, recordsLoaded: Boolean(records)};
}

/** A DOL record: its plots by type, its district row and the projects the research team paired with it. */
export function buildRecordProfile(record, {data, atPoint = [], pointsMeta = null, extent = null}) {
  const unit = record.unit || data.units.find(u => u.id === record.district) || null;
  const types = PLOT_TYPES.map((t, i) => ({...t, index: i, value: record.types?.[i] || 0}));
  // The point production draws for the record (data/record-points.json, 0.2.0) and the other records it put there.
  const point = Number.isFinite(record.lon) && Number.isFinite(record.lat) ? [record.lon, record.lat] : null;
  // The extent the open record lights (its own OpenStreetMap area, else a paired project's; js/app.js#subjectExtent).
  return {record, unit, types, pairs: record.pairs, point, atPoint: point ? atPoint : [], pointsMeta, extent};
}

/** The projects whose point lies within `radius` of a station (straight line), nearest first. */
export function buildStationProfile(station, {sites, radius = STATION_RADIUS_M} = {}) {
  const rows = [];
  for (const s of sites) {
    if (!hasPoint(s)) continue;
    const d = distanceM(station.lat, station.lon, s.latitude, s.longitude);
    if (d <= radius) rows.push({site: s, d});
  }
  rows.sort((a, b) => a.d - b.d || COLLATOR.compare(a.site.name, b.site.name));
  return {station, radius, rows: rows.map(r => r.site), distance: new Map(rows.map(r => [r.site.id, r.d])),
    extents: rows.filter(r => r.site.extent >= 0).length};
}

/**
 * A drawn building of an open estate's extent (display only): the estate, where its outline and height come from. A
 * building carries no plot or house count — the extent is an approximate picture, the record is the DOL's.
 */
export function buildBuildingProfile(sel) {
  return {key: sel?.key || '', kind: sel?.kind || 'osm', height: sel?.height ?? null, site: sel?.site || null};
}

/** Share helpers for the charts and tests. */
export const totalOf = (units, metric = 'plots') => units.reduce((s, u) => s + unitValue(u, metric), 0);
export {unitOrder};

/**
 * What a search finds (the finder above the overview): provinces and districts by name, publishers by name, projects by
 * name, brand, publisher or place, and DOL records by name, other names or allocator once data/records.json is in. The
 * search never narrows the measure: records and plots stay those of the filters.
 */
export function buildSearch(query, {data, records = null, index = null, provinces = [], limit = 8} = {}) {
  const q = String(query || '').toLocaleLowerCase('th-TH').trim();
  if (!q) return null;
  const hit = v => String(v || '').toLocaleLowerCase('th-TH').includes(q);
  const prov = provinces.filter(p => hit(p.th) || hit(p.en));
  const units = data.units.filter(u => hit(u.name) || hit(u.nameEn)).sort(unitOrder);
  const companies = data.companies.filter(u => hit(u.name) || u.brands.some(hit)).sort((a, b) => b.sites.length - a.sites.length || COLLATOR.compare(a.name, b.name));
  const sites = data.sites.filter(s => s.search.includes(q)).sort(siteOrder);
  const recs = records ? records.records.filter(r => r.search.includes(q)).sort(recordOrder) : null;
  return {query: String(query).trim(), provinces: prov, units: units.slice(0, limit), unitCount: units.length,
    companies: companies.slice(0, limit), companyCount: companies.length, sites: sites.slice(0, limit), siteCount: sites.length,
    records: recs ? recs.slice(0, limit) : null, recordCount: recs ? recs.length : null, index};
}
