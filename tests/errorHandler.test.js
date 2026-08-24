const { errorHandler } = require('../backend/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler (middleware loi toan cuc)', () => {
  let consoleErrorSpy;
  beforeEach(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleErrorSpy.mockRestore(); });

  test('TC-EH-01: loi body-parser (type=entity.parse.failed) tra ve 400 JSON dong nhat', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Unexpected token'), { type: 'entity.parse.failed' });

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Du lieu JSON gui len khong hop le' });
  });

  test('TC-EH-02: SyntaxError co thuoc tinh "body" (dac trung loi parse JSON) cung tra ve 400', () => {
    const res = mockRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), { body: '{ bad' });

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-EH-03 [Exception]: loi khong xac dinh (loi CSDL, loi runtime...) tra ve 500 JSON chung, khong lam sap server', () => {
    const res = mockRes();
    const err = new Error('SIMULATED_UNEXPECTED_FAILURE');

    expect(() => errorHandler(err, {}, res, jest.fn())).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Loi may chu noi bo' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(err);
  });
});
