/**
 * Damage 2026 API for VS Code / Netlify frontend
 * ใช้เป็น Backend API ของ Google Apps Script เพื่ออ่าน/เขียน Google Sheet เดิม
 * Deploy: Apps Script > Deploy > New deployment > Web app
 * Execute as: Me
 * Who has access: Anyone with the link
 */

const API_CONFIG = {
  SPREADSHEET_ID: '1Nbyl-kzlaAr28Otw_3Aa5dPsmvJMVsZDXGgmOX612CQ',
  SHEET_NAME: 'Damage_2026',
  PRODUCT_SHEET_NAME: 'สินค้า',
  EMPLOYEE_SHEET_NAME: 'ชื่อ พนง.',
  COST_SHEET_NAME: 'ราคาทุน',
  IMAGE_FOLDER_NAME: 'Damage_2026_Form_Images',
  IMAGE_CELL_MODE: 'LINK',
  MAX_IMAGE_BYTES: 1600000,
  DUPLICATE_SCAN_ROWS: 150,
  TZ: 'Asia/Bangkok',
  BU: ['DM02', 'DP02', 'DG02', '1115', 'DCWN', 'DS02', 'DO02'],
  DAMAGE_TYPES: ['สินค้าชำรุด', 'สินค้าแตกแพค', 'สินค้าหมดอายุ'],
  DAMAGE_DESCRIPTIONS: [
    'สินค้าบุบเสียหาย',
    'สินค้ามีรอยคัตเตอร์',
    'สินค้าห่อแฟ่บ',
    'สินค้าฉีกขาด',
    'สินค้ามีสิ่งปนเปื้อน ส่งกลิ่น',
    'สินค้าแตก หักเสียหาย',
    'สินค้ารั่วซึม',
    'อื่น'
  ],
  DAMAGE_GROUPS: ['OPT', 'SUP', 'Out bound'],
  ACCOUNT_GROUPS: ['สินค้ารอทำลายได้', 'สินค้ารอทำลายไม่ได้'],
  SHIFTS: ['A', 'B'],
  AFFILIATIONS: ['PTG', 'Man Power', '40HRS', 'BU']
};

// ตรงกับ Sheet Damage_2026 ปัจจุบัน และเพิ่มคอลัมน์ ประเภท ด้านท้าย
const API_HEADERS = [
  'วันที่',
  'BU',
  'บาร์โค้ด',
  'รหัสสินค้า',
  'ชื่อสินค้า',
  'รูปภาพ 1',
  'รูปภาพ2',
  'รูปภาพ3',
  'ประเภทสินค้า',
  'ลักษณะสินค้า',
  'วันหมดอายุ',
  'กลุ่ม เสียหาย',
  'เลขกล่อง',
  'จำนวน',
  'หน่วย',
  'เวลาที่ได้รับแจ้ง',
  'กะ',
  'ผู้กระทำ',
  'รหัสพนักงาน',
  'สังกัด',
  'หมายเหตุ',
  'กลุ่มสินค้าทางบัญชี',
  'มูลค่าต่อหน่วย',
  'มูลค่ารวม',
  'ประเภท'
];

function doGet(e) {
  return handleApiRequest_(e, 'GET');
}

function doPost(e) {
  return handleApiRequest_(e, 'POST');
}

function handleApiRequest_(e, method) {
  const params = (e && e.parameter) || {};
  const callback = String(params.callback || '').trim();
  let requestBody = {};

  if (method === 'POST' && e && e.postData && e.postData.contents) {
    try {
      requestBody = JSON.parse(e.postData.contents || '{}');
    } catch (err) {
      requestBody = {};
    }
  }

  const action = String(requestBody.action || params.action || 'getAppData').trim();
  let payload = requestBody.payload || {};

  if (params.payload) {
    try {
      payload = JSON.parse(params.payload);
    } catch (err) {
      payload = {};
    }
  } else if (method === 'GET') {
    payload = {};
    Object.keys(params).forEach((key) => {
      if (['action', 'callback', 'apiToken', 'token'].indexOf(key) === -1) {
        payload[key] = params[key];
      }
    });
  }

  try {
    assertAuthorized_(requestBody, payload, params);
    scrubAuthFields_(payload);
    const result = routeApiAction_(action, payload, params);
    return apiResponse_({ ok: true, action, data: result }, callback);
  } catch (err) {
    return apiResponse_({
      ok: false,
      action,
      error: err && err.message ? err.message : String(err)
    }, callback);
  }
}

