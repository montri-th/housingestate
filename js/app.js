/**
 * CityMETER · Housing Estate — application orchestration (the CityMETER · Hotel family code base, through CityMETER ·
 * University 0.1.5, montri-th/university @f610edb).
 *
 * Two grains, never added to each other (DATA_METHOD.md §2):
 *   records  — DOL website allocation records of the CityMETER production snapshot (19,753): the measure (allocated plots
 *              reported, or records) is read over them by the production district and province each is counted in. The
 *              district rows of data/estates.json are their totals; the records themselves load after the first paint
 *              (data/records.json) for the record view, the district's list, the table and the search.
 *   projects — entries of the developers' own catalogues the research team collected (01_PROJECTS): pins, approximate
 *              extents, labels, launches and prices as the source showed them, legal roles and issuer facts. A project
 *              carries no plots; the records the research team paired with it are listed as records.
 * Scopes, named the same way everywhere:
 *   unitNational / siteNational — district rows and projects after the plot-type, house-type and search filters, before
 *                                 the province filter: the province frames, the national Aha and every national rank.
 *   unitScope / siteScope        — the same narrowed by the จังหวัด filter (when set): the panel, the pins, the table.
 * The search is a finder: it narrows the projects and the records of the table and lists what it found above the
 * overview, never the measure (the plots of the filters stay on the map).
 *
 * Focus: Thailand opens on the Aha's provinces (up to three with the most of the measure, js/area-insight.js) under the
 * focus stroke, framed; “ดูทุกจังหวัดเท่ากัน” (?areas=all) drops the stroke. A province is filled under its selection
 * stroke, the others go quiet, and its districts carry the measure as chips. 3D where buildings are: a project (its
 * extent, in the model preset, the drawn buildings inside it lit), a station, a building of an open estate (two-point
 * camera); the province-scale views are framed in plan.
 *
 * Map clicks, in order: project pin → the building being looked at (x-ray: frame again) → a building in the open
 * estate's extent → station → an estate extent → a province. Quiet context dots are never targets.
 * Panel modes: overview | site (project) | company | unit (district) | record | station | building (with a back stack).
 * URL state (own names, inside): filters, metric, areas, view, site, record, station, company, district, view3d —
 * written in the shared grammar d · at · e · n · m · f.* · focus · view · v3d by citymeter-shell (js/shell/url.js),
 * with a browser history entry per level.
 */
import {registerDataNames, registerRecordNames, registerPortfolioNames} from './lang.js';
import {provinces as provinceList, provinceByCode, provinceCodeFrom, setProvinces, decodeDataset, decodeRecords, filterUnits, filterSites, hasPoint, unitWords,
  pinRadius, recordOrder, PLOT_TYPES} from './model.js';
import {buildAreaIndex, areaWord} from './areas.js';
import {summarizeInsight} from './area-insight.js';
import {renderInsightChart} from './charts.js';
import {loadMapLibrary} from './shell/vendors.js';
import {installBranchPins} from './pins.js';
import {installAreaLabels, PROVINCE_VIEW_MIN_ZOOM} from './map-layers.js';
import {installProvinceLayers, buildProvinceModel, provinceLocator, PROVINCE_FILL_MAX_ZOOM, PROVINCE_LABEL_MAX_ZOOM} from './provinces.js';
import {buildOverview, buildSiteDetail, buildCompanyProfile, buildDistrictProfile, buildRecordProfile, buildStationProfile, buildBuildingProfile, buildSearch,
  STATION_RADIUS_M} from './profile-model.js';
import {renderOverview, renderSite, renderCompany, renderDistrict, renderRecord, renderStation, renderBuilding, renderFilterChips, terrainChipsHTML, esc, num, pct,
  meters, rai, districtName, recordName} from './panel.js';
import {installStationLayer} from './stations.js';
import {joinBuildings} from './shell/building-join.js';
import {buildMapStyle, basemapPalette, TILEJSON_URL, MASSING_BEFORE, VENUE_XRAY_BEFORE} from './shell/map-style.js';
import {installMassing, outerRings, FOCUS_MIN_ZOOM} from './massing.js';
import {squareAround, ringsBox, siteContextRegions, cameraSquare} from './regions.js';
import {createBuildingUnitStore, cmTileUrl, CM_ATTRIBUTION} from './shell/building-units.js';
import {presetFor, applyPreset, fitPitched, fitBuilding, twoPointBearing, screenBounds, groundAt, BUILDING_MAX_ZOOM} from './shell/camera.js';
import {installVenueXray} from './shell/venue-xray.js';
import {guardRetainedTiles, guardElevationFreeze, mapBudget, budgetPixelRatio, watchContext} from './shell/maplibre-guard.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText, DATASET} from './breadcrumb.js';
import {rampLegendHTML, buildMetricRamp, classify} from './scales.js';
import {cueMarkup} from './cues.js';
import {installSiteLabels} from './labels.js';
import {extentPolygons, buildingsInExtent} from './extent-buildings.js';
import {installTerrain, terrainFacts, terrainChips} from './shell/terrain.js';
import {createCodec, createNavigator} from './shell/url.js';
import {pageTitle} from './shell/title.js';
import {decodeExtents, installExtentLayers, extentCollection} from './extents.js';

const $ = id => document.getElementById(id);
const FIELDS = ['search', 'type', 'house', 'province'];
const BANGKOK = {center: [100.56, 13.735], zoom: 11.5};
/** Release tag of this module (index.html import map) — also versions the data files fetched later. */
const RELEASE = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
const THEME_KEY = 'citymeter-housingestate-theme';
const COLLATOR = new Intl.Collator('th');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobilePortrait = () => matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
/** Panel modes with an `e` item of their own (a district is an `at` level, a developer an `n` network). */
const ITEM_MODES = ['site', 'record', 'station'];
/** Optional files, loaded after the first paint or when a view needs them. */
const LAZY = Object.freeze({extents: 'data/extents.json', portfolio: 'data/portfolio.json', records: 'data/records.json'});

const state = {
  data: null, index: null, provincesGeo: null,
  // Optional files (LAZY): the decoded file, its promise while loading, and whether it failed.
  extents: null, portfolio: null, records: null, loading: {}, failed: {},
  unitNational: [], siteNational: [], unitScope: [], siteScope: [], recordScope: null, contextRows: [], insight: null, scopeKey: '',
  view: 'provinces', page: 0, metric: 'plots', stationById: new Map(), stationProfile: null, stations: null,
  autoFocus: true, focusIds: [], selectedId: '',
  panel: {mode: 'overview', id: ''}, history: [],
  map: null, loaded: false, mapTheme: '', popup: null, initialCameraDone: false, tileTemplate: '',
  view3d: true, showAreas: true,
  pins: null, massing: null, siteLabels: null, provinceLayers: null, provinceLabels: null, districtLabels: null, provinceModel: null, extentLayers: null,
  siteById: new Map(), siteIndex: new Map(), companyById: new Map(), unitById: new Map(),
  join: null, estateLit: null, buildingSel: null, locateProvince: null, lastPreset: '', blueBuildings: false,
  // Building camera: the x-ray solid, what was framed last ({id, key, refits}) and whether the user moved the map since.
  xray: null, framed: null, userCamera: false,
};

/* ---------- address (citymeter-shell, js/shell/url.js) ---------- */
// The page keeps its own parameter names inside (saveURL / restoreFromURL); the shell writes them in the shared
// grammar d · at · e · n · m · f.* · focus · view · v3d: a district is an `at` level (BKK/D/1012, the production
// district the records are counted in), a project, a DOL record and a station are `e` items, a developer an `n`
// network (company). The `e` and `n` kinds are provisional until the dataset registry declares them.
const nav = createNavigator(createCodec({
  dataset: DATASET, levels: ['P', 'D'], place: {D: 'district'},
  provinceOf: (code, kind) => (kind === 'D' ? state.index?.byId.get(code)?.province || '' : ''),
  items: {site: 'site', record: 'record', station: 'station'}, networks: {company: 'company'}, filters: FIELDS,
}), {onPop: restoreFromHistory});

/* ---------- helpers ---------- */
const values = () => Object.fromEntries(FIELDS.map(k => [k, $(k).value]));
const unit = () => unitWords(state.metric);
const siteById = id => state.siteById.get(id) || null;
const companyById = id => state.companyById.get(id) || null;
/** A district row: its records' totals, or a measured-zero row for a district of the index without a record. */
const unitById = id => {
  if (!id) return null;
  const u = state.unitById.get(id);
  if (u) return u;
  const a = state.index?.byId.get(id);
  return a ? {id, kind: 'unit', name: a.name, nameEn: a.nameEn, province: a.province, records: 0, plots: 0, types: PLOT_TYPES.map(() => 0), typeRecords: PLOT_TYPES.map(() => 0), count: 0, zero: true} : null;
};
const recordById = id => (id && state.records?.byId.get(id)) || null;
const stationById = id => (id && state.stationById.get(id)) || null;
const provinceRecord = code => state.index.provinceById.get(code) || null;
const nameOf = code => provinceByCode(code)?.th || code || '';
// Null-safe: an embedding page or extension may detach the tray while map callbacks are still queued.
const bottomSpace = () => ($('insights')?.getBoundingClientRect().height ?? 0) + 12;
/** Area/province labels also keep clear of the map attribution (its live height is --attrib-height on .map-panel). */
const labelBottomSpace = () => { const panel = document.querySelector('.map-panel'); return bottomSpace() + (panel ? parseFloat(getComputedStyle(panel).getPropertyValue('--attrib-height')) || 0 : 0); };
const activeFilterCount = f => FIELDS.filter(k => f[k]).length;
const overviewPanel = () => ({mode: 'overview', id: ''});
const announce = text => { $('announcement').textContent = text; };
const theme = () => document.documentElement.dataset.theme;
const focusMode = () => (state.autoFocus ? 'auto' : 'none');
const sheetOpen = () => mobilePortrait() && $('panel').classList.contains('is-open');
const animate = () => !reduced();
const cssVar = (name, fallback = '') => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
/** The building being looked at (building mode): {key, kind, footprint, geoms, height, site}. */
const currentBuilding = () => (state.panel.mode === 'building' ? state.buildingSel : null);
/** The open project (site mode), or the project of the open building. */
const openSite = () => (state.panel.mode === 'site' ? siteById(state.panel.id) : state.panel.mode === 'building' ? state.buildingSel?.site || null : null);
/**
 * A building of an open estate is looked at in two-point perspective (eye), framed to the free part of the map (the
 * Fitness / Shopping centers building camera, owner 2026-10-29: “อาคารที่เลือก หรือ on focus ให้แสดงด้วยมุมมอง 2-point
 * perspective เสมอ zoom to fit viewport เสมอ”); a project is framed whole (its extent) in the model preset.
 */
const twoPoint = () => state.panel.mode === 'building';
const cameraPreset = () => presetFor({view3d: state.view3d, mode: state.panel.mode === 'overview' ? 'overview' : 'detail', twoPoint: twoPoint()});

function saveURL() {
  const f = values(), p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  if (state.metric !== 'plots') p.set('metric', state.metric);
  if (!state.autoFocus) p.set('areas', 'all');
  if (state.view !== 'provinces') p.set('view', state.view);
  const {mode, id} = state.panel;
  if (ITEM_MODES.includes(mode) && id) p.set(mode, id);
  if (mode === 'company' && id) p.set('company', id);
  if (mode === 'unit' && id) p.set('district', id);
  if (!state.view3d) p.set('view3d', '0');
  // A building view has no address of its own: the address stays on the project it was opened from.
  if (mode !== 'building') nav.commit(p);
}

/* ---------- theme ---------- */
function applyTheme() {
  const value = $('theme').value;
  const next = value === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, value); } catch {}
  if (state.map && next !== state.mapTheme) {
    state.loaded = false;
    disposeSpatial();
    state.mapTheme = next;
    state.map.setStyle(buildMapStyle(next), {diff: false});
  }
  if (state.data) drawChart();
}

function disposeSpatial() {
  for (const k of ['siteLabels', 'terrain', 'xray', 'massing', 'pins', 'stations', 'extentLayers']) { try { state[k]?.dispose(); } catch (e) { console.warn('dispose', k, e); } state[k] = null; }
  state.provinceLayers = null; state.join = null; state.estateLit = null; refreshJoin.key = ''; syncFocusBuilding.key = ''; syncExtents.key = '';
}

/* ---------- selection ---------- */
function refreshScope() {
  const f = values();
  const key = `${JSON.stringify(f)}|${state.records ? 'r' : ''}`;
  if (key === state.scopeKey) return;
  state.scopeKey = key;
  // The measure: the plot type (and the province below) — never the search, a finder of projects and records.
  state.unitNational = filterUnits(state.data.units, {type: f.type});
  state.siteNational = filterSites(state.data.sites, {house: f.house, search: f.search});
  state.unitScope = f.province ? state.unitNational.filter(u => u.province === f.province) : state.unitNational;
  state.siteScope = f.province ? state.siteNational.filter(s => s.province === f.province) : state.siteNational;
  // Quiet dots: every project of the filters (a focus symbol covers its own dot).
  state.contextRows = state.siteNational;
  state.recordScope = state.records ? filterRecords(state.records.records, f) : null;
}

/** DOL records of the filters (the table): the plot type they report, the province, the search. */
function filterRecords(records, f) {
  const k = f.type ? PLOT_TYPES.findIndex(t => t.id === f.type) : -1;
  const q = String(f.search || '').toLocaleLowerCase('th-TH').trim();
  return records.filter(r => (k < 0 || (r.types?.[k] || 0) > 0) && (!f.province || r.province === f.province) && (!q || r.search.includes(q)));
}

