const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const {createRequire} = require('node:module');
const {PROJECT, SOURCE_DIR, TRANSCRIBE_SCRIPT} = require('../paths');
const {
  fail, readJson, projectDir, projectOutput, projectDownloadUrl,
  projectState, activeProjectId, saveUpdates,
} = require('../state');
const {startJob, pythonExecutable} = require('../jobs');
const {ffmpegEnv} = require('../binaries');

const requireProject = createRequire(path.join(PROJECT, 'package.json'));
const router = express.Router();

router.post('/render', (req, res) => {
  // saveUpdates kiểm tra projectId và revision trước khi ghi.
  const saved = saveUpdates(req.body);
  const projectId = req.body.projectId;
  const sourceFile = saved.project.sourceFile;

  if (typeof sourceFile !== 'string' ||
      !sourceFile ||
      path.basename(sourceFile) !== sourceFile) {
    throw fail('Tên video trong manifest không hợp lệ.');
  }

  const source = path.join(SOURCE_DIR, sourceFile);
  if (!fs.statSync(source, {throwIfNoEntry: false})?.isFile()) {
    throw fail('Không tìm thấy video nguồn trong data/source.', 404);
  }

  const cliPackage = requireProject.resolve('@remotion/cli/package.json');
  const cli = path.join(path.dirname(cliPackage), 'remotion-cli.js');
  const output = projectOutput(projectId);
  const outputDir = path.dirname(output);
  fs.mkdirSync(outputDir, {recursive: true});

  const suffix = crypto.randomUUID();
  const propsFile = path.join(outputDir, `.render-${suffix}.json`);
  const tempOutput = path.join(outputDir, `.render-${suffix}.mp4`);

  const {width, height, fps, durationInFrames} = saved.config;
  const PORT = Number(process.env.PORT || 3001);
  const props = {
    videoSrc: new URL(saved.mediaPath, `http://127.0.0.1:${PORT}`).href,
    scenes: saved.scenes,
    renderConfig: {width, height, fps, durationInFrames},
  };

  try {
    fs.writeFileSync(propsFile, JSON.stringify(props), 'utf8');
  } catch (error) {
    throw error;
  }

  const active = startJob(
    'render',
    process.execPath,
    [cli, 'render', 'MyComposition', tempOutput, '--codec=h264', `--props=${propsFile}`],
    (finishedJob) => {
      const file = fs.statSync(tempOutput, {throwIfNoEntry: false});
      if (!file?.isFile() || file.size === 0) {
        throw fail('Remotion chưa tạo được file MP4.', 500);
      }

      fs.renameSync(tempOutput, output);
      finishedJob.output = output;
      finishedJob.downloadUrl = projectDownloadUrl(projectId);
    },
    [propsFile, tempOutput]
  );

  active.projectId = projectId;
  res.status(202).json({...saved, job: active});
});

// Hai endpoint dùng chung một luồng bóc băng.
router.post(['/transcribe', '/sync'], (req, res) => {
  const id = activeProjectId();
  if (!id) throw fail('Hãy chọn và mở một dự án trước.', 400);

  // Tránh tab cũ yêu cầu xử lý nhầm dự án vừa được tab khác mở.
  if (req.body?.projectId !== id) {
    throw fail('Dự án đang mở đã thay đổi. Hãy tải lại Dashboard.', 409);
  }

  const current = projectState(id);
  if (req.body?.revision !== current.revision) {
    throw fail('Kịch bản đã thay đổi. Hãy tải lại trước khi bóc băng.', 409);
  }

  const file = current.project.sourceFile;
  if (typeof file !== 'string' || !file || path.basename(file) !== file) {
    throw fail('Tên video trong manifest không hợp lệ.');
  }

  const video = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(video) || !fs.statSync(video).isFile()) {
    throw fail('Không tìm thấy video nguồn trong data/source.', 404);
  }

  if (!fs.existsSync(TRANSCRIBE_SCRIPT)) {
    throw fail('Không tìm thấy scripts/boc_bang.py.', 500);
  }

  const ffmpeg = ffmpegEnv();
  if (!ffmpeg) throw fail('Không tìm thấy ffmpeg (hệ thống hoặc bản Remotion bundle)', 500);

  const active = startJob(
    'transcribe',
    pythonExecutable(),
    ['-u', TRANSCRIBE_SCRIPT, video, projectDir(id)],
    () => {
      const transcript = readJson(
        path.join(projectDir(id), 'transcript.json')
      );
      const updated = projectState(id);

      if (!Array.isArray(transcript.segments) || !updated.scenes.length) {
        throw fail('Python kết thúc nhưng dữ liệu kết quả chưa hợp lệ.', 500);
      }
    },
    [],
    ffmpeg
  );

  active.projectId = id;
  res.status(202).json({projectId: id, job: active});
});

module.exports = router;
