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
        document.getElementById('inputPayAmount').value = total;
      });
    }

    const btnPayClear = document.getElementById('btnPayClear');
    if (btnPayClear) {
      btnPayClear.addEventListener('click', () => {
        document.getElementById('inputPayAmount').value = 0;
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

  render() {
    const yearMonth = Tracker.getYearMonthStr();
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const members = Storage.getMembers();
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const monthPayments = Storage.getMonthPayments(yearMonth);

    let countAll = 0;
    let countUnpaid = 0;
    let countPaid = 0;

    const memberBillingList = [];

    members.forEach(member => {
      // Calculate member meals in month
      let meals = 0;
      Object.keys(monthRecords).forEach(dateStr => {
        const rec = monthRecords[dateStr]?.[member.id];
        if (rec && rec.count > 0) {
          meals += rec.count;
        }
      });

      const totalAmount = meals * unitPrice;
      const paymentInfo = monthPayments[member.id] || { paid: 0, history: [] };
      const paidAmount = paymentInfo.paid || 0;
      const debt = Math.max(0, totalAmount - paidAmount);

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
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const paymentInfo = Storage.getMemberPayment(yearMonth, memberId);

    let meals = 0;
    Object.keys(monthRecords).forEach(d => {
      const rec = monthRecords[d]?.[memberId];
      if (rec && rec.count > 0) meals += rec.count;
    });

    const totalAmount = meals * unitPrice;
    const paidAmount = paymentInfo.paid || 0;
    const debt = Math.max(0, totalAmount - paidAmount);

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

    // Default input value is current total paid (or full totalAmount if they want to pay all)
    document.getElementById('inputPayAmount').value = totalAmount;
    document.getElementById('inputPayDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('inputPayNote').value = '';

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

  openVietQRModal(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const yearMonth = Tracker.getYearMonthStr();
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const paymentInfo = Storage.getMemberPayment(yearMonth, memberId);

    let meals = 0;
    Object.keys(monthRecords).forEach(d => {
      const rec = monthRecords[d]?.[memberId];
      if (rec && rec.count > 0) meals += rec.count;
    });

    const totalAmount = meals * unitPrice;
    const paidAmount = paymentInfo.paid || 0;
    const debt = Math.max(0, totalAmount - paidAmount);

    const bankInfo = settings.bankInfo || {};
    const bankCode = bankInfo.bankCode || 'MB';
    const accNum = bankInfo.accountNumber || '';
    const accName = bankInfo.accountName || '';

    if (!accNum) {
      App.showToast('Vui lòng vào tab Cài Đặt để nhập Số tài khoản ngân hàng trước!', 'error');
      App.switchTab('settings');
      return;
    }

    // Remove accents from member name for transfer memo
    const cleanName = this.removeVietnameseTones(member.name).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
    const memo = `TIEN COM T${Tracker.currentMonth} ${cleanName}`.substring(0, 25);

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
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const paymentInfo = Storage.getMemberPayment(yearMonth, memberId);

    let meals = 0;
    Object.keys(monthRecords).forEach(d => {
      const rec = monthRecords[d]?.[memberId];
      if (rec && rec.count > 0) meals += rec.count;
    });

    const totalAmount = meals * unitPrice;
    const paidAmount = paymentInfo.paid || 0;
    const debt = Math.max(0, totalAmount - paidAmount);

    const bankInfo = settings.bankInfo || {};
    const cleanName = this.removeVietnameseTones(member.name).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
    const memo = `TIEN COM T${Tracker.currentMonth} ${cleanName}`.substring(0, 25);

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

  removeVietnameseTones(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }
};

window.Payment = Payment;
