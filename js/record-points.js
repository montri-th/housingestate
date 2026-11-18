/**
 * DOL records on the map, at the point CityMETER production draws for each (data/record-points.json, 0.2.0; owner
 * 2026-11-18 15:28, VERBATIM: “ทำไมไม่มีหมู่บ้านใน production ที่ทำไว้แล้ว มี coordinate น่าจะครบแล้ว”).
 *
 * One mark per point. The records production put at one point stay separate records: the mark carries their count, and
 * the open record's panel names them all (js/panel.js#renderRecord). A record is not a project: its mark is a neutral
 * bullseye (a ring in the card colour with a dot), never a house-type series or cue, from RECORD_MIN_ZOOM in; the
 * records of the focus (the chosen province, else every record) in the secondary text colour, the rest quiet; the
 * open record's point ringed in the selection stroke. Names from RECORD_LABEL_ZOOM (a record's own name; a shared
 * point says how many records it holds). Colours are foundation tokens of assets/theme.css (context marks: not a data
 * scale, not a category).
 */
import {GEOJSON_MAXZOOM} from './map-layers.js';
import {LANG} from './shell/i18n.js';

export const RECORD_MIN_ZOOM = 9.5;
export const RECORD_LABEL_ZOOM = 14.5;
export const RECORD_LAYERS = Object.freeze({ring: 'record-ring', dot: 'record-dot', label: 'record-label', selected: 'record-selected'});
const SOURCE = 'record-points';
const SELECTED = 'record-selected';
const EMPTY = Object.freeze({type: 'FeatureCollection', features: []});

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/**
 * Attach the production point to every record (r.lon, r.lat, r.at = the key of its point) and group the records by
 * point. data/record-points.json lists x and y (× 100,000) in the order of data/records.json; a file of another length
 * is refused. Pure.
 */
