/**
 * The Aha of the first screen (Hotel 0.3.x “Aha first”, made for this dataset's grain): where the plots of the DOL
 * records of the production snapshot concentrate.
 *
 *  - Thailand (no จังหวัด filter): up to three provinces with the most of the measure, their share of the whole
 *    total (numerator and denominator), the same share among house plots only (บ้านเดี่ยว · บ้านแฝด · บ้านแถว — the
 *    records also report shophouse plots, vacant plots and others; the bar names its base, so the reader sees the
 *    difference without a caveat), and the provinces where no record is counted under the filters (measured zero of
 *    this snapshot, never “no housing estate”).
 *  - A province: up to three districts (production boundaries) with the most of the measure, and their share of the
 *    province's total.
 * Never cut through a tie (a 3rd and 4th place with the same value → two), never focus every item that holds the
 * measure. Membership is the record's own production province and district; nothing is re-assigned by a point. Pure.
 */
import {provinceTotals, districtsOf, unitValue, HOUSE_PLOTS, PLOT_TYPES} from './model.js';

const COLLATOR = new Intl.Collator('th');
const HOUSE = HOUSE_PLOTS.map(id => PLOT_TYPES.findIndex(t => t.id === id));

/** The first k of a ranked list, k ≤ limit, never cutting through a tie; 0 when every item ties or one item holds everything. */
export function topWithoutTie(ranked, limit = 3, value = x => x.value) {
  let k = Math.min(limit, ranked.length);
  // Focusing every item that holds the measure says nothing about concentration (one item alone is its own finding).
  const positive = ranked.filter(x => value(x) > 0).length;
  if (positive > 1 && k >= positive) k = positive - 1;
  while (k > 0 && k < ranked.length && value(ranked[k - 1]) === value(ranked[k])) k--;
  return ranked.slice(0, k);
}

/** House plots (บ้านเดี่ยว + บ้านแฝด + บ้านแถว) of a district row. */
const housePlots = u => { const t = (u.base || u).types || []; return HOUSE.reduce((s, k) => s + (t[k] || 0), 0); };

/**
 * units: the filtered district rows (scope, before any focus); provinces: [{code, name}] of the area index; metric;
 * type: the plot type filter ('' = every type). Returns {mode: 'national'|'province', items, ids, value, total, count,
 * comparison, zero, spread, home}.
 */
export function summarizeInsight(units = [], {metric = 'plots', province = '', provinces = [], nameOf = c => c, type = ''} = {}) {
  const total = units.reduce((s, u) => s + unitValue(u, metric), 0);
  if (!province) {
    const by = provinceTotals(units, metric);
    const ranked = [...by.values()].filter(p => p.value > 0).map(p => ({...p, id: p.code, name: nameOf(p.code)}))
      .sort((a, b) => b.value - a.value || b.plots - a.plots || COLLATOR.compare(a.name, b.name));
    const top = topWithoutTie(ranked);
    const ids = top.map(p => p.code);
    const value = top.reduce((s, p) => s + p.value, 0);
    // The same provinces among house plots only (plots, every type: a plot-type filter is already a narrower base).
    let comparison = null;
    if (metric === 'plots' && !type && top.length) {
      const set = new Set(ids);
      const houseTotal = units.reduce((s, u) => s + housePlots(u), 0);
      const houseIn = units.filter(u => set.has(u.province)).reduce((s, u) => s + housePlots(u), 0);
      if (houseTotal && houseTotal !== total) comparison = {value: houseIn, total: houseTotal, kind: 'house'};
    }
    const zero = provinces.map(p => p.code).filter(c => !by.has(c));
    return {mode: 'national', items: top, ids, value, total, count: top.reduce((s, p) => s + p.records, 0), comparison, zero,
      spread: !top.length && ranked.length > 0, home: '', ranked};
  }
  const inProvince = units.filter(u => u.province === province);
  const ranked = districtsOf(inProvince, metric).filter(x => x.value > 0);
  const top = topWithoutTie(ranked);
  const provinceTotal = inProvince.reduce((s, u) => s + unitValue(u, metric), 0);
  return {mode: 'province', items: top, ids: top.map(x => x.id), value: top.reduce((s, x) => s + x.value, 0), total: provinceTotal,
    count: top.reduce((s, x) => s + x.records, 0), comparison: null, zero: [], spread: !top.length && ranked.length > 0, home: province, ranked,
    nationalTotal: total};
}
