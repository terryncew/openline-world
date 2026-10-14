#!/workspace/media-tools/venv/bin/python
"""Inspect the actual review export and preserve the approved Glass Wall cut.

This is measurement, not a substitute for an intelligibility/listening review.
It deliberately refuses to write a QA result if the revised export is absent.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image
import soundfile as sf
from scipy.signal import find_peaks, resample_poly

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
ORIGINAL = REPO / "production/glass-wall-001"
BASELINE = "64862a67be2f72661f94b8d4dd01589ef921e998"
ORIGINAL_MOVIE_SHA = "8a554b7f025a2c14fb50388fbdb86371bdafa2656a27dd596911bd515f810df2"
RATE = 48000
FPS = 30


def run(args, *, binary=False):
    return subprocess.run(args, check=True, capture_output=True, text=not binary)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text())


def activity(x, rate):
    """10ms RMS relative -45dB; approximate activity, not recognized words."""
    if x.ndim > 1:
        x = x.mean(axis=1)
    step = round(rate * .01)
    levels = np.array([np.sqrt(np.mean(x[i:i+step] ** 2))
                       for i in range(0, len(x), step)])
    if not len(levels):
        return {"available": False}
    threshold = max(float(levels.max()) * 10 ** (-45 / 20), 1e-5)
    active = np.flatnonzero(levels > threshold)
    if not len(active):
        return {"available": False, "threshold_rms": threshold}
    quiet = levels <= threshold
    edges = np.diff(np.r_[False, quiet, False].astype(int))
    quiet_runs = [{"start_seconds": a*step/rate,
                   "end_seconds": min(len(x), b*step)/rate,
                   "seconds": (b-a)*step/rate}
                  for a,b in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1))
                  if b-a >= 3]
    return {"available": True, "threshold_rms": threshold,
            "onset_seconds": int(active[0]) * step / rate,
            "offset_seconds": min(len(x), (int(active[-1])+1)*step) / rate,
            "active_seconds": len(active) * step / rate,
            "quiet_runs_at_least_30ms": quiet_runs,
            "method": "10ms RMS, relative -45dB and absolute 1e-5 floor"}


def f0_measure(x, rate):
    """Independent voiced autocorrelation estimate; can have octave errors."""
    if x.ndim > 1:
        x = x.mean(axis=1)
    window, hop = round(.05 * rate), round(.01 * rate)
    minimum_lag, maximum_lag = math.ceil(rate/420), math.floor(rate/65)
    rms_limit = max(float(np.sqrt(np.mean(x*x))) * .32, 1e-4)
    pitches = []
    for at in range(0, len(x)-window+1, hop):
        frame = x[at:at+window].astype(np.float64)
        if np.sqrt(np.mean(frame*frame)) < rms_limit:
            continue
        frame -= frame.mean()
        frame *= np.hanning(window)
        nfft = 1 << (window * 2 - 1).bit_length()
        ac = np.fft.irfft(np.abs(np.fft.rfft(frame, nfft)) ** 2, nfft)[:window]
        if ac[0] <= 0:
            continue
        ac /= ac[0]
        peaks, _ = find_peaks(ac[minimum_lag:maximum_lag+1])
        peaks += minimum_lag
        if not len(peaks):
            continue
        highest = float(ac[peaks].max())
        strong = peaks[ac[peaks] >= max(.52, highest * .92)]
        if not len(strong):
            continue
        lag = int(strong[0])
        pitches.append(rate / lag)
    return {"median_hz": float(np.median(pitches)) if pitches else None,
            "voiced_windows": len(pitches), "window_seconds": .05,
            "hop_seconds": .01, "range_hz": [65, 420],
            "limitation": "Waveform autocorrelation estimates pitch, not intelligibility; octave errors are possible."}


def rgb_frame(path, time):
    result = run(["ffmpeg", "-v", "error", "-ss", str(time), "-i", str(path),
                  "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], binary=True)
    return np.asarray(Image.open(io.BytesIO(result.stdout)).convert("RGB"))


def original_preservation():
    tree = run(["git", "-C", str(REPO), "ls-tree", "-r", "-z", BASELINE,
                "--", "production/glass-wall-001"], binary=True).stdout
    checked, missing, changed = [], [], []
    for record in tree.split(b"\0"):
        if not record:
            continue
        metadata, name = record.split(b"\t", 1)
        mode, kind, expected = metadata.decode().split()
        relative = name.decode()
        path = REPO / relative
        if not path.exists() and not path.is_symlink():
            missing.append(relative)
            continue
        expected_symlink = mode == "120000"
        actual_symlink = path.is_symlink()
        if expected_symlink and actual_symlink:
            # Git records the link target itself, never dereferenced content.
            data = os.fsencode(os.readlink(path))
        elif path.is_file():
            data = path.read_bytes()
        else:
            changed.append({"path": relative, "reason": "Expected file or symbolic link has another filesystem type.", "mode": mode})
            continue
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        checked.append(relative)
        if kind != "blob" or expected_symlink != actual_symlink or actual != expected:
            changed.append({"path": relative, "baseline_git_blob": expected,
                            "current_git_blob": actual, "mode": mode,
                            "expected_symlink": expected_symlink, "actual_symlink": actual_symlink})
    return {"baseline_commit": BASELINE, "tracked_files_checked": len(checked),
            "missing": missing, "changed": changed,
            "original_movie_sha256": sha(ORIGINAL / "renders/the-glass-wall.mp4"),
            "expected_original_movie_sha256": ORIGINAL_MOVIE_SHA}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", default="renders/the-glass-wall-revised.mp4")
    parser.add_argument("--output", default="review/revision-qa.json")
    args = parser.parse_args()
    video = Path(args.video)
    if not video.is_absolute():
        video = ROOT / video
    if not video.is_file():
        parser.error(f"Actual revised movie is not available: {video}. No QA report was written.")
    timeline = read_json(ROOT / "TIMELINE.json")
    original_timeline = read_json(ORIGINAL / "TIMELINE.json")
    report = {"video": str(video.relative_to(ROOT)) if video.is_relative_to(ROOT) else str(video),
              "sha256": sha(video), "bytes": video.stat().st_size,
              "approved_original_commit": BASELINE,
              "method": "Actual final MP4 decoding, cue waveform comparisons, current-source checksums, and baseline Git blob preservation.",
              "limitations": ["No human auditory review is performed. Pitch, timing and waveform correlation do not prove crisp pronunciation, natural delivery or comic effect.",
                              "Graphics contrast and stage telemetry do not prove legibility or understandable performances; rendered-frame visual review remains separate."],
              "checks": []}

    def check(name, passed, detail):
        # NumPy comparisons produce np.bool_, whose identity is not Python's
        # True/False. Preserve None as unperformed, normalize other booleans.
        normalized = None if passed is None else bool(passed)
        report["checks"].append({"name": name, "status": "pass" if normalized is True else "fail" if normalized is False else "not_performed", "detail": detail})

    # The established production checks inspect every video/audio packet, all
    # four impacts, lossless mix/AAC alignment, silences, music, and loudness.
    base_path = ROOT / "review/base-production-qa.json"
    base_result = subprocess.run([sys.executable, str(ROOT / "tools/verify.py"),
                                  "--video", str(video), "--mix", str(ROOT / "audio/mix.wav"),
                                  "--music", str(ROOT / "audio/music.wav"),
                                  "--timeline", str(ROOT / "TIMELINE.json"),
                                  "--output", str(base_path)], capture_output=True, text=True)
    if base_path.is_file():
        base = read_json(base_path)
        check("established_production_checks", base_result.returncode == 0 and base["summary"]["fail"] == 0,
              {"report": str(base_path.relative_to(ROOT)), "summary": base["summary"],
               "sha256": base.get("sha256"), "stderr": base_result.stderr})
        report["checks"].extend({**c, "name": "production_" + c["name"]} for c in base["checks"])
    else:
        check("established_production_checks", False, {"returncode": base_result.returncode,
                                                      "stderr": base_result.stderr, "stdout": base_result.stdout})

    preserved = original_preservation()
    check("approved_original_all_tracked_files_preserved", preserved["tracked_files_checked"] > 0 and not preserved["missing"] and not preserved["changed"] and preserved["original_movie_sha256"] == ORIGINAL_MOVIE_SHA, preserved)
    unchanged_cards = [{"path": p, "same_bytes": (ROOT/p).read_bytes() == (ORIGINAL/p).read_bytes(),
                        "sha256": sha(ROOT/p)} for p in ("artwork/receipt.png", "artwork/end-card.png")]
    check("fictional_receipt_and_end_claim_preserved", all(p["same_bytes"] for p in unchanged_cards), unchanged_cards)

    frame_probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(video)]).stdout)
    points = np.array([float(f["best_effort_timestamp_time"]) for f in frame_probe["frames"]])
    expected_points = np.arange(1920) / FPS
    max_error = float(np.max(np.abs(points - expected_points))) if len(points) == 1920 else None
    check("every_video_frame_presentation_timestamp", len(points) == 1920 and max_error is not None and max_error <= .000001,
          {"decoded_frames": len(points), "first_pts": float(points[0]) if len(points) else None,
           "last_pts": float(points[-1]) if len(points) else None, "maximum_error_seconds": max_error, "expected_fps": FPS})
    audio_probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time,nb_samples", "-of", "json", str(video)]).stdout)
    audio_frames = audio_probe.get("frames", [])
    expected_sample = 0
    audio_errors = []
    for number, item in enumerate(audio_frames):
        error = float(item["best_effort_timestamp_time"]) - expected_sample/RATE
        if abs(error) > .000001:
            audio_errors.append({"frame": number, "error_seconds": error})
        expected_sample += int(item["nb_samples"])
    check("every_audio_frame_presentation_timestamp", bool(audio_frames) and not audio_errors,
          {"decoded_audio_frames": len(audio_frames), "decoded_samples": expected_sample,
           "duration_seconds": expected_sample/RATE, "errors": audio_errors[:20]})

    old_cues = {c["id"]: c for c in original_timeline["dialogue"]}
    cues = timeline["dialogue"]
    check("story_dialogue_and_speaker_inventory_unchanged", len(cues) == 12 and all(c["id"] in old_cues and c["speaker"] == old_cues[c["id"]]["speaker"] and c["text"] == old_cues[c["id"]]["text"] for c in cues),
          [{"id": c["id"], "speaker": c["speaker"], "text": c["text"]} for c in cues])

    untouched = []
    for cue in cues:
        if cue["speaker"] == "robot":
            continue
        paths = [Path(cue["file"]), Path(cue["file"]).with_suffix(".json")]
        for relative in paths:
            untouched.append({"path": str(relative), "same_bytes": (ROOT/relative).read_bytes() == (ORIGINAL/relative).read_bytes(),
                              "sha256": sha(ROOT/relative)})
    check("all_nonrobot_raw_takes_and_manifests_unchanged", len(untouched) == 14 and all(p["same_bytes"] for p in untouched), untouched)
    check("nonrobot_dialogue_timing_and_voices_unchanged", all(all(c[k] == old_cues[c["id"]][k] for k in ("start", "end", "voice", "speed")) for c in cues if c["speaker"] != "robot"), "Seven original nonrobot performances retained at the approved cue times.")

    spec = importlib.util.spec_from_file_location("glass_production_verify", ROOT / "tools/verify.py")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    delivered = helper.decode_audio(video)
    mix = helper.decode_audio(ROOT / "audio/mix.wav")
    dialogue, dialogue_rate = sf.read(ROOT / "audio/dialogue.wav", dtype="float32", always_2d=True)
    check("dialogue_stem_spec", dialogue_rate == RATE and len(dialogue) == RATE*64, {"rate": dialogue_rate, "samples": len(dialogue)})
    robot_measures = []
    for cue in cues:
        if cue["speaker"] != "robot":
            continue
        take, rate = sf.read(ROOT / cue["file"], dtype="float32")
        original_take, original_rate = sf.read(ORIGINAL / old_cues[cue["id"]]["file"], dtype="float32")
        new_activity, old_activity = activity(take, rate), activity(original_take, original_rate)
        new_f0, old_f0 = f0_measure(take, rate), f0_measure(original_take, original_rate)
        measured = helper.aligned_segment(mix, delivered, cue["start"], cue["end"])
        start_sample = round(cue["start"] * RATE)
        resampled = resample_poly(take, RATE, rate).astype(np.float64)
        stem_segment = dialogue[start_sample:start_sample+len(resampled)].mean(axis=1).astype(np.float64)
        raw_stem_corr = float(np.corrcoef(resampled, stem_segment)[0, 1]) if len(stem_segment) == len(resampled) else None
        stem_activity = activity(stem_segment, RATE)
        source_length_error = abs((cue["end"]-cue["start"]) - len(take)/rate)
        envelope = cue.get("mouth_envelope", [])
        measure = {"id": cue["id"], "voice": cue["voice"], "previous_voice": old_cues[cue["id"]]["voice"],
                   "source_file": cue["file"], "source_sha256": sha(ROOT/cue["file"]),
                   "scheduled_start": cue["start"], "scheduled_end": cue["end"],
                   "source_samples": len(take), "source_sample_rate": rate,
                   "source_length_error_seconds": source_length_error,
                   "source_peak": float(np.max(np.abs(take))), "source_activity": new_activity,
                   "original_activity": old_activity, "stem_activity": stem_activity,
                   "raw_to_dialogue_stem_correlation": raw_stem_corr,
                   "new_pitch": new_f0, "old_pitch": old_f0, "whole_cue_aac_alignment": measured,
                   "has_active_mouth_envelope": any(e.get("value", 0) > .05 for e in envelope)}
        robot_measures.append(measure)
    check("five_robot_whole_takes_retained_in_dialogue_stem", len(robot_measures) == 5 and all(m["source_length_error_seconds"] < .000002 and m["raw_to_dialogue_stem_correlation"] is not None and m["raw_to_dialogue_stem_correlation"] >= .985 and m["source_peak"] < .999 and m["has_active_mouth_envelope"] for m in robot_measures), robot_measures)
    check("every_robot_whole_cue_has_no_encoded_audio_lag", len(robot_measures) == 5 and all(m["whole_cue_aac_alignment"].get("available") and abs(m["whole_cue_aac_alignment"]["lag_ms"]) <= 1 and m["whole_cue_aac_alignment"]["correlation"] >= .98 for m in robot_measures),
          {"method": "Complete scheduled cue cross-correlation: lossless mix versus final AAC, ±120ms search.", "cues": [m["whole_cue_aac_alignment"] | {"id": m["id"]} for m in robot_measures]})
    pitch_ratios = [m["new_pitch"]["median_hz"] / m["old_pitch"]["median_hz"] for m in robot_measures if m["new_pitch"]["median_hz"] and m["old_pitch"]["median_hz"]]
    check("robot_measured_higher_pitch", len(pitch_ratios) == 5 and float(np.median(pitch_ratios)) >= 1.12,
          {"per_line_ratios": pitch_ratios, "median_ratio": float(np.median(pitch_ratios)) if pitch_ratios else None,
           "method": "Independent voiced autocorrelation on actual old/new PCM takes; pitch alone does not prove expressive or clear speech."})
    new_active = sum(m["source_activity"].get("active_seconds", 0) for m in robot_measures)
    old_active = sum(m["original_activity"].get("active_seconds", 0) for m in robot_measures)
    check("robot_measured_quicker_delivery", new_active > 0 and old_active > 0 and new_active < old_active,
          {"new_active_seconds": new_active, "old_active_seconds": old_active, "active_duration_ratio": new_active/old_active if old_active else None,
           "method": "Total 10ms activity on the same five written lines; excludes quiet sentence gaps and does not measure recognized words."})

    original_bonks = [e for e in original_timeline["events"] if e["id"] in ("bonk-1", "bonk-2", "bonk-3", "distant-bonk")]
    revised_bonks = [e for e in timeline["events"] if e["id"] in ("bonk-1", "bonk-2", "bonk-3", "distant-bonk")]
    check("all_four_bonk_timing_and_silence_holds_preserved", revised_bonks == original_bonks and timeline["silences"] == original_timeline["silences"], {"bonks": revised_bonks, "silences": timeline["silences"]})
    old_effects, old_effects_rate = sf.read(ORIGINAL/"audio/effects.wav", dtype="float32", always_2d=True)
    new_effects, new_effects_rate = sf.read(ROOT/"audio/effects.wav", dtype="float32", always_2d=True)
    impact_waveforms = []
    for event in revised_bonks:
        a, b = round(event["start"]*RATE), round(event["end"]*RATE)
        before, after = old_effects[a:b].ravel(), new_effects[a:b].ravel()
        impact_waveforms.append({"id": event["id"], "correlation": float(np.corrcoef(before, after)[0,1]),
                                 "samples": b-a, "peak_ratio": float(np.max(np.abs(after))/np.max(np.abs(before)))})
    check("all_four_bonk_waveforms_preserved", old_effects_rate == new_effects_rate == RATE and len(impact_waveforms) == 4 and all(m["correlation"] >= .985 for m in impact_waveforms),
          {"method": "Same source impact windows, normalized waveform correlation. Overall mix gain may change.", "impacts": impact_waveforms})
    event_names = [e["id"] for e in timeline["events"]]
    check("old_owner_button_tap_audio_replaced", "owner-tablet-tap" not in event_names and "owner-revoke-slider" in event_names, event_names)

    # Frozen audio/stage-specific schemas are validated below when supplied.
    validate_voice_revision(check, timeline, delivered)
    validate_final_capture(check, timeline, video)
    validate_graphics(check, video, timeline)
    check("human_listening_and_comedy_review", None, "Not performed by this script. User listening approval is required; numerical checks are not an intelligibility judgment.")
    report["summary"] = {state: sum(c["status"] == state for c in report["checks"]) for state in ("pass", "fail", "not_performed")}
    out = Path(args.output)
    if not out.is_absolute():
        out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2)+"\n")
    print(f"{out}: {report['summary']}")
    for c in report["checks"]:
        if c["status"] != "pass":
            print(c["status"].upper(), c["name"])
    return int(report["summary"]["fail"] > 0)


def validate_voice_revision(check, timeline, delivered):
    path = ROOT / "audio/VOICE-REVISION.json"
    if not path.is_file():
        check("sentence_boundary_assembly", False, "audio/VOICE-REVISION.json is missing.")
        return
    check("voice_revision_manifest_present", True, {"path": str(path.relative_to(ROOT)), "sha256": sha(path)})
    manifest = read_json(path)
    known_models = {
        "kokoro-v1.0.onnx": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
        "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
        "kokoro-v1.0-duration.onnx": "1eb3dd7b15a3ce59eee74c8057492f1e95bbd6f236a61c0b1ae8b617a95e67d6"}
    model_checks = [{"model": name, "expected": expected,
                     "actual": sha(Path("/workspace/media-tools/models")/name),
                     "manifest": manifest.get("model_hashes", {}).get(name)}
                    for name,expected in known_models.items()]
    check("local_voice_model_checksums", all(m["expected"] == m["actual"] == m["manifest"] for m in model_checks), model_checks)
    takes = manifest.get("robot_takes", [])
    provenance = [{"id": item.get("id"), "file": item.get("file"),
                   "declared_sha256": item.get("sha256"),
                   "actual_sha256": sha(ROOT/item["file"])} for item in takes]
    check("voice_revision_manifest_matches_actual_takes", manifest.get("approved_original_commit") == BASELINE and len(provenance) == 5 and all(p["declared_sha256"] == p["actual_sha256"] for p in provenance), provenance)
    line = next((item for item in takes if item.get("id") == "05"), None)
    assembly = line.get("assembly") if line else None
    if not assembly:
        check("line05_complete_sentence_boundary_assembly", False, "No explicit line05 assembly record.")
        return
    unpaced, source_rate = sf.read(ROOT/assembly["source_file"], dtype="float32")
    paced, rate = sf.read(ROOT/line["file"], dtype="float32")
    cut, amount = int(assembly["source_insert_sample"]), int(assembly["inserted_silence_samples"])
    valid_indices = 0 <= cut <= len(unpaced) and amount >= 0
    reconstructed = np.concatenate([unpaced[:cut], np.zeros(amount, dtype=unpaced.dtype), unpaced[cut:]]) if valid_indices else np.array([])
    same_pcm = bool(np.array_equal(reconstructed, paced))
    check("line05_complete_sentence_boundary_assembly", same_pcm and source_rate == rate == assembly["sample_rate"] and len(unpaced) == assembly["source_samples"] and sha(ROOT/assembly["source_file"]) == assembly["source_sha256"] and assembly.get("speech_samples_removed") == 0,
          {"source": assembly["source_file"], "source_sha256": sha(ROOT/assembly["source_file"]),
           "source_samples": len(unpaced), "insert_sample": cut, "inserted_zero_samples": amount,
           "paced_samples": len(paced), "reconstruction_bit_identical_pcm": same_pcm,
           "method": "All original PCM samples, plus only declared zero insertion, reconstruct the final full take exactly."})
    take_activity = activity(paced, rate)
    cut_seconds = cut/rate
    containing = [q for q in take_activity.get("quiet_runs_at_least_30ms", [])
                  if q["start_seconds"] <= cut_seconds < q["end_seconds"]]
    gap = containing[0] if containing else None
    cue = next(c for c in timeline["dialogue"] if c["id"] == "05")
    declared_gap = cue.get("sentence_gap_seconds")
    check("line05_measured_sentence_separation", gap is not None and .32 <= gap["seconds"] <= .36 and declared_gap is not None and abs(float(declared_gap)-gap["seconds"]) <= .011,
          {"measured_gap": gap, "timeline_sentence_gap_seconds": declared_gap,
           "assembly_gap_seconds": assembly.get("measured_sentence_gap_seconds"),
           "method": "10ms RMS quiet run containing the insertion point; the boundary is acoustic, not recognized word alignment."})
    if gap:
        first = round((cue["start"]+gap["start_seconds"]+.035)*RATE)
        last = round((cue["start"]+gap["end_seconds"]-.035)*RATE)
        quiet_pcm = delivered[first:last]
        quiet_rms = float(np.sqrt(np.mean(quiet_pcm.astype(np.float64)**2))) if len(quiet_pcm) else math.inf
        quiet_db = 20*math.log10(quiet_rms) if quiet_rms > 0 else None
        check("line05_sentence_gap_survives_final_aac", bool(len(quiet_pcm)) and (quiet_db is None or quiet_db < -48),
              {"final_audio_interval": [first/RATE, last/RATE], "rms_dbfs": quiet_db,
               "aac_boundary_inset_seconds": .035, "note": "Confirms an audible-level quiet boundary survives encoding; listener intelligibility is unverified."})


def validate_final_capture(check, timeline, video):
    path = ROOT / "source/CAPTURE-final.json"
    if not path.is_file():
        check("native_final_capture_matches_current_sources", False, "source/CAPTURE-final.json is missing.")
        return
    capture = read_json(path)
    expected = {"stage_sha256": sha(ROOT/"tools/stage.js"), "timeline_sha256": sha(ROOT/"TIMELINE.json"),
                "graphics_sha256": sha(ROOT/"GRAPHICS.json"),
                "picture_sha256": sha(ROOT/"source/picture-final.mp4")}
    check("native_final_capture_matches_current_sources", capture.get("frames") == 1920 and capture.get("fps") == 30 and capture.get("width") == 1920 and capture.get("height") == 1080 and not capture.get("page_errors") and all(capture.get(k) == v for k,v in expected.items()),
          {"actual": {k:capture.get(k) for k in (*expected, "frames", "fps", "width", "height", "page_errors")}, "expected": expected})
    samples = capture.get("telemetry", [])
    shared = [s for s in samples if 30.4 <= s.get("time", -1) < 30.6]
    carried = [s for s in samples if 7 <= s.get("time", -1) < 30.4]
    owned = [s for s in samples if 30.6 <= s.get("time", -1) < 33.5]
    check("controller_robot_to_owner_handoff_geometry", bool(shared) and bool(carried) and bool(owned) and
          all(s.get("controllerOwnership") == "shared" and s.get("controllerHandoffContact") is True and s.get("robotGripError", 1) < .03 and s.get("ownerGripError", 1) < .03 for s in shared) and
          all(s.get("controllerOwnership") == "robot" and s.get("robotGripError", 1) < .03 for s in carried) and
          all(s.get("controllerOwnership") == "owner" and s.get("ownerGripError", 1) < .03 for s in owned),
          {"method": "Native-capture world geometry at each telemetry sample; rendered-frame handoff readability is reviewed separately.",
           "robot_carried_samples": len(carried), "owner_held_samples": len(owned),
           "shared_contact_samples": [{k:s.get(k) for k in ("frame", "time", "controllerOwnership", "robotGripError", "ownerGripError", "controllerPosition")} for s in shared],
           "maximum_robot_grip_error": max((s.get("robotGripError", 1) for s in carried), default=None),
           "maximum_owner_grip_error": max((s.get("ownerGripError", 1) for s in owned), default=None)})
    pulling = [s for s in samples if 30.75 <= s.get("time", -1) <= 31.0]
    first_revoked = next((s for s in samples if s.get("ownerRevoked")), None)
    check("owner_revocation_follows_controller_receipt_and_slider", bool(pulling) and first_revoked is not None and
          all(s.get("controllerOwnership") == "owner" and s.get("ownerSliderContact", 1) < .03 for s in pulling) and
          first_revoked.get("controllerOwnership") == "owner" and first_revoked.get("ownerSliderPull", 0) >= .999 and
          first_revoked.get("revocationCause") == "owner physical slider pull" and abs(first_revoked["time"]-31) < .051 and
          all(s.get("buttonPush") is False for s in samples),
          {"pull_samples": [{k:s.get(k) for k in ("frame", "time", "ownerSliderPull", "ownerSliderAction", "ownerSliderContact", "controllerOwnership")} for s in pulling],
           "first_revocation": first_revoked, "old_button_push_samples": sum(s.get("buttonPush") is True for s in samples),
           "note": "The recipient uses the supplied controller later, after receipt. OpenLine revokes door authorization; the glass supplies physical containment."})
    denied = [s for s in samples if 35 <= s.get("time", -1) <= 45.5]
    positions = np.asarray([s.get("margaretPosition", [0,0,0]) for s in denied], dtype=float)
    check("revoked_margaret_remains_mobile_and_contained_by_glass", bool(denied) and
          all(s.get("ownerRevoked") is True and s.get("doorRefused") is True and s.get("margaretMobile") is True and
              s.get("margaretPosition", [0,0,0])[2] < s.get("glassPlaneZ", -1.5) for s in denied) and
          float(np.ptp(positions[:,2])) > .2,
          {"samples": len(denied), "z_range": [float(positions[:,2].min()), float(positions[:,2].max())] if len(positions) else None,
           "glass_plane_z": sorted(set(s.get("glassPlaneZ") for s in denied)),
           "limitation": "Telemetry checks position and persistent motion; it does not simulate breakable glass or establish every rendered contact."})


def validate_graphics(check, video, timeline):
    path = ROOT / "GRAPHICS.json"
    if not path.is_file():
        check("key_phrase_graphics_in_encoded_frames", False, "GRAPHICS.json is missing.")
        return
    data = read_json(path)
    measures = []
    for item in data.get("items", []):
        at = (float(item["start"])+float(item["end"]))/2
        frame = rgb_frame(video, at)
        x, y, width, height = [round(v) for v in item["rect"]]
        crop = frame[y:y+height, x:x+width]
        if crop.shape[:2] != (height, width):
            measures.append({"id": item["id"], "valid_rect": False})
            continue
        luma = crop.astype(float) @ np.array([.2126, .7152, .0722])
        measures.append({"id": item["id"], "decoded_frame_time": at, "lines": item["lines"],
                         "rect": item["rect"], "valid_rect": True,
                         "light_pixel_fraction": float(np.mean(luma > 180)),
                         "dark_pixel_fraction": float(np.mean(luma < 120)),
                         "luminance_span_0_5_99_5": float(np.percentile(luma,99.5)-np.percentile(luma,.5)),
                         "font_sizes": item["font_sizes"]})
    check("key_phrase_graphics_in_encoded_frames", data.get("native_size") == [1920,1080] and len(measures) >= 2 and all(m.get("valid_rect") and m["light_pixel_fraction"] > .4 and m["dark_pixel_fraction"] > .006 and m["luminance_span_0_5_99_5"] > 75 for m in measures),
          {"method": "Actual final MP4 midpoint frames decoded; expected light plaque and contrasting typography in declared rectangles. This is pixel support, not OCR or readability certification.", "graphics": measures})


if __name__ == "__main__":
    sys.exit(main())
