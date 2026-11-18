# CityMETER Housing Estate — handoff

สำหรับนักพัฒนาที่รับงานต่อ เอกสารในโฟลเดอร์นี้มีสองรูปแบบที่ต้องตรงกัน: Markdown สำหรับคนอ่าน และ JSON (schema `handoff.schema.json` 1.5.0) สำหรับเครื่องตรวจ (`tests/release.test.js` ตรวจ schema และเลขรุ่น)

| ไฟล์ | อ่านเพื่อ |
|---|---|
| `../PRODUCT_STATEMENT.md` · `product-statement.json` | ผู้ใช้ ปัญหา คู่เทียบ กลยุทธ์ claim boundary และสมมติฐานที่ต้องทดสอบ |
| `PRODUCT_BRIEF.md` · `product-brief.json` | สัญญาของหน้าจอ: ข้อค้นพบแรก มาตรวัด สี สองชั้นของข้อมูล ชิปอำเภอ กรอบโครงการและอาคารในกรอบ แผง กราฟ กล้อง |
| `IMPLEMENTATION_PLAN.md` · `implementation-plan.json` | สถาปัตยกรรม โมดูล งาน acceptance criteria และ backlog |
| `VERIFICATION.md` | ผลตรวจของรุ่นนี้: tests, render, English harvest, live attestation, live walk |
| `../DATA_METHOD.md` | ที่มาของทุกตัวเลข สองชั้นข้อมูล การจับคู่โครงการกับรายการ กรอบ OSM บริบท และสิ่งที่ไม่เผยแพร่ |
| `../AGENTS.md` | ความต้องการของเจ้าของที่เป็นสัญญา — อ่านก่อนแก้ |

## ลำดับการทำงาน

1. แก้ข้อมูลในชีตวิจัยเท่านั้น (ไม่ commit ชีต ไฟล์ส่งออก เซลล์ หรือที่อยู่ของชีต)
2. เจ้าของส่งออกชีตเป็น .xlsx แล้ว `python3 -I scripts/xlsx-to-csv.py <export.xlsx> <tabs-dir>`
3. หมุดเปลี่ยน → อ่านคู่กับ OSM ใหม่ (skill osm-area-site-join) แล้ว `python3 -I scripts/match-extents.py …`
4. `python3 -I scripts/build-data.py …` ตาม `DATA_METHOD.md` §9 (หยุดเองถ้ายอดไม่ตรง production หรือหัวตารางเปลี่ยน)
5. `npm test` และ `npm run check:lds -- --lds <base> --li <profile>` และเดินหน้าเว็บแบบ `?lang=en` ทุกมุมมองให้ไม่มีข้อความไทยค้าง
6. ขยับ `?v=YYYYMMDD-rN` ใน `index.html` + `package.json` + `design-intent.json` + handoff JSON
7. push `main` → GitHub Pages → `npm run handoff:manifest` → `npm run verify:live`
8. เดินเว็บจริงที่ 1440 และ 390 px ทั้ง light และ dark ไทยและอังกฤษ ก่อนบอกว่าเสร็จ
9. อัปเดตแถว `research.TH.housing_estate` ใน CityMETER Dataset Registry (คอลัมน์ demo) ในชีตเดิม

## จุดที่ต้องระวัง

- แปลงจัดสรรเป็นของรายการ นับในอำเภอและจังหวัดที่ production ให้รายการนั้น ห้ามแบ่งลงโครงการ หมุด กรอบ หรืออาคาร · โครงการไม่มีตัวเลขแปลงของตัวเอง (ไม่ใช่ 0) · รายการไม่ใช่หมู่บ้าน
- คู่โครงการ–รายการแสดงเป็นคู่พร้อมระดับการจับคู่ คู่ที่ทีมวิจัยพักไว้ไม่แสดง
- ป้าย ราคาเริ่ม และช่วงเปิดตัว = สิ่งที่หน้าเว็บแสดงตอนทีมวิจัยอ่าน ห้ามเทียบ เฉลี่ย หรือจัดอันดับราคา ป้ายไม่ใช่สถานะการขาย
- พิกัดจาก Google Maps ไม่เข้าข้อมูล · ผู้จัดสรรแสดงเฉพาะชื่อนิติบุคคล
- ไม่มีคำเตือนบนหน้าจอ ข้อจำกัดอยู่หลังลิงก์ “วิธีนับ” (DATA_METHOD.md)
- `js/shell/` เป็น citymeter-shell 0.6.3 (ไบต์เดียวกันทุก repo) อย่าแก้ที่นี่ที่เดียว · MapLibre ล็อกที่ 5.6.2 พร้อม `js/shell/maplibre-guard.js`
- ลำดับ layer มวลอาคาร x-ray สถานี กรอบโครงการ และหมุด มีผลต่อมุมมองอาคาร อย่าสลับโดยไม่ทดสอบ
- ชื่อตัวแปรบางตัวยังเป็นของตระกูล (เช่น `units` = แถวอำเภอ, `sites` = โครงการ, คลาส CSS `school-label`) เปลี่ยนได้ แต่ต้องเปลี่ยนพร้อม tests
