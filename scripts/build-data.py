#!/usr/bin/env python3
"""Build data/estates.json, data/records.json and data/portfolio.json from the housing estate research master.

Inputs (internal, never committed):
  --tabs     a directory of the research master's tabs, one CSV per tab with exact cell values, converted from the
             owner's .xlsx export of “CityMETER Housing Estate Thailand — Research Master 2026-11-18” (a Google Sheet of
             the research team, registry id research.TH.housing_estate; its address is not published). The export's
             SHA-256 and every tab's SHA-256 are recorded in meta.tabs (scripts/xlsx-to-csv.py writes manifest.json).
  --xlsx     the export itself (its SHA-256 and size go into meta).
Public inputs:
  --index    data/area-index.json (provinces and districts of CityMETER production; ids are production codes)
  --frames   district outlines (data/frames of montri-th/school; display geometry) — a project pin's เขต/อำเภอ by point
  --transit  a checkout of montri-th/transit (data/transit.json: rail stations of CityMETER · Transit)
  --production  optional: the receipts of the production estate API (scripts/fetch-production.py) — per-province
             record and plot counts the build must equal
  --osm-match, --osm-geom, --osm-geom-sha
             optional: the extents of scripts/match-extents.py (match.json) and the OpenStreetMap outlines the browser
             exported for them (osm_fetch.js geom text, its SHA-256 checked) → data/extents.json

Outputs: data/estates.json (first paint: the measure per province and district, the researched projects with their
reference pins, publishers, brands, stations), data/extents.json (the OpenStreetMap areas matched to project pins,
approximate extents for the map, never a boundary), data/records.json (after the first paint: the 19,753 DOL website
records of 23_NATIONAL_MASTER, one per record), data/portfolio.json (when a project or a publisher opens: sources,
roles, events and the record pairs the research team found), data/build-report.json (counts and checks).

TWO GRAINS, NEVER ADDED TO EACH OTHER (26_HANDOFF_QA; DATA_METHOD.md §2)
  record  = one DOL website record of the production snapshot (23_NATIONAL_MASTER, 19,753 rows): the plots the record
            reports (selected_reported_plot_total, by type from 12_PRODUCTION_SOURCE), the province and district of the
            production boundary it is counted in. A record is a registration on the DOL website, not a village: two
            phases are two records, and records are never merged. The research master labels the role of production's
            coordinate a district centroid proxy (source_geometry_role, checked here, never copied); the point of each
            record comes from production itself (scripts/build-record-points.py, data/record-points.json, 0.2.0).
  project = one portfolio entry the research team collected from a publisher's catalogue (01_PROJECTS, 1,538 rows):
            name, brand, publisher, house type, the labels the source shows, and — for 856 entries — a reference pin
            the research team selected (27_MAP_REFERENCES, “แสดงในชั้นหมุดอ้างอิงเริ่มต้น” TRUE). A project never adds
            to a province's records or plots.
A project and a record are paired only as the research team paired them (24_SOURCE_MATCHES, the levels that are not
held), and a pair is shown as a pair the research team found, never as one place.

Never: a count of villages (physical_village_count is null), a sales status made from a missing source, a price level,
an average or a comparison of prices, a legal owner, a launch date from a permit, a news or an inspection date, a
coordinate from Google Maps (a pin whose source is a Google Maps link stays off the map), the name of a natural person
(an allocator is shown only when its name carries a legal-entity form). Not copied (meta.excludedFields): review
queues, identity statuses, review groups, issue flags, registration numbers, raw JSON of the DOL pages, researcher
notes, internal sheet / Drive URLs.
"""
import argparse, collections, csv, datetime, hashlib, json, math, os, re, sys, unicodedata

csv.field_size_limit(10 ** 9)
SHEET_TITLE = 'CityMETER Housing Estate Thailand — Research Master 2026-11-18'
REGISTRY_ID = 'research.TH.housing_estate'
REGISTRY_GROUP = 'Land'
WINDOW = ('2023-11-18', '2026-11-18')
RAIL_MAX_M = 2000
TABS = ['00_REVIEW', '01_PROJECTS', '02_COMPANIES', '03_BRANDS', '04_RECENT', '05_TAXONOMY', '07_PRODUCTION',
        '12_PRODUCTION_SOURCE', '15_PROVINCE_COVERAGE', '21_PROJECT_LEGAL_LINKS', '23_NATIONAL_MASTER',
        '24_SOURCE_MATCHES', '26_HANDOFF_QA', '27_MAP_REFERENCES', '28_ISSUER_FACTS', '31_COUNT_ISSUES']

# Plot types of the DOL record (12_PRODUCTION_SOURCE G–L), the order of every `types` array of the data files.
PLOT_TYPES = [
    ('detached', 'บ้านเดี่ยว', 'Detached house', 'แปลงบ้านเดี่ยว'),
    ('twin', 'บ้านแฝด', 'Semi-detached house', 'แปลงบ้านแฝด'),
    ('row', 'บ้านแถว / ทาวน์โฮม', 'Row house / townhome', 'แปลงบ้านแถว'),
    ('commercial', 'อาคารพาณิชย์', 'Shophouse', 'แปลงพาณิชย์'),
    ('land', 'ที่ดินเปล่า', 'Vacant plot', 'แปลงที่ดินเปล่า'),
    ('other', 'อื่น ๆ', 'Other', 'แปลงอื่น'),
]
HOUSE_PLOTS = ('detached', 'twin', 'row')

# House type of a portfolio entry (01_PROJECTS D; names of 05_TAXONOMY).
HOUSE_TYPES = [
    ('detached', 'บ้านเดี่ยว', 'Detached house'),
    ('semi_detached', 'บ้านแฝด', 'Semi-detached house'),
    ('townhouse', 'ทาวน์เฮ้าส์ / ทาวน์โฮม', 'Townhouse / townhome'),
    ('mixed_low_rise', 'หลายประเภทในโครงการเดียว', 'Several types in one project'),
    ('low_rise_unspecified', 'แนวราบที่ยังไม่แยกชนิด', 'Low-rise, type not yet separated'),
    ('shophouse', 'อาคารพาณิชย์', 'Shophouse'),
    ('home_office', 'โฮมออฟฟิศ', 'Home office'),
]
# What a record reports (23_NATIONAL_MASTER D, the research team's scope check).
SCOPES = [
    ('housing', 'มีประเภทบ้านแนวราบ', 'แปลงบ้านอย่างเดียว', 'House plots only'),
    ('mixed', 'มีบ้านผสมประเภทอื่น', 'แปลงบ้านและแปลงประเภทอื่น', 'House plots and other plots'),
    ('other', 'มีเฉพาะประเภทอื่น—รอตรวจ', 'ไม่มีแปลงบ้าน', 'No house plots'),
    ('none', 'ไม่รายงานจำนวนบวก—รอตรวจ', 'ไม่รายงานจำนวนแปลง', 'No plot count reported'),
]
NAME_STATES = {'ชื่อต้นทาง': 0, 'ไม่ปรากฏชื่อ': 1, 'ชื่อจากแหล่งขัดกัน': 2, 'ชื่อเสริมจากรายงานรัฐ': 3}