function update({fit = false} = {}) {
  refreshScope();
  const f = values();
  if (f.search && !state.records) ensureRecords();
  const station = state.panel.mode === 'station' ? stationById(state.panel.id) : null;
  state.insight = summarizeInsight(state.unitNational, {metric: state.metric, province: f.province, provinces: provinceList(), nameOf, type: f.type});
  state.focusIds = state.autoFocus && !f.province ? state.insight.ids : [];
  state.stationProfile = station ? buildStationProfile(station, {sites: state.siteNational}) : null;
  state.provinceModel = state.provincesGeo?.features?.length ? buildProvinceModel(state.unitNational, state.provincesGeo, {metric: state.metric}) : null;
  state.page = 0;

  // Keep the panel honest: a project outside the filters closes; a station or a record that is not known closes.
  const fallback = () => overviewPanel();
  if (state.panel.mode === 'site' && !state.siteNational.some(s => s.id === state.panel.id)) { state.panel = fallback(); state.history = []; }
  if (state.panel.mode === 'company' && !companyById(state.panel.id)) state.panel = fallback();
  if (state.panel.mode === 'unit' && !unitById(state.panel.id)) state.panel = fallback();
  if (state.panel.mode === 'record' && state.records && !recordById(state.panel.id)) state.panel = fallback();
  if (state.panel.mode === 'station' && !station) { state.panel = fallback(); state.history = []; }
  if (state.panel.mode === 'building' && !state.buildingSel) state.panel = fallback();
  if (state.panel.mode !== 'site') { state.selectedId = ''; state.pins?.select(''); state.popup?.remove(); state.popup = null; }
  else state.selectedId = state.panel.id;
  state.stations?.select(state.panel.mode === 'station' ? state.panel.id : '', STATION_RADIUS_M);

  $('filter-count').textContent = activeFilterCount(f) ? String(activeFilterCount(f)) : '';
  $('filter-chips').innerHTML = renderFilterChips(f, {
    type: Object.fromEntries(PLOT_TYPES.map(t => [t.id, t.th])),
    house: Object.fromEntries(state.data.types.map(t => [t.id, t.th])),
    province: Object.fromEntries(provinceList().map(p => [p.code, p.th]))});
  renderPanel();
  renderLegend();
  syncMetricSwitch();
  if (state.loaded) {
    updatePins();
    // A fit is about to move the camera to the subject: no square round where the camera was (followCamera reads
    // the camera again when the move ends).
    if (fit) state.cameraHeld = true;
    updateSpatialLayers();
    if (fit) fitMap();
    else if (state.lastPreset && cameraPreset() !== state.lastPreset && !twoPoint()) applyPreset(state.map, cameraPreset(), {animate: animate()});
    state.lastPreset = cameraPreset();
  }
  drawChart();
  syncList();
  saveURL();
  const plots = state.unitScope.reduce((n, u) => n + u.plots, 0), records = state.unitScope.reduce((n, u) => n + u.records, 0);
  announce(`พบ ${num(plots)} แปลงจัดสรร ใน ${num(records)} รายการ · ${num(state.siteScope.length)} โครงการ`);
}

/** Projects with full detail on the map: the open station's, the open developer's, else the scope's. */
function detailSites() {
  if (state.panel.mode === 'station' && state.stationProfile) return state.stationProfile.rows;
  if (state.panel.mode === 'company') return companyById(state.panel.id)?.sites || [];
  return state.siteScope;
}

/** The records of the table: the open district's, else those of the filters (null while the records load). */
function tableRecords() {
  if (!state.records) return null;
  if (state.panel.mode === 'unit') {
    const f = values(), k = f.type ? PLOT_TYPES.findIndex(t => t.id === f.type) : -1;
    return (state.records.byDistrict.get(state.panel.id) || []).filter(r => k < 0 || (r.types?.[k] || 0) > 0);
  }
  return state.recordScope;
}

/** Counter + table: the DOL records of the scope (the grain of the measure). */
function syncList() {
  const list = tableRecords();
  $('result-count').textContent = list ? num(list.length) : '…';
  $('results-title').textContent = state.panel.mode === 'unit' ? `รายการจัดสรรใน${districtName(unitById(state.panel.id), unitById(state.panel.id)?.province)}` : 'รายการจัดสรรตามตัวกรอง';
  const sig = `${list ? list.length : '-'}|${state.scopeKey}|${state.panel.mode === 'unit' ? state.panel.id : ''}`;
  if (syncList.sig !== sig) state.page = 0;
  syncList.sig = sig;
  renderTable();
}

function updatePins() {
  if (!state.pins) return;
  const focus = detailSites();
  const selected = state.selectedId ? siteById(state.selectedId) : null;
  const list = selected && !focus.includes(selected) ? [...focus, selected] : focus;
  state.pins.update(list, {context: state.contextRows});
  if (state.selectedId) state.pins.select(state.selectedId);
  state.siteLabels?.update(list, {selectedId: state.selectedId});
}

/* ---------- optional files (on demand) ---------- */
/**
 * Load one of the optional files (LAZY) once: after the first paint, or at once when a view needs it. A failure is said
 * on the page (PARTIAL) and leaves the rest working; the views that wait for it say so instead of staying empty.
 */
function ensureFile(name) {
  if (state[name] || state.loading[name]) return state.loading[name] || Promise.resolve(state[name]);
  if (state.failed[name]) return Promise.resolve(null);
  const resource = LAZY[name];
  state.loading[name] = fetchJSON(`${resource}${RELEASE ? `?v=${RELEASE}` : ''}`, {timeout: name === 'records' ? 60000 : 40000})
    .then(json => {
      if (name === 'extents') state.extents = decodeExtents(json);
      else if (name === 'portfolio') { if (!json?.projects) throw new Error('Invalid portfolio file'); state.portfolio = json; registerPortfolioNames(json); }
      else { state.records = decodeRecords(json, state.data); registerRecordNames(state.records); }
      state.loading[name] = null;
      onFileLoaded(name);
      return state[name];
    })
    .catch(e => { state.loading[name] = null; state.failed[name] = true; partial(resource); console.warn(`${resource} unavailable`, e); renderPanel(); return null; });
  return state.loading[name];
}
const ensureExtents = () => ensureFile('extents');
const ensurePortfolio = () => ensureFile('portfolio');
const ensureRecords = () => ensureFile('records');

/** What a file that arrived changes: the views that wait for it, the table, the extents on the map. */
function onFileLoaded(name) {
  const {mode} = state.panel;
  if (name === 'records') {
    state.scopeKey = '';
    refreshScope();
    if (mode === 'record') { const r = recordById(state.panel.id); if (r) alignProvince(r.province); update(); if (state.loaded && !state.userCamera) fitMap(); return; }
    syncList();
    renderPanel();
    return;
  }
  if (name === 'extents' && state.loaded) { updateSpatialLayers(); if (mode === 'site' && !state.userCamera) fitSite(siteById(state.panel.id)); }
  if (['site', 'company', 'building'].includes(mode)) renderPanel();
}

/* ---------- breadcrumb ---------- */
function renderCrumbs() {
  const {mode, id} = state.panel;
  const site = openSite();
  const record = mode === 'record' ? recordById(id) : null;
  const districtId = mode === 'unit' ? id : site?.district || record?.district || '';
  const area = districtId ? state.index.byId.get(districtId) || null : null;
  const province = site?.province || area?.province || record?.province || $('province').value;
  const crumbs = buildBreadcrumb({province, area: area && area.province === province ? {id: area.id, name: area.name, province: area.province} : null,
    site: site ? {id: site.id, name: site.name, province: site.province} : null});
  $('crumbs').innerHTML = renderBreadcrumb(crumbs);
  // Tab title: what the view shows, then the product, ≤ 60 characters (LDS FAVICON-01, js/shell/title.js).
  const st = mode === 'station' ? stationById(id) : null;
  const place = crumbs[crumbs.length - 1].label;
  document.title = pageTitle(mode === 'site' ? site?.name || place
    : mode === 'company' ? companyById(id)?.name || place
      : mode === 'record' ? (record ? recordName(record) : place)
        : mode === 'building' ? `อาคารใน ${site?.name || place}` : st ? `สถานี${st.name}` : `${unit().subject} ${place}`);
  return crumbs;
}

/* ---------- panel ---------- */
function panelCtx() {
  const osm = /planet\/(\d{4})(\d{2})(\d{2})_/.exec(state.tileTemplate || '');
  return {meta: state.data.meta || {}, portfolioMeta: state.portfolio?.meta || null, unit: unit(), index: state.index, osmDate: osm ? `${osm[1]}-${osm[2]}-${osm[3]}` : ''};
}

/** A view that waits for an optional file: its back button and a loading line (never an empty panel). */
const waitingView = (text, failed) => `<section class="detail-head"><button type="button" class="btn quiet back" data-action="back">กลับ</button>
  <p class="hint">${esc(failed ? 'โหลดรายการจัดสรรไม่สำเร็จ ลองโหลดหน้าใหม่' : text)}</p></section>`;

function renderPanel() {
  const view = $('panel-view');
  const {mode, id} = state.panel;
  renderCrumbs();
  const ctx = panelCtx(), metric = state.metric, data = state.data;
  let html = '';
  if (mode === 'site') {
    const s = siteById(id);
    html = s ? renderSite(buildSiteDetail(s, {data, portfolio: state.portfolio, records: state.records, extent: state.extents?.byKey.get(s.id) || null}), ctx) : '';
  } else if (mode === 'company') {
    const u = companyById(id);
    html = u ? renderCompany(buildCompanyProfile(u, {portfolio: state.portfolio, houseTypes: data.types}), ctx) : '';
  } else if (mode === 'unit') {
    const u = unitById(id);
    html = u ? renderDistrict(buildDistrictProfile(u, {data, records: state.records, metric}), ctx) : '';
  } else if (mode === 'record') {
    const r = recordById(id);
    html = r ? renderRecord(buildRecordProfile(r, {data}), ctx) : state.records ? '' : waitingView('กำลังโหลดรายการจัดสรร', state.failed.records);
  } else if (mode === 'station') html = renderStation(state.stationProfile, ctx);
  else if (mode === 'building') {
    const b = state.buildingSel;
    html = b ? renderBuilding(buildBuildingProfile(b), ctx) : '';
  }
  if (!html) {
    const f = values();
    const overview = buildOverview(state.unitScope, state.siteScope, {province: f.province, houseTypes: data.types, metric, allUnits: state.unitNational, nameOf, stations: data.stations});
    const search = f.search ? buildSearch(f.search, {data, records: state.records, index: state.index, provinces: provinceList()}) : null;
    html = renderOverview({insight: state.insight, overview, focusMode: focusMode(), fillOf: code => state.provinceModel?.byCode.get(code)?.fill || '', ctx, search});
    renderMapAha(state.insight);
  } else {
    $('map-aha').hidden = true;
  }
  view.innerHTML = html;
  view.dataset.mode = mode;
  if (mode === 'site') fillTerrain(siteById(id));
  $('panel').dataset.mode = mode;
  const key = `${mode}:${id}:${$('province').value}:${$('type').value}`;
  $('sheet-back').hidden = state.panel.mode === 'overview';
  // A new subject opens the phone sheet at its resting height (short for an item).
  if (key !== renderPanel.lastKey) { $('panel').scrollTop = 0; setSheet(restSheet()); state.readerPitch = false; state.readerMovedAt = 0; }
  renderPanel.lastKey = key;
}

/** Terrain chips of the open site (async; the DEM tiles and the basemap water/land cover are read in the browser). */
async function fillTerrain(s, attempt = 0) {
  const box = document.querySelector(`[data-terrain-for="${CSS.escape(s?.id || '')}"]`);
  if (!box) return;
  const facts = state.map && state.loaded ? await terrainFacts(state.map, s).catch(() => null) : null;
  const chips = terrainChips(facts, {num, subject: 'โครงการ'});
  const now = document.querySelector(`[data-terrain-for="${CSS.escape(s.id)}"]`);
  if (!now) return;
  const partialFacts = facts && facts.seaBand === null && facts.treeShare === null;
  if ((!facts || partialFacts) && attempt < 4) { setTimeout(() => fillTerrain(s, attempt + 1), 1500 * (attempt + 1)); if (attempt && !facts) return; }
  const html = chips.length ? terrainChipsHTML(chips) : '<span class="hint">อ่านภูมิประเทศไม่ได้ในตอนนี้</span>';
  if (now.innerHTML !== html) now.innerHTML = html;
}

/** The Aha line on the map (desktop; on a phone the dock): the finding, its names and the focus toggle. */
function renderMapAha(insight) {
  const el = $('map-aha'), u = unit();
  const items = insight?.items || [];
  if (!items.length) { el.hidden = true; return; }
  el.hidden = $('panel').classList.contains('is-open');
  const province = insight.mode === 'province' ? insight.home : '';
  const crumb = `<p class="map-aha-crumb">${esc(breadcrumbText(buildBreadcrumb({province})))}</p>`;
  const names = items.map(x => esc(x.name)).join(' · ');
  if (insight.mode === 'province') {
    const word = areaWord(province);
    el.innerHTML = `<div>${crumb}<h2><span class="nowrap">${pct(insight.value, insight.total)}</span> ของ${esc(u.subject)}ใน${esc(nameOf(province))} อยู่ใน <span class="nowrap">${num(items.length)} ${esc(word)}นี้</span></h2><p>${items.map(x => `${esc(word)}${esc(x.name)}`).join(' · ')}</p></div><button type="button" class="btn" data-action="open-charts" data-value="districts">เปรียบเทียบ</button>`;
    return;
  }
  el.innerHTML = `<div>${crumb}<h2><span class="nowrap">${pct(insight.value, insight.total)}</span> ของ${esc(u.subject)}ทั้งประเทศ อยู่ใน <span class="nowrap">${num(items.length)} จังหวัดนี้</span></h2><p>${names}</p></div>${focusMode() === 'auto'
    ? '<button type="button" class="btn" data-action="clear-focus">ดูทุกจังหวัดเท่ากัน</button>'
    : '<button type="button" class="btn primary" data-action="explore-top">โฟกัส</button>'}`;
}

