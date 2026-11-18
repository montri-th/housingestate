/**
 * Contextual outbound actions: the next question a reader has at each view, answered outside the demo.
 *
 *  - ถาม Google AI — Google Search with a question written for the view: a project (price, house types, progress,
 *    getting there and what is round it), a developer, a district, a DOL allocation record, a station, a building of an
 *    estate, or the country/province overview (new estates, supply, prices). Google answers at the top of the results
 *    (AI Overview) and its AI Mode tab carries the question on. Never a link straight into AI Mode (`udm=50`): Google
 *    stops one that comes from another site at “Continue with this search?” (Hotel 0.3.3, measured 2026-11-02). Owner
 *    2026-11-02: “ทำให้มันตอบทันเลยได้มั้ย”;
 *  - Street View — only where the view has a point (a project's reference pin, or a station's, which is not an
 *    entrance: the label says “ใกล้”);
 *  - Google Maps — a search by the project's name + district + province.
 *
 * Pure: builds labels and https URLs from public names only (no user data, no internal ids). The Google names on the
 * buttons say where the answers come from (owner 2026-11-01: no caveat lines). An English page (citymeter-shell
 * 0.5.x) asks in English, with the English names the data gives (js/lang.js); the button labels are translated by
 * js/shell/i18n.js like the rest of the page.
 */
import {LANG, englishName, translate} from './shell/i18n.js';

