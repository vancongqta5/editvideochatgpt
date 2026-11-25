# Handoff — Cấu trúc lại monorepo + sửa lỗi nền tảng

## 1. Logic

Dự án được dẹp phẳng từ `skill1/03_PROJECT/{server-api,remotion-engine,web-dashboard,python-scripts}` về root: `server/` (API + dashboard), `engine/` (Remotion), `scripts/boc_bang.py`, `data/{source,projects,final}`. Hành vi người dùng không đổi: chọn video trong `data/source` → tạo/mở project → bóc băng whisper → sửa phụ đề trong dashboard nói chuyện với Studio qua postMessage → xuất MP4 vào `data/final/<uuid>/video.mp4`.

Ba thay đổi hành vi có chủ đích:

- **Python**: transcribe trước đây spawn `py` (chỉ Windows). Giờ `pythonExecutable()` ưu tiên `.venv-whisper` của project, fallback `python3`/`python` theo PATH, override bằng `PYTHON_EXE`.
- **ffmpeg/ffprobe**: ưu tiên bản hệ thống trong PATH; thiếu thì fallback bản bundle của `@remotion/compositor-<platform>-<arch>` (đủ cho ffprobe tạo project + render; bóc băng vẫn cần ffmpeg đầy đủ vì bundle thiếu muxer `s16le`).
- **Dashboard**: JS inline 410 dòng trong `index.html` tách ra `public/app.js`, load bằng `<script src>` — logic y nguyên.

## 2. Implementation

- `server/index.js` — entry duy nhất: express app, middleware `/api` (host/origin/content-type/busy guard), mount `routes/projects` + `routes/tasks`, endpoints `/download`, `/studio-state`, `/media`, static `server/public`, error handler cuối.
- `server/src/paths.js` — mọi đường dẫn: ROOT = repo root, PROJECT = `engine` (override `VIDEO_PROJECT`), DATA_DIR, SOURCE_DIR, PROJECTS_DIR, FINAL_DIR, ACTIVE_PROJECT_FILE, PUBLIC_DIR, TRANSCRIBE_SCRIPT. **Đây là holder duy nhất của layout.**
- `server/src/state.js` — holder của dữ liệu project: `readScenes`/`readConfig` validate, `projectState`/`state` đọc, `saveUpdates` ghi (check projectId + revision hash, validate patch, ghi temp+rename atomic).
- `server/src/jobs.js` — holder của `busy`/`job` toàn cục: `startJob` spawn, gom log 6000 ký tự cuối, `finish` idempotent; `pythonExecutable` như trên.
- `server/src/binaries.js` — `ffprobe()`/`ffmpegEnv()`: probe PATH trước, fallback compositor bundle kèm `DYLD_FALLBACK_LIBRARY_PATH` (macOS) và PATH prepend.
- `server/src/routes/projects.js` — state/scenes/job/save/sources/projects CRUD/active-project.
- `server/src/routes/tasks.js` — `/render` (saveUpdates → ghi props file → spawn remotion CLI render → rename temp mp4) và `/transcribe` (spawn python boc_bang với env ffmpeg).
- `engine/` — nguyên vẹn từ `remotion-engine`, chỉ xóa `dashboard/` (experiment player-react chết) và rút gọn deps (`@remotion/player`, esbuild, cors, express bỏ vì không ai dùng); `src/scenes.json` rỗng vì runtime luôn lấy scenes từ `/studio-state`.
- `package.json` root — npm workspaces [server, engine]; scripts `server`/`studio`. `node_modules` duy nhất ở root.
- `.bat` cập nhật đường dẫn mới; `.gitignore` ignore `data/` runtime, `.venv-whisper/`, `.openidea/`, `.omp/`.
- Xóa: `web-dashboard/` (package trống + bundle 648KB không ai load), `sync_to_remotion.py`/`build_scenes.py` (dead, hardcode đường dẫn cũ), tài liệu v2 sai cấu trúc.

## 3. Decisions

