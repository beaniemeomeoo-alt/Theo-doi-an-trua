/**
 * export.js - Excel/CSV and Backup/Restore Utility
 * Exports clean Vietnamese UTF-8 CSV with BOM for Excel compatibility.
 */

const Exporter = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Export Month CSV Button on Toolbar
    const btnExportCSV = document.getElementById('btnExportMonthCSV');
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => this.exportMonthlyCSV());
    }

    // Export JSON Backup
    const btnExportJSON = document.getElementById('btnExportJSON');
    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => this.exportJSONBackup());
    }

    // Import JSON Restore
    const fileInput = document.getElementById('inputFileRestore');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleJSONRestore(e));
    }
  },

  exportMonthlyCSV() {
    const year = Tracker.currentYear;
    const month = Tracker.currentMonth;
    const yearMonth = Tracker.getYearMonthStr();
    const settings = Storage.getSettings();
    const unitPrice = settings.mealPrice || 30000;
    const members = Storage.getMembers().filter(m => m.active);
    const monthRecords = Storage.getMonthRecords(yearMonth);
    const monthPayments = Storage.getMonthPayments(yearMonth);

    const daysInMonth = new Date(year, month, 0).getDate();

    // CSV Lines Array
    const lines = [];

    // Title info
    lines.push(`"BẢNG THEO DÕI & TỔNG KẾT TIỀN CƠM TRƯA - THÁNG ${month}/${year}"`);
    lines.push(`"Đơn giá áp dụng:","${unitPrice.toLocaleString('vi-VN')} VNĐ / suất"`);
    lines.push(`"Ngày xuất báo cáo:","${new Date().toLocaleDateString('vi-VN')}"`);
    lines.push(''); // Empty line

    // Header Row
    const headerCols = ['"STT"', '"Họ và tên"'];
    for (let d = 1; d <= daysInMonth; d++) {
      headerCols.push(`"N${d}"`);
    }
    headerCols.push('"Tổng suất"', '"Đơn giá (đ)"', '"Thành tiền (đ)"', '"Đã nộp (đ)"', '"Còn nợ (đ)"', '"Ghi chú"');
    lines.push(headerCols.join(','));

    // Data Rows
    let grandMeals = 0;
    let grandAmount = 0;
    let grandPaid = 0;
    let grandDebt = 0;

    const dayTotals = {};
    for (let d = 1; d <= daysInMonth; d++) dayTotals[d] = 0;

    members.forEach((member, index) => {
      let memberMeals = 0;
      let totalAmt = 0;
      const rowCols = [
        `"${index + 1}"`,
        `"${member.name}"`
      ];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const rec = monthRecords[dateStr]?.[member.id];
        const count = rec?.count || 0;

        if (count > 0) {
          memberMeals += count;
          dayTotals[d] += count;
          const p = (rec.price !== undefined && rec.price !== null && rec.price !== '') ? Number(rec.price) : unitPrice;
          totalAmt += count * p;
          rowCols.push(`"${count}"`);
        } else {
          const isAbsent = (window.Tracker && typeof Tracker.isAbsentDate === 'function')
            ? Tracker.isAbsentDate(dateStr)
            : (() => {
                const dateObj = new Date(year, month - 1, d);
                const dow = dateObj.getDay();
                const now = new Date();
                const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                return (dow === 0) || (dateStr <= nowStr && dow >= 1 && dow <= 5);
              })();

          rowCols.push(isAbsent ? '"X"' : '""');
        }
      }

      const paymentInfo = monthPayments[member.id] || { paid: 0 };
      const paid = paymentInfo.paid || 0;
      const debt = Math.max(0, totalAmt - paid);

      grandMeals += memberMeals;
      grandAmount += totalAmt;
      grandPaid += paid;
      grandDebt += debt;

      rowCols.push(`"${memberMeals}"`);
      rowCols.push(`"${unitPrice}"`);
      rowCols.push(`"${totalAmt}"`);
      rowCols.push(`"${paid}"`);
      rowCols.push(`"${debt}"`);
      rowCols.push(`"${(member.note || '').replace(/"/g, '""')}"`);

      lines.push(rowCols.join(','));
    });

    // Summary Bottom Row
    const sumCols = ['"TỔNG CỘNG"', '""'];
    for (let d = 1; d <= daysInMonth; d++) {
      sumCols.push(`"${dayTotals[d] || ''}"`);
    }
    sumCols.push(`"${grandMeals}"`, '""', `"${grandAmount}"`, `"${grandPaid}"`, `"${grandDebt}"`, '""');
    lines.push(sumCols.join(','));

    // Create Download Link with UTF-8 BOM (\uFEFF) for Excel
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `Tien_Com_Thang_${month}_${year}.csv`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    App.showToast(`Đã xuất file: ${filename}`, 'success');
  },

  exportJSONBackup() {
    const data = Storage.loadData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const filename = `Com_Trua_Backup_${new Date().toISOString().slice(0, 10)}.json`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    App.showToast(`Đã xuất file dự phòng: ${filename}`, 'success');
  },

  handleJSONRestore(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.members || !parsed.settings) {
          throw new Error('Cấu trúc file sao lưu không hợp lệ.');
        }

        if (confirm('Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại bằng dữ liệu trong file này. Bạn có chắc không?')) {
          Storage.saveData(parsed);
          App.showToast('Phục hồi dữ liệu thành công!', 'success');
          setTimeout(() => location.reload(), 800);
        }
      } catch (err) {
        alert('Lỗi đọc file sao lưu: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  }
};

window.Exporter = Exporter;
