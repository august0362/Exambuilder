const path = require('path');
const express = require('express');
const examRoutes = require('./routes/examRoutes');
const backgroundRoutes = require('./routes/backgroundRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const modelRoutes = require('./routes/modelRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const generateRoutes = require('./routes/generateRoutes');
const archiveRoutes = require('./routes/archiveRoutes');
const syncRoutes = require('./routes/syncRoutes');
const templateRoutes = require('./routes/templateRoutes');
const templatePromptRoutes = require('./routes/templatePromptRoutes');
const { errorHandler } = require('./errorHandler');
const { lanAddresses } = require('./network');
const { closeDb } = require('./database');
const autoPush = require('./sync/autoPush');
const { createShutdown } = require('./shutdown');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/parser', express.static(path.join(__dirname, 'parser')));
app.use('/vendor/docx', express.static(path.join(__dirname, '..', 'node_modules', 'docx', 'dist')));
app.use('/vendor/mammoth', express.static(path.join(__dirname, '..', 'node_modules', 'mammoth')));
app.use('/vendor/katex', express.static(path.join(__dirname, '..', 'node_modules', 'katex', 'dist')));
// Cung thu muc voi backgroundRoutes de anh vua upload mo duoc khi doi EXAM_BACKGROUNDS_DIR.
app.use('/backgrounds', express.static(process.env.EXAM_BACKGROUNDS_DIR || path.join(__dirname, '..', 'resources', 'backgrounds')));

app.use('/api/exams', examRoutes);
app.use('/api/backgrounds', backgroundRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/template-prompts', templatePromptRoutes);
app.use('/api/template-export', require('./routes/templateExportRoutes'));
// IP LAN de tao link chia se mo duoc tu may khac cung mang (xem frontend generateShareLink).
app.get('/api/network-info', (req, res) => {
  res.json({ success: true, port: Number(PORT), addresses: lanAddresses() });
});
app.use(errorHandler);

// Express 4 khong bat loi cua handler async: mot route quen try/catch se lam
// Node thoat va ca app tat. Ghi log va giu server chay (app noi bo, mot nguoi dung).
process.on('unhandledRejection', err => {
  console.error('[ExamBuilder] Loi chua xu ly (server van chay):', err);
});

const server = app.listen(PORT, () => {
  autoPush.start();
  console.log(`Server running at http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`May khac cung mang LAN/Wi-Fi mo: http://${ip}:${PORT}`);
});
const shutdown = createShutdown({ server, autoPush, closeDb });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => shutdown(signal).catch(err => {
    console.error('[ExamBuilder] Loi khi dong ung dung:', err.message);
    process.exit(1);
  }));
}
process.on('message', message => {
  if (message === 'shutdown') shutdown().catch(() => process.exit(1));
});