function pushHistory() {
  state.history.push({...state.panel, building: state.buildingSel, province: $('province').value, metric: state.metric});
  if (state.history.length > 20) state.history.shift();
}

function goBack() {
  // Every level change is a browser history entry (citymeter-shell): go up the way the browser's button does.
  if (state.panel.mode !== 'building' && nav.canGoBack()) { nav.back(); return; }
  const previous = state.history.pop();
  if (!previous) { state.panel = overviewPanel(); update({fit: true}); return; }
  if (previous.province !== $('province').value) $('province').value = previous.province || '';
  if (previous.metric && previous.metric !== state.metric) state.metric = previous.metric;
  if (previous.mode === 'building') state.buildingSel = previous.building || null;
  state.panel = {mode: previous.mode, id: previous.id};
  update({fit: true});
  ensureFor(previous.mode);
}

/** The optional files a view needs. */
function ensureFor(mode) {
  if (mode === 'site' || mode === 'building') { ensureExtents(); ensurePortfolio(); if (siteById(state.panel.id)?.pairs) ensureRecords(); }
  if (mode === 'company') ensurePortfolio();
  if (mode === 'unit' || mode === 'record') ensureRecords();
}

/** A selection in another province moves the จังหวัด filter with it (the scope stays one coherent province). */
function alignProvince(code) {
  const current = $('province').value;
  if (current && code && current !== code) $('province').value = code;
}

/**
 * Open a project. With a pin: the map turns 3D and frames its extent (or a box round the pin until the extent is
 * known); the drawn buildings inside the extent are lit in the active-layer colour as they arrive.
 */
function selectSite(id, {fromPin = false, history = true, showPopup = false} = {}) {
  const s = siteById(id);
  if (!s) return;
  if (hasPoint(s)) ensure3d();
  if (history && (state.panel.mode !== 'site' || state.panel.id !== id)) pushHistory();
  // A project outside the filters (a neighbour, a pair of a record) clears the filters that hide it.
  if (!state.siteNational.includes(s)) { $('search').value = ''; $('house').value = ''; }
  alignProvince(s.province);
  state.panel = {mode: 'site', id};
  state.buildingSel = null;
  update();
  ensureFor('site');
  state.popup?.remove(); state.popup = null;
  if (!fromPin || mobilePortrait()) openMobilePanel({frame: false});
  if (state.loaded) {
    state.framed = null;
    fitSite(s);
    if (showPopup && !mobilePortrait() && hasPoint(s)) state.popup = new maplibregl.Popup({maxWidth: '280px', offset: 14, closeButton: true}).setLngLat([s.longitude, s.latitude]).setDOMContent(sitePopup(s)).addTo(state.map);
    state.lastPreset = cameraPreset();
  }
  announce(`เลือก ${s.name}`);
}

function sitePopup(s) {
  const wrap = document.createElement('div');
  wrap.className = 'popup-card';
  const company = s.company && !String(s.name || '').startsWith(s.company.name) ? s.company.name : '';
  const meta = [s.type?.th, company, s.extentM2 > 0 ? `กรอบราว ${rai(s.extentM2)} ไร่` : ''].filter(Boolean).join(' · ');
  wrap.innerHTML = `<div class="popup-identity">${cueMarkup(s.series)}<div><h3>${esc(s.name)}</h3></div></div><p class="popup-meta">${esc(meta)}</p>`;
  return wrap;
}

/** A developer: its listed projects (the map frames those it has on the map) and the events it reported. */
function selectCompany(id) {
  const u = companyById(id);
  if (!u) return;
  if (state.panel.mode !== 'company' || state.panel.id !== id) pushHistory();
  state.panel = {mode: 'company', id};
  update();
  ensureFor('company');
  openMobilePanel({frame: false});
  if (state.loaded) fitSites(u.sites.filter(hasPoint));
  announce(`เลือก ${u.name}`);
}

/**
 * A production district (เขต/อำเภอ): its records and plots by type, its projects and its records list. The จังหวัด filter
 * moves to its province; the map frames the district.
 */
function selectUnit(id) {
  const u = unitById(id);
  if (!u) return;
  if (state.panel.mode !== 'unit' || state.panel.id !== id) pushHistory();
  $('province').value = u.province;
  state.panel = {mode: 'unit', id};
  update();
  ensureFor('unit');
  openMobilePanel({frame: false});
  if (state.loaded) fitDistrict(u);
  announce(`${districtName(u, u.province)} · ${num(u.plots)} แปลง`);
}

/**
 * A DOL record: its plots by type and the projects paired with it. The records file loads first when needed; the map
 * frames a paired project's pin, else the record's district (a record has no point of its own).
 */
function selectRecord(id) {
  if (!id) return;
  if (state.panel.mode !== 'record' || state.panel.id !== id) pushHistory();
  const r = recordById(id);
  if (r) alignProvince(r.province);
  state.panel = {mode: 'record', id};
  update();
  ensureFor('record');
  openMobilePanel({frame: false});
  if (state.loaded && r) fitMap();
  if (r) announce(`เลือก ${recordName(r)}`);
}
/**
 * Open a rail station of CityMETER · Transit: the projects within STATION_RADIUS_M (straight line) of its reference
 * point, framed with the radius on the map. A station in another province moves the จังหวัด filter with it.
 */
function selectStation(id) {
  const s = stationById(id);
  if (!s) return;
  if (state.panel.mode !== 'station' || state.panel.id !== id) pushHistory();
  if (state.provincesGeo?.features?.length) { state.locateProvince ||= provinceLocator(state.provincesGeo); alignProvince(state.locateProvince([s.lon, s.lat])); }
  state.panel = {mode: 'station', id};
  update();
  openMobilePanel({frame: false});
  if (state.loaded) { fitStation(s); state.lastPreset = cameraPreset(); }
  announce(`สถานี${s.name}`);
}

/** The station's radius on the map (detail preset; plan while the phone sheet covers the map). */
function fitStation(s = stationById(state.panel.id), {instant = false} = {}) {
  if (!s || !state.map) return;
  const r = STATION_RADIUS_M + 150, dLat = r / 110574, dLon = r / (111320 * Math.cos((s.lat * Math.PI) / 180));
  const bounds = new maplibregl.LngLatBounds([s.lon - dLon, s.lat - dLat], [s.lon + dLon, s.lat + dLat]);
  const preset = sheetOpen() ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan' && !mobilePortrait();
  fitPitched(state.map, bounds, {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom: 16.5, minZoom: 11, animate: animate() && !instant});
}

/** A drawn building in the open estate's extent (from a click): looked at in the two-point camera. */
function selectBuilding(key) {
  const b = state.join?.buildings.get(key);
  const site = openSite();
  if (!b || !site || !state.estateLit?.keys.includes(key)) return;
  ensure3d();
  if (state.panel.mode !== 'building' || state.panel.id !== key) pushHistory();
  state.buildingSel = {key, kind: b.kind, footprint: b, height: b.height, site};
  state.panel = {mode: 'building', id: key};
  state.selectedId = '';
  state.pins?.select('');
  state.popup?.remove(); state.popup = null;
  renderPanel();
  if (state.loaded) { updatePins(); updateSpatialLayers(); }
  openMobilePanel({frame: false});
  state.framed = null;
  if (state.loaded) { frameFocus(); state.lastPreset = cameraPreset(); }
  announce('เลือกอาคาร');
}

/* ---------- spatial join (the drawn buildings × the open estate's extent) ---------- */

/**
 * The drawn buildings of the focus tier — OpenStreetMap, or CityMETER Building V4 inside a CityMETER unit (keys `osm:` /
 * `cm:`), pieces of one building grouped — and those of them that stand in the open project's extent. Recomputed only
 * when either side changes.
 */
function refreshJoin() {
  if (!state.loaded) return false;
  const pieces = state.massing?.buildings() || [];
  const site = openSite();
  const key = `${state.massing?.version ?? 0}|${site?.id || ''}|${state.extents ? 1 : 0}`;
  if (key === refreshJoin.key && state.join) return false;
  refreshJoin.key = key;
  state.join = joinBuildings(pieces, [], []);
  state.estateLit = estateBuildings(site, pieces);
  return true;
}

/**
 * The drawn buildings in the open project's extent (js/extent-buildings.js: a piece's interior point inside the extent),
 * lit with the project (the University rule of 2026-11-12, owner 2026-11-18: “ดูเรื่อง ขอบเขต campus ให้แสดงผลในลักษณะ
 * เดียวกับ University นะ”); null for a project without an extent.
 */
function estateBuildings(site, pieces) {
  const e = site && state.extents && site.extent >= 0 ? state.extents.byKey.get(site.id) : null;
  if (!e || !pieces.length || !state.join) return null;
  return buildingsInExtent(pieces, extentPolygons(e.geometry), state.join.keyOfPiece);
}

/** Refits of one frame: the building may arrive in steps and the ground may move once when its DEM tile arrives. */
const MAX_REFITS = 3;

/**
 * The building being looked at: the open building of an estate. {id, key, refs, anchor: [lon, lat], near: false}; null
 * outside the building view.
 */
function focusTarget() {
  if (state.panel.mode !== 'building') return null;
  const b = state.buildingSel;
  if (!b) return null;
  const [w, s, e, n] = b.footprint.bbox;
  return {id: `building:${b.key}`, key: b.key, refs: state.join?.buildings.get(b.key)?.refs || b.footprint.refs || [], anchor: [(w + e) / 2, (s + n) / 2], near: false};
}

/**
 * Buildings drawn in the active-layer colour: the open building; on an open project, every drawn building in its extent
 * (the University rule of 2026-11-12: “ทำไมไม่แสดงอาคารทั้งหมดในกรอบเวลา highlight”). Never the whole focus the join was
 * given (University 0.1.1, live 2026-11-12: 406 pieces lit for 24 buildings).
 */
function highlightIds() {
  if (state.panel.mode === 'building') return focusTarget()?.refs || [];
  if (state.panel.mode === 'site') return state.estateLit?.refs || [];
  return [];
}


/**
 * Drawn shape of the building being looked at: x-ray features, outer rings with heights, and fit points — the
 * pieces as the focus tier draws them at building zoom (≥ 18).
 */
function focusShape(target = focusTarget()) {
  const features = target?.refs.length ? state.massing?.featuresOf(target.refs) || [] : [];
  const rings = features.flatMap(f => outerRings(f).map(ring => ({ring, height: Number(f.properties.height) || 3})));
  const map = state.map, terrain = Boolean(map?.terrain) && state.view3d;
  const pinGround = terrain && target ? groundAt(map, target.anchor) : 0;
  let points = features.flatMap(f => {
    const pts = state.massing?.fitPointsOf([f.id], 18) || [];
    if (!terrain) return pts;
    const {g, low} = pieceGrounds(f, pinGround);
    return pts.map(q => [q[0], q[1], q[2], q[2] ? g : low]);
  });
  if (!points.length) points = rings.flatMap(({ring, height}) => ring.flatMap(([lng, lat]) => [[lng, lat, 0], [lng, lat, height]]));
  if (!points.length && target) {
    const [lon, lat] = target.anchor, dLat = 45 / 110574, dLng = 45 / (111320 * Math.cos((lat * Math.PI) / 180));
    points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [[lon + a * dLng, lat + b * dLat, 0], [lon + a * dLng, lat + b * dLat, 12]]);
  }
  return {features, rings, points, key: features.length ? features.map(f => f.id).sort((a, b) => a - b).join(',') : 'point'};
}

/** Theme colours of the x-ray: LDS map.activeLayer faces, map.selectedStroke edges (context, not a data scale). */
const xrayColors = () => ({fill: cssVar('--map-active-layer', '#347DA8'), stroke: cssVar('--map-selected-stroke', '#176B82')});

/**
 * Highlight, eye-view scene and x-ray of the building being looked at (after every join or selection change).
 * Owner 2026-10-29: “อย่าให้ 3d building mass ตึกอื่นบังอาคารที่กำลังดูอยู่” — the building is drawn over every
 * other building (js/shell/venue-xray.js) and the focus buildings standing in front of it turn see-through.
 */
function syncFocusBuilding() {
  if (!state.loaded) return;
  const shape = focusShape();
  const eye = state.view3d && twoPoint() && shape.features.length > 0;
  state.massing?.setScene(eye ? 'eye' : 'default', eye ? shape.rings : []);
  const grounds = shape.features.map(f => (state.view3d ? pieceGrounds(f) : {g: 0, low: 0}));
  const key = `${state.view3d}|${shape.key}|${state.massing?.version ?? 0}|${theme()}|${grounds.map(x => `${x.g.toFixed(1)}/${x.low.toFixed(1)}`).join(',')}`;
  if (key !== syncFocusBuilding.key) {
    syncFocusBuilding.key = key;
    state.xray?.update(state.view3d ? shape.features.map((f, i) => {
      const base = Number(f.properties.base) || 0, top = Number(f.properties.height) || 3, {g, low} = grounds[i];
      return {type: 'Feature', geometry: f.geometry, properties: {display_height_m: top + g, display_base_m: base > 0 ? base + g : low}};
    }) : [], {colors: xrayColors()});
  }
  state.xray?.setEnabled(state.view3d);
}
/** Ground of a drawn piece on terrain (0 without): `g` at its centroid and `low`, the lowest ground under its outline. */
function pieceGrounds(f, fallback = 0) {
  const map = state.map;
  if (!map?.terrain) return {g: 0, low: 0};
  const g = groundAt(map, centroidOf(f)) || fallback;
  const ring = outerRings(f)[0] || [];
  let low = g;
  for (let i = 0; i < ring.length - 1; i++) { const e = groundAt(map, ring[i]); if (e && e < low) low = e; }
  return {g, low};
}
/** Vertex mean of a feature's first outer ring ([lon, lat]): where MapLibre samples the ground of a fill-extrusion. */
function centroidOf(f) {
  const ring = outerRings(f)[0] || [];
  const n = Math.max(1, ring.length - 1);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i]?.[0] || 0; y += ring[i]?.[1] || 0; }
  return [x / n, y / n];
}

