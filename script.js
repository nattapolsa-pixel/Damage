const DEFAULT_CONFIG = {
  apiUrl: '',
  apiProxyUrl: '',
  apiToken: '',
  appName: 'Damage 2026 Form',
  maxImageWidth: 1280,
  imageQuality: 0.78,
  maxSourceImageBytes: 12000000,
  maxImageBytes: 1600000,
  options: {
    bu: ['DM02', 'DP02', 'DG02', '1115', 'DCWN', 'DS02', 'DO02'],
    damageTypes: ['สินค้าชำรุด', 'สินค้าแตกแพค', 'สินค้าหมดอายุ'],
    damageDescriptions: [
      'สินค้าบุบเสียหาย',
      'สินค้ามีรอยคัตเตอร์',
      'สินค้าห่อแฟ่บ',
      'สินค้าฉีกขาด',
      'สินค้ามีสิ่งปนเปื้อน ส่งกลิ่น',
      'สินค้าแตก หักเสียหาย',
      'สินค้ารั่วซึม',
      'อื่น'
    ],
    damageGroups: ['OPT', 'SUP', 'Out bound'],
    accountGroups: ['สินค้ารอทำลายได้', 'สินค้ารอทำลายไม่ได้'],
    shifts: ['A', 'B'],
    affiliations: ['PTG', 'Man Power', '40HRS', 'BU']
  }
};

const state = {
  config: DEFAULT_CONFIG,
  options: DEFAULT_CONFIG.options,
  latest: [],
  latestFiltered: [],
  latestPage: 1,
  latestLoadedAll: false,
  imageDataCache: {},
  imageLoadRun: 0,
  dashboardRecords: [],
  images: {
    imageBarcode: '',
    imageProduct: '',
    imageExpiry: ''
  },
  editingRowNumber: null,
  editingRecord: null,
  productSearchTimer: null,
  dashboardTimer: null,
  costTimer: null,
  toastTimer: null,
  chartMonthly: null,
  chartType: null,
  chartMonthlyTrend: null,
  trendMode: 'qty',
  dashboardRaw: [],
  dashFilters: { bu: [], damageType: [], shift: [], damageGroup: [] },
  loadingCount: 0
};

const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  if ($('debugVersion')) {
    $('debugVersion').textContent = '(Scanner: v2.4 - Working ZXing flow)';
  }
  bindTabs();
  bindForm();
  bindImages();
  bindDashboard();
  bindLatest();
  bindRecordActions();
  bindFormEnhancements();
  setupBudget();

  await loadConfig();
  applyApiStatus();
  fillOptions(state.options);
  setTodayTime();

  if (hasApiConfigured()) {
    loading(true);
    try {
      await Promise.all([
        loadAppData(),
        refreshLatest(),
        refreshDashboard()
      ]);
    } finally {
      loading(false);
    }
  } else {
    renderLatest([]);
    renderDashboard([]);
  }
}

async function loadConfig() {
  try {
    const res = await fetch('config.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('ไม่พบ config.json');
    const fileConfig = await res.json();
    state.config = mergeDeep(DEFAULT_CONFIG, fileConfig || {});
    state.options = state.config.options || DEFAULT_CONFIG.options;
  } catch (err) {
    state.config = DEFAULT_CONFIG;
    state.options = DEFAULT_CONFIG.options;
  }
}

function mergeDeep(base, override) {
  const out = { ...base };
  Object.keys(override || {}).forEach((key) => {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      out[key] = mergeDeep(base[key] || {}, override[key]);
    } else {
      out[key] = override[key];
    }
  });
  return out;
}

function hasApiUrl() {
  const url = String(state.config.apiUrl || '').trim();
  return !!url && url.includes('/exec') && !url.includes('PASTE_');
}

function hasProxyUrl() {
  return !!String(state.config.apiProxyUrl || '').trim();
}

function hasApiConfigured() {
  return hasApiUrl() || hasProxyUrl();
}

function applyApiStatus() {
  const warning = $('apiWarning');
  const apiStatus = $('apiStatus');
  if (!hasApiConfigured()) {
    warning.classList.remove('hidden');
    apiStatus.textContent = 'ยังไม่ได้ตั้งค่า API URL หรือ Proxy';
    apiStatus.style.color = '#92400e';
    return;
  }
  warning.classList.add('hidden');
  apiStatus.textContent = hasProxyUrl() ? 'พร้อมเชื่อมต่อผ่าน Proxy / Apps Script API' : 'พร้อมเชื่อมต่อ Apps Script API';
  apiStatus.style.color = '#166534';
}

async function loadAppData() {
  try {
    const res = await apiGet('getAppData');
    const data = unwrapApi(res);
    if (data.options) {
      state.options = mergeDeep(DEFAULT_CONFIG.options, data.options);
      fillOptions(state.options);
    }
    if (data.today || data.timeNow) setTodayTime(data.today, data.timeNow);
    if (Array.isArray(data.latest)) {
      state.latest = data.latest;
      renderLatest(state.latest);
    }
    toast('โหลดข้อมูลตั้งต้นเรียบร้อย', 'ok');
  } catch (err) {
    toast(err.message || 'โหลดข้อมูลตั้งต้นไม่สำเร็จ', 'bad');
  }
}

function unwrapApi(res) {
  if (!res) throw new Error('ไม่มีข้อมูลตอบกลับจาก API');
  if (res.ok === false) throw new Error(res.error || 'API Error');
  return res.data || res;
}

function fillOptions(options) {
  fillSelect('bu', options.bu, 'เลือก BU');
  fillSelect('damageType', options.damageTypes, 'เลือกประเภทสินค้า');
  fillSelect('damageDescription', options.damageDescriptions, 'เลือกลักษณะสินค้า');
  fillSelect('damageGroup', options.damageGroups, 'เลือกกลุ่มเสียหาย');
  fillSelect('accountGroup', options.accountGroups, 'เลือกกลุ่มบัญชี');
  fillSelect('shift', options.shifts, 'เลือกกะ');
  fillSelect('affiliation', options.affiliations, 'เลือกสังกัด');

  buildMultiSelect('dashBu', 'bu', options.bu || []);
  buildMultiSelect('dashDamageType', 'damageType', options.damageTypes || []);
  buildMultiSelect('dashShift', 'shift', options.shifts || []);
  buildMultiSelect('dashDamageGroup', 'damageGroup', options.damageGroups || []);
}

function fillSelect(id, items, blankLabel) {
  const el = $(id);
  if (!el) return;
  const current = el.value;
  const rows = [];
  if (blankLabel !== null) rows.push(`<option value="">${esc(blankLabel || 'เลือก')}</option>`);
  (items || []).forEach((item) => rows.push(`<option value="${escAttr(item)}">${esc(item)}</option>`));
  el.innerHTML = rows.join('');
  if (current && [...el.options].some((opt) => opt.value === current)) el.value = current;
}

function setTodayTime(today, timeNow) {
  const d = today || localDateInputValue(new Date());
  let t = timeNow || localTimeInputValue(new Date());
  if (t) {
    const match = t.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      t = `${match[1]}:${match[2]} น.`;
    } else if (!t.endsWith(' น.')) {
      t = t + ' น.';
    }
  }
  $('todayText').textContent = displayDate(d);
  $('reportTime').value = t;
  if ($('dateView')) $('dateView').value = displayDate(d);
  if ($('timeText')) $('timeText').textContent = t;
  updateSummary();
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
}

function showPage(pageId) {
  document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageId));
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === pageId));
  if (pageId === 'latestPage' && hasApiConfigured()) refreshLatest();
  if (pageId === 'dashboardPage' && hasApiConfigured()) refreshDashboard();
}

function bindForm() {
  $('damageForm').addEventListener('submit', submitDamage);
  $('btnReset').addEventListener('click', () => resetForm());
  $('btnCancelEdit').addEventListener('click', () => resetForm());
  $('btnSearchProduct').addEventListener('click', () => searchProduct(true));
  $('btnSearchEmployee').addEventListener('click', () => searchEmployee(true));
  $('damageDescription').addEventListener('change', toggleOtherDamage);

  ['barcode', 'itemCode', 'itemName'].forEach((id) => {
    $(id).addEventListener('input', () => {
      clearTimeout(state.productSearchTimer);
      state.productSearchTimer = setTimeout(() => searchProduct(false), 420);
    });
  });

  ['itemCode', 'quantity'].forEach((id) => {
    $(id).addEventListener('input', scheduleCostPreview);
    $(id).addEventListener('blur', updateCostPreview);
  });

  ['actor', 'employeeId'].forEach((id) => {
    $(id).addEventListener('input', debounce(() => searchEmployee(false), 520));
  });

  $('reportTime').addEventListener('blur', (e) => {
    let val = e.target.value.trim();
    if (!val) return;
    let m = val.match(/^(\d{1,2})(\d{2})$/);
    if (m) {
      val = `${m[1]}:${m[2]}`;
    }
    m = val.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      val = `${m[1]}:${m[2]} น.`;
    }
    if (val && !val.endsWith(' น.')) {
      val = val + ' น.';
    }
    e.target.value = val;
    updateSummary();
  });
}

function bindFormEnhancements() {
  const barcodeFile = $('barcodeScanFile');
  const scanButtons = [$('btnScanBarcode'), $('mobileScanButton')].filter(Boolean);
  scanButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (barcodeFile) {
        barcodeFile.value = '';
        barcodeFile.click();
      }
    });
  });
  if (barcodeFile) {
    barcodeFile.addEventListener('change', async () => {
      const file = barcodeFile.files && barcodeFile.files[0];
      if (!file) return;
      try {
        loading(true);
        setScanHint('กำลังอ่าน Barcode จากรูป...', '');
        toast('กำลังประมวลผลรูปภาพและอ่านบาร์โค้ด...', 'info');
        const code = await scanBarcodeFromFile(file);
        if (code) {
          setScanHint('อ่าน Barcode ได้: ' + code, 'good');
          await searchProductAfterScan(code);
        }
      } catch (err) {
        setScanHint(err.message || 'อ่าน Barcode ไม่สำเร็จ ลองถ่ายให้ Barcode ชัด เต็มกรอบ และไม่เอียงมาก', 'warn');
        toast(err.message || 'ไม่สามารถสแกนบาร์โค้ดได้', 'bad');
      } finally {
        barcodeFile.value = '';
        loading(false);
      }
    });
  }

  const mobileSave = $('mobileSaveButton');
  if (mobileSave) {
    mobileSave.addEventListener('click', () => {
      $('damageForm').requestSubmit();
    });
  }

  document.querySelectorAll('[data-set-field]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.setField;
      const value = btn.dataset.setValue || '';
      const el = $(id);
      if (!el) return;
      if (el.tagName === 'SELECT') ensureSelectValue(id, value);
      else setValue(id, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      updateSummary();
    });
  });

  document.querySelectorAll('#damageForm input, #damageForm select, #damageForm textarea').forEach((el) => {
    el.addEventListener('input', updateSummary);
    el.addEventListener('change', updateSummary);
  });
}

async function scanBarcodeFromFile(file) {
  const native = await scanWithNativeBarcodeDetector(file);
  if (native) return native;

  const zxing = await scanWithZxing(file);
  if (zxing) return zxing;

  const variants = await buildBarcodeImageVariants(file);
  for (const variant of variants) {
    const nativeTry = await scanWithNativeBarcodeDetector(variant);
    if (nativeTry) return nativeTry;

    const zxingTry = await scanWithZxing(variant);
    if (zxingTry) return zxingTry;
  }

  throw new Error('อ่าน Barcode ไม่สำเร็จ ลองถ่ายให้ Barcode ชัด เต็มกรอบ และไม่เอียงมาก');
}

function normalizeScannedBarcode(value) {
  const text = String(value || '').trim().replace(/[\s\-]/g, '');
  if (/^[0-9A-Za-z]{4,40}$/.test(text)) return text;
  return '';
}

async function scanWithNativeBarcodeDetector(file) {
  if (!('BarcodeDetector' in window) || typeof createImageBitmap === 'undefined') return '';
  let bitmap = null;
  try {
    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf']
    });
    bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    return normalizeScannedBarcode(codes && codes[0] && codes[0].rawValue);
  } catch (err) {
    return '';
  } finally {
    try {
      if (bitmap && bitmap.close) bitmap.close();
    } catch (err) {}
  }
}

async function scanWithZxing(file) {
  if (typeof ZXing === 'undefined' || !ZXing.BrowserMultiFormatReader) return '';
  let url = '';
  try {
    url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const hints = new Map();
    if (ZXing.DecodeHintType && ZXing.BarcodeFormat) {
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.CODE_93,
        ZXing.BarcodeFormat.ITF
      ].filter(Boolean));
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    }

    const reader = new ZXing.BrowserMultiFormatReader(hints, 500);
    const result = await reader.decodeFromImageElement(img);
    try {
      reader.reset();
    } catch (err) {}
    return normalizeScannedBarcode(result && (result.text || (typeof result.getText === 'function' ? result.getText() : '')));
  } catch (err) {
    return '';
  } finally {
    try {
      if (url) URL.revokeObjectURL(url);
    } catch (err) {}
  }
}

