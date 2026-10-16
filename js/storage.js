/**
 * storage.js - Hybrid LocalStorage & Cloudflare D1 Database Adapter
 * Seamlessly works offline and syncs in real-time with Cloudflare D1 SQLite!
 */

const STORAGE_KEY = 'LUNCH_TRACKER_PRO_DATA_V1';

const DEFAULT_SETTINGS = {
  mealPrice: 30000,
  workdays: [1, 2, 3, 4, 5],
  bankInfo: {
    bankCode: 'MB',
    accountNumber: '7700113959999',
    accountName: 'TRUONG THI BICH PHUONG'
  },
  theme: 'light'
};

const Storage = {
  isCloud: false,
  cloudChecked: false,

  /**
   * Check connection to Cloudflare D1 Backend
   */
  async checkCloudConnection(yearMonth) {
    if (window.location.protocol === 'file:') {
      this.isCloud = false;
      this.updateCloudStatusBadge(false);
      return false;
    }

    try {
      const ym = yearMonth || new Date().toISOString().slice(0, 7);
      const res = await fetch(`/api/bootstrap?month=${ym}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          this.isCloud = true;
          this.updateCloudStatusBadge(true);
          
          // Merge remote D1 data into LocalStorage cache
          const local = this.loadData();
          local.settings = { ...local.settings, ...json.settings };
          local.members = json.members || [];
          local.records = { ...local.records, ...(json.records || {}) };
          local.payments[ym] = json.payments || {};

          this.saveData(local);
          return true;
        }
      }
    } catch (e) {
      console.warn('Running in offline LocalStorage mode:', e.message);
    }

    this.isCloud = false;
    this.updateCloudStatusBadge(false);
    return false;
  },

  updateCloudStatusBadge(isOnline) {
    let badge = document.getElementById('cloudStatusIndicator');
    if (!badge) {
      const headerActions = document.querySelector('.header-actions');
      if (headerActions) {
        badge = document.createElement('div');
        badge.id = 'cloudStatusIndicator';
        badge.className = 'price-chip';
        badge.style.cursor = 'default';
        headerActions.insertBefore(badge, headerActions.firstChild);
      }
    }

    if (badge) {
      if (isOnline) {
        badge.innerHTML = `<span style="font-size:11px;">☁️ D1 Cloud</span>`;
        badge.style.background = 'var(--primary-50)';
        badge.style.borderColor = 'var(--primary-200)';
        badge.style.color = 'var(--primary-700)';
        badge.title = 'Đã kết nối cơ sở dữ liệu Cloudflare D1 (SQLite trên mây). Dữ liệu được đồng bộ thời gian thực!';
      } else {
        badge.innerHTML = `<span style="font-size:11px;">💾 Local</span>`;
        badge.style.background = 'var(--bg-surface-subtle)';
        badge.style.borderColor = 'var(--border-default)';
        badge.style.color = 'var(--text-muted)';
        badge.title = 'Đang lưu trữ ngoại tuyến tại trình duyệt máy này (LocalStorage).';
      }
    }
  },

  /**
   * Load entire application data from cache
   */
  loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.initDefaultData();
      }
      const data = JSON.parse(raw);
      
      if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
      if (!data.members) data.members = [];
      if (!data.records) data.records = {};
      if (!data.payments) data.payments = {};
      
      return data;
    } catch (err) {
      console.error('Failed to load data:', err);
      return this.initDefaultData();
    }
  },

  saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('Failed to save data:', err);
      return false;
    }
  },

  initDefaultData() {
    const initialData = {
      settings: { ...DEFAULT_SETTINGS },
      members: [],
      records: {},
      payments: {}
    };
    this.saveData(initialData);
    return initialData;
  },

  /* ================= MEMBER CRUD ================= */
  getMembers() {
    const data = this.loadData();
    return data.members || [];
  },

  getMemberById(id) {
    const members = this.getMembers();
    return members.find(m => m.id === id) || null;
  },

  addMember(memberData) {
    const data = this.loadData();
    const newMember = {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: memberData.name.trim(),
      phone: (memberData.phone || '').trim(),
      note: (memberData.note || '').trim(),
      active: memberData.active !== false,
      createdAt: new Date().toISOString()
    };
    data.members.push(newMember);
    this.saveData(data);

    if (this.isCloud) {
      fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember)
      }).catch(err => console.error('Cloud sync error:', err));
    }

    return newMember;
  },

  updateMember(id, updateFields) {
    const data = this.loadData();
    const idx = data.members.findIndex(m => m.id === id);
    if (idx !== -1) {
      data.members[idx] = {
        ...data.members[idx],
        ...updateFields,
        name: updateFields.name ? updateFields.name.trim() : data.members[idx].name,
        phone: updateFields.phone !== undefined ? updateFields.phone.trim() : data.members[idx].phone,
        note: updateFields.note !== undefined ? updateFields.note.trim() : data.members[idx].note,
        updatedAt: new Date().toISOString()
      };
      this.saveData(data);

      if (this.isCloud) {
        fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.members[idx])
        }).catch(err => console.error('Cloud sync error:', err));
      }

      return data.members[idx];
    }
    return null;
  },

  deleteMember(id) {
    const data = this.loadData();
    data.members = data.members.filter(m => m.id !== id);
    this.saveData(data);

    if (this.isCloud) {
      fetch(`/api/members/${id}`, { method: 'DELETE' })
        .catch(err => console.error('Cloud sync error:', err));
    }

    return true;
  },

  /* ================= DAILY RECORDS CRUD ================= */
  getDayRecords(dateStr) {
    const data = this.loadData();
    return data.records[dateStr] || {};
  },

  setRecord(dateStr, memberId, recordObj) {
    const data = this.loadData();
    if (!data.records[dateStr]) {
      data.records[dateStr] = {};
    }

    const count = recordObj ? Number(recordObj.count) || 0 : 0;
    const note = recordObj ? (recordObj.note || '').trim() : '';
    const price = (recordObj && recordObj.price !== undefined && recordObj.price !== null && recordObj.price !== '') ? Number(recordObj.price) : null;

    if (count <= 0) {
      delete data.records[dateStr][memberId];
      if (Object.keys(data.records[dateStr]).length === 0) {
        delete data.records[dateStr];
      }
    } else {
      const entry = { count, note };
      if (price !== null && price > 0) entry.price = price;
      data.records[dateStr][memberId] = entry;
    }

    this.saveData(data);

    if (this.isCloud) {
      fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, memberId, count, note, price })
      }).catch(err => console.error('Cloud sync error:', err));
    }
  },

  batchSetRecords(updates) {
    const data = this.loadData();
    updates.forEach(u => {
      const { date, memberId, count, note } = u;
      if (!data.records[date]) data.records[date] = {};
      if (count <= 0) {
        delete data.records[date][memberId];
        if (Object.keys(data.records[date]).length === 0) delete data.records[date];
      } else {
        data.records[date][memberId] = { count, note: note || '' };
      }
    });
    this.saveData(data);

    if (this.isCloud && updates.length > 0) {
      fetch('/api/records/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      }).catch(err => console.error('Cloud sync error:', err));
    }
  },

  toggleRecord(dateStr, memberId) {
    const current = this.getDayRecords(dateStr)[memberId];
    if (current && current.count > 0) {
      this.setRecord(dateStr, memberId, null);
      return 0;
    } else {
      this.setRecord(dateStr, memberId, { count: 1, note: '' });
      return 1;
    }
  },

  getMonthRecords(yearMonth) {
    const data = this.loadData();
    const result = {};
    Object.keys(data.records).forEach(d => {
      if (d.startsWith(yearMonth)) {
        result[d] = data.records[d];
      }
    });
    return result;
  },

  /* ================= PAYMENTS CRUD ================= */
  getMonthPayments(yearMonth) {
    const data = this.loadData();
    return data.payments[yearMonth] || {};
  },

  getMemberPayment(yearMonth, memberId) {
    const payments = this.getMonthPayments(yearMonth);
    const p = payments[memberId] || { paid: 0, status: 'unpaid', history: [] };
    if (p.paid > 0 && (!p.history || p.history.length === 0)) {
      p.history = [{
        id: 'pay_legacy_' + memberId,
        amount: Number(p.paid) || 0,
        method: 'bank',
        note: 'Khoản thu đã ghi nhận',
        date: `${yearMonth}-01`,
        createdAt: new Date().toISOString()
      }];
    }
    return p;
  },

  recordPayment(yearMonth, memberId, amount, method = 'bank', note = '', date = '') {
    const data = this.loadData();
    if (!data.payments[yearMonth]) {
      data.payments[yearMonth] = {};
    }

    const current = data.payments[yearMonth][memberId] || { paid: 0, history: [] };
    const numericAmount = Math.max(0, Number(amount) || 0);

    let existingHistory = Array.isArray(current.history) ? [...current.history] : [];
    if (existingHistory.length === 0 && current.paid > 0) {
      existingHistory = [{
        id: 'pay_legacy_' + Date.now(),
        amount: Number(current.paid) || 0,
        method: 'bank',
        note: 'Đã nộp trước đó',
        date: `${yearMonth}-01`,
        createdAt: new Date().toISOString()
      }];
    }

    const historyItem = {
      id: 'pay_' + Date.now(),
      amount: numericAmount,
      method: method,
      note: note.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    const updatedHistory = [...existingHistory, historyItem];
    const newPaid = updatedHistory.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

    data.payments[yearMonth][memberId] = {
      paid: newPaid,
      history: updatedHistory,
      lastUpdated: new Date().toISOString()
    };

    this.saveData(data);

    if (this.isCloud) {
      fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearMonth,
          memberId,
          amount: numericAmount,
          method,
          note,
          date
        })
      }).catch(err => console.error('Cloud sync error:', err));
    }

    return data.payments[yearMonth][memberId];
  },

  deletePayment(yearMonth, memberId) {
    const data = this.loadData();
    if (data.payments[yearMonth] && data.payments[yearMonth][memberId]) {
      data.payments[yearMonth][memberId] = { paid: 0, history: [], lastUpdated: new Date().toISOString() };
      this.saveData(data);
    }

    if (this.isCloud) {
      fetch(`/api/payments/${yearMonth}/${memberId}`, { method: 'DELETE' })
        .catch(err => console.error('Cloud delete payment error:', err));
    }

    return true;
  },

  deletePaymentHistoryItem(yearMonth, memberId, historyId) {
    const data = this.loadData();
    if (data.payments[yearMonth] && data.payments[yearMonth][memberId]) {
      const current = data.payments[yearMonth][memberId];
      const updatedHistory = (current.history || []).filter(h => h.id !== historyId);
      const newPaid = updatedHistory.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
      data.payments[yearMonth][memberId] = {
        paid: newPaid,
        history: updatedHistory,
        lastUpdated: new Date().toISOString()
      };
      this.saveData(data);
    }

    if (this.isCloud) {
      fetch(`/api/payments/${yearMonth}/${memberId}/${historyId}`, { method: 'DELETE' })
        .catch(err => console.error('Cloud delete history error:', err));
    }

    return true;
  },

  /* ================= SETTINGS ================= */
  getSettings() {
    const data = this.loadData();
    const settings = data.settings || { ...DEFAULT_SETTINGS };
    if (window.AppConfig && window.AppConfig.bankInfo) {
      settings.bankInfo = { ...window.AppConfig.bankInfo };
    }
    return settings;
  },

  updateSettings(newSettings) {
    const data = this.loadData();
    // Khóa không cho phép sửa đổi thông tin ngân hàng qua client/giao diện
    const safeSettings = { ...newSettings };
    delete safeSettings.bankInfo;

    data.settings = { ...data.settings, ...safeSettings };
    if (window.AppConfig && window.AppConfig.bankInfo) {
      data.settings.bankInfo = { ...window.AppConfig.bankInfo };
    }
    this.saveData(data);

    if (this.isCloud) {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(safeSettings)
      }).catch(err => console.error('Cloud sync error:', err));
    }

    return data.settings;
  }
};

window.Storage = Storage;
