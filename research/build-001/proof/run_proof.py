#!/usr/bin/env python3
"""BUILD 001 pipeline proof: horizontal 16:9 -> captioned vertical 9:16 MP4.

Measures wall-clock runtime and peak child RSS. Validates the output:
720x1280, h264/yuv420p + aac, duration match, caption readability band,
no caption pixels inside the protected bottom band, A/V start alignment.

Caption method: ffmpeg drawtext filters generated from the SRT (one filter
per caption line, enable=between(t,start,end)). Rationale: this ffmpeg
build's libass-based `subtitles`/`ass` filters duplicate wrapped caption
text vertically at 720x1280 with FontSize>=20 (timing stays correct, layout
breaks). drawtext is deterministic and fully measurable. The libass quirk
is documented in PIPELINE-PROOF.md as a known pitfall for participants.
"""
import json
import re
import resource
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
IN = HERE / "practice-input.mp4"
SRT = HERE / "practice-transcript.srt"
OUT = HERE / "practice-output.mp4"
PROTECTED_BOTTOM_PX = 100  # user-designated protected UI band (proof value)
FONT = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
FONTSIZE = 28
LINE_H = 36          # line advance px at FONTSIZE 28
CAPTION_MARGIN = 20  # gap above the protected band
MAX_CHARS = 38       # wrap width so lines fit 720px at fontsize 28


def parse_srt(path):
    raw = Path(path).read_text()
    events = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):([\d.,]+)\s*-->\s*(\d+):(\d+):([\d.,]+)", lines[1])
        if not m:
            continue
        def ts(h, mi, s):
            return int(h) * 3600 + int(mi) * 60 + float(s.replace(",", "."))
        start = ts(*m.group(1, 2, 3))
        end = ts(*m.group(4, 5, 6))
        text = " ".join(lines[2:]).strip()
        events.append((start, end, text))
    return events


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + 1 + len(w) <= width:
            cur = (cur + " " + w).strip()
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def dt_escape(s):
    # Use U+2019 for apostrophes: ffmpeg's filter parser mishandles \'
    # inside single-quoted drawtext values mid-chain (corrupts later
    # filters). U+2019 renders identically in Noto Sans.
    return (s.replace("'", "\u2019")
             .replace("\\", "\\\\").replace(":", "\\:")
             .replace(",", "\\,").replace("%", "\\%"))


def caption_filters(events):
    """One drawtext per caption line; block sits above the protected band."""
    filt = []
    for start, end, text in events:
        lines = wrap(text, MAX_CHARS)
        n = len(lines)
        top = 1280 - PROTECTED_BOTTOM_PX - CAPTION_MARGIN - n * LINE_H
        for i, line in enumerate(lines):
            y = top + i * LINE_H
            bs = chr(92)  # single backslash: escape filter commas
            filt.append(
                "drawtext=fontfile=" + FONT + ":text='" + dt_escape(line) +
                "':fontsize=" + str(FONTSIZE) + ":fontcolor=white:borderw=2:" +
                "bordercolor=black:x=(w-text_w)/2:y=" + str(y) +
                ":enable='between(t" + bs + "," + str(start) + bs + "," +
                str(end) + ")'")
    return ",".join(filt)


EVENTS = parse_srt(SRT)
CAPTIONS = caption_filters(EVENTS)
FILTER = f"crop=608:1080:656:0,scale=720:1280,{CAPTIONS},format=yuv420p"

CMD = [
    "ffmpeg", "-y", "-v", "error",
    "-i", str(IN),
    "-vf", FILTER,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    str(OUT),
]


def probe(path):
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True)
    return json.loads(p.stdout)


def main():
    if OUT.exists():
        OUT.unlink()
    t0 = time.monotonic()
    r = subprocess.run(CMD)
    wall = time.monotonic() - t0
    peak_kb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    if r.returncode != 0:
        print("ffmpeg failed", file=sys.stderr)
        sys.exit(1)

    meta = probe(OUT)
    streams = {s["codec_type"]: s for s in meta["streams"]}
    v, a = streams["video"], streams["audio"]
    checks = {
        "width_720": v["width"] == 720,
        "height_1280": v["height"] == 1280,
        "video_codec_h264": v["codec_name"] == "h264",
        "pix_fmt_yuv420p": v["pix_fmt"] == "yuv420p",
        "audio_codec_aac": a["codec_name"] == "aac",
        "audio_present": True,
        "duration_match_s": abs(float(meta["format"]["duration"]) - 14.083) < 0.5,
    }
    v_start = float(v.get("start_time", 0.0))
    a_start = float(a.get("start_time", 0.0))
    av_offset_ms = abs(v_start - a_start) * 1000.0
    checks["av_offset_within_40ms"] = av_offset_ms <= 40.0

    # Caption band measurement: render the caption layer alone onto a black
    # 720x1280 canvas (same drawtext chain, same timestamps). Non-black
    # pixels are exactly the caption glyphs — no cross-encode noise.
    frame_p = HERE / "frame-check.png"
    mask_p = HERE / "frame-caption-mask.png"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "3.5",
                    "-i", str(OUT), "-frames:v", "1", str(frame_p)],
                   check=True)
    mask_vid = HERE / "caption-mask.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-f", "lavfi", "-i", "color=black:720x1280:d=14.08:r=30",
                    "-vf", CAPTIONS,
                    "-c:v", "libx264", "-preset", "ultrafast",
                    "-frames:v", "423", str(mask_vid)],
                   check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-ss", "3.5", "-i", str(mask_vid),
                    "-frames:v", "1", str(mask_p)],
                   check=True)
    from PIL import Image
    m = Image.open(mask_p).convert("L")
    W, H = m.size
    mpx = m.load()
    cap_top, cap_bot = H, 0
    prot = H - PROTECTED_BOTTOM_PX
    bright_in_protected = 0
    for y in range(H):
        row_hit = False
        for x in range(0, W, 2):
            if mpx[x, y] > 30:
                row_hit = True
                break
        if row_hit:
            if y < prot:
                if y < cap_top:
                    cap_top = y
                cap_bot = y
            else:
                bright_in_protected += 1
    band_h = (cap_bot - cap_top + 1) if cap_bot >= cap_top else 0
    checks["caption_band_visible"] = band_h >= 24
    checks["no_caption_in_protected_band"] = bright_in_protected == 0

    result = {
        "wall_clock_s": round(wall, 2),
        "peak_rss_mb": round(peak_kb / 1024, 1),
        "output_bytes": OUT.stat().st_size,
        "video": {"w": v["width"], "h": v["height"], "codec": v["codec_name"],
                  "pix_fmt": v["pix_fmt"]},
        "audio": {"codec": a["codec_name"]},
        "duration_s": round(float(meta["format"]["duration"]), 2),
        "av_offset_ms": round(av_offset_ms, 1),
        "caption_band_px": band_h,
        "bright_px_in_protected_band": bright_in_protected,
        "checks": checks,
        "all_checks_pass": all(checks.values()),
    }
    (HERE / "proof-result.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["all_checks_pass"] else 1)


if __name__ == "__main__":
    main()