function routeApiAction_(action, payload, params) {
  switch (action) {
    case 'ping':
      return {
        message: 'pong',
        now: Utilities.formatDate(new Date(), API_CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss')
      };
    case 'getAppData':
      return getAppDataApi_();
    case 'saveDamage':
      return saveDamageApi_(payload);
    case 'updateDamage':
      return updateDamageApi_(payload);
    case 'deleteDamage':
      return deleteDamageApi_(payload);
    case 'getLatestRecords':
      return getLatestRecordsApi_(payload.limit || params.limit || 20);
    case 'getDashboardRecords':
      return getDashboardRecordsApi_(payload || params || {});
    case 'findProducts':
      return findProductsApi_(payload.query || params.query || '');
    case 'findEmployees':
      return findEmployeesApi_(payload.query || params.query || '');
    case 'getCostPreview':
      return getCostPreviewApi_(payload.itemCode || params.itemCode || '', payload.quantity || params.quantity || 0);
    case 'refreshCostValues':
      return refreshCostValuesApi_();
    default:
      throw new Error('ไม่พบ action: ' + action);
  }
}

function apiResponse_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function assertAuthorized_(requestBody, payload, params) {
  const expected = getApiToken_();
  if (!expected) return;

  const actual = String(
    (requestBody && (requestBody.apiToken || requestBody.token)) ||
    (payload && (payload.apiToken || payload.token)) ||
    (params && (params.apiToken || params.token)) ||
    ''
  ).trim();

  if (actual !== expected) {
    throw new Error('Unauthorized: API token ไม่ถูกต้องหรือไม่ได้ส่งมา');
  }
}

function getApiToken_() {
  try {
    return String(
      PropertiesService.getScriptProperties().getProperty('DAMAGE_API_TOKEN') ||
      PropertiesService.getScriptProperties().getProperty('API_TOKEN') ||
      ''
    ).trim();
  } catch (err) {
    return '';
  }
}

function scrubAuthFields_(payload) {
  if (!payload || typeof payload !== 'object') return;
  delete payload.apiToken;
  delete payload.token;
}

function getAppDataApi_() {
  ensureDamageSheet_();
  return {
    options: {
      bu: API_CONFIG.BU,
      damageTypes: API_CONFIG.DAMAGE_TYPES,
      damageDescriptions: API_CONFIG.DAMAGE_DESCRIPTIONS,
      damageGroups: API_CONFIG.DAMAGE_GROUPS,
      accountGroups: API_CONFIG.ACCOUNT_GROUPS,
      shifts: API_CONFIG.SHIFTS,
      affiliations: API_CONFIG.AFFILIATIONS
    },
    today: Utilities.formatDate(new Date(), API_CONFIG.TZ, 'yyyy-MM-dd'),
    timeNow: Utilities.formatDate(new Date(), API_CONFIG.TZ, 'HH:mm'),
    latest: getLatestRecordsApi_(8).records
  };
}

function saveDamageApi_(payload) {
  ensureDamageSheet_();
  payload = payload || {};

  const qty = validateDamagePayload_(payload);

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);

  if (!payload.allowDuplicate) {
    const duplicate = findDuplicateDamage_(sheet, payload, 0);
    if (duplicate) throw new Error('DUPLICATE: พบรายการที่อาจซ้ำกับ Row ' + duplicate.rowNumber + ' วันนี้');
  }

  const unitCost = lookupUnitCost_(payload.itemCode);
  const imageCells = [
    imageCell_(saveImage_(payload.imageBarcode, 'รูปภาพ 1').url, 'เปิดรูป 1'),
    imageCell_(saveImage_(payload.imageProduct, 'รูปภาพ2').url, 'เปิดรูป 2'),
    imageCell_(saveImage_(payload.imageExpiry, 'รูปภาพ3').url, 'เปิดรูป 3')
  ];
  const values = buildDamageRowValues_(payload, new Date(), imageCells, unitCost, qty);

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (!payload.allowDuplicate) {
      const duplicate = findDuplicateDamage_(sheet, payload, 0);
      if (duplicate) throw new Error('DUPLICATE: พบรายการที่อาจซ้ำกับ Row ' + duplicate.rowNumber + ' วันนี้');
    }

    const nextRow = Math.max(sheet.getLastRow() + 1, 2);
    setDamageRow_(sheet, nextRow, values);
    SpreadsheetApp.flush();

    return {
      message: 'บันทึกสำเร็จที่แถว ' + nextRow,
      rowNumber: nextRow,
      record: readRecordAtRow_(sheet, nextRow),
      latest: getLatestRecordsApi_(8).records
    };
  } finally {
    lock.releaseLock();
  }
}

