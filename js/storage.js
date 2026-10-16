/**
 * storage.js - LocalStorage Data Layer for Lunch Tracker
 * Manages Members, Attendance Records, Payment History, and App Settings.
 */

const STORAGE_KEY = 'LUNCH_TRACKER_PRO_DATA_V1';

const DEFAULT_SETTINGS = {
  mealPrice: 30000,
  workdays: [1, 2, 3, 4, 5], // Mon to Fri
  bankInfo: {
    bankCode: 'MB',
    accountNumber: '0987654321',
    accountName: 'NGUYEN VAN A'
  },
  theme: 'light'
};

const Storage = {
  /**
   * Load entire application data from LocalStorage
   */
  loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.initDefaultData();
      }
      const data = JSON.parse(raw);
      
      // Ensure schema completeness
      if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
      if (!data.members) data.members = [];
      if (!data.records) data.records = {};
      if (!data.payments) data.payments = {};
      
      return data;
    } catch (err) {
      console.error('Failed to load data from localStorage:', err);
      return this.initDefaultData();
    }
  },

  /**
   * Save entire application data to LocalStorage
   */
  saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('Failed to save data to localStorage:', err);
      return false;
    }
  },

  /**
   * Initialize default structure if storage is empty
   */
  initDefaultData() {
    const initialData = {
      settings: { ...DEFAULT_SETTINGS },
      members: [],
      records: {},  // key: "YYYY-MM-DD" -> { [memberId]: { count: 1, note: '' } }
      payments: {}  // key: "YYYY-MM" -> { [memberId]: { paid: 0, status: 'unpaid', history: [] } }
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
      return data.members[idx];
    }
    return null;
  },

  deleteMember(id) {
    const data = this.loadData();
    data.members = data.members.filter(m => m.id !== id);
    this.saveData(data);
    return true;
  },

  /* ================= DAILY RECORDS CRUD ================= */
  getDayRecords(dateStr) {
    const data = this.loadData();
    return data.records[dateStr] || {};
  },

  /**
   * Set record for a specific member on a specific date
   * @param {string} dateStr "YYYY-MM-DD"
   * @param {string} memberId
   * @param {object|null} recordObj { count: number, note: string } or null to remove
   */
  setRecord(dateStr, memberId, recordObj) {
    const data = this.loadData();
    if (!data.records[dateStr]) {
      data.records[dateStr] = {};
    }

    if (!recordObj || recordObj.count <= 0) {
      delete data.records[dateStr][memberId];
      if (Object.keys(data.records[dateStr]).length === 0) {
        delete data.records[dateStr];
      }
    } else {
      data.records[dateStr][memberId] = {
        count: Number(recordObj.count) || 1,
        note: (recordObj.note || '').trim()
      };
    }

    this.saveData(data);
  },

  /**
   * Toggle between 0 (not eating) and 1 (eating)
   */
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

  /**
   * Get all records for a month "YYYY-MM"
   */
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
    return payments[memberId] || { paid: 0, status: 'unpaid', history: [] };
  },

  recordPayment(yearMonth, memberId, amount, method = 'bank', note = '', date = '') {
    const data = this.loadData();
    if (!data.payments[yearMonth]) {
      data.payments[yearMonth] = {};
    }

    const current = data.payments[yearMonth][memberId] || { paid: 0, history: [] };
    const numericAmount = Math.max(0, Number(amount) || 0);

    const historyItem = {
      id: 'pay_' + Date.now(),
      amount: numericAmount,
      method: method, // 'bank' | 'cash'
      note: note.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };

    const newPaid = numericAmount; // Direct assignment of updated total paid
    const updatedHistory = [...(current.history || []), historyItem];

    data.payments[yearMonth][memberId] = {
      paid: newPaid,
      history: updatedHistory,
      lastUpdated: new Date().toISOString()
    };

    this.saveData(data);
    return data.payments[yearMonth][memberId];
  },

  /* ================= SETTINGS ================= */
  getSettings() {
    const data = this.loadData();
    return data.settings || { ...DEFAULT_SETTINGS };
  },

  updateSettings(newSettings) {
    const data = this.loadData();
    data.settings = { ...data.settings, ...newSettings };
    this.saveData(data);
    return data.settings;
  },

  /* ================= SAMPLE DATA SEEDER ================= */
  seedSampleData() {
    const data = this.loadData();
    
    // Sample members
    data.members = [
      { id: 'm1', name: 'Nguyễn Văn An', phone: '0901234567', note: 'Phòng Kỹ Thuật', active: true },
      { id: 'm2', name: 'Trần Thị Bình', phone: '0912345678', note: 'Phòng Kế Toán', active: true },
      { id: 'm3', name: 'Lê Hoàng Cường', phone: '0987654321', note: 'Phòng Kinh Doanh', active: true },
      { id: 'm4', name: 'Phạm Minh Đức', phone: '0978912345', note: 'Phòng Marketing', active: true },
      { id: 'm5', name: 'Vũ Thu Hà', phone: '0965432198', note: 'Phòng Nhân Sự', active: true },
      { id: 'm6', name: 'Đặng Quốc Huy', phone: '0933221100', note: 'Phòng Thiết Kế', active: true }
    ];

    // Seed attendance for current month
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();

    data.records = {};
    for (let day = 1; day <= Math.min(currentDay, daysInMonth); day++) {
      const dateObj = new Date(year, now.getMonth(), day);
      const dayOfWeek = dateObj.getDay();
      
      // Skip weekends (Saturday: 6, Sunday: 0)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
      data.records[dateStr] = {};

      data.members.forEach((m, idx) => {
        // High probability of eating (85%)
        const eats = (day + idx) % 7 !== 0;
        if (eats) {
          const isExtra = (day === 5 || day === 15) && idx === 0;
          data.records[dateStr][m.id] = {
            count: isExtra ? 2 : 1,
            note: isExtra ? 'Có khách mời' : ''
          };
        }
      });
    }

    // Seed some payments
    const yearMonth = `${year}-${month}`;
    data.payments[yearMonth] = {
      m1: { paid: 300000, history: [{ amount: 300000, method: 'bank', date: `${year}-${month}-10` }] },
      m2: { paid: 450000, history: [{ amount: 450000, method: 'cash', date: `${year}-${month}-12` }] }
    };

    this.saveData(data);
    return data;
  },

  /* ================= RESET ================= */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    return this.initDefaultData();
  }
};

window.Storage = Storage;