/**
 * The free part of the map in container pixels: below the toolbar, above whatever covers the bottom (Aha card,
 * legend, chart tray, table, open phone sheet), left of the zoom control.
 */
function visibleBox() {
  const el = $('map'), r = el.getBoundingClientRect();
  const W = el.clientWidth, H = el.clientHeight;
  const shown = x => x && !x.hidden && x.offsetHeight > 0 && getComputedStyle(x).display !== 'none';
  let top = document.querySelector('.map-toolbar').getBoundingClientRect().bottom - r.top + 10;
  let bottom = H - 10;
  for (const x of [$('insights'), $('results'), $('map-legend'), $('map-aha')]) if (shown(x)) bottom = Math.min(bottom, x.getBoundingClientRect().top - r.top - 10);
  if (sheetOpen()) bottom = Math.min(bottom, window.innerHeight - $('panel').offsetHeight - r.top - 10);
  let right = W - 12;
  const navCtrl = el.querySelector('.maplibregl-ctrl-top-right');
  if (navCtrl?.offsetWidth && navCtrl.getBoundingClientRect().bottom - r.top > top) right = Math.min(right, navCtrl.getBoundingClientRect().left - r.left - 8);
  const left = 12;
  if (bottom - top < 140) top = Math.max(4, bottom - 140);
  return {left, top, right: Math.max(left + 120, right), bottom: Math.max(top + 120, bottom)};
}

/**
 * Building camera (owner 2026-10-29 19:47, the CityMETER · Shopping centers venue camera): the eye camera turns
 * corner-on to the building and every footprint and roof vertex fills the free part of the map. 3D off: the same box,
 * flat. Returns false when the open panel has nothing to frame.
 */
function frameFocus({instant = false} = {}) {
  const map = state.map;
  if (!map || !state.loaded || !twoPoint()) return false;
  const target = focusTarget();
  const shape = focusShape(target);
  if (!target || !shape.points.length) return false;
  const box = visibleBox();
  state.userCamera = false;
  state.framed = {id: target.id, key: shape.key, refits: state.framed?.id === target.id ? state.framed.refits : 0, ground: groundAt(map, target.anchor), box};
  if (!state.view3d) {
    const [q0] = shape.points;
    const b = shape.points.reduce((acc, q) => acc.extend([q[0], q[1]]), new maplibregl.LngLatBounds([q0[0], q0[1]], [q0[0], q0[1]]));
    const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
    fitPitched(map, b, {preset: 'plan', padding: {top: box.top, left: box.left, right: W - box.right, bottom: H - box.bottom}, maxZoom: shape.rings.length ? BUILDING_MAX_ZOOM : 18, minZoom: 14, animate: animate() && !instant});
    return true;
  }
  const known = shape.rings.length > 0;
  const obstacles = known ? state.massing?.obstaclesNear(target.anchor, 400, target.refs) || [] : [];
  const bearing = known ? twoPointBearing(shape.rings.map(t => t.ring), map.getBearing(), obstacles) : map.getBearing();
  const alternates = known ? [180, 90, -90].map(d => bearing + d) : [];
  fitBuilding(map, shape.points, {box, bearing, alternates, maxZoom: known ? BUILDING_MAX_ZOOM : 18, animate: animate() && !instant});
  return true;
}

/** The ground changed under the building being looked at: the x-ray moves with it, the camera frames it again. */
function onGroundChange() {
  if (!state.loaded) return;
  syncFocusBuilding();
  const target = twoPoint() ? focusTarget() : null;
  if (!target || !state.framed || state.framed.id !== target.id || state.userCamera || state.framed.refits >= MAX_REFITS) return;
  if (Math.abs(groundAt(state.map, target.anchor) - (state.framed.ground || 0)) < 3) return;
  state.framed.refits++;
  frameFocus();
}

/** The free box changed after the building was framed: frame it again in the box it now has (unless the user moved). */
function refitOnNewBox() {
  const target = twoPoint() ? focusTarget() : null;
  const framed = state.framed;
  if (!target || !framed?.box || framed.id !== target.id || state.userCamera || framed.refits >= MAX_REFITS) return;
  const b = visibleBox(), f = framed.box;
  if (Math.max(Math.abs(b.top - f.top), Math.abs(b.bottom - f.bottom), Math.abs(b.left - f.left), Math.abs(b.right - f.right)) < 8) return;
  framed.refits++;
  frameFocus();
}

/** The building arrived (or changed) after the target was framed: turn to it, unless the user moved the map. */
function refitOnNewBuilding() {
  const target = focusTarget();
  if (!target || !state.framed || state.framed.id !== target.id || state.userCamera || state.framed.refits >= MAX_REFITS) return;
  if (focusShape(target).key === state.framed.key) return;
  state.framed.refits++;
  frameFocus();
}

function applyJoin() {
  refreshJoin();
  const n = state.massing?.setHighlight(highlightIds()) || 0;
  state.blueBuildings = n > 0;
  document.querySelector('.map-panel')?.classList.toggle('has-open-building', state.blueBuildings);
  const label = $('legend-building-label');
  if (label) label.textContent = currentBuilding() ? 'อาคารที่เปิด' : 'อาคารในกรอบโครงการ';
  syncFocusBuilding();
  refitOnNewBuilding();
}

/** Show the Aha's provinces under the focus stroke (auto mode; the address stays clean). */
function exploreTop() { state.autoFocus = true; update({fit: true}); closeMobilePanel(); }
/** Every province alike (?areas=all). */
function clearFocus() { state.autoFocus = false; update({fit: true}); }

function selectProvince(code) {
  const c = provinceCodeFrom(code);
  if (!c) return;
  if ($('province').value !== c || state.panel.mode !== 'overview') pushHistory();
  $('province').value = c;
  state.panel = overviewPanel();
  update({fit: true});
  openMobilePanel({frame: false});
  announce(`จังหวัด${provinceByCode(c)?.th || c}`);
}

function resetToOverview({fit = true} = {}) {
  state.panel = overviewPanel();
  state.history = [];
  state.buildingSel = null;
  update({fit});
}

function clearFilter(key) {
  if (key === 'all') { $('filters').reset(); resetToOverview(); return; }
  if (FIELDS.includes(key)) $(key).value = '';
  update({fit: key !== 'search'});
}

/** A plot-type bar in a panel: the measure narrows to that plot type, staying on the open district. */
function filterType(id) {
  if (![...$('type').options].some(o => o.value === id)) return;
  $('type').value = id;
  state.history = [];
  const keep = state.panel.mode === 'unit';
  if (!keep) state.panel = overviewPanel();
  update({fit: !keep});
}

/** A house-type bar in a panel: the projects narrow to that house type, staying on the open station or developer. */
function filterHouse(id) {
  if (![...$('house').options].some(o => o.value === id)) return;
  $('house').value = id;
  state.history = [];
  const keep = state.panel.mode === 'station' || state.panel.mode === 'company';
  if (!keep) state.panel = overviewPanel();
  update({fit: !keep});
}

/** The measure (แปลงจัดสรร | รายการจัดสรร): the map, legend, labels, Aha, ranks and charts switch together. */
function setMetric(value) {
  const next = value === 'records' ? 'records' : 'plots';
  if (next === state.metric) { syncMetricSwitch(); return; }
  state.metric = next;
  update({fit: state.panel.mode === 'overview'});
  announce(next === 'records' ? 'วัดด้วยจำนวนรายการจัดสรร' : 'วัดด้วยจำนวนแปลงจัดสรร');
}
function syncMetricSwitch() {
  for (const b of document.querySelectorAll('[data-metric]')) {
    const on = b.dataset.metric === state.metric;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function onPanelAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action, id, value} = target.dataset;
  switch (action) {
    case 'select-site': selectSite(id); break;
    case 'select-company': selectCompany(id); break;
    case 'select-unit': selectUnit(id); break;
    case 'select-record': selectRecord(id); break;
    case 'select-building': selectBuilding(id); break;
    case 'select-station': selectStation(id); break;
    case 'select-province': selectProvince(id); break;
    case 'filter-type': filterType(value); break;
    case 'filter-house': filterHouse(value); break;
    case 'set-metric': setMetric(value); break;
    case 'back': goBack(); break;
    case 'explore-top': exploreTop(); break;
    case 'clear-focus': clearFocus(); break;
    case 'leave-province': $('province').value = ''; resetToOverview(); break;
    case 'open-charts': if (value) { state.view = value; saveURL(); } openInsights(true); closeMobilePanel(); break;
    case 'open-table': openTable(); $('toggle-table').focus({preventScroll: true}); break;
    case 'clear-filter': clearFilter(id); break;
    case 'crumb-country': $('province').value = ''; resetToOverview(); break;
    case 'crumb-province': { const c = provinceCodeFrom(id); if (c) $('province').value = c; resetToOverview(); break; }
    case 'crumb-area': selectUnit(id); break;
    case 'crumb-site': selectSite(id); break;
    case 'crumb-expand': { const ol = target.closest('.crumbs'); ol.classList.add('is-expanded'); target.setAttribute('aria-expanded', 'true'); ol.querySelector('.crumb:not(.crumb-more)')?.focus({preventScroll: true}); break; }
    default: break;
  }
}

/* ---------- legend ---------- */
/** Hillshade in the theme's basemap tones (foundation colours, never data colours). */
function terrainColors() {
  const dark = theme() === 'dark';
  return dark
    ? {shadow: cssVar('--basemap-sky') || '#0D1418', highlight: cssVar('--basemap-label-quiet') || '#8D9D99', accent: cssVar('--basemap-sky') || '#0D1418', dark}
    : {shadow: cssVar('--basemap-label') || '#5F635A', highlight: cssVar('--basemap-halo') || '#F6F7F3', accent: cssVar('--basemap-label-quiet') || '#7B877D', dark};
}

/** Map status: pin + number in view (owner 2026-11-01: icons instead of long text); the sentence is the title. */
function renderMapStatus(stats) {
  const el = $('map-status');
  const text = `โครงการในจอ ${num(stats.focusInView)} โครงการ${stats.contextRows ? ` · จุดนอกโฟกัส ${num(stats.contextRows)} จุด` : ''}`;
  el.innerHTML = `<i class="pictogram pic-maps" aria-hidden="true"></i><span class="data-number">${num(stats.focusInView)}</span> ในจอ`;
  el.title = text;
  el.setAttribute('aria-label', text);
}

function renderLegend() {
  const u = unit(), steps = $('legend-steps');
  const m = state.provinceModel;
  $('legend-title').textContent = `จังหวัด · ${u.label}`;
  // All 41 LDS samples with value ticks (owner standing rule), plus the measured-zero swatch when zero occurs.
  steps.innerHTML = m?.ramp?.levels.length
    ? rampLegendHTML(m.ramp, {zero: m.zeroCount > 0, zeroTitle: `0 ${u.one} · ไม่มีรายการจัดสรรในจังหวัดนี้ตามตัวกรอง`})
    : `<span class="hint">ไม่มี${esc(u.subject)}ในตัวกรองนี้</span>`;
  spaceTicks(steps);
  $('legend-areas').title = `${u.label}รวมต่อจังหวัดตามรายการจัดสรรของกรมที่ดิน · สีเข้ม = มาก`;
  const size = Math.max(6, Math.round(2 * pinRadius(13)));
  $('legend-pin-label').innerHTML = `<span class="size-step"><i class="size-dot" style="--d:${size}px" aria-hidden="true"></i><span>1 โครงการ</span></span>`;
  $('legend-pin').title = '1 สัญลักษณ์ = 1 โครงการในบัญชีของผู้พัฒนาที่ทีมวิจัยเก็บ · สีและรูปทรง = ประเภทบ้าน';
  if (!renderLegend.categories) {
    renderLegend.categories = true;
    $('category-items').innerHTML = state.data.types.map(t => `<span>${cueMarkup(t.series)}${esc(t.th)}</span>`).join('');
    $('category-cues').innerHTML = state.data.types.map(t => cueMarkup(t.series)).join('');
  }
  const terrainItem = $('legend-terrain');
  if (terrainItem) terrainItem.hidden = !state.terrainActive;
  const buildingItem = document.querySelector('.legend-building-item'), src = state.buildingSources || {};
  if (buildingItem) buildingItem.title = `${currentBuilding() ? 'อาคารที่เปิด' : 'อาคารในกรอบโครงการที่เปิด'} · ขอบอาคาร ${src.cm && src.osm ? 'CityMETER Building V4 และ OpenStreetMap' : src.cm ? 'CityMETER Building V4' : 'OpenStreetMap'}`;
  const panel = document.querySelector('.map-panel');
  panel.dataset.metric = state.metric;
  panel.classList.toggle('is-3d', state.view3d);
  panel.classList.toggle('has-open-building', Boolean(state.blueBuildings));
  panel.classList.toggle('has-estate', Boolean(openSite()));
  panel.classList.toggle('is-province-zoom', (state.map?.getZoom?.() ?? 6) < PROVINCE_FILL_MAX_ZOOM);
}