function updateDamageApi_(payload) {
  ensureDamageSheet_();
  payload = payload || {};

  const rowNumber = Number(payload.rowNumber || 0);
  if (!rowNumber || rowNumber < 2) throw new Error('ไม่พบ rowNumber สำหรับแก้ไข');
  const qty = validateDamagePayload_(payload);

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);
  const unitCost = lookupUnitCost_(payload.itemCode);
  const newImageCells = [
    payload.imageBarcode ? imageCell_(saveImage_(payload.imageBarcode, 'รูปภาพ 1').url, 'เปิดรูป 1') : null,
    payload.imageProduct ? imageCell_(saveImage_(payload.imageProduct, 'รูปภาพ2').url, 'เปิดรูป 2') : null,
    payload.imageExpiry ? imageCell_(saveImage_(payload.imageExpiry, 'รูปภาพ3').url, 'เปิดรูป 3') : null
  ];

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    assertValidRow_(sheet, rowNumber);
    const currentRange = sheet.getRange(rowNumber, 1, 1, API_HEADERS.length);
    const currentValues = currentRange.getValues()[0];
    const currentDisplay = currentRange.getDisplayValues()[0];
    const currentFormulas = currentRange.getFormulas()[0];
    const imageCells = [5, 6, 7].map((colIndex, i) => {
      if (newImageCells[i] !== null) return newImageCells[i];
      return currentFormulas[colIndex] || currentDisplay[colIndex] || '';
    });
    const values = buildDamageRowValues_(payload, currentValues[0] || new Date(), imageCells, unitCost, qty);

    setDamageRow_(sheet, rowNumber, values);
    SpreadsheetApp.flush();

    return {
      message: 'แก้ไขสำเร็จที่แถว ' + rowNumber,
      rowNumber,
      record: readRecordAtRow_(sheet, rowNumber),
      latest: getLatestRecordsApi_(8).records
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteDamageApi_(payload) {
  ensureDamageSheet_();
  payload = payload || {};
  const rowNumber = Number(payload.rowNumber || 0);
  if (!rowNumber || rowNumber < 2) throw new Error('ไม่พบ rowNumber สำหรับลบ');

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    assertValidRow_(sheet, rowNumber);
    sheet.deleteRow(rowNumber);
    SpreadsheetApp.flush();
    return {
      message: 'ลบ Row ' + rowNumber + ' แล้ว',
      rowNumber,
      latest: getLatestRecordsApi_(8).records
    };
  } finally {
    lock.releaseLock();
  }
}

