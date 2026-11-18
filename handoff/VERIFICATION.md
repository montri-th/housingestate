# CityMETER Housing Estate — verification

## Release 0.1.0 — 18 พ.ย. 2569

ผลตรวจของรุ่นแรก แยกสิ่งที่ตรวจในเครื่องสร้าง (build container) ออกจากสิ่งที่ตรวจบนเว็บจริง ผลในเครื่องไม่ใช่หลักฐานแทน live URL

### 1. Data build — every reconciliation passes

- Input: the owner's .xlsx export of the research master (SHA-256 `90ca5bb4…8322`, 18,751,382 bytes), 16 tabs converted with `scripts/xlsx-to-csv.py` (per-tab SHA-256 in `meta.tabs`).
- `scripts/build-data.py` stopped on no check (`data/build-report.json`): plots by type add up to every selected total; every province equals `15_PROVINCE_COVERAGE`; the national records (19,753) and raw plots (2,689,950) equal the production lv0 receipt read 2026-11-18 05:39 UTC (`estate/info/lv0`, SHA-256 `7063ca77…d4b`).
- Outputs: 19,753 records in 395 districts of 77 provinces, 2,689,640 plots (13 held totals out); 1,538 projects from 65 publishers and 391 brands; 798 drawn pins (58 Google Maps pins off the map); 373 pairs shown (321 held out); 246 legal roles, 221 parents, 201 issuer facts, 175 events; 139 extents.
- Extents: 139 projects matched by `scripts/match-extents.py` to OpenStreetMap areas (OSM base 2026-11-18 06:10 UTC; pairs SHA-256 `d9c50e4f…769d7b`, geometry SHA-256 `820a8aad…abc6`, both checked against the browser's before reading).
- Reported, not patched: 72 pins (12 extents) outside the evaluated CityMETER building units (buildings there come from OpenStreetMap; backlog B1).

### 2. Unit tests on the real data — 165 pass, 0 fail

`node --test tests/*.test.js` (Node 22): data, insight (the Aha fixtures, the tie rule, the plot-type filter, 41-sample province fills), views (every panel view, one provenance line, no caveat), pins, labels, extent buildings, regions, scales, massing, building units, building join, camera, terrain, MapLibre guards, MVT, geometry, icons, shell (citymeter-shell 0.6.3 manifest; Housing Estate in Land and in the English list), discovery and group (`CITYMETER · LAND`, noindex), release (one cache tag `20261118-r1`, one product version 0.1.0, schema-valid handoff JSON, publication hygiene incl. the research masters' and the registry's addresses known only by SHA-256).

### 3. LDS and Location Intelligence parity — 124 ok, 0 failed

`node scripts/check-lds-parity.mjs --lds Landometer-Design-System-v0.9.7.md --li Location-Intelligence-Profile-for-LDS-v0.9.7.md`: base file SHA-256 `d3085cbc…96`, profile SHA-256 `5d485604…3c` (the LDS plugin's normative copies), every shipped value equal (count and li.supply LUTs, anchors, scale versions, classes, theme roles, series, cues). `assets/theme.css` and the scale constants are the same as CityMETER · University @f610edb.

### 4. Rendered QA (build container)

Chromium (Playwright) against `python3 -m http.server`; the map library and basemap tiles cannot be reached from the container, so every local render shows the map's partial notice — expected here, not on the live site.

- Views without a page error: overview (Aha, legend), Chiang Mai, Bangkok › Yan Nawa (`?d=estate&at=BKK/D/1012`), a project with an extent and a pair (Baan Klang Muang The Edition Srinakarin–Suan Luang: “กรอบราว 38 ไร่”, the pair “ชื่อและแปลงตรงกัน”, legal entity and parent), a developer in English, a record, a station, the search “บางนา”.
- English harvest (`?lang=en`) of every view — `window.__citymeterI18n.missing` empty.

### 5. Live

Pending at the time of this commit: GitHub Pages, `npm run verify:live`, and a walk of the live site in Chrome (district chips, extents, lit buildings, massing and x-ray need the real basemap). Results are added here after publication.

### 6. Not verified

- Lit buildings, massing, x-ray and the building camera with real basemap tiles (container has none) — live walk.
- A real phone (touch, memory); browsers other than Chromium; screen readers beyond the accessible names the tests check.