# Labels a source shows for a portfolio entry (01_PROJECTS E), in words. A label is what the page showed on the day it
# was read, never a sales status the demo asserts (26_HANDOFF_QA: “ห้ามสร้าง open/closed status จาก source absence”).
STATUS_WORDS = {
    'catalog_listed_status_unverified': 'listed', 'official_catalog_listed_status_unverified': 'listed',
    'listed_by_publisher': 'listed', 'listed_in_official_portfolio': 'listed', 'source_catalogue_listed': 'listed',
    'current_project_menu': 'listed', 'official_source_project_observation_current_inventory_unknown': 'listed',
    'ready_to_move_in': 'ready', 'ready-to-move': 'ready', 'ready_to_move': 'ready', 'โครงการพร้อมอยู่': 'ready',
    'new_project': 'new', 'new-project': 'new', 'โครงการใหม่': 'new', 'new_project_label_undated': 'new',
    'sold_out': 'soldout', 'Sold Out': 'soldout', 'sold_out_historical': 'soldout', 'sold_out_source_component': 'soldout',
    'sold_out_reported_2025_06': 'soldout',
    'historical_portfolio': 'past', 'historical_portfolio_section': 'past', 'historical_company_journey': 'past',
    'completed_handed_over': 'handed', 'open_for_sale': 'selling', 'open_for_sale_publisher': 'selling',
    'now_selling_official_label': 'selling', 'final_units': 'last', 'last-chance': 'last', 'coming_soon': 'soon',
    'coming_soon_official_detail': 'soon', 'closed_project': 'closed', 'residential_component_review': 'component',
    'planned_or_developing_review': 'planned', 'dated_launch_report': 'reported', 'named_in_official_news_2025_07_11': 'news',
    'eia_approve': 'eia',
}
STATUS_LABELS = {
    'listed': ('อยู่ในบัญชีโครงการของผู้เผยแพร่', 'In the publisher’s project list'),
    'ready': ('พร้อมอยู่', 'Ready to move in'), 'new': ('โครงการใหม่', 'New project'), 'soldout': ('ขายหมด', 'Sold out'),
    'past': ('ผลงานในอดีต', 'Past work'), 'handed': ('ส่งมอบแล้ว', 'Handed over'), 'selling': ('เปิดขาย', 'On sale'),
    'last': ('ยูนิตสุดท้าย', 'Last units'), 'soon': ('เร็ว ๆ นี้', 'Coming soon'), 'closed': ('ปิดโครงการ', 'Closed'),
    'component': ('ส่วนที่พักอาศัยของโครงการผสม', 'Residential part of a mixed project'),
    'planned': ('วางแผนหรือกำลังพัฒนา', 'Planned or being developed'), 'reported': ('มีรายงานวันเปิดตัว', 'Launch date reported'),
    'news': ('มีชื่อในข่าวของบริษัท', 'Named in company news'), 'eia': ('ผ่านการพิจารณา EIA', 'EIA approved'),
}
# Pin roles (27_MAP_REFERENCES D): what the point is, as the source gives it.
PIN_ROLES = {
    'publisher_project_reference_pin': 'publisher', 'official_project_marker_bound_to_native_card_ID': 'official',
    'official_project_marker_explicit_in_rendering_code': 'official', 'official_named_project_API_coordinate': 'api',
    'official_project_marketing_point': 'marketing', 'project_directions_destination_not_verified_entrance_or_boundary': 'destination',
    'project_destination_not_entrance_or_boundary': 'destination', 'provider_project_destination_via_official_project_link': 'google',
    'labelled_Google_project_place_via_official_embedded_map': 'google', 'official_project_named_Google_destination_marker': 'google',
}
PIN_LABELS = {
    'publisher': ('หมุดโครงการที่ผู้เผยแพร่ให้ไว้', 'Project pin the publisher gives'),
    'official': ('หมุดโครงการบนหน้าเว็บทางการ', 'Project marker on the official page'),
    'api': ('พิกัดโครงการจากข้อมูลทางการของผู้พัฒนา', 'Project coordinate in the developer’s official data'),
    'marketing': ('จุดที่ตั้งโครงการในสื่อการตลาด', 'Project location in marketing material'),
    'destination': ('ปลายทางนำทางของโครงการ', 'Project directions destination'),
}
# Pairs of a project and a DOL record (24_SOURCE_MATCHES E) shown; every held level stays in the sheet.
PAIR_LEVELS = {
    'accepted_specific_allocation_project_association': 'accepted',
    'supported_name_publisher_actual_address_association': 'address',
    'supported_name_company_actual_address_association': 'address',
    'supported_parcel_name_permission_unresolved': 'parcel',
    'corroborated_name_publisher_candidate': 'name',
}
PAIR_LABELS = {
    'accepted': ('ทีมวิจัยยืนยันคู่นี้', 'Pair confirmed by the research team'),
    'address': ('ชื่อ ผู้พัฒนา และที่อยู่ตรงกัน', 'Name, developer and address agree'),
    'parcel': ('ชื่อและแปลงตรงกัน', 'Name and parcel agree'),
    'name': ('ชื่อและผู้เผยแพร่ตรงกัน', 'Name and publisher agree'),
}
# Roles a project's legal notice gives a company (21_PROJECT_LEGAL_LINKS G), only the rows usable as a role (Q TRUE).
LEGAL_ROLES = {
    'land_owner_and_project_operator_claimed_by_official_project_notice': ('เจ้าของที่ดินและผู้ดำเนินโครงการ ตามประกาศของโครงการ', 'Land owner and operator, per the project notice'),
    'project_and_land_owner_claimed_in_dated_official_advertising_notice': ('เจ้าของโครงการและที่ดิน ตามประกาศโฆษณา', 'Project and land owner, per the advertising notice'),
    'project_and_land_owner_claimed_in_official_project_notice': ('เจ้าของโครงการและที่ดิน ตามประกาศของโครงการ', 'Project and land owner, per the project notice'),
    'project_owner_named_in_official_project_information': ('เจ้าของโครงการ ตามข้อมูลโครงการ', 'Project owner, per the project information'),
    'land_title_holder': ('ผู้ถือกรรมสิทธิ์ที่ดิน ตามรายงานของบริษัท', 'Land title holder, per the company report'),
    'project_owner': ('เจ้าของโครงการ ตามแหล่ง', 'Project owner, per the source'),
    'land_owner_claimed_in_official_specific_project_notice': ('เจ้าของที่ดิน ตามประกาศของโครงการ', 'Land owner, per the project notice'),
    'issuer_disclosed_named_project_land_ownership_asof2025_12_31': ('ผู้ถือกรรมสิทธิ์ที่ดิน ตามรายงานของบริษัท', 'Land owner, per the company report'),
    'official_project_website_publisher': ('ผู้เผยแพร่เว็บไซต์โครงการ', 'Publisher of the project website'),
    'owner_and_operator_as_asserted_by_official_brochure': ('เจ้าของและผู้ดำเนินการ ตามโบรชัวร์', 'Owner and operator, per the brochure'),
    'named_project_owner_in_government_EIA_IEE_report_record': ('เจ้าของโครงการ ตามรายงาน EIA/IEE', 'Project owner, per the EIA/IEE record'),
    'named_project_development_company_in_official_issuer_business_description': ('บริษัทผู้พัฒนาโครงการ ตามคำอธิบายธุรกิจของบริษัท', 'Developing company, per the issuer’s business description'),
    'named_project_co_developer_in_official_issuer_JV_announcement': ('ผู้ร่วมพัฒนา ตามประกาศร่วมทุน', 'Co-developer, per the JV announcement'),
    'issuer_asserted_project_owner': ('เจ้าของโครงการ ตามบริษัท', 'Project owner, per the company'),
}
# Event classes (04_RECENT M) in words; an event is an observation of a source, never a new village.
EVENT_WORDS = {
    'issuer_reported_year_of_sales_launch': ('ปีเริ่มขายตามรายงานประจำปีของบริษัท', 'Year of sales launch in the company’s annual report'),
    'issuer_reported_project_launch': ('เปิดตัวโครงการตามรายงานของบริษัท', 'Project launch reported by the company'),
    'issuer_reported_estate_project_launch': ('เปิดตัวโครงการตามรายงานของบริษัท', 'Project launch reported by the company'),
    'new_project_presale_reported_by_issuer': ('พรีเซลโครงการใหม่ตามบริษัท', 'New project presale reported by the company'),
    'phase_or_project_extension_review': ('เฟสหรือส่วนต่อขยายของโครงการ', 'Phase or extension of a project'),
    'commercial_or_homeoffice_scope_review': ('ส่วนอาคารพาณิชย์หรือโฮมออฟฟิศ', 'Shophouse or home office part'),
    'model_home_opening': ('เปิดบ้านตัวอย่าง', 'Show house opening'),
    'project_preview_date_unspecified': ('พรีวิวโครงการ', 'Project preview'),
    'presale_reported_by_developer': ('พรีเซลตามผู้พัฒนา', 'Presale reported by the developer'),
    'estate_project_launch_month_and_first_viewing': ('เปิดตัวและเปิดชมโครงการ', 'Launch and first viewing'),
    'new_phase_existing_estate': ('เฟสใหม่ของโครงการเดิม', 'New phase of an existing estate'),
    'estate_project_presale': ('พรีเซลโครงการ', 'Project presale'),
    'new_house_series_presale_future': ('พรีเซลแบบบ้านใหม่ (กำหนดการ)', 'New house series presale (scheduled)'),
    'new_zone_existing_estate': ('โซนใหม่ของโครงการเดิม', 'New zone of an existing estate'),
    'sellout_report': ('รายงานขายหมด', 'Sold-out report'),
    'official_first_project_announcement_with_exclusive_preview_schedule': ('ประกาศโครงการแรกพร้อมกำหนดพรีวิว', 'First project announced with a preview schedule'),
}
WINDOW_WORDS = {
    'ในช่วงที่ระบุ': 'in', 'ในช่วงตามหลักฐาน': 'in', 'ปีทับช่วง — ต้องตรวจวัน': 'edge', 'นอกช่วง 3 ปี — บริบทประวัติ': 'out',
    'มีข่าวในช่วง — วันเหตุการณ์ไม่ทราบ': 'newsonly', 'กำหนดอยู่ในช่วง — ยังไม่ยืนยันว่าเกิดขึ้น': 'scheduled', 'อนาคต — ไม่ใช่เปิดแล้ว': 'future',
    'ในช่วง3ปีตามหลักฐาน': 'in', 'ปีทับเส้น—ยังไม่ทราบวัน': 'edge', 'อยู่นอกช่วง3ปี': 'out', 'ยังไม่ทราบ': '',
}
COVERAGE_WORDS = {'partial_web_inventory': 'partial', 'source_representation_complete': 'complete'}
JURISTIC = re.compile(r'(บมจ|บจก|หจก|หสน|บริษัท|ห้างหุ้นส่วน|จำกัด|มหาชน|สหกรณ์|มูลนิธิ|การเคหะแห่งชาติ|กองทุน|ธนาคาร|'
                      r'\bCo\.|\bLtd\b|\bPCL\b|Limited)', re.I)
