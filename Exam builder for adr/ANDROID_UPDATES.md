# Phát hành cập nhật Android

Nguồn cập nhật là `august0362/Exambuilder`. Bản hiện tại: **1.4.0**, code **5**. App đọc latest **stable release**, tải file `android-update.json`, so sánh `versionCode` rồi mới hiện nút cập nhật. Tên tag không quyết định phiên bản Android; `versionCode` trong APK và JSON phải khớp.

Ngày 21/10/2026, kho và [release Android 1.2.0](https://github.com/august0362/Exambuilder/releases/tag/android-v1.2.0) đã công khai. Đã xác minh API latest, metadata và APK truy cập không cần đăng nhập; kích thước và SHA-256 APK tải về khớp thông tin phát hành. Tải APK tại [ExamBuilder.apk](https://github.com/august0362/Exambuilder/releases/download/android-v1.2.0/ExamBuilder.apk).

## Tạo gói phát hành

1. Tăng `versionCode` và đổi `versionName` trong `app/build.gradle.kts` cho mỗi bản mới. Bản hiện tại là code **5**, tên **1.4.0**. File `../resources/shared-library.json` phải có trong checkout để Gradle nhúng cấu hình nguồn kho đề chung.
2. Giữ nguyên `applicationId` và khóa ký release đang dùng. `keystore.properties` và `.jks` chỉ giữ trên máy, không tải lên GitHub.
3. Từ thư mục Android, chạy Gradle 8.14.3 với JDK đã cài:

   ```powershell
   gradle :app:testDebugUnitTest :app:lintRelease :app:prepareAndroidUpdate
   ```

   Có thể chạy task `app → prepareAndroidUpdate` trong Android Studio nếu Gradle chưa nằm trên PATH. Lệnh tạo hai file tại `app/build/outputs/apk/release/`:

   - `ExamBuilder.apk`: APK release đã ký.
   - `android-update.json`: phiên bản, Android tối thiểu, tên APK, SHA-256 được tạo từ chính APK đó.

## Đưa lên GitHub

1. Đảm bảo kho `august0362/Exambuilder` và Releases có thể đọc **không cần đăng nhập**. Nếu mã nguồn cần giữ riêng tư, dùng một kho công khai riêng chỉ chứa Releases và build với `-PupdateRepository=owner/public-updates-repo`. Các thiết bị đã cài bản cũ vẫn đọc nguồn được nhúng trong bản cũ nên cần duy trì nguồn đó hoặc cài thủ công bản chuyển nguồn.
2. Commit mã nguồn cần phát hành. Trên GitHub, tạo release (ví dụ tag `android-v1.3.0`) từ commit tương ứng.
3. Đính kèm **đúng hai file từ cùng lần build**, dùng tên gốc `ExamBuilder.apk` và `android-update.json`. Có thể dùng [RELEASE_NOTES_1.3.0.md](RELEASE_NOTES_1.3.0.md) làm mô tả.
4. Xuất bản stable release và đặt làm **latest**. Draft/prerelease không được ứng dụng nhận; release mới nhất cần chứa hai file Android trên, kể cả khi cùng kho phát hành cả web.
5. Kiểm tra `https://api.github.com/repos/august0362/Exambuilder/releases/latest` và các URL tải asset có thể mở không cần token. 404 có thể do kho riêng tư, sai địa chỉ hoặc chưa có release.

## Hành vi trên điện thoại

- Tự kiểm tra khi ứng dụng mở/trở lại và có mạng, hoặc có Internet trở lại trong lúc ứng dụng còn chạy. Không có dịch vụ kiểm tra nền khi ứng dụng đã đóng.
- Sau một lần kiểm tra thành công, chờ 6 giờ trước lần tự kiểm tra kế tiếp; sau lỗi chờ 5 phút. Có thể bấm **Kiểm tra cập nhật** bất kỳ lúc nào để bỏ qua thời gian chờ.
- Chỉ hiện thông báo cho `versionCode` lớn hơn. Không tự hạ phiên bản hoặc nhận bản chỉ đổi `versionName`.
- Bấm **Cập nhật** để tải; có tiến độ. Mất mạng hoặc file không khớp sẽ báo lỗi và cho thử lại. Tải lại bắt đầu từ đầu. Trong khi tải, giữ ứng dụng hoạt động; tiến trình có thể bị Android dừng nếu ứng dụng đóng.
- Sau khi tải, app kiểm tra kích thước, SHA-256, package, mã/tên phiên bản, Android tối thiểu và cùng tập chứng chỉ ký với bản đang cài. APK bị từ chối không được chuyển sang trình cài đặt.
- Bấm **Cài đặt bản mới**, cấp quyền cài đặt từ ExamBuilder nếu Android yêu cầu rồi xác nhận. Nếu từ chối, APK vẫn sẵn để cài lại. APK đã tải có thể được cài không cần Internet, trừ khi cache đã bị dọn.
- Bản 1.1.0 chưa có bộ cập nhật này: cần cài thủ công APK 1.2.0 một lần. Các lần sau dùng nút cập nhật.

## Kiểm thử phát hành

Kiểm thử tự động bao gồm bộ đọc metadata, thứ tự phiên bản, bản ổn định, giới hạn kích thước và URL nguồn. Trên thiết bị, kiểm tra: mở app ngoại tuyến; bật mạng; bấm kiểm tra; tải bản có code cao hơn; cấp/từ chối quyền cài; cài cập nhật và mở lại kho đề. Thử file có SHA sai hoặc khóa ký khác và xác nhận app từ chối trước khi cài.

Máy dùng bản 1.2.0 (code 3) hoặc 1.3.0 (code 4) có thể nhận bản 1.4.0 (code 5) qua nút cập nhật. Để kiểm thử lần tiếp theo từ bản 1.4.0 cần APK có code lớn hơn 5; xuất bản lại code 5 sẽ không hiện cập nhật trên máy đã cài code 5.
