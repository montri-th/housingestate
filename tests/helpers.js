/** Shared loaders for the node tests (data files are read once per process). */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {decodeDataset, decodeRecords, setProvinces} from '../js/model.js';
import {buildAreaIndex} from '../js/areas.js';
import {decodeExtents, decodeRecordExtents} from '../js/extents.js';
import {decodeRecordPoints} from '../js/record-points.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
export const readJSON = path => { if (!cache.has(path)) cache.set(path, JSON.parse(readFileSync(join(ROOT, path), 'utf8'))); return cache.get(path); };
export const readBytes = path => readFileSync(join(ROOT, path));
export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

let loaded = null;
/** The shipped data set, decoded exactly as the browser does (the optional files too). */
export function load() {
  if (!loaded) {
    const indexJSON = readJSON('data/area-index.json'), provincesGeo = readJSON('data/provinces.geojson');
    setProvinces(indexJSON.provinces);
    const index = buildAreaIndex(indexJSON);
    const raw = readJSON('data/estates.json');
    const data = decodeDataset(raw, index);
    const recordsRaw = readJSON('data/records.json');
    const records = decodeRecords(recordsRaw, data);
    // The production point of every record (data/record-points.json), attached as the browser does once both are in.
    const pointsRaw = readJSON('data/record-points.json');
    const points = decodeRecordPoints(pointsRaw, records);
    const extentsRaw = readJSON('data/extents.json');
    const extents = decodeExtents(extentsRaw);
    const recordExtentsRaw = readJSON('data/record-extents.json');
    const recordExtents = decodeRecordExtents(recordExtentsRaw);
    const portfolio = readJSON('data/portfolio.json');
    loaded = {raw, data, index, indexJSON, provincesGeo, recordsRaw, records, pointsRaw, points, extentsRaw, extents, recordExtentsRaw, recordExtents, portfolio};
  }
  return loaded;
}