/* ---------- charts ---------- */
let chartDispose = null;
function drawChart() {
  if (!state.data) return;
  chartDispose?.(); chartDispose = null;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  $('chart').setAttribute('aria-labelledby', 'tab-' + state.view);
  const u = unit();
  $('chart-scope').textContent = `${num(state.unitScope.reduce((n, x) => n + x.records, 0))} รายการในตัวกรอง`;
  if ($('insight-content').hidden) return;
  chartDispose = renderInsightChart({elementId: 'chart', view: state.view, units: state.unitScope, allUnits: state.unitNational,
    unit: u, metric: state.metric, province: $('province').value, selectedDistrict: state.panel.mode === 'unit' ? state.panel.id : ''},
  selection => { if (selection.type === 'province') selectProvince(selection.id); else if (selection.type === 'type') filterType(selection.id); else if (selection.type === 'district') selectUnit(selection.id); });
}

function openInsights(open) {
  $('insight-content').hidden = !open;
  $('insights').classList.toggle('is-collapsed', !open);
  $('toggle-insights').setAttribute('aria-expanded', String(open));
  $('toggle-insights').textContent = open ? 'ย่อกราฟ' : 'เปิดกราฟ';
  requestAnimationFrame(() => { syncBottomPanel(); drawChart(); });
}

function syncBottomPanel() {
  const tray = $('insights');
  if (!tray) return;
  document.documentElement.style.setProperty('--bottom-panel-height', `${tray.getBoundingClientRect().height}px`);
  state.pins?.layout();
  state.siteLabels?.layout();
  state.districtLabels?.layout();
}

/* ---------- table ---------- */
/** Open the table (the records load first when they are not in yet). */
function openTable() {
  $('results').hidden = false;
  if (!state.records) ensureRecords();
  if (renderTable.stale) renderTable();
  closeMobilePanel();
}