function validateDamagePayload_(payload) {
  const required = [
    ['bu', 'BU'],
    ['barcode', 'บาร์โค้ด'],
    ['itemCode', 'รหัสสินค้า'],
    ['itemName', 'ชื่อสินค้า'],
    ['damageType', 'ประเภทสินค้า'],
    ['damageDescription', 'ลักษณะสินค้า'],
    ['quantity', 'จำนวน'],
    ['unit', 'หน่วย']
  ];

  required.forEach(([key, label]) => {
    if (!String(payload[key] || '').trim()) {
      throw new Error('กรุณากรอก ' + label);
    }
  });

  if (String(payload.damageDescription || '').trim() === 'อื่น' && !String(payload.damageDescriptionOther || '').trim()) {
    throw new Error('กรุณาระบุรายละเอียดลักษณะสินค้า กรณีเลือก อื่น');
  }

  const qty = parseNumber_(payload.quantity);
  if (!isFinite(qty) || qty <= 0) {
    throw new Error('จำนวนต้องเป็นตัวเลขมากกว่า 0');
  }
  return qty;
}

function buildDamageRowValues_(payload, dateValue, imageCells, unitCost, qty) {
  const totalValue = unitCost > 0 ? unitCost * qty : '';
  const damageDescription = buildDamageDescription_(payload);
  const rowDate = dateValue || new Date();

  return [
    rowDate,
    safeText_(payload.bu),
    safeText_(payload.barcode),
    safeText_(payload.itemCode),
    safeText_(payload.itemName),
    imageCells[0] || '',
    imageCells[1] || '',
    imageCells[2] || '',
    safeText_(payload.damageType),
    safeText_(damageDescription),
    parseDateForSheet_(payload.expiryDate),
    safeText_(payload.damageGroup),
    safeText_(payload.boxNo),
    qty,
    safeText_(payload.unit),
    safeText_(payload.reportTime || Utilities.formatDate(new Date(), API_CONFIG.TZ, 'HH:mm')),
    safeText_(payload.shift),
    safeText_(payload.actor),
    safeText_(payload.employeeId),
    safeText_(payload.affiliation),
    safeText_(payload.note),
    safeText_(payload.accountGroup),
    unitCost || '',
    totalValue || '',
    deriveActorType_(payload.actor)
  ];
}

function setDamageRow_(sheet, rowNumber, values) {
  const range = sheet.getRange(rowNumber, 1, 1, API_HEADERS.length);
  range.setNumberFormats([[
    'dd/MM/yyyy', '@', '@', '@', '@', '@', '@', '@', '@', '@', 'dd/MM/yyyy',
    '@', '@', '0.###', '@', '@', '@', '@', '@', '@', '@', '@', '#,##0.00', '#,##0.00', '@'
  ]]);
  range.setValues([values]);
  range.setWrap(true).setVerticalAlignment('middle');
}

function readRecordAtRow_(sheet, rowNumber) {
  const range = sheet.getRange(rowNumber, 1, 1, API_HEADERS.length);
  return rowToRecord_(range.getDisplayValues()[0], rowNumber, range.getFormulas()[0]);
}

function assertValidRow_(sheet, rowNumber) {
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error('ไม่พบ Row ' + rowNumber);
  }
}

function findDuplicateDamage_(sheet, payload, excludeRowNumber) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const barcode = normalizeKey_(payload.barcode);
  const itemCode = normalizeKey_(payload.itemCode);
  const bu = normalizeSimple_(payload.bu);
  const qty = parseNumber_(payload.quantity);
  const todayMs = startOfDay_(new Date()).getTime();
  const scanRows = Math.min(API_CONFIG.DUPLICATE_SCAN_ROWS, lastRow - 1);
  const startRow = Math.max(2, lastRow - scanRows + 1);
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, API_HEADERS.length).getDisplayValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const rowNumber = startRow + i;
    if (rowNumber === Number(excludeRowNumber || 0)) continue;
    const r = rowToRecord_(values[i], rowNumber, []);
    const rowDate = parseDateForFilter_(r.date);
    if (!rowDate || startOfDay_(rowDate).getTime() !== todayMs) continue;
    if (bu && normalizeSimple_(r.bu) !== bu) continue;
    if (barcode && normalizeKey_(r.barcode) !== barcode) continue;
    if (itemCode && normalizeKey_(r.itemCode) !== itemCode) continue;
    if (qty > 0 && parseNumber_(r.quantity) !== qty) continue;
    return r;
  }

  return null;
}

