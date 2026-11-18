# CityMETER Housing Estate — verification

## Release 0.1.2 — 18 พ.ย. 2569

From the phone check of 0.1.1 (the owner's Chrome, a 390 × 740 frame of the same origin, `?lean=phone`): Supalai Ville Wongwaen–Lamlukka Khlong 7 opened in 3D at zoom 14 with OSM chosen in its extent (30 OSM buildings in the loaded tiles) but none lit — the fit's pitched shift left the estate's middle about 900 m below the middle of the free map, the point the lean ring is drawn round (`viewCenter`), so its buildings were never shaped. Chiang Mai in English: no district chip at the province fit (zoom 6.68; chips started at 7).

- Fixes: on a phone a project opens with the middle of its extent at the middle of the free map above the sheet (`js/app.js#fitSite`); district chips from zoom 6 (the largest first, never overlapping, only in the chosen province).
- Then (cache tag r4): province chips were laid out before the district chips in the same frame and covered them (Mae Hong Son over Mae Taeng, Chiang Mai over Mueang Chiang Mai at 390 px): the district chips are laid out first, the province chips keep clear of them.
- Local: 166 tests pass.
- Live (GitHub Pages, cache tag r4; the owner's Chrome, real basemap, frames of the same origin):
  - Phone 390 × 740, `?lean=phone`: Supalai Ville Wongwaen–Lamlukka Khlong 7 opens in 3D (pitch 60, zoom 14.46), OSM chosen in its extent (122 OSM, 0 V4), 130 buildings lit; Bangkok in Thai — 5 chips, none over another; Chiang Mai in English — 8 chips (6 districts and 2 neighbouring provinces), none over another; no horizontal scroll.
  - Desktop in English: Baan Klang Muang The Edition — 92 buildings lit, the legend “Buildings in the project extent”, `__citymeterI18n.missing` empty; project names stay Thai as the data carries them.
  - `npm run verify:live` at 1f9e6cb (the record of these checks): 183 ok, 0 failed. This line was added after that run; the manifest is generated again for the commit that carries it.

## Release 0.1.1 — 18 พ.ย. 2569

From the first live walk of 0.1.0 (GitHub Pages at 8db4150, the owner's Chrome, real basemap): an estate opened in a CityMETER unit lit next to nothing. Baan Klang Muang The Edition Srinakarin–Suan Luang (Prawet, “กรอบราว 38 ไร่”): 4,228 CityMETER Building V4 pieces in the focus, 0 of them in the extent; the houses inside it were OpenStreetMap buildings the unit had replaced (the basemap's flat footprints showed through). A sample of 20 of the 139 extents (every seventh): 10 lit no building, 2 one, 5 two to five, one 8, the best 43 and 62.

- Fix (`js/massing.js#countOwn`, `DATA_METHOD.md` §6): the open project's extent is a building unit of its own — CityMETER Building V4 when its buildings standing there number at least 1.15 × the OSM buildings a unit would replace there (the units' rule), else OSM: those OSM buildings stay and the V4 buildings in the extent are left out. Outside the extent the units decide as before. `tests/building-units.test.js` (counts, the decision both ways, a hole in the extent, ids unchanged).
- Local: 166 tests pass.
- Live (GitHub Pages at 843e961, cache tag r2): `npm run verify:live` 183 ok, 0 failed. Baan Klang Muang The Edition: OSM chosen in the extent (92 OSM buildings, 0 V4), 92 buildings lit. The same 20 extents again: Supalai Ville Wongwaen–Lamlukka Khlong 7 (Pathum Thani) 0 → 130 lit (OSM 122, V4 0); Supalai Bella Rama 2 (Samut Sakhon) keeps 62 (OSM 62 = V4 62 → OSM); the 9 extents that still light nothing hold no building in either source — walked: Baan Klang Muang Vibhavadi–Chaengwattana and Golden Neo Ngamwongwan–Prachachuen show their estate roads only (projects being built).

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

- GitHub Pages enabled from `main` / root (the owner's Chrome; the session's GitHub API path for repository settings is closed); deployment of 8db4150 served at https://montri-th.github.io/housingestate/.
- `npm run verify:live`: 183 ok, 0 failed (every published file equal to the manifest of 8db4150).
- Live walk (the owner's Chrome, real basemap, dark): the overview (46% in Bangkok, Pathum Thani, Chon Buri; the house-plot bar 47%; province chips with plots), Bangkok (district chips with their 41-sample swatches; 24% in Bang Khun Thian, Prawet, Sai Mai), a project in 3D with its extent outlined — and the lit-building gap fixed in 0.1.1.

### 6. Not verified

- Lit buildings, massing, x-ray and the building camera with real basemap tiles (container has none) — live walk.
- A real phone (touch, memory); browsers other than Chromium; screen readers beyond the accessible names the tests check.
