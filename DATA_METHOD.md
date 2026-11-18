# CityMETER Housing Estate — data method

What the numbers on the page are, where they come from, how they were built and what they are not. Release 0.1.0,
data read 18 November 2026 (`meta.readOn`). Every figure below is a fixture of this snapshot (tests), never a UI
constant: the page computes it from the data.

## 1. Sources

| Source | What it gives | How it reaches the page |
|---|---|---|
| Research master “CityMETER Housing Estate Thailand — Research Master 2026-11-18” (a Google Sheet of the research team; registry `research.TH.housing_estate`, group Land; its address is not published) | The DOL records of the CityMETER production snapshot (`23_NATIONAL_MASTER`, `12_PRODUCTION_SOURCE`), the researched projects (`01_PROJECTS`), publishers (`02_COMPANIES`), brands (`03_BRANDS`), events (`04_RECENT`), house types (`05_TAXONOMY`), legal links (`21_PROJECT_LEGAL_LINKS`), project–record pairs (`24_SOURCE_MATCHES`), reference pins (`27_MAP_REFERENCES`), issuer facts (`28_ISSUER_FACTS`), province coverage (`15_PROVINCE_COVERAGE`) | The owner's .xlsx export of the whole workbook (SHA-256 `meta.exportSha256`), every tab converted to CSV with exact cell values (`scripts/xlsx-to-csv.py`, per-tab SHA-256 in `meta.tabs`), then `scripts/build-data.py` |
| CityMETER production estate layer (`https://landometer.com/v3/citymeter?d=estate`, API `…/citymeter-v3/estate/info/lv0`) | The national and per-province record and raw plot totals the build must equal | Receipts read 18 Nov 2026 (`meta.checks.productionLv0Equal`: URL, SHA-256, time) |
| Department of Lands website (`https://www.dol.go.th/land/<id>/`) | The public page of each record (linked, never copied) | The record's 18-digit website id, as production carries it |
| Developers' websites, notices and listed companies' reports | Project pages and catalogues, labels and starting prices as shown, legal roles, annual-report facts, launch events | Public https links in `data/portfolio.json` |
| OpenStreetMap (ODbL, © OpenStreetMap contributors; OSM base 2026-11-18 06:10 UTC, `meta.osm`) | Approximate estate extents | `scripts/match-extents.py` on the residential areas round the pins (§6) |
| CityMETER · Transit (`montri-th/transit`, release `transit-data-2026-10-31-r1`) | Rail stations, operating and under construction | Joined by id, commit and SHA-256 in `meta.context.rail` |
| CityMETER production boundaries (`data/area-index.json`, `data/provinces.geojson`; district outlines of `montri-th/school data/frames` at build time) | The 77 provinces and 928 districts, names in Thai and English | As the University and School demos carry them |

## 2. Two grains, never added to each other

**Records** — one DOL website allocation record of the CityMETER production snapshot (19,753). A record is a
registration on the DOL website, not a village: one estate can hold several records (phases, zones), and records are
never merged. A record carries the plots it reports, by type, and the production district and province it is counted in
(production's query boundary, not an address). It has no point: production's coordinate is a district centroid and is
never drawn as a project.

**Projects** — one entry of a developer's own catalogue the research team collected (1,538, from 65 publishers and 391
brands). A project carries its name, brand, publisher, house type, the labels and starting price the page showed, the
launch the research team found, and — for 798 — a reference pin. A project carries no plots: it never adds to a
district's or a province's measure.

A project and a record are **paired** only as the research team paired them (`24_SOURCE_MATCHES`): 373 pairs, each
named by how it was found — confirmed by the research team (1), name, developer and address agree (20), name and parcel
agree (6), name and publisher agree (346). The 321 pairs the research team still holds stay out. A pair is shown as a
pair of a record and a project, never as one place or as the project's size.

## 3. The measure

Two measures, switched together on the map, the legend, the labels, the Aha, the ranks and the charts
(`js/model.js#METRICS`):

- **แปลงจัดสรร (plots, default)** — the sum of the plots the records report, `li.supply` (Location Intelligence
  Profile for LDS 0.9.7: an available supply quantity). A record's plots are its own total where its plots by type
  (detached, semi-detached, row house, shophouse, vacant plot, other — `12_PRODUCTION_SOURCE` G–L) add up to it
  (`selected_reported_plot_total`). The 13 records whose total the research team holds (`พักใช้`) and the 58 that
  report no total are not counted in the plots; they are counted as records. Total: 2,689,640 plots (production's raw
  total 2,689,950).
- **รายการ (records)** — the DOL records, LDS `count`. Total: 19,753.

A **plot type** filter narrows the measure to the plots of that type and the records that report it (a record that
reports two types is in both). The **house plots** of the Aha's second bar are detached + semi-detached + row-house
plots (2,335,133).

