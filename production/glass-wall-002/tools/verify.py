#!/workspace/media-tools/venv/bin/python
"""Measure the delivered movie. Never substitutes for visual or listening review.

Run with --mix the lossless final mix, --music its score stem, and --timeline
the production JSON. The JSON may declare silences [{start,end,label}], bonks
[{time,label}], and dialogue [{start,end,id}]. All times are seconds.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RATE = 48000


def run(args: list[str], *, binary: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, capture_output=True, text=not binary)


def db(value: float) -> float | None:
    return round(20 * math.log10(value), 3) if value > 0 else None


def describe(samples: np.ndarray) -> dict:
    if samples.size == 0:
        return {"samples": 0, "rms_dbfs": None, "peak_dbfs": None, "digital_zero": False}
    rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
    peak = float(np.max(np.abs(samples)))
    return {"samples": len(samples), "rms_linear": rms, "peak_linear": peak,
            "rms_dbfs": db(rms), "peak_dbfs": db(peak), "digital_zero": bool(peak == 0)}


def decode_audio(path: Path) -> np.ndarray:
    result = run(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-ar", str(RATE),
                  "-ac", "2", "-f", "f32le", "pipe:1"], binary=True)
    return np.frombuffer(result.stdout, dtype="<f4").reshape(-1, 2)


def resolved(value: str | None, fallback: str) -> Path:
    path = Path(value or fallback)
    return path if path.is_absolute() else ROOT / path


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def aligned_segment(reference: np.ndarray, delivered: np.ndarray, start: float,
                    end: float, radius: float = .12) -> dict:
    """Find normalized correlation maximum in a bounded decoded-audio window."""
    first, last = int(start * RATE), int(end * RATE)
    margin = int(radius * RATE)
    if first < margin or last + margin > len(delivered) or last > len(reference):
        return {"start": start, "end": end, "available": False}
    x = reference[first:last].mean(axis=1).astype(np.float64)
    y = delivered[first-margin:last+margin].mean(axis=1).astype(np.float64)
    x -= np.mean(x)
    if float(np.sum(x*x)) < 1e-8:
        return {"start": start, "end": end, "available": False, "reason": "source interval is silent"}
    length = len(x) + len(y) - 1
    size = 1 << (length - 1).bit_length()
    dots = np.fft.irfft(np.fft.rfft(y, size) * np.fft.rfft(x[::-1], size), size)
    dots = dots[len(x)-1:len(y)]
    sums = np.r_[0., np.cumsum(y)]
    squares = np.r_[0., np.cumsum(y*y)]
    energies = squares[len(x):] - squares[:-len(x)]
    energies -= (sums[len(x):] - sums[:-len(x)]) ** 2 / len(x)
    correlations = dots / np.sqrt(np.maximum(energies, 1e-20) * np.sum(x*x))
    best = int(np.argmax(correlations))
    return {"start": start, "end": end, "available": True,
            "lag_samples": best-margin, "lag_ms": round((best-margin) / RATE * 1000, 4),
            "correlation": round(float(correlations[best]), 6)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", default="renders/the-glass-wall.mp4")
    parser.add_argument("--mix")
    parser.add_argument("--music")
    parser.add_argument("--timeline", default="TIMELINE.json")
    parser.add_argument("--output", default="review/automated-qa.json")
    args = parser.parse_args()
    video, timeline_path = resolved(args.video, ""), resolved(args.timeline, "")
    if not video.is_file():
        parser.error(f"Final video does not exist: {video}")
    timeline = json.loads(timeline_path.read_text()) if timeline_path.is_file() else {}
    mix = resolved(args.mix or timeline.get("mix"), "audio/mix.wav")
    music = resolved(args.music or timeline.get("music_stem"), "audio/music.wav")
    report = {"video": str(video.relative_to(ROOT)) if video.is_relative_to(ROOT) else str(video),
              "sha256": sha(video), "method": "Actual MP4 probing, complete decode, and audio measurements.",
              "limitations": ["Automated measurements do not establish intelligibility, comedy, lip synchronization, framing, character continuity, or technical honesty.",
                              "Those require separate review of rendered frames and audible playback; this script performs neither."],
              "checks": []}

    def check(name: str, passed: bool | None, detail) -> None:
        report["checks"].append({"name": name, "status": "pass" if passed is True else "fail" if passed is False else "not_performed", "detail": detail})

    probe = json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(video)]).stdout)
    report["ffprobe"] = probe
    vs = [s for s in probe["streams"] if s["codec_type"] == "video"]
    aus = [s for s in probe["streams"] if s["codec_type"] == "audio"]
    duration = float(timeline.get("duration", 64))
    fps = int(timeline.get("fps", 30))
    check("approved_timeline_spec", duration == 64 and fps == 30,
          {"timeline_duration": duration, "timeline_fps": fps, "approved_script": "02-SHOOTING-SCRIPT.md: 64 seconds, 30 fps, 1920 frames."})
    check("delivery_stream_count", len(vs) == 1 and len(aus) == 1, {"video": len(vs), "audio": len(aus)})
    if not vs or not aus:
        check("remaining_measurements", None, "Delivery lacks a required stream.")
    else:
        v, a = vs[0], aus[0]
        numerator, denominator = map(int, v["avg_frame_rate"].split("/"))
        actual_fps = numerator / denominator
        check("widescreen_h264", v.get("codec_name") == "h264" and (v["width"], v["height"]) == (1920, 1080) and v.get("pix_fmt") == "yuv420p", {"codec": v.get("codec_name"), "width": v["width"], "height": v["height"], "pixel_format": v.get("pix_fmt")})
        check("frame_rate_count", actual_fps == fps and int(v.get("nb_read_frames", -1)) == round(duration * fps), {"fps": actual_fps, "decoded_frames": v.get("nb_read_frames"), "expected": round(duration * fps)})
        actual_duration = float(probe["format"]["duration"])
        check("duration", abs(actual_duration-duration) <= 1/fps, {"seconds": actual_duration, "expected": duration})
        check("aac_stereo_48khz", a.get("codec_name") == "aac" and a.get("channels") == 2 and int(a.get("sample_rate", 0)) == RATE, {"codec": a.get("codec_name"), "channels": a.get("channels"), "sample_rate": a.get("sample_rate")})
        video_start, audio_start = float(v.get("start_time", 0)), float(a.get("start_time", 0))
        check("container_av_start_alignment", abs(video_start-audio_start) <= 1/fps,
              {"video_start_seconds": video_start, "audio_start_seconds": audio_start})
        try:
            decoded = run(["ffmpeg", "-v", "error", "-xerror", "-i", str(video), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"])
            check("complete_av_decode", decoded.returncode == 0 and not decoded.stderr.strip(), decoded.stderr.strip() or "Every frame and audio packet decoded without error.")
        except subprocess.CalledProcessError as exc:
            check("complete_av_decode", False, exc.stderr)
        delivered = decode_audio(video)
        report["decoded_audio"] = {"frames": len(delivered), "duration": len(delivered)/RATE, **describe(delivered)}
        check("finite_audio", bool(np.isfinite(delivered).all()), report["decoded_audio"])
        if mix.is_file():
            reference = decode_audio(mix)
            common = min(len(reference), len(delivered))
            reference_sub, delivered_sub = reference[:common:8].ravel(), delivered[:common:8].ravel()
            corr = float(np.corrcoef(reference_sub, delivered_sub)[0, 1])
            check("delivered_audio_matches_source", bool(corr >= .97 and abs(len(reference)-len(delivered)) <= RATE/30), {"source": str(mix), "source_sha256": sha(mix), "correlation": corr, "source_frames": len(reference), "delivered_frames": len(delivered)})
            anchors = timeline.get("dialogue", timeline.get("lines", []))
            source_inventory = []
            for item in anchors:
                source_file = resolved(item.get("file"), "audio/nonexistent")
                source_inventory.append({"id": item.get("id"), "speaker": item.get("speaker"),
                                         "text": item.get("text"), "start": item.get("start"), "end": item.get("end"),
                                         "file_exists": source_file.is_file(),
                                         "has_mouth_envelope": any(sample.get("value", 0) > .05 for sample in item.get("mouth_envelope", []))})
            check("declared_dialogue_inventory", len(source_inventory) == 12 and
                  all(item["file_exists"] and item["has_mouth_envelope"] and 0 <= float(item["start"]) < float(item["end"]) <= duration for item in source_inventory),
                  {"note": "Metadata and source asset presence; spoken intelligibility requires listening.", "lines": source_inventory})
            alignment = []
            for item in anchors:
                if "start" not in item or "end" not in item:
                    continue
                start, end = float(item["start"]), float(item["end"])
                if end-start > .4:
                    measured = aligned_segment(reference, delivered, start+.05, min(end-.05, start+1.25))
                    measured["id"] = item.get("id", item.get("label", item.get("text", "speech")))
                    alignment.append(measured)
            if not alignment:
                for start in (1, 7, 12, 22, 27, 44, 48, 51, 59):
                    measured = aligned_segment(reference, delivered, start, start+1)
                    if measured.get("available"):
                        alignment.append(measured)
            available = [item for item in alignment if item.get("available")]
            check("source_to_aac_alignment", bool(available) and all(abs(item["lag_ms"]) <= 1000/fps and item["correlation"] >= .95 for item in available), {"method": "Normalized waveform cross-correlation within ±120 ms; does not verify mouth animation.", "anchors": alignment})
        else:
            check("source_audio_comparison", None, f"Lossless mix missing: {mix}")

        silences = [item if isinstance(item, dict) else {"label": f"silence-{number+1}", "start": item[0], "end": item[1]}
                    for number, item in enumerate(timeline.get("silences", []))]
        measured_silences = []
        for item in silences:
            start, end = float(item["start"]), float(item["end"])
            # Exclude 35 ms at each boundary for unavoidable AAC transform overlap.
            inset = min(.035, (end-start)/4)
            stats = describe(delivered[int((start+inset)*RATE):int((end-inset)*RATE)])
            measured_silences.append({**item, "measured_interior": [start+inset, end-inset], **stats})
        check("declared_complete_mix_silences", bool(silences) and all(item["samples"] > 0 and (item["rms_dbfs"] is None or item["rms_dbfs"] < -65) for item in measured_silences), measured_silences or "No declared intervals in timeline.")

        bonks = timeline.get("bonks", []) or [item for item in timeline.get("events", []) if re.fullmatch(r"(?:bonk-[1-3]|distant-bonk)", str(item.get("id", "")).lower())]
        bonk_measures = []
        for item in bonks:
            time = float(item.get("peak_time", item.get("time", item.get("start", 0))))
            lo, hi = max(0, int((time-.04)*RATE)), min(len(delivered), int((time+.16)*RATE))
            samples = delivered[lo:hi]
            peak_sample = int(np.argmax(np.max(np.abs(samples), axis=1))) if len(samples) else 0
            bonk_measures.append({**item, "window": [lo/RATE, hi/RATE], "peak_time": (lo+peak_sample)/RATE,
                                  "peak_offset_ms": round(((lo+peak_sample)/RATE-time)*1000, 3),
                                  "expected_impact_frame": round(float(item.get("start", time))*fps),
                                  "measured_peak_frame": math.floor((lo+peak_sample)/RATE*fps), **describe(samples)})
        check("bonk_peaks_at_cues", len(bonks) == 4 and all(item["samples"] > 0 and item["peak_dbfs"] is not None and item["peak_dbfs"] > -35 and abs(item["peak_offset_ms"]) <= 1000/fps/2+2 for item in bonk_measures), bonk_measures or "No declared bonk cues in timeline.")
        first_bonk = next((item for item in bonks if item.get("id") == "bonk-1"), None)
        first_hold = [item for item in silences if first_bonk and
                      float(item["start"]) >= float(first_bonk.get("end", first_bonk["start"])) and
                      float(item["start"]) <= float(first_bonk.get("end", first_bonk["start"]))+.1]
        check("first_bonk_uncomfortable_silence", bool(first_hold) and
              max(float(item["end"])-float(item["start"]) for item in first_hold) >= 1.4,
              {"note": "Timing and digital-silence evidence; comic effect requires playback review.", "holds": first_hold})
        if music.is_file():
            score = decode_audio(music)
            check("score_stem_duration", len(score) == round(duration*RATE),
                  {"frames": len(score), "expected_frames": round(duration*RATE)})
            music_measures = []
            for item in bonks:
                time = float(item.get("start", item.get("time", 0)))
                start, end = max(0, time-.4), min(len(score)/RATE, time+1)
                music_measures.append({"label": item.get("label", item.get("id", "bonk")), "window": [start, end], **describe(score[int(start*RATE):int(end*RATE)])})
            check("no_music_around_impacts", bool(music_measures) and all(item["samples"] > 0 and (item["peak_dbfs"] is None or item["peak_dbfs"] < -90) for item in music_measures), {"source": str(music), "source_sha256": sha(music), "measurements": music_measures})
        else:
            check("no_music_around_impacts", None, f"Music stem missing: {music}")

        loudness = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]).stderr
        blocks = re.findall(r'\{\s*"input_i".*?\}', loudness, re.S)
        if blocks:
            values = json.loads(blocks[-1])
            check("loudness_delivery", abs(float(values["input_i"])+18) <= 1,
                  {**values, "revision_target_lufs": -18,
                   "reason": "Constant peak-safe gain preserves speech shape; no nonlinear master saturation."})
            check("true_peak_delivery", float(values["input_tp"]) <= -1.4, {"measured_dbTP": float(values["input_tp"]), "spec_dbTP": -1.5, "measurement_tolerance_db": .1})
        else:
            check("loudness_delivery", None, "FFmpeg did not return measurement JSON.")
    report["summary"] = {status: sum(item["status"] == status for item in report["checks"]) for status in ("pass", "fail", "not_performed")}
    out = resolved(args.output, "")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2)+"\n")
    print(f"{out}: {report['summary']}")
    for item in report["checks"]:
        if item["status"] != "pass":
            print(f"{item['status'].upper()}: {item['name']}")
    return 1 if report["summary"]["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