- **Workspaces thay vì 3 npm install riêng**: user chọn mức 3 (monorepo đầy đủ) khi được hỏi. Hoisting vào root `node_modules` làm `requireProject.resolve('@remotion/cli')` vẫn đúng vì createRequire đi từ `engine/package.json`.
- **Dashboard không dùng framework/bundler**: app.js vanilla load trực tiếp — bundle react 648KB trước đây là experiment bỏ dở, iframe Studio là preview thật. Xóa hẳn thay vì giữ "phòng khi".
- **Binary resolution ở server thay vì yêu cầu brew**: máy user ban đầu không có ffmpeg; bản bundle Remotion đủ cho hầu hết việc trừ whisper extract (thiếu muxer s16le — vì vậy vẫn khuyến nghị brew ffmpeg).
- **`data/` thay `01_SOURCE/05_FINAL/00_SHARED_WORKSPACE`**: tên thư mục nói đúng việc, mọi đường dẫn tập trung ở paths.js nên đổi layout chỉ sửa một file.
- Giữ `VIDEO_PROJECT`/`PORT`/`PYTHON_EXE` env overrides vì là contract cũ.
- Không split `Composition.tsx`/`app.js` thêm — refactor mức 3 dừng ở server; frontend giữ nguyên logic.

## 4. Debug without AI

- **Reproduce boot**: `npm run server` (phải thấy `Dashboard Studio: http://127.0.0.1:3001`) và `npm run studio` (cổng 3000). Kiểm nhanh: `curl localhost:3001/api/state` phải có `scenes` + `config`; `curl -o /dev/null -w '%{http_code}' localhost:3000/MyComposition` phải 200.
- **Đường dẫn sai** (thiếu data/source, không thấy video): mở `server/src/paths.js` — in `SOURCE_DIR`; ls thư mục đó. Mọi "không tìm thấy X" đều quy về file này.
- **Transcribe fail ngay khi start**: đọc `job.log` qua `curl localhost:3001/api/job`. `spawn ENOENT` → python không resolve được, xem `pythonExecutable()` trong `server/src/jobs.js` — check `.venv-whisper/bin/python` tồn tại không và có whisper chưa (`.venv-whisper/bin/python -c "import whisper"`). `Requested output format 's16le' is not known` → đang dùng ffmpeg bundle tối giản, cần ffmpeg đầy đủ (brew) — resolution logic ở `server/src/binaries.js`.
- **Render fail**: log job có output remotion CLI. Props file `.render-*.json` trong `data/final/<id>/` cho thấy chính xác scenes/config gửi vào engine.
- **Bridge "Chưa nối"**: ORIGINS hardcode 3001 ở `engine/src/Composition.tsx:21` và API hardcode ở `Root.tsx:9` — nếu đổi PORT thì đây là chỗ chết.
- **Verify sau sửa**: chu trình đã dùng — tạo project từ video trong data/source, sửa text cảnh, Lưu (check file `data/projects/<id>/scenes.json` đổi), Xuất MP4 (check `data/final/<id>/video.mp4` tồn tại và duration khớp).
- **Rollback**: toàn bộ layout cũ nằm ở commit trước (`git revert` commit này); không có migration dữ liệu một chiều — project folders chỉ được move, không biến đổi format.

## 5. Risks and open items

- **Bug đã biết, chưa sửa** (danh sách đầy đủ từ đợt soi 10 agent): host guard chỉ che `/api` (DNS-rebinding có thể đọc video qua `/media`, `/studio-state`); server không boot nổi nếu project active bị xóa tay (`state()` throw trong `main()`); PORT env chỉ đổi nửa hệ thống; SNAPSHOT postMessage O(N²) khi nhiều cảnh; job không timeout — treo là busy vĩnh viễn; `beforeunload` hỏi giả khi render.
- Chưa test trên Windows: `.bat` cập nhật theo layout mới nhưng chưa chạy thật; `DYLD_FALLBACK_LIBRARY_PATH` là macOS-only (Linux dùng rpath của bundle sẵn, Windows không cần).
- Render/transcribe end-to-end chỉ verify trên macOS arm64 với video 30s.
- `.agents/skills` (300+ file tài liệu remotion) đi theo engine — không phải runtime, có thể cân nhắc ignore sau.

## 6. Q&A

(chờ câu trả lời của user)
