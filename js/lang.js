/**
 * Housing Estate · page language (citymeter-shell, js/shell/i18n.js). js/app.js imports this module first, so an English
 * page is translated before anything renders. The words are in js/lang-en.js. Names come from the data's own English and
 * are never translated here (demo-platform-review §5.8): provinces and districts from the area index (OpenGISData-
 * Thailand names, DOPA-credited, data/area-index.json metadata.englishNames), stations from their nameEn, plot types,
 * house types, scopes, labels, pin roles, pair levels, legal roles and event classes from the words the data files carry
 * (meta.*.en). The research master carries no English names for projects, brands, Thai-named publishers, allocators or
 * DOL record names: they stay Thai (keepThai), and so do the names a notice or a report gives.
 */
import {LANG, registerDictionary, registerNames, keepThai, startTranslation} from './shell/i18n.js';
import HOUSING_EN from './lang-en.js';

const THAI = /[ก-ฺเ-๎]/;

if (LANG === 'en') {
  registerDictionary(HOUSING_EN);
  startTranslation();
  // The English is a draft until reviewed (demo-platform-review §5.8): the help dialog says so.
  const note = () => {
    const intro = document.querySelector('.usage-dialog .help-intro');
    if (!intro || document.getElementById('draft-english-note')) return;
    const p = document.createElement('p');
    p.id = 'draft-english-note';
    p.className = 'help-intro';
    p.textContent = 'English is a draft translation from the Thai. Project, brand, allocator and DOL record names have no English in the data and stay in Thai, and so do the names a notice or a report gives. The product statement is in Thai.';
    intro.after(p);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', note, {once: true}); else note();
}

/** Thai → English words of a data file's vocabulary ({id: {th, en}} or [{th, en}]). */
function words(dict, labels) {
  for (const w of Array.isArray(dict) ? dict : Object.values(dict || {})) if (w?.th && w?.en && !labels[w.th]) labels[w.th] = w.en;
}

/** Register the English the data carries. index = js/areas.js buildAreaIndex, data = js/model.js decodeDataset. */
export function registerDataNames({index, data}) {
  if (LANG !== 'en') return;
  const meta = data?.meta || {};
  const labels = {};
  for (const t of data?.types || []) {
    if (t.th && t.en) labels[t.th] = t.en;
    if (t.short && t.en && !labels[t.short]) labels[t.short] = t.en;
  }
  for (const t of data?.plotTypes || []) {
    if (t.th && t.en) labels[t.th] = t.en;
    if (t.short && t.en && !labels[t.short]) labels[t.short] = t.en;
  }
  for (const key of ['scopes', 'status', 'pins', 'pairs']) words(meta[key], labels);
  registerDictionary({exact: labels});
  const pairs = [];
  for (const p of index?.provinces || []) if (p.nameEn) pairs.push([p.name, p.nameEn], [`จังหวัด${p.name}`, p.nameEn]);
  const bangkok = (index?.provinces || []).find(p => p.id === 'BKK')?.nameEn;
  if (bangkok) pairs.push(['กรุงเทพฯ', bangkok], ['กรุงเทพ', bangkok]);
  // A district the area index has no English for (Wiang Kao, Khon Kaen, 4029) keeps its Thai name, with and without its
  // word, like every name the data carries no English for (0.1.4).
  const thaiAreas = [];
  for (const a of index?.areas || []) {
    const word = `${a.province === 'BKK' ? 'เขต' : 'อำเภอ'}${a.name}`;
    if (!a.nameEn) { thaiAreas.push(a.name, word); continue; }
    pairs.push([a.name, a.nameEn], [word, a.nameEn]);
  }
  // Stations: the name alone, with “สถานี”, and with their lines as js/panel.js writes them (“อโศก (สุขุมวิท)”).
  const lineEn = l => (THAI.test(l) ? HOUSING_EN.exact[l] || null : l);
  const thaiStations = [];
  for (const s of data?.stations || []) {
    if (!s.nameEn) {
      const th = s.lines?.length ? `${s.name} (${s.lines.join(' · ')})` : '';
      thaiStations.push(s.name, `สถานี${s.name}`, ...(th ? [th, `สถานี${th}`] : []));
      continue;
    }
    pairs.push([s.name, s.nameEn], [`สถานี${s.name}`, `${s.nameEn} station`]);
    const lines = (s.lines || []).map(lineEn);
    if (s.lines?.length && lines.every(Boolean)) {
      const th = `${s.name} (${s.lines.join(' · ')})`, en = `(${lines.join(' · ')})`;
      pairs.push([th, `${s.nameEn} ${en}`], [`สถานี${th}`, `${s.nameEn} station ${en}`]);
    }
  }
  // Projects, brands and Thai-named publishers have no English in the research master: they stay Thai.
  const thaiNames = [];
  for (const u of data?.companies || []) thaiNames.push(u.name, ...u.brands);
  for (const s of data?.sites || []) thaiNames.push(s.name, s.brand);
  registerNames(pairs);
  keepThai([...thaiNames, ...thaiStations, ...thaiAreas].filter(v => v && THAI.test(v)));
}

/** The records file (loaded after the first paint): DOL record names, other names, allocators and DOL places stay Thai. */
export function registerRecordNames(records) {
  if (LANG !== 'en' || !records) return;
  const thai = [];
  for (const r of records.records || []) thai.push(r.name, r.alt, r.external, r.gov, r.allocator, ...(r.dolAddress || []));
  keepThai([...new Set(thai)].filter(v => v && THAI.test(v)));
}

/** The portfolio file: its legal-role and event words in English; the names a notice or a report gives stay as written. */
export function registerPortfolioNames(portfolio) {
  if (LANG !== 'en' || !portfolio) return;
  const labels = {};
  words(portfolio.meta?.legalRoles, labels);
  words(portfolio.meta?.events, labels);
  registerDictionary({exact: labels});
  const thai = [];
  for (const p of Object.values(portfolio.projects || {})) {
    for (const x of p.legal || []) thai.push(x.name);
    for (const x of p.parents || []) thai.push(x.child, x.parent);
    for (const x of p.issuer || []) thai.push(x.name, x.place);
    for (const x of p.events || []) thai.push(x.name);
    thai.push(p.priceText);
  }
  for (const list of Object.values(portfolio.companyEvents || {})) for (const x of list) thai.push(x.name);
  keepThai([...new Set(thai)].filter(v => v && THAI.test(v)));
}
