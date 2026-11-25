const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  SOURCE_DIR, PROJECTS_DIR, FINAL_DIR, ACTIVE_PROJECT_FILE,
} = require('./paths');

const fail = (message, status = 400) =>
  Object.assign(new Error(message), {status});

const DEFAULT_CONFIG = {width: 1080, height: 1920, fps: 30, durationInFrames: 1};

fs.mkdirSync(SOURCE_DIR, {recursive: true});
fs.mkdirSync(PROJECTS_DIR, {recursive: true});

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function projectDir(id) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) {
    throw new Error('projectId không hợp lệ');
  }
  return path.join(PROJECTS_DIR, id);
}
function projectOutput(id) {
  projectDir(id); // Dùng lại kiểm tra ID hiện có.
  return path.join(FINAL_DIR, id, 'video.mp4');
}
function projectDownloadUrl(id) {
  return `/download/projects/${encodeURIComponent(id)}/video.mp4`;
}

function readScenes(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const scenes = Array.isArray(data) ? data : data.scenes;
  if (!Array.isArray(scenes)) throw fail('scenes.json phải là [...] hoặc {scenes: [...]}');
  const ids = new Set();
  for (const scene of scenes) {
    if (!scene || !['string', 'number'].includes(typeof scene.id) || ids.has(String(scene.id)) ||
      typeof scene.text !== 'string' || !Number.isFinite(scene.start) || !Number.isFinite(scene.end) ||
      scene.start < 0 || scene.end <= scene.start) throw fail('Cảnh sai dữ liệu hoặc trùng ID');
    ids.add(String(scene.id));
  }
  return {data, scenes, revision: hash(raw)};
}
function readConfig(file) {
  const config = readJson(file);
  for (const key of ['width', 'height', 'durationInFrames']) {
    if (!Number.isInteger(config[key]) || config[key] < 1) throw fail(`config: ${key} không hợp lệ`);
  }
  if (!Number.isFinite(config.fps) || config.fps <= 0) throw fail('fps không hợp lệ');
  return config;
}

function activeProjectId() {
  if (!fs.existsSync(ACTIVE_PROJECT_FILE)) return null;
  const {id} = readJson(ACTIVE_PROJECT_FILE);
  projectDir(id); // Kiểm tra ID trước khi sử dụng.
  return id;
}

function projectState(id, job) {
  const dir = projectDir(id);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw fail('Không tìm thấy dự án', 404);
  }

  const raw = fs.readFileSync(path.join(dir, 'scenes.json'), 'utf8');
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const scenes = Array.isArray(data) ? data : data.scenes;
  if (!Array.isArray(scenes)) throw fail('Dữ liệu cảnh không hợp lệ');

  return {
    project: readJson(manifestPath),
    scenes,
    revision: hash(raw),
    config: readJson(path.join(dir, 'config.json')),
    mediaPath: `/media/projects/${id}`,
    downloadUrl: fs.existsSync(projectOutput(id)) ? projectDownloadUrl(id) : null,
    job,
  };
}

function state(job) {
  const id = activeProjectId();
  if (id) return projectState(id, job);

  return {
    project: null,
    scenes: [],
    revision: '',
    config: DEFAULT_CONFIG,
    mediaPath: null,
    job,
  };
}

const ranges = {
  fontSize: [16, 160], positionX: [0, 100], maxWidth: [20, 100],
  backgroundOpacity: [0, 1], strokeWidth: [0, 8],
};
const enums = {
  fontFamily: ['Arial', 'Tahoma', 'Verdana', 'Georgia', 'Times New Roman'],
  effect: ['none', 'fade', 'pop', 'slide'], fontWeight: [400, 700, 900],
};
function cleanPatch(update, config) {
  if (!update || !['string', 'number'].includes(typeof update.id)) throw fail('Thiếu ID cảnh');
  const patch = {};
  const limits = {...ranges, positionY: [0, config.height - 40]};
  for (const [key, value] of Object.entries(update)) {
    if (key === 'id') continue;
    if (key === 'text') {
      if (typeof value !== 'string' || value.length > 10000) throw fail('Lời thoại quá dài hoặc sai kiểu');
    } else if (limits[key]) {
      const [min, max] = limits[key];
      if (!Number.isFinite(value) || value < min || value > max) throw fail(`${key}: cần từ ${min} đến ${max}`);
    } else if (enums[key]) {
      if (!enums[key].includes(value)) throw fail(`${key} không hợp lệ`);
    } else if (['color', 'backgroundColor', 'strokeColor'].includes(key)) {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw fail(`${key}: dùng mã #RRGGBB`);
    } else throw fail(`Không cho phép sửa trường ${key}`);
    patch[key] = value;
  }
  return patch;
}

function saveUpdates(body) {
  const projectId = activeProjectId();
  if (!projectId || body?.projectId !== projectId) {
    throw fail('Dự án đang mở đã thay đổi. Hãy tải lại Dashboard.', 409);
  }

  const dir = projectDir(projectId);
  const scenesFile = path.join(dir, 'scenes.json');
  const current = readScenes(scenesFile);

  if (body.revision !== current.revision) {
    throw fail(
      'Phụ đề đã thay đổi ở tab khác. Sao chép phần đang sửa rồi bấm Tải lại.',
      409
    );
  }

  if (!Array.isArray(body.updates)) {
    throw fail('updates phải là mảng');
  }

  const config = readConfig(path.join(dir, 'config.json'));
  const scenesById = new Map(current.scenes.map(scene => [String(scene.id), scene]));
  const seen = new Set();

  for (const update of body.updates) {
    const patch = cleanPatch(update, config);
    const id = String(update.id);

    if (seen.has(id)) throw fail(`Trùng cập nhật ${id}`);
    seen.add(id);

    const scene = scenesById.get(id);
    if (!scene) throw fail(`Không tìm thấy cảnh ${id}`, 404);
    Object.assign(scene, patch);
  }

  if (body.updates.length > 0) {
    const temp = `${scenesFile}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(current.data, null, 2) + '\n', 'utf8');
      fs.renameSync(temp, scenesFile);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  return projectState(projectId);
}

module.exports = {
  fail,
  readJson,
  readScenes,
  readConfig,
  projectDir,
  projectOutput,
  projectDownloadUrl,
  activeProjectId,
  projectState,
  state,
  saveUpdates,
};