async function buildBarcodeImageVariants(file) {
  const img = await fileToImage(file);
  if (!img) return [];
  const rects = [
    { x: 0.00, y: 0.32, w: 1.00, h: 0.48 },
    { x: 0.04, y: 0.38, w: 0.92, h: 0.36 },
    { x: 0.08, y: 0.42, w: 0.84, h: 0.30 },
    { x: 0.00, y: 0.45, w: 1.00, h: 0.42 }
  ];
  const out = [];
  for (const rect of rects) {
    const blob = await cropImageToBlob(img, rect);
    if (blob) out.push(blob);
  }
  return out;
}

function fileToImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function cropImageToBlob(img, rect) {
  return new Promise((resolve) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return resolve(null);

    const sx = Math.max(0, Math.round(w * rect.x));
    const sy = Math.max(0, Math.round(h * rect.y));
    const sw = Math.min(w - sx, Math.round(w * rect.w));
    const sh = Math.min(h - sy, Math.round(h * rect.h));
    const scale = Math.min(2, 1800 / Math.max(sw, sh));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    if (!ctx) return resolve(null);

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const v = avg > 138 ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      ctx.putImageData(imageData, 0, 0);
    } catch (err) {}

    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
  });
}

function setScanHint(message, type) {
  const el = $('barcodeScanHint');
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('good', 'warn');
  if (type) el.classList.add(type);
}

async function searchProductAfterScan(scannedBarcode) {
  const cleanBarcode = normalizeScannedBarcode(scannedBarcode) || scannedBarcode;
  setValue('barcode', cleanBarcode);
  const barcodeEl = $('barcode');
  barcodeEl.dispatchEvent(new Event('input', { bubbles: true }));
  barcodeEl.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    barcodeEl.focus({ preventScroll: true });
  } catch (err) {
    barcodeEl.focus();
  }

  if (!hasApiConfigured()) {
    toast(`อ่านบาร์โค้ดได้เลข: ${cleanBarcode}`, 'ok');
    return;
  }

  try {
    loading(true);
    const res = await apiGet('findProducts', { query: cleanBarcode });
    const data = unwrapApi(res);
    const products = data.products || [];
    if (products.length === 1) {
      applyProduct(products[0]);
      toast(`สแกนพบสินค้า: ${products[0].itemName}`, 'ok');
    } else if (products.length > 1) {
      renderProductResults(products);
      toast(`พบสินค้า ${products.length} รายการ กรุณาเลือกรายการที่ถูกต้อง`, 'info');
    } else {
      toast(`สแกนได้เลข ${cleanBarcode} แต่ไม่พบสินค้านี้ในระบบ`, 'warn');
    }
  } catch (err) {
    toast(`สแกนได้เลข ${cleanBarcode} แต่ค้นหาล้มเหลว: ` + err.message, 'warn');
  } finally {
    loading(false);
  }
}

function bindImages() {
  const map = [
    ['imageBarcode', 'previewBarcode'],
    ['imageProduct', 'previewProduct'],
    ['imageExpiry', 'previewExpiry']
  ];
  map.forEach(([inputId, previewId]) => {
    const input = $(inputId);
    const preview = $(previewId);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) {
        state.images[inputId] = '';
        preview.src = BLANK_GIF;
        preview.parentElement.classList.remove('has-image');
        return;
      }
      try {
        loading(true);
        if (file.size > Number(state.config.maxSourceImageBytes || 0)) {
          throw new Error('ไฟล์ต้นฉบับใหญ่เกิน ' + formatBytes(state.config.maxSourceImageBytes));
        }
        const dataUrl = await compressImageForUpload(file);
        state.images[inputId] = { dataUrl, name: file.name };
        preview.src = dataUrl;
        preview.parentElement.classList.add('has-image');
      } catch (err) {
        toast('อ่านรูปภาพไม่สำเร็จ: ' + err.message, 'bad');
      } finally {
        loading(false);
      }
    });
  });
}

function bindLatest() {
  $('btnRefreshLatest').addEventListener('click', () => refreshLatest());
  $('btnBackToForm').addEventListener('click', () => showPage('formPage'));
  $('btnLoadAllLatest').addEventListener('click', () => refreshLatest('ALL'));
  $('btnLatestSearch').addEventListener('click', () => {
    $('latestSearch').value = '';
    state.latestPage = 1;
    renderLatest(state.latest);
  });
  $('latestSearch').addEventListener('input', debounce(() => {
    state.latestPage = 1;
    renderLatest(state.latest);
  }, 250));
  $('latestPageSize').addEventListener('change', () => {
    state.latestPage = 1;
    renderLatest(state.latest);
  });
  $('btnLatestPrev').addEventListener('click', () => {
    if (state.latestPage > 1) {
      state.latestPage -= 1;
      renderLatest(state.latest);
    }
  });
  $('btnLatestNext').addEventListener('click', () => {
    const totalPages = latestTotalPages();
    if (state.latestPage < totalPages) {
      state.latestPage += 1;
      renderLatest(state.latest);
    }
  });
  if ($('btnExportLatestExcel')) {
    $('btnExportLatestExcel').addEventListener('click', () => {
      exportToExcel(state.latestFiltered, 'Damage_Latest_Detailed_Data');
    });
  }
}

function bindDashboard() {
  $('btnRefreshDashboard').addEventListener('click', refreshDashboard);
  if ($('trendModeQty')) $('trendModeQty').addEventListener('click', () => setTrendMode('qty'));
  if ($('trendModeVal')) $('trendModeVal').addEventListener('click', () => setTrendMode('val'));
  document.addEventListener('click', () => { document.querySelectorAll('.ms-panel').forEach((p) => p.classList.add('hidden')); });
  // Trigger update when user presses Enter in search or date inputs
  ['dashQuery', 'dashStartDate', 'dashEndDate'].forEach((id) => {
    if ($(id)) {
      $(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          refreshDashboard();
        }
      });
    }
  });

  if ($('btnExportDashboardImg')) $('btnExportDashboardImg').addEventListener('click', exportFullDashboardImage);
  if ($('btnExportDashboardPdf')) $('btnExportDashboardPdf').addEventListener('click', exportDashboardToPDF);
  if ($('btnExportDashboardPrint')) {
    $('btnExportDashboardPrint').addEventListener('click', () => {
      window.print();
    });
  }
  if ($('btnExportDashboardExcel')) {
    $('btnExportDashboardExcel').addEventListener('click', () => {
      const bu = (state.dashFilters.bu && state.dashFilters.bu.length) ? state.dashFilters.bu.join('-') : 'all';
      const period = val('dashPeriod') || '30';
      exportToExcel(state.dashboardRecords, `Damage_Dashboard_Data_${bu}_${period}d`);
    });
  }
}

function bindRecordActions() {
  ['latestList', 'latestRows', 'latestCards', 'dashboardRows'].forEach((id) => {
    $(id).addEventListener('click', (event) => {
      const btn = event.target.closest('[data-record-action]');
      if (!btn) return;
      const rowNumber = Number(btn.dataset.rowNumber || 0);
      if (btn.dataset.recordAction === 'edit') editRecord(rowNumber);
      if (btn.dataset.recordAction === 'delete') deleteRecord(rowNumber);
    });
  });
}

async function submitDamage(event) {
  event.preventDefault();
  if (!hasApiConfigured()) {
    toast('กรุณาใส่ API URL หรือ Proxy URL ใน config.json ก่อน', 'warn');
    return;
  }

  const payload = collectPayload();
  const missing = validatePayload(payload);
  if (missing.length) {
    toast('กรุณากรอก: ' + missing.join(', '), 'warn');
    return;
  }

  $('btnSave').disabled = true;
  loading(true);
  try {
    const action = state.editingRowNumber ? 'updateDamage' : 'saveDamage';
    if (state.editingRowNumber) {
      payload.rowNumber = state.editingRowNumber;
      payload.keepExistingImages = true;
    }
    const data = await submitDamagePayload(action, payload);
    toast(data.message || (state.editingRowNumber ? 'แก้ไขสำเร็จ' : 'บันทึกสำเร็จ'), 'ok');
    if (Array.isArray(data.latest)) {
      state.latest = data.latest;
      renderLatest(state.latest);
      resetForm(true);
      await refreshDashboard();
    } else {
      resetForm(true);
      await Promise.all([
        refreshLatest(),
        refreshDashboard()
      ]);
    }
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'bad');
  } finally {
    $('btnSave').disabled = false;
    loading(false);
  }
}

async function submitDamagePayload(action, payload) {
  try {
    const res = await apiPost(action, payload);
    return unwrapApi(res);
  } catch (err) {
    const message = err.message || String(err);
    if (!state.editingRowNumber && message.startsWith('DUPLICATE:')) {
      const confirmMessage = message.replace(/^DUPLICATE:\s*/, '') + '\n\nต้องการบันทึกซ้ำหรือไม่?';
      if (window.confirm(confirmMessage)) {
        const retryPayload = { ...payload, allowDuplicate: true };
        const res = await apiPost(action, retryPayload);
        return unwrapApi(res);
      }
    }
    throw err;
  }
}

function collectPayload() {
  return {
    bu: val('bu'),
    barcode: val('barcode'),
    itemCode: val('itemCode'),
    itemName: val('itemName'),
    imageBarcode: state.images.imageBarcode,
    imageProduct: state.images.imageProduct,
    imageExpiry: state.images.imageExpiry,
    damageType: val('damageType'),
    damageDescription: val('damageDescription'),
    damageDescriptionOther: val('damageDescriptionOther'),
    expiryDate: val('expiryDate'),
    damageGroup: val('damageGroup'),
    boxNo: val('boxNo'),
    quantity: val('quantity'),
    unit: val('unit'),
    reportTime: val('reportTime'),
    shift: val('shift'),
    actor: val('actor'),
    employeeId: val('employeeId'),
    affiliation: val('affiliation'),
    note: val('note'),
    accountGroup: val('accountGroup')
  };
}

function validatePayload(payload) {
  const checks = [
    ['bu', 'BU'],
    ['barcode', 'บาร์โค้ด'],
    ['itemCode', 'รหัสสินค้า'],
    ['itemName', 'ชื่อสินค้า'],
    ['damageType', 'ประเภทสินค้า'],
    ['damageDescription', 'ลักษณะสินค้า'],
    ['quantity', 'จำนวน'],
    ['unit', 'หน่วย']
  ];
  const missing = checks.filter(([key]) => !String(payload[key] || '').trim()).map(([, label]) => label);
  if (payload.damageDescription === 'อื่น' && !payload.damageDescriptionOther) missing.push('รายละเอียดลักษณะสินค้าอื่น ๆ');
  if (Number(payload.quantity) <= 0) missing.push('จำนวนมากกว่า 0');
  return missing;
}

function toggleOtherDamage() {
  const isOther = val('damageDescription') === 'อื่น';
  $('otherDamageWrap').classList.toggle('hidden', !isOther);
  if (!isOther) $('damageDescriptionOther').value = '';
}

async function searchProduct(force) {
  if (!hasApiConfigured()) return;
  const query = val('barcode') || val('itemCode') || val('itemName');
  if (!force && normalize(query).length < 4) return;
  if (!query) {
    renderProductResults([]);
    return;
  }
  try {
    const res = await apiGet('findProducts', { query });
    const data = unwrapApi(res);
    renderProductResults(data.products || []);
    if ((data.products || []).length === 1 && !force) applyProduct(data.products[0]);
  } catch (err) {
    if (force) toast('ค้นหาสินค้าไม่สำเร็จ: ' + err.message, 'bad');
  }
}

