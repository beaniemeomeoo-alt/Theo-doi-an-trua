/**
 * payment.js - Billing, Debt Collection, VietQR Generator & Reminders
 * Handles financial records, payment status, QR generation, and reminder messaging.
 */

const Payment = {
  currentFilter: 'all', // 'all' | 'unpaid' | 'paid'
  activeMemberForPay: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Filter chips
    const chips = document.querySelectorAll('[data-pay-filter]');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.getAttribute('data-pay-filter');
        this.render();
      });
    });

    // Payment Confirm Button in Modal
    const btnConfirm = document.getElementById('btnConfirmPayment');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.savePayment());
    }

    // Quick full-due buttons
    const btnPayFull = document.getElementById('btnPayFullDue');
    if (btnPayFull) {
      btnPayFull.addEventListener('click', () => {
        const debt = this.activeMemberForPay?.debt || 0;
        const total = this.activeMemberForPay?.totalAmount || 0;
        document.getElementById('inputPayAmount').value = debt > 0 ? debt : total;
      });
    }

    const btnPayClear = document.getElementById('btnPayClear');
    if (btnPayClear) {
      btnPayClear.addEventListener('click', () => {
        document.getElementById('inputPayAmount').value = 0;
      });
    }

    // Reset all month payments in modal
    const btnResetMonth = document.getElementById('btnResetMonthPaymentInModal');
    if (btnResetMonth) {
      btnResetMonth.addEventListener('click', () => {
        if (this.activeMemberForPay) {
          this.confirmDeletePayment(this.activeMemberForPay.memberId);
        }
      });
    }

    // Delete all payments button in modalDeletePayment
    const btnDelAll = document.getElementById('btnDeleteAllPaymentsForMember');
    if (btnDelAll) {
      btnDelAll.addEventListener('click', () => {
        const memberId = document.getElementById('delPayModalMemberId')?.value;
        if (memberId) {
          this.confirmDeletePayment(memberId, true);
        }
      });
    }

    // Copy memo in QR Modal
    const btnCopyMemo = document.getElementById('btnCopyMemo');
    if (btnCopyMemo) {
      btnCopyMemo.addEventListener('click', () => {
        const memo = document.getElementById('qrMemoLabel').textContent;
        navigator.clipboard.writeText(memo).then(() => {
          App.showToast('Đã copy nội dung chuyển khoản!', 'success');
        });
      });
    }

    // Copy reminder text in Reminder Modal
    const btnCopyReminder = document.getElementById('btnCopyReminderText');
    if (btnCopyReminder) {
      btnCopyReminder.addEventListener('click', () => {
        const txt = document.getElementById('textReminderMessage').value;
        navigator.clipboard.writeText(txt).then(() => {
          App.showToast('Đã sao chép tin nhắn nhắc tiền cơm!', 'success');
          App.closeModal('modalReminder');
        });
      });
    }
  },

  getMemberMonthBilling(memberId, yearMonth) {
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const paymentInfo = Storage.getMemberPayment(yearMonth, memberId);

    let meals = 0;
    let totalAmount = 0;
    Object.keys(monthRecords).forEach(d => {
      const rec = monthRecords[d]?.[memberId];
      if (rec && rec.count > 0) {
        meals += rec.count;
        const itemPrice = (rec.price !== undefined && rec.price !== null && rec.price !== '') ? Number(rec.price) : unitPrice;
        totalAmount += rec.count * itemPrice;
      }
    });

    const paidAmount = paymentInfo.paid || 0;
    const debt = Math.max(0, totalAmount - paidAmount);

    return { meals, totalAmount, paidAmount, debt, paymentInfo, unitPrice };
  },

  render() {
    const yearMonth = Tracker.getYearMonthStr();
    const members = Storage.getMembers();

    let countAll = 0;
    let countUnpaid = 0;
    let countPaid = 0;

    const memberBillingList = [];

    members.forEach(member => {
      const billing = this.getMemberMonthBilling(member.id, yearMonth);
      const { meals, totalAmount, paidAmount, debt, paymentInfo } = billing;

      let status = 'none';
      if (totalAmount > 0) {
        if (debt === 0) {
          status = 'paid';
          countPaid++;
        } else if (paidAmount > 0) {
          status = 'partial';
          countUnpaid++;
        } else {
          status = 'unpaid';
          countUnpaid++;
        }
        countAll++;
      }

      memberBillingList.push({
        member,
        meals,
        totalAmount,
        paidAmount,
        debt,
        status,
        history: paymentInfo.history || []
      });
    });

    // Update filter counts
    document.getElementById('payCountAll').textContent = countAll;
    document.getElementById('payCountUnpaid').textContent = countUnpaid;
    document.getElementById('payCountPaid').textContent = countPaid;

    // Filter list
    const filteredList = memberBillingList.filter(item => {
      if (this.currentFilter === 'unpaid') {
        return item.status === 'unpaid' || item.status === 'partial';
      }
      if (this.currentFilter === 'paid') {
        return item.status === 'paid';
      }
      return true; // all
    });

    const tbody = document.getElementById('paymentTableBody');
    if (!tbody) return;

    if (filteredList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
            <div>Không có dữ liệu trong mục này.</div>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    filteredList.forEach((item, index) => {
      let statusBadge = '<span class="badge-status" style="background:var(--bg-surface-subtle);color:var(--text-dim)">— Không ăn</span>';
      if (item.status === 'paid') {
        statusBadge = '<span class="badge-status badge-paid">✅ Đã nộp đủ</span>';
      } else if (item.status === 'partial') {
        statusBadge = '<span class="badge-status badge-partial">⚠️ Đã nộp 1 phần</span>';
      } else if (item.status === 'unpaid') {
        statusBadge = '<span class="badge-status badge-unpaid">❌ Chưa nộp</span>';
      }

      rowsHtml += `
        <tr>
          <td style="color: var(--text-muted); font-weight: 600;">${index + 1}</td>
          <td>
            <strong>${item.member.name}</strong>
            ${item.member.phone ? `<div style="font-size:11.5px;color:var(--text-muted)">${item.member.phone}</div>` : ''}
          </td>
          <td style="text-align: center; font-family: var(--font-mono); font-weight: 700;">
            ${item.meals} suất
          </td>
          <td style="text-align: right;" class="amount-primary">
            ${item.totalAmount.toLocaleString('vi-VN')}đ
          </td>
          <td style="text-align: right;" class="amount-muted">
            ${item.paidAmount.toLocaleString('vi-VN')}đ
          </td>
          <td style="text-align: right;" class="${item.debt > 0 ? 'amount-danger' : 'amount-muted'}">
            ${item.debt.toLocaleString('vi-VN')}đ
          </td>
          <td style="text-align: center;">
            ${statusBadge}
          </td>
          <td>
            <div class="payment-actions-cell">
              <button class="btn btn-sm btn-primary" onclick="Payment.openPaymentModal('${item.member.id}')" title="Cập nhật số tiền đã thu">
                💳 Thu tiền
              </button>
              ${item.paidAmount > 0 ? `
                <button class="btn btn-sm btn-subtle" onclick="Payment.openDeletePaymentModal('${item.member.id}')" title="Xem danh sách và chọn khoản thu muốn xóa" style="color: var(--danger);">
                  🗑️ Xóa thu
                </button>
              ` : ''}
              ${item.debt > 0 ? `
                <button class="btn btn-sm btn-subtle" onclick="Payment.openVietQRModal('${item.member.id}')" title="Tạo mã QR chuyển khoản">
                  🏦 QR
                </button>
                <button class="btn btn-sm btn-subtle" onclick="Payment.openReminderModal('${item.member.id}')" title="Mẫu tin nhắn nhắc chuyển tiền">
                  💬 Nhắc
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  },

  openPaymentModal(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const yearMonth = Tracker.getYearMonthStr();
    const billing = this.getMemberMonthBilling(memberId, yearMonth);
    const { meals, totalAmount, paidAmount, debt, paymentInfo } = billing;

    this.activeMemberForPay = {
      memberId,
      memberName: member.name,
      meals,
      totalAmount,
      paidAmount,
      debt
    };

    document.getElementById('payModalMemberId').value = memberId;
    document.getElementById('payModalMemberName').textContent = member.name;
    document.getElementById('payModalPeriod').textContent = `Tháng ${Tracker.currentMonth}/${Tracker.currentYear}`;
    document.getElementById('payModalMeals').textContent = `${meals} suất`;
    document.getElementById('payModalTotalAmount').textContent = `${totalAmount.toLocaleString('vi-VN')}đ`;
    document.getElementById('payModalPrevPaid').textContent = `${paidAmount.toLocaleString('vi-VN')}đ`;
    document.getElementById('payModalRemainingDebt').textContent = `${debt.toLocaleString('vi-VN')}đ`;

    // Default input value is remaining debt (or full totalAmount if not paid yet, 0 if paid in full)
    document.getElementById('inputPayAmount').value = debt > 0 ? debt : (totalAmount > 0 && paidAmount === 0 ? totalAmount : 0);
    document.getElementById('inputPayDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('inputPayNote').value = '';

    // Render payment history list and toggle reset button
    const btnReset = document.getElementById('btnResetMonthPaymentInModal');
    if (btnReset) {
      btnReset.style.display = paidAmount > 0 ? 'inline-flex' : 'none';
    }
    this.renderPaymentHistoryInModal(paymentInfo.history || [], memberId, yearMonth);

    App.openModal('modalPayment');
  },

  savePayment() {
    if (!this.activeMemberForPay) return;

    const memberId = this.activeMemberForPay.memberId;
    const yearMonth = Tracker.getYearMonthStr();
    const amount = Number(document.getElementById('inputPayAmount').value) || 0;
    const method = document.getElementById('selectPayMethod').value;
    const date = document.getElementById('inputPayDate').value;
    const note = document.getElementById('inputPayNote').value;

    Storage.recordPayment(yearMonth, memberId, amount, method, note, date);

    App.closeModal('modalPayment');
    App.showToast(`Đã lưu thanh toán cho ${this.activeMemberForPay.memberName}!`, 'success');

    this.render();
    if (window.Tracker) Tracker.render();
  },

  getTransferMemo() {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `tien com den ngay ${d}-${m}-${y}`;
  },

  openVietQRModal(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const yearMonth = Tracker.getYearMonthStr();
    const billing = this.getMemberMonthBilling(memberId, yearMonth);
    const { debt } = billing;

    const bankInfo = (window.AppConfig && window.AppConfig.bankInfo) || Storage.getSettings().bankInfo || {};
    const bankCode = bankInfo.bankCode || 'MB';
    const accNum = bankInfo.accountNumber || '';
    const accName = bankInfo.accountName || '';

    if (!accNum) {
      App.showToast('Chưa cấu hình Số tài khoản nhận tiền trong file js/config.js!', 'error');
      return;
    }

    const memo = this.getTransferMemo();

    document.getElementById('qrSubtitleText').textContent = `Chuyển khoản tiền cơm cho ${member.name}`;
    document.getElementById('qrBankLabel').textContent = bankCode;
    document.getElementById('qrAccountLabel').textContent = accNum;
    document.getElementById('qrNameLabel').textContent = accName || 'CHỦ TÀI KHOẢN';
    document.getElementById('qrAmountLabel').textContent = `${debt.toLocaleString('vi-VN')}đ`;
    document.getElementById('qrMemoLabel').textContent = memo;

    // VietQR Public API endpoint:
    // https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
    const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accNum}-compact2.png?amount=${debt}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accName)}`;

    const qrImg = document.getElementById('qrImageElement');
    const qrSpinner = document.getElementById('qrLoadingSpinner');
    
    qrSpinner.style.display = 'block';
    qrImg.style.display = 'none';

    qrImg.onload = () => {
      qrSpinner.style.display = 'none';
      qrImg.style.display = 'block';
    };
    qrImg.onerror = () => {
      qrSpinner.textContent = 'Không tải được mã QR. Vui lòng kiểm tra STK ngân hàng.';
    };

    qrImg.src = qrUrl;
    App.openModal('modalVietQR');
  },

  openReminderModal(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const yearMonth = Tracker.getYearMonthStr();
    const billing = this.getMemberMonthBilling(memberId, yearMonth);
    const { meals, totalAmount, paidAmount, debt, unitPrice } = billing;

    const settings = Storage.getSettings();
    const bankInfo = settings.bankInfo || {};
    const memo = this.getTransferMemo();

    let msg = `Chào bạn ${member.name} thân mến! 🍚\n`;
    msg += `Tổng kết tiền cơm trưa Tháng ${Tracker.currentMonth}/${Tracker.currentYear} của bạn:\n`;
    msg += `• Số bữa ăn: ${meals} bữa\n`;
    msg += `• Đơn giá: ${unitPrice.toLocaleString('vi-VN')}đ / bữa\n`;
    msg += `• Tổng tiền: ${totalAmount.toLocaleString('vi-VN')}đ\n`;
    if (paidAmount > 0) {
      msg += `• Đã gửi trước: ${paidAmount.toLocaleString('vi-VN')}đ\n`;
    }
    msg += `👉 Số tiền cần thanh toán: ${debt.toLocaleString('vi-VN')}đ\n\n`;

    if (bankInfo.accountNumber) {
      msg += `🏦 Thông tin chuyển khoản:\n`;
      msg += `• Ngân hàng: ${bankInfo.bankCode}\n`;
      msg += `• Số TK: ${bankInfo.accountNumber}\n`;
      msg += `• Tên: ${bankInfo.accountName || ''}\n`;
      msg += `• Nội dung CK: ${memo}\n\n`;
    }

    msg += `Cảm ơn bạn nhiều nhé! ❤️`;

    document.getElementById('textReminderMessage').value = msg;
    App.openModal('modalReminder');
  },

  renderPaymentHistoryInModal(history, memberId, yearMonth) {
    const container = document.getElementById('paymentHistoryListContainer');
    if (!container) return;

    if (!history || history.length === 0) {
      container.innerHTML = `
        <div style="font-size: 12.5px; color: var(--text-muted); font-style: italic; padding: 10px; text-align: center;">
          Chưa có khoản thu nào được ghi nhận trong tháng này.
        </div>
      `;
      return;
    }

    let html = '';
    // Show newest transactions first
    history.slice().reverse().forEach(h => {
      const methodLabel = h.method === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản';
      const dateStr = h.date || (h.createdAt ? h.createdAt.slice(0, 10) : '');
      const formattedAmount = (Number(h.amount) || 0).toLocaleString('vi-VN');
      const noteHtml = h.note ? `<div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">💬 ${this.escapeHtml(h.note)}</div>` : '';

      html += `
        <div class="pay-history-item">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="pay-history-amount">+${formattedAmount}đ</span>
              <span class="badge-status" style="font-size: 11px; padding: 2px 6px; background: var(--bg-surface-subtle); color: var(--text-muted);">${methodLabel}</span>
              <span class="pay-history-meta">${dateStr}</span>
            </div>
            ${noteHtml}
          </div>
          <div>
            <button type="button" class="btn btn-sm btn-subtle" onclick="Payment.deleteHistoryItem('${memberId}', '${h.id}')" title="Xóa khoản thu này" style="color: var(--danger); padding: 4px 8px; font-size: 12px;">
              🗑️
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  openDeletePaymentModal(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const yearMonth = Tracker.getYearMonthStr();
    const billing = this.getMemberMonthBilling(memberId, yearMonth);
    const { totalAmount, paidAmount, debt, paymentInfo } = billing;

    document.getElementById('delPayModalMemberId').value = memberId;
    document.getElementById('delPayModalMemberName').textContent = member.name;
    document.getElementById('delPayModalPeriod').textContent = `Tháng ${Tracker.currentMonth}/${Tracker.currentYear}`;
    document.getElementById('delPayModalTotalAmount').textContent = `${totalAmount.toLocaleString('vi-VN')}đ`;
    document.getElementById('delPayModalPaidAmount').textContent = `${paidAmount.toLocaleString('vi-VN')}đ`;
    document.getElementById('delPayModalDebt').textContent = `${debt.toLocaleString('vi-VN')}đ`;

    const btnDelAll = document.getElementById('btnDeleteAllPaymentsForMember');
    if (btnDelAll) {
      btnDelAll.style.display = paidAmount > 0 ? 'inline-flex' : 'none';
    }

    const container = document.getElementById('delPaymentListContainer');
    const history = paymentInfo.history || [];

    if (history.length === 0) {
      container.innerHTML = `
        <div style="font-size: 13px; color: var(--text-muted); font-style: italic; padding: 20px; text-align: center;">
          Thành viên này hiện không có khoản thu nào trong tháng.
        </div>
      `;
    } else {
      let html = '';
      history.slice().reverse().forEach(h => {
        const methodBadge = h.method === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản';
        const dateStr = h.date || (h.createdAt ? h.createdAt.slice(0, 10) : '');
        const formattedAmount = (Number(h.amount) || 0).toLocaleString('vi-VN');
        const noteHtml = h.note ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">💬 ${this.escapeHtml(h.note)}</div>` : '';

        html += `
          <div class="pay-history-item" style="padding: 10px 12px; margin-bottom: 8px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="pay-history-amount" style="font-size: 15px; color: var(--primary);">+${formattedAmount}đ</span>
                <span class="badge-status" style="font-size: 11px; padding: 2px 7px; background: var(--bg-surface-subtle); color: var(--text-muted);">${methodBadge}</span>
                <span class="pay-history-meta" style="font-size: 12px;">📅 ${dateStr}</span>
              </div>
              ${noteHtml}
            </div>
            <div>
              <button type="button" class="btn btn-sm btn-danger" onclick="Payment.deleteSinglePaymentItem('${memberId}', '${h.id}')" title="Xóa khoản thu này" style="padding: 5px 12px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                🗑️ Xóa khoản này
              </button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    }

    App.openModal('modalDeletePayment');
  },

  deleteSinglePaymentItem(memberId, historyId) {
    const member = Storage.getMemberById(memberId);
    const memberName = member ? member.name : 'thành viên';
    const yearMonth = Tracker.getYearMonthStr();
    const paymentInfo = Storage.getMemberPayment(yearMonth, memberId);
    const item = (paymentInfo.history || []).find(h => h.id === historyId);
    const itemAmountStr = item ? (Number(item.amount) || 0).toLocaleString('vi-VN') + 'đ' : '';

    if (!confirm(`Bạn có chắc chắn muốn xóa khoản thu ${itemAmountStr ? itemAmountStr + ' ' : ''}này của ${memberName}?`)) {
      return;
    }

    Storage.deletePaymentHistoryItem(yearMonth, memberId, historyId);
    App.showToast(`Đã xóa khoản thu của ${memberName}!`, 'info');

    // Refresh modal with updated data
    const updatedPayment = Storage.getMemberPayment(yearMonth, memberId);
    if (!updatedPayment.paid || updatedPayment.paid <= 0) {
      App.closeModal('modalDeletePayment');
    } else {
      this.openDeletePaymentModal(memberId);
    }

    this.render();
    if (window.Tracker) Tracker.render();
  },

  deleteHistoryItem(memberId, historyId) {
    const member = Storage.getMemberById(memberId);
    const memberName = member ? member.name : 'thành viên';
    if (!confirm(`Bạn có chắc chắn muốn xóa khoản thu này của ${memberName}?`)) {
      return;
    }

    const yearMonth = Tracker.getYearMonthStr();
    Storage.deletePaymentHistoryItem(yearMonth, memberId, historyId);
    App.showToast(`Đã xóa khoản thu của ${memberName}!`, 'info');

    // Refresh modal if still open
    this.openPaymentModal(memberId);
    this.render();
    if (window.Tracker) Tracker.render();
  },

  confirmDeletePayment(memberId, isFromDeleteModal = false) {
    const member = Storage.getMemberById(memberId);
    const memberName = member ? member.name : 'thành viên';
    if (!confirm(`Bạn có chắc chắn muốn XÓA TOÀN BỘ số tiền đã nộp trong tháng này của ${memberName}?\nSố tiền đã nộp sẽ quay về 0đ.`)) {
      return;
    }

    const yearMonth = Tracker.getYearMonthStr();
    Storage.deletePayment(yearMonth, memberId);
    App.showToast(`Đã xóa toàn bộ khoản thu tháng này của ${memberName}!`, 'info');

    if (isFromDeleteModal) {
      App.closeModal('modalDeletePayment');
    }
    App.closeModal('modalPayment');
    this.render();
    if (window.Tracker) Tracker.render();
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  removeVietnameseTones(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }
};

window.Payment = Payment;
