# CityMETER Housing Estate — Implementation Plan (0.1.0)

คู่กับ `implementation-plan.json` (เครื่องตรวจ)

## สถาปัตยกรรม

Static site บน GitHub Pages — ES modules ผ่าน import map (ทุกโมดูลมี `?v=` เดียวกัน) ไม่มี build step · Node ≥ 20 สำหรับ tests · Python 3 สำหรับสร้างข้อมูล · MapLibre GL JS 5.6.2 จาก unpkg (ล็อก SRI) · tiles จาก OpenFreeMap

| โมดูล | หน้าที่ |
|---|---|
| `js/app.js` | ประสานทุกส่วน: scope ข้อค้นพบ แผง layer ไฟล์เสริม (กรอบ หลักฐาน รายการ) กล้องอาคาร URL แจ้งข้อมูลไม่ครบ |
| `js/model.js` | ถอด `data/estates.json` และ `data/records.json` มาตรวัด (แปลง · รายการ) ประเภทแปลง ตัวกรอง สรุป ลิงก์ production และกรมที่ดิน |
| `js/area-insight.js` | ข้อค้นพบแรก (จังหวัดหรืออำเภอ กติกาค่าเท่ากัน แท่งเทียบเฉพาะแปลงบ้าน จังหวัดที่ไม่มีรายการ) |
| `js/provinces.js` | สีและขอบจังหวัด (41 ระดับ) เส้นโฟกัสและที่เลือก |
| `js/extents.js` · `js/extent-buildings.js` | ถอด `data/extents.json` กรอบโครงการบนแผนที่ การกดบนกรอบ และอาคารในกรอบที่สว่าง |
| `js/profile-model.js` | model ของ overview อำเภอ โครงการ ผู้พัฒนา รายการ สถานี อาคาร และผลค้นหา |
| `js/panel.js` · `js/charts.js` | แผงอ่าน (HTML) และกราฟ (HTML ไม่ใช้ไลบรารี) |
| `js/pins.js` · `js/labels.js` · `js/stations.js` | หมุด ชื่อกลางจอ สถานี |
| `js/massing.js` · `js/regions.js` · `js/shell/*` | มวลอาคาร x-ray พื้นที่วาดอาคาร กล้อง ภูมิประเทศ หน่วยอาคาร header URL i18n (citymeter-shell 0.6.3) |
| `js/scales.js` · `js/cues.js` | สเกล li.supply และ count ครบ 41 ระดับ · ประเภทบ้าน → series และรูปทรง |
| `js/lang.js` · `js/lang-en.js` | ภาษาอังกฤษ |

## งาน

T1 อ่านไฟล์ส่งออก (`scripts/xlsx-to-csv.py`) · T2 จับคู่หมุดกับกรอบ OSM (`scripts/match-extents.py`) · T3 สร้างข้อมูลและตรวจยอดกับ production (`scripts/build-data.py`) · T4 model ข้อค้นพบ และการค้นหา · T5 แผนที่ (ชิปอำเภอ กรอบและอาคารในกรอบ) · T6 แผง กราฟ ตาราง · T7 ภาษาอังกฤษ · T8 shell 0.6.3 · T9 เอกสาร handoff release · T10 เผยแพร่ ตรวจ live และอัปเดตทะเบียน (ดู `VERIFICATION.md`) · T11 family sync ของ shell 0.6.3 (รออนุมัติเจ้าของครั้งเดียว)

## Acceptance criteria

A1–A18 ใน `implementation-plan.json` — unit tests บนข้อมูลจริง (`tests/*.test.js`), LDS parity, English harvest และ live attestation

## Backlog

หน่วยอาคาร CityMETER รอบ 72 หมุด (12 กรอบ) ที่อยู่นอกหน่วยที่ประเมินแล้ว · คู่ที่ทีมวิจัยพักไว้ 321 คู่ และยอดแปลงที่พักไว้ 13 รายการ · หมุดของ 58 โครงการที่มีแต่ลิงก์ Google Maps · ชื่ออังกฤษของโครงการและแบรนด์ในชีตวิจัย · demo อื่น hub และระบบเผยแพร่รับ citymeter-shell 0.6.3 · ประกาศชนิด `e` และ `n` ของชุดข้อมูลนี้ในทะเบียน
