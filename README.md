# ExamBuilder

Ứng dụng soạn đề cho giáo viên, gồm bản web chạy trên máy và bản Android.

## Chạy web

Cài Node.js 24, tải mã nguồn rồi mở `Chay_ExamBuilder.bat` trên Windows. Lần đầu ứng dụng tự cài các gói phụ thuộc và mở `http://localhost:3000`.

Hoặc chạy:

```sh
npm ci
npm start
```

## Đồng bộ kho đề

- Mọi bản cài có sẵn Gist chung và tự kéo đề khi mở hoặc có mạng trở lại; không cần token để đọc.
- Chủ kho lưu GitHub token có quyền Gist trong **Lịch sử → Đồng bộ** để đẩy thay đổi. Kho chung chỉ nhận thao tác ghi của tài khoản `TranViet30`.
- Web mặc định bật **Tự đẩy kho đề khi đóng web**. Máy chủ cũng đẩy sau khi lưu/sửa/xóa đề để giảm phụ thuộc vào sự kiện đóng trình duyệt. Có thể tắt trong Đồng bộ và vẫn đẩy thủ công.
- Khi mất mạng, đề và trạng thái chờ đẩy nằm trong SQLite trên máy; ứng dụng thử lại khi còn chạy, có mạng hoặc mở lại. Bản nháp chưa gửi kịp nằm trong trình duyệt và được gửi lại khi mở web cùng địa chỉ/profile.
- Với cửa sổ chạy `.bat`, nhấn **Enter** để chờ lưu/đẩy xong rồi thoát. Khi chạy `npm start`, dùng **Ctrl+C**. Tắt nguồn hoặc buộc dừng có thể ngắt lần gửi cuối; không xóa dữ liệu trình duyệt hay `backend/exam.db` khi còn bản chờ.

Token, database chứa đề/cấu hình cá nhân, ảnh tải lên, khóa ký và tệp build được loại bằng `.gitignore`. Kho đề được gửi qua GitHub **Gist**; mã nguồn được quản lý trong repository GitHub riêng.

## Android

[Tải APK 1.3.0](https://github.com/august0362/Exambuilder/releases/download/android-v1.3.0/ExamBuilder.apk). Bản Android có kiểm tra cập nhật qua GitHub Releases.

## Kiểm tra và tài liệu

```sh
npm test -- --runInBand
```

Chi tiết: [hướng dẫn dự án](documents/README.md), [kho đề chung và đồng bộ](documents/SHARED_LIBRARY.md), [Android](Exam%20builder%20for%20adr/README.md).