/** The DOL records of the scope, most plots first: name, plots by type, district, province and the paired project. */
function renderTable() {
  if ($('results').hidden && renderTable.done) { renderTable.stale = true; return; }
  renderTable.done = true; renderTable.stale = false;
  const pageSize = 25, start = state.page * pageSize;
  const list = tableRecords();
  if (!list) {
    $('result-rows').innerHTML = `<tr><td colspan="8">${state.failed.records ? 'โหลดรายการจัดสรรไม่สำเร็จ' : 'กำลังโหลดรายการจัดสรร'}</td></tr>`;
    $('page-label').textContent = '';
    $('prev-page').disabled = true; $('next-page').disabled = true;
    return;
  }
  if (!renderTable.sorted || renderTable.source !== list) { renderTable.sorted = [...list].sort(recordOrder); renderTable.source = list; }
  const rs = renderTable.sorted.slice(start, start + pageSize);
  const k = id => PLOT_TYPES.findIndex(t => t.id === id);
  const cell = (r, ids) => (r.types ? num(ids.reduce((n, id) => n + (r.types[k(id)] || 0), 0)) : '—');
  $('result-rows').innerHTML = rs.map(r => {
    const area = r.district ? state.index.byId.get(r.district) : null;
    const pair = r.pairs[0]?.site || null;
    return `<tr>
      <td><button type="button" class="row-name brand-row" data-record="${esc(r.id)}"><span${r.name ? '' : ' class="is-quiet"'}>${esc(recordName(r))}</span></button>${r.allocator ? `<small>${esc(r.allocator)}</small>` : ''}</td>
      <td class="num"><span class="data-number">${r.plots == null ? '—' : num(r.plots)}</span></td>
      <td class="num"><span class="data-number">${cell(r, ['detached'])}</span></td>
      <td class="num"><span class="data-number">${cell(r, ['twin'])}</span></td>
      <td class="num"><span class="data-number">${cell(r, ['row'])}</span></td>
      <td class="num"><span class="data-number">${cell(r, ['commercial', 'land', 'other'])}</span></td>
      <td>${area ? `<button type="button" class="link-button" data-district="${esc(area.id)}">${esc(districtName(area, r.province))}</button>` : ''}<small>${esc(nameOf(r.province))}</small></td>
      <td>${pair ? `<button type="button" class="link-button" data-site="${esc(pair.id)}">${esc(pair.name)}</button>${r.pairs.length > 1 ? `<small>+${num(r.pairs.length - 1)}</small>` : ''}` : '<span class="hint">—</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="8">ไม่พบรายการจัดสรรตามตัวกรอง</td></tr>';
  $('page-label').textContent = list.length ? `${num(start + 1)}–${num(Math.min(start + pageSize, list.length))} / ${num(list.length)}` : '0 รายการ';
  $('prev-page').disabled = state.page === 0;
  $('next-page').disabled = start + pageSize >= list.length;
  for (const b of $('result-rows').querySelectorAll('[data-record]')) b.onclick = () => { selectRecord(b.dataset.record); $('panel').scrollTop = 0; };
  for (const b of $('result-rows').querySelectorAll('[data-district]')) b.onclick = () => { selectUnit(b.dataset.district); $('panel').scrollTop = 0; };
  for (const b of $('result-rows').querySelectorAll('[data-site]')) b.onclick = () => { selectSite(b.dataset.site); $('panel').scrollTop = 0; };
}

/* ---------- map ---------- */
function cameraPadding() {
  const height = $('map').clientHeight, panel = $('insights').getBoundingClientRect().height;
  const edge = Math.min(48, Math.max(12, (height - panel) / 6));
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  const aha = $('map-aha'), legend = $('map-legend');
  const chromeTop = !aha.hidden && aha.offsetHeight ? aha.getBoundingClientRect().top : legend.offsetHeight ? legend.getBoundingClientRect().top : null;
  let bottom = chromeTop != null ? height - (chromeTop - mapTop) + 12 : panel + edge;
  if (mobilePortrait() && $('panel').classList.contains('is-open')) bottom = Math.max(bottom, Math.round($('panel').getBoundingClientRect().height) - (window.innerHeight - height - mapTop) + 8);
  return {top: Math.max(edge, toolbar.bottom - mapTop + 12), left: edge, right: edge, bottom: Math.min(height * 0.7, bottom)};
}

/** Padding for pitched fits: the legend is ignored (foreshortening already lifts the content). */
function pitchedPadding() {
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  return {top: Math.round(toolbar.bottom - mapTop + 12), bottom: Math.round($('insights').getBoundingClientRect().height + 40), left: 24, right: 24};
}

/** LngLatBounds around [[w, s], [e, n]] boxes, or null. */
function boundsOf(boxes) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const b of boxes) if (b) { w = Math.min(w, b[0][0]); s = Math.min(s, b[0][1]); e = Math.max(e, b[1][0]); n = Math.max(n, b[1][1]); }
  return Number.isFinite(w) ? new maplibregl.LngLatBounds([w, s], [e, n]) : null;
}
const recordBox = r => (Array.isArray(r?.bbox) ? [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]] : null);
const countryBox = () => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of state.index.provinces) if (p.bbox) { w = Math.min(w, p.bbox[0]); s = Math.min(s, p.bbox[1]); e = Math.max(e, p.bbox[2]); n = Math.max(n, p.bbox[3]); }
  return Number.isFinite(w) ? [[w, s], [e, n]] : [[97.34, 5.61], [105.64, 20.47]];
};

/** Frame provinces (plan: a province is wider than a pitched view can hold). */
function fitRecords(records, {instant = false, maxZoom = 11} = {}) {
  const b = boundsOf(records.map(recordBox));
  if (!b || !state.map) return;
  fitPitched(state.map, b, {preset: 'plan', padding: cameraPadding(), maxZoom, minZoom: 4.5, animate: animate() && !instant, shift: mobilePortrait() ? -0.08 : null});
}
const fitRecord = (record, opts) => fitRecords([record], opts);

function fitCountry({instant = false} = {}) {
  fitPitched(state.map, boundsOf([countryBox()]), {preset: 'plan', padding: cameraPadding(), maxZoom: 7, minZoom: 4, animate: animate() && !instant});
}

/** A few projects (a developer's): their pins, framed flat, never closer than a project view. */
function fitSites(sites, {instant = false} = {}) {
  const pts = sites.filter(hasPoint);
  if (!pts.length || !state.map) return;
  if (pts.length === 1) { fitSite(pts[0], {instant}); return; }
  const b = boundsOf(pts.map(s => [[s.longitude, s.latitude], [s.longitude, s.latitude]]));
  fitPitched(state.map, b, {preset: 'plan', padding: cameraPadding(), maxZoom: 13, minZoom: 4.5, animate: animate() && !instant});
}

/** The bounds of a project: its extent and its pin when the extents file is in, else a box round the pin. */
function siteBounds(s) {
  const e = state.extents && s.extent >= 0 ? state.extents.byKey.get(s.id) : null;
  let w = Infinity, so = Infinity, ea = -Infinity, n = -Infinity;
  const walk = v => { if (typeof v[0] === 'number') { w = Math.min(w, v[0]); ea = Math.max(ea, v[0]); so = Math.min(so, v[1]); n = Math.max(n, v[1]); } else v.forEach(walk); };
  if (e) { walk(e.geometry.coordinates); if (hasPoint(s)) walk([s.longitude, s.latitude]); }
  if (!Number.isFinite(w) && hasPoint(s)) {
    const r = 250, dLat = r / 110574, dLon = r / (111320 * Math.cos((s.latitude * Math.PI) / 180));
    return [[s.longitude - dLon, s.latitude - dLat], [s.longitude + dLon, s.latitude + dLat]];
  }
  return Number.isFinite(w) ? [[w, so], [ea, n]] : null;
}

/** Frame a district (its bbox in the area index; its province when the index has none). */
function fitDistrict(u, {instant = false} = {}) {
  const a = u ? state.index.byId.get(u.id) : null;
  if (a?.bbox) fitRecord(a, {instant, maxZoom: 13});
  else if (u) fitRecord(provinceRecord(u.province), {instant});
}

/** Frame a project in the model preset (plan while the phone sheet covers the map, or with 3D off). */
function fitSite(s, {instant = false} = {}) {
  if (!s || !state.map) return;
  const box = siteBounds(s);
  if (!box) { const p = provinceRecord(s.province); if (p) fitRecord(p, {instant}); return; }
  // A phone (University 0.1.4; owner 2026-11-12 12:26: “คลิกมหาลัยแล้วไม่แสดง 3d ทันที”): the project opens in 3D above the
  // sheet, and not below the zoom the phone's buildings are drawn from — an estate wider than that view is entered at its middle.
  const phone = mobilePortrait();
  const preset = phone && state.view3d ? 'model' : sheetOpen() ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan';
  const minZoom = phone && pitched ? Math.max(11, state.budget?.focusZoom || 0) : 11;
  const options = {preset, padding: pitched && !phone ? pitchedPadding() : cameraPadding(), maxZoom: 17, minZoom, animate: animate() && !instant};
  if (!(phone && pitched)) { fitPitched(state.map, boundsOf([box]), options); return; }
  // The fit may still land below that zoom (it only stops zooming out there): take its camera and hold the zoom.
  const target = fitPitched(state.map, boundsOf([box]), {...options, apply: false});
  if (!target) return;
  const camera = {...target, zoom: Math.max(target.zoom, minZoom)};
  if (options.animate) state.map.easeTo({...camera, duration: 650}); else state.map.jumpTo(camera);
}

/** The middle of the map the reader sees ([lon, lat]): the free box above the phone's sheet (js/massing.js viewCenter). */
function seenCenter() {
  const map = state.map;
  if (!map || !mobilePortrait()) return null;
  const b = visibleBox();
  return map.unproject([(b.left + b.right) / 2, (b.top + b.bottom) / 2]).toArray();
}

function fitMap({instant = false} = {}) {
  if (!state.loaded) return;
  if (frameFocus({instant})) return;
  const {mode, id} = state.panel;
  if (mode === 'station') { fitStation(stationById(id), {instant}); return; }
  if (mode === 'site') { fitSite(siteById(id), {instant}); return; }
  if (mode === 'company') { fitSites(companyById(id)?.sites || [], {instant}); return; }
  if (mode === 'unit') { fitDistrict(unitById(id), {instant}); return; }
  if (mode === 'record') {
    const r = recordById(id), pinned = r?.pairs.map(p => p.site).filter(hasPoint) || [];
    if (pinned.length) fitSites(pinned, {instant});
    else if (r) fitDistrict(unitById(r.district) || {id: r.district, province: r.province}, {instant});
    return;
  }
  const province = $('province').value ? provinceRecord($('province').value) : null;
  if (province) { fitRecord(province, {instant}); return; }
  const focus = state.focusIds.map(provinceRecord).filter(Boolean);
  if (focus.length) { fitRecords(focus, {instant, maxZoom: 9}); return; }
  fitCountry({instant});
}

/** Province chips: the measure per province (every province holding it; the selected one first, the others quiet). */
function provinceLabelItems() {
  const pm = state.provinceModel, code = $('province').value, u = unit();
  if (!pm) return [];
  const focus = new Set(state.focusIds);
  return pm.provinces.filter(p => p.value > 0 || p.code === code)
    .sort((a, b) => (b.code === code) - (a.code === code) || focus.has(b.code) - focus.has(a.code) || b.value - a.value)
    .map(p => ({id: p.code, name: p.name, value: num(p.value), state: p.state, quiet: Boolean(code) && p.code !== code, selected: p.code === code, center: p.label, swatch: p.fill || '',
      title: `${p.name} · ${num(p.value)} ${u.one} · ${u.id === 'records' ? `${num(p.plots)} แปลง` : `${num(p.records)} รายการ`}`}));
}

/**
 * District chips of the chosen province: the measure per production district at the district's label point (the
 * area index), the open district first; the swatch is the district's sample of a 41-sample ramp over the province's
 * districts (the same LDS family as the province fill, its own reading). Districts without a record are not chipped.
 */
function districtLabelItems() {
  const code = $('province').value, u = unit();
  if (!code || !state.showAreas) return [];
  const rows = state.unitScope.filter(x => x.province === code);
  const value = x => (state.metric === 'records' ? x.records : x.plots);
  const ramp = buildMetricRamp(rows.map(value), {metric: state.metric, unit: u.one});
  const open = state.panel.mode === 'unit' ? state.panel.id : '';
  return rows.filter(x => value(x) > 0)
    .sort((a, b) => (b.id === open) - (a.id === open) || value(b) - value(a))
    .map(x => {
      const a = state.index.byId.get(x.id), word = areaWord(x.province);
      return {id: x.id, name: `${word}${x.name}`, value: num(value(x)), state: 'measured', quiet: Boolean(open) && x.id !== open, selected: x.id === open,
        center: a?.label || null, swatch: classify(value(x), ramp).fill,
        title: `${word}${x.name} · ${num(value(x))} ${u.one} · ${state.metric === 'records' ? `${num(x.plots)} แปลง` : `${num(x.records)} รายการ`}`};
    });
}

function scheduleLabelView() {
  clearTimeout(scheduleLabelView.timer);
  scheduleLabelView.timer = setTimeout(() => { if (state.loaded) { state.provinceLabels?.layout(); state.districtLabels?.layout(); renderLegend(); syncExtents(); } }, 60);
}

/**
 * Provinces whose building units the massing regions need: the open subject's, plus the provinces under each region's
 * centre and corners (an estate or the camera near a provincial border reads both sides' CityMETER units).
 */
function massingProvinces(regions) {
  const codes = new Set([$('province').value, openSite()?.province].filter(Boolean));
  if (state.provincesGeo?.features?.length) {
    state.locateProvince ||= provinceLocator(state.provincesGeo);
    for (const ring of regions) {
      if (!ring.length) continue;
      const [w, s, e, n] = ringsBox([ring]);
      let x = 0, y = 0;
      for (const [lon, lat] of ring) { x += lon; y += lat; }
      for (const p of [[x / ring.length, y / ring.length], [w, s], [e, s], [e, n], [w, n]]) {
        const code = state.locateProvince(p);
        if (code) codes.add(code);
      }
    }
  }
  return [...codes].filter(Boolean);
}

/** The extent rings of a project (data/extents.json) and the square of its surroundings (js/regions.js). */
function siteRegions(s) {
  if (!s) return [];
  const e = state.extents && s.extent >= 0 ? state.extents.byKey.get(s.id) : null;
  return siteContextRegions(e ? outerRings({geometry: e.geometry}) : [], hasPoint(s) ? [s.longitude, s.latitude] : null);
}

/** The subject's own focus: round the open building, the open project (extent and surroundings), the open station. */
function subjectRegions() {
  if (state.panel.mode === 'building' && state.buildingSel?.footprint?.bbox) {
    const [w, s, e, n] = state.buildingSel.footprint.bbox, lat = (s + n) / 2;
    const half = Math.max((e - w) * 111320 * Math.cos((lat * Math.PI) / 180), (n - s) * 110574) / 2;
    return [...siteRegions(state.buildingSel.site), squareAround((w + e) / 2, lat, Math.max(300, half + 150))];
  }
  if (state.panel.mode === 'station') {
    const st = stationById(state.panel.id);
    if (st) return [squareAround(st.lon, st.lat, STATION_RADIUS_M + 200)];
  }
  return siteRegions(openSite());
}

/** The camera's square while it looks outside the subject's own focus, from FOCUS_MIN_ZOOM in (js/regions.js). */
function cameraContext(base = subjectRegions()) {
  const map = state.map;
  if (state.cameraHeld || !map || typeof map.getZoom !== 'function') return null;
  return cameraSquare(map.getCenter().toArray(), map.getZoom(), {base, minZoom: FOCUS_MIN_ZOOM});
}

/** Massing focus regions: the subject's own focus, plus the camera's square when the camera looks elsewhere. */
function massingRegions() {
  const base = subjectRegions();
  const camera = cameraContext(base);
  state.cameraKey = camera?.key || '';
  return camera ? [...base, camera.ring] : base;
}

/** After a move: read again round the camera when it has left its cell or crossed FOCUS_MIN_ZOOM (else nothing). */
function followCamera() {
  state.cameraHeld = false;
  if (!state.loaded || !state.massing) return;
  if ((cameraContext()?.key || '') !== state.cameraKey) updateSpatialLayers();
}

/** Estate extents on the map: the projects of the focus (the province's, the station's, the developer's) and the open one. */
function syncExtents() {
  if (!state.extentLayers || !state.extents) return;
  const sites = detailSites();
  const open = openSite();
  const list = open && !sites.includes(open) ? [...sites, open] : sites;
  const indexes = list.filter(s => s.extent >= 0).map(s => state.siteIndex.get(s.id)).filter(i => i >= 0);
  const key = indexes.join(',');
  if (key !== syncExtents.key || syncExtents.extents !== state.extents) {
    syncExtents.key = key; syncExtents.extents = state.extents;
    syncExtents.collection = extentCollection(state.extents, state.data.sites, indexes);
  }
  const openIndex = open ? state.siteIndex.get(open.id) : -1;
  state.extentLayers.update({extents: syncExtents.collection, selectedSite: open && open.extent >= 0 ? openIndex : -1});
}

function updateSpatialLayers() {
  if (!state.loaded) return;
  state.terrain?.setEnabled(state.view3d && state.budget.terrain);
  const code = $('province').value;
  state.provinceLayers?.update({units: state.unitNational, selectedCode: code, focus: state.focusIds, visible: state.showAreas, metric: state.metric});
  state.provinceLabels?.update(state.showAreas ? provinceLabelItems() : [], {visible: state.showAreas});
  state.districtLabels?.update(districtLabelItems(), {visible: state.showAreas});
  renderLegend();
  const st = state.panel.mode === 'station' ? stationById(state.panel.id) : null;
  state.stations?.select(st ? st.id : '', STATION_RADIUS_M);
  syncExtents();
  const target = twoPoint() ? focusTarget() : null;
  const site = openSite();
  const anchorPoints = target ? [target.anchor] : st ? [[st.lon, st.lat]] : site && hasPoint(site) ? [[site.longitude, site.latitude]] : [];
  const anchors = anchorPoints.length ? anchorPoints : [state.map.getCenter().toArray()];
  const regions = massingRegions();
  // The buildings of a CityMETER unit replace OSM there; wait for the provinces' unit files (small) so the focus is
  // shaped once, from the right source. A file that fails leaves the area on OSM.
  const codes = massingProvinces(regions);
  state.buildingUnits?.ensureMany(codes);
  if (!state.buildingUnits || codes.every(c => state.buildingUnits.settled(c))) {
    const zones = state.buildingUnits?.zonesFor(regions) || [];
    state.massing?.update({regions, hosts: [], anchors, zones, enabled: true, city: state.view3d, zoom: state.map.getZoom(), latitude: state.map.getCenter().lat})?.catch(e => console.warn('Massing', e));
  }
  applyJoin();
  state.pins?.layout();
}

/** The province frame under a point (its code, or ''). Quiet frames still answer the query. */
function provinceAt(point) {
  const layers = ['province-fill'].filter(id => state.map.getLayer(id));
  const f = layers.length ? state.map.queryRenderedFeatures(point, {layers})[0] : null;
  if (f) return String(f.id ?? f.properties?.id);
  // Above the fill's zoom: the frame under the point from the geometry.
  if (!state.provincesGeo?.features?.length) return '';
  state.locateProvince ||= provinceLocator(state.provincesGeo);
  return state.locateProvince(state.map.unproject(point).toArray());
}

/** What a building under the pointer would open — a building in the open estate's extent (null: the click falls through). */
function buildingTarget(point) {
  if (!state.estateLit?.keys.length) return null;
  const b = state.massing?.hitTest(point);
  if (!b || !state.join) return null;
  const key = state.join.keyOfPiece.get(b.id);
  if (!key || !state.estateLit.keys.includes(key)) return null;
  return {kind: 'building', key};
}

/**
 * One click handler, in priority order: project pin → the building being looked at (x-ray: frame it again) → a
 * building in the open estate's extent → a station → an estate extent → a province. A click inside the selected
 * province changes nothing (pan and tilt freely).
 */
function onMapClick(e) {
  const point = e.point;
  const s = state.pins?.hitTest(point);
  if (s) { selectSite(s.id, {fromPin: true, showPopup: true}); return; }
  if (state.xray?.hitTest([point.x, point.y]) && frameFocus()) return;
  const hit = buildingTarget(point);
  if (hit) { selectBuilding(hit.key); return; }
  const station = state.stations?.hitTest(point);
  if (station) { selectStation(station); return; }
  const estate = state.extentLayers?.hitTest(point);
  if (estate >= 0) { const site = state.data.sites[estate]; if (site && site.id !== openSite()?.id) selectSite(site.id); return; }
  if (!state.showAreas) return;
  const code = provinceAt(point);
  if (code && code !== $('province').value && state.map.getZoom() < PROVINCE_FILL_MAX_ZOOM + 1.5) selectProvince(code);
}

/** Pointer feedback (one query per frame): pointer over anything clickable. */
function onMapMove(e) {
  onMapMove.point = e.point;
  if (onMapMove.frame) return;
  onMapMove.frame = requestAnimationFrame(() => {
    onMapMove.frame = 0;
    const map = state.map, p = onMapMove.point;
    if (!map || !state.loaded || !p) return;
    const pin = state.pins?.hitTest(p) || null;
    state.siteLabels?.hover(pin);
    let over = Boolean(pin) || Boolean(state.xray?.hitTest([p.x, p.y])) || Boolean(buildingTarget(p)) || Boolean(state.stations?.hitTest(p));
    if (!over) { const c = state.extentLayers?.hitTest(p); over = c >= 0 && state.data.sites[c]?.id !== openSite()?.id; }
    if (!over && state.showAreas && map.getZoom() < PROVINCE_FILL_MAX_ZOOM + 1.5) { const code = provinceAt(p); over = Boolean(code) && code !== $('province').value; }
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  });
}

function installSpatialLayers() {
  const map = state.map;
  state.loaded = true;
  // MapLibre 5.6.2 throws in its tile cover when the pitched building camera zooms out through 13–14 (js/shell/maplibre-guard.js).
  guardRetainedTiles(map, maplibregl.getVersion?.());
  // After a programmatic ease on terrain MapLibre 5.6.2 stops clamping the centre to the ground (js/shell/maplibre-guard.js).
  guardElevationFreeze(map, maplibregl.getVersion?.());
  const palette = basemapPalette(theme());
  state.provinceLayers = state.provincesGeo?.features?.length ? installProvinceLayers(map, state.provincesGeo) : null;
  try { state.extentLayers = installExtentLayers(map, {beforeId: MASSING_BEFORE}); }
  catch (e) { state.extentLayers = null; console.warn('Extent layers unavailable', e); }
  state.massing = installMassing(map, {
    beforeId: MASSING_BEFORE,
    colors: {quiet: palette.massingQuiet, focus: palette.massingFocus, ground: palette.ground, venue: cssVar('--map-active-layer') || undefined},
    tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : ''),
    cmTileUrl, cmAttribution: CM_ATTRIBUTION,
    budget: state.budget.level === 'full' ? null : state.budget,
    viewCenter: seenCenter,
    onResult: result => {
      const status = $('map-status');
      status.dataset.massing = `${result.features || 0}`;
      status.dataset.cmBuildings = `${result.cm?.kept || 0}`;
      state.buildingSources = {osm: result.osm || 0, cm: result.cm?.kept || 0};
      applyJoin();
      renderLegend();
    },
  });
  try { state.xray = installVenueXray(map, {beforeId: VENUE_XRAY_BEFORE, colors: xrayColors()}); }
  catch (e) { state.xray = null; console.warn('Building x-ray unavailable', e); }
  try { state.stations = installStationLayer(map, state.data.stations); }
  catch (e) { state.stations = null; console.warn('Station layer unavailable', e); }
  state.pins = installBranchPins(map, $('map'), {
    reservedBottom: bottomSpace,
    onSelect: s => selectSite(s.id, {fromPin: true, showPopup: true}),
    onHover: (s, el) => state.siteLabels?.hover(s, el),
    onLayout: stats => renderMapStatus(stats),
  });
  try {
    state.terrain = installTerrain(map, {beforeId: 'water', colors: terrainColors(), onChange: active => {
      state.terrainActive = active;
      renderLegend();
      onGroundChange();
    }, onLoaded: onGroundChange, site: () => (openSite() && hasPoint(openSite()) ? [openSite().longitude, openSite().latitude] : null), pool: state.budget.terrainPool});
    state.terrain.setEnabled(state.view3d && state.budget.terrain);
  } catch (e) { state.terrain = null; console.warn('Terrain unavailable', e); }
  const labelBounds = () => state.pins?.bounds?.() || {left: 0, top: 0, right: map.getContainer().clientWidth, bottom: map.getContainer().clientHeight, exclusions: []};
  state.siteLabels = installSiteLabels(map, $('map'), {
    onSelect: s => selectSite(s.id, {fromPin: true, showPopup: true}),
    bounds: labelBounds,
    avoid: () => {
      const b = buildingScreenBox();
      return b ? [{left: b.minX - 4, right: b.maxX + 4, top: b.minY - 4, bottom: b.maxY + 4}] : [];
    },
    radius: (s, zoom) => pinRadius(zoom),
    isPhone: mobilePortrait,
    finePointer: () => matchMedia('(hover: hover) and (pointer: fine)').matches,
    num, meters,
    groupName: s => s.type?.th || '',
    placeName: s => [districtName(s.district ? state.index.byId.get(s.district) : null, s.province), nameOf(s.province)].filter(Boolean).join(' · '),
  });
  updatePins();
  updateSpatialLayers();
  if (!state.initialCameraDone) {
    state.initialCameraDone = true;
    const resume = state.resumeView; state.resumeView = null;
    if (twoPoint()) frameFocus({instant: true});
    else if (resume) state.map.jumpTo(resume);
    else fitMap({instant: true});
    state.lastPreset = cameraPreset();
  }
  scheduleLabelView();
}

/** Screen box of the building being looked at (null when none is known or no building view is open). */
function buildingScreenBox() {
  if (!state.map || !twoPoint()) return null;
  const shape = focusShape();
  return shape.features.length ? screenBounds(state.map, shape.points) : null;
}

/**
 * The attribution (OpenStreetMap / OpenMapTiles / CityMETER) must stay readable: its live height becomes
 * --attrib-height, which keeps the phone dock above it while it is open.
 */
function trackAttribution(map) {
  const panel = map.getContainer().closest('.map-panel');
  const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (!panel || !el) return null;
  const set = () => {
    panel.style.setProperty('--attrib-height', `${Math.ceil(el.getBoundingClientRect().height) + 10}px`);
    panel.classList.toggle('is-attrib-compact', el.classList.contains('maplibregl-compact') && !el.classList.contains('maplibregl-compact-show'));
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
  observer?.observe(el);
  if (typeof MutationObserver === 'function') new MutationObserver(set).observe(el, {attributes: true, attributeFilter: ['class']});
  set();
  return observer;
}

/** Ramp tick labels on the ramp's actual width: a label that would touch the one before it steps aside. */
function spaceTicks(root) {
  for (const ramp of root?.querySelectorAll('.ramp-ticks') || []) {
    const ticks = [...ramp.querySelectorAll('.ramp-tick')];
    ticks.forEach(t => t.classList.remove('is-crowded'));
    if (ticks.length < 3 || !ramp.offsetWidth) continue;
    const shown = [ticks[0]];
    for (const t of ticks.slice(1)) {
      const last = t === ticks.at(-1);
      while (shown.length > 1 && shown.at(-1).getBoundingClientRect().right + 4 > t.getBoundingClientRect().left) {
        if (!last) break;
        shown.pop().classList.add('is-crowded');
      }
      if (shown.at(-1).getBoundingClientRect().right + 4 > t.getBoundingClientRect().left && !last) { t.classList.add('is-crowded'); continue; }
      shown.push(t);
    }
  }
}

/** The legend's height changes with the measure switch and the ramp (--legend-height); its ticks are spaced again on resize. */
function trackLegend() {
  const panel = document.querySelector('.map-panel'), el = $('map-legend');
  if (!panel || !el) return null;
  const set = () => { panel.style.setProperty('--legend-height', `${Math.ceil(el.offsetParent ? el.getBoundingClientRect().height : 0)}px`); spaceTicks(el); };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(set) : null;
  observer?.observe(el);
  set();
  return observer;
}

/** The parts that bound the free box of the building view can change size after a frame: frame it again once still. */
function watchFreeBox() {
  if (typeof ResizeObserver !== 'function') return null;
  let timer = 0;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!state.loaded || !state.map) return;
      if (state.map.isMoving()) { state.map.once('moveend', later); return; }
      refitOnNewBox();
    }, 150);
  };
  const observer = new ResizeObserver(later);
  for (const el of [$('map'), $('map-legend'), $('insights'), $('results'), $('map-aha'), $('panel')]) if (el) observer.observe(el);
  return observer;
}

/** Thai labels for the map's own controls. */
const MAP_LOCALE = {
  'Map.Title': 'แผนที่หมู่บ้านจัดสรรและแปลงจัดสรร', 'NavigationControl.ZoomIn': 'ซูมเข้า', 'NavigationControl.ZoomOut': 'ซูมออก',
  'NavigationControl.ResetBearing': 'หมุนกลับทิศเหนือ (ลากเพื่อหมุนหรือเอียง)', 'Popup.Close': 'ปิด', 'AttributionControl.ToggleAttribution': 'แสดงหรือซ่อนที่มาของแผนที่',
};

function initMap() {
  if (!window.maplibregl) throw new Error('Map library is unavailable');
  try {
    state.mapTheme = theme();
    state.budget = mapBudget();
    state.map = new maplibregl.Map({container: 'map', pixelRatio: budgetPixelRatio(state.budget), maxTileCacheZoomLevels: state.budget.cacheZoomLevels, center: BANGKOK.center, zoom: 5.4, pitch: 0, maxPitch: 85, attributionControl: {compact: true}, locale: MAP_LOCALE, style: buildMapStyle(state.mapTheme)});
    state.map.addControl(new maplibregl.NavigationControl({showCompass: true, visualizePitch: true}), 'top-right');
    state.attribObserver = trackAttribution(state.map);
    state.legendObserver ||= trackLegend();
    document.fonts?.ready?.then(() => spaceTicks($('map-legend')));
    state.freeBoxObserver ||= watchFreeBox();
    // District chips first: the province chips keep clear of them (js/map-layers.js `avoid`).
    state.districtLabels = installAreaLabels(state.map, $('map'), {className: 'neighborhood-label', hostId: 'district-labels', hostLabel: 'เขตและอำเภอบนแผนที่', minZoom: 7, maxZoom: 13.5, verb: 'กดเพื่อดูเขตหรืออำเภอ', onSelect: id => selectUnit(id), reservedBottom: labelBottomSpace, maxLabels: 40, detailZoomClass: false});
    state.provinceLabels = installAreaLabels(state.map, $('map'), {className: 'province-label', hostId: 'province-labels', hostLabel: 'จังหวัดบนแผนที่', minZoom: PROVINCE_VIEW_MIN_ZOOM, maxZoom: PROVINCE_LABEL_MAX_ZOOM, verb: 'กดเพื่อดูจังหวัด', onSelect: code => selectProvince(code), reservedBottom: labelBottomSpace, maxLabels: 77, avoid: '#district-labels .area-label:not([hidden])'});
    state.map.on('zoomend', () => { if (state.loaded) renderLegend(); });
    state.map.on('moveend', scheduleLabelView);
    state.map.on('moveend', followCamera);
    state.map.on('idle', () => { if (state.loaded && state.panel.mode === 'site') fillTerrain(siteById(state.panel.id)); });
    state.map.on('style.load', installSpatialLayers);
    state.map.on('click', onMapClick);
    state.map.on('mousemove', onMapMove);
    state.map.on('movestart', e => { if (e.originalEvent) state.userCamera = true; });
    state.map.on('movestart', () => clearTimeout(state.tiltTimer));
    state.map.on('pitchstart', e => { if (e.originalEvent) state.readerPitch = true; });
    state.map.on('moveend', tiltWhenNear);
    for (const type of ['wheel', 'touchend', 'pointerup', 'dblclick']) state.map.getCanvasContainer().addEventListener(type, () => { state.readerMovedAt = Date.now(); }, {passive: true});
    state.map.on('error', e => { watchBasemap.error(e); console.warn('Map resource', e.error?.message || e); });
    state.map.on('sourcedata', watchBasemap.data);
    state.contextWatch = watchContext(state.map, () => restartMap('context-lost'));
    $('map').dataset.budget = state.budget.level;
    fetch(TILEJSON_URL).then(r => r.json()).then(j => { state.tileTemplate = j.tiles?.[0] || ''; if (state.loaded) updateSpatialLayers(); }).catch(e => { partial('basemap'); console.warn('TileJSON', e); });
  } catch (e) {
    dropMap();
    throw e;
  }
}

/** Take the map down (a failed start, a lost context): observers, labels, layers, then the map itself. */
function dropMap() {
  state.loaded = false; state.initialCameraDone = false;
  for (const cleanup of [() => state.contextWatch?.(), () => state.attribObserver?.disconnect(), () => state.provinceLabels?.dispose(), () => state.districtLabels?.dispose(), disposeSpatial, () => state.map?.remove()]) { try { cleanup(); } catch (err) { console.warn('Map cleanup', err); } }
  state.map = null; state.provinceLabels = null; state.districtLabels = null; state.contextWatch = null; state.attribObserver = null;
  watchBasemap.reset();
}

/** The basemap's own tiles: when they fail and none has arrived, the page says so (`basemap` in PARTIAL). */
const watchBasemap = {
  errors: 0, loaded: false, told: false,
  reset() { this.errors = 0; this.loaded = false; },
  error: e => {
    const w = watchBasemap;
    if (w.loaded || e?.sourceId !== 'openmaptiles') return;
    if (++w.errors >= 3 && !w.told) { w.told = true; partial('basemap'); trouble('basemap-tiles'); }
  },
  data: e => {
    const w = watchBasemap;
    if (w.loaded || e?.sourceId !== 'openmaptiles' || !e.tile || e.tile.state !== 'loaded') return;
    w.loaded = true;
    if (w.told) { w.told = false; window.dispatchEvent(new CustomEvent('citymeter:partial', {detail: {id: 'basemap', resolved: true}})); }
  },
};
/** Tell the launch script the map was in trouble (it keeps the last few for a report and turns the tab lean). */
function trouble(kind, note = '') { window.dispatchEvent(new CustomEvent('citymeter:map-trouble', {detail: {kind, note}})); }

/** A new map in place of one that lost its context; twice at most, then the map's own failure card. */
function restartMap(reason) {
  if (!state.map) return;
  const view = {center: state.map.getCenter(), zoom: state.map.getZoom(), pitch: state.map.getPitch(), bearing: state.map.getBearing()};
  state.mapRestarts = (state.mapRestarts || 0) + 1;
  trouble(reason, `restart ${state.mapRestarts}`);
  dropMap();
  if (state.mapRestarts > 2) {
    const el = $('map-failure');
    el.hidden = false;
    el.innerHTML = '<p>แผนที่หยุดแสดงผล ข้อมูล ตาราง และกราฟยังใช้งานได้</p><button type="button" class="btn">เปิดแผนที่อีกครั้ง</button>';
    el.querySelector('button').onclick = event => { event.target.disabled = true; state.mapRestarts = 0; startMap(); };
    return;
  }
  state.resumeView = view;
  startMap();
}

async function startMap() {
  const el = $('map-failure');
  try { await loadMapLibrary(); el.hidden = true; initMap(); }
  catch (e) {
    el.hidden = false;
    el.innerHTML = `<p>โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้</p><p class="hint">${esc(e.message || '')}</p><button type="button" class="btn">ลองโหลดแผนที่ใหม่</button>`;
    el.querySelector('button').onclick = event => { event.target.disabled = true; startMap(); };
    console.warn(e);
  }
}

/** A project or a building chosen on the flat map turns the map 3D, as the 3D button does. Returns true when it switched. */
function ensure3d() {
  if (state.view3d) return false;
  state.view3d = true;
  $('toggle-3d').setAttribute('aria-pressed', 'true');
  renderLegend();
  return true;
}

/**
 * A phone's plan view turns 3D where the buildings are (owner 2026-11-11 20:38: “ลอง pan แผนที่ในภูเก็ตอาคาร 3d ไม่แสดงเลย”):
 * once the map has rested after the reader's own move at the zoom where the focus buildings are drawn, a flat camera
 * takes the 3D preset, as the 3D button does; a pitch set by hand stands.
 */
const TILT_ZOOM = 14, FLAT_PITCH = 20;
function tiltWhenNear(e) {
  clearTimeout(state.tiltTimer);
  if (e?.originalEvent) state.readerMovedAt = Date.now();
  if (state.readerPitch || Date.now() - (state.readerMovedAt || 0) > 2500) return;
  state.tiltTimer = setTimeout(() => {
    const map = state.map;
    if (!map || state.readerPitch || !state.view3d || !mobilePortrait() || twoPoint() || map.isMoving()) return;
    if (map.getZoom() < (state.budget?.focusZoom || TILT_ZOOM)) return;
    if (map.getPitch() >= FLAT_PITCH) return;
    applyPreset(map, cameraPreset() === 'city' ? 'model' : cameraPreset(), {animate: animate(), duration: 600});
    state.lastPreset = cameraPreset();
  }, 220);
}

function toggle3d() {
  state.view3d = !state.view3d;
  state.readerPitch = false;
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  renderLegend();
  updateSpatialLayers();
  if (state.map) {
    if (!frameFocus()) {
      if (state.panel.mode === 'site') fitSite(siteById(state.panel.id));
      else applyPreset(state.map, state.map.getZoom() >= 12 && state.view3d ? 'model' : cameraPreset(), {animate: animate()});
    }
    state.lastPreset = cameraPreset();
  }
  saveURL();
}

/* ---------- mobile sheet ---------- */
/** How tall the phone sheet stands: 'peek' for an item, 'half' for the overview, 'full' when the reader opens it. */
const restSheet = () => (state.panel.mode === 'overview' ? 'half' : 'peek');
function setSheet(next) {
  const panel = $('panel'), grip = $('sheet-grip');
  if (!grip || panel.dataset.sheet === next) return;
  const full = next === 'full', words = full ? 'ย่อแผ่นข้อมูล' : 'ขยายแผ่นข้อมูล';
  panel.dataset.sheet = next;
  grip.setAttribute('aria-expanded', String(full));
  grip.title = words;
  const label = grip.querySelector('.sr-only');
  if (label) label.textContent = words;
  if (!full) panel.scrollTop = 0;
}
const toggleSheet = () => setSheet($('panel').dataset.sheet === 'full' ? restSheet() : 'full');
/** A swipe on the sheet's bar: up opens the sheet whole, down brings it back to its resting height, down again closes it. */
function installSheetSwipe() {
  const bar = $('sheet-bar'), grip = $('sheet-grip');
  if (!bar || !grip) return;
  let startY = null, pointer = null, swipedAt = 0;
  bar.addEventListener('pointerdown', e => { if (!e.target.closest('#sheet-back, #close-mobile-panel')) { startY = e.clientY; pointer = e.pointerId; } });
  const end = e => {
    if (startY === null || e.pointerId !== pointer) return;
    const dy = e.clientY - startY;
    startY = null;
    if (Math.abs(dy) < 28) return;
    swipedAt = Date.now();
    if (dy < 0) setSheet('full');
    else if ($('panel').dataset.sheet === 'full') setSheet(restSheet());
    else closeMobilePanel();
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', () => { startY = null; });
  grip.addEventListener('click', () => { if (Date.now() - swipedAt > 350) toggleSheet(); });
}
/** Open the phone sheet. A building being looked at is framed again in the strip above it. */
function openMobilePanel({frame = true} = {}) {
  if (!mobilePortrait()) return;
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.add('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'true');
  $('map-aha').hidden = true;
  if (frame && !wasOpen && state.loaded && twoPoint()) frameFocus();
}
function closeMobilePanel() {
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.remove('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'false');
  if (mobilePortrait()) {
    $('mobile-panel').focus({preventScroll: true});
    if (state.panel.mode === 'overview') renderPanel();
    else if (wasOpen && state.loaded && state.panel.mode === 'site') fitSite(siteById(state.panel.id));
    else if (wasOpen && state.loaded && twoPoint()) frameFocus();
    updateSpatialLayers();
  }
}

/* ---------- data loading ---------- */
function validFeatureCollection(value) {
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) return false;
  const position = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = r => Array.isArray(r) && r.length >= 4 && r.every(position);
  const polygon = p => Array.isArray(p) && p.length > 0 && p.every(ring);
  return value.features.every(f => {
    const g = f?.geometry, id = f?.id ?? f?.properties?.id;
    return f?.type === 'Feature' && (typeof id === 'string' || typeof id === 'number') && (g?.type === 'Polygon' ? polygon(g.coordinates) : g?.type === 'MultiPolygon' && g.coordinates.every(polygon));
  });
}

async function fetchJSON(resource, {timeout = 20000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(resource, {signal: controller.signal, cache: 'no-cache'});
    if (!r.ok) { const e = new Error('โหลดข้อมูลไม่สำเร็จ'); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) { e.resource = resource; e.phase = 'data'; throw e; }
  finally { clearTimeout(timer); }
}

/** Replace a select's options after its first (empty) one. */
function setOptions(id, items) {
  const s = $(id), keep = s.value;
  while (s.options.length > 1) s.remove(1);
  for (const [value, label] of items) { const o = document.createElement('option'); o.value = value; o.textContent = label; s.append(o); }
  s.value = [...s.options].some(o => o.value === keep) ? keep : '';
}

/** Option labels carry their counts (counted once at start): records per plot type and province, projects per house type. */
function refreshOptionCounts() {
  const plotRecords = PLOT_TYPES.map(() => 0), provinces = new Map(), houses = new Map();
  for (const u of state.data.units) {
    u.typeRecords.forEach((v, i) => { plotRecords[i] += v; });
    provinces.set(u.province, (provinces.get(u.province) || 0) + u.records);
  }
  for (const s of state.data.sites) if (s.type) houses.set(s.type.id, (houses.get(s.type.id) || 0) + 1);
  setOptions('type', PLOT_TYPES.map((t, i) => [t.id, `${t.th} (${num(plotRecords[i])})`]));
  setOptions('house', state.data.types.map(t => [t.id, `${t.th} (${num(houses.get(t.id) || 0)})`]));
  setOptions('province', [...provinceList()].sort((a, b) => COLLATOR.compare(a.th, b.th)).map(p => [p.code, `${p.th} (${num(provinces.get(p.code) || 0)})`]));
}

function restoreFromURL() {
  const p = nav.read();
  for (const f of FIELDS) if (p.has(f)) { const v = f === 'province' ? provinceCodeFrom(p.get(f)) : p.get(f); if (f === 'search' || [...($(f).options || [])].some(o => o.value === v)) $(f).value = v; }
  if (['provinces', 'types', 'districts'].includes(p.get('view'))) state.view = p.get('view');
  if (p.get('metric') === 'records') state.metric = 'records';
  if (p.get('areas') === 'all') state.autoFocus = false;
  state.view3d = p.get('view3d') !== '0';
  const district = p.get('district') && unitById(p.get('district'));
  if (district) { state.panel = {mode: 'unit', id: district.id}; $('province').value = district.province; }
  const company = p.get('company') && companyById(p.get('company'));
  if (company) state.panel = {mode: 'company', id: company.id};
  const station = stationById(p.get('station'));
  if (station) state.panel = {mode: 'station', id: station.id};
  // A record is known once data/records.json is in: the panel waits for it (js/app.js#onFileLoaded).
  if (/^\d{18}$/.test(p.get('record') || '')) state.panel = {mode: 'record', id: p.get('record')};
  const site = p.get('site') && siteById(p.get('site'));
  if (site) state.panel = {mode: 'site', id: site.id};
}

/** Browser back / forward (citymeter-shell): show the level the restored address names. */
function restoreFromHistory() {
  for (const f of FIELDS) $(f).value = '';
  Object.assign(state, {view: 'provinces', metric: 'plots', autoFocus: true, panel: overviewPanel(), history: [], buildingSel: null});
  restoreFromURL();
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  update({fit: true});
  ensureFor(state.panel.mode);
}

function wireEvents() {
  let timer;
  for (const f of FIELDS) $(f).addEventListener(f === 'search' ? 'input' : 'change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.history = [];
      state.panel = overviewPanel();
      state.buildingSel = null;
      update({fit: true});
    }, f === 'search' ? 450 : 0);
  });
  $('filters').addEventListener('reset', () => setTimeout(resetToOverview, 0));
  const metrics = [...document.querySelectorAll('[data-metric]')];
  metrics.forEach((b, i) => {
    b.onclick = () => setMetric(b.dataset.metric);
    b.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const next = metrics[(i + 1) % metrics.length];
      next.focus(); setMetric(next.dataset.metric);
    });
  });
  $('panel-view').addEventListener('click', onPanelAction);
  $('filter-chips').addEventListener('click', onPanelAction);
  $('map-aha').addEventListener('click', onPanelAction);
  $('crumbs').addEventListener('click', onPanelAction);

  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((b, i) => {
    b.onclick = () => { state.view = b.dataset.view; drawChart(); saveURL(); };
    b.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[j].focus(); tabs[j].click();
    });
  });

  $('fit-map').onclick = () => { if (state.map) fitMap(); };
  // ทั้งประเทศ = the whole country, every province alike: no province filter, no focus (?areas=all).
  $('country-map').onclick = () => {
    $('province').value = '';
    state.autoFocus = false;
    state.panel = overviewPanel(); state.history = []; state.buildingSel = null;
    update({fit: true});
    announce('ทั้งประเทศ · ทุกจังหวัด');
  };
  $('toggle-3d').onclick = toggle3d;
  $('toggle-neighborhoods').onclick = () => { state.showAreas = !state.showAreas; $('toggle-neighborhoods').setAttribute('aria-pressed', String(state.showAreas)); updateSpatialLayers(); };
  $('mobile-panel').onclick = () => { $('panel').classList.contains('is-open') ? closeMobilePanel() : openMobilePanel(); };
  $('close-mobile-panel').onclick = closeMobilePanel;
  $('sheet-back').onclick = goBack;
  installSheetSwipe();
  document.querySelector('.skip').onclick = () => { openMobilePanel(); $('dataset-title').focus(); };
  $('toggle-insights').onclick = () => openInsights($('insight-content').hidden);
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncBottomPanel).observe($('insights')); else window.addEventListener('resize', syncBottomPanel);
  $('open-table').onclick = () => { openTable(); $('toggle-table').focus(); };
  $('toggle-table').onclick = () => { $('results').hidden = true; $('open-table').focus(); };
  $('prev-page').onclick = () => { state.page--; renderTable(); };
  $('next-page').onclick = () => { state.page++; renderTable(); };
  $('theme').onchange = applyTheme;
  const colorMedia = matchMedia('(prefers-color-scheme: dark)');
  const onColorChange = () => { if ($('theme').value === 'auto') applyTheme(); };
  if (colorMedia.addEventListener) colorMedia.addEventListener('change', onColorChange); else colorMedia.addListener(onColorChange);
  matchMedia('(max-width: 760px) and (orientation: portrait)').addEventListener?.('change', () => { if (!mobilePortrait()) $('panel').classList.remove('is-open'); renderPanel(); });
}

/**
 * A part of the data that did not load is said on the page (citymeter-shell 0.6.0, js/shell/launch.js
 * `citymeter:partial`): what is missing and what that does to the result on screen, with a reload that keeps the
 * address. The words live here, by file: [Thai name, Thai effect, English name, English effect].
 */
const PARTIAL = {
  'data/provinces.geojson': ['กรอบจังหวัด', 'แผนที่ไม่แสดงสีและขอบจังหวัด ตัวเลขในแผงยังครบ', 'Province outlines', 'The map shows no province colours or outlines; the panel figures are complete'],
  'data/extents.json': ['กรอบพื้นที่โครงการ', 'ไม่แสดงกรอบพื้นที่และอาคารในกรอบ ตัวเลขแปลงจัดสรรยังครบ', 'Estate extents', 'Estate extents and the buildings inside them are not shown; the plot figures are complete'],
  'data/portfolio.json': ['หลักฐานของโครงการ', 'ไม่แสดงลิงก์ นิติบุคคล และเหตุการณ์ของโครงการ ตัวเลขแปลงจัดสรรยังครบ', 'Project evidence', 'Project links, legal entities and events are not shown; the plot figures are complete'],
  'data/records.json': ['รายการจัดสรรรายระเบียน', 'ไม่แสดงตาราง รายการรายระเบียน และการค้นหารายการ ตัวเลขรายจังหวัดและอำเภอยังครบ', 'Allocation records', 'The table, the single records and the record search are not shown; the province and district figures are complete'],
  'units': ['รูปอาคารของ CityMETER', 'อาคารบางจังหวัดแสดงจากแผนที่ฐานแทนชุดอาคารของ CityMETER', 'CityMETER building shapes', 'Buildings in some provinces come from the basemap instead of the CityMETER set'],
  'basemap': ['แผนที่ฐาน', 'ถนน แหล่งน้ำ และอาคารพื้นหลังอาจไม่แสดง ข้อมูลในแผงและตารางยังใช้ได้', 'Basemap', 'Roads, water and background buildings may be missing; the panel and the table still work'],
};
function partial(key) {
  const words = PARTIAL[key];
  if (!words || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('citymeter:partial', {detail: {id: key, label: words[0], effect: words[1], labelEn: words[2], effectEn: words[3]}}));
}

async function init() {
  try {
    const [dataJSON, indexJSON, provincesJSON] = await Promise.all([
      fetchJSON('data/estates.json', {timeout: 30000}),
      fetchJSON('data/area-index.json', {timeout: 30000}),
      fetchJSON('data/provinces.geojson', {timeout: 30000}).catch(e => { partial('data/provinces.geojson'); console.warn('Province frames unavailable', e); return null; }),
    ]);
    if (!Array.isArray(indexJSON?.provinces) || !indexJSON.provinces.length) {
      const e = new Error('Invalid area index'); e.resource = 'data/area-index.json'; e.phase = 'data-schema'; throw e;
    }
    setProvinces(indexJSON.provinces);
    state.index = buildAreaIndex(indexJSON);
    state.provincesGeo = validFeatureCollection(provincesJSON) ? provincesJSON : {type: 'FeatureCollection', features: []};
    state.data = decodeDataset(dataJSON, state.index);
    state.stationById = new Map(state.data.stations.map(s => [s.id, s]));
    state.siteById = new Map(state.data.sites.map(s => [s.id, s]));
    state.siteIndex = new Map(state.data.sites.map((s, i) => [s.id, i]));
    state.companyById = new Map(state.data.companies.map(u => [u.id, u]));
    state.unitById = new Map(state.data.units.map(u => [u.id, u]));
    registerDataNames({index: state.index, data: state.data});
    // Buildings per area (the Hotel rule of 2026-11-01, point 3): which อปท./เขต draw CityMETER Building V4 (js/shell/building-units.js).
    state.buildingUnits = createBuildingUnitStore({fetchJSON, version: RELEASE, onLoad: () => { if (state.loaded) updateSpatialLayers(); },
      onError: (code, e) => { partial('units'); console.warn('Building units unavailable', code, e); if (state.loaded) updateSpatialLayers(); }});
    state.buildingUnits.loadIndex();

    refreshOptionCounts();
    restoreFromURL();
    $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
    try { $('theme').value = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
    applyTheme();
    wireEvents();
    update();
    ensureFor(state.panel.mode);
    // The optional files follow the first paint (they are not needed to read the provinces), with or without a map:
    // the extents first, then the projects' evidence, then the records (the largest).
    setTimeout(() => ensureExtents(), 1200);
    setTimeout(() => ensurePortfolio(), 2600);
    setTimeout(() => ensureRecords(), 4000);
    if (state.panel.mode !== 'overview') openMobilePanel();
    window.dispatchEvent(new CustomEvent('citymeter:ready'));
    startMap();
  } catch (e) {
    window.dispatchEvent(new CustomEvent('citymeter:load-error', {detail: {message: 'โหลดข้อมูลหมู่บ้านจัดสรรไม่สำเร็จ กรุณาลองอีกครั้ง', resource: e.resource, status: e.status, phase: e.phase || 'startup', diagnostic: e.message}}));
    console.error(e);
  }
}

// Developer hook for live tuning in a browser console (not an API; may change without notice).
window.__citymeter = {state, get map() { return state.map; }, update, fitMap, updateSpatialLayers, applyPreset: (name, opts) => state.map && applyPreset(state.map, name, opts), fitPitched: (b, opts) => state.map && fitPitched(state.map, b, opts), cameraPadding, visibleBox, focusTarget: () => focusTarget(), focusShape: () => focusShape(), frameFocus, selectSite, selectCompany, selectUnit, selectRecord, selectStation, selectBuilding, selectProvince, setMetric, buildMapStyle, ensureRecords};

init();
