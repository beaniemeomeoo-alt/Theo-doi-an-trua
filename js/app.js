/**
 * app.js - Main Application Controller
 * Coordinates Tabs, Navigation, Theme, Settings, and Modals.
 */

const App = {
  activeTab: 'tracker',

  init() {
    console.log('🍚 Initializing Cơm Trưa Pro...');

    // 1. Check if first time run and load theme
    this.initTheme();

    // 2. Initialize sub-modules
    Tracker.init();
    Checkin.init();
    Payment.init();
    Members.init();
    Exporter.init();

    // 3. Bind global events
    this.bindNavigation();
    this.bindMonthNavigation();
    this.bindSettingsEvents();
    this.bindModalEvents();

    // 4. Initial Render
    this.refreshSettingsUI();
    Tracker.render();
    Payment.render();

    // Check if new install without members, prompt gently or offer sample data
    const members = Storage.getMembers();
    if (members.length === 0) {
      setTimeout(() => {
        this.showToast('Chào mừng! Hãy thêm thành viên hoặc nạp Dữ liệu mẫu trong Cài đặt để thử ngay.', 'info');
      }, 500);
    }
  },

  /* ================= NAVIGATION & TABS ================= */
  bindNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });
  },

  switchTab(tabId) {
    this.activeTab = tabId;

    // Update nav tab active class
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });

    // Update tab pane active class
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabId}`);
    });

    // Trigger render on switch
    if (tabId === 'tracker') Tracker.render();
    if (tabId === 'checkin') Checkin.render();
    if (tabId === 'payments') Payment.render();
    if (tabId === 'members') Members.render();
    if (tabId === 'settings') this.refreshSettingsUI();
  },

  /* ================= MONTH PICKER & NAVIGATION ================= */
  bindMonthNavigation() {
    const btnPrev = document.getElementById('btnPrevMonth');
    const btnNext = document.getElementById('btnNextMonth');
    const btnToday = document.getElementById('btnToday');
    const inputPicker = document.getElementById('inputMonthPicker');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        let m = Tracker.currentMonth - 1;
        let y = Tracker.currentYear;
        if (m < 1) {
          m = 12;
          y--;
        }
        Tracker.setPeriod(y, m);
        Payment.render();
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        let m = Tracker.currentMonth + 1;
        let y = Tracker.currentYear;
        if (m > 12) {
          m = 1;
          y++;
        }
        Tracker.setPeriod(y, m);
        Payment.render();
      });
    }

    if (btnToday) {
      btnToday.addEventListener('click', () => {
        const now = new Date();
        Tracker.setPeriod(now.getFullYear(), now.getMonth() + 1);
        Payment.render();
      });
    }

    if (inputPicker) {
      inputPicker.addEventListener('change', (e) => {
        if (!e.target.value) return;
        const [y, m] = e.target.value.split('-').map(Number);
        Tracker.setPeriod(y, m);
        Payment.render();
      });
    }

    // Quick price chip in header
    const chipPrice = document.getElementById('btnQuickPrice');
    if (chipPrice) {
      chipPrice.addEventListener('click', () => {
        this.switchTab('settings');
        document.getElementById('inputSettingPrice')?.focus();
      });
    }
  },

  /* ================= SETTINGS & THEME ================= */
  initTheme() {
    const settings = Storage.getSettings();
    const isDark = settings.theme === 'dark';
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);

    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const nowDark = document.body.classList.toggle('theme-dark');
        document.body.classList.toggle('theme-light', !nowDark);
        Storage.updateSettings({ theme: nowDark ? 'dark' : 'light' });
      });
    }
  },

  refreshSettingsUI() {
    const settings = Storage.getSettings();
    
    // Header Price Display
    const price = settings.mealPrice || 30000;
    const headerPrice = document.getElementById('headerPriceDisplay');
    if (headerPrice) {
      headerPrice.textContent = `${price.toLocaleString('vi-VN')}đ`;
    }

    // Settings Input Fields
    const inputPrice = document.getElementById('inputSettingPrice');
    if (inputPrice) inputPrice.value = price;

    const bankInfo = settings.bankInfo || {};
    const selectBank = document.getElementById('selectBankCode');
    const inputAcc = document.getElementById('inputAccountNumber');
    const inputName = document.getElementById('inputAccountName');

    if (selectBank && bankInfo.bankCode) selectBank.value = bankInfo.bankCode;
    if (inputAcc && bankInfo.accountNumber) inputAcc.value = bankInfo.accountNumber;
    if (inputName && bankInfo.accountName) inputName.value = bankInfo.accountName;
  },

  bindSettingsEvents() {
    // Save Price
    const btnSavePrice = document.getElementById('btnSavePriceSetting');
    if (btnSavePrice) {
      btnSavePrice.addEventListener('click', () => {
        const inputPrice = document.getElementById('inputSettingPrice');
        const price = Math.max(1000, Number(inputPrice.value) || 30000);
        Storage.updateSettings({ mealPrice: price });
        this.refreshSettingsUI();
        Tracker.render();
        Checkin.render();
        Payment.render();
        this.showToast('Đã lưu giá cơm thành công!', 'success');
      });
    }

    // Save Bank Info
    const btnSaveBank = document.getElementById('btnSaveBankSetting');
    if (btnSaveBank) {
      btnSaveBank.addEventListener('click', () => {
        const bankCode = document.getElementById('selectBankCode').value;
        const accountNumber = document.getElementById('inputAccountNumber').value.trim();
        const accountName = document.getElementById('inputAccountName').value.trim().toUpperCase();

        Storage.updateSettings({
          bankInfo: { bankCode, accountNumber, accountName }
        });
        this.showToast('Đã lưu thông tin tài khoản nhận tiền!', 'success');
      });
    }

    // Sample Data Seeder
    const btnSample = document.getElementById('btnLoadSampleData');
    if (btnSample) {
      btnSample.addEventListener('click', () => {
        if (confirm('Nạp dữ liệu mẫu gồm 6 người và lịch sử ăn tháng này? Dữ liệu hiện tại sẽ được cập nhật.')) {
          Storage.seedSampleData();
          this.showToast('Đã nạp dữ liệu mẫu thành công!', 'success');
          setTimeout(() => location.reload(), 600);
        }
      });
    }

    // Reset Data
    const btnReset = document.getElementById('btnResetAllData');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('CẢNH BÁO: Thao tác này sẽ xóa sạch toàn bộ danh sách thành viên và lịch sử ăn cơm! Bạn có chắc không?')) {
          Storage.clearAll();
          this.showToast('Đã xóa toàn bộ dữ liệu!', 'info');
          setTimeout(() => location.reload(), 600);
        }
      });
    }
  },

  /* ================= MODAL MANAGER ================= */
  bindModalEvents() {
    // Close button click
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        this.closeModal(modalId);
      });
    });

    // Backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });
    });

    // ESC key closes any open modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
    }
  },

  /* ================= TOAST NOTIFICATIONS ================= */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }
};

// Initialize App on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;
