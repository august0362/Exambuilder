const { createAutoPull } = require('../../frontend/autoPull');

function setup(overrides = {}) {
  const state = { enabled: true, online: true, busy: false, time: 1000, gistId: 'shared-gist' };
  const loadSettings = jest.fn(async () => ({ gist_id: state.gistId, has_token: false }));
  const pull = jest.fn(async () => true);
  const request = createAutoPull({ loadSettings, pull, isEnabled: () => state.enabled,
    isOnline: () => state.online, isBusy: () => state.busy, now: () => state.time, ...overrides });
  return { state, loadSettings, pull, request };
}

test('may moi tu Pull voi Gist mac dinh, khong doi token', async () => {
  const { request, pull } = setup();
  expect(await request()).toBe(true);
  expect(pull).toHaveBeenCalledTimes(1);
});

test('ngoai tuyen thi bo qua, co mang lai thi Pull', async () => {
  const { state, request, loadSettings, pull } = setup();
  state.online = false;
  expect(await request()).toBe(false);
  expect(loadSettings).not.toHaveBeenCalled();
  state.online = true;
  await request();
  expect(pull).toHaveBeenCalledTimes(1);
});

test('tat tu dong hoac dang dong bo thu cong thi khong Pull', async () => {
  const { state, request, pull } = setup();
  state.enabled = false;
  await request();
  state.enabled = true;
  state.busy = true;
  await request();
  expect(pull).not.toHaveBeenCalled();
});

test('cac su kien khoi dong/on-line khong tao nhieu request song song', async () => {
  let finish;
  const pull = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const { request } = setup({ pull });
  const first = request();
  await Promise.resolve();
  expect(await request()).toBe(false);
  finish(true);
  await first;
  expect(pull).toHaveBeenCalledTimes(1);
});

test('gioi han tan suat nhung doi Gist thi duoc Pull ngay', async () => {
  const { state, request, pull } = setup();
  await request();
  await request();
  expect(pull).toHaveBeenCalledTimes(1);
  state.time += 60000;
  await request();
  state.gistId = 'another-gist';
  await request();
  expect(pull).toHaveBeenCalledTimes(3);
});

test('Gist de trong de tao kho rieng thi khong tu Pull', async () => {
  const { state, request, pull } = setup();
  state.gistId = '';
  expect(await request()).toBe(false);
  expect(pull).not.toHaveBeenCalled();
});

test('nguoi dung bat lai tu keo thi bo qua cooldown nhung van can mang', async () => {
  const { state, request, pull } = setup();
  await request();
  await request({ force: true });
  expect(pull).toHaveBeenCalledTimes(2);
  state.online = false;
  expect(await request({ force: true })).toBe(false);
  expect(pull).toHaveBeenCalledTimes(2);
});

test('loi mang khong khoa cac lan dong bo sau', async () => {
  const pull = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(true);
  const { state, request } = setup({ pull });
  await expect(request()).rejects.toThrow('network');
  state.time += 60000;
  expect(await request()).toBe(true);
});
