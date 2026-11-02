/**
 * app.js - Main Application Controller
 * Coordinates Tabs, Navigation, Theme, Settings, and Modals.
 */

const App = {
  activeTab: 'tracker',
  isBooted: false,

  async init() {
    console.log('🐱 Initializing Trưa nay ăn gì...');

    // 1. Load theme and bind login events
    this.initTheme();
    this.bindLoginEvents();

    // 2. Require authentication before booting app
    if (!Storage.isAuthenticated()) {
      this.showLoginScreen();
      return;
    }

    await this.bootApp();
  },

  async bootApp() {
    const loginOverlay = document.getElementById('loginOverlay');
    const appContainer = document.getElementById('app');
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';

    if (!this.isBooted) {
      this.isBooted = true;
      Tracker.init();
      Checkin.init();
      Payment.init();
      Members.init();
      Exporter.init();

      this.bindNavigation();
      this.bindMonthNavigation();
      this.bindSettingsEvents();
      this.bindModalEvents();
    }

    // Initial Render (immediate cache render)
    this.refreshSettingsUI();
    Tracker.render();
    Payment.render();

    // Connect to Cloudflare D1 Backend if online
    try {
      const isCloud = await Storage.checkCloudConnection(Tracker.getYearMonthStr());
      if (isCloud) {
        this.refreshSettingsUI();
        Tracker.render();
        Payment.render();
        if (window.Checkin) Checkin.render();
      }
    } catch(err) {
      console.warn('Offline mode:', err);
    }

    if (!Storage.isAuthenticated()) return;

    const members = Storage.getMembers();
    if (members.length === 0) {
      setTimeout(() => {
        this.showToast('Chào mừng! Hãy thêm thành viên để bắt đầu điểm danh cơm trưa.', 'info');
      }, 500);
    }
  },

  showLoginScreen(errorText = '') {
    const loginOverlay = document.getElementById('loginOverlay');
    const appContainer = document.getElementById('app');
    const errBox = document.getElementById('loginErrorMsg');
    if (appContainer) appContainer.style.display = 'none';
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (errBox) {
      if (errorText) {
        errBox.textContent = errorText;
        errBox.style.display = 'block';
      } else {
        errBox.style.display = 'none';
      }
    }
    setTimeout(() => document.getElementById('loginUsername')?.focus(), 50);
  },

  bindLoginEvents() {
    const form = document.getElementById('loginForm');
    const userInp = document.getElementById('loginUsername');
    const passInp = document.getElementById('loginPassword');
    const errBox = document.getElementById('loginErrorMsg');
    const submitBtn = document.getElementById('btnLoginSubmit');
    const togglePwdBtn = document.getElementById('btnToggleLoginPwd');
    const logoutBtn = document.getElementById('btnLogout');

    if (togglePwdBtn && passInp) {
      togglePwdBtn.addEventListener('click', () => {
        const isPwd = passInp.type === 'password';
        passInp.type = isPwd ? 'text' : 'password';
        togglePwdBtn.textContent = isPwd ? '🙈' : '👁️';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errBox) errBox.style.display = 'none';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ Đang kiểm tra...';
        }

        const result = await Storage.login(userInp?.value, passInp?.value);

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🔐 Đăng nhập';
        }

        if (result.success) {
          if (passInp) passInp.value = '';
          await this.bootApp();
          this.showToast('Đăng nhập thành công!', 'success');
        } else {
          if (errBox) {
            errBox.textContent = result.error || 'Sai tài khoản hoặc mật khẩu!';
            errBox.style.display = 'block';
          }
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        Storage.clearToken();
        this.showLoginScreen();
      });
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

    const handlePeriodChange = async (y, m) => {
      Tracker.setPeriod(y, m);
      Payment.render();
      if (Storage.isCloud) {
        await Storage.checkCloudConnection(`${y}-${String(m).padStart(2, '0')}`);
        Tracker.render();
        Payment.render();
      }
    };

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        let m = Tracker.currentMonth - 1;
        let y = Tracker.currentYear;
        if (m < 1) {
          m = 12;
          y--;
        }
        handlePeriodChange(y, m);
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
        handlePeriodChange(y, m);
      });
    }

    if (btnToday) {
      btnToday.addEventListener('click', () => {
        const now = new Date();
        handlePeriodChange(now.getFullYear(), now.getMonth() + 1);
      });
    }

    if (inputPicker) {
      inputPicker.addEventListener('change', (e) => {
        if (!e.target.value) return;
        const [y, m] = e.target.value.split('-').map(Number);
        handlePeriodChange(y, m);
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