export function decodeRecordPoints(json, records) {
  const list = records?.records || [];
  if (!Array.isArray(json?.x) || !Array.isArray(json?.y) || json.x.length !== list.length || json.y.length !== list.length) {
    throw new Error('Invalid record points file');
  }
  const byKey = new Map();
  list.forEach((r, i) => {
    const x = json.x[i], y = json.y[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const key = `${x},${y}`;
    r.lon = x / 1e5; r.lat = y / 1e5; r.at = key;
    let at = byKey.get(key);
    if (!at) byKey.set(key, at = []);
    at.push(r);
  });
  // The records at one point in reading order: the most plots first, then the name.
  for (const at of byKey.values()) at.sort((a, b) => (b.plots ?? -1) - (a.plots ?? -1) || String(a.name).localeCompare(String(b.name), 'th') || (a.id < b.id ? -1 : 1));
  return {meta: json.meta || {}, byKey, keys: [...byKey.keys()]};
}

/** The other records production put at the record's point (reading order), [] for a record alone at its point. */
export function recordsAtPoint(points, record) {
  const at = record?.at ? points?.byKey.get(record.at) || [] : [];
  return at.filter(r => r !== record);
}

/** A mark's label: a record's own name (a leading โครงการ/หมู่บ้าน dropped), or how many records a shared point holds. */
export function pointLabel(at, lang = LANG) {
  if (at.length > 1) return lang === 'en' ? `${at.length.toLocaleString('en-US')} records` : `${at.length.toLocaleString('th-TH')} รายการ`;
  return String(at[0]?.name || '').replace(/^(โครงการ|หมู่บ้าน)\s*/, '').trim();
}

/**
 * GeoJSON of the points: one feature per point that holds a shown record (`visible`: a Set of records, null for all),
 * with the count and label of its shown records and whether one of them is in the focus province ('' for all). Pure.
 */
export function pointCollection(points, {visible = null, focusProvince = ''} = {}) {
  const features = [];
  if (!points) return EMPTY;
  points.keys.forEach((key, i) => {
    const at = visible ? points.byKey.get(key).filter(r => visible.has(r)) : points.byKey.get(key);
    if (!at.length) return;
    const r = at[0];
    features.push({type: 'Feature', id: i, geometry: {type: 'Point', coordinates: [r.lon, r.lat]},
      properties: {key, n: at.length, label: pointLabel(at), focus: !focusProvince || at.some(x => x.province === focusProvince) ? 1 : 0}});
  });
  return {type: 'FeatureCollection', features};
}

export function installRecordPoints(map, {beforeId} = {}) {
  map.addSource(SOURCE, {type: 'geojson', data: EMPTY, maxzoom: GEOJSON_MAXZOOM});
  map.addSource(SELECTED, {type: 'geojson', data: EMPTY, maxzoom: GEOJSON_MAXZOOM});
  // Zoom on the outside (MapLibre takes ['zoom'] only as the input of a top-level interpolate); a shared point a little larger.
  const radius = (base, pile) => ['interpolate', ['linear'], ['zoom'],
    RECORD_MIN_ZOOM, ['+', base, ['case', ['>', ['get', 'n'], 1], pile, 0]],
    13, ['+', base * 1.6, ['case', ['>', ['get', 'n'], 1], pile, 0]],
    16, ['+', base * 2.4, ['case', ['>', ['get', 'n'], 1], pile, 0]]];
  const paint = () => {
    const card = cssVar('--surface-card', '#FCFCFA'), strong = cssVar('--text-secondary', '#4E5B52'), quiet = cssVar('--text-muted', '#7B877D');
    const tone = ['case', ['==', ['get', 'focus'], 1], strong, quiet];
    return {
      ring: {'circle-radius': radius(2.2, 1.5), 'circle-color': card, 'circle-stroke-color': tone,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], RECORD_MIN_ZOOM, 0.8, 14, 1.4], 'circle-opacity': ['case', ['==', ['get', 'focus'], 1], 1, 0.7],
        'circle-stroke-opacity': ['case', ['==', ['get', 'focus'], 1], 1, 0.7]},
      dot: {'circle-radius': radius(0.9, 0.6), 'circle-color': tone, 'circle-opacity': ['case', ['==', ['get', 'focus'], 1], 1, 0.7]},
      label: {'text-color': strong, 'text-halo-color': card, 'text-halo-width': 1.4},
      selected: {'circle-radius': ['interpolate', ['linear'], ['zoom'], RECORD_MIN_ZOOM, 7, 16, 11], 'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': cssVar('--map-selected-stroke', '#176B82'), 'circle-stroke-width': 2.5},
    };
  };
  const p = paint();
  map.addLayer({id: RECORD_LAYERS.ring, type: 'circle', source: SOURCE, minzoom: RECORD_MIN_ZOOM, paint: p.ring}, beforeId);
  map.addLayer({id: RECORD_LAYERS.dot, type: 'circle', source: SOURCE, minzoom: RECORD_MIN_ZOOM, paint: p.dot}, beforeId);
  map.addLayer({id: RECORD_LAYERS.label, type: 'symbol', source: SOURCE, minzoom: RECORD_LABEL_ZOOM, filter: ['!=', ['get', 'label'], ''],
    layout: {'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.8],
      'text-optional': true, 'text-max-width': 10, 'symbol-sort-key': ['-', 0, ['get', 'n']]},
    paint: p.label}, beforeId);
  map.addLayer({id: RECORD_LAYERS.selected, type: 'circle', source: SELECTED, paint: p.selected}, beforeId);
  let last = null;
  let keys = [];

  /** Draw the points (a new collection only when it changed) and ring the open record's point ('' for none). */
  function update({points = EMPTY, selected = null} = {}) {
    if (points !== last) { map.getSource(SOURCE)?.setData(points); last = points; keys = points.features.map(f => f.properties.key); }
    map.getSource(SELECTED)?.setData(selected && Number.isFinite(selected.lon)
      ? {type: 'FeatureCollection', features: [{type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [selected.lon, selected.lat]}}]} : EMPTY);
  }
  function retheme() {
    const q = paint();
    const set = (id, props) => { if (map.getLayer(id)) for (const [k, v] of Object.entries(props)) map.setPaintProperty(id, k, v); };
    set(RECORD_LAYERS.ring, q.ring); set(RECORD_LAYERS.dot, q.dot); set(RECORD_LAYERS.label, q.label); set(RECORD_LAYERS.selected, q.selected);
  }
  /** The key of the point under a screen point ('' when none): the nearest mark within `radius` px. */
  function hitTest(point, radius = 7) {
    if (!map.getLayer(RECORD_LAYERS.ring) || map.getZoom() < RECORD_MIN_ZOOM) return '';
    const hits = map.queryRenderedFeatures([[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]], {layers: [RECORD_LAYERS.ring]});
    let best = '', bestD = Infinity;
    for (const h of hits) {
      const c = h.geometry?.coordinates;
      if (!c) continue;
      const s = map.project(c), d = (s.x - point.x) ** 2 + (s.y - point.y) ** 2;
      if (d < bestD) { bestD = d; best = h.properties?.key || keys[h.id] || ''; }
    }
    return best;
  }
  function dispose() {
    for (const id of Object.values(RECORD_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [SOURCE, SELECTED]) if (map.getSource(id)) map.removeSource(id);
  }
  return {update, retheme, hitTest, dispose, layerIds: RECORD_LAYERS};
}
