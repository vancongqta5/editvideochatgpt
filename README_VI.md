# editvideochatgpt

Tạo phụ đề cho video dọc bằng Remotion. Chọn video trong `skill1/01_SOURCE`, dựng dự án, chỉnh phụ đề trên dashboard, xem trước trong Remotion Studio, xuất MP4.

Bản trong repo đang chuyển sang mô hình nhiều dự án. Tạo dự án, mở dự án và xem trước đã chạy. Lưu, đồng bộ Python và xuất MP4 chưa nối (mục [Trạng thái hiện tại](#trạng-thái-hiện-tại)).

## Cấu trúc

Đường dẫn tính từ gốc repo.

| Đường dẫn | Vai trò |
|---|---|
| `skill1/01_SOURCE/` | video nguồn để chọn (`input.mp4`, `phuongdi1.mp4`) |
| `skill1/00_SHARED_WORKSPACE/projects/<id>/` | dữ liệu một dự án, sinh ra lúc chạy |
| `skill1/00_SHARED_WORKSPACE/active-project.json` | trỏ tới dự án đang mở |
| `skill1/03_PROJECT/server-api/server.js` | Express: API, chọn dự án, đọc và ghi cảnh, render |
| `skill1/03_PROJECT/web-dashboard/public/` | dashboard serve ở cổng 3001 (`index.html`, `dashboard.css`) |
| `skill1/03_PROJECT/remotion-engine/` | Remotion Studio, `src/Composition.tsx`, `src/scenes.json` |
| `skill1/03_PROJECT/python-scripts/` | bóc băng và dựng `scenes.json` |
| `skill1/05_FINAL/video.mp4` | nơi render ghi kết quả |
| `run_dashboard.bat`, `setupv1.bat` | launcher cho Windows |

`remotion-engine/dashboard/App.tsx` là dashboard React viết dở. Không có bước build, không được nhúng vào trang nào, nên không chạy. Trang đang phục vụ là `web-dashboard/public/index.html` với script viết trực tiếp trong file. `web-dashboard/public/dashboard.js` là bản build cũ 648 KB, `index.html` không tham chiếu tới nó.

## Yêu cầu

- Node.js 20 trở lên. Máy đã kiểm: Node 24.16.0, npm 11.13.0.
- FFmpeg, gồm `ffprobe`. Thiếu `ffprobe` thì không tạo được dự án, API trả `spawn ffprobe ENOENT`.
- Python 3 nếu chạy script bóc băng.
- Remotion 4.0.542 và React 19.3.1, đã ghim trong `package.json`.

macOS:

```bash
brew install ffmpeg
```

## Cài đặt

Windows: nhấp đúp `setupv1.bat`, script cài dependency cho `server-api`, `web-dashboard`, `remotion-engine`.

macOS và Linux:

```bash
cd skill1/03_PROJECT/server-api && npm install
cd ../remotion-engine && npm install
```

`web-dashboard` không có dependency, chỉ có file tĩnh.

## Chạy

Hai tiến trình. `.bat` chỉ dùng trên Windows.

Windows: nhấp đúp `run_dashboard.bat`. Script kiểm tra cổng, mở hai cửa sổ log, chờ API và Studio sẵn sàng rồi mở trình duyệt.

macOS và Linux, hai terminal:

```bash
cd skill1/03_PROJECT/server-api
node server.js
```

```bash
cd skill1/03_PROJECT/remotion-engine
npm run dev -- --port=3000 --no-open
```

Mở http://127.0.0.1:3001. Studio ở http://localhost:3000, composition `MyComposition`.

| Cổng | Tiến trình | Phục vụ |
|---|---|---|
| 3001 | `server-api` | dashboard, API JSON, video nguồn của dự án |
| 3000 | Remotion Studio | preview và timeline, nhúng trong iframe của dashboard |

Dashboard cần cả hai. Studio tắt thì khung preview báo `Chưa nối`, phần danh sách cảnh vẫn đọc được.

Biến môi trường của `server-api`:

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `PORT` | `3001` | cổng API |
| `VIDEO_PROJECT` | `../remotion-engine` | thư mục Remotion |
| `PYTHON_EXE` | `python` | lệnh Python cho tác vụ đồng bộ |

## Dữ liệu

Mỗi dự án là một thư mục `<uuid>` gồm:

| File | Nội dung |
|---|---|
| `manifest.json` | `id`, `sourceFile`, `createdAt` |
| `transcript.json` | lời thoại thô, hiện để rỗng |
| `scenes.json` | `{scenes: [...]}`, mỗi cảnh một câu |
| `config.json` | `width`, `height`, `fps`, `durationInFrames` |

`POST /api/projects` đọc thời lượng video bằng `ffprobe` và tính `durationInFrames = ceil(giây * 30)`, khung 1080x1920, 30 fps.

Cảnh gồm `id`, `start`, `end`, `text` và các trường định dạng tuỳ chọn. Thiếu trường nào thì `styleOf` trong `src/editor-model.ts` lấy mặc định: cỡ chữ 52, `positionY` 220 px, font Arial, đậm 700, chữ trắng, nền đen mờ 0.55, không hiệu ứng.

| Trường | Đơn vị |
|---|---|
| `positionX` | phần trăm chiều ngang, tâm khung chữ |
| `positionY` | pixel, từ đáy video lên đáy khung chữ |
| `maxWidth` | phần trăm chiều ngang video |
| `fontSize` | pixel |
| `backgroundOpacity` | 0 đến 1 |
| `effect` | `none`, `fade`, `pop`, `slide` |

Khung hình lấy từ `active-project.json`. Không có dự án đang mở thì `/api/state` trả `project: null`, `scenes: []`, và config đọc từ `remotion-engine/src/video-config.json` (1080x1920, 30 fps, 1148 frame, khoảng 38,3 giây).

Studio không đọc `src/scenes.json`. `Root.tsx` gọi `GET /studio-state` mỗi lần tính metadata, nhận cảnh của dự án đang mở và đường dẫn video, nên không có dự án thì composition rỗng. `src/scenes.json` chỉ là dữ liệu dự phòng của `Composition.tsx` và là đầu vào của `build_scenes.py`.

Video nguồn không copy vào dự án. Studio tải qua `GET /media/projects/<id>`, server đọc `sourceFile` trong manifest rồi gửi file từ `skill1/01_SOURCE`.

## API

Server chỉ nhận request từ `127.0.0.1:3001` và `localhost:3001`. Request POST phải có `Content-Type: application/json`, nếu không trả 415. Trong lúc một tác vụ nền chạy, mọi request ghi trả 409.

| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/state` | dự án, cảnh, `revision`, config, `job` |
| GET | `/api/scenes` | chỉ danh sách cảnh |
| GET | `/api/active-project` | id dự án đang mở |
| POST | `/api/active-project` | mở dự án, ghi `active-project.json` |
| GET | `/api/sources` | video trong `01_SOURCE` |
| POST | `/api/projects` | tạo dự án từ tên file nguồn, trả `{id, sourceFile}` |
| GET | `/api/projects/:id` | dữ liệu một dự án, dùng khi tạo xong |
| GET | `/api/job` | tác vụ nền gần nhất, có 6000 ký tự log cuối |
| GET | `/download/video.mp4` | tải MP4 đã render |
| GET | `/studio-state` | dữ liệu cho `Root.tsx` của Studio |
| GET | `/media/projects/:id` | video nguồn của dự án |

`revision` là SHA-256 của nội dung `scenes.json`. Lưu kèm `revision` cũ bị từ chối với 409, để hai tab không ghi đè nhau.

## Trạng thái hiện tại

Đã chạy: đọc `01_SOURCE`, tạo dự án, mở dự án, đọc cảnh, nhúng Studio, đẩy cảnh đang sửa sang Studio qua `postMessage` kênh `dashboard-studio-v21`.

Chưa nối: `POST /api/save`, `POST /api/sync`, `POST /api/render`. Ba route này bị middleware chặn ở `server-api/server.js` và trả `409 {"error":"Chưa nối chức năng này với dự án mới."}` cho mọi request, dù handler phía sau đã có code.

Hệ quả khi dùng dashboard: `controls()` trong `index.html` disable vĩnh viễn bảng định dạng và ba nút `Lưu ngay`, `Đồng bộ Python`, `Xuất MP4`. Ô lời thoại chỉ đọc. Gọi thẳng `/api/save` cũng bị 409. Trang chỉ xem trước, muốn sửa phải sửa `scenes.json` bằng tay.

## Script Python

`build_scenes.py` đọc `whisper.json`, bỏ segment rỗng hoặc có `end <= start`, ghi `remotion-engine/src/scenes.json` với `id` dạng `s1`, `s2`. Script chỉ giữ `id`, `start`, `end`, `text`, nên chạy lại là mất toàn bộ định dạng đã chỉnh.

`boc_bang.py` gọi Whisper và FFmpeg để bóc băng. Đường dẫn video ghim cứng `D:\editvideochatgpt\source\phuongdi1.mp4`, không còn đúng với cấu trúc hiện tại, sửa `VIDEO_PATH` trước khi chạy.

`sync_to_remotion.py` ghi thẳng mã TSX vào đường dẫn `my-editor` cũ, không dùng được với cấu trúc hiện tại.

## Lỗi thường gặp

`spawn ffprobe ENOENT` khi bấm `Tạo & mở dự án`: chưa có FFmpeg trong PATH. Cài rồi khởi động lại `node server.js`.

Studio trống hoặc dashboard báo `Chưa nối`: chưa có dự án đang mở, hoặc Studio chưa chạy ở cổng 3000. Tạo dự án trước, rồi bấm `↻ Studio`.

`403 Host không hợp lệ` hoặc `Origin không hợp lệ`: đang mở qua `file://` hoặc qua IP mạng LAN. Chỉ dùng `http://127.0.0.1:3001`.

`409 Dữ liệu đã đổi ở tab/Studio khác`: `revision` cũ. Sao chép phần đang sửa rồi bấm `Tải lại cảnh`.

`415 Cần Content-Type: application/json`: request POST gọi bằng tay thiếu header.

`409 Server đang xử lý`: một tác vụ nền đang chạy. Chờ job xong hoặc khởi động lại server.
