# 🍚 Cơm Trưa Pro — Hệ Thống Theo Dõi Suất Ăn & Quản Lý Thu Tiền

Ứng dụng web hiện đại, trực quan giúp theo dõi, điểm danh người ăn cơm trưa hàng ngày và tự động tính toán, quản lý công nợ, thu tiền cho văn phòng, công ty hoặc đội nhóm.

---

## 🌟 Tính Năng Nổi Bật

### 1. 📅 Bảng Theo Dõi Tháng (Interactive Grid Matrix)
- **Kéo và thả để tick chọn (Drag to Select/Paint)**: Nhấn giữ chuột và kéo lướt qua nhiều ngày để đánh dấu ăn (✓) hoặc nghỉ (·) nhanh chóng mà không cần click từng ô.
- Cố định cột STT, Tên thành viên bên trái và các cột Tổng suất, Thành tiền bên phải khi cuộn ngang.
- Tự động đánh dấu nổi bật **ngày hôm nay** và phân biệt màu các ngày cuối tuần (Thứ 7 & Chủ Nhật).
- Click đúp hoặc chuột phải vào ô để tùy chỉnh nhiều suất ăn (>1 suất) hoặc nhập ghi chú riêng (VD: "Có khách", "Không ăn cơm").
- Thống kê trực quan theo thời gian thực: Tổng suất ăn, Tổng tiền, Số tiền đã thu, Số tiền còn nợ, % hoàn thành.

### 2. ✅ Điểm Danh Hôm Nay & Danh Sách Đặt Cơm
- Xem nhanh và chuyển đổi qua lại giữa các ngày (Hôm trước, Hôm sau, Về hôm nay).
- Nút **"Chọn tất cả ăn"** và **"Bỏ chọn tất cả"** chỉ với 1 cú click.
- Nút **"📋 Copy danh sách đặt cơm"**: Tự động tổng hợp danh sách người ăn cơm thành văn bản chuẩn để gửi nhanh qua Zalo, Messenger hoặc gửi quán cơm.

### 3. 💰 Sổ Thu Tiền, Công Nợ & VietQR
- Bảng tổng hợp công nợ chi tiết từng người trong tháng: Số suất ăn, Thành tiền, Đã nộp, Còn nợ, Trạng thái (Đã nộp đủ / Nộp một phần / Chưa nộp).
- Bộ lọc tiện lợi: *Tất cả*, *Chưa thu / Còn nợ*, *Đã thu đủ*.
- Ghi nhận lịch sử nộp tiền (Tiền mặt / Chuyển khoản).
- **Tích hợp VietQR**: Tự động tạo mã QR chuyển khoản ngân hàng chuẩn xác kèm số tiền nợ và nội dung chuyển khoản tương ứng.
- **Mẫu tin nhắn nhắc nộp tiền**: Tự động soạn sẵn tin nhắn lịch sự kèm số tiền và STK để sao chép gửi cho thành viên.

### 4. 👥 Quản Lý Thành Viên
- Thêm mới, chỉnh sửa thông tin (Họ tên, Số điện thoại, Bộ phận / Sở thích).
- Tính năng **Tạm nghỉ / Bật lại**: Giúp tạm ẩn người đi công tác hoặc nghỉ phép dài hạn khỏi bảng điểm danh mà không làm mất lịch sử cũ.

### 5. ⚙️ Cài Đặt & Dữ Liệu
- Tùy chỉnh đơn giá cơm (mặc định 30.000đ hoặc 40.000đ/suất).
- Cấu hình tài khoản ngân hàng nhận tiền chuyển khoản (Ngân hàng, Số TK, Tên chủ TK).
- **Xuất file Excel / CSV**: Hỗ trợ chuẩn font UTF-8 có BOM (mở trực tiếp bằng Microsoft Excel không bị lỗi font Tiếng Việt).
- **Sao lưu & Phục hồi JSON**: Tải dữ liệu về máy tính dự phòng hoặc khôi phục lại khi cần.
- **✨ Nạp dữ liệu mẫu**: Thử nghiệm ứng dụng ngay tức thì với dữ liệu mẫu có sẵn.
- Hỗ trợ đổi giao diện **Sáng (Light Mode)** và **Tối (Dark Mode)**.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

- **Frontend Core**: HTML5 Semantic, Vanilla JavaScript (ES6+), Modular Architecture.
- **Styling**: Vanilla CSS3 (CSS Variables, Flexbox, CSS Grid, Sticky positioning, Glassmorphism).
- **Typography**: Google Fonts (*Plus Jakarta Sans* cho giao diện & *JetBrains Mono* cho số liệu).
- **Lưu trữ**: Trình duyệt LocalStorage — hoạt động hoàn toàn độc lập, không phụ thuộc server hay cơ sở dữ liệu bên ngoài.
- **Tích hợp bên ngoài**: VietQR API (sinh mã QR ngân hàng thanh toán nhanh).

---

## 🚀 Hướng Dẫn Sử Dụng & Triển Khai

### Chạy trực tiếp tại máy (Local)
1. Tải repository về máy hoặc giải nén mã nguồn.
2. Nhấp đúp vào file `index.html` để mở ngay trên trình duyệt bất kỳ (Chrome, Edge, Cốc Cốc, Firefox, Safari...).

### Triển khai lên GitHub Pages (Miễn phí)
1. Vào mục **Settings** của repository trên GitHub.
2. Chọn menu **Pages** ở cột bên trái.
3. Tại phần **Build and deployment > Branch**, chọn branch `main` và thư mục `/ (root)`.
4. Nhấn **Save**. Sau khoảng 1-2 phút, trang web sẽ trực tuyến tại địa chỉ `https://<username>.github.io/Theo-doi-an-trua/`.
