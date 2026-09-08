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
const { errorHandler } = require('./errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/parser', express.static(path.join(__dirname, 'parser')));
app.use('/vendor/docx', express.static(path.join(__dirname, '..', 'node_modules', 'docx', 'dist')));
app.use('/vendor/mammoth', express.static(path.join(__dirname, '..', 'node_modules', 'mammoth')));
app.use('/vendor/katex', express.static(path.join(__dirname, '..', 'node_modules', 'katex', 'dist')));
app.use('/backgrounds', express.static(path.join(__dirname, '..', 'resources', 'backgrounds')));

app.use('/api/exams', examRoutes);
app.use('/api/backgrounds', backgroundRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/sync', syncRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
