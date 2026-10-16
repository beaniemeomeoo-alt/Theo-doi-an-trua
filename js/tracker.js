/**
 * tracker.js - Monthly Matrix Table & Metrics Dashboard
 * Handles the interactive grid of members x days, cell toggling, and calculations.
 */

const Tracker = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-12
  selectedCell: null, // { memberId, dateStr, count, note }
  
  // Drag to select / paint state
  isDragging: false,
  dragTargetValue: 1, // 1 (eat) or 0 (not eat)
  draggedCells: new Set(),

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Global mouseup and touchend to end drag painting
    window.addEventListener('mouseup', () => this.endDrag());
    window.addEventListener('touchend', () => this.endDrag());
    window.addEventListener('touchcancel', () => this.endDrag());

    // Search member input
    const searchInput = document.getElementById('inputSearchMember');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.render());
    }

    // Filter checkboxes
    const checkActive = document.getElementById('checkOnlyActive');
    if (checkActive) {
      checkActive.addEventListener('change', () => this.render());
    }

    const checkWeekend = document.getElementById('checkHideWeekend');
    if (checkWeekend) {
      checkWeekend.addEventListener('change', () => this.render());
    }

    // Modal Cell Edit Handlers
    const btnSaveCell = document.getElementById('btnSaveCellEdit');
    if (btnSaveCell) {
      btnSaveCell.addEventListener('click', () => this.saveCellEdit());
    }

    const btnQtyPlus = document.getElementById('btnQtyPlus');
    const btnQtyMinus = document.getElementById('btnQtyMinus');
    const inputQty = document.getElementById('inputCellQuantity');
    if (btnQtyPlus && inputQty) {
      btnQtyPlus.addEventListener('click', () => {
        inputQty.value = Math.min(10, (parseInt(inputQty.value) || 1) + 1);
      });
    }
    if (btnQtyMinus && inputQty) {
      btnQtyMinus.addEventListener('click', () => {
        inputQty.value = Math.max(1, (parseInt(inputQty.value) || 1) - 1);
      });
    }
  },

  setPeriod(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    this.render();
  },

  getYearMonthStr() {
    return `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`;
  },

  render() {
    const year = this.currentYear;
    const month = this.currentMonth;
    const yearMonth = this.getYearMonthStr();
    
    // Update display labels
    const labelMonth = document.getElementById('labelCurrentMonth');
    if (labelMonth) {
      labelMonth.textContent = `Tháng ${month} / ${year}`;
    }
    const labelPayMonth = document.getElementById('labelPaymentMonth');
    if (labelPayMonth) {
      labelPayMonth.textContent = `Tháng ${month}/${year}`;
    }

    // Fetch data
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const allMembers = Storage.getMembers();
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const monthPayments = Storage.getMonthPayments(yearMonth);

    // Apply Filters
    const searchQuery = (document.getElementById('inputSearchMember')?.value || '').toLowerCase().trim();
    const onlyActive = document.getElementById('checkOnlyActive')?.checked ?? true;
    const hideWeekend = document.getElementById('checkHideWeekend')?.checked ?? false;

    let filteredMembers = allMembers.filter(m => {
      if (onlyActive && !m.active) return false;
      if (searchQuery && !m.name.toLowerCase().includes(searchQuery)) return false;
      return true;
    });

    // Calendar info
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
    const todayDate = today.getDate();

    const weekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    // 1. Build Header Row
    const headerRow = document.getElementById('trackerHeaderRow');
    if (!headerRow) return;

    let headerHtml = `
      <th class="col-stt">STT</th>
      <th class="col-name">Thành viên</th>
    `;

    const visibleDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      if (hideWeekend && isWeekend) continue;

      visibleDays.push(day);
      const isToday = isCurrentMonth && day === todayDate;

      headerHtml += `
        <th class="day-header-cell ${isWeekend ? 'col-weekend' : ''} ${isToday ? 'col-today' : ''}" title="Ngày ${day}/${month} (${weekdayNames[dayOfWeek]})">
          <span class="day-num">${day}</span>
          <span class="day-weekday">${weekdayNames[dayOfWeek]}</span>
        </th>
      `;
    }

    headerHtml += `
      <th class="col-summary col-sum-meals" title="Tổng số suất ăn trong tháng">Tổng</th>
      <th class="col-summary col-sum-amount" title="Thành tiền = Tổng suất x Đơn giá">Thành tiền</th>
      <th class="col-summary col-sum-paid" title="Số tiền thành viên đã nộp trong tháng">Đã đóng</th>
      <th class="col-summary col-sum-debt" title="Số tiền còn thiếu">Còn thiếu</th>
      <th class="col-summary col-sum-action">Thu</th>
    `;
    headerRow.innerHTML = headerHtml;

    // 2. Build Body Rows & Track Stats
    const tbody = document.getElementById('trackerTableBody');
    if (!tbody) return;

    if (filteredMembers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${visibleDays.length + 7}" style="padding: 40px; text-align: center; color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
            <div>Chưa có thành viên nào phù hợp bộ lọc.</div>
            <button class="btn btn-primary btn-sm" style="margin-top: 12px;" onclick="document.getElementById('btnOpenNewMember').click()">
              + Thêm thành viên ngay
            </button>
          </td>
        </tr>
      `;
      this.updateMetrics(0, 0, 0, unitPrice, 0);
      return;
    }

    let tbodyHtml = '';
    let grandTotalMeals = 0;
    let grandTotalAmount = 0;
    let grandTotalPaid = 0;
    let grandTotalMissingDebt = 0;
    let unpaidMembersCount = 0;

    // Day totals accumulator
    const dayTotals = {};
    visibleDays.forEach(d => dayTotals[d] = 0);

    filteredMembers.forEach((member, index) => {
      let memberTotalMeals = 0;
      let memberTotalAmount = 0;

      let rowHtml = `
        <tr data-member-id="${member.id}">
          <td class="col-stt">${index + 1}</td>
          <td class="col-name" title="${member.name} (${member.note || 'Không có ghi chú'})">
            <span>${member.name}</span>
          </td>
      `;

      visibleDays.forEach(day => {
        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isToday = isCurrentMonth && day === todayDate;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const record = monthRecords[dateStr]?.[member.id];
        const count = record?.count || 0;
        const note = record?.note || '';
        const customPrice = (record?.price !== undefined && record?.price !== null && record?.price !== '') ? Number(record.price) : null;
        const itemPrice = (customPrice !== null && customPrice > 0) ? customPrice : unitPrice;

        if (count > 0) {
          memberTotalMeals += count;
          memberTotalAmount += count * itemPrice;
          dayTotals[day] += count;
        }

        let cellContent = '·';
        let stateClass = 'cell-none';

        if (count === 1) {
          cellContent = '✓';
          stateClass = 'cell-eat';
        } else if (count > 1) {
          cellContent = count;
          stateClass = 'cell-extra';
        }

        const noteClass = note ? 'cell-has-note' : '';
        const customPriceClass = (customPrice !== null && customPrice > 0 && customPrice !== unitPrice) ? 'cell-has-custom-price' : '';
        const priceInfo = (customPrice !== null && customPrice > 0 && customPrice !== unitPrice) ? ` (${customPrice.toLocaleString('vi-VN')}đ/suất)` : '';
        const noteTitle = note ? ` [${note}]` : '';

        rowHtml += `
          <td class="tracker-cell ${stateClass} ${isWeekend ? 'col-weekend' : ''} ${isToday ? 'col-today' : ''} ${noteClass} ${customPriceClass}" 
              data-member-id="${member.id}" 
              data-member-name="${member.name}"
              data-date="${dateStr}" 
              data-count="${count}"
              data-note="${note.replace(/"/g, '&quot;')}"
              data-price="${customPrice || ''}"
              title="${member.name} - Ngày ${day}/${month}: ${count > 0 ? count + ' suất' + priceInfo : 'Nghỉ'}${noteTitle}">
            <div class="cell-inner">${cellContent}</div>
          </td>
        `;
      });

      const paymentInfo = monthPayments[member.id] || { paid: 0 };
      const paidAmount = paymentInfo.paid || 0;

      // Tiền còn đóng thiếu: nếu tổng tiền ăn > tiền đã nộp thì còn thiếu; nếu đã nộp đủ thì = 0đ (không thiếu)
      const missingAmount = Math.max(0, memberTotalAmount - paidAmount);

      grandTotalMeals += memberTotalMeals;
      grandTotalAmount += memberTotalAmount;
      grandTotalPaid += paidAmount;
      if (missingAmount > 0) {
        grandTotalMissingDebt += missingAmount;
        unpaidMembersCount++;
      }

      let debtCellHtml = '';
      if (missingAmount > 0) {
        debtCellHtml = `<span style="color: var(--danger); font-weight: 700;">${missingAmount.toLocaleString('vi-VN')}đ</span>`;
      } else {
        debtCellHtml = `<span style="color: var(--text-dim); font-weight: 500;">0đ</span>`;
      }

      rowHtml += `
          <td class="col-summary col-sum-meals">${memberTotalMeals}</td>
          <td class="col-summary col-sum-amount">${memberTotalAmount.toLocaleString('vi-VN')}đ</td>
          <td class="col-summary col-sum-paid" style="color: var(--success);">${paidAmount.toLocaleString('vi-VN')}đ</td>
          <td class="col-summary col-sum-debt">
            ${debtCellHtml}
          </td>
          <td class="col-summary col-sum-action">
            <button class="btn-icon btn-sm btn-quick-pay" data-member-id="${member.id}" title="Ghi nhận thu tiền">
              💳
            </button>
          </td>
        </tr>
      `;

      tbodyHtml += rowHtml;
    });

    tbody.innerHTML = tbodyHtml;

    // 3. Build Footer Row (Totals per day)
    const tfootRow = document.getElementById('trackerFooterRow');
    if (tfootRow) {
      let tfootHtml = `
        <td class="col-stt">∑</td>
        <td class="col-name">Tổng suất / ngày</td>
      `;

      visibleDays.forEach(day => {
        const total = dayTotals[day] || 0;
        tfootHtml += `<td class="day-total-cell">${total > 0 ? total : '·'}</td>`;
      });

      tfootHtml += `
        <td class="col-summary col-sum-meals" style="font-size: 13.5px;">${grandTotalMeals}</td>
        <td class="col-summary col-sum-amount" style="font-size: 13.5px; color: var(--primary-700);">${grandTotalAmount.toLocaleString('vi-VN')}đ</td>
        <td class="col-summary col-sum-paid" style="font-size: 13.5px; color: var(--success);">${grandTotalPaid.toLocaleString('vi-VN')}đ</td>
        <td class="col-summary col-sum-debt" style="font-size: 13.5px; color: ${grandTotalMissingDebt > 0 ? 'var(--danger)' : 'var(--text-dim)'};">${grandTotalMissingDebt.toLocaleString('vi-VN')}đ</td>
        <td class="col-summary col-sum-action"></td>
      `;

      tfootRow.innerHTML = tfootHtml;
    }

    // 4. Attach Cell Click & Double Click Events
    this.attachCellInteractions();

    // 5. Update Metrics Cards
    this.updateMetrics(grandTotalMeals, grandTotalAmount, grandTotalPaid, unitPrice, filteredMembers.length, unpaidMembersCount, grandTotalMissingDebt);
  },

  attachCellInteractions() {
    const cells = document.querySelectorAll('.tracker-cell');
    cells.forEach(cell => {
      // Mousedown: Start drag or single toggle
      cell.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Left click only
        if (e.detail >= 2) return; // Let dblclick handle double click
        e.preventDefault(); // Stop text selection
        this.startDrag(cell, e);
      });

      // Mouseenter: Drag painting over cells
      cell.addEventListener('mouseenter', () => {
        if (this.isDragging) {
          this.paintCell(cell);
        }
      });

      // Touch events (Mobile / Tablets)
      cell.addEventListener('touchstart', (e) => {
        this.startDrag(cell, e);
      }, { passive: true });

      cell.addEventListener('touchmove', (e) => {
        if (this.isDragging && e.touches.length > 0) {
          const touch = e.touches[0];
          const targetCell = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tracker-cell');
          if (targetCell) {
            this.paintCell(targetCell);
          }
        }
      }, { passive: true });

      // Context Menu / Right click or Double Click: Open Custom Details Modal
      cell.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.openCellEditModal(cell);
      });

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openCellEditModal(cell);
      });
    });

    // Quick Pay Buttons in right sticky column
    const payBtns = document.querySelectorAll('.btn-quick-pay');
    payBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memberId = btn.getAttribute('data-member-id');
        if (window.Payment) {
          Payment.openPaymentModal(memberId);
        }
      });
    });
  },

  startDrag(cell, e) {
    if (e && e.button !== undefined && e.button !== 0) return;

    const memberId = cell.getAttribute('data-member-id');
    const dateStr = cell.getAttribute('data-date');
    const currentCount = parseInt(cell.getAttribute('data-count')) || 0;

    this.isDragging = true;
    // If currently 0 (empty), paint 1 (eat). If already eating (>=1), paint 0 (clear/uncheck)
    this.dragTargetValue = (currentCount === 0) ? 1 : 0;
    this.draggedCells = new Set();
    document.body.classList.add('is-drag-painting');

    this.paintCell(cell);
  },

  paintCell(cell) {
    if (!cell) return;
    const memberId = cell.getAttribute('data-member-id');
    const dateStr = cell.getAttribute('data-date');
    if (!memberId || !dateStr) return;

    const key = `${memberId}_${dateStr}`;
    if (this.draggedCells.has(key)) return;
    this.draggedCells.add(key);

    const targetVal = this.dragTargetValue;
    if (targetVal === 1) {
      Storage.setRecord(dateStr, memberId, { count: 1, note: '' });
      cell.classList.remove('cell-none', 'cell-extra');
      cell.classList.add('cell-eat');
      cell.setAttribute('data-count', '1');
      const inner = cell.querySelector('.cell-inner');
      if (inner) inner.textContent = '✓';
    } else {
      Storage.setRecord(dateStr, memberId, null);
      cell.classList.remove('cell-eat', 'cell-extra', 'cell-has-note');
      cell.classList.add('cell-none');
      cell.setAttribute('data-count', '0');
      cell.removeAttribute('data-note');
      const inner = cell.querySelector('.cell-inner');
      if (inner) inner.textContent = '·';
    }

    // Trigger visual pulse animation
    cell.classList.remove('cell-just-painted');
    void cell.offsetWidth;
    cell.classList.add('cell-just-painted');
  },

  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    document.body.classList.remove('is-drag-painting');

    if (this.draggedCells && this.draggedCells.size > 0) {
      const count = this.draggedCells.size;
      this.render();
      if (window.Checkin && Checkin.selectedDate) {
        Checkin.render();
      }
      if (window.Payment) {
        Payment.render();
      }
      if (count > 1) {
        const actionText = (this.dragTargetValue === 1) ? 'Đã đánh dấu ăn' : 'Đã bỏ chọn';
        App.showToast(`${actionText} ${count} ngày liên tiếp!`, 'success');
      }
      this.draggedCells.clear();
    }
  },

  openCellEditModal(cell) {
    const memberId = cell.getAttribute('data-member-id');
    const memberName = cell.getAttribute('data-member-name');
    const dateStr = cell.getAttribute('data-date');
    const count = parseInt(cell.getAttribute('data-count')) || 0;
    const note = cell.getAttribute('data-note') || '';

    // Retrieve custom price from record if present
    const record = Storage.getDayRecords(dateStr)[memberId];
    const customPrice = (record?.price !== undefined && record?.price !== null && record?.price !== '') ? Number(record.price) : null;
    const settings = Storage.getSettings();
    const defaultPrice = settings.mealPrice || 30000;

    this.selectedCell = { memberId, memberName, dateStr, count, note, price: customPrice };

    document.getElementById('cellModalPersonName').textContent = memberName;
    document.getElementById('cellModalDateStr').textContent = dateStr;

    const radioYes = document.getElementById('radioEatYes');
    const radioNo = document.getElementById('radioEatNo');
    const inputQty = document.getElementById('inputCellQuantity');
    const inputNote = document.getElementById('inputCellNote');
    const qtyGroup = document.getElementById('groupMealQuantity');
    const priceGroup = document.getElementById('groupMealPrice');
    const inputPrice = document.getElementById('inputCellPrice');
    const priceHint = document.getElementById('cellPriceHint');
    const btnResetPrice = document.getElementById('btnResetCellPrice');

    if (inputPrice) {
      inputPrice.value = (customPrice !== null && customPrice > 0) ? customPrice : defaultPrice;
    }
    if (priceHint) {
      priceHint.textContent = `Mặc định theo cài đặt: ${defaultPrice.toLocaleString('vi-VN')}đ/suất. Bạn có thể sửa riêng giá bữa này.`;
    }

    if (btnResetPrice) {
      btnResetPrice.onclick = () => {
        const def = Storage.getSettings().mealPrice || 30000;
        if (inputPrice) inputPrice.value = def;
      };
    }

    if (count > 0) {
      radioYes.checked = true;
      inputQty.value = count;
      qtyGroup.style.display = 'block';
      if (priceGroup) priceGroup.style.display = 'block';
    } else {
      radioNo.checked = true;
      inputQty.value = 1;
      qtyGroup.style.display = 'none';
      if (priceGroup) priceGroup.style.display = 'none';
    }

    inputNote.value = note;

    // Toggle qty & price input visibility on radio change
    radioYes.onchange = () => {
      qtyGroup.style.display = 'block';
      if (priceGroup) priceGroup.style.display = 'block';
    };
    radioNo.onchange = () => {
      qtyGroup.style.display = 'none';
      if (priceGroup) priceGroup.style.display = 'none';
    };

    App.openModal('modalCellEdit');
  },

  saveCellEdit() {
    if (!this.selectedCell) return;

    const isEating = document.getElementById('radioEatYes').checked;
    const qty = isEating ? Math.max(1, parseInt(document.getElementById('inputCellQuantity').value) || 1) : 0;
    const note = document.getElementById('inputCellNote').value.trim();
    const inputPrice = document.getElementById('inputCellPrice');
    const defaultPrice = Storage.getSettings().mealPrice || 30000;
    const enteredPrice = (inputPrice && inputPrice.value) ? Number(inputPrice.value) : null;
    const finalPrice = (enteredPrice !== null && enteredPrice > 0 && enteredPrice !== defaultPrice) ? enteredPrice : null;

    if (qty > 0) {
      Storage.setRecord(this.selectedCell.dateStr, this.selectedCell.memberId, { count: qty, note, price: finalPrice });
    } else {
      Storage.setRecord(this.selectedCell.dateStr, this.selectedCell.memberId, null);
    }

    App.closeModal('modalCellEdit');
    App.showToast('Đã cập nhật suất ăn thành công!', 'success');

    this.render();
    if (window.Checkin && Checkin.selectedDate === this.selectedCell.dateStr) {
      Checkin.render();
    }
    if (window.Payment) {
      Payment.render();
    }
  },

  updateMetrics(totalMeals, totalAmount, totalPaid, unitPrice, memberCount, unpaidCount = 0, totalMissingDebt = 0) {
    document.getElementById('metricTotalMeals').textContent = totalMeals.toLocaleString('vi-VN');
    document.getElementById('metricTotalAmount').textContent = totalAmount.toLocaleString('vi-VN');
    document.getElementById('metricTotalPaid').textContent = totalPaid.toLocaleString('vi-VN');
    
    document.getElementById('metricTotalDebt').textContent = totalMissingDebt.toLocaleString('vi-VN');

    const percent = totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : 0;
    document.getElementById('metricPaidPercentBar').style.width = `${percent}%`;
    document.getElementById('metricPaidPercentText').textContent = `${percent}%`;

    document.getElementById('metricActiveMembersText').textContent = `Đang có ${memberCount} người tham gia`;
    
    const avg = memberCount > 0 ? Math.round(totalAmount / memberCount) : 0;
    document.getElementById('metricAveragePerPerson').textContent = `Trung bình ${avg.toLocaleString('vi-VN')}đ / người`;

    document.getElementById('metricUnpaidPersons').textContent = `${unpaidCount} người chưa nộp đủ`;
    
    // Update badge on header nav
    const unpaidBadge = document.getElementById('unpaidCountBadge');
    if (unpaidBadge) {
      unpaidBadge.textContent = unpaidCount;
      unpaidBadge.style.display = unpaidCount > 0 ? 'inline-block' : 'none';
    }
  }
};

window.Tracker = Tracker;
