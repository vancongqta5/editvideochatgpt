const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {SOURCE_DIR, ACTIVE_PROJECT_FILE} = require('../paths');
const {ffprobe} = require('../binaries');
const {
  fail, readJson, projectDir, projectState, state, saveUpdates, activeProjectId,
} = require('../state');
const {currentJob} = require('../jobs');

const execFileAsync = promisify(execFile);
const router = express.Router();

router.get('/active-project', (req, res) => {
  res.json({id: activeProjectId()});
});

router.post('/active-project', (req, res) => {
  const data = projectState(req.body?.id);
  const sourceFile = data.project.sourceFile;

  if (
    typeof sourceFile !== 'string' ||
    path.basename(sourceFile) !== sourceFile ||
    !fs.existsSync(path.join(SOURCE_DIR, sourceFile))
  ) {
    throw fail('Không tìm thấy video nguồn trong data/source', 404);
  }

  const temp = `${ACTIVE_PROJECT_FILE}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify({id: data.project.id}), 'utf8');
    fs.renameSync(temp, ACTIVE_PROJECT_FILE);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }

  res.json(state(currentJob()));
});

router.get('/state', (req, res) => res.json(state(currentJob())));
router.get('/scenes', (req, res) => {res.json({scenes: state(currentJob()).scenes});});
router.get('/job', (req, res) => res.json({job: currentJob()}));
router.post('/save', (req, res) => res.json(saveUpdates(req.body)));

router.get('/sources', (req, res) => {
  const files = fs.readdirSync(SOURCE_DIR, {withFileTypes: true})
    .filter((item) => item.isFile())
    .filter((item) => /\.(mp4|mov|mkv|webm)$/i.test(item.name))
    .map((item) => ({name: item.name}));

  res.json({files});
});

router.post('/projects', async (req, res, next) => {
  let dir;
  try {
    const file = req.body?.file;
    const available = fs.readdirSync(SOURCE_DIR, {withFileTypes: true});
    if (typeof file !== 'string' || !available.some(
      item => item.isFile() && item.name === file
    )) throw fail('Video nguồn không tồn tại', 404);

    const probe = ffprobe();
    if (!probe) throw fail('Không tìm thấy ffprobe (hệ thống hoặc bản Remotion bundle)', 500);

    const source = path.join(SOURCE_DIR, file);
    const {stdout} = await execFileAsync(probe.executable, [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json', source
    ], {windowsHide: true, timeout: 15000, cwd: probe.cwd});

    const metadata = JSON.parse(stdout);
    const seconds = Number(metadata.format?.duration);
    if (!metadata.streams?.some(s => s.codec_type === 'video') ||
        !Number.isFinite(seconds) || seconds <= 0) {
      throw fail('Không đọc được video hoặc thời lượng');
    }

    const id = crypto.randomUUID();
    dir = projectDir(id);
    fs.mkdirSync(dir);
    const files = {
      'manifest.json': {id, sourceFile: file, createdAt: new Date().toISOString()},
      'transcript.json': {segments: []},
      'scenes.json': {scenes: []},
      'config.json': {
        width: 1080, height: 1920, fps: 30,
        durationInFrames: Math.ceil(seconds * 30)
      }
    };
    for (const [name, data] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
    }
    res.status(201).json({id, sourceFile: file});
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:id', (req, res) => {
  const dir = projectDir(req.params.id);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Không tìm thấy dự án');

  const manifest = readJson(manifestPath);
  res.json({
    project: manifest,
    scenes: readJson(path.join(dir, 'scenes.json')).scenes,
    config: readJson(path.join(dir, 'config.json')),
    mediaPath: `/media/projects/${req.params.id}`
  });
});

module.exports = router;
