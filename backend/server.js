const path = require('path');
const express = require('express');
const examRoutes = require('./routes/examRoutes');
const backgroundRoutes = require('./routes/backgroundRoutes');
const { errorHandler } = require('./errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/parser', express.static(path.join(__dirname, 'parser')));
app.use('/vendor/docx', express.static(path.join(__dirname, '..', 'node_modules', 'docx', 'dist')));
app.use('/vendor/mammoth', express.static(path.join(__dirname, '..', 'node_modules', 'mammoth')));
app.use('/backgrounds', express.static(path.join(__dirname, '..', 'resources', 'backgrounds')));

app.use('/api/exams', examRoutes);
app.use('/api/backgrounds', backgroundRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
