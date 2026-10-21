// An explicit stop lets Node finish its final Push before closing the console.
const { fork, spawn } = require('node:child_process');
const path = require('node:path');
const server = fork(path.join(__dirname, '..', 'backend', 'server.js'), [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log('[ExamBuilder] Dang luu va day kho de. Vui long doi...');
  if (server.connected) server.send('shutdown');
}
const openTimer = setTimeout(() => {
  spawn('cmd.exe', ['/c', 'start', '', `http://localhost:${process.env.PORT || 3000}`],
    { stdio: 'ignore', windowsHide: true }).on('error', err => console.error(err.message));
}, 2000);
console.log('[ExamBuilder] Nhan Enter de luu va tat ung dung.');
process.stdin.resume();
process.stdin.on('data', stop);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
server.on('error', err => { console.error(err.message); process.exit(1); });
server.on('exit', code => {
  clearTimeout(openTimer);
  process.stdin.pause();
  process.exit(code || 0);
});
