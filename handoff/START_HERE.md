# CityMETER Housing Estate — Developer Handoff

รุ่นเผยแพร่ 0.3.0 · 18 พ.ย. 2569 · ชีตวิจัยอ่านและสร้างข้อมูล 18 พ.ย. 2569 (ไฟล์ส่งออกของเจ้าของ) · ยอดตรวจซ้ำกับ CityMETER production (`estate/info/lv0`) วันเดียวกัน · OpenStreetMap ณ 18 พ.ย. 2569

เริ่มอ่าน `source/handoff/README.md` จากนั้น Product Statement (`source/PRODUCT_STATEMENT.md` + `source/handoff/product-statement.json`), Product Brief และ Implementation Plan ในโฟลเดอร์ `source/handoff` ทั้ง `.md` และ `.json` ใช้คู่กัน

เข้าโฟลเดอร์ `source` แล้วรัน `npm test` และ `npm start` เปิด http://127.0.0.1:4173/ (English: `?lang=en`)

ชุดนี้มี source code (ES modules มีคอมเมนต์สัญญาทุกโมดูล ต่อยอดจาก CityMETER · University 0.1.5), datasets (ดัชนีจังหวัดและอำเภอ + ขอบเขต 77 จังหวัด + แปลงจัดสรรและรายการต่ออำเภอ โครงการ ผู้พัฒนา แบรนด์ รายการจัดสรร คู่โครงการ–รายการ หลักฐานรายโครงการ กรอบพื้นที่ OSM สถานี หน่วยอาคาร), assets ที่ตรวจ hash แล้ว, unit tests บนข้อมูลจริง, JSON Schema 1.5.0, acceptance criteria A1–A18, สคริปต์แปลงไฟล์ส่งออก/จับคู่กรอบ OSM/สร้างข้อมูล/manifest/bundle ตรวจ LDS + Location Intelligence parity และตรวจ live bytes อ่าน `source/AGENTS.md` ก่อนแก้ไข

เว็บจริง: https://montri-th.github.io/housingestate/
Repository: https://github.com/montri-th/housingestate

`RELEASE_RECEIPT.json` (ถ้ามีในชุด) ผูกชุดส่งต่อกับ commit ผล GitHub Pages และ live attestation ส่วน `evidence/` เป็นหลักฐานหน้าจอและผลเทียบ hash ของไฟล์บนเว็บ แยกจาก source ที่ commit แล้ว
