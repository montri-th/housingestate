/**
 * Estate extents on the map (data/extents.json, loaded after the first paint — an optional file, js/app.js PARTIAL):
 * the approximate extents of OpenStreetMap matched to a project's reference pin by place and name
 * (scripts/match-extents.py: a residential area that holds the pin, or lies within 30 m of it, and carries the project's
 * name; ODbL, © OpenStreetMap contributors) for the projects in focus — a dashed outline, the open project's solid in the
 * selection stroke. An extent is a picture of where the estate is, never a deed, a legal boundary or a land size
 * (“กรอบราว N ไร่” = m² / 1,600). The drawn buildings inside the open project's extent are lit by js/app.js
 * (js/extent-buildings.js), as an open campus lights its buildings in CityMETER · University.
 * Colours are foundation map tokens of assets/theme.css (context marks: not a data scale, not a category).
 */
import {GEOJSON_MAXZOOM} from './map-layers.js';

export const EXTENT_MIN_ZOOM = 10;
export const EXTENT_LAYERS = Object.freeze({hit: 'estate-extent-hit', extent: 'estate-extent', extentSelected: 'estate-extent-selected'});
const SOURCE = 'estate-extents';
const EMPTY = Object.freeze({type: 'FeatureCollection', features: []});

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** Decode data/extents.json: one extent per project key ({osm, tag, name, m2, inside, d, geometry}). Pure. */
export function decodeExtents(json) {
  if (!json?.extents || typeof json.extents !== 'object') throw new Error('Invalid extents file');
  const byKey = new Map();
  for (const [key, e] of Object.entries(json.extents)) {
    if (!Array.isArray(e?.rings) || !e.rings.length) continue;
    byKey.set(key, {key, osm: e.osm, tag: e.tag, name: e.name || '', m2: e.m2, inside: Boolean(e.inside), d: e.d,
      geometry: {type: 'MultiPolygon', coordinates: e.rings}});
  }
  return {meta: json.meta || {}, byKey};
}

/**
 * Decode data/record-extents.json (0.3.0): the OpenStreetMap area each DOL record takes — the residential area that
 * holds its production point (or lies within 30 m of it) and carries its name, or an unnamed area of its one estate
 * whose plots fit it (scripts/match-record-extents.py). An area several records take is decoded once. Pure.
 */
export function decodeRecordExtents(json) {
  if (!json?.areas || typeof json.areas !== 'object' || !json?.records || typeof json.records !== 'object') throw new Error('Invalid record extents file');
  const areas = new Map();
  for (const [osm, a] of Object.entries(json.areas)) {
    if (!Array.isArray(a?.rings) || !a.rings.length) continue;
    areas.set(osm, {key: osm, osm, tag: a.tag, name: a.name || '', m2: a.m2, geometry: {type: 'MultiPolygon', coordinates: a.rings}});
  }
  const byRecord = new Map();
  for (const [id, pair] of Object.entries(json.records)) {
    const a = Array.isArray(pair) ? areas.get(pair[0]) : null;
    if (a) byRecord.set(id, {...a, how: pair[1] || ''});
  }
  return {meta: json.meta || {}, areas, byRecord};
}

/** GeoJSON of the extents of `siteIndexes` (index into data sites) that have one. */
export function extentCollection(extents, sites, siteIndexes) {
  const features = [];
  for (const i of siteIndexes) {
    const s = sites[i], e = s && s.extent >= 0 ? extents?.byKey.get(s.id) : null;
    if (e) features.push({type: 'Feature', id: i, geometry: e.geometry, properties: {site: i, id: s.id}});
  }
  return {type: 'FeatureCollection', features};
}

export function installExtentLayers(map, {beforeId} = {}) {
  map.addSource(SOURCE, {type: 'geojson', data: EMPTY, maxzoom: GEOJSON_MAXZOOM, promoteId: 'site'});
  const paint = () => ({
    extent: {'line-color': cssVar('--border-emphasis', '#7D877F'), 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.6], 'line-dasharray': [2, 1.5],
      'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0, 1]},
    selected: {'line-color': cssVar('--map-selected-stroke', '#176B82'), 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 15, 3],
      'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0]},
  });
  const p = paint();
  // A transparent fill: a click inside an estate extent opens its project (never drawn, never a data colour).
  map.addLayer({id: EXTENT_LAYERS.hit, type: 'fill', source: SOURCE, minzoom: EXTENT_MIN_ZOOM, paint: {'fill-color': '#000000', 'fill-opacity': 0}}, beforeId);
  map.addLayer({id: EXTENT_LAYERS.extent, type: 'line', source: SOURCE, minzoom: EXTENT_MIN_ZOOM, paint: p.extent}, beforeId);
  map.addLayer({id: EXTENT_LAYERS.extentSelected, type: 'line', source: SOURCE, minzoom: EXTENT_MIN_ZOOM - 2, paint: p.selected}, beforeId);
  let selected = -1, last = null;

  function update({extents = EMPTY, selectedSite = -1} = {}) {
    if (extents !== last) { map.getSource(SOURCE)?.setData(extents); last = extents; }
    if (selected >= 0) map.setFeatureState({source: SOURCE, id: selected}, {selected: false});
    selected = selectedSite;
    if (selected >= 0) map.setFeatureState({source: SOURCE, id: selected}, {selected: true});
  }
  function retheme() {
    const q = paint();
    const set = (id, props) => { if (map.getLayer(id)) for (const [k, v] of Object.entries(props)) map.setPaintProperty(id, k, v); };
    set(EXTENT_LAYERS.extent, q.extent); set(EXTENT_LAYERS.extentSelected, q.selected);
  }
  /** The project (index) whose extent is under a screen point, or -1 (a click inside an estate opens it). */
  function hitTest(point) {
    const layers = [EXTENT_LAYERS.hit].filter(id => map.getLayer(id));
    if (!layers.length || map.getZoom() < EXTENT_MIN_ZOOM) return -1;
    const f = map.queryRenderedFeatures([[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]], {layers})[0];
    return f ? Number(f.properties?.site) : -1;
  }
  function dispose() {
    for (const id of Object.values(EXTENT_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }
  return {update, retheme, hitTest, dispose, layerIds: EXTENT_LAYERS};
}
