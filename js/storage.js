/** Server-confirmed writes with a local read cache. */
const STORAGE_KEY = 'LUNCH_TRACKER_PRO_DATA_V1';
const AUTH_TOKEN_KEY = 'LUNCH_TRACKER_AUTH_TOKEN_V1';
const DEFAULT_SETTINGS = {
  mealPrice: 30000, workdays: [1, 2, 3, 4, 5], theme: 'light',
  bankInfo: { bankCode: 'MB', accountNumber: '7700113959999', accountName: 'TRUONG THI BICH PHUONG' }
};

const Storage = {
  isCloud: false,
  _queue: Promise.resolve(),

  getToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  },
  setToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  },
  clearToken() { this.setToken(''); },
  isAuthenticated() {
    const parts = this.getToken().split('.');
    const exp = Number(parts[1]);
    return parts.length === 3 && /^[a-z0-9_-]+$/.test(parts[0]) &&
      Number.isSafeInteger(exp) && exp > Date.now() && /^[a-f0-9]{64}$/.test(parts[2]);
  },
  async login(username, password) {
    if (window.location.protocol === 'file:') {
      return { success: false, error: 'Hãy mở ứng dụng qua Cloudflare Worker hoặc wrangler dev để đăng nhập.' };
    }
    try {
      const res = await this.apiFetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: String(username || '').trim().toLowerCase(), password: String(password || '') })
      });
      const data = await res.json();
      if (!data.success || !data.token) throw new Error('Phản hồi đăng nhập không hợp lệ.');
      this.setToken(data.token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  async apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      if (!res.ok) {
        if (res.status === 401 && url !== '/api/auth/login') {
          this.clearToken();
          window.App?.showLoginScreen('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
        }
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || `Không thể lưu hoặc tải dữ liệu (HTTP ${res.status}).`), { status: res.status });
      }
      return res;
    } catch (error) {
      if (error.status) throw error;
      throw new Error('Chưa xác nhận được dữ liệu với máy chủ. Hãy kiểm tra kết nối và thử lại.');
    } finally {
      clearTimeout(timeout);
    }
  },
  enqueue(operation) {
    const result = this._queue.then(operation);
    this._queue = result.catch(() => {});
    return result;
  },
  async write(url, body, method = 'POST') {
    if (window.location.protocol === 'file:') throw new Error('Cần mở ứng dụng qua máy chủ để lưu dữ liệu.');
    try {
      const res = await this.apiFetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Máy chủ chưa xác nhận lưu dữ liệu.');
      this.isCloud = true;
      this.updateCloudStatusBadge(true);
      return data;
    } catch (error) {
      this.isCloud = false;
      this.updateCloudStatusBadge(false);
      throw error;
    }
  },
  checkCloudConnection(yearMonth) {
    return this.enqueue(async () => {
      try {
        const ym = yearMonth || new Date().toISOString().slice(0, 7);
        const res = await this.apiFetch(`/api/bootstrap?month=${encodeURIComponent(ym)}`);
        const json = await res.json();
        if (!json.success) throw new Error('Không tải được dữ liệu.');
        const local = this.loadData();
        local.settings = { ...local.settings, ...json.settings };
        local.members = (json.members || []).map(m => ({ ...m, active: !!m.active }));
        // Replace the complete month, including days deleted on another device.
        Object.keys(local.records).filter(date => date.startsWith(ym + '-')).forEach(date => delete local.records[date]);
        Object.assign(local.records, json.records || {});
        local.payments[ym] = json.payments || {};
        this.saveData(local);
        for (const [memberId, payment] of Object.entries(json.payments || {})) {
          const key = this.pendingPaymentKey(ym, memberId);
          const attempt = JSON.parse(localStorage.getItem(key) || 'null');
          if (attempt && payment.history?.some(h => h.id === attempt.id)) localStorage.removeItem(key);
        }
        this.isCloud = true;
        this.updateCloudStatusBadge(true);
        return true;
      } catch (error) {
        this.isCloud = false;
        this.updateCloudStatusBadge(false);
        console.warn('Không tải được dữ liệu máy chủ:', error.message);
        return false;
      }
    });
  },
  updateCloudStatusBadge(isOnline) {
    let badge = document.getElementById('cloudStatusIndicator');
    if (!badge) {
      const actions = document.querySelector('.header-actions');
      if (!actions) return;
      badge = document.createElement('div');
      badge.id = 'cloudStatusIndicator'; badge.className = 'price-chip';
      actions.insertBefore(badge, actions.firstChild);
    }
    badge.textContent = isOnline ? '☁️ Đã kết nối' : '⚠️ Chưa kết nối';
    badge.title = isOnline ? 'Các thay đổi được xác nhận trên máy chủ trước khi báo thành công.' : 'Đang xem dữ liệu đã lưu trên máy này. Cần kết nối máy chủ để lưu thay đổi.';
  },
  loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return { settings: { ...DEFAULT_SETTINGS, ...data.settings }, members: data.members || [], records: data.records || {}, payments: data.payments || {} };
  },
  saveData(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch { throw new Error('Không lưu được bộ nhớ trình duyệt. Hãy tải lại để kiểm tra dữ liệu trên máy chủ.'); }
  },
  createId(prefix) { return `${prefix}_${crypto.randomUUID()}`; },
  getMembers() { return this.loadData().members; },
  getMemberById(id) { return this.getMembers().find(m => m.id === id) || null; },
  addMember(memberData) {
    const member = { ...memberData, id: this.createId('m') };
    return this.enqueue(async () => {
      const result = await this.write('/api/members', member);
      const data = this.loadData();
      data.members.push(result.member);
      this.saveData(data);
      return result.member;
    });
  },
  updateMember(id, fields) {
    return this.enqueue(async () => {
      const data = this.loadData();
      const index = data.members.findIndex(m => m.id === id);
      if (index < 0) throw new Error('Không tìm thấy thành viên.');
      const result = await this.write('/api/members', { ...data.members[index], ...fields });
      data.members[index] = { ...data.members[index], ...result.member };
      this.saveData(data);
      return data.members[index];
    });
  },
  deleteMember(id) {
    return this.enqueue(async () => {
      await this.write(`/api/members/${encodeURIComponent(id)}`, undefined, 'DELETE');
      const data = this.loadData();
      data.members = data.members.filter(m => m.id !== id);
      Object.values(data.records).forEach(day => delete day[id]);
      Object.values(data.payments).forEach(month => delete month[id]);
      this.saveData(data);
      return true;
    });
  },
  getDayRecords(date) { return this.loadData().records[date] || {}; },
  normalizeRecord(record) {
    if (!record || record.clear || record.count == null || Number(record.count) < 0) return null;
    return {
      count: Math.max(0, Math.min(50, Math.floor(Number(record.count) || 0))),
      note: String(record.note || '').trim().slice(0, 255),
      price: record.price == null || record.price === '' ? null : Math.max(0, Math.min(5000000, Math.floor(Number(record.price) || 0)))
    };
  },
  applyRecord(data, date, memberId, record) {
    if (record) {
      if (!data.records[date]) data.records[date] = {};
      data.records[date][memberId] = record;
    } else if (data.records[date]) {
      delete data.records[date][memberId];
      if (!Object.keys(data.records[date]).length) delete data.records[date];
    }
  },
  setRecord(date, memberId, record) {
    return this.enqueue(async () => {
      const normalized = this.normalizeRecord(record);
      await this.write('/api/records', { date, memberId, ...(normalized || { clear: true }) });
      const data = this.loadData();
      this.applyRecord(data, date, memberId, normalized);
      this.saveData(data);
    });
  },
  batchSetRecords(updates) {
    return this.enqueue(async () => {
      for (let offset = 0; offset < updates.length; offset += 150) {
        const chunk = updates.slice(offset, offset + 150).map(u => ({ date: u.date, memberId: u.memberId, ...(this.normalizeRecord(u) || { clear: true }) }));
        await this.write('/api/records/batch', { updates: chunk });
        const data = this.loadData();
        chunk.forEach(u => this.applyRecord(data, u.date, u.memberId, this.normalizeRecord(u)));
        this.saveData(data);
      }
    });
  },
  isFutureDate(date) {
    const now = new Date();
    return date > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  },
  getUncheckedRecord(date) { return this.isFutureDate(date) ? null : { count: 0, note: '' }; },
  toggleRecord(date, memberId) {
    const record = this.getDayRecords(date)[memberId];
    return this.setRecord(date, memberId, record?.count > 0 ? this.getUncheckedRecord(date) : { count: 1, note: '' });
  },
  getMonthRecords(yearMonth) {
    return Object.fromEntries(Object.entries(this.loadData().records).filter(([date]) => date.startsWith(yearMonth + '-')));
  },
  getMonthPayments(yearMonth) { return this.loadData().payments[yearMonth] || {}; },
  getMemberPayment(yearMonth, memberId) {
    const payment = this.getMonthPayments(yearMonth)[memberId] || { paid: 0, history: [] };
    if (payment.paid > 0 && !payment.history?.length) {
      payment.history = [{ id: `pay_legacy_${memberId}`, amount: payment.paid, method: 'bank', note: 'Đã nộp trước đó', date: `${yearMonth}-01` }];
    }
    return payment;
  },
  cachePayment(yearMonth, memberId, payment) {
    const data = this.loadData();
    if (!data.payments[yearMonth]) data.payments[yearMonth] = {};
    data.payments[yearMonth][memberId] = { paid: payment.paid, history: payment.history };
    this.saveData(data);
    return data.payments[yearMonth][memberId];
  },
  pendingPaymentKey(yearMonth, memberId) { return `LUNCH_TRACKER_PENDING_PAYMENT_${yearMonth}_${memberId}`; },
  getPendingPayment(yearMonth, memberId) {
    return JSON.parse(localStorage.getItem(this.pendingPaymentKey(yearMonth, memberId)) || 'null');
  },
  recordPayment(yearMonth, memberId, amount, method = 'bank', note = '', date = '') {
    return this.enqueue(async () => {
      const input = { yearMonth, memberId, amount: Math.max(0, Math.min(50000000, Math.floor(Number(amount) || 0))), method, note: String(note).trim().slice(0, 255), date: date || new Date().toISOString().slice(0, 10) };
      const key = this.pendingPaymentKey(yearMonth, memberId);
      const previous = JSON.parse(localStorage.getItem(key) || 'null');
      if (previous && JSON.stringify(previous.input) !== JSON.stringify(input)) {
        throw new Error('Khoản thu trước chưa được xác nhận. Hãy tải lại dữ liệu hoặc gửi lại đúng khoản thu trước trước khi nhập khoản khác.');
      }
      const attempt = previous || { id: this.createId('pay'), input };
      localStorage.setItem(key, JSON.stringify(attempt));
      try {
        const payment = await this.write('/api/payments', { id: attempt.id, ...input });
        const cached = this.cachePayment(yearMonth, memberId, payment);
        localStorage.removeItem(key);
        return cached;
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 409) localStorage.removeItem(key);
        throw error;
      }
    });
  },
  deletePayment(yearMonth, memberId) {
    return this.enqueue(async () => {
      const payment = await this.write(`/api/payments/${encodeURIComponent(yearMonth)}/${encodeURIComponent(memberId)}`, undefined, 'DELETE');
      return this.cachePayment(yearMonth, memberId, payment);
    });
  },
  deletePaymentHistoryItem(yearMonth, memberId, historyId) {
    return this.enqueue(async () => {
      const payment = await this.write(`/api/payments/${encodeURIComponent(yearMonth)}/${encodeURIComponent(memberId)}/${encodeURIComponent(historyId)}`, undefined, 'DELETE');
      return this.cachePayment(yearMonth, memberId, payment);
    });
  },
  getSettings() {
    const settings = this.loadData().settings;
    if (window.AppConfig?.bankInfo) settings.bankInfo = { ...window.AppConfig.bankInfo };
    return settings;
  },
  updateSettings(fields) {
    return this.enqueue(async () => {
      const safe = {};
      if (fields.mealPrice !== undefined) safe.mealPrice = Math.max(1000, Math.min(2000000, Math.floor(Number(fields.mealPrice) || 40000)));
      if (fields.theme) safe.theme = fields.theme === 'dark' ? 'dark' : 'light';
      await this.write('/api/settings', safe);
      const data = this.loadData();
      data.settings = { ...data.settings, ...safe };
      this.saveData(data);
      return data.settings;
    });
  }
};
window.Storage = Storage;