GOOGLE = re.compile(r'(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.page)$')
EXCLUDED = ['04 notes and review fields beyond the event, its period and source', '06_COVERAGE', '08_DICTIONARY',
            '09_DOL_SOURCE', '10_EXPANSION', '11_COMPANY_LINKS', '13_SOURCE_DEVELOPERS', '14_IDENTITY_REVIEW',
            '16_PRODUCTION_LINKS', '17_DOL_DETAILS (raw JSON of the DOL pages)', '18_POSITIONS beyond the selected pin',
            '19_NAME_RECOVERY', '20_LEGAL_ENTITIES', '22_EXTERNAL_REVIEW', '24 held pairs and the reasons of every pair',
            '25_REVIEW_GROUPS', '29_EXTERNAL_INSPECTIONS', '30_ALLOCATOR_CONTEXT', 'identity statuses, review groups, issue flags',
            'registration numbers of companies', 'names of natural persons (allocators without a legal-entity form)',
            'researcher notes, source limitations, raw source locators', 'internal sheet / Drive URLs',
            'production’s district-centroid coordinates']


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_tabs(d):
    manifest = json.load(open(os.path.join(d, 'manifest.json'), encoding='utf-8'))
    shas = {s['title']: s for s in manifest['sheets']}
    out, meta = {}, {}
    for t in TABS:
        path = os.path.join(d, t + '.csv')
        if sha256_file(path) != shas[t]['csv_sha256']:
            sys.exit(f'{t}: CSV does not match the export manifest')
        rows = list(csv.reader(open(path, encoding='utf-8')))
        head = [h.strip() for h in rows[0]]
        width = len(head)
        body = [(r + [''] * width)[:width] for r in rows[1:]]
        out[t] = (head, body)
        meta[t] = {'rows': len(body), 'columns': width, 'sha256': shas[t]['csv_sha256']}
    return out, meta, manifest


def col_index(letters):
    i = 0
    for ch in letters:
        i = i * 26 + ord(ch) - 64
    return i - 1


def clean(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(s or '')).replace('​', '').replace('\xa0', ' ')).strip()


def whole(v):
    v = str(v or '').replace(',', '').strip()
    if not v:
        return None
    if not re.fullmatch(r'-?\d+(\.0+)?', v):
        return None
    return int(float(v))


def num(v):
    v = str(v or '').replace(',', '').strip()
    return float(v) if re.fullmatch(r'-?\d+(\.\d+)?', v) else None


def jlist(v):
    v = (v or '').strip()
    if not v:
        return []
    x = json.loads(v)
    return x if isinstance(x, list) else []