const enc = encodeURIComponent;
export const googleAskURL = q => `https://www.google.com/search?q=${enc(q)}`;
export const mapsSearchURL = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
export const streetViewURL = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon)
  ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}` : '');

const clean = s => String(s ?? '').replace(/\s+/g, ' ').replace(/\s*\((?:ชื่อพื้นที่จาก OSM)\)\s*/g, ' ').trim();
const join = (...parts) => clean(parts.filter(Boolean).join(' '));
/**
 * ctx: {kind: 'site'|'company'|'district'|'record'|'building'|'station'|'overview', site?, company?, record?,
 *       area?: {place, province}, station?, province?, point?: {lat, lon, role}}
 * → [{id, label, href, note}] in display order (only the actions that apply).
 */
export function contextActions(ctx = {}, lang = LANG) {
  if (lang === 'en') return contextActionsEnglish(ctx);
  const out = [];
  const add = (id, label, href, note = '') => { if (href) out.push({id, label, href, note}); };
  if (ctx.kind === 'site' && ctx.site) {
    const name = clean(ctx.site.name), where = join(ctx.area?.place, ctx.area?.province);
    add('ai', 'ถาม Google AI', googleAskURL(`โครงการ${name}${where ? ` (${where})` : ''} ราคาเริ่มต้นเท่าไร มีบ้านแบบไหนบ้าง ขายไปแล้วกี่เปอร์เซ็นต์ เดินทางสะดวกไหม และรอบโครงการมีอะไรบ้าง`));
    add('maps', 'Google Maps', mapsSearchURL(join(name, ctx.area?.place, ctx.area?.province)));
  } else if (ctx.kind === 'company' && ctx.company) {
    add('ai', 'ถาม Google AI', googleAskURL(`${clean(ctx.company.name)} มีโครงการบ้านจัดสรรที่ไหนบ้าง ปีนี้เปิดโครงการใหม่กี่โครงการ ยอดขายเพิ่มขึ้นหรือลดลง และเน้นบ้านระดับราคาไหน`));
  } else if (ctx.kind === 'district' && ctx.area) {
    const where = join(ctx.area.place, ctx.area.province);
    add('ai', 'ถาม Google AI', googleAskURL(`หมู่บ้านจัดสรรใน${where} มีโครงการใหม่อะไรบ้าง ราคาบ้านเดี่ยวและทาวน์โฮมประมาณเท่าไร และทำเลไหนกำลังเติบโต`));
    add('maps', 'Google Maps', mapsSearchURL(`หมู่บ้านจัดสรร ${where}`));
  } else if (ctx.kind === 'record' && ctx.record) {
    const name = clean(ctx.record.name), where = join(ctx.area?.place, ctx.area?.province);
    if (name) {
      add('ai', 'ถาม Google AI', googleAskURL(`โครงการ${name}${where ? ` (${where})` : ''}${ctx.record.allocator ? ` ของ${clean(ctx.record.allocator)}` : ''} เป็นหมู่บ้านแบบไหน ยังเปิดขายอยู่ไหม และราคาเท่าไร`));
      add('maps', 'Google Maps', mapsSearchURL(join(name, ctx.area?.place, ctx.area?.province)));
    } else if (where) add('maps', 'Google Maps', mapsSearchURL(`หมู่บ้านจัดสรร ${where}`));
  } else if (ctx.kind === 'building' && ctx.site) {
    add('ai', 'ถาม Google AI', googleAskURL(`โครงการ${clean(ctx.site.name)} มีบ้านกี่หลัง ผังโครงการเป็นอย่างไร และส่วนกลางมีอะไรบ้าง`));
  } else if (ctx.kind === 'station' && ctx.station) {
    const s = ctx.station, line = (s.lines || []).join(' ');
    add('ai', 'ถาม Google AI', googleAskURL(`หมู่บ้านจัดสรรใกล้สถานี${clean(s.name)}${line ? ` (${clean(line)})` : ''} มีโครงการไหนบ้าง ราคาเริ่มต้นเท่าไร และเดินทางไปสถานีกี่นาที`));
    add('maps', 'Google Maps', mapsSearchURL(`หมู่บ้านจัดสรรใกล้สถานี${clean(s.name)}`));
  } else if (ctx.kind === 'overview') {
    const where = clean(ctx.province) || 'ประเทศไทย';
    add('ai', 'ถาม Google AI', googleAskURL(`ภาพรวมตลาดบ้านจัดสรรใน${where}ล่าสุด โครงการเปิดใหม่เพิ่มขึ้นหรือลดลง ทำเลไหนมีหมู่บ้านใหม่มาก และราคาบ้านเดี่ยวกับทาวน์โฮมเป็นอย่างไร`));
  }
  const p = ctx.point;
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    add('streetview', p.role === 'station' ? 'Street View ใกล้สถานี' : 'Street View', streetViewURL(p.lat, p.lon));
  }
  return out;
}

/** The same actions for an English page: English questions, English names where the data has them. */
function contextActionsEnglish(ctx = {}) {
  // N: a name (the data's English, else as given); T: a word of the dictionary (a line), else as given.
  const out = [], N = s => englishName(clean(s)), T = s => translate(clean(s)) ?? clean(s);
  const add = (id, label, href) => { if (href) out.push({id, label, href, note: ''}); };
  const where = ctx.area ? [N(ctx.area.place), N(ctx.area.province)].filter(Boolean).join(', ') : '';
  const lines = s => (s.lines || []).map(T).join(', ');
  if (ctx.kind === 'site' && ctx.site) {
    const name = N(ctx.site.name);
    add('ai', 'ถาม Google AI', googleAskURL(`${name} housing estate${where ? ` (${where})` : ''}, Thailand: what is the starting price, which house types does it have, how much is sold, how easy is it to get to, and what is round it?`));
    add('maps', 'Google Maps', mapsSearchURL(join(name, N(ctx.area?.place), N(ctx.area?.province))));
  } else if (ctx.kind === 'company' && ctx.company) {
    add('ai', 'ถาม Google AI', googleAskURL(`${N(ctx.company.name)} (Thailand): where are its housing estates, how many new projects did it launch this year, are sales rising or falling, and which price levels does it focus on?`));
  } else if (ctx.kind === 'district' && ctx.area) {
    add('ai', 'ถาม Google AI', googleAskURL(`Housing estates in ${where}, Thailand: which new projects are there, what do detached houses and townhomes cost, and which locations are growing?`));
    add('maps', 'Google Maps', mapsSearchURL(`housing estate ${where}`));
  } else if (ctx.kind === 'record' && ctx.record) {
    const name = N(ctx.record.name);
    if (name) {
      add('ai', 'ถาม Google AI', googleAskURL(`${name} housing estate${where ? ` (${where})` : ''}, Thailand: what kind of estate is it, is it still selling, and what do the houses cost?`));
      add('maps', 'Google Maps', mapsSearchURL(join(name, N(ctx.area?.place), N(ctx.area?.province))));
    } else if (where) add('maps', 'Google Maps', mapsSearchURL(`housing estate ${where}`));
  } else if (ctx.kind === 'building' && ctx.site) {
    add('ai', 'ถาม Google AI', googleAskURL(`${N(ctx.site.name)} housing estate (Thailand): how many houses does it have, what is the site plan, and which facilities are there?`));
  } else if (ctx.kind === 'station' && ctx.station) {
    const s = ctx.station, station = N(s.name), line = lines(s);
    add('ai', 'ถาม Google AI', googleAskURL(`Housing estates near ${station} station${line ? ` (${line})` : ''}, Thailand: which projects are there, what do they start at, and how many minutes to the station?`));
    add('maps', 'Google Maps', mapsSearchURL(`housing estate near ${station} station`));
  } else if (ctx.kind === 'overview') {
    const place = N(ctx.province) || 'Thailand';
    add('ai', 'ถาม Google AI', googleAskURL(`Latest overview of the housing estate market in ${place}: are new launches rising or falling, which locations have the most new estates, and what do detached houses and townhomes cost?`));
  }
  const p = ctx.point;
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) add('streetview', p.role === 'station' ? 'Street View ใกล้สถานี' : 'Street View', streetViewURL(p.lat, p.lon));
  return out;
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** The action bar (icon + short label). '' when nothing applies. */
export function actionBar(ctx) {
  const list = contextActions(ctx);
  if (!list.length) return '';
  return `<div class="ask-bar" role="group" aria-label="ค้นต่อใน Google">${list.map(a => `<a class="ask-link ask-${esc(a.id)}" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer"${a.note ? ` title="${esc(a.note)}"` : ''}><i class="pictogram pic-${a.id === 'ai' ? 'ai' : a.id === 'streetview' ? 'streetview' : 'maps'}" aria-hidden="true"></i><span>${esc(a.label)}</span></a>`).join('')}</div>`;
}
