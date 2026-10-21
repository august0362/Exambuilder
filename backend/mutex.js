/**
 * Tao 1 hang doi doc lap. Moi hang doi chi chay 1 ham tai 1 thoi diem, theo
 * dung thu tu goi, va tiep tuc du ham truoc thanh cong hay that bai.
 */
function createLock() {
  let queue = Promise.resolve();
  return function lock(fn) {
    const result = queue.then(() => fn());
    queue = result.then(() => {}, () => {});
    return result;
  };
}

/**
 * Xep hang cac ham bat dong bo de chi 1 ham chay tai 1 thoi diem, theo dung
 * thu tu goi. Can thiet vi ung dung dung 1 ket noi SQLite dung chung cho
 * moi request (xem backend/database.js) - neu 2 request cung goi
 * `BEGIN TRANSACTION` xen ke nhau tren cung 1 ket noi, SQLite se nem loi
 * "cannot start a transaction within a transaction" ngay lap tuc.
 */
const withLock = createLock();

module.exports = { withLock, createLock };
