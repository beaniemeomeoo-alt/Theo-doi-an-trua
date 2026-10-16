/**
 * CẤU HÌNH HỆ THỐNG CƠM TRƯA PRO
 * =======================================================
 * ⚠️ THÔNG TIN TÀI KHOẢN NHẬN TIỀN (VIETQR)
 * - Quyền chỉnh sửa thông tin ngân hàng trên giao diện đã được khóa và ẩn để đảm bảo an toàn tuyệt đối.
 * - Khi cần thay đổi thông tin nhận tiền, bạn chỉ cần chỉnh sửa trực tiếp các giá trị dưới đây trong file này trên GitHub.
 */
const AppConfig = {
  bankInfo: {
    bankCode: 'MB',                      // Mã ngân hàng (VD: MB, VCB, TCB, VPB, ACB, BIDV,...)
    accountNumber: '7700113959999',       // Số tài khoản ngân hàng
    accountName: 'TRUONG THI BICH PHUONG' // Tên chủ tài khoản (viết hoa không dấu)
  }
};

if (typeof window !== 'undefined') {
  window.AppConfig = AppConfig;

  // Hàm làm sạch dữ liệu văn bản chống tấn công XSS
  window.escapeHtml = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