function renderProductResults(products) {
  const box = $('productResults');
  if (!products.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = products.map((p, i) => `
    <button type="button" class="result-item" data-product-index="${i}">
      <div>
        <b>${esc(p.itemName || '-')}</b>
        <span>Barcode: ${esc(p.barcode || '-')} • Item: ${esc(p.itemCode || '-')} • Unit: ${esc(p.unit || '-')}</span>
      </div>
      <span class="pill blue">${esc(p.warehouse || 'สินค้า')}</span>
    </button>
  `).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('[data-product-index]').forEach((btn) => {
    btn.addEventListener('click', () => applyProduct(products[Number(btn.dataset.productIndex)]));
  });
}

function applyProduct(p) {
  if (!p) return;
  setValue('barcode', p.barcode);
  setValue('itemCode', p.itemCode);
  setValue('itemName', p.itemName);
  setValue('unit', p.unit);
  if (p.warehouse && !val('bu')) setValue('bu', p.warehouse);
  $('productResults').classList.add('hidden');
  updateCostPreview();
}

async function searchEmployee(force) {
  if (!hasApiConfigured()) return;
  const query = val('actor') || val('employeeId');
  if (!force && normalize(query).length < 2) return;
  try {
    const res = await apiGet('findEmployees', { query });
    const data = unwrapApi(res);
    renderEmployeeResults(data.employees || []);
  } catch (err) {
    if (force) toast('ค้นหาพนักงานไม่สำเร็จ: ' + err.message, 'bad');
  }
}

function renderEmployeeResults(employees) {
  const box = $('employeeResults');
  if (!employees.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = employees.map((e, i) => `
    <button type="button" class="result-item" data-employee-index="${i}">
      <div>
        <b>${esc(e.name || e.nickname || '-')}</b>
        <span>ชื่อเล่น: ${esc(e.nickname || '-')} • รหัส: ${esc(e.employeeId || '-')} • ${esc(e.role || '')} ${esc(e.team || '')}</span>
      </div>
      <span class="pill ok">${esc(e.affiliation || 'สังกัด')}</span>
    </button>
  `).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('[data-employee-index]').forEach((btn) => {
    btn.addEventListener('click', () => applyEmployee(employees[Number(btn.dataset.employeeIndex)]));
  });
}

function applyEmployee(e) {
  if (!e) return;
  setValue('actor', e.name || e.nickname || '');
  setValue('employeeId', e.employeeId || '');
  ensureSelectValue('affiliation', e.affiliation || '');
  $('employeeResults').classList.add('hidden');
}

function scheduleCostPreview() {
  clearTimeout(state.costTimer);
  state.costTimer = setTimeout(updateCostPreview, 420);
}

async function updateCostPreview() {
  const itemCode = val('itemCode');
  const quantity = val('quantity');
  if (!hasApiConfigured() || !itemCode) {
    setCostPreview(0, 0, false);
    return;
  }
  try {
    const res = await apiGet('getCostPreview', { itemCode, quantity });
    const data = unwrapApi(res);
    setCostPreview(data.unitCost, data.totalValue, data.found);
  } catch (err) {
    setCostPreview(0, 0, false);
  }
}

function setCostPreview(unitCost, totalValue, found) {
  $('unitCostText').textContent = found ? money(unitCost) : '-';
  $('totalValueText').textContent = found ? money(totalValue) : '-';
  $('costHint').textContent = found ? 'พบราคาทุนจากชีต ราคาทุน' : 'ยังไม่พบราคาทุน หรือยังไม่ได้กรอกรหัสสินค้า';
  updateSummary();
}

function updateSummary() {
  setText('sumBu', val('bu') || '-');
  setText('sumBarcode', val('barcode') || '-');
  setText('sumItem', val('itemName') || val('itemCode') || '-');
  setText('sumDamage', val('damageType') || '-');
  setText('sumDamageDescription', val('damageDescription') === 'อื่น'
    ? ('อื่น: ' + (val('damageDescriptionOther') || '-'))
    : (val('damageDescription') || '-'));
  setText('sumAccountGroup', val('accountGroup') || '-');
  setText('sumUnitCost', $('unitCostText') ? $('unitCostText').textContent : '-');
  setText('sumTotalValue', $('totalValueText') ? $('totalValueText').textContent : '-');
  setText('sumQty', val('quantity') ? `${val('quantity')} ${val('unit') || ''}`.trim() : '-');
  setText('sumShift', val('shift') || '-');
  setText('sumActor', val('actor') || '-');
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

async function refreshLatest(limit) {
  if (!hasApiConfigured()) return;
  loading(true);
  try {
    const requestedLimit = limit || (state.latestLoadedAll ? 'ALL' : 200);
    const res = await apiGet('getLatestRecords', { limit: requestedLimit });
    const data = unwrapApi(res);
    state.latest = data.records || [];
    state.latestLoadedAll = String(requestedLimit).toUpperCase() === 'ALL';
    state.latestPage = 1;
    renderLatest(state.latest);
    if (state.latestLoadedAll) toast('โหลดข้อมูลทั้งหมดแบบเร็วแล้ว', 'ok');
  } catch (err) {
    toast('โหลดข้อมูลล่าสุดไม่สำเร็จ: ' + err.message, 'bad');
  } finally {
    loading(false);
  }
}

function renderLatest(records) {
  const box = $('latestList');
  const rowsBox = $('latestRows');
  const cardsBox = $('latestCards');
  const filtered = filterLatestRecords(records || []);
  state.latestFiltered = filtered;
  const pageSize = latestPageSize();
  const totalPages = latestTotalPages();
  if (state.latestPage > totalPages) state.latestPage = totalPages;
  const start = pageSize === Infinity ? 0 : (state.latestPage - 1) * pageSize;
  const pageRows = pageSize === Infinity ? filtered : filtered.slice(start, start + pageSize);

  if (!filtered.length) {
    const empty = '<tr><td colspan="16"><div class="empty">ยังไม่มีข้อมูล หรือไม่พบข้อมูลตามคำค้นหา</div></td></tr>';
    rowsBox.innerHTML = empty;
    cardsBox.innerHTML = '<div class="empty">ยังไม่มีข้อมูล หรือไม่พบข้อมูลตามคำค้นหา</div>';
    box.innerHTML = '';
    updateLatestInfo(0, 0, 0);
    updateLatestPager(0, 0, 0);
    return;
  }

  rowsBox.innerHTML = pageRows.map(latestTableRow).join('');
  cardsBox.innerHTML = pageRows.map(recordCard).join('');
  box.innerHTML = '';
  updateLatestInfo(filtered.length, pageRows.length, start);
  updateLatestPager(filtered.length, pageRows.length, start);
  hydrateImageThumbs();
}

function filterLatestRecords(records) {
  const query = normalize(val('latestSearch'));
  if (!query) return records;
  return records.filter((r) => {
    const haystack = normalize([
      r.rowNumber, r.date, r.bu, r.barcode, r.itemCode, r.itemName, r.damageType,
      r.damageDescription, r.expiryDate, r.damageGroup, r.quantity, r.unit,
      r.actor, r.employeeId, r.affiliation, r.note, r.accountGroup
    ].join(' '));
    return haystack.includes(query);
  });
}

function latestPageSize() {
  const value = val('latestPageSize') || '20';
  if (value === 'ALL') return Infinity;
  return Math.max(1, Number(value || 20));
}

function latestTotalPages() {
  const size = latestPageSize();
  const total = state.latestFiltered.length || filterLatestRecords(state.latest || []).length;
  if (!total || size === Infinity) return 1;
  return Math.max(1, Math.ceil(total / size));
}

function updateLatestInfo(total, shown, start) {
  const totalLoaded = state.latest.length || 0;
  const end = shown ? start + shown : 0;
  const from = shown ? start + 1 : 0;
  const suffix = state.latestLoadedAll ? 'โหลดทั้งหมดแล้ว' : 'โหลดล่าสุด 200 แถว';
  $('latestInfo').textContent = `ทั้งหมด ${number(total)} แถว · แสดง ${from}-${end} จาก ${number(total)} แถว · ${suffix} (${number(totalLoaded)} แถวในหน่วยความจำ)`;
}

function updateLatestPager(total, shown, start) {
  const size = latestPageSize();
  const totalPages = latestTotalPages();
  const current = size === Infinity ? 1 : state.latestPage;
  $('latestPagerText').textContent = total ? `หน้า ${current} / ${totalPages}` : 'ไม่มีข้อมูล';
  $('btnLatestPrev').disabled = current <= 1 || size === Infinity;
  $('btnLatestNext').disabled = current >= totalPages || size === Infinity;
}

function latestTableRow(r) {
  const rowNumber = Number(r.rowNumber || 0);
  return `
    <tr>
      <td><b>${esc(r.rowNumber || '-')}</b></td>
      <td class="nowrap">${esc(r.date || '-')}</td>
      <td>${esc(r.bu || '-')}</td>
      <td class="nowrap">${esc(r.barcode || '-')}</td>
      <td class="nowrap">${esc(r.itemCode || '-')}</td>
      <td class="product-cell"><b>${esc(r.itemName || '-')}</b></td>
      <td>${imageThumb(r.image1, 'รูป Barcode')}</td>
      <td>${imageThumb(r.image2, 'รูปสินค้า')}</td>
      <td>${imageThumb(r.image3, 'รูปวันหมดอายุ')}</td>
      <td>${esc(r.damageType || '-')}</td>
      <td class="note-cell">${esc(r.damageDescription || '-')}</td>
      <td class="nowrap">${esc(r.expiryDate || '-')}</td>
      <td>${esc(r.damageGroup || '-')}</td>
      <td class="nowrap">${esc(r.quantity || '0')} ${esc(r.unit || '')}</td>
      <td class="note-cell">${esc(r.actor || '-')}</td>
      <td>
        ${rowNumber ? `
          <div class="row-actions">
            <button type="button" class="icon-btn" data-record-action="edit" data-row-number="${rowNumber}">แก้ไข</button>
            <button type="button" class="icon-btn danger" data-record-action="delete" data-row-number="${rowNumber}">ลบ</button>
          </div>
        ` : '-'}
      </td>
    </tr>
  `;
}

function imageThumb(image, label) {
  if (!image || !image.hasImage) return '<span class="text-thumb">-</span>';
  const fileId = image.fileId || '';
  const directUrl = image.previewUrl || image.url || '';
  const original = image.url || image.previewUrl || '';
  if (!fileId && !directUrl) return '<span class="text-thumb">-</span>';
  return `
    <a class="image-thumb image-thumb-loading" href="${escAttr(original || directUrl)}" target="_blank" rel="noopener" title="${escAttr(label)}">
      <img
        data-file-id="${escAttr(fileId)}"
        data-direct-src="${escAttr(fileId ? '' : directUrl)}"
        data-image-label="${escAttr(label)}"
        alt="${escAttr(label)}"
        loading="lazy"
      />
      <span>โหลดรูป</span>
    </a>
  `;
}

function hydrateImageThumbs() {
  const images = [...document.querySelectorAll('#latestRows img[data-file-id], #latestRows img[data-direct-src]')];
  if (!images.length) return;

  const runId = Date.now();
  state.imageLoadRun = runId;
  let index = 0;
  const workers = Array.from({ length: Math.min(4, images.length) }, async () => {
    while (index < images.length && state.imageLoadRun === runId) {
      const img = images[index++];
      await hydrateOneImageThumb(img);
    }
  });
  Promise.all(workers).catch(() => {});
}

async function hydrateOneImageThumb(img) {
  const fileId = img.dataset.fileId || '';
  const directSrc = img.dataset.directSrc || '';
  const box = img.closest('.image-thumb');
  const label = img.dataset.imageLabel || 'รูปภาพ';

  try {
    if (fileId) {
      if (!state.imageDataCache[fileId]) {
        const res = await apiGet('getImageData', { fileId });
        const data = unwrapApi(res);
        state.imageDataCache[fileId] = data.dataUrl;
      }
      setThumbImage(img, state.imageDataCache[fileId]);
      return;
    }

    if (directSrc) {
      await loadDirectThumb(img, directSrc);
      return;
    }

    throw new Error('ไม่มี URL รูปภาพ');
  } catch (err) {
    if (box) {
      box.classList.remove('image-thumb-loading', 'loaded');
      box.classList.add('failed');
      const text = box.querySelector('span');
      if (text) text.textContent = 'เปิดรูป';
    }
    img.src = BLANK_GIF;
    img.alt = label;
  }
}

function setThumbImage(img, src) {
  img.src = src;
  const box = img.closest('.image-thumb');
  if (box) {
    box.classList.remove('image-thumb-loading', 'failed');
    box.classList.add('loaded');
  }
}

function loadDirectThumb(img, src) {
  return new Promise((resolve, reject) => {
    img.onload = () => {
      setThumbImage(img, src);
      resolve();
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    img.src = src;
  });
}

async function refreshDashboard() {
  if (!hasApiConfigured()) return;
  loading(true);
  try {
    const payload = {
      period: val('dashPeriod') || '30',
      bu: 'ทั้งหมด', damageType: 'ทั้งหมด', shift: 'ทั้งหมด', damageGroup: 'ทั้งหมด',
      startDate: val('dashStartDate'),
      endDate: val('dashEndDate'),
      query: val('dashQuery')
    };
    const res = await apiGet('getDashboardRecords', payload);
    const data = unwrapApi(res);
    const rows = data.records || [];
    // Merge inconsistent group spellings (e.g. "OPT" vs "Opt.") so counts/filters align
    rows.forEach((r) => { r.damageGroup = canonGroup(r.damageGroup); });
    state.dashboardRaw = rows;
    applyDashboardFilters();
  } catch (err) {
    toast('โหลด Dashboard ไม่สำเร็จ: ' + err.message, 'bad');
  } finally {
    loading(false);
  }
}

function buildMultiSelect(containerId, key, items) {
  const box = $(containerId);
  if (!box) return;
  box.classList.add('ms');
  const escq = (v) => String(v).replace(/"/g, '&quot;');
  box.innerHTML =
    '<button type="button" class="ms-btn"><span class="ms-text">ทั้งหมด</span><span class="ms-caret">▾</span></button>' +
    '<div class="ms-panel hidden"><div class="ms-actions"><span class="ms-hint">เลือกได้หลายรายการ</span>' +
    '<button type="button" class="ms-clear">ล้าง</button></div>' +
    (items || []).map((v) => '<label class="ms-opt"><input type="checkbox" value="' + escq(v) + '"><span>' + esc(v) + '</span></label>').join('') +
    '</div>';
  const btn = box.querySelector('.ms-btn');
  const panel = box.querySelector('.ms-panel');
  const text = box.querySelector('.ms-text');
  const sync = () => {
    const sel = [...box.querySelectorAll('.ms-opt input:checked')].map((c) => c.value);
    state.dashFilters[key] = sel;
    text.textContent = sel.length === 0 ? 'ทั้งหมด' : (sel.length <= 2 ? sel.join(', ') : (sel.length + ' รายการ'));
    box.classList.toggle('ms-on', sel.length > 0);
    applyDashboardFilters();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.ms-panel').forEach((p) => { if (p !== panel) p.classList.add('hidden'); });
    panel.classList.toggle('hidden');
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  box.querySelector('.ms-clear').addEventListener('click', () => {
    box.querySelectorAll('.ms-opt input').forEach((c) => { c.checked = false; });
    sync();
  });
  box.querySelectorAll('.ms-opt input').forEach((c) => c.addEventListener('change', sync));
}

function applyDashboardFilters() {
  const f = state.dashFilters || {};
  const inSel = (arr, v) => !arr || arr.length === 0 || arr.indexOf(v) !== -1;
  const rows = (state.dashboardRaw || []).filter((r) =>
    inSel(f.bu, r.bu) &&
    inSel(f.damageType, r.damageType) &&
    inSel(f.shift, r.shift) &&
    inSel(f.damageGroup, canonGroup(r.damageGroup))
  );
  state.dashboardRecords = rows;
  renderDashboard(rows);
}

function renderDashboard(records) {
  const totalQty = records.reduce((sum, r) => sum + num(r.quantity), 0);
  const totalValue = records.reduce((sum, r) => sum + num(r.totalValue), 0);
  const noActor = records.filter((r) => String(r.actorType || '').includes('ไม่พบ') || String(r.actor || '').includes('ไม่ทราบ')).length;

  $('kpiCases').textContent = number(records.length);
  $('kpiQty').textContent = number(totalQty);
  $('kpiValue').textContent = money(totalValue);
  $('kpiNoActor').textContent = number(noActor);
  if ($('dashRecordLabel')) $('dashRecordLabel').textContent = number(records.length) + ' รายการ';
  if ($('dashPeriodLabel')) $('dashPeriodLabel').textContent = dashboardPeriodLabel();

  renderBars('topBu', groupCount(records, 'bu').slice(0, 8));
  renderBars('topType', groupCount(records, 'damageType').slice(0, 8));
  $('dashboardRows').innerHTML = records.length ? records.slice(0, 12).map(recordCard).join('') : '<div class="empty" style="margin:20px 0">ไม่มีข้อมูลตามเงื่อนไข</div>';

  renderCharts(records);
  renderMonthlyTrend(records);
  renderDetailStats(records);
  renderDataQuality(records);
  renderExtendedKPIs(records);
  renderTreemaps(records);
  renderTop5Products(records);
  renderAllValueBreakdowns(records);
  updateBudgetGauge(records);
  renderTop5Actors(records);
  renderShiftAnalysis(records);
  renderShiftDetail(records);
  renderShiftMatrix(records);
  renderQualityAlerts(records);
}

function dashboardPeriodLabel() {
  const start = val('dashStartDate');
  const end = val('dashEndDate');
  if (start || end) return `${start || 'เริ่มต้น'} ถึง ${end || 'วันนี้'}`;
  const period = val('dashPeriod') || '30';
  if (period === 'ALL') return 'ทั้งหมด';
  return period + ' วันล่าสุด';
}

function groupCount(records, key) {
  const map = new Map();
  records.forEach((r) => {
    const label = r[key] || 'ไม่ระบุ';
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupSum(records, keyGroup, keyValue) {
  const map = new Map();
  records.forEach((r) => {
    const label = r[keyGroup] || 'ไม่ระบุ';
    map.set(label, (map.get(label) || 0) + num(r[keyValue]));
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function parseDateFromRecord(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // The sheet stores dates in TWO display formats:
  //  - Imported rows: m/d/yyyy with Buddhist year (e.g. "1/5/2569" = 5 Jan 2026)
  //  - App rows:      dd/MM/yyyy with CE year   (e.g. "19/05/2026" = 19 May 2026)
  // Disambiguate by the year: > 2400 => Buddhist import => month-first order.
  let m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    let day, month;
    if (year > 2400) { month = a; day = b; year -= 543; } // Buddhist import: m/d/yyyy
    else { day = a; month = b; }                            // CE app row: d/m/yyyy
    return { day, month, year };
  }
  // Try YYYY-MM-DD (also handle Buddhist year)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    let year = parseInt(m[1], 10);
    if (year > 2400) year -= 543;
    return { day: parseInt(m[3], 10), month: parseInt(m[2], 10), year };
  }
  // Try DD/MM/YY
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$/);
  if (m) {
    const year = 2000 + parseInt(m[3], 10);
    return { day: parseInt(m[1], 10), month: parseInt(m[2], 10), year };
  }
  return null;
}

const CHART_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1'
];
const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                   'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function renderCharts(records) {
  if (typeof Chart === 'undefined') return;
  if (window.ChartDataLabels) { try { Chart.unregister(window.ChartDataLabels); } catch (e) {} } // keep other charts label-free; trend chart opts in locally

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const daysInMonth = new Date(curYear, curMonth, 0).getDate();

  // Build daily counts for current month
  const dailyCounts = Array(daysInMonth).fill(0);
  const dailyValues = Array(daysInMonth).fill(0);
  records.forEach((r) => {
    const parsed = parseDateFromRecord(r.date);
    if (parsed && parsed.month === curMonth && parsed.year === curYear) {
      const idx = parsed.day - 1;
      if (idx >= 0 && idx < daysInMonth) {
        dailyCounts[idx]++;
        dailyValues[idx] += num(r.totalValue);
      }
    }
  });
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  const monthLabel = MONTH_TH[curMonth - 1] + ' ' + (curYear + 543);
  const el = $('chartMonthlyLabel');
  if (el) el.textContent = 'เดือน ' + monthLabel + ' — เคส/วัน (ลากสี = มูลค่ารวม)';

  // Monthly trend chart
  const ctxM = $('chartMonthly');
  if (ctxM) {
    if (state.chartMonthly) { state.chartMonthly.destroy(); state.chartMonthly = null; }
    state.chartMonthly = new Chart(ctxM, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [
          {
            label: 'จำนวนเคส',
            data: dailyCounts,
            backgroundColor: 'rgba(59,130,246,0.7)',
            borderColor: '#1d4ed8',
            borderWidth: 1.5,
            borderRadius: 5,
            borderSkipped: false,
            yAxisID: 'y'
          },
          {
            label: 'มูลค่า (บาท)',
            data: dailyValues,
            type: 'line',
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.08)',
            borderWidth: 2,
            pointBackgroundColor: '#f59e0b',
            pointRadius: 3,
            tension: 0.35,
            fill: true,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11, weight: 'bold' }, boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.datasetIndex === 0
                ? ' เคส: ' + ctx.parsed.y + ' รายการ'
                : ' มูลค่า: ' + ctx.parsed.y.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท'
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, maxRotation: 0 }
          },
          y: {
            type: 'linear', position: 'left',
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 10 }, stepSize: 1, precision: 0 },
            title: { display: true, text: 'เคส', font: { size: 10 } }
          },
          y2: {
            type: 'linear', position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { font: { size: 10 }, callback: (v) => v >= 1000 ? (v/1000).toFixed(1)+'K' : v },
            title: { display: true, text: 'บาท', font: { size: 10 } }
          }
        }
      }
    });
  }

  // Damage type donut chart
  const typeGroups = groupCount(records, 'damageType').slice(0, 6);
  const ctxT = $('chartDamageType');
  if (ctxT) {
    if (state.chartType) { state.chartType.destroy(); state.chartType = null; }
    if (typeGroups.length) {
      state.chartType = new Chart(ctxT, {
        type: 'doughnut',
        data: {
          labels: typeGroups.map((g) => g.label),
          datasets: [{
            data: typeGroups.map((g) => g.value),
            backgroundColor: CHART_COLORS.slice(0, typeGroups.length),
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10, weight: 'bold' }, boxWidth: 10, padding: 8 } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.parsed} เคส (${((ctx.parsed / records.length) * 100).toFixed(1)}%)`
              }
            }
          }
        }
      });
    }
  }
}

// Canonicalize damage-group spelling so "OPT" and "Opt." (and "Out bound"/"Outbound") merge
function canonGroup(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  const k = s.toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
  if (k === 'opt') return 'OPT';
  if (k === 'sup') return 'SUP';
  if (k === 'outbound') return 'Out bound';
  return s;
}

// Guard against corrupt totals (e.g. a barcode pasted into มูลค่ารวม):
// if the stored total is wildly larger than unitCost x qty, use the computed value instead.
function guardedValue(r) {
  const total = num(r.totalValue);
  const calc = num(r.unitCost) * num(r.quantity);
  if (calc > 0 && total > calc * 100) return calc;
  return total;
}

function linReg(y) {
  const n = y.length;
  if (!n) return [];
  const xs = y.map((_, i) => i);
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * y[i], 0);
  const d = n * sxx - sx * sx;
  if (d === 0) return y.slice();
  const m = (n * sxy - sx * sy) / d;
  const b = (sy - m * sx) / n;
  return xs.map((x) => Math.max(0, m * x + b));
}

const TREND_TYPES = ['สินค้าชำรุด', 'สินค้าแตกแพค', 'สินค้าหมดอายุ'];
const TREND_TYPE_COLORS = {
  'สินค้าชำรุด': '#3b82f6',
  'สินค้าแตกแพค': '#f59e0b',
  'สินค้าหมดอายุ': '#ef4444',
  'อื่นๆ': '#94a3b8'
};

function setTrendMode(mode) {
  state.trendMode = mode === 'val' ? 'val' : 'qty';
  const q = $('trendModeQty'), v = $('trendModeVal');
  if (q) q.classList.toggle('active', state.trendMode === 'qty');
  if (v) v.classList.toggle('active', state.trendMode === 'val');
  renderMonthlyTrend(state.dashboardRecords || []);
}

// Month-over-month trend: stacked bars by product type + monthly total line + linear trend.
// Follows whatever filters are active on the dashboard (records already filtered/normalized).
function renderMonthlyTrend(records) {
  if (typeof Chart === 'undefined') return;
  const ctx = $('chartMonthlyTrend');
  if (!ctx) return;
  const mode = state.trendMode || 'qty';

  const buckets = new Map(); // 'YYYY-MM' -> { typeName: value }
  (records || []).forEach((r) => {
    const d = parseDateFromRecord(r.date);
    if (!d || !d.month || d.month < 1 || d.month > 12) return;
    const key = d.year + '-' + String(d.month).padStart(2, '0');
    let t = String(r.damageType || '').trim();
    if (TREND_TYPES.indexOf(t) === -1) t = 'อื่นๆ';
    const add = mode === 'val' ? guardedValue(r) : num(r.quantity);
    if (!buckets.has(key)) buckets.set(key, {});
    const b = buckets.get(key);
    b[t] = (b[t] || 0) + add;
  });

  const keys = [...buckets.keys()].sort();
  const labels = keys.map((k) => {
    const p = k.split('-');
    return MONTH_TH[parseInt(p[1], 10) - 1] + ' ' + (parseInt(p[0], 10) + 543);
  });
  const hasOther = keys.some((k) => (buckets.get(k)['อื่นๆ'] || 0) > 0);
  const useSeries = hasOther ? TREND_TYPES.concat(['อื่นๆ']) : TREND_TYPES;
  const round2 = (v) => Math.round(v * 100) / 100;

  const totals = keys.map((k) => useSeries.reduce((s, n) => s + (buckets.get(k)[n] || 0), 0));
  const trend = linReg(totals);
  const maxV = Math.max(1, ...totals, ...trend) * 1.18;
  const isValMode = mode === 'val';
  const lbl = (v) => (!v ? '' : (isValMode
    ? (v >= 1000 ? (v / 1000).toLocaleString('th-TH', { maximumFractionDigits: v >= 10000 ? 0 : 1 }) + 'K' : Math.round(v).toLocaleString('th-TH'))
    : v.toLocaleString('th-TH')));

  const datasets = useSeries.map((name) => ({
    label: name,
    data: keys.map((k) => round2(buckets.get(k)[name] || 0)),
    backgroundColor: TREND_TYPE_COLORS[name] || '#94a3b8',
    stack: 'stk', borderWidth: 0, borderRadius: 3, order: 3, yAxisID: 'y',
    datalabels: {
      display: (c) => (c.dataset.data[c.dataIndex] || 0) >= maxV * 0.07,
      color: '#ffffff', font: { weight: 'bold', size: 10 }, anchor: 'center', align: 'center',
      formatter: lbl
    }
  }));
  datasets.push({
    label: 'ยอดรวม', type: 'line', data: totals.map(round2),
    borderColor: '#111827', backgroundColor: '#111827', borderWidth: 2.4,
    pointRadius: 3, pointBackgroundColor: '#111827', tension: 0.3, order: 1, yAxisID: 'y1',
    datalabels: {
      display: true, anchor: 'end', align: 'top', offset: 6, clamp: true,
      color: '#0f172a', font: { weight: 'bold', size: 11 }, formatter: lbl
    }
  });
  datasets.push({
    label: 'เส้นแนวโน้ม', type: 'line', data: trend.map(round2),
    borderColor: '#8b5cf6', borderDash: [6, 5], borderWidth: 2,
    pointRadius: 0, tension: 0, order: 2, yAxisID: 'y1', fill: false,
    datalabels: { display: false }
  });

  const isVal = mode === 'val';
  const el = $('chartTrendLabel');
  if (el) el.textContent = (isVal ? 'มูลค่ารวม (บาท)' : 'จำนวน (หน่วย)') +
    ' รายเดือน · แท่งซ้อนตามประเภทสินค้า + เส้นแนวโน้ม · ตามฟิลเตอร์ที่เลือก';

  const fmt = (v) => isVal
    ? (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'K' : String(v))
    : Number(v).toLocaleString('th-TH');

  if (state.chartMonthlyTrend) { state.chartMonthlyTrend.destroy(); state.chartMonthlyTrend = null; }
  // Defensive: drop any chart still bound to this canvas (e.g. after a prior failed render)
  const existingTrend = (typeof Chart.getChart === 'function') ? Chart.getChart(ctx) : null;
  if (existingTrend) existingTrend.destroy();
  const DL = window.ChartDataLabels || null;
  if (DL) { try { Chart.unregister(DL); } catch (e) {} } // scope data labels to this chart only
  state.chartMonthlyTrend = new Chart(ctx, {
    type: 'bar',
    plugins: DL ? [DL] : [],
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11, weight: 'bold' }, boxWidth: 12, padding: 10 } },
        tooltip: {
          callbacks: {
            label: (c) => ' ' + c.dataset.label + ': ' +
              Number(c.parsed.y).toLocaleString('th-TH', { maximumFractionDigits: isVal ? 0 : 0 }) + (isVal ? ' บาท' : '')
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          stacked: true, min: 0, max: maxV, grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 }, callback: fmt },
          title: { display: true, text: isVal ? 'บาท' : 'จำนวน (หน่วย)', font: { size: 10 } }
        },
        y1: { stacked: false, min: 0, max: maxV, display: false, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderDetailStats(records) {
  const box = $('detailStats');
  if (!box) return;
  if (!records.length) {
    box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>';
    return;
  }

  const total = records.length;
  const totalQtyAll = records.reduce((s, r) => s + num(r.quantity), 0);
  const totalValAll = records.reduce((s, r) => s + num(r.totalValue), 0);

  // Group by shift
  const shifts = groupCount(records, 'shift');
  // Group by damage group
  const dgroups = groupCount(records, 'damageGroup');
  // Group by BU with value
  const buVal = groupSum(records, 'bu', 'totalValue').slice(0, 5);

  const shiftColors = ['blue','green','amber','purple','gray'];
  const dgColors = ['red','amber','blue','green','gray'];

  const shiftHtml = shifts.map((s, i) => `
    <div class="dstat-row">
      <span class="dstat-label"><span class="dstat-label-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${esc(s.label)}</span>
      <span class="dstat-values">
        <span class="dstat-chip ${shiftColors[i % shiftColors.length]}">${s.value} เคส</span>
        <span class="dstat-chip gray">${((s.value / total) * 100).toFixed(0)}%</span>
      </span>
    </div>`).join('');

  const dgHtml = dgroups.map((d, i) => `
    <div class="dstat-row">
      <span class="dstat-label"><span class="dstat-label-dot" style="background:${CHART_COLORS[(i + 3) % CHART_COLORS.length]}"></span>${esc(d.label)}</span>
      <span class="dstat-values">
        <span class="dstat-chip ${dgColors[i % dgColors.length]}">${d.value} เคส</span>
      </span>
    </div>`).join('');

  const buValHtml = buVal.map((b, i) => `
    <div class="dstat-row">
      <span class="dstat-label"><span class="dstat-label-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${esc(b.label)}</span>
      <span class="dstat-values">
        <span class="dstat-chip purple">${b.value.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บ.</span>
      </span>
    </div>`).join('');

  box.innerHTML = `
    <div class="dstat-group">
      <div class="dstat-group-title">🌙 แยกตามกะ</div>
      ${shiftHtml || '<span style="color:var(--muted);font-size:12px">ไม่มีข้อมูลกะ</span>'}
    </div>
    <div class="dstat-group">
      <div class="dstat-group-title">📦 หมวดเสียหาย</div>
      ${dgHtml || '<span style="color:var(--muted);font-size:12px">ไม่มีข้อมูลหมวดเสียหาย</span>'}
    </div>
    <div class="dstat-group">
      <div class="dstat-group-title">🏷️ มูลค่าตาม BU</div>
      ${buValHtml || '<span style="color:var(--muted);font-size:12px">ไม่มีข้อมูล BU</span>'}
    </div>
  `;
}

/* ================================================
   BUDGET QUOTA
   ================================================ */
function setupBudget() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const stored = localStorage.getItem('budgetQuota_' + monthKey);
  if (stored) {
    const el = $('budgetQuota');
    if (el) el.value = stored;
    updateBudgetLabel(monthKey);
  }
  const btn = $('btnSetBudget');
  if (btn) {
    btn.addEventListener('click', () => {
      const v = parseFloat($('budgetQuota').value || '0');
      if (v > 0) {
        localStorage.setItem('budgetQuota_' + monthKey, String(v));
        updateBudgetLabel(monthKey);
        updateBudgetGauge(state.dashboardRecords || []);
        toast('บันทึกโควต้างบเรียบร้อย', 'ok');
      }
    });
  }
  updateBudgetLabel(monthKey);
}

function updateBudgetLabel(monthKey) {
  const quota = parseFloat(localStorage.getItem('budgetQuota_' + monthKey) || '0');
  const parts = (monthKey || '').split('-');
  const monthLabel = parts.length === 2 ? MONTH_TH[parseInt(parts[1], 10) - 1] + ' ' + (parseInt(parts[0], 10) + 543) : '—';
  const el = $('budgetMonthLabel');
  if (el) el.textContent = 'โควต้าเดือน ' + monthLabel + (quota > 0 ? ' · ' + quota.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท' : ' · ยังไม่ได้ตั้ง');
  const ql = $('budgetQuotaLabel');
  if (ql) ql.textContent = quota > 0 ? 'โควต้า: ' + quota.toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท' : 'ไม่ได้ตั้งโควต้า';
}

function updateBudgetGauge(records) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const quota = parseFloat(localStorage.getItem('budgetQuota_' + monthKey) || '0');
  const totalValue = records.reduce((s, r) => s + num(r.totalValue), 0);

  const usedEl = $('budgetUsed');
  if (usedEl) usedEl.textContent = '฿ ' + totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fill = $('budgetBarFill');
  const pct = $('budgetPct');
  if (!fill || !pct) return;

  if (!quota) {
    fill.style.width = '0%';
    fill.className = 'budget-bar-fill';
    pct.textContent = '—';
    pct.className = 'budget-pct';
    return;
  }

  const ratio = totalValue / quota;
  const pctNum = Math.round(ratio * 100);
  fill.style.width = Math.min(ratio * 100, 100) + '%';
  pct.textContent = pctNum + '%';

  if (ratio >= 1) { fill.className = 'budget-bar-fill over'; pct.className = 'budget-pct over'; }
  else if (ratio >= 0.8) { fill.className = 'budget-bar-fill warn'; pct.className = 'budget-pct warn'; }
  else { fill.className = 'budget-bar-fill'; pct.className = 'budget-pct ok'; }
}

/* ================================================
   DATA QUALITY SCORE
   ================================================ */
function renderDataQuality(records) {
  if (!records.length) return;
  const n = records.length;

  const pct = (fn) => Math.round((records.filter(fn).length / n) * 100);
  const img1 = pct((r) => r.image1 && r.image1.hasImage);
  const img2 = pct((r) => r.image2 && r.image2.hasImage);
  const actor = pct((r) => String(r.actor || '').trim() !== '');
  const emp = pct((r) => String(r.employeeId || '').trim() !== '');
  const val_ = pct((r) => num(r.totalValue) > 0);
  const acc = pct((r) => String(r.accountGroup || '').trim() !== '');

  const score = Math.round((img1 + img2 + actor + emp + val_ + acc) / 6);

  const setField = (id, pctId, v) => {
    const el = $(id); if (el) el.style.width = v + '%';
    const pe = $(pctId); if (pe) pe.textContent = v + '%';
  };
  setField('qfImage1', 'qfImage1Pct', img1);
  setField('qfImage2', 'qfImage2Pct', img2);
  setField('qfActor', 'qfActorPct', actor);
  setField('qfEmployee', 'qfEmployeePct', emp);
  setField('qfValue', 'qfValuePct', val_);
  setField('qfAccount', 'qfAccountPct', acc);

  const scoreEl = $('qualityScore');
  if (scoreEl) scoreEl.textContent = score;

  const gauge = $('qualityGaugeFill');
  if (gauge) {
    const circ = 238.76;
    const offset = circ - (score / 100) * circ;
    gauge.style.strokeDashoffset = offset;
    gauge.style.stroke = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  }
}

/* ================================================
   EXTENDED KPIs
   ================================================ */
function renderExtendedKPIs(records) {
  const skuSet = new Set(records.map((r) => r.barcode).filter(Boolean));
  const el = $('kpiSkuCount'); if (el) el.textContent = skuSet.size;

  const shifts = groupCount(records, 'shift');
  const topShift = shifts[0];
  const tsEl = $('kpiTopShift');
  const tsSub = $('kpiTopShiftSub');
  if (tsEl) tsEl.textContent = topShift ? (topShift.label || '—') : '—';
  if (tsSub && topShift) {
    const qty = records.filter((r) => r.shift === topShift.label).reduce((s, r) => s + num(r.quantity), 0);
    tsSub.textContent = topShift.value + ' เคส · ' + number(qty) + ' หน่วย';
  }

  const expCount = records.filter((r) => String(r.expiryDate || '').trim() !== '').length;
  const exEl = $('kpiExpiry'); if (exEl) exEl.textContent = expCount;

  const evCount = records.filter((r) => (r.image1 && r.image1.hasImage) || (r.image2 && r.image2.hasImage) || (r.image3 && r.image3.hasImage)).length;
  const evEl = $('kpiEvidencePct');
  if (evEl) evEl.textContent = records.length ? Math.round((evCount / records.length) * 100) + '%' : '0%';
}

/* ================================================
   TREEMAP CHARTS
   ================================================ */
const TREEMAP_SHIFT_COLORS = [
  'linear-gradient(135deg,#0ea5e9,#3b82f6)',
  'linear-gradient(135deg,#1d4ed8,#6366f1)',
  'linear-gradient(135deg,#06b6d4,#0891b2)',
];
const TREEMAP_GROUP_COLORS = [
  'linear-gradient(135deg,#f97316,#f59e0b)',
  'linear-gradient(135deg,#ef4444,#f97316)',
  'linear-gradient(135deg,#eab308,#f59e0b)',
  'linear-gradient(135deg,#dc2626,#ef4444)',
];

function renderTreemaps(records) {
  renderTreemap('treemapShift', groupCount(records, 'shift'), TREEMAP_SHIFT_COLORS);
  renderTreemap('treemapGroup', groupCount(records, 'damageGroup'), TREEMAP_GROUP_COLORS);
}

function renderTreemap(id, items, colors) {
  const box = $(id);
  if (!box) return;
  if (!items.length) { box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>'; return; }
  
  const top = items.slice(0, 5);
  const total = top.reduce((sum, item) => sum + item.value, 0);
  
  if (total === 0) {
    box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>';
    return;
  }

  const segmentsHtml = top.map((item, i) => {
    const pct = ((item.value / total) * 100).toFixed(1);
    const bg = colors[i % colors.length];
    return `
      <div class="treemap-segment" style="width:${pct}%; background:${bg}" title="${esc(item.label || 'ไม่ระบุ')}: ${item.value} เคส (${pct}%)">
      </div>
    `;
  }).join('');

  const legendHtml = top.map((item, i) => {
    const pct = ((item.value / total) * 100).toFixed(1);
    const bg = colors[i % colors.length];
    return `
      <div class="treemap-legend-item">
        <span class="legend-color-dot" style="background:${bg}"></span>
        <span class="legend-label"><b>${esc(item.label || 'ไม่ระบุ')}</b></span>
        <span class="legend-val">${number(item.value)} (${pct}%)</span>
      </div>
    `;
  }).join('');

  box.innerHTML = `
    <div class="treemap-container">
      <div class="treemap-bar-stack">
        ${segmentsHtml}
      </div>
      <div class="treemap-legend">
        ${legendHtml}
      </div>
    </div>
  `;
}

/* ================================================
   TOP 5 PRODUCTS
   ================================================ */
function groupByProduct(records) {
  const map = new Map();
  records.forEach((r) => {
    const key = r.barcode || r.itemName || 'ไม่ระบุ';
    if (!map.has(key)) map.set(key, { label: r.itemName || key, sub: [r.bu, r.damageType, r.damageDescription].filter(Boolean).join(' · '), count: 0, qty: 0, value: 0, barcode: r.barcode || '' });
    const e = map.get(key);
    e.count++;
    e.qty += num(r.quantity);
    e.value += num(r.totalValue);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

const RANK_CLASS = ['r1', 'r2', 'r3', '', ''];

function renderTop5Products(records) {
  const byCount = groupByProduct(records).slice(0, 5);
  const byValue = [...groupByProduct(records)].sort((a, b) => b.value - a.value).slice(0, 5);

  const makeItem = (item, i, showValue) => `
    <div class="top5-item">
      <span class="top5-rank ${RANK_CLASS[i] || ''}">${i + 1}</span>
      <div class="top5-info">
        <b>${esc(item.label)}</b>
        <p>${esc(item.sub || item.barcode || '')}</p>
      </div>
      <div class="top5-stats">
        ${showValue
          ? `<span class="top5-value">${money(item.value)}</span><span class="top5-unit">${item.count} เคส · ${number(item.qty)} หน่วย</span>`
          : `<b class="top5-count">${item.count}</b><span class="top5-unit">${number(item.qty)} หน่วย</span>`
        }
      </div>
    </div>`;

  const p5 = $('top5Products');
  if (p5) p5.innerHTML = byCount.length ? byCount.map((it, i) => makeItem(it, i, false)).join('') : '<div class="empty">ไม่มีข้อมูล</div>';

  const pv5 = $('top5ProductsValue');
  if (pv5) pv5.innerHTML = byValue.length ? byValue.map((it, i) => makeItem(it, i, true)).join('') : '<div class="empty">ไม่มีข้อมูล</div>';

  // Top 5 damage descriptions (root cause)
  const rootCause = groupByDescription(records).slice(0, 5);
  const rc = $('top5RootCause');
  if (rc) rc.innerHTML = rootCause.length ? rootCause.map((it, i) => `
    <div class="top5-item">
      <span class="top5-rank ${RANK_CLASS[i] || ''}">${i + 1}</span>
      <div class="top5-info">
        <b>${esc(it.label)}</b>
        <p>${esc(it.sub || '')}</p>
      </div>
      <div class="top5-stats">
        <b class="top5-count">${it.count}</b>
        <span class="top5-unit">${number(it.qty)} หน่วย</span>
      </div>
    </div>`).join('') : '<div class="empty">ไม่มีข้อมูล</div>';

  // Top 5 BU by case count
  const top5bu = groupCount(records, 'bu').slice(0, 5);
  renderValueBars('top5Bu', top5bu.map((b) => ({ label: b.label, value: b.value, sub: '' })), false);

  // Top 5 types
  const top5t = groupCount(records, 'damageType').slice(0, 5);
  renderValueBars('top5Types', top5t.map((t) => ({ label: t.label, value: t.value, sub: '' })), false);
}

function groupByDescription(records) {
  const map = new Map();
  records.forEach((r) => {
    const key = r.damageDescription || 'ไม่ระบุ';
    if (!map.has(key)) map.set(key, { label: key, sub: [r.bu, r.damageType].filter(Boolean).join(' · '), count: 0, qty: 0 });
    const e = map.get(key);
    e.count++;
    e.qty += num(r.quantity);
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ================================================
   VALUE BREAKDOWNS
   ================================================ */
function renderAllValueBreakdowns(records) {
  const buV = groupSum(records, 'bu', 'totalValue');
  const typeV = groupSum(records, 'damageType', 'totalValue');
  const shiftV = groupSum(records, 'shift', 'totalValue');
  const affV = groupSum(records, 'affiliation', 'totalValue');
  const accV = groupSum(records, 'accountGroup', 'totalValue');

  const buCount = (label) => records.filter((r) => r.bu === label).length;
  const typeCount = (label) => records.filter((r) => r.damageType === label).length;
  const shiftCount = (label) => records.filter((r) => r.shift === label).length;

  renderValueBars('valueBu', buV.map((b) => ({ label: b.label, value: b.value, sub: buCount(b.label) + ' เคส' })), true);
  renderValueBars('valueType', typeV.map((t) => ({ label: t.label, value: t.value, sub: typeCount(t.label) + ' เคส' })), true);
  renderValueBars('valueShift', shiftV.map((s) => ({ label: s.label, value: s.value, sub: shiftCount(s.label) + ' เคส' })), true);
  renderValueBars('valueAffiliation', affV.slice(0, 6).map((a) => ({ label: a.label || 'ไม่ระบุ', value: a.value, sub: '' })), true);
  renderValueBars('valueAccount', accV.slice(0, 6).map((a) => ({ label: a.label || 'ไม่ระบุ', value: a.value, sub: '' })), true);
}

function renderValueBars(id, items, showMoney) {
  const box = $(id);
  if (!box) return;
  if (!items.length) { box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>'; return; }
  const max = Math.max(...items.map((x) => x.value), 1);
  box.innerHTML = items.map((item) => `
    <div class="bar-row">
      <div class="bar-head">
        <span>${esc(item.label)}</span>
        <b>${showMoney ? money(item.value) : number(item.value)}</b>
      </div>
      ${item.sub ? `<div class="bar-sub">${esc(item.sub)}</div>` : ''}
      <div class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (item.value / max) * 100)}%"></span></div>
    </div>
  `).join('');
}

function renderBars(id, items) {

  const box = $(id);
  const isV2 = box && box.classList.contains('v2');
  if (!items.length) {
    box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>';
    return;
  }
  const max = Math.max(...items.map((x) => x.value), 1);
  box.innerHTML = items.map((item) => `
    <div class="bar-row">
      <div class="bar-head"><span>${esc(item.label)}</span><b>${number(item.value)}</b></div>
      <div class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (item.value / max) * 100)}%"></span></div>
    </div>
  `).join('');
}

function recordCard(r) {
  const images = [r.image1, r.image2, r.image3].filter((img) => img && img.hasImage);
  const imageCount = images.length;
  const imageLinks = images.length ? `
      <div class="record-images">
        ${images.map((img, i) => `
          <a href="${escAttr(img.url || img.previewUrl)}" target="_blank" rel="noopener">รูป ${i + 1}</a>
        `).join('')}
      </div>
    ` : '';
  const rowNumber = Number(r.rowNumber || 0);
  const actions = rowNumber ? `
      <div class="record-actions">
        <button type="button" class="icon-btn" data-record-action="edit" data-row-number="${rowNumber}" title="แก้ไข">แก้ไข</button>
        <button type="button" class="icon-btn danger" data-record-action="delete" data-row-number="${rowNumber}" title="ลบ">ลบ</button>
      </div>
    ` : '';
  return `
    <article class="record-card">
      <div class="record-head">
        <div>
          <b>${esc(r.itemName || '-')}</b>
          <p>${esc(r.barcode || '-')} • ${esc(r.itemCode || '-')}</p>
        </div>
        <div class="record-head-side">
          <span class="pill blue">Row ${esc(r.rowNumber || '-')}</span>
          ${actions}
        </div>
      </div>
      <div class="record-meta">
        <span class="pill">${esc(r.date || '-')}</span>
        <span class="pill">BU: ${esc(r.bu || '-')}</span>
        <span class="pill warn">${esc(r.damageType || '-')}</span>
        <span class="pill">จำนวน ${esc(r.quantity || '0')} ${esc(r.unit || '')}</span>
        <span class="pill ok">${esc(r.totalValue ? money(r.totalValue) : 'ไม่พบราคา')}</span>
        <span class="pill">รูป ${imageCount}</span>
      </div>
      ${imageLinks}
      <p>ลักษณะ: ${esc(r.damageDescription || '-')} • ผู้กระทำ: ${esc(r.actor || '-')} • หมายเหตุ: ${esc(r.note || '-')}</p>
    </article>
  `;
}

function findRecordByRow(rowNumber) {
  const row = Number(rowNumber || 0);
  return [...state.latest, ...state.dashboardRecords].find((record) => Number(record.rowNumber || 0) === row);
}

function editRecord(rowNumber) {
  const record = findRecordByRow(rowNumber);
  if (!record) {
    toast('ไม่พบข้อมูลรายการนี้ในหน้าปัจจุบัน กรุณา Refresh แล้วลองอีกครั้ง', 'warn');
    return;
  }

  resetForm(true);
  state.editingRowNumber = Number(rowNumber);
  state.editingRecord = record;

  ensureSelectValue('bu', record.bu || '');
  setValue('barcode', record.barcode);
  setValue('itemCode', record.itemCode);
  setValue('itemName', record.itemName);
  setValue('unit', record.unit);

  ensureSelectValue('damageType', record.damageType || '');
  const damageParts = splitDamageDescription(record.damageDescription);
  ensureSelectValue('damageDescription', damageParts.main || '');
  setValue('damageDescriptionOther', damageParts.other);
  toggleOtherDamage();

  setValue('expiryDate', dateInputFromDisplay(record.expiryDate));
  ensureSelectValue('damageGroup', record.damageGroup || '');
  ensureSelectValue('accountGroup', record.accountGroup || '');
  setValue('boxNo', record.boxNo);
  setValue('quantity', record.quantity);
  setValue('reportTime', record.reportTime);
  ensureSelectValue('shift', record.shift || '');
  setValue('actor', record.actor);
  setValue('employeeId', record.employeeId);
  ensureSelectValue('affiliation', record.affiliation || '');
  setValue('note', record.note);

  setExistingImagePreview('previewBarcode', record.image1);
  setExistingImagePreview('previewProduct', record.image2);
  setExistingImagePreview('previewExpiry', record.image3);

  $('editNoticeText').textContent = 'กำลังแก้ไข Row ' + rowNumber;
  $('editNotice').classList.remove('hidden');
  $('btnSave').textContent = 'บันทึกการแก้ไข';
  showPage('formPage');
  updateCostPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteRecord(rowNumber) {
  const row = Number(rowNumber || 0);
  if (!row) return;
  if (!window.confirm('ต้องการลบ Row ' + row + ' หรือไม่?')) return;

  loading(true);
  try {
    const res = await apiPost('deleteDamage', { rowNumber: row });
    const data = unwrapApi(res);
    toast(data.message || 'ลบข้อมูลแล้ว', 'ok');
    if (state.editingRowNumber === row) resetForm(true);
    await Promise.all([
      refreshLatest(),
      refreshDashboard()
    ]);
  } catch (err) {
    toast('ลบข้อมูลไม่สำเร็จ: ' + (err.message || err), 'bad');
  } finally {
    loading(false);
  }
}

function splitDamageDescription(value) {
  const text = String(value || '').trim();
  const m = text.match(/^อื่น\s*[:：]\s*(.*)$/);
  if (m) return { main: 'อื่น', other: m[1] || '' };
  return { main: text, other: '' };
}

function setExistingImagePreview(previewId, image) {
  const preview = $(previewId);
  const url = image && (image.previewUrl || image.url);
  if (!url) {
    preview.src = BLANK_GIF;
    preview.parentElement.classList.remove('has-image');
    return;
  }
  preview.src = url;
  preview.parentElement.classList.add('has-image');
}

async function apiGet(action, params = {}) {
  if (hasProxyUrl()) {
    try {
      return await apiProxyRequest(action, params);
    } catch (err) {
      if (!hasApiUrl()) throw err;
    }
  }
  return jsonpRequest(action, params);
}

async function apiPost(action, payload = {}) {
  if (hasProxyUrl()) {
    try {
      return await apiProxyRequest(action, payload);
    } catch (err) {
      if (!hasApiUrl()) throw err;
    }
  }
  return directApiPost(action, payload);
}

async function apiProxyRequest(action, payload = {}) {
  const url = String(state.config.apiProxyUrl || '').trim();
  if (!url) throw new Error('ยังไม่ได้ตั้งค่า Proxy API');

  const body = { action, payload };
  if (state.config.apiToken) body.apiToken = state.config.apiToken;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 180) || 'Proxy API Error');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Proxy API ตอบกลับไม่ใช่ JSON: ' + text.slice(0, 120));
  }
}

async function directApiPost(action, payload = {}) {
  const url = state.config.apiUrl;
  if (!hasApiUrl()) throw new Error('ยังไม่ได้ตั้งค่า API URL');

  const body = { action, payload };
  if (state.config.apiToken) body.apiToken = state.config.apiToken;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 180) || 'API Error');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('API ตอบกลับไม่ใช่ JSON: ' + text.slice(0, 120));
  }
}

function jsonpRequest(action, params = {}) {
  if (!hasApiUrl()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API URL'));

  return new Promise((resolve, reject) => {
    const callbackName = '__damageJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('API ใช้เวลานานเกินไป'));
    }, 25000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    const url = new URL(state.config.apiUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });
    if (state.config.apiToken) url.searchParams.set('apiToken', state.config.apiToken);

    script.onerror = () => {
      cleanup();
      reject(new Error('เชื่อมต่อ API ไม่สำเร็จ'));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function resetForm(keepToast) {
  $('damageForm').reset();
  state.editingRowNumber = null;
  state.editingRecord = null;
  state.images = { imageBarcode: '', imageProduct: '', imageExpiry: '' };
  ['previewBarcode', 'previewProduct', 'previewExpiry'].forEach((id) => {
    const img = $(id);
    img.src = BLANK_GIF;
    img.parentElement.classList.remove('has-image');
  });
  $('productResults').classList.add('hidden');
  $('employeeResults').classList.add('hidden');
  $('editNotice').classList.add('hidden');
  $('btnSave').textContent = 'บันทึกลง Sheet';
  toggleOtherDamage();
  setCostPreview(0, 0, false);
  setTodayTime();
  updateSummary();
  if (!keepToast) toast('ล้างข้อมูลแล้ว', 'ok');
}

function val(id) {
  const el = $(id);
  return el ? String(el.value || '').trim() : '';
}

function setValue(id, value) {
  const el = $(id);
  if (el) {
    el.value = value || '';
    updateSummary();
  }
}

function ensureSelectValue(id, value) {
  const el = $(id);
  if (!el || !value) return;
  const exists = [...el.options].some((opt) => opt.value === value);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  }
  el.value = value;
}

function loading(show) {
  if (show) {
    state.loadingCount++;
    $('loading').classList.remove('hidden');
  } else {
    state.loadingCount = Math.max(0, state.loadingCount - 1);
    if (state.loadingCount === 0) {
      $('loading').classList.add('hidden');
    }
  }
}

function toast(message, type) {
  const box = $('toast');
  clearTimeout(state.toastTimer);
  box.textContent = message;
  box.className = 'toast show ' + (type || '');
  state.toastTimer = setTimeout(() => {
    box.className = 'toast';
  }, 3800);
}

function compressImage(file, maxWidth = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพ'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('เปิดรูปไม่ได้'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function compressImageForUpload(file) {
  const maxBytes = Number(state.config.maxImageBytes || DEFAULT_CONFIG.maxImageBytes);
  let width = Number(state.config.maxImageWidth || DEFAULT_CONFIG.maxImageWidth);
  let quality = Number(state.config.imageQuality || DEFAULT_CONFIG.imageQuality);
  let lastDataUrl = '';

  for (let i = 0; i < 6; i++) {
    lastDataUrl = await compressImage(file, width, quality);
    if (dataUrlSizeBytes(lastDataUrl) <= maxBytes) return lastDataUrl;
    width = Math.max(560, Math.round(width * 0.82));
    quality = Math.max(0.52, quality - 0.08);
  }

  throw new Error('รูปหลังย่อยังใหญ่เกิน ' + formatBytes(maxBytes));
}

function dataUrlSizeBytes(dataUrl) {
  const base64 = String(dataUrl || '').split('base64,')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 MB';
  return (bytes / (1024 * 1024)).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + ' MB';
}

function localDateInputValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateInputFromDisplay(value) {
  if (!value) return '';
  const text = String(value).trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    let year = Number(m[3]);
    if (year > 2400) year -= 543;
    return `${year}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return '';
}

function displayDate(value) {
  if (!value) return '-';
  const text = String(value);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return text;
}

function number(value) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

function money(value) {
  return Number(num(value) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(value) {
  const cleaned = String(value || '0').replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escAttr(value) {
  return esc(value).replace(/`/g, '&#096;');
}

/* ================================================
   TOP 5 ACTORS & SHIFT & QUALITY ANALYSIS
   ================================================ */
function renderTop5Actors(records) {
  const map = new Map();
  records.forEach((r) => {
    const actor = String(r.actor || '').trim() || 'ไม่ระบุผู้กระทำ';
    const aff = String(r.affiliation || '').trim();
    const key = actor;
    if (!map.has(key)) {
      map.set(key, {
        label: actor,
        sub: aff || 'ไม่ระบุสังกัด',
        count: 0,
        qty: 0,
        value: 0
      });
    }
    const e = map.get(key);
    e.count++;
    e.qty += num(r.quantity);
    e.value += num(r.totalValue);
  });
  
  const sorted = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  
  const box = $('top5Actors');
  if (!box) return;
  if (!sorted.length) {
    box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>';
    return;
  }
  
  const RANK_CLASS = ['r1', 'r2', 'r3', '', ''];
  box.innerHTML = sorted.map((item, i) => `
    <div class="top5-item">
      <span class="top5-rank ${RANK_CLASS[i] || ''}">${i + 1}</span>
      <div class="top5-info">
        <b>${esc(item.label)}</b>
        <p>${esc(item.sub)}</p>
      </div>
      <div class="top5-stats">
        <b class="top5-count">${item.count}</b>
        <span class="top5-unit">${number(item.qty)} หน่วย</span>
      </div>
    </div>
  `).join('');
}

function renderShiftAnalysis(records) {
  // วิเคราะห์ตามกะ (Shift Case Bars)
  const shiftMap = new Map();
  records.forEach((r) => {
    let s = String(r.shift || '').trim();
    if (!s) return;
    if (s === 'A' || s === 'กะ A') s = 'กะ A';
    else if (s === 'B' || s === 'กะ B') s = 'กะ B';
    
    shiftMap.set(s, (shiftMap.get(s) || 0) + 1);
  });
  
  const shiftItems = [...shiftMap.entries()]
    .map(([label, value]) => ({ label, value, sub: '' }))
    .sort((a, b) => b.value - a.value);

  renderValueBars('shiftCaseBars', shiftItems, false);

  // วิเคราะห์หมู่เสียหาย (Group Case Bars)
  const groupMap = new Map();
  records.forEach((r) => {
    const g = String(r.damageGroup || '').trim() || 'ไม่ระบุกลุ่ม';
    groupMap.set(g, (groupMap.get(g) || 0) + 1);
  });
  
  const groupItems = [...groupMap.entries()]
    .map(([label, value]) => ({ label, value, sub: '' }))
    .sort((a, b) => b.value - a.value);

  renderValueBars('groupCaseBars', groupItems, false);
}

function renderShiftDetail(records) {
  const shifts = ['B', 'A']; // Show B then A
  
  const cardsHtml = shifts.map((shCode) => {
    const label = shCode === 'B' ? 'กะ B' : 'กะ A';
    const shRecords = records.filter((r) => {
      const s = String(r.shift || '').trim();
      return s === shCode || s === 'กะ ' + shCode;
    });
    
    const cases = shRecords.length;
    const qty = shRecords.reduce((sum, r) => sum + num(r.quantity), 0);
    const value = shRecords.reduce((sum, r) => sum + num(r.totalValue), 0);
    
    const buCounts = groupCount(shRecords, 'bu');
    const topBu = buCounts[0] ? buCounts[0].label : 'ไม่มี';
    
    const typeCounts = groupCount(shRecords, 'damageType');
    const topType = typeCounts[0] ? typeCounts[0].label : 'ไม่มี';
    
    const prodCounts = groupByProduct(shRecords);
    const topProd = prodCounts[0] ? prodCounts[0].label : 'ไม่มี';
    
    return `
      <div class="shift-card">
        <div class="shift-card-head">
          <h4>${esc(label)}</h4>
          <span class="chip ${shCode === 'B' ? 'blue' : 'purple'}">กะทำงาน</span>
        </div>
        <div class="shift-card-body">
          <div class="shift-stat-grid">
            <div class="shift-stat-item">
              <span>จำนวนเคส</span>
              <b>${number(cases)} เคส</b>
            </div>
            <div class="shift-stat-item">
              <span>จำนวนชิ้น</span>
              <b>${number(qty)} ชิ้น</b>
            </div>
            <div class="shift-stat-item">
              <span>มูลค่ารวม</span>
              <b class="purple-text">${money(value)} บ.</b>
            </div>
          </div>
          <div class="shift-meta-list">
            <div class="shift-meta-item">
              <span class="meta-label">BU หลัก:</span>
              <span class="meta-val">${esc(topBu)}</span>
            </div>
            <div class="shift-meta-item">
              <span class="meta-label">ประเภทหลัก:</span>
              <span class="meta-val">${esc(topType)}</span>
            </div>
            <div class="shift-meta-item">
              <span class="meta-label">สินค้าหลัก:</span>
              <span class="meta-val" title="${escAttr(topProd)}">${esc(topProd)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  const detailEl = $('shiftDetailCards');
  if (detailEl) detailEl.innerHTML = cardsHtml;
  
  const RANK_CLASS = ['r1', 'r2', 'r3', '', ''];
  const renderTop5ForShift = (id, shCode) => {
    const shRecords = records.filter((r) => {
      const s = String(r.shift || '').trim();
      return s === shCode || s === 'กะ ' + shCode;
    });
    const byCount = groupByProduct(shRecords).slice(0, 5);
    const box = $(id);
    if (!box) return;
    if (!byCount.length) {
      box.innerHTML = '<div class="empty">ไม่มีข้อมูล</div>';
      return;
    }
    box.innerHTML = byCount.map((item, i) => `
      <div class="top5-item">
        <span class="top5-rank ${RANK_CLASS[i] || ''}">${i + 1}</span>
        <div class="top5-info">
          <b>${esc(item.label)}</b>
          <p>${esc(item.sub || item.barcode || '')}</p>
        </div>
        <div class="top5-stats">
          <b class="top5-count">${item.count}</b>
          <span class="top5-unit">${number(item.qty)} หน่วย</span>
        </div>
      </div>
    `).join('');
  };
  
  renderTop5ForShift('shiftBTop5', 'B');
  renderTop5ForShift('shiftATop5', 'A');
}

function renderShiftMatrix(records) {
  const box = $('shiftMatrix');
  if (!box) return;
  
  const types = state.options.damageTypes || [];
  const shifts = ['B', 'A'];
  
  const matrix = {};
  let maxCount = 0;
  
  types.forEach((t) => {
    matrix[t] = {};
    shifts.forEach((s) => {
      matrix[t][s] = 0;
    });
  });
  
  records.forEach((r) => {
    let s = String(r.shift || '').trim();
    if (s === 'A' || s === 'กะ A') s = 'A';
    else if (s === 'B' || s === 'กะ B') s = 'B';
    
    const t = String(r.damageType || '').trim();
    if (matrix[t] && matrix[t][s] !== undefined) {
      matrix[t][s]++;
      if (matrix[t][s] > maxCount) maxCount = matrix[t][s];
    }
  });
  
  if (maxCount === 0) maxCount = 1;
  
  let html = `
    <thead>
      <tr>
        <th>ประเภทสินค้า</th>
        <th>กะ B (เคส)</th>
        <th>กะ A (เคส)</th>
      </tr>
    </thead>
    <tbody>
  `;
  
  types.forEach((t) => {
    html += `<tr><td class="matrix-type-label"><b>${esc(t)}</b></td>`;
    shifts.forEach((s) => {
      const count = matrix[t][s];
      const ratio = count / maxCount;
      const bg = count > 0 ? `rgba(59, 130, 246, ${Math.max(0.06, ratio * 0.95)})` : 'transparent';
      const color = count > 0 ? (ratio > 0.5 ? '#1e3a8a' : '#1e3a8a') : 'var(--muted)';
      const style = count > 0 ? `style="background:${bg};color:${color};font-weight:900;"` : 'style="color:var(--muted); opacity: 0.5;"';
      html += `<td class="matrix-cell" ${style}>${count}</td>`;
    });
    html += `</tr>`;
  });
  
  html += `</tbody>`;
  box.innerHTML = html;
}

function renderQualityAlerts(records) {
  const box = $('qualityAlerts');
  if (!box) return;
  
  const alerts = [];
  
  const noBarcodeImg = records.filter((r) => !r.image1 || !r.image1.hasImage);
  if (noBarcodeImg.length > 0) {
    alerts.push({
      type: 'warning',
      icon: '📷',
      title: 'ขาดรูปภาพ Barcode',
      desc: `พบ ${noBarcodeImg.length} เคสที่ไม่มีการแนบรูปภาพบาร์โค้ดสินค้า`
    });
  }
  
  const noProductImg = records.filter((r) => !r.image2 || !r.image2.hasImage);
  if (noProductImg.length > 0) {
    alerts.push({
      type: 'warning',
      icon: '📦',
      title: 'ขาดรูปภาพลักษณะสินค้าเสียหาย',
      desc: `พบ ${noProductImg.length} เคสที่ไม่ได้ถ่ายลักษณะความเสียหายจริง`
    });
  }

  const noActor = records.filter((r) => {
    const act = String(r.actor || '').trim();
    return !act || act.includes('ไม่ทราบ') || act.includes('ไม่พบ');
  });
  if (noActor.length > 0) {
    alerts.push({
      type: 'danger',
      icon: '👤',
      title: 'ไม่ทราบผู้เกี่ยวข้อง / ผู้กระทำ',
      desc: `พบ ${noActor.length} เคสที่ไม่ระบุชื่อผู้กระทำหรือเลือกไม่พบผู้เกี่ยวข้อง`
    });
  }

  const noEmpId = records.filter((r) => {
    const act = String(r.actor || '').trim();
    const hasActorName = act && !act.includes('ไม่ทราบ') && !act.includes('ไม่พบ');
    return hasActorName && !String(r.employeeId || '').trim();
  });
  if (noEmpId.length > 0) {
    alerts.push({
      type: 'info',
      icon: '🆔',
      title: 'มีชื่อผู้เกี่ยวข้องแต่ไม่มีรหัสพนักงาน',
      desc: `พบ ${noEmpId.length} เคสที่มีชื่อผู้กระทำแต่ขาดรหัสพนักงาน`
    });
  }

  const noValue = records.filter((r) => num(r.totalValue) === 0);
  if (noValue.length > 0) {
    alerts.push({
      type: 'danger',
      icon: '💰',
      title: 'ไม่พบราคาทุนสินค้า / มูลค่าเป็น 0',
      desc: `พบ ${noValue.length} เคสที่มีมูลค่าความเสียหายเป็น 0`
    });
  }
  
  if (!alerts.length) {
    box.innerHTML = `
      <div class="quality-success-alert">
        <span class="alert-icon">✨</span>
        <div>
          <b>ข้อมูลสมบูรณ์ 100%!</b>
          <p>ทุกเคสมีรูปภาพครบถ้วน ระบุตัวผู้กระทำ และมีมูลค่าความเสียหายครบทุกรายการ</p>
        </div>
      </div>
    `;
    return;
  }
  
  box.innerHTML = alerts.map((alert) => `
    <div class="q-alert-card ${alert.type}">
      <span class="q-alert-icon">${alert.icon}</span>
      <div class="q-alert-text">
        <b>${esc(alert.title)}</b>
        <p>${esc(alert.desc)}</p>
      </div>
    </div>
  `).join('');
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ================================================
   REPORT EXPORT UTILITIES (EXCEL, PDF, SCREENSHOTS)
   ================================================ */

function exportToExcel(records, baseFilename) {
  try {
    if (typeof XLSX === 'undefined') {
      alert('ไม่สามารถส่งออก Excel ได้ เนื่องจากไลบรารี XLSX ไม่โหลด (กรุณาเช็กว่าคอมพิวเตอร์เชื่อมต่ออินเทอร์เน็ตอยู่หรือไม่)');
      return;
    }
    
    if (!records || !records.length) {
      toast('ไม่มีข้อมูลที่จะส่งออก', 'warn');
      return;
    }
    
    // Create mapping from headers to record values
    const headers = [
      'แถว', 'วันที่', 'BU', 'บาร์โค้ด', 'รหัสสินค้า', 'ชื่อสินค้า',
      'รูป Barcode', 'รูปสินค้า', 'รูปวันหมดอายุ', 'ประเภทสินค้า',
      'ลักษณะสินค้า', 'วันหมดอายุ', 'กลุ่ม เสียหาย', 'เลขกล่อง',
      'จำนวน', 'หน่วย', 'เวลาที่ได้รับแจ้ง', 'กะ', 'ผู้กระทำ',
      'รหัสพนักงาน', 'สังกัด', 'หมายเหตุ', 'กลุ่มสินค้าทางบัญชี',
      'มูลค่าต่อหน่วย', 'มูลค่ารวม'
    ];

    const data = records.map(r => [
      r.rowNumber ? Number(r.rowNumber) : '',
      r.date || '',
      r.bu || '',
      r.barcode || '',
      r.itemCode || '',
      r.itemName || '',
      r.image1 && r.image1.url ? r.image1.url : '',
      r.image2 && r.image2.url ? r.image2.url : '',
      r.image3 && r.image3.url ? r.image3.url : '',
      r.damageType || '',
      r.damageDescription || '',
      r.expiryDate || '',
      r.damageGroup || '',
      r.boxNo || '',
      num(r.quantity),
      r.unit || '',
      r.reportTime || '',
      r.shift || '',
      r.actor || '',
      r.employeeId || '',
      r.affiliation || '',
      r.note || '',
      r.accountGroup || '',
      num(r.unitCost),
      num(r.totalValue)
    ]);

    // Prepend headers to data
    const sheetData = [headers, ...data];

    // Create worksheet and workbook
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Damage_Data');

    // Format columns auto-width
    const wscols = headers.map(h => ({ wch: Math.max(h.length * 2, 10) }));
    for (let col = 0; col < headers.length; col++) {
      let maxLen = headers[col].length;
      for (let row = 0; row < data.length; row++) {
        const val = String(data[row][col] || '');
        if (val.length > maxLen) maxLen = val.length;
      }
      wscols[col] = { wch: Math.min(Math.max(maxLen + 2, 8), 50) };
    }
    ws['!cols'] = wscols;

    // Build filename with date/time
    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
    const filename = `${baseFilename}_${dateStr}.xlsx`;

    // Save Excel file
    XLSX.writeFile(wb, filename);
    toast(`ส่งออก Excel สำเร็จ: ${filename}`, 'ok');
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการดึง Excel: ' + err.message + '\n\n' + err.stack);
  }
}

function html2canvasWithCanvasFix(element, options = {}) {
  const canvases = document.querySelectorAll('canvas');
  const svgs = document.querySelectorAll('svg');
  
  const replacements = [];
  const svgReplacements = [];

  // 1. Substitute Canvas elements with static images
  try {
    canvases.forEach(canvas => {
      const parent = canvas.parentNode;
      const nextSibling = canvas.nextSibling;
      
      if (parent) {
        if (canvas.width > 0 && canvas.height > 0) {
          try {
            const img = document.createElement('img');
            img.src = canvas.toDataURL('image/png');
            img.style.width = canvas.style.width || (canvas.width + 'px');
            img.style.height = canvas.style.height || (canvas.height + 'px');
            img.style.display = canvas.style.display || 'block';
            img.className = canvas.className;
            
            parent.insertBefore(img, canvas);
            parent.removeChild(canvas);
            replacements.push({ canvas, img, parent, nextSibling });
          } catch (e) {
            parent.removeChild(canvas);
            replacements.push({ canvas, img: null, parent, nextSibling });
          }
        } else {
          // Remove 0x0 size canvas to prevent html2canvas clone crash
          parent.removeChild(canvas);
          replacements.push({ canvas, img: null, parent, nextSibling });
        }
      }
    });
  } catch (e) {
    console.warn('Failed to substitute canvases with images:', e);
  }

  // 2. Add temporary width and height attributes to SVG elements lacking them
  try {
    svgs.forEach(svg => {
      const rect = svg.getBoundingClientRect();
      const w = rect.width || 100;
      const h = rect.height || 100;
      
      const hasWidth = svg.hasAttribute('width');
      const hasHeight = svg.hasAttribute('height');
      
      if (!hasWidth || !hasHeight) {
        const originalWidth = svg.getAttribute('width');
        const originalHeight = svg.getAttribute('height');
        
        svg.setAttribute('width', hasWidth ? originalWidth : String(w));
        svg.setAttribute('height', hasHeight ? originalHeight : String(h));
        
        svgReplacements.push({
          svg,
          originalWidth,
          originalHeight,
          hadWidth: hasWidth,
          hadHeight: hasHeight
        });
      }
    });
  } catch (e) {
    console.warn('Failed to fix SVGs for html2canvas:', e);
  }

  const cleanUp = () => {
    // Restore canvases
    replacements.forEach(({ canvas, img, parent, nextSibling }) => {
      if (img && img.parentNode === parent) {
        parent.insertBefore(canvas, img);
        parent.removeChild(img);
      } else if (!img && parent) {
        if (nextSibling && nextSibling.parentNode === parent) {
          parent.insertBefore(canvas, nextSibling);
        } else {
          parent.appendChild(canvas);
        }
      }
    });

    // Restore SVG attributes
    svgReplacements.forEach(({ svg, originalWidth, originalHeight, hadWidth, hadHeight }) => {
      if (!hadWidth) {
        svg.removeAttribute('width');
      } else {
        svg.setAttribute('width', originalWidth);
      }
      if (!hadHeight) {
        svg.removeAttribute('height');
      } else {
        svg.setAttribute('height', originalHeight);
      }
    });
  };

  return html2canvas(element, options).then(resultCanvas => {
    cleanUp();
    return resultCanvas;
  }).catch(err => {
    cleanUp();
    throw err;
  });
}


function exportSectionToImage(elementId, filenamePrefix) {
  try {
    if (typeof html2canvas === 'undefined') {
      alert('ไม่สามารถจับภาพได้ เนื่องจากไลบรารี html2canvas ไม่โหลด (กรุณาเช็กการเชื่อมต่ออินเทอร์เน็ต)');
      return;
    }

    const el = $(elementId);
    if (!el) {
      toast('ไม่พบหัวข้อที่ต้องการจับภาพ', 'bad');
      return;
    }

    loading(true);
    
    // Wait short delay for layout to settle
    setTimeout(() => {
      html2canvasWithCanvasFix(el, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
        const filename = `${filenamePrefix}_${dateStr}.png`;
        
        const link = document.createElement('a');
        link.href = imgData;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        loading(false);
        toast(`บันทึกรูปสำเร็จ: ${filename}`, 'ok');
      }).catch(err => {
        loading(false);
        alert('เกิดข้อผิดพลาดในการจับภาพ Canvas: ' + err.message + '\n\n' + err.stack);
      });
    }, 100);
  } catch (err) {
    loading(false);
    alert('เกิดข้อผิดพลาดในการจับภาพ: ' + err.message + '\n\n' + err.stack);
  }
}

function exportFullDashboardImage() {
  try {
    if (typeof html2canvas === 'undefined') {
      alert('ไม่สามารถจับภาพได้ เนื่องจากไลบรารี html2canvas ไม่โหลด (กรุณาเช็กการเชื่อมต่ออินเทอร์เน็ต)');
      return;
    }

    const page = document.querySelector('#dashboardPage .dashboard-page');
    const toolbar = document.querySelector('#dashboardPage .dashboard-toolbar');
    const exportRow = document.querySelector('#dashboardPage .dash-export-row');
    
    if (!page) {
      toast('ไม่พบหน้า Dashboard', 'bad');
      return;
    }

    // Hide controls before capture
    if (toolbar) toolbar.style.display = 'none';
    if (exportRow) exportRow.style.display = 'none';
    
    // Also temporarily hide individual capture buttons
    const captureBtns = document.querySelectorAll('.btn-capture');
    captureBtns.forEach(btn => btn.style.display = 'none');

    loading(true);
    
    setTimeout(() => {
      html2canvasWithCanvasFix(page, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false
      }).then(canvas => {
        // Restore controls
        if (toolbar) toolbar.style.display = '';
        if (exportRow) exportRow.style.display = '';
        captureBtns.forEach(btn => btn.style.display = '');

        const imgData = canvas.toDataURL('image/png');
        const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
        const filename = `Dashboard_Full_Report_${dateStr}.png`;
        
        const link = document.createElement('a');
        link.href = imgData;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        loading(false);
        toast(`บันทึกรูปภาพ Dashboard สำเร็จ`, 'ok');
      }).catch(err => {
        // Restore controls
        if (toolbar) toolbar.style.display = '';
        if (exportRow) exportRow.style.display = '';
        captureBtns.forEach(btn => btn.style.display = '');
        
        loading(false);
        alert('เกิดข้อผิดพลาดในการเซฟภาพ Dashboard: ' + err.message + '\n\n' + err.stack);
      });
    }, 150);
  } catch (err) {
    loading(false);
    alert('เกิดข้อผิดพลาดในการบันทึกภาพแดชบอร์ด: ' + err.message + '\n\n' + err.stack);
  }
}

async function exportDashboardToPDF() {
  try {
    if (typeof html2canvas === 'undefined') {
      alert('ไม่สามารถสร้าง PDF ได้ เนื่องจากไลบรารี html2canvas ไม่โหลด (กรุณาเช็กการเชื่อมต่ออินเทอร์เน็ต)');
      return;
    }
    if (typeof window.jspdf === 'undefined') {
      alert('ไม่สามารถสร้าง PDF ได้ เนื่องจากไลบรารี jsPDF ไม่โหลด (กรุณาเช็กการเชื่อมต่ออินเทอร์เน็ต)');
      return;
    }

    const sections = [
      { id: 'section-overview', name: 'สรุปภาพรวมและ KPI' },
      { id: 'section-charts', name: 'แนวโน้มความเสียหายและสถิติหลัก' },
      { id: 'section-bu', name: 'วิเคราะห์หน่วยธุรกิจ (BU)' },
      { id: 'section-products', name: 'วิเคราะห์สินค้าและลักษณะเสียหาย' },
      { id: 'section-shifts', name: 'วิเคราะห์กะและปฏิบัติงาน' },
      { id: 'section-people', name: 'วิเคราะห์บุคคลและคุณภาพข้อมูล' }
    ];

    const activeSections = sections.filter(sec => $(sec.id));
    if (!activeSections.length) {
      toast('ไม่พบข้อมูลที่จะส่งออกเป็น PDF', 'bad');
      return;
    }

    loading(true);
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth(); // 210
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297
    const margin = 10;
    const targetWidth = pageWidth - (margin * 2); // 190

    // Hide capture buttons during PDF generation
    const captureBtns = document.querySelectorAll('.btn-capture');
    captureBtns.forEach(btn => btn.style.display = 'none');

    for (let i = 0; i < activeSections.length; i++) {
      const section = activeSections[i];
      const el = $(section.id);
      
      const canvas = await html2canvasWithCanvasFix(el, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const ratio = imgHeightPx / imgWidthPx;
      const displayHeight = targetWidth * ratio;

      if (i > 0) {
        pdf.addPage();
      }
      
      // Page Header
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`รายงานสรุปสินค้าเสียหาย (Damage 2026) - ${section.name}`, margin, margin - 2);
      
      // Handle scaling if height overflows page
      let finalHeight = displayHeight;
      if (displayHeight > (pageHeight - (margin * 2.5))) {
        finalHeight = pageHeight - (margin * 2.5);
      }
      
      pdf.addImage(imgData, 'JPEG', margin, margin, targetWidth, finalHeight);
      
      // Page Footer
      pdf.setFontSize(8);
      pdf.setTextColor(180, 180, 180);
      pdf.text(`หน้า ${i + 1} จาก ${activeSections.length} · พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH')}`, margin, pageHeight - 5);
    }

    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
    const filename = `Damage_Dashboard_Report_${dateStr}.pdf`;
    pdf.save(filename);
    
    toast(`ดาวน์โหลด PDF รายงานสำเร็จ: ${filename}`, 'ok');
  } catch (err) {
    alert('เกิดข้อผิดพลาดขณะสร้าง PDF: ' + err.message + '\n\n' + err.stack);
  } finally {
    const captureBtns = document.querySelectorAll('.btn-capture');
    captureBtns.forEach(btn => btn.style.display = '');
    loading(false);
  }
}
