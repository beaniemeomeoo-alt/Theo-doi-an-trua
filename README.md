# Theo dõi cơm trưa

Ứng dụng HTML/CSS/JavaScript, Cloudflare Worker và D1. Dữ liệu trình duyệt là bộ nhớ đệm; thay đổi chỉ được báo thành công sau khi máy chủ xác nhận. Khi mất mạng, có thể xem dữ liệu đã tải, nhưng không lưu thay đổi vào dữ liệu chính.

## Cấu hình đăng nhập trước khi triển khai

Bản này không sử dụng tài khoản `admin/admin`, khóa ký token mặc định hoặc đăng nhập giả lập bằng file HTML. Nếu cấu hình chưa đủ, API trả về HTTP 503 để tránh mở quyền truy cập ngoài ý muốn.

Cấu hình hai Worker secrets bằng lời nhắc nhập liệu của Wrangler; không ghi giá trị thật vào Git hoặc gửi trong chat:

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put AUTH_SECRET
```

- `ADMIN_PASSWORD`: mật khẩu riêng, ít nhất 12 ký tự.
- `AUTH_SECRET`: chuỗi ngẫu nhiên, ít nhất 32 ký tự. Có thể tạo chuỗi 32 byte bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` trên máy của quản trị viên.
- Tên đăng nhập mặc định là `admin`. Có thể đặt `ADMIN_USERNAME` (chữ thường, số, `_`, `-`).
- Đổi `AUTH_SECRET` sẽ vô hiệu hóa các token cũ. Sau khi nâng cấp, đăng nhập lại.

Để chạy cục bộ, tạo `.dev.vars` với các biến trên và giá trị riêng dành cho phát triển. `.dev.vars*` và `.env*` đã được loại khỏi Git và static assets. Khởi tạo D1 cục bộ rồi chạy:

```sh
npx wrangler d1 execute theo-doi-com-db --local --file=./schema.sql
npx wrangler dev
```

Mở `http://localhost:8787`. Bản sửa sử dụng schema hiện có, không cần migration dữ liệu. Việc sửa mã nguồn không tự triển khai lên Cloudflare; chỉ triển khai sau khi secrets đã được cấu hình.

## Tính đúng dữ liệu

- Bộ lọc ẩn cuối tuần chỉ ẩn cột, không thay đổi tổng suất hoặc tổng tiền tháng.
- Mã giao dịch được giữ nguyên giữa trình duyệt và máy chủ. Khoản thu chưa nhận được phản hồi giữ mã để gửi lại mà không cộng trùng; mở lại hộp thu tiền sẽ khôi phục các giá trị đang chờ xác nhận.
- Ghi và xóa khoản thu kiểm tra phiên bản dữ liệu trước khi cập nhật; nếu có thay đổi đồng thời, đọc lại rồi thử lại. Không cắt bỏ các khoản cũ khi vượt 100 giao dịch.
- Lỗi HTTP hoặc mất mạng được báo trên giao diện, không cập nhật bộ nhớ đệm như thể đã lưu thành công. Khi lỗi giữa một thao tác trên hơn 150 ô, các nhóm đã được máy chủ xác nhận vẫn giữ nguyên.
- Thông báo hiển thị tên thành viên dưới dạng văn bản, không diễn giải thành HTML.

Tham khảo kết quả ghi của D1: [D1 return objects](https://developers.cloudflare.com/d1/worker-api/return-object/).

## Kiểm thử

Cần Node.js 24 trở lên; không cần cài thư viện kiểm thử:

```sh
node --test tests/security-regressions.cjs
```

Các kiểm thử dùng SQLite trong bộ nhớ và API giả lập trong tiến trình. Không kết nối hoặc sửa D1 thật. Bao gồm xác thực, XSS trong thông báo, lỗi HTTP, mất phản hồi thanh toán, ghi đồng thời, xóa giao dịch, dữ liệu cũ và tổng tiền khi ẩn cuối tuần.