Damage 2026 VS Code Version

ไฟล์หลัก
1) apps-script-api.gs  = Backend API สำหรับ Google Apps Script
2) index.html          = หน้าเว็บหลัก
3) styles.css          = ไฟล์ตกแต่งหน้าเว็บ
4) script.js           = JavaScript ฝั่งหน้าเว็บ
5) config.json         = ตั้งค่า API URL และตัวเลือก Dropdown

วิธีติดตั้ง Backend API
1. เปิด Google Apps Script โปรเจกต์ใหม่ หรือโปรเจกต์เดิมที่ใช้กับ Sheet นี้
2. วางโค้ดจากไฟล์ apps-script-api.gs ทั้งหมด
3. กด Save
4. กด Deploy > New deployment > Web app
5. ตั้งค่า Execute as: Me
6. ตั้งค่า Who has access: Anyone with the link
7. กด Deploy แล้ว Copy URL ที่ลงท้ายด้วย /exec

วิธีตั้งค่าหน้าเว็บ VS Code
1. เปิดโฟลเดอร์ damage-2026-vscode ใน VS Code
2. เปิดไฟล์ config.json
3. เปลี่ยนค่า apiUrl จาก PASTE_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE เป็น URL /exec ที่ Copy มา
4. เปิดด้วย Live Server หรือเอาไฟล์ขึ้น Netlify ได้เลย

หมายเหตุ
- ฐานข้อมูลที่ใช้: Spreadsheet ID 1Nbyl-kzlaAr28Otw_3Aa5dPsmvJMVsZDXGgmOX612CQ
- Sheet หลัก: Damage_2026
- Sheet อ้างอิงสินค้า: สินค้า
- Sheet อ้างอิงพนักงาน: ชื่อ พนง.
- Sheet ราคาทุน: ราคาทุน
- ถ้าแก้ Code.gs แล้ว Deploy ใหม่ อย่าลืมเลือก Manage deployments > Edit > New version เพื่อให้ URL เดิมอัปเดตโค้ดล่าสุด
