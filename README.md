# editvideochatgpt

Dashboard chỉnh phụ đề video: chọn video nguồn, bóc băng bằng Whisper, sửa lời thoại và định dạng từng cảnh ngay trong preview Remotion Studio, rồi xuất MP4 có phụ đề cháy sẵn.

## Cấu trúc thư mục

```
server/               API Express + dashboard tĩnh (cổng 3001)
  index.js            Entry: tạo app, mount routes, static, error handler
  src/paths.js        Mọi đường dẫn của hệ thống ở một chỗ
  src/state.js        Đọc/ghi/validate scenes.json, config, manifest theo dự án
  src/jobs.js         Chạy job render/transcribe (spawn, log, busy)
  src/binaries.js     Resolve ffmpeg/ffprobe: hệ thống trước, bundle Remotion sau
  src/routes/         projects.js (project + lưu cảnh) · tasks.js (render + bóc băng)
  public/             Dashboard: index.html + app.js + dashboard.css
engine/               Dự án Remotion: Composition, Studio preview (cổng 3000)
scripts/boc_bang.py   Whisper → transcript.json + scenes.json (backup trước khi ghi đè)
data/
  source/             Thả video nguồn (.mp4/.mov/.mkv/.webm) vào đây
  projects/<uuid>/    Mỗi dự án một thư mục: manifest, scenes, config, transcript, backups
  final/<uuid>/       video.mp4 xuất ra theo dự án
```

## Cài đặt (một lần)

Yêu cầu: Node.js >= 20.19, Python 3, ffmpeg.

```bash
# macOS
brew install ffmpeg

# Trong thư mục dự án
npm install
python3 -m venv .venv-whisper
.venv-whisper/bin/pip install openai-whisper
```

- `npm install` ở root cài một lần cho cả `server` và `engine` (npm workspaces). Trên Windows có thể nhấp đúp `setupv1.bat`.
- Server tự nhận `.venv-whisper` khi khởi động; đặt biến `PYTHON_EXE` nếu muốn dùng Python khác.
- Thiếu ffmpeg hệ thống: server tự dùng bản bundle của Remotion — đủ để tạo dự án và render, nhưng bản này tối giản (thiếu encoder PCM) nên **bóc băng vẫn cần ffmpeg đầy đủ**.
- Lần bóc băng đầu tiên Whisper tải model `small` (~460 MB) về `~/.cache/whisper`. Nếu mạng chặn SSL (lỗi certificate), tải tay bằng curl rồi đặt đúng tên file vào thư mục cache đó.

## Chạy

**Windows:** nhấp đúp `run_dashboard.bat` — script khởi động cả hai tiến trình, chờ sẵn sàng rồi tự mở trình duyệt.

**macOS/Linux:** hai terminal:

```bash
npm run server     # API + Dashboard: http://127.0.0.1:3001
npm run studio     # Remotion Studio: http://localhost:3000
```

## Luồng sử dụng

1. Thả video vào `data/source/`.
2. Mở `http://127.0.0.1:3001` → chọn video → **Tạo & mở dự án** (ffprobe đo thời lượng, tạo config riêng cho video đó).
3. **Đồng bộ Python** — Whisper bóc băng, tự nhận ngôn ngữ, tạo cảnh. Phụ đề cũ được backup vào `projects/<uuid>/backups/` trước khi ghi đè.
4. Sửa lời thoại trong cột trái; chỉnh font, cỡ chữ, vị trí, màu, hiệu ứng ở cột phải — Studio cập nhật ngay qua preview.
5. **Bật kéo chữ trong Preview** để kéo phụ đề tới vị trí mong muốn; kéo ô vuông xanh để đổi cỡ chữ.
6. **Lưu phụ đề** giữ bản chỉnh (server kiểm tra revision, tránh hai tab ghi đè nhau).
7. **Xuất MP4** — tự lưu thay đổi chưa lưu rồi render; xong bấm **Tải MP4**.

## Hành vi cần biết

- Job render/transcribe chạy ngầm ở server: đóng tab vẫn tiếp tục; mở lại dashboard sẽ nối lại theo dõi nếu server chưa khởi động lại. Server chỉ chạy một job một lúc — thao tác ghi trong lúc job chạy bị từ chối (409).
- Khung hình mặc định dự án mới: 1080×1920, 30 fps, `durationInFrames` = thời lượng video thật. Đổi khung hình: sửa `config.json` trong thư mục dự án rồi tải lại.
- `VIDEO_PROJECT` (env) trỏ engine sang thư mục Remotion khác khi cần; `PORT` đổi cổng API (mặc định 3001).
- API chỉ phục vụ localhost và từ chối request từ origin khác; video nguồn được cung cấp cho Studio qua `/media/projects/<uuid>` với CORS giới hạn cổng 3000.
