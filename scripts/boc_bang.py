# -*- coding: utf-8 -*-
import json
import math
import os
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def write_json(file, data):
    # Ghi file tạm rồi thay thế, tránh JSON đang ghi dở.
    temp = file.with_name(f"{file.name}.{uuid.uuid4().hex}.tmp")
    try:
        temp.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temp, file)
    finally:
        temp.unlink(missing_ok=True)


def main():
    if len(sys.argv) != 3:
        raise RuntimeError(
            'Cách chạy: py boc_bang.py "video.mp4" "thu_muc_project"'
        )

    video = Path(sys.argv[1]).resolve()
    project = Path(sys.argv[2]).resolve()

    if not video.is_file():
        raise FileNotFoundError(f"Không tìm thấy video: {video}")
    if not project.is_dir():
        raise FileNotFoundError(f"Không tìm thấy dự án: {project}")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("Không tìm thấy ffmpeg trong PATH.")

    manifest = read_json(project / "manifest.json")
    config = read_json(project / "config.json")
    if manifest.get("sourceFile") != video.name:
        raise RuntimeError("Video không khớp manifest của dự án.")

    duration = config["durationInFrames"] / config["fps"]
    if not math.isfinite(duration) or duration <= 0:
        raise RuntimeError("Thời lượng dự án không hợp lệ.")

    print(f"Video nguồn: {video}", flush=True)
    print(f"Dự án: {project.name}", flush=True)
    print("Đang nạp Whisper small trên CPU...", flush=True)

    import torch
    import whisper

    torch.set_num_threads(2)
    model = whisper.load_model("small", device="cpu")

    print("Đang bóc băng và tự nhận diện ngôn ngữ...", flush=True)
    result = model.transcribe(
        str(video),
        task="transcribe",
        language=None,
        word_timestamps=True,
        fp16=False,
        temperature=0,
        verbose=False,
    )

    scenes = []
    for segment in result["segments"]:
        start = float(segment["start"])
        end = float(segment["end"])
        text = segment["text"].strip()
        if not text or not all(map(math.isfinite, [start, end])):
            continue

        # Chỉ giới hạn cảnh; transcript gốc được giữ nguyên.
        start, end = max(0.0, start), min(duration, end)
        if end <= start:
            continue

        scenes.append({
            "id": f"s{len(scenes) + 1}",
            "start": start,
            "end": end,
            "text": text,
            "fontSize": 52,
            "positionY": 220,
        })
        print(f"[{start:.2f} -> {end:.2f}] {text}", flush=True)

    if not scenes:
        raise RuntimeError(
            "Không nhận dạng được lời thoại hợp lệ; giữ nguyên dữ liệu cũ."
        )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = project / "backups" / f"transcribe-{stamp}-{uuid.uuid4().hex[:8]}"
    backup.mkdir(parents=True)
    for name in ("transcript.json", "scenes.json"):
        old_file = project / name
        if old_file.exists():
            shutil.copy2(old_file, backup / name)

    write_json(project / "transcript.json", result)
    write_json(project / "scenes.json", {"scenes": scenes})
    print(
        f"Hoàn tất: {len(scenes)} cảnh; ngôn ngữ: {result.get('language')}",
        flush=True,
    )


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as error:
        print(f"Lỗi: {error}", file=sys.stderr, flush=True)
        sys.exit(1)