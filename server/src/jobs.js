const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {PROJECT, ROOT} = require('./paths');

let busy = false;
let job = null;

function removeRenderTemps(files) {
  for (const file of files) {
    try {
      fs.rmSync(file, {force: true});
    } catch (error) {
      console.warn(`Không dọn được file tạm ${path.basename(file)}: ${error.message}`);
    }
  }
}

function startJob(kind, executable, args, onSuccess, temporaryFiles = [], env = {}) {
  busy = true;
  job = {id: crypto.randomUUID(), kind, status: 'running', startedAt: Date.now(), log: ''};
  const active = job;
  let completed = false;
  function finish(error) {
    if (completed) return;
    completed = true;
    if (!error) {
      try {
        onSuccess?.(active);
      } catch (cause) {
        error = cause;
      }
    }

    removeRenderTemps(temporaryFiles);
    active.status = error ? 'error' : 'done';
    active.error = error ? error.message : null;
    active.finishedAt = Date.now();
    busy = false;
  }
  try {
    const child = spawn(executable, args, {cwd: PROJECT, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, ...env}});
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const log = (chunk) => {active.log = (active.log + chunk.toString()).slice(-6000);};
    child.stdout.on('data', log);
    child.stderr.on('data', log);
    child.on('error', finish);
    child.on('close', (code) => finish(code === 0 ? null : new Error(`Tác vụ kết thúc với mã ${code}. Xem log.`)));
  } catch (error) {finish(error);}
  return active;
}

function pythonExecutable() {
  if (process.env.PYTHON_EXE) return process.env.PYTHON_EXE;

  // Venv của project (cài whisper) được ưu tiên trước python hệ thống.
  const venvPython = process.platform === 'win32'
    ? path.join(ROOT, '.venv-whisper', 'Scripts', 'python.exe')
    : path.join(ROOT, '.venv-whisper', 'bin', 'python');
  if (fs.existsSync(venvPython)) return venvPython;

  const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {stdio: 'ignore'});
    if (!probe.error) return candidate;
  }
  return candidates[0];
}

module.exports = {
  startJob,
  pythonExecutable,
  isBusy: () => busy,
  currentJob: () => job,
};
