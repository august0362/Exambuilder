// Loi rieng khi nguoi dung chu dong dung/huy (khong phai timeout hay loi mang),
// de route sinh de nhan ra va khong hien nhu loi API.
function userAbortError(label) {
  const err = new Error(`${label}: da dung theo yeu cau nguoi dung`);
  err.code = 'USER_ABORT';
  return err;
}

module.exports = { userAbortError };
