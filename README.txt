Damage 2026 VS Code Version

ไฟล์หลัก
1) apps-script-api.gs  = Backend API สำหรับ Google Apps Script
2) index.html          = หน้าเว็บหลัก
3) styles.css          = ไฟล์ตกแต่งหน้าเว็บ
4) script.js           = JavaScript ฝั่งหน้าเว็บ
5) config.json         = ตั้งค่า API URL และตัวเลือก Dropdown
6) netlify/functions/damage-api.js = Proxy API สำหรับ Netlify ลดปัญหา CORS และเก็บ token ฝั่ง server
7) netlify.toml        = ตั้งค่า deploy static site + Netlify Functions

วิธีติดตั้ง Backend API
1. เปิด Google Apps Script โปรเจกต์ใหม่ หรือโปรเจกต์เดิมที่ใช้กับ Sheet นี้
2. วางโค้ดจากไฟล์ apps-script-api.gs ทั้งหมด
3. กด Save
4. กด Deploy > New deployment > Web app
5. ตั้งค่า Execute as: Me
6. ตั้งค่า Who has access: Anyone with the link
7. กด Deploy แล้ว Copy URL ที่ลงท้ายด้วย /exec
8. ถ้าต้องการล็อก API ให้เปิด Project Settings > Script properties แล้วเพิ่ม
   - DAMAGE_API_TOKEN = token ลับที่ตั้งเอง
   ถ้าไม่ตั้งค่า token ระบบจะทำงานแบบเดิม แต่ URL /exec จะยังเปิด public

วิธีตั้งค่าหน้าเว็บ VS Code
1. เปิดโฟลเดอร์ damage-2026-vscode ใน VS Code
2. เปิดไฟล์ config.json
3. เปลี่ยนค่า apiUrl จาก PASTE_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE เป็น URL /exec ที่ Copy มา
4. ถ้าทดสอบผ่าน Live Server โดยตรง และ Apps Script ตั้ง token ไว้ ให้ใส่ apiToken ใน config.json ชั่วคราว
5. เปิดด้วย Live Server หรือเอาไฟล์ขึ้น Netlify ได้เลย

วิธีตั้งค่า Netlify Proxy
1. Deploy โฟลเดอร์นี้ขึ้น Netlify
2. ตั้ง Environment variables ใน Netlify
   - APPS_SCRIPT_URL = URL /exec ของ Apps Script
   - DAMAGE_API_TOKEN = token เดียวกับ Script properties ถ้ามี
3. ใน config.json ให้ใช้ apiProxyUrl เป็น /.netlify/functions/damage-api
4. แนะนำให้ปล่อย apiToken ใน config.json ว่างไว้เมื่อใช้ Netlify เพื่อไม่ให้ token อยู่ในหน้าเว็บ

หมายเหตุ
- ฐานข้อมูลที่ใช้: Spreadsheet ID 1Nbyl-kzlaAr28Otw_3Aa5dPsmvJMVsZDXGgmOX612CQ
- Sheet หลัก: Damage_2026
- Sheet อ้างอิงสินค้า: สินค้า
- Sheet อ้างอิงพนักงาน: ชื่อ พนง.
- Sheet ราคาทุน: ราคาทุน
- ถ้าแก้ Code.gs แล้ว Deploy ใหม่ อย่าลืมเลือก Manage deployments > Edit > New version เพื่อให้ URL เดิมอัปเดตโค้ดล่าสุด
- หน้าเว็บรองรับแก้ไข/ลบรายการจากการ์ดข้อมูลล่าสุดหรือ Dashboard
- Dashboard รองรับ filter ช่วงวัน, BU, ประเภทสินค้า, กะ, กลุ่มเสียหาย, วันที่เริ่ม/สิ้นสุด และค้นหาข้อความ
- รูปภาพจะถูกย่อใน browser และถูกตรวจขนาดซ้ำที่ Apps Script ก่อนบันทึกลง Drive
