#!/workspace/media-tools/venv/bin/python
"""Extract labeled contact sheets from the actual delivered MP4, not source art."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", default=str(ROOT / "renders/the-glass-wall.mp4"))
    parser.add_argument("--output", default=str(ROOT / "review"))
    args = parser.parse_args()
    video, output = Path(args.video), Path(args.output)
    if not video.is_file():
        parser.error(f"Final movie missing: {video}")
    output.mkdir(parents=True, exist_ok=True)
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate,nb_frames,duration", "-of", "json", str(video)], check=True, capture_output=True, text=True).stdout)["streams"][0]
    num, den = map(int, probe["avg_frame_rate"].split("/"))
    fps = num / den
    count = int(probe["nb_frames"]) if probe.get("nb_frames") else round(float(probe["duration"])*fps)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font = ImageFont.truetype(font_path, 20)
    title_font = ImageFont.truetype(font_path, 26)
    width, height, label_height = 640, 360, 34
    selections = [("overview", list(range(0, count, round(fps))), "Every second of the actual delivered MP4"),
                  ("action", list(range(round(33.5*fps), min(count, round(46.5*fps)+1), round(.2*fps))), "Door refusal / impacts / silence: every 0.2 seconds"),
                  ("lawyer", list(range(round(50*fps), min(count, round(58*fps)+1), round(.2*fps))), "Lawyer / fictional receipt / distant impact: every 0.2 seconds"),
                  ("critical", [round(t*fps) for t in (30.65, 31, 31.25, 34.5, 35, 35.5, 37.8, 38, 38.2, 38.5, 39, 39.5, 40, 41.3, 41.5, 41.7, 44.8, 45, 45.2, 46, 50.5, 51.5, 56.3, 56.5, 56.7)], "Owner / refusal / impact triplets / first silence / lawyer"),
                  ("sync", sorted({round(t*fps)+delta for t in (31, 35) for delta in (-1,0,1)} |
                                  {round(t*fps)+delta for t in (38,41.5,45,56.5) for delta in (-1,0,1,2)} |
                                  {round(t*fps) for t in (50.5,53.2,58.2)}), "Native frame timing at cues: before / at / after")]
    with video.open("rb") as handle:
        video_hash = hashlib.file_digest(handle, "sha256").hexdigest()
    manifest = {"video": str(video), "video_sha256": video_hash, "fps": fps, "frame_count": count, "sheets": [], "native_sync_frames": []}
    with tempfile.TemporaryDirectory(prefix="glass-wall-contact-") as temp:
        for name, frames, title in selections:
            frame_dir = Path(temp) / name
            frame_dir.mkdir()
            if name == "overview":
                expr = f"not(mod(n,{round(fps)}))"
            elif name not in ("critical", "sync"):
                expr = f"gte(n,{frames[0]})*lte(n,{frames[-1]})*not(mod(n-{frames[0]},{round(.2*fps)}))"
            else:
                expr = "+".join(f"eq(n,{frame})" for frame in frames)
            filters = f"select='{expr}'" + (f",scale={width}:{height}" if name != "sync" else "")
            subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-an", "-vf", filters, "-fps_mode", "vfr", str(frame_dir / "%04d.png")], check=True)
            extracted = sorted(frame_dir.glob("*.png"))
            if len(extracted) != len(frames):
                raise RuntimeError(f"{name}: expected {len(frames)} frames, got {len(extracted)}")
            for offset in range(0, len(frames), 12):
                subset = frames[offset:offset+12]
                rows = (len(subset)+2)//3
                sheet = Image.new("RGB", (width*3, 62+rows*(height+label_height)), "#111820")
                draw = ImageDraw.Draw(sheet)
                draw.text((14, 15), f"THE GLASS WALL · {title}", fill="#dfe5e8", font=title_font)
                for position, frame in enumerate(subset):
                    x, y = (position%3)*width, 62+(position//3)*(height+label_height)
                    with Image.open(extracted[offset+position]) as img:
                        if name == "sync":
                            native_dir = output / "sync-frames"
                            native_dir.mkdir(exist_ok=True)
                            native_file = native_dir / f"f{frame:04d}-t{frame/fps:06.3f}.png"
                            img.save(native_file)
                            manifest["native_sync_frames"].append({"path": str(native_file.relative_to(output)), "frame": frame, "seconds": frame/fps, "width": img.width, "height": img.height})
                        sheet.paste(img.resize((width,height), Image.Resampling.LANCZOS) if img.size != (width,height) else img, (x,y))
                    draw.text((x+12,y+height+5), f"{frame/fps:06.2f}s  ·  frame {frame:04d}", fill="#dfe5e8", font=font)
                target = output / f"contact-{name}-{offset//12+1:02d}.jpg"
                sheet.save(target, quality=93, subsampling=0)
                manifest["sheets"].append({"path": target.name, "frames": subset, "seconds": [frame/fps for frame in subset]})
                print(target)
    (output / "contact-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")


if __name__ == "__main__":
    main()
