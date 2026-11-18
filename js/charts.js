/**
 * Comparison charts rendered as plain HTML — no chart vendor.
 *
 * Three views share the committed selection (the district rows of the filters) and the map's measure:
 *  - provinces (URL view key `provinces`): the measure per province, bars in the map's colour (the same 41-sample
 *    rank ramp over the same provinces, js/provinces.js#buildProvinceModel)
 *  - types: the measure per plot type of the DOL records (บ้านเดี่ยว · บ้านแฝด · บ้านแถว · อาคารพาณิชย์ · ที่ดินเปล่า ·
 *    อื่น ๆ), in the measure's colour; under the records measure a bar counts the records reporting the type
 *  - districts: the production districts (เขต/อำเภอ) of the selection ranked by the measure — the province's, or the
 *    country's when no province is chosen
 * Province marks emit {type:'province', id}; type marks {type:'type', id}; district marks {type:'district', id}.
 */
import {buildMetricRamp, classify} from './scales.js';
import {provinceByCode, provinceTotals, typeMixOf, districtsOf, PLOT_TYPES} from './model.js';
import {areaWord} from './areas.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const COLLATOR = new Intl.Collator('th');

function empty(element, message) {
  element.innerHTML = `<div class="chart-empty"><p>${esc(message)}</p></div>`;
}

/** The other figure of a bar: records under the plots measure, plots under the records measure. */
const otherOf = (x, unit) => (unit.id === 'records' ? `${num(x.plots)} แปลง` : `${num(x.records)} รายการ`);

function bars(element, items, {unit, caption, attr, label, sub, fill, selected = '', limit = 30}) {
  const list = items.filter(x => x.value > 0).slice(0, limit);
  if (!list.length) { empty(element, `ไม่มี${unit.subject}ในตัวกรองนี้`); return; }
  const max = Math.max(1, ...list.map(x => x.value));
  element.innerHTML = `<p class="chart-caption">${esc(caption)}</p><ol class="chart-bars">${list.map((x, i) => {
    const pressed = x.id === selected;
    return `<li><button type="button" class="bar-row${pressed ? ' is-selected' : ''}" data-${attr}="${esc(x.id)}" aria-pressed="${pressed}"
      aria-label="อันดับ ${i + 1} ${esc(label(x))}: ${num(x.value)} ${esc(unit.one)} ${esc(sub(x))}">
      <span class="bar-rank data-number" aria-hidden="true">${i + 1}</span>
      <span class="bar-label">${esc(label(x))}<small>${esc(sub(x))}</small></span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill${fill(x) ? '' : ' size-fill'}" style="width:${Math.max(2, Math.round((x.value / max) * 100))}%${fill(x) ? `;background:${fill(x)}` : ''}"></span></span>
      <span class="bar-value" aria-hidden="true"><b class="data-number">${num(x.value)}</b><small>${esc(unit.one)}</small></span>
    </button></li>`;
  }).join('')}</ol>`;
}

/**
 * view: provinces | types | districts. units: the filtered district rows without the province filter (provinces view)
 * and with it (the others). Returns a dispose function.
 */
export function renderInsightChart({elementId, view = 'provinces', units = [], allUnits = units, unit, metric = 'plots', province = '', selectedDistrict = ''} = {}, onSelect = () => {}) {
  const element = document.getElementById(elementId);
  if (!element) return () => {};
  const where = province ? ` · ${provinceByCode(province)?.th || ''}` : '';
  if (view === 'types') {
    const list = typeMixOf(units, PLOT_TYPES, metric).sort((a, b) => b.value - a.value || a.index - b.index);
    bars(element, list, {unit, attr: 'type', caption: `${unit.subject}ต่อประเภทแปลง${where}${metric === 'records' ? ' · รายการที่มีแปลงประเภทนั้น' : ''}`,
      label: t => t.th, sub: t => (metric === 'records' ? `${num(t.plots)} แปลง` : `${num(t.records)} รายการที่มีแปลงประเภทนี้`), fill: () => ''});
  } else if (view === 'districts') {
    const list = districtsOf(units, metric).filter(x => x.value > 0);
    bars(element, list, {unit, attr: 'district', selected: selectedDistrict,
      caption: `${province ? `${areaWord(province)}ที่มี` : 'เขตและอำเภอที่มี'}${unit.subject}มากที่สุด${where} · ${num(list.length)} ${province ? areaWord(province) : 'เขต·อำเภอ'}`,
      label: x => `${areaWord(x.province)}${x.name}`, sub: x => [province ? '' : provinceByCode(x.province)?.th, otherOf(x, unit)].filter(Boolean).join(' · '), fill: () => ''});
  } else {
    const totals = [...provinceTotals(allUnits, metric).values()];
    const ramp = buildMetricRamp(totals.map(p => p.value), {metric, unit: unit.one});
    const list = totals.map(p => ({...p, id: p.code, name: provinceByCode(p.code)?.th || p.code}))
      .sort((a, b) => b.value - a.value || COLLATOR.compare(a.name, b.name));
    bars(element, list, {unit, attr: 'province', selected: province, caption: `${unit.subject}ต่อจังหวัด · ${num(list.length)} จังหวัดที่มีรายการ · สีเดียวกับแผนที่`, label: x => x.name, sub: x => otherOf(x, unit), fill: x => classify(x.value, ramp).fill});
  }
  const handlers = [['province', 'province'], ['type', 'type'], ['district', 'district']];
  for (const [attr, type] of handlers) element.querySelectorAll(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => onSelect({type, id: b.dataset[attr]})));
  return () => { element.innerHTML = ''; };
}
