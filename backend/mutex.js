let queue = Promise.resolve();

/**
 * Xep hang cac ham bat dong bo de chi 1 ham chay tai 1 thoi diem, theo dung
 * thu tu goi. Can thiet vi ung dung dung 1 ket noi SQLite dung chung cho
 * moi request (xem backend/database.js) - neu 2 request cung goi
 * `BEGIN TRANSACTION` xen ke nhau tren cung 1 ket noi, SQLite se nem loi
 * "cannot start a transaction within a transaction" ngay lap tuc.
 */
function withLock(fn) {
  const result = queue.then(() => fn());
  queue = result.then(() => {}, () => {}); // hang doi tiep tuc du fn() thanh cong hay that bai
  return result;
}

module.exports = { withLock };
