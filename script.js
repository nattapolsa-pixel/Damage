const DEFAULT_CONFIG = {
  apiUrl: '',
  appName: 'Damage 2026 Form',
  maxImageWidth: 1280,
  imageQuality: 0.78,
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
  dashboardRecords: [],
  images: {
    imageBarcode: '',
    imageProduct: '',
    imageExpiry: ''
  },
  productSearchTimer: null,
  costTimer: null,
  toastTimer: null
};

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  bindTabs();
  bindForm();
  bindImages();
  bindDashboard();
  bindLatest();

  await loadConfig();
  applyApiStatus();
  fillOptions(state.options);
  setTodayTime();

  if (hasApiUrl()) {
    await loadAppData();
    await refreshLatest();
    await refreshDashboard();
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

function applyApiStatus() {
  const warning = $('apiWarning');
  const apiStatus = $('apiStatus');
  if (!hasApiUrl()) {
    warning.classList.remove('hidden');
    apiStatus.textContent = 'ยังไม่ได้ตั้งค่า API URL';
    apiStatus.style.color = '#92400e';
    return;
  }
  warning.classList.add('hidden');
  apiStatus.textContent = 'พร้อมเชื่อมต่อ Apps Script API';
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

  fillSelect('dashBu', ['ทั้งหมด', ...(options.bu || [])], null);
  fillSelect('dashDamageType', ['ทั้งหมด', ...(options.damageTypes || [])], null);
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
  const t = timeNow || localTimeInputValue(new Date());
  $('todayText').textContent = displayDate(d);
  $('reportTime').value = t;
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
}

function showPage(pageId) {
  document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageId));
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === pageId));
  if (pageId === 'latestPage' && hasApiUrl()) refreshLatest();
  if (pageId === 'dashboardPage' && hasApiUrl()) refreshDashboard();
}

function bindForm() {
  $('damageForm').addEventListener('submit', submitDamage);
  $('btnReset').addEventListener('click', () => resetForm());
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
        preview.removeAttribute('src');
        preview.parentElement.classList.remove('has-image');
        return;
      }
      try {
        loading(true);
        const dataUrl = await compressImage(file, state.config.maxImageWidth, state.config.imageQuality);
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
  $('btnRefreshLatest').addEventListener('click', refreshLatest);
}

function bindDashboard() {
  $('btnRefreshDashboard').addEventListener('click', refreshDashboard);
  ['dashPeriod', 'dashBu', 'dashDamageType'].forEach((id) => {
    $(id).addEventListener('change', refreshDashboard);
  });
}

