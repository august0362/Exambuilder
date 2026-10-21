/**
 * Middleware xu ly loi toan cuc: dam bao moi loi (ke ca loi parse JSON body
 * cua express.json() truoc khi vao duoc route handler) deu tra ve cung 1
 * dinh dang JSON { success:false, error } thay vi trang loi HTML mac dinh
 * cua Express.
 */
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ success: false, error: 'Du lieu gui len qua lon' });
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ success: false, error: 'Du lieu JSON gui len khong hop le' });
  }
  console.error(err);
  res.status(500).json({ success: false, error: 'Loi may chu noi bo' });
}

module.exports = { errorHandler };
