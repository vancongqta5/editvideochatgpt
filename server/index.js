const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {PROJECT, SOURCE_DIR, PUBLIC_DIR} = require('./src/paths');
const {fail, readJson, projectDir, projectOutput, state} = require('./src/state');
const {isBusy, currentJob} = require('./src/jobs');

const PORT = Number(process.env.PORT || 3001);
const app = express();

app.use(express.json({limit: '4mb'}));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Local API: reject browser requests from other origins, including file://.
  if (![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host)) {
    return res.status(403).json({error: 'Host không hợp lệ'});
  }
  const origin = req.headers.origin;
  if (origin && ![`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`].includes(origin)) {
    return res.status(403).json({error: 'Origin không hợp lệ'});
  }
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({error: 'Cần Content-Type: application/json'});
  }
  if (isBusy() && req.method !== 'GET') {
    return res.status(409).json({error: 'Server đang xử lý. Vui lòng chờ.'});
  }
  next();
});

app.use('/api', require('./src/routes/projects'));
app.use('/api', require('./src/routes/tasks'));

app.get('/download/projects/:id/video.mp4', (req, res, next) => {
  const output = projectOutput(req.params.id);
  if (!fs.statSync(output, {throwIfNoEntry: false})?.isFile()) {
    return res.status(404).send('Dự án này chưa có video xuất.');
  }

  res.set('Cache-Control', 'no-store');
  res.download(output, 'video.mp4', (error) => {
    if (error) next(error);
  });
});

app.use('/api', (req, res) => res.status(404).json({error: 'API không tồn tại'}));

// Chỉ cho Studio local đọc dữ liệu và video qua trình duyệt.
app.use(['/studio-state', '/media/projects'], (req, res, next) => {
  const allowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  res.vary('Origin');
  if (allowed.includes(req.headers.origin)) {
    res.set('Access-Control-Allow-Origin', req.headers.origin);
  }
  next();
});

app.get('/studio-state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(state(currentJob()));
});

app.get('/media/projects/:id', (req, res, next) => {
  const manifestPath = path.join(projectDir(req.params.id), 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw fail('Không tìm thấy dự án', 404);

  const {sourceFile} = readJson(manifestPath);
  if (typeof sourceFile !== 'string' || path.basename(sourceFile) !== sourceFile) {
    throw fail('Tên nguồn không hợp lệ');
  }

  res.sendFile(sourceFile, {root: SOURCE_DIR, dotfiles: 'deny'}, error => {
    if (error) next(error);
  });
});

app.use('/media', express.static(path.join(PROJECT, 'public')));
app.use(express.static(PUBLIC_DIR, {
  etag: false, setHeaders: (res) => res.set('Cache-Control', 'no-store'),
}));

app.use((error, req, res, next) => {
  console.error(error);
  if (!res.headersSent) res.status(error.status || 500).json({error: error.message});
});

function main() {
  state(null);
  app.listen(PORT, '127.0.0.1', () => console.log(`Dashboard Studio: http://127.0.0.1:${PORT}`))
    .on('error', (error) => {console.error(error.message); process.exitCode = 1;});
}
if (require.main === module) {
  try {main();} catch (error) {console.error(error); process.exitCode = 1;}
}