function getLatestRecordsApi_(limit) {
  ensureDamageSheet_();
  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { records: [], total: 0, returned: 0 };
  }

  const totalRows = lastRow - 1;
  const isAll = String(limit || '').toUpperCase() === 'ALL' || Number(limit) <= 0;
  const rowLimit = isAll ? totalRows : Math.min(Number(limit || 20), totalRows);
  const startRow = Math.max(2, lastRow - rowLimit + 1);
  const numRows = lastRow - startRow + 1;
  const range = sheet.getRange(startRow, 1, numRows, API_HEADERS.length);
  const values = range.getDisplayValues();
  const formulas = range.getFormulas();
  const records = values.map((row, i) => rowToRecord_(row, startRow + i, formulas[i])).reverse();

  return { records, total: totalRows, returned: records.length };
}

function getDashboardRecordsApi_(options) {
  ensureDamageSheet_();
  options = options || {};

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { records: [], total: 0, returned: 0 };
  }

  const period = String(options.period || '30').toUpperCase();
  const bu = String(options.bu || 'ทั้งหมด');
  const damageType = String(options.damageType || options.type || 'ทั้งหมด');
  const shift = String(options.shift || 'ทั้งหมด');
  const damageGroup = String(options.damageGroup || 'ทั้งหมด');
  const query = normalizeKey_(options.query || '');
  const maxRows = period === 'ALL' ? Math.min(lastRow - 1, 12000) : Math.min(Number(options.maxRows || 2500), lastRow - 1);

  const startRow = Math.max(2, lastRow - maxRows + 1);
  const numRows = lastRow - startRow + 1;
  const range = sheet.getRange(startRow, 1, numRows, API_HEADERS.length);
  const values = range.getDisplayValues();
  const formulas = range.getFormulas();

  const today = startOfDay_(new Date());
  let startDate = parseDateForFilter_(options.startDate);
  let endDate = parseDateForFilter_(options.endDate);

  if (!startDate && period !== 'ALL' && period !== 'CUSTOM') {
    const days = Math.max(1, Number(period || 30));
    startDate = addDays_(today, -(days - 1));
  }
  if (!endDate && startDate) endDate = today;

  const startMs = startDate ? startOfDay_(startDate).getTime() : null;
  const endMs = endDate ? startOfDay_(endDate).getTime() : null;

  const records = [];
  for (let i = 0; i < values.length; i++) {
    const r = rowToRecord_(values[i], startRow + i, formulas[i]);
    const rowDate = parseDateForFilter_(r.date);

    if (startMs !== null || endMs !== null) {
      if (!rowDate) continue;
      const rowMs = startOfDay_(rowDate).getTime();
      if (startMs !== null && rowMs < startMs) continue;
      if (endMs !== null && rowMs > endMs) continue;
    }
    if (bu !== 'ทั้งหมด' && r.bu !== bu) continue;
    if (damageType !== 'ทั้งหมด' && r.damageType !== damageType) continue;
    if (shift !== 'ทั้งหมด' && normalizeSimple_(r.shift) !== normalizeSimple_(shift)) continue;
    if (damageGroup !== 'ทั้งหมด' && normalizeSimple_(r.damageGroup) !== normalizeSimple_(damageGroup)) continue;
    if (query) {
      const haystack = normalizeKey_([
        r.date, r.bu, r.barcode, r.itemCode, r.itemName, r.damageType, r.damageDescription,
        r.damageGroup, r.actor, r.employeeId, r.affiliation, r.note, r.actorType
      ].join(' '));
      if (haystack.indexOf(query) === -1) continue;
    }
    records.push(r);
  }

  records.reverse();
  return { records, total: lastRow - 1, returned: records.length };
}

