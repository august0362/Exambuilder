# Kho đề chung và tự kéo khi mở ExamBuilder

Nguồn mặc định: Gist **282c661c4f3d20d64446358973bb03e7**, chủ sở hữu **TranViet30**. Cấu hình chung duy nhất là [resources/shared-library.json](../resources/shared-library.json); backend Node đọc file này, Gradle Android nhúng hai trường vào BuildConfig. File này chỉ chứa ID và tên chủ kho, không có token.

## Người nhận đề

- Android 1.3.0 trở lên mới cài có sẵn ID và bật tự kéo. Web/PC dùng ID mặc định khi chưa cấu hình kho; tự kéo khi trang mở, trở lại tab hoặc có mạng trở lại.
- Kéo đề không cần tài khoản GitHub hay token. Kho chung được đọc ẩn danh, ngay cả khi thiết bị có lưu token hết hạn. Thông tin và đáp án trong Gist chung đều có thể được mọi người đọc.
- Ứng dụng chờ kho cục bộ được nạp rồi mới kéo, gộp theo thời gian cập nhật và vẫn giữ bản sửa trên máy mới hơn. Không tự tải lại đề đang mở trong trình soạn.
- Tự kéo tối đa một lần mỗi 60 giây trong cùng phiên chạy để tránh lặp do nhiều sự kiện mở/mạng. Có thể bấm Kéo về bất kỳ lúc nào. Không có dịch vụ chạy định kỳ khi Android đã đóng; khi ngoại tuyến vẫn dùng kho đã lưu.
- Công tắc trong Kho đề lưu riêng từng thiết bị (Android DataStore, web localStorage). Gist riêng đã nhập được giữ; có thể bấm **Dùng kho đề chung mặc định** để chuyển về nguồn chung.

## Chủ kho đăng đề

1. Chỉ nhập token GitHub có quyền Gist của **TranViet30** trên thiết bị do chủ kho quản lý. Người nhận đề không cần token này.
2. Giữ Gist ID ở giá trị mặc định. Soạn hoặc sửa đề, chờ tự lưu vào Kho đề rồi bấm **Đẩy lên**.
3. Ứng dụng gọi API GitHub xác minh tài khoản trước khi PATCH kho chung. Tài khoản khác bị từ chối trước bước ghi; GitHub tiếp tục kiểm tra quyền ở máy chủ.
4. Các thiết bị khác nhận bản mới khi mở ứng dụng/khi có mạng trở lại, hoặc bấm Kéo về. Không có thao tác tự đẩy dữ liệu của người nhận lên kho chung.

Xóa trong Kho đề tạo bản xóa mềm có thời gian cập nhật. Kéo về tiếp tục giữ bản có thời gian mới hơn, nên không tự hồi sinh đề đã xóa trên máy. Chỉ chủ kho đẩy lên mới đưa thay đổi hoặc bản xóa lên Gist chung.

## Kiểm tra

Các kiểm thử HTTP dùng máy chủ cục bộ để xác minh đọc không có Authorization, token hết hạn không ảnh hưởng đọc kho chung, chủ kho được ghi và tài khoản khác không tạo PATCH. Có kiểm thử giới hạn tự kéo, ngoại tuyến, đổi nguồn và Gist riêng.

Đã kiểm tra Pull thực tế không token qua backend với cơ sở dữ liệu tạm trong bộ nhớ; không sửa kho cục bộ đang dùng và không gửi thao tác ghi lên GitHub.