Never: a count of villages, finished houses, households or residents; a sales status; a market size; a density.

## 4. Areas

Each record is counted in the production district (เขต/อำเภอ) and province production gives it (`23_NATIONAL_MASTER`
M, N): 395 districts and all 77 provinces hold a record. The build checks every province's records and raw plots against
`15_PROVINCE_COVERAGE` and the production lv0 receipt and stops on any difference. A province or district without a
record under the filters is a measured zero of this snapshot (EVID-05), never “no estate”.

On the map the provinces are filled (`js/provinces.js`); with a province chosen, its districts carry the measure as
chips at their label points (no district outlines are drawn), the chip's swatch a 41-sample ramp over the province's
districts.

## 5. Projects and pins

- **Pin** — the reference pin the research team selected from the publisher's own evidence (`27_MAP_REFERENCES`, the
  default layer; roles: the publisher's project pin, a marker on the official page, the developer's official data, the
  marketing material's location, the directions destination). **Coordinates from Google Maps never enter the data:** 58
  default pins whose source is a Google Maps link stay off the map (`meta.counts.pinsOffMap`). 798 projects are drawn.
- **District of a pin** — the production district that holds the point, at build time (district outlines of
  `montri-th/school`); the project's province is that district's, else the province its source names.
- **Labels and launch** — what the source showed when the research team read it (`01_PROJECTS` E, F), never a sales
  status the page asserts; a launch “in the window” lies within 18 Nov 2023 – 18 Nov 2026 by the research team's check.
- **Starting price** — the starting price the page showed (million baht), never compared, averaged or ranked.
- **Legal entities** — roles a notice, a brochure, an EIA record or a company report gives (`21_PROJECT_LEGAL_LINKS`,
  usable rows only, legal-entity names only), shown with the source; never a land register. **Parents** — the
  parent company the research team found with its date. **Issuer facts** — a listed company's annual-report lines
  (`28_ISSUER_FACTS`). **Events** — launches and presales a company reported (`04_RECENT`).

## 6. Extents (OpenStreetMap)

An extent is an OpenStreetMap area tagged `landuse=residential` (or construction, `residential=*`, a named neighbourhood)
whose name is the project's and that holds its pin (or lies within 30 m of it): `scripts/match-extents.py` normalises
the names (Thai digits, generic words such as หมู่บ้าน/โครงการ/village), requires a name score of 0.86 inside (0.96 outside),
never matches names whose numbers differ (another phase or soi) by name alone, keeps areas of 2,000 m² – 3 km², and gives
an area claimed by projects of different names to the best-named one only (two entries of one name may share it).
139 projects have an extent (OSM base `meta.osm.base` of `data/extents.json`). The page shows **“กรอบราว N ไร่”** (m² ÷ 1,600), never a deed, a legal boundary or a land
size; the extents file credits “© OpenStreetMap contributors” under ODbL-1.0.

The drawn buildings whose interior point stands in the open project's extent are lit in the active-layer colour
(`js/extent-buildings.js`), as an open campus lights its buildings in CityMETER · University; they are never counted on
screen (the number drawn depends on the device's map budget).

## 7. Context

Rail: the nearest operating station and the nearest station under construction within 2 km of a pin (straight line,
`meta.context.rail`); a station opens the projects within 1 km. Buildings: OpenStreetMap, or CityMETER Building V4 where
a CityMETER unit of `data/building-units/` holds the ground (the Hotel units, extended round the University campuses;
726 of the 798 pins stand in an evaluated unit).

## 8. Privacy and what is not published

An allocator is named only when its name carries a legal-entity form (8,532 names); the other 2,961 records show no
allocator. Not copied (`meta.excludedFields`): review queues, identity statuses and scope-review results, review groups,
issue flags, registration numbers, the raw JSON of the DOL pages, researcher notes, internal sheet and Drive URLs,
production's district-centroid coordinates, event ids. The research master, its cells, its export and its address, and
the dataset registry's address are never committed (`tests/release.test.js` knows them only by SHA-256). DOL pages are
public; their reuse terms are not stated (`07_PRODUCTION`): the page links them and copies no page content.

## 9. Rebuild

```sh
python3 -I scripts/xlsx-to-csv.py <export.xlsx> <tabs-dir>
python3 -I scripts/match-extents.py <venues.csv> <pairs.txt> --sha <sha256> --out <match.json>   # OSM pairs from the browser
python3 -I scripts/build-data.py --tabs <tabs-dir> --xlsx <export.xlsx> --index data/area-index.json \
  --frames <school>/data/frames --frames-ref "montri-th/school@<commit> data/frames" --transit <transit checkout> \
  --production <receipts-dir> --osm-match <match.json> --osm-geom <geom.txt> --osm-geom-sha <sha256> --out data
npm test
```

The build stops on a changed header, an unknown word, a total that differs from production or the province coverage,
or a plot breakdown that does not add up.