def haversine(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def ring_contains(ring, x, y):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polys_of(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'] if g['type'] == 'MultiPolygon' else []


def in_polys(polys, x, y):
    return any(ring_contains(p[0], x, y) and not any(ring_contains(h, x, y) for h in p[1:]) for p in polys)


class Districts:
    """เขต/อำเภอ outlines of the area index's frames (display geometry): the district a point falls in."""
    def __init__(self, frames_dir, provinces):
        self.items = []
        for code in provinces:
            frame = json.load(open(os.path.join(frames_dir, f'{code}.json'), encoding='utf-8'))
            for f in frame['areas']['features']:
                polys = polys_of(f['geometry'])
                xs = [p[0] for poly in polys for p in poly[0]]
                ys = [p[1] for poly in polys for p in poly[0]]
                self.items.append((str(f['id']), code, polys, min(xs), min(ys), max(xs), max(ys)))

    def find(self, lon, lat, near_m=3000):
        for did, code, polys, w, s, e, n in self.items:
            if w <= lon <= e and s <= lat <= n and in_polys(polys, lon, lat):
                return code, did, 'inside'
        kx, ky = 111320 * math.cos(math.radians(lat)), 110540
        best, bd = None, near_m
        pad = near_m / ky + 0.01
        for did, code, polys, w, s, e, n in self.items:
            if not (w - pad <= lon <= e + pad and s - pad <= lat <= n + pad):
                continue
            for poly in polys:
                for ring in poly:
                    for i in range(len(ring) - 1):
                        ax, ay = (ring[i][0] - lon) * kx, (ring[i][1] - lat) * ky
                        bx, by = (ring[i + 1][0] - lon) * kx, (ring[i + 1][1] - lat) * ky
                        dx, dy = bx - ax, by - ay
                        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) if dx or dy else 0.0
                        d = math.hypot(ax + t * dx, ay + t * dy)
                        if d < bd:
                            best, bd = (code, did), d
        return (best[0], best[1], f'nearest {round(bd)} m') if best else (None, None, '')


def public_url(u):
    u = (u or '').strip().split('\n')[0].strip()
    if not u.startswith('https://') and not u.startswith('http://'):
        return ''
    if re.search(r'docs\.google\.com|drive\.google\.com|localhost|\.local/|/Users/|file:', u):
        return ''
    return u


def host(u):
    m = re.match(r'https?://([^/:?#]+)', u or '')
    return m[1].lower() if m else ''


def repo_commit(path):
    head = open(os.path.join(path, '.git', 'HEAD')).read().strip()
    if head.startswith('ref:'):
        ref = head.split(' ', 1)[1]
        p = os.path.join(path, '.git', ref)
        if os.path.exists(p):
            return open(p).read().strip()
        for line in open(os.path.join(path, '.git', 'packed-refs')):
            if line.strip().endswith(ref):
                return line.split()[0]
    return head


def period_of(v):
    """A launch or event period as written by the research (2023 · 2026-05 · 2025-Q2), else ''."""
    v = clean(v)
    return v if re.fullmatch(r'\d{4}(-(\d{2}|Q[1-4]))?', v) else ''


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--tabs', required=True)
    ap.add_argument('--xlsx', required=True)
    ap.add_argument('--index', default='data/area-index.json')
    ap.add_argument('--frames', required=True)
    ap.add_argument('--frames-ref', default='montri-th/school data/frames')
    ap.add_argument('--transit', required=True)
    ap.add_argument('--production', default='')
    ap.add_argument('--osm-match', default='')
    ap.add_argument('--osm-geom', default='')
    ap.add_argument('--osm-geom-sha', default='')
    ap.add_argument('--read-on', default='2026-11-18')
    ap.add_argument('--out', default='data')
    a = ap.parse_args()

    tabs, tab_meta, manifest = read_tabs(a.tabs)
    report = {'counts': {}, 'checks': {}, 'notes': []}
    checks = report['checks']

    # ---------- production gazetteer ----------
    index = json.load(open(a.index, encoding='utf-8'))
    provinces = [p['id'] for p in index['provinces']]
    prov_by_name = {p['name']: p['id'] for p in index['provinces']}
    prov_i = {c: i for i, c in enumerate(provinces)}
    A = index['areas']
    district_of = {}
    for i, did in enumerate(A['id']):
        district_of[(A['province'][i], A['name'][i])] = did

    # ---------- plot types per record (12) ----------
    h12, r12 = tabs['12_PRODUCTION_SOURCE']
    c12 = {h: i for i, h in enumerate(h12)}
    type_cols = [c12['แปลงบ้านเดี่ยว'], c12['แปลงบ้านแฝด'], c12['แปลงบ้านแถว'], c12['แปลงพาณิชย์'], c12['แปลงที่ดินเปล่า'], c12['แปลงอื่น']]
    raw_types = {}
    for r in r12:
        vals = [whole(r[i]) for i in type_cols]
        raw_types[r[c12['DOL_ID (ข้อความ)']]] = vals if all(v is not None and v >= 0 for v in vals) else None

    # ---------- records (23) ----------
    h23, r23 = tabs['23_NATIONAL_MASTER']
    if len(r23) != 19753:
        sys.exit(f'23_NATIONAL_MASTER: {len(r23)} rows, 19,753 expected')
    C = {k: col_index(k) for k in ['A', 'B', 'D', 'E', 'I', 'J', 'K', 'L', 'M', 'N', 'V', 'W', 'X', 'AA', 'AC', 'AH', 'AI', 'AJ', 'AK', 'AL']}
    expect = {'A': 'ชื่อโครงการที่แสดง', 'I': 'DOL_website_record_ID_TEXT', 'M': 'จังหวัดขอบเขตproduction', 'N': 'อำเภอขอบเขตproduction',
              'AL': 'แปลงรวมต้นทางที่ผ่านตรวจผลรวมและค่าบวก', 'AK': 'บทบาทพิกัดproduction'}
    for k, v in expect.items():
        if h23[C[k]] != v:
            sys.exit(f'23_NATIONAL_MASTER {k}: header {h23[C[k]]!r}, {v!r} expected')
    scope_code = {s[1]: i for i, s in enumerate(SCOPES)}
    allocators, alloc_i = [], {}
    dol_names, dol_name_i = [], {}

    def intern_dol(v):
        v = clean(v)
        if not v:
            return -1
        if v not in dol_name_i:
            dol_name_i[v] = len(dol_names)
            dol_names.append(v)
        return dol_name_i[v]

    records = []
    unmatched_districts = collections.Counter()
    for r in r23:
        rid = r[C['I']].strip()
        if not re.fullmatch(r'\d{18}', rid):
            sys.exit(f'record id {rid!r} is not 18 digits')
        if r[C['AC']] != f'https://www.dol.go.th/land/{rid}/':
            sys.exit(f'{rid}: DOL URL is not https://www.dol.go.th/land/<id>/')
        if r[C['AK']] != 'district_centroid_proxy_per_source_schema':
            sys.exit(f'{rid}: production geometry role changed')
        state = NAME_STATES.get(r[C['B']])
        if state is None:
            sys.exit(f'{rid}: name state {r[C["B"]]!r}')
        name = '' if state == 1 else clean(r[C['A']])
        if state == 1 and not r[C['A']].startswith('ไม่ปรากฏชื่อ'):
            sys.exit(f'{rid}: a nameless record shows {r[C["A"]]!r}')
        alt = clean(r[C['AJ']]) if state == 2 and clean(r[C['AJ']]) != name else ''
        ext = clean(r[C['AI']])
        prov = prov_by_name.get(r[C['M']])
        if not prov:
            sys.exit(f'{rid}: production province {r[C["M"]]!r}')
        did = district_of.get((prov, r[C['N']]))
        if not did:
            unmatched_districts[(prov, r[C['N']])] += 1
        alloc = clean(r[C['E']])
        if alloc and JURISTIC.search(alloc):
            if alloc not in alloc_i:
                alloc_i[alloc] = len(allocators)
                allocators.append(alloc)
            al = alloc_i[alloc]
        else:
            al = -1
        plots = whole(r[C['AL']])
        held = 'พักใช้' in r[C['X']]
        types = raw_types.get(rid)
        if held or plots is None:
            types = None if held else types
        if types is not None and plots is not None and sum(types) != plots:
            sys.exit(f'{rid}: plot types {types} do not sum to {plots}')
        s = scope_code.get(r[C['D']])
        if s is None:
            sys.exit(f'{rid}: scope {r[C["D"]]!r}')
        addr = None
        if r[C['AA']] == 'TRUE' and r[C['J']]:
            addr = [intern_dol(r[C['J']]), intern_dol(r[C['K']]), intern_dol(r[C['L']])]
        records.append({'id': rid, 'name': name, 'state': state, 'alt': alt, 'ext': ext, 'gov': clean(r[C['AH']]),
                        'al': al, 'province': prov, 'district': did or '', 'plots': plots, 'held': held,
                        'types': types, 'scope': s, 'addr': addr, 'raw': whole(r[C['V']])})
    if unmatched_districts:
        sys.exit(f'production districts without an area-index id: {dict(unmatched_districts)}')
    records.sort(key=lambda x: (prov_i[x['province']], x['district'], -(x['plots'] or 0), x['id']))
    rec_i = {x['id']: i for i, x in enumerate(records)}
    report['counts'].update({'records': len(records), 'plots': sum(x['plots'] or 0 for x in records),
                             'rawPlots': sum(x['raw'] or 0 for x in records), 'heldPlotRecords': sum(1 for x in records if x['held']),
                             'namelessRecords': sum(1 for x in records if x['state'] == 1),
                             'juristicAllocators': len(allocators),
                             'recordsWithoutShownAllocator': sum(1 for x in records if x['al'] < 0),
                             'detailChecked': sum(1 for x in records if x['addr'])})
    checks['plotTypesSumToPlots'] = all(sum(x['types']) == x['plots'] for x in records if x['types'] is not None and x['plots'] is not None)
    checks['heldRecords'] = sorted(x['id'] for x in records if x['held'])

    # ---------- per province / district ----------
    zero6 = lambda: [0] * 6
    agg = {c: {'records': 0, 'plots': 0, 'types': zero6(), 'typeRecords': zero6(), 'scope': [0] * 4, 'nameless': 0, 'held': 0} for c in provinces}
    dagg = collections.OrderedDict()
    for x in records:
        p = agg[x['province']]
        d = dagg.setdefault(x['district'], {'province': x['province'], 'records': 0, 'plots': 0, 'types': zero6(), 'typeRecords': zero6()})
        for g in (p, d):
            g['records'] += 1
            g['plots'] += x['plots'] or 0
            if x['types']:
                for k, v in enumerate(x['types']):
                    g['types'][k] += v
                    g['typeRecords'][k] += 1 if v > 0 else 0
        p['scope'][x['scope']] += 1
        p['nameless'] += 1 if x['state'] == 1 else 0
        p['held'] += 1 if x['held'] else 0
    districts = sorted(dagg.items(), key=lambda kv: (prov_i[kv[1]['province']], kv[0]))
    dist_i = {k: i for i, (k, _) in enumerate(districts)}
    report['counts']['districts'] = len(districts)

    # coverage and production reconcile
    h15, r15 = tabs['15_PROVINCE_COVERAGE']
    cov = {r[0]: (whole(r[1]), whole(r[4])) for r in r15}
    for c in provinces:
        name = next(p['name'] for p in index['provinces'] if p['id'] == c)
        rec_n, raw_plots = cov[name]
        got_raw = sum(x['raw'] or 0 for x in records if x['province'] == c)
        if agg[c]['records'] != rec_n or got_raw != raw_plots:
            sys.exit(f'{c}: records/plots {agg[c]["records"]}/{got_raw} differ from 15_PROVINCE_COVERAGE {rec_n}/{raw_plots}')
    checks['provinceCoverageEqual'] = True
    if a.production:
        lv0 = json.load(open(os.path.join(a.production, 'estate-lv0.json'), encoding='utf-8'))['value']
        by_uuid = {p['uuid']: p['id'] for p in index['provinces']}
        prod = {by_uuid[u]: d['rows'][0] for u, d in lv0['provinceDatas.'[:-1]].items()} if False else \
            {by_uuid[u]: d['rows'][0] for u, d in lv0['provinceDatas'].items()}
        diff = {c: (agg[c]['records'], prod[c]['projectCount']) for c in provinces if agg[c]['records'] != prod[c]['projectCount']}
        raw_diff = {c: 1 for c in provinces if sum(x['raw'] or 0 for x in records if x['province'] == c) != prod[c]['totalPlots']}
        if diff or raw_diff:
            sys.exit(f'production lv0 differs: {diff} {list(raw_diff)}')
        meta_lv0 = json.load(open(os.path.join(a.production, 'estate-lv0.meta.json'), encoding='utf-8'))
        checks['productionLv0Equal'] = {'url': meta_lv0['url'], 'sha256': meta_lv0['sha256'], 'retrievedAt': meta_lv0['retrievedAt'],
                                        'records': lv0['countryDatas']['00000000-0000-0000-0000-000000000000']['rows'][0]['projectCount'],
                                        'rawPlots': lv0['countryDatas']['00000000-0000-0000-0000-000000000000']['rows'][0]['totalPlots']}

    # ---------- publishers (02), brands (03) ----------
    h02, r02 = tabs['02_COMPANIES']
    companies = []
    for r in r02:
        companies.append({'key': r[col_index('J')], 'name': clean(r[0]), 'items': whole(r[3]) or 0,
                          'coverage': COVERAGE_WORDS.get(r[4], ''), 'url': public_url(r[col_index('K')]),
                          'checked': r[col_index('M')], 'pins': 0, 'drawn': 0})
    comp_i = {c['key']: i for i, c in enumerate(companies)}
    h03, r03 = tabs['03_BRANDS']
    brands = [{'key': r[4], 'name': clean(r[0]), 'company': comp_i[r[5]]} for r in r03]
    brand_i = {b['key']: i for i, b in enumerate(brands)}

    # ---------- transit ----------
    transit_path = os.path.join(a.transit, 'data', 'transit.json')
    transit = json.load(open(transit_path, encoding='utf-8'))
    tlines = {l['id']: l for l in transit['lines']}
    stations = []
    for s in transit['stations']:
        if not (isinstance(s.get('lat'), (int, float)) and isinstance(s.get('lng'), (int, float))):
            continue
        if s.get('status') not in ('operating', 'construction'):
            continue
        stations.append({'id': s['id'], 'name': s['name'], 'nameEn': s.get('nameEn') or '', 'lat': s['lat'], 'lon': s['lng'],
                         'status': s['status'], 'lines': [tlines[l]['short'] or tlines[l]['name'] for l in s.get('lineIds', []) if l in tlines],
                         'lineIds': s.get('lineIds', [])})
    stations.sort(key=lambda s: s['id'])

    def nearest(lat, lon, status):
        best, bd = None, RAIL_MAX_M + 1
        for i, s in enumerate(stations):
            if s['status'] != status:
                continue
            d = haversine(lat, lon, s['lat'], s['lon'])
            if d < bd:
                best, bd = i, d
        return (best, round(bd)) if best is not None else (-1, None)

    # ---------- projects (01) and pins (27) ----------
    h01, r01 = tabs['01_PROJECTS']
    P = {k: col_index(k) for k in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'Q', 'S', 'T', 'U', 'V', 'W',
                                    'Y', 'AD', 'AE', 'AF', 'AH', 'AI', 'AN', 'AP', 'AR', 'AV']}
    if h01[P['L']] != 'project_candidate_id' or h01[P['AV']] != 'แสดงหมุดอ้างอิงเริ่มต้น':
        sys.exit('01_PROJECTS: header changed')
    h27, r27 = tabs['27_MAP_REFERENCES']
    pins = {}
    for r in r27:
        if r[4] != 'TRUE':
            continue
        pins[r[6]] = {'lat': num(r[8]), 'lon': num(r[9]), 'role': r[3], 'source': r[10], 'page': public_url(r[11])}
    type_ids = [t[0] for t in HOUSE_TYPES]
    districts_frames = Districts(a.frames, provinces)
    items = []
    off_map = collections.Counter()
    for r in r01:
        key = r[P['L']]
        if r[P['D']] not in type_ids:
            sys.exit(f'{key}: house type {r[P["D"]]!r}')
        company = comp_i.get(r[P['M']])
        if company is None:
            sys.exit(f'{key}: company {r[P["M"]]!r}')
        tokens = []
        for part in re.split(r'[;,]| — ', r[P['E']]):
            part = part.strip()
            if not part:
                continue
            w = STATUS_WORDS.get(part)
            if not w:
                sys.exit(f'{key}: status label {part!r} has no word')
            if w not in tokens:
                tokens.append(w)
        if 'listed' in tokens and len(tokens) > 1:
            tokens.remove('listed')
        pin = pins.get(key) if r[P['AV']] == 'TRUE' else None
        if r[P['AV']] == 'TRUE' and not pin:
            sys.exit(f'{key}: default pin missing in 27')
        lat = lon = None
        pin_role = ''
        if pin:
            role = PIN_ROLES.get(pin['role'])
            if role is None:
                sys.exit(f'{key}: pin role {pin["role"]!r}')
            if role == 'google' or GOOGLE.search(host(pin['source'])):
                off_map['google'] += 1
            elif not (5 <= pin['lat'] <= 21 and 97 <= pin['lon'] <= 106):
                off_map['outside'] += 1
            else:
                lat, lon, pin_role = round(pin['lat'], 6), round(pin['lon'], 6), role
        prov = dist = ''
        how = ''
        if lat is not None:
            prov, dist, how = districts_frames.find(lon, lat)
            if not prov:
                off_map['no_district'] += 1
                lat = lon = None
                pin_role = ''
                prov = dist = ''
        price = num(r[P['G']])
        band = clean(r[P['H']])
        items.append({
            'key': key, 'name': clean(r[P['A']]), 'brand': brand_i.get(r[P['N']], -1), 'company': company,
            'type': type_ids.index(r[P['D']]), 'status': tokens, 'launch': period_of(r[P['F']]),
            'launchWindow': WINDOW_WORDS.get(r[P['AR']].split(';')[0].strip(), ''), 'price': price,
            'band': '' if band in ('ยังไม่มีราคา', 'ไม่ทราบ') else band, 'priceText': clean(r[P['Q']]),
            'sourceProvince': prov_by_name.get(clean(r[P['I']]), ''),
            'lat': lat, 'lon': lon, 'pin': pin_role, 'province': prov or '', 'district': dist or '', 'placed': how,
            'alias': r[P['AF']] == 'source_alias', 'group': r[P['AD']], 'page': public_url(r[P['T']]),
            'catalogue': public_url(r[P['U']]), 'pinPage': pin['page'] if pin else '', 'checked': r[P['V']],
            'parentRaw': clean(r[P['Y']]),
        })
    item_i = {x['key']: i for i, x in enumerate(items)}
    report['counts'].update({'projects': len(items), 'aliases': sum(1 for x in items if x['alias']),
                             'defaultPins': len(pins), 'drawnPins': sum(1 for x in items if x['lat'] is not None),
                             'pinsOffMap': dict(off_map)})
    for x in items:
        c = companies[x['company']]
        if x['lat'] is not None:
            c['drawn'] += 1

    # rail
    for x in items:
        if x['lat'] is None:
            x['rail'], x['railM'], x['rail2'], x['rail2M'] = -1, None, -1, None
            continue
        x['rail'], x['railM'] = nearest(x['lat'], x['lon'], 'operating')
        x['rail2'], x['rail2M'] = nearest(x['lat'], x['lon'], 'construction')

    # ---------- pairs of projects and records (24) ----------
    h24, r24 = tabs['24_SOURCE_MATCHES']
    pairs = collections.defaultdict(list)
    rec_pairs = collections.defaultdict(list)
    level_count = collections.Counter()
    for r in r24:
        lvl = PAIR_LEVELS.get(r[4])
        if not lvl:
            level_count['held'] += 1
            continue
        rid, key = r[1], r[3]
        if rid not in rec_i or key not in item_i:
            report['notes'].append(f'pair {r[0]}: record or project not in the build')
            continue
        level_count[lvl] += 1
        pairs[key].append([rid, lvl])
        rec_pairs[rid].append([item_i[key], lvl])
    report['counts']['pairs'] = dict(level_count)

    # ---------- legal roles (21), parents (01 Y), issuer facts (28), events (04) ----------
    h21, r21 = tabs['21_PROJECT_LEGAL_LINKS']
    legal = collections.defaultdict(list)
    for r in r21:
        if r[16] != 'TRUE' or r[1] not in item_i:
            continue
        role = LEGAL_ROLES.get(r[6])
        if not role:
            continue
        name = clean(r[4])
        if not name or not JURISTIC.search(name):
            continue
        entry = {'name': name, 'role': r[6], 'date': clean(r[10]), 'source': public_url(r[9])}
        if entry not in legal[r[1]]:
            legal[r[1]].append(entry)
    parents = {}
    for x in items:
        txt = x.pop('parentRaw')
        if not txt:
            continue
        out = []
        for part in txt.split(' | '):
            m = re.match(r'^(.+?) → (.+?); ([\d.]+%)?;? ?([a-z_]+)?;? ?ณ (\d{4}-\d{2}-\d{2})$', part.strip())
            if m:
                out.append({'child': m[1], 'parent': m[2], 'share': (m[3] or '').strip(), 'asOf': m[5]})
        if out:
            parents[x['key']] = out
    h28, r28 = tabs['28_ISSUER_FACTS']
    issuer = collections.defaultdict(list)
    for r in r28:
        if r[2] not in item_i:
            continue
        issuer[r[2]].append({'kind': 'ap' if r[3].startswith('AP') else 'sc', 'name': clean(r[4]), 'year': clean(r[5]),
                             'units': clean(r[12]), 'area': clean(r[13]), 'place': clean(r[14]), 'source': public_url(r[15]),
                             'asOf': clean(r[11])})
    h04, r04 = tabs['04_RECENT']
    events = collections.defaultdict(list)
    company_events = collections.defaultdict(list)
    for r in r04:
        word = EVENT_WORDS.get(r[12])
        if not word:
            sys.exit(f'event class {r[12]!r} has no word')
        ev = {'class': r[12], 'name': clean(r[0]), 'period': clean(r[13]) or clean(r[3]), 'precision': r[4],
              'window': WINDOW_WORDS.get(r[6], ''), 'price': num(r[7]), 'source': public_url(r[10]),
              'occurred': r[14], 'launchEvidence': r[15] == 'TRUE'}
        if r[9] in item_i:
            events[r[9]].append(ev)
        company_events[clean(r[1])].append(ev)
    for x in items:
        x['pairs'] = len(pairs.get(x['key'], []))
        x['events'] = len(events.get(x['key'], []))
        x['legal'] = len(legal.get(x['key'], []))
    report['counts'].update({'events': len(r04), 'legalRoles': sum(len(v) for v in legal.values()),
                             'parents': len(parents), 'issuerFacts': sum(len(v) for v in issuer.values())})

    # ---------- extents (OpenStreetMap areas matched to a pin by place and name) ----------
    extents, osm_meta = {}, {}
    if a.osm_match:
        match = json.load(open(a.osm_match, encoding='utf-8'))
        text = open(a.osm_geom, encoding='utf-8').read().rstrip('\n')
        gsha = hashlib.sha256(text.encode('utf-8')).hexdigest()
        if a.osm_geom_sha and gsha != a.osm_geom_sha:
            sys.exit(f'STOP: geometry sha256 {gsha} differs from the browser ({a.osm_geom_sha})')
        lines = []
        for l in text.split('\n'):
            if l.startswith('+') and lines:
                lines[-1] += ';' + l[1:]
            else:
                lines.append(l)
        gmeta = dict(kv.split(':', 1) for kv in lines[0].split('|')[1:])
        rings = collections.defaultdict(lambda: {'O': [], 'I': []})
        for l in lines[1:]:
            pid, kind, coords = l.split('|', 2)
            rings[pid][kind].append([[round(float(x), 6), round(float(y), 6)] for x, y in (p.split(',') for p in coords.split(';'))])
        for key, m in match['extents'].items():
            if key not in item_i:
                sys.exit(f'extent for an unknown project {key}')
            x = items[item_i[key]]
            if x['lat'] is None:
                sys.exit(f'extent for a project without a drawn pin {key}')
            g = rings.get(m['osm'])
            if not g or not g['O']:
                sys.exit(f'{m["osm"]}: no geometry exported')
            polys = [[o] + [h for h in g['I'] if any(ring_contains(o, *h[0]) for _ in [0])] for o in g['O']]
            extents[key] = {'osm': m['osm'], 'tag': m['tag'], 'name': m['names'][0], 'm2': m['area'], 'inside': m['inside'],
                            'd': m['d'], 'rings': polys}
        osm_meta = {'base': gmeta.get('osm_base', ''), 'pairsSha256': match['meta'].get('pairs_sha256', ''), 'geomSha256': gsha,
                    'filters': ['landuse=residential + name', 'place=neighbourhood/quarter + name', 'landuse=construction + name', 'residential=* + name']}
    for x in items:
        e = extents.get(x['key'])
        x['extentM2'] = e['m2'] if e else None
    report['counts']['extents'] = len(extents)

    # ---------- write ----------
    os.makedirs(a.out, exist_ok=True)
    tab_list = {t: tab_meta[t] for t in TABS}
    meta = {
        'dataset': 'CityMETER Housing Estate', 'registryId': REGISTRY_ID, 'registryGroup': REGISTRY_GROUP,
        'sheetTitle': SHEET_TITLE, 'readOn': a.read_on,
        'readMethod': 'the owner’s .xlsx export of the whole workbook (Google Sheets, 2026-11-18), every tab converted to CSV with exact cell values',
        'exportSha256': sha256_file(a.xlsx), 'exportBytes': os.path.getsize(a.xlsx), 'tabs': tab_list,
        'checkedOn': '2026-11-18', 'window': {'from': WINDOW[0], 'to': WINDOW[1]},
        'osm': osm_meta,
        'sources': {
            'records': {'th': 'ระเบียนโครงการจัดสรรที่ดินบนเว็บไซต์กรมที่ดิน ตาม snapshot ของ CityMETER production',
                        'en': 'Land allocation records of the Department of Lands website, as CityMETER production holds them',
                        'url': 'https://www.dol.go.th/', 'production': 'https://landometer.com/v3/citymeter?d=estate',
                        'rights': 'DOL pages are public; reuse terms are not stated (07_PRODUCTION)'},
            'projects': {'th': 'บัญชีโครงการบนเว็บไซต์ผู้พัฒนาและผู้เผยแพร่ ที่ทีมวิจัยเก็บ', 'en': 'Project lists on developers’ and publishers’ websites, collected by the research team'},
            'osm': {'th': 'กรอบพื้นที่และอาคารจาก OpenStreetMap', 'en': 'OpenStreetMap areas and buildings', 'license': 'ODbL-1.0',
                    'credit': '© OpenStreetMap contributors'},
        },
        'counts': report['counts'],
        'checks': {k: v for k, v in checks.items() if k != 'heldRecords'},
        'context': {
            'rail': {'source': 'CityMETER · Transit (montri-th/transit)', 'commit': repo_commit(a.transit), 'file': 'data/transit.json',
                     'sha256': sha256_file(transit_path), 'release': (transit.get('meta') or {}).get('release', ''),
                     'asOf': (transit.get('meta') or {}).get('asOf', ''), 'maxM': RAIL_MAX_M},
            'districts': {'source': a.frames_ref, 'use': 'a project pin’s เขต/อำเภอ by its point, at build time'},
        },
        'plotTypes': [{'id': t[0], 'th': t[1], 'en': t[2], 'field': t[3]} for t in PLOT_TYPES],
        'housePlots': list(HOUSE_PLOTS),
        'houseTypes': [{'id': t[0], 'th': t[1], 'en': t[2]} for t in HOUSE_TYPES],
        'scopes': [{'id': s[0], 'th': s[2], 'en': s[3]} for s in SCOPES],
        'status': {k: {'th': v[0], 'en': v[1]} for k, v in STATUS_LABELS.items()},
        'pins': {k: {'th': v[0], 'en': v[1]} for k, v in PIN_LABELS.items()},
        'pairs': {k: {'th': v[0], 'en': v[1]} for k, v in PAIR_LABELS.items()},
        'excludedFields': EXCLUDED,
    }

    def col(rows, key, f=lambda v: v):
        return [f(r[key]) for r in rows]
    shown = [x for x in items]
    data = {
        'meta': meta,
        'provinces': provinces,
        'areas': {k: [agg[c][k] for c in provinces] for k in ('records', 'plots', 'types', 'typeRecords', 'scope', 'nameless', 'held')},
        'districts': {'id': [k for k, _ in districts], 'province': [prov_i[v['province']] for _, v in districts],
                      'records': [v['records'] for _, v in districts], 'plots': [v['plots'] for _, v in districts],
                      'types': [v['types'] for _, v in districts], 'typeRecords': [v['typeRecords'] for _, v in districts]},
        'companies': [{k: c[k] for k in ('key', 'name', 'items', 'coverage', 'url', 'drawn')} for c in companies],
        'brands': {'name': [b['name'] for b in brands], 'company': [b['company'] for b in brands]},
        'projects': {
            'key': col(shown, 'key'), 'name': col(shown, 'name'), 'brand': col(shown, 'brand'), 'company': col(shown, 'company'),
            'type': col(shown, 'type'), 'status': col(shown, 'status'), 'launch': col(shown, 'launch'), 'launchWindow': col(shown, 'launchWindow'),
            'price': col(shown, 'price'), 'band': col(shown, 'band'), 'sourceProvince': col(shown, 'sourceProvince'),
            'lat': col(shown, 'lat'), 'lon': col(shown, 'lon'), 'pin': col(shown, 'pin'),
            'province': col(shown, 'province'), 'district': col(shown, 'district'), 'alias': col(shown, 'alias'),
            'rail': col(shown, 'rail'), 'railM': col(shown, 'railM'), 'rail2': col(shown, 'rail2'), 'rail2M': col(shown, 'rail2M'),
            'pairs': col(shown, 'pairs'), 'events': col(shown, 'events'), 'legal': col(shown, 'legal'), 'extentM2': col(shown, 'extentM2'),
        },
        'stations': stations,
    }
    rec_data = {
        'meta': {'dataset': 'CityMETER Housing Estate', 'part': 'records', 'sheetTitle': SHEET_TITLE, 'readOn': a.read_on,
                 'exportSha256': meta['exportSha256'], 'tabs': {t: tab_meta[t] for t in ('12_PRODUCTION_SOURCE', '23_NATIONAL_MASTER', '24_SOURCE_MATCHES')},
                 'url': 'https://www.dol.go.th/land/{id}/',
                 'rules': ['one row per DOL website record of the production snapshot, never a village',
                           'plots are selected_reported_plot_total: the record’s own total where its plot types sum to it; the held totals stay out',
                           'province and district are the production boundary the record is counted in (query scope), not an address',
                           'addr is the address the DOL record page reports, for the records the research team read (detail_checked)',
                           'an allocator is named only when the name carries a legal-entity form']},
        'provinces': provinces,
        'districts': [k for k, _ in districts],
        'allocators': allocators,
        'places': dol_names,
        'cols': {
            'id': [x['id'] for x in records], 'name': [x['name'] for x in records], 'state': [x['state'] for x in records],
            'al': [x['al'] for x in records], 'p': [prov_i[x['province']] for x in records], 'd': [dist_i[x['district']] for x in records],
            'n': [x['plots'] for x in records], 't': [x['types'] for x in records], 's': [x['scope'] for x in records],
            'addr': [x['addr'] for x in records],
        },
        'alt': {str(i): {k: x[k] for k in ('alt', 'ext', 'gov') if x[k]} for i, x in enumerate(records) if x['alt'] or x['ext'] or x['gov']},
        'held': [i for i, x in enumerate(records) if x['held']],
        'pairs': {str(rec_i[rid]): v for rid, v in rec_pairs.items()},
    }
    portfolio = {
        'meta': {'dataset': 'CityMETER Housing Estate', 'part': 'portfolio', 'sheetTitle': SHEET_TITLE, 'readOn': a.read_on,
                 'exportSha256': meta['exportSha256'],
                 'tabs': {t: tab_meta[t] for t in ('01_PROJECTS', '04_RECENT', '21_PROJECT_LEGAL_LINKS', '24_SOURCE_MATCHES', '27_MAP_REFERENCES', '28_ISSUER_FACTS')},
                 'legalRoles': {k: {'th': v[0], 'en': v[1]} for k, v in LEGAL_ROLES.items()},
                 'events': {k: {'th': v[0], 'en': v[1]} for k, v in EVENT_WORDS.items()},
                 'rules': ['a label is what the source showed when it was read, never a sales status',
                           'a role in a legal notice is the notice’s, never a land register',
                           'a pair of a project and a DOL record is one the research team found, never one place',
                           'a price is the starting price the page showed, never compared, averaged or ranked']},
        'projects': {x['key']: {k: v for k, v in {
            'page': x['page'], 'catalogue': x['catalogue'] if x['catalogue'] != x['page'] else '', 'pinPage': x['pinPage'] if x['pinPage'] not in (x['page'], x['catalogue']) else '',
            'priceText': x['priceText'], 'legal': legal.get(x['key'], []), 'parents': parents.get(x['key'], []),
            'issuer': issuer.get(x['key'], []), 'events': events.get(x['key'], []), 'pairs': pairs.get(x['key'], [])}.items() if v}
            for x in items},
        'companyEvents': {companies[i]['key']: company_events.get(companies[i]['name'], []) for i in range(len(companies)) if company_events.get(companies[i]['name'])},
    }

    def dump(obj, name):
        path = os.path.join(a.out, name)
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))
            fh.write('\n')
        return os.path.getsize(path)
    ext_data = {
        'meta': {'dataset': 'CityMETER Housing Estate', 'part': 'extents', 'osm': osm_meta,
                 'credit': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
                 'rules': ['an extent is an OpenStreetMap area whose name is the project’s and that holds its pin (or lies within 30 m of it)',
                           'an approximate extent for the map (กรอบราว N ไร่ = m² / 1,600), never a deed, a legal boundary or a land size',
                           'buildings are lit by their interior point in the extent, never counted as the project’s houses']},
        'extents': extents,
    }
    sizes = {n: dump(o, n) for o, n in ((data, 'estates.json'), (rec_data, 'records.json'), (portfolio, 'portfolio.json'), (ext_data, 'extents.json'))}
    report['sizes'] = sizes
    report['checks']['heldRecords'] = checks['heldRecords']
    with open(os.path.join(a.out, 'build-report.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(json.dumps({'counts': report['counts'], 'sizes': sizes}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