function findProductsApi_(query) {
  const normalizedQuery = normalizeKey_(query);
  if (!normalizedQuery) return { products: [] };

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.PRODUCT_SHEET_NAME);
  if (!sheet) return { products: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { products: [] };

  // A:E = คลัง/BU, Barcode, Item Code, Item Name, Unit ตาม Code เดิม
  const values = sheet.getRange(2, 1, lastRow - 1, 5).getDisplayValues();
  const products = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const p = {
      warehouse: safeText_(row[0]),
      barcode: safeText_(row[1]),
      itemCode: safeText_(row[2]),
      itemName: safeText_(row[3]),
      unit: safeText_(row[4])
    };
    const haystack = normalizeKey_([p.warehouse, p.barcode, p.itemCode, p.itemName, p.unit].join(' '));
    if (haystack.indexOf(normalizedQuery) !== -1) products.push(p);
    if (products.length >= 30) break;
  }

  products.sort((a, b) => {
    const aExact = normalizeKey_(a.barcode) === normalizedQuery || normalizeKey_(a.itemCode) === normalizedQuery ? 0 : 1;
    const bExact = normalizeKey_(b.barcode) === normalizedQuery || normalizeKey_(b.itemCode) === normalizedQuery ? 0 : 1;
    return aExact - bExact;
  });

  return { products };
}

function findEmployeesApi_(query) {
  const normalizedQuery = normalizeKey_(query);
  const showAll = !normalizedQuery;

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.EMPLOYEE_SHEET_NAME);
  if (!sheet) return { employees: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { employees: [] };

  // A:G ตาม Code เดิม: B=ชื่อ, C=ชื่อเล่น, D=รหัสพนักงาน, E=สังกัด, F=ตำแหน่ง, G=ทีม
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
  const employees = [];
  const limit = showAll ? 60 : 30;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const e = {
      name: safeText_(row[1]),
      nickname: safeText_(row[2]),
      employeeId: safeText_(row[3]),
      affiliation: safeText_(row[4]),
      role: safeText_(row[5]),
      team: safeText_(row[6])
    };
    const haystack = normalizeKey_([e.name, e.nickname, e.employeeId, e.affiliation, e.role, e.team].join(' '));
    if (showAll || haystack.indexOf(normalizedQuery) !== -1) employees.push(e);
    if (employees.length >= limit) break;
  }

  return { employees };
}

function getCostPreviewApi_(itemCode, quantity) {
  const unitCost = lookupUnitCost_(itemCode);
  const qty = parseNumber_(quantity);
  return {
    itemCode: safeText_(itemCode),
    unitCost: unitCost || 0,
    quantity: qty || 0,
    totalValue: unitCost > 0 && qty > 0 ? unitCost * qty : 0,
    found: unitCost > 0
  };
}

function refreshCostValuesApi_() {
  ensureDamageSheet_();
  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { message: 'ไม่มีข้อมูลให้เติมย้อนหลัง' };

  const numRows = lastRow - 1;
  const itemCodes = sheet.getRange(2, 4, numRows, 1).getDisplayValues();
  const qtyValues = sheet.getRange(2, 14, numRows, 1).getDisplayValues();
  const output = [];
  let foundCost = 0;
  let calculated = 0;

  for (let i = 0; i < numRows; i++) {
    const unitCost = lookupUnitCost_(itemCodes[i][0]);
    const qty = parseNumber_(qtyValues[i][0]);
    const total = unitCost > 0 && qty > 0 ? unitCost * qty : '';
    if (unitCost > 0) foundCost++;
    if (total !== '') calculated++;
    output.push([unitCost || '', total || '']);
  }

  sheet.getRange(2, 23, numRows, 2).setNumberFormats(Array.from({ length: numRows }, () => ['#,##0.00', '#,##0.00']));
  sheet.getRange(2, 23, numRows, 2).setValues(output);
  SpreadsheetApp.flush();

  return {
    message: 'เติมมูลค่าย้อนหลังครบแล้ว',
    rows: numRows,
    foundCost,
    calculated,
    missingCost: numRows - foundCost
  };
}

