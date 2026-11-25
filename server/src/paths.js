const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const PROJECT = process.env.VIDEO_PROJECT || path.join(ROOT, 'engine');
const DATA_DIR = path.join(ROOT, 'data');
const SOURCE_DIR = path.join(DATA_DIR, 'source');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const FINAL_DIR = path.join(DATA_DIR, 'final');
const ACTIVE_PROJECT_FILE = path.join(DATA_DIR, 'active-project.json');
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
const TRANSCRIBE_SCRIPT = path.join(ROOT, 'scripts', 'boc_bang.py');

module.exports = {
  ROOT,
  PROJECT,
  DATA_DIR,
  SOURCE_DIR,
  PROJECTS_DIR,
  FINAL_DIR,
  ACTIVE_PROJECT_FILE,
  PUBLIC_DIR,
  TRANSCRIBE_SCRIPT,
};
