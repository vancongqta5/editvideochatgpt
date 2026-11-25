const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createRequire} = require('node:module');
const {PROJECT} = require('./paths');

// ffprobe/ffmpeg của hệ thống được ưu tiên. Khi thiếu, dùng bản Remotion bundle
// trong @remotion/compositor-<platform>-<arch>. Binary bundle cần cwd là thư mục
// chứa nó vì dylib liền kề không nằm trong đường dẫn tìm kiếm của dyld.

function systemBinary(name) {
  const probe = spawnSync(name, ['-version'], {stdio: 'ignore'});
  return probe.error ? null : name;
}

function compositorDir() {
  const name = `@remotion/compositor-${process.platform}-${process.arch}`;
  const requireProject = createRequire(path.join(PROJECT, 'package.json'));
  try {
    return path.dirname(requireProject.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function resolveBinary(name) {
  if (systemBinary(name)) return {executable: name, cwd: undefined};

  const dir = compositorDir();
  if (dir) {
    const binary = path.join(dir, name);
    if (fs.existsSync(binary)) return {executable: binary, cwd: dir};
  }
  return null;
}

function ffprobe() {
  return resolveBinary('ffprobe');
}

// Biến môi trường cho process con cần ffmpeg trong PATH (whisper):
// null khi không có ffmpeg nào; {} khi ffmpeg hệ thống đã đủ;
// PATH + dyld trỏ tới thư mục compositor khi dùng bản bundle.
function ffmpegEnv() {
  const resolved = resolveBinary('ffmpeg');
  if (!resolved) return null;
  if (!resolved.cwd) return {};

  const env = {
    PATH: `${resolved.cwd}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  if (process.platform === 'darwin') {
    const existing = process.env.DYLD_FALLBACK_LIBRARY_PATH;
    env.DYLD_FALLBACK_LIBRARY_PATH = existing
      ? `${resolved.cwd}${path.delimiter}${existing}`
      : resolved.cwd;
  }
  return env;
}

module.exports = {ffprobe, ffmpegEnv};
