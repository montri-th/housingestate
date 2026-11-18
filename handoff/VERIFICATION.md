# CityMETER Housing Estate — verification

## Release 0.3.0 — 18 พ.ย. 2569

Owner 2026-11-18 15:28, VERBATIM: “แล้วก็ไม่เห็น จะ spatial join กับขอบเขต campus ของแต่ละหมู่บ้านจัดสรร ซึ่งต้อง highlight อาคาร 3d building mass ทุกอาคารภายในขอบเขตนั้น เหมือนที่ขอให้ทำเหมือนกับ university เลย”; 16:40, the owner's extract: “file OSM ล่าสุดอยู่นี่”.

- Data: `scripts/match-record-extents.py` on the owner's `thailand-latest.osm.pbf` (OSM base 2026-11-12 21:23 UTC, SHA-256 `92cd031a…034c`): 32,214 residential, construction and neighbourhood areas of 2,000 m² – 3 km²; 2,694 records take an extent (2,377 by name, 317 by size) in 1,992 areas → `data/record-extents.json` (1.2 MB). All 139 project extents are in the extract.
- Rules tuned on what the first runs showed: a name that shares only road or district words is refused (ลัดดารมย์ ราชพฤกษ์-รัตนาธิเบศร์ had held เดอะทรัสต์ ราชพฤกษ์-รัตนาธิเบศร์); a script's part alone never holds a name (“JSP City @ แพรกษา” had matched เสนา วิลเลจ สุขุมวิท-แพรกษา); an area named for the record wins within 30 m over the neighbour's unnamed area that holds the point (ศุภาลัย เบลล่า บ้านสวน-เศรษฐกิจ: its point stands 9 m outside its own); unnamed areas only at 80–650 m² per plot (the 5th–90th percentile of the 1,512 areas their name confirms).
- Check: for the 49 pairs where both the record and its paired project have an extent, both are the same OpenStreetMap area. The project of the owner's screenshot (บ้านกลางเมือง CLASSE รัชดา - ลาดพร้าว) stands in no OSM residential area (the nearest, 392,405 m², is 225 m away): it keeps its pin alone.
- Page: an open record draws its extent in the selection stroke and lights the drawn buildings in it; its panel says “กรอบราว N ไร่”; a project without its own extent takes its paired record's (63 projects); OpenStreetMap joins the provenance.
- Local: 175 tests pass. Headless Chrome (no basemap there): a record with its own extent shows OpenStreetMap in its provenance.
- Live: `npm run verify:live` at 9599597 (GitHub Pages): 186 ok, 0 failed (one transient 503 on the first pass). citymeter.pages.dev run 44280522532 (workflow_dispatch): Housing Estate at 9599597, 114 of 114 live checks, the family check 18 of 18 demos on 0.6.3.
- Walk on citymeter.pages.dev (the owner's Chrome, cache tag r8): the record เดอะแพลนท์ ซิตี้ ลาดพร้าว 71 (by name) opens with its extent in the selection stroke and 35 buildings lit (CityMETER Building V4 35, OpenStreetMap 0 in the extent), “กรอบราว 18 ไร่”, OpenStreetMap in the provenance; in English “Extent about 18 rai” and `window.__citymeterI18n.missing` empty; at 393 px (a frame of the same origin) the same, no sideways scroll. The project MODEN บางนา - ศรีนครินทร์ (no extent of its own) takes its paired record's area, named โมเดน บางนา - ศรีนครินทร์ in OpenStreetMap, its pin inside it: “กรอบราว 40 ไร่”, 8 buildings lit — the building layers hold only 8 houses in the 40 rai of an estate opened in 2565.
- Registry: R01_DATASETS row `research.TH.housing_estate`, `demo_check_note` rewritten in place for 0.3.0 (read back, the same 729 characters).

## Release 0.2.0 — 18 พ.ย. 2569

Owner 2026-11-18 15:28 (on citymeter.pages.dev), VERBATIM: “ทำไมไม่มีหมู่บ้านใน production ที่ทำไว้แล้ว มี coordinate น่าจะครบแล้ว”.

- Data: `scripts/fetch-record-points.py` read production's estate layer per district at zoom 11 (395 districts, 2,861 tiles, 713 with points, 2026-11-18 08:48 UTC); `scripts/build-record-points.py` wrote `data/record-points.json`: 19,753 of 19,753 records with a point, each inside its district's box, 10,987 distinct points (7,714 records alone, 12,039 sharing, up to 102 at one point). A second decode (a vector-tile library, independent of the build's reader) gave the same points within 1.1 m.
- Quality (DATA_METHOD.md §2a): for the research team's 228 pairs with both points, production's point lies a median 23 m from the project's pin (184 within 300 m); the research master's `district_centroid_proxy` label is production's schema, not the points.
- Page: every record at its point (`js/record-points.js`, one bullseye per point with its count, names from zoom 14.5); an open record framed on its point with its buildings round it and a paired project's extent lit; the record panel names the other records at its point; the legend's “รายการจัดสรร”; English for every new string.
- Not built yet: a record's own extent (its point × OpenStreetMap residential areas) — OpenStreetMap is out of reach of the build workspace.
- Local: 171 tests pass. Headless Chrome on the local server (no basemap: its hosts are out of reach there): a record of a 17-record point opens with “จุดตาม CityMETER production · จุดเดียวกับอีก 16 รายการ”, 16 records listed, the provenance “จุดบนแผนที่ CityMETER 18 พ.ย. 2569”, the legend item shown once the points are in.
- Live: `npm run verify:live` at fde433b (GitHub Pages): 185 ok, 0 failed. citymeter.pages.dev run 44272767959: 114 of 114 live checks, family check 18 of 18. Walk on citymeter.pages.dev (the owner's Chrome, cache tag r7): the record of a 17-record point in Lat Phrao opens framed on its point in 3D (6,450 CityMETER Building V4 buildings drawn round it), the marks “17 รายการ” (ringed), “32 รายการ”, “2 รายการ” and a named one round it, the panel lists the 16 others; in English `window.__citymeterI18n.missing` empty, the marks read “17 records”; at 393 px (a frame of the same origin, `?lean=phone`) it opens in 3D above the sheet, no sideways scroll.
- The project of the owner's screenshot (บ้านกลางเมือง CLASSE รัชดา - ลาดพร้าว) has no record point within 700 m (the nearest of Lat Phrao's 109 records is 895 m away) and no OpenStreetMap extent yet: its view shows the project's pin alone.

## Release 0.1.4 — 18 พ.ย. 2569

From the English walk of 0.1.3 on citymeter.pages.dev: `window.__citymeterI18n.missing` held the accessible names of every map chip — the 77 province chips at load and the 47 district chips of Bangkok once it was chosen (“เขตวัฒนา · 254 แปลง · 11 รายการ กดเพื่อดูเขตหรืออำเภอ”: the chip's title, then its verb). Every other view of the walk (district, record, project, company, charts, table) added nothing.

- Fix (`js/lang-en.js`): the last part of a chip's label, a measure and its verb, reads “…, select to view the province” or “…, select to view the district”; the parts before it already read in English. A district the area index has no English for (Wiang Kao, Khon Kaen, 4029) keeps its Thai name (`js/lang.js`, keepThai).
- Test (`tests/lang-en.test.js`): every province and district chip of the area index, either measure first, reads with no Thai left but that one name (2,010 labels stayed Thai before the fix).
- Local: 167 tests pass.
- Live: `npm run verify:live` at 8b5b6ca (GitHub Pages): 183 ok, 0 failed. citymeter.pages.dev run 44264665464 (workflow_dispatch): Housing Estate at 8b5b6ca, 114 of 114 live checks, the live family check 18 of 18 demos on 0.6.3.
- English walk on citymeter.pages.dev (cache tag r6, the owner's Chrome): `window.__citymeterI18n.missing` empty at load (77 province chips), with Bangkok and a district chosen, a project, the charts; Khon Kaen in English (5 district chips) empty too.
- Pickers at 393 px (frames of the same origin, `?lean=phone`): from School in Thai and from University in English, Housing Estate is listed under Land (in English without “In Thai”) and opens `/housingestate/` with the area carried (Watthana; Bangkok), no sideways scroll (393 px).
- Registry: R01_DATASETS row `research.TH.housing_estate`, `demo_check_note` rewritten in place for 0.1.4 and the family sync (read back).

## Release 0.1.3 — 18 พ.ย. 2569

The family sync of citymeter-shell 0.6.3 (owner 2026-11-18, VERBATIM: “ทำเลย”): every demo, the hub and the Pages deploy take the bytes this release carries.

- Change: the note at the head of `js/shell/datasets.js` reads the dataset registry R01_DATASETS of 2026-11-18 (every demo in the group it had on 2026-11-12; Commercial District has its row since, `research.TH.commercialdistrict`, Location). No entry changes. `js/shell/manifest.json` names the new hash (`d2555aaf…7f663d`); `tests/shell.test.js` is the test every repository takes with it.
- Local: 166 tests pass.
- Live: GitHub Pages served the same `js/shell/datasets.js` bytes (`d2555aaf…7f663d`, shell 0.6.3) on all 18 demo paths and the hub listed 18 (`demos/demos.json`). citymeter.pages.dev run 44263310538 (workflow_dispatch, deploy @046a7d7, hub @b5132cb): the live family check found every demo on 0.6.3 with 18 entries in its picker, none missing, none extra, no group different; 114 of 114 live checks passed.
- Walk on citymeter.pages.dev (the owner's Chrome, desktop): from Hotel in Thai the picker lists Housing Estate under Land and opens `/housingestate/` with `at=BKK/D/1039` (Watthana, 254 plots, 11 records); from Pharmacy in English it is listed under Land without “In Thai” and opens in English with `lang=en` and the same `at`.

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