async function submitDamage(event) {
  event.preventDefault();
  if (!hasApiUrl()) {
    toast('กรุณาใส่ API URL ใน config.json ก่อน', 'warn');
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
    const res = await apiPost('saveDamage', payload);
    const data = unwrapApi(res);
    toast(data.message || 'บันทึกสำเร็จ', 'ok');
    if (Array.isArray(data.latest)) {
      state.latest = data.latest;
      renderLatest(state.latest);
    } else {
      await refreshLatest();
    }
    resetForm(true);
    await refreshDashboard();
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'bad');
  } finally {
    $('btnSave').disabled = false;
    loading(false);
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
  if (!hasApiUrl()) return;
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
  if (!hasApiUrl()) return;
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
  if (!hasApiUrl() || !itemCode) {
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
}

async function refreshLatest() {
  if (!hasApiUrl()) return;
  loading(true);
  try {
    const res = await apiGet('getLatestRecords', { limit: 20 });
    const data = unwrapApi(res);
    state.latest = data.records || [];
    renderLatest(state.latest);
  } catch (err) {
    toast('โหลดข้อมูลล่าสุดไม่สำเร็จ: ' + err.message, 'bad');
  } finally {
    loading(false);
  }
}

function renderLatest(records) {
  const box = $('latestList');
  if (!records.length) {
    box.innerHTML = '<div class="empty">ยังไม่มีข้อมูล หรือยังไม่ได้เชื่อมต่อ API</div>';
    return;
  }
  box.innerHTML = records.map(recordCard).join('');
}

async function refreshDashboard() {
  if (!hasApiUrl()) return;
  loading(true);
  try {
    const payload = {
      period: val('dashPeriod') || '30',
      bu: val('dashBu') || 'ทั้งหมด',
      damageType: val('dashDamageType') || 'ทั้งหมด'
    };
    const res = await apiGet('getDashboardRecords', payload);
    const data = unwrapApi(res);
    state.dashboardRecords = data.records || [];
    renderDashboard(state.dashboardRecords);
  } catch (err) {
    toast('โหลด Dashboard ไม่สำเร็จ: ' + err.message, 'bad');
  } finally {
    loading(false);
  }
}

function renderDashboard(records) {
  const totalQty = records.reduce((sum, r) => sum + num(r.quantity), 0);
  const totalValue = records.reduce((sum, r) => sum + num(r.totalValue), 0);
  const noActor = records.filter((r) => String(r.actorType || '').includes('ไม่พบ') || String(r.actor || '').includes('ไม่ทราบ')).length;

  $('kpiCases').textContent = number(records.length);
  $('kpiQty').textContent = number(totalQty);
  $('kpiValue').textContent = money(totalValue);
  $('kpiNoActor').textContent = number(noActor);

  renderBars('topBu', groupCount(records, 'bu').slice(0, 8));
  renderBars('topType', groupCount(records, 'damageType').slice(0, 8));
  $('dashboardRows').innerHTML = records.length ? records.slice(0, 12).map(recordCard).join('') : '<div class="empty">ไม่มีข้อมูลตามเงื่อนไข</div>';
}

function groupCount(records, key) {
  const map = new Map();
  records.forEach((r) => {
    const label = r[key] || 'ไม่ระบุ';
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function renderBars(id, items) {
  const box = $(id);
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
  const imageCount = [r.image1, r.image2, r.image3].filter((img) => img && img.hasImage).length;
  return `
    <article class="record-card">
      <div class="record-head">
        <div>
          <b>${esc(r.itemName || '-')}</b>
          <p>${esc(r.barcode || '-')} • ${esc(r.itemCode || '-')}</p>
        </div>
        <span class="pill blue">Row ${esc(r.rowNumber || '-')}</span>
      </div>
      <div class="record-meta">
        <span class="pill">${esc(r.date || '-')}</span>
        <span class="pill">BU: ${esc(r.bu || '-')}</span>
        <span class="pill warn">${esc(r.damageType || '-')}</span>
        <span class="pill">จำนวน ${esc(r.quantity || '0')} ${esc(r.unit || '')}</span>
        <span class="pill ok">${esc(r.totalValue ? money(r.totalValue) : 'ไม่พบราคา')}</span>
        <span class="pill">รูป ${imageCount}</span>
      </div>
      <p>ลักษณะ: ${esc(r.damageDescription || '-')} • ผู้กระทำ: ${esc(r.actor || '-')} • หมายเหตุ: ${esc(r.note || '-')}</p>
    </article>
  `;
}

async function apiGet(action, params = {}) {
  return jsonpRequest(action, params);
}

async function apiPost(action, payload = {}) {
  const url = state.config.apiUrl;
  if (!hasApiUrl()) throw new Error('ยังไม่ได้ตั้งค่า API URL');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });

  const text = await res.text();
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
  state.images = { imageBarcode: '', imageProduct: '', imageExpiry: '' };
  ['previewBarcode', 'previewProduct', 'previewExpiry'].forEach((id) => {
    const img = $(id);
    img.removeAttribute('src');
    img.parentElement.classList.remove('has-image');
  });
  $('productResults').classList.add('hidden');
  $('employeeResults').classList.add('hidden');
  toggleOtherDamage();
  setCostPreview(0, 0, false);
  setTodayTime();
  if (!keepToast) toast('ล้างข้อมูลแล้ว', 'ok');
}

function val(id) {
  const el = $(id);
  return el ? String(el.value || '').trim() : '';
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value || '';
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
  $('loading').classList.toggle('hidden', !show);
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

function localDateInputValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