function ensureDamageSheet_() {
  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(API_CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(API_CONFIG.SHEET_NAME);

  const headerRange = sheet.getRange(1, 1, 1, API_HEADERS.length);
  const currentHeader = headerRange.getDisplayValues()[0];
  const needsSync = API_HEADERS.some((h, i) => String(currentHeader[i] || '').trim() !== h);
  const isBlank = currentHeader.every(v => !String(v || '').trim());

  if (isBlank || needsSync) {
    headerRange.setValues([API_HEADERS]);
    headerRange.setFontWeight('bold').setBackground('#eff6ff').setVerticalAlignment('middle');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function rowToRecord_(row, rowNumber, formulas) {
  formulas = formulas || [];
  const record = {
    rowNumber,
    date: safeText_(row[0]),
    bu: safeText_(row[1]),
    barcode: safeText_(row[2]),
    itemCode: safeText_(row[3]),
    itemName: safeText_(row[4]),
    image1: imageInfoFromCell_(row[5], formulas[5], 'รูปภาพ 1'),
    image2: imageInfoFromCell_(row[6], formulas[6], 'รูปภาพ2'),
    image3: imageInfoFromCell_(row[7], formulas[7], 'รูปภาพ3'),
    damageType: safeText_(row[8]),
    damageDescription: safeText_(row[9]),
    expiryDate: safeText_(row[10]),
    damageGroup: safeText_(row[11]),
    boxNo: safeText_(row[12]),
    quantity: safeText_(row[13]),
    unit: safeText_(row[14]),
    reportTime: safeText_(row[15]),
    shift: safeText_(row[16]),
    actor: safeText_(row[17]),
    employeeId: safeText_(row[18]),
    affiliation: safeText_(row[19]),
    note: safeText_(row[20]),
    accountGroup: safeText_(row[21]),
    unitCost: safeText_(row[22]),
    totalValue: safeText_(row[23]),
    actorType: safeText_(row[24])
  };
  return record;
}

function imageInfoFromCell_(displayValue, formula, label) {
  const url = extractUrlFromCell_(displayValue, formula);
  const fileId = extractDriveFileId_(url);
  const previewUrl = fileId ? 'https://drive.google.com/uc?export=view&id=' + fileId : url;
  return {
    label,
    url,
    previewUrl,
    fileId,
    hasImage: !!url
  };
}

function extractUrlFromCell_(displayValue, formula) {
  const text = String(formula || displayValue || '').trim();
  if (!text) return '';
  const hyperlink = text.match(/=HYPERLINK\(\s*"([^"]+)"/i);
  if (hyperlink) return hyperlink[1];
  const image = text.match(/=IMAGE\(\s*"([^"]+)"/i);
  if (image) return image[1];
  const url = text.match(/https?:\/\/[^\s")]+/i);
  return url ? url[0] : '';
}

function extractDriveFileId_(url) {
  const text = String(url || '');
  const byPath = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath) return byPath[1];
  const byId = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byId) return byId[1];
  return '';
}

function saveImage_(image, label) {
  if (!image) return { url: '' };

  let dataUrl = '';
  let fileName = '';
  if (typeof image === 'string') {
    dataUrl = image;
    fileName = label + '_' + Date.now() + '.jpg';
  } else {
    dataUrl = image.dataUrl || image.base64 || '';
    fileName = image.name || image.fileName || (label + '_' + Date.now() + '.jpg');
  }

  if (!dataUrl || dataUrl.indexOf('base64,') === -1) return { url: '' };

  const parts = dataUrl.split('base64,');
  const mime = (parts[0].match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
  if (!/^image\//i.test(mime)) {
    throw new Error(label + ' ต้องเป็นไฟล์รูปภาพเท่านั้น');
  }
  const bytes = Utilities.base64Decode(parts[1]);
  if (bytes.length > API_CONFIG.MAX_IMAGE_BYTES) {
    throw new Error(label + ' ใหญ่เกิน ' + Math.round(API_CONFIG.MAX_IMAGE_BYTES / 1024 / 1024 * 10) / 10 + ' MB');
  }
  const safeName = String(fileName || label + '_' + Date.now() + '.jpg').replace(/[\\/:*?"<>|]/g, '_');
  const blob = Utilities.newBlob(bytes, mime, safeName);
  const folder = getOrCreateFolder_(API_CONFIG.IMAGE_FOLDER_NAME);
  const file = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // บางองค์กรอาจไม่อนุญาตแชร์ public ให้ข้ามได้ แต่ยังเก็บไฟล์ใน Drive ได้
  }

  return { url: file.getUrl(), id: file.getId(), name: file.getName() };
}

function imageCell_(url, label) {
  if (!url) return '';
  const cleanUrl = String(url).replace(/"/g, '');
  if (API_CONFIG.IMAGE_CELL_MODE === 'IMAGE') {
    return '=IMAGE("' + cleanUrl + '",4,80,80)';
  }
  return '=HYPERLINK("' + cleanUrl + '","' + label + '")';
}

function getOrCreateFolder_(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

function lookupUnitCost_(itemCode) {
  const key = normalizeKey_(itemCode);
  if (!key) return 0;

  const cache = CacheService.getScriptCache();
  const cacheKey = 'unitCost_' + key;
  const cached = cache.get(cacheKey);
  if (cached !== null) return Number(cached) || 0;

  const ss = SpreadsheetApp.openById(API_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(API_CONFIG.COST_SHEET_NAME);
  if (!sheet) return 0;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  // A:D ตาม Code เดิม และราคาทุนอยู่คอลัมน์ D
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const unitCost = parseMoney_(row[3]);
    const candidateKeys = [row[0], row[1], row[2]].map(normalizeKey_);
    if (candidateKeys.indexOf(key) !== -1) {
      cache.put(cacheKey, String(unitCost || 0), 3600);
      return unitCost || 0;
    }
  }

  cache.put(cacheKey, '0', 600);
  return 0;
}

function parseMoney_(value) {
  const text = String(value || '').replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
  const num = Number(text);
  return isFinite(num) ? num : 0;
}

function parseNumber_(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  const text = String(value || '').replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
  const num = Number(text);
  return isFinite(num) ? num : 0;
}

function buildDamageDescription_(payload) {
  const main = safeText_(payload && payload.damageDescription);
  const other = safeText_(payload && payload.damageDescriptionOther);
  if (main === 'อื่น' && other) return 'อื่น: ' + other;
  return main;
}

function deriveActorType_(actor) {
  const text = safeText_(actor);
  if (!text || text === '-' || text.indexOf('ไม่ทราบ') !== -1 || text.indexOf('ไม่พบ') !== -1) return 'ไม่พบผู้กระทำ';
  return 'พบผู้กระทำ';
}

function safeText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeKey_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\u200B\u200C\u200D]+/g, '')
    .trim();
}

function normalizeSimple_(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseDateForSheet_(value) {
  const d = parseDateForFilter_(value);
  return d || '';
}

function parseDateForFilter_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;

  const text = String(value || '').trim();
  if (!text) return null;

  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543;
    return new Date(y, Number(m[2]) - 1, Number(m[3]));
  }

  m = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }

  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays_(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay_(d);
}
