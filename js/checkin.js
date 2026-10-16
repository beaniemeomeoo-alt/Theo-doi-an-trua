/**
 * checkin.js - Daily Check-in & Lunch Ordering System
 * Handles day-by-day attendance, bulk check/uncheck, and lunch order copy.
 */

const Checkin = {
  selectedDate: '', // Format: "YYYY-MM-DD"

  init() {
    this.selectedDate = this.getTodayDateStr();
    this.bindEvents();
    this.render();
  },

  getTodayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  bindEvents() {
    const dateInput = document.getElementById('inputCheckinDate');
    if (dateInput) {
      dateInput.value = this.selectedDate;
      dateInput.addEventListener('change', (e) => {
        this.selectedDate = e.target.value;
        this.render();
      });
    }

    // Previous / Next Day Navigation
    const btnPrev = document.getElementById('btnCheckinPrevDay');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => this.shiftDay(-1));
    }

    const btnNext = document.getElementById('btnCheckinNextDay');
    if (btnNext) {
      btnNext.addEventListener('click', () => this.shiftDay(1));
    }

    const btnToday = document.getElementById('btnCheckinGoToday');
    if (btnToday) {
      btnToday.addEventListener('click', () => {
        this.selectedDate = this.getTodayDateStr();
        if (dateInput) dateInput.value = this.selectedDate;
        this.render();
      });
    }

    // Bulk actions
    const btnCheckAll = document.getElementById('btnCheckAllToday');
    if (btnCheckAll) {
      btnCheckAll.addEventListener('click', () => this.setAllStatus(true));
    }

    const btnUncheckAll = document.getElementById('btnUncheckAllToday');
    if (btnUncheckAll) {
      btnUncheckAll.addEventListener('click', () => this.setAllStatus(false));
    }

    // Copy order list
    const btnCopyOrder = document.getElementById('btnCopyOrderList');
    if (btnCopyOrder) {
      btnCopyOrder.addEventListener('click', () => this.copyLunchOrderList());
    }
  },

  shiftDay(offsetDays) {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + offsetDays);
    const newY = dateObj.getFullYear();
    const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newD = String(dateObj.getDate()).padStart(2, '0');
    
    this.selectedDate = `${newY}-${newM}-${newD}`;
    const dateInput = document.getElementById('inputCheckinDate');
    if (dateInput) dateInput.value = this.selectedDate;

    this.render();
  },

  render() {
    const dateInput = document.getElementById('inputCheckinDate');
    if (dateInput && dateInput.value !== this.selectedDate) {
      dateInput.value = this.selectedDate;
    }

    // Format Vietnamese weekday label
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const weekdayLabel = document.getElementById('labelCheckinWeekday');
    if (weekdayLabel) {
      weekdayLabel.textContent = `${weekdayNames[dateObj.getDay()]}, ${d}/${m}/${y}`;
    }

    // Fetch members and records
    const members = Storage.getMembers().filter(m => m.active);
    const dayRecords = Storage.getDayRecords(this.selectedDate);
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;

    let totalMealsToday = 0;
    let peopleEatingToday = 0;
    let totalCostToday = 0;

    const container = document.getElementById('checkinMemberList');
    if (!container) return;

    if (members.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border-default);">
          <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
          <p>Chưa có thành viên nào đang hoạt động.</p>
          <button class="btn btn-primary btn-sm" style="margin-top: 10px;" onclick="document.getElementById('btnOpenNewMember').click()">
            + Thêm người vào danh sách
          </button>
        </div>
      `;
      this.updateDayStats(0, 0, 0, 0);
      return;
    }

    let cardsHtml = '';

    members.forEach(member => {
      const record = dayRecords[member.id];
      const isEating = !!(record && record.count > 0);
      const count = isEating ? record.count : 1;
      const note = record?.note || '';
      const itemPrice = (record?.price !== undefined && record?.price !== null && record?.price !== '') ? Number(record.price) : unitPrice;

      if (isEating) {
        peopleEatingToday++;
        totalMealsToday += count;
        totalCostToday += count * itemPrice;
      }

      // Generate initials for avatar
      const nameParts = member.name.trim().split(' ');
      const initials = nameParts.length > 1 
        ? nameParts[0][0] + nameParts[nameParts.length - 1][0] 
        : member.name.slice(0, 2);

      cardsHtml += `
        <div class="checkin-card ${isEating ? 'card-eating' : ''}" data-member-id="${member.id}">
          <div class="checkin-card-header">
            <div class="member-avatar-info">
              <div class="member-avatar">${initials.toUpperCase()}</div>
              <div class="member-name-block">
                <strong>${member.name}</strong>
                <span class="member-subtext">${member.note || member.phone || 'Thành viên'}</span>
              </div>
            </div>

            <button class="switch-button ${isEating ? 'is-active' : ''}" data-action="toggle-status">
              ${isEating ? '✅ Ăn cơm' : '❌ Nghỉ'}
            </button>
          </div>

          <div class="checkin-card-extra" style="${isEating ? 'display:flex' : 'display:none'}">
            <div class="qty-counter">
              <span style="font-size: 12px; color: var(--text-muted);">Suất:</span>
              <button class="qty-btn" data-action="dec-qty">-</button>
              <span class="qty-value">${count}</span>
              <button class="qty-btn" data-action="inc-qty">+</button>
            </div>

            <input type="text" class="checkin-note-input" placeholder="Ghi chú (không cơm, thêm canh...)" value="${note.replace(/"/g, '&quot;')}" data-action="update-note">
          </div>
        </div>
      `;
    });

    container.innerHTML = cardsHtml;
    this.attachCardInteractions(members);
    this.updateDayStats(totalMealsToday, peopleEatingToday, members.length, totalCostToday);

    // Update Header Badge for Today's meals if this is today
    if (this.selectedDate === this.getTodayDateStr()) {
      const badge = document.getElementById('todayCountBadge');
      if (badge) badge.textContent = `${totalMealsToday} suất`;
    }
  },

  attachCardInteractions(members) {
    const container = document.getElementById('checkinMemberList');
    if (!container) return;

    container.querySelectorAll('.checkin-card').forEach(card => {
      const memberId = card.getAttribute('data-member-id');

      // Toggle Eating / Resting Switch
      const switchBtn = card.querySelector('[data-action="toggle-status"]');
      if (switchBtn) {
        switchBtn.addEventListener('click', () => {
          Storage.toggleRecord(this.selectedDate, memberId);
          this.render();
          if (window.Tracker) Tracker.render();
          if (window.Payment) Payment.render();
        });
      }

      // Increase quantity
      const incBtn = card.querySelector('[data-action="inc-qty"]');
      if (incBtn) {
        incBtn.addEventListener('click', () => {
          const current = Storage.getDayRecords(this.selectedDate)[memberId] || { count: 1, note: '' };
          const newCount = Math.min(10, (current.count || 1) + 1);
          Storage.setRecord(this.selectedDate, memberId, { ...current, count: newCount });
          this.render();
          if (window.Tracker) Tracker.render();
          if (window.Payment) Payment.render();
        });
      }

      // Decrease quantity
      const decBtn = card.querySelector('[data-action="dec-qty"]');
      if (decBtn) {
        decBtn.addEventListener('click', () => {
          const current = Storage.getDayRecords(this.selectedDate)[memberId] || { count: 1, note: '' };
          const newCount = Math.max(1, (current.count || 1) - 1);
          Storage.setRecord(this.selectedDate, memberId, { ...current, count: newCount });
          this.render();
          if (window.Tracker) Tracker.render();
          if (window.Payment) Payment.render();
        });
      }

      // Note input blur / enter
      const noteInput = card.querySelector('[data-action="update-note"]');
      if (noteInput) {
        noteInput.addEventListener('change', () => {
          const current = Storage.getDayRecords(this.selectedDate)[memberId] || { count: 1, note: '' };
          Storage.setRecord(this.selectedDate, memberId, { ...current, note: noteInput.value.trim() });
          if (window.Tracker) Tracker.render();
        });
      }
    });
  },

  setAllStatus(shouldEat) {
    const members = Storage.getMembers().filter(m => m.active);
    members.forEach(member => {
      if (shouldEat) {
        const existing = Storage.getDayRecords(this.selectedDate)[member.id];
        Storage.setRecord(this.selectedDate, member.id, {
          count: existing?.count || 1,
          note: existing?.note || ''
        });
      } else {
        Storage.setRecord(this.selectedDate, member.id, null);
      }
    });

    App.showToast(shouldEat ? 'Đã đánh dấu tất cả ăn cơm!' : 'Đã bỏ chọn tất cả!', 'info');
    this.render();
    if (window.Tracker) Tracker.render();
    if (window.Payment) Payment.render();
  },

  updateDayStats(totalMeals, peopleEating, totalPeople, totalCost) {
    document.getElementById('todayTotalMealsStat').textContent = `${totalMeals} suất`;
    document.getElementById('todayTotalCostStat').textContent = `${totalCost.toLocaleString('vi-VN')} đ`;
    document.getElementById('todayPeopleCountStat').textContent = `${peopleEating} / ${totalPeople} người`;
  },

  copyLunchOrderList() {
    const members = Storage.getMembers().filter(m => m.active);
    const dayRecords = Storage.getDayRecords(this.selectedDate);
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    const eatingList = [];
    let totalPortions = 0;

    members.forEach(m => {
      const rec = dayRecords[m.id];
      if (rec && rec.count > 0) {
        eatingList.push({
          name: m.name,
          count: rec.count,
          note: rec.note
        });
        totalPortions += rec.count;
      }
    });

    if (eatingList.length === 0) {
      App.showToast('Chưa có ai đăng ký ăn cơm hôm nay!', 'error');
      return;
    }

    let text = `🍚 DANH SÁCH ĐẶT CƠM TRƯA\n`;
    text += `📅 ${weekdayNames[dateObj.getDay()]}, ngày ${d}/${m}/${y}\n`;
    text += `🍱 Tổng số suất: ${totalPortions} suất (${eatingList.length} người)\n`;
    text += `----------------------------------------\n`;

    eatingList.forEach((item, idx) => {
      let line = `${idx + 1}. ${item.name}`;
      if (item.count > 1) {
        line += ` (${item.count} suất)`;
      }
      if (item.note) {
        line += ` - [${item.note}]`;
      }
      text += line + `\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      App.showToast('Đã sao chép danh sách đặt cơm vào Clipboard!', 'success');
    }).catch(err => {
      console.error(err);
      App.showToast('Không thể sao chép tự động, hãy copy thủ công.', 'error');
    });
  }
};

window.Checkin = Checkin;
