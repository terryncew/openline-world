#!/usr/bin/env python3
"""Recognize the actual completed native export without a transcript prompt.

Run only after the final mux. This script reads the frozen soundtrack/timeline;
it never synthesizes sound, edits picture, or changes the finished movie.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from pocketsphinx import Decoder
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
MOVIE = ROOT / 'renders/the-glass-wall-revised.mp4'
SOURCE_REPORT = ROOT / 'audio/VOICE-REVISION.json'
OUTPUT = ROOT / 'audio/ENCODED-ASR-QA.json'
RATE = 48000


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def normalized_words(text: str) -> list[str]:
    text = text.lower().replace('openline', 'open line').replace('—', ' ')
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text)


def word_distance(expected: list[str], recognized: list[str]) -> int:
    row = list(range(len(recognized) + 1))
    for i, word in enumerate(expected, 1):
        next_row = [i]
        for j, actual in enumerate(recognized, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1,
                                row[j - 1] + (word != actual)))
        row = next_row
    return row[-1]


def transcribe(waveform: np.ndarray) -> str:
    """Recognizer receives audio only; no expected text, grammar or dictionary."""
    mono = waveform.mean(axis=1)
    mono16 = resample_poly(mono, 16000, RATE)
    pcm = (np.clip(mono16, -1, 1) * 32767).astype(np.int16)
    decoder = Decoder(samprate=16000, loglevel='ERROR')
    decoder.start_utt()
    decoder.process_raw(pcm.tobytes(), False, True)
    decoder.end_utt()
    hypothesis = decoder.hyp()
    return hypothesis.hypstr if hypothesis else ''


def main() -> int:
    if not MOVIE.is_file() or MOVIE.stat().st_size == 0:
        raise SystemExit(f'Completed movie absent: {MOVIE}. No report written.')
    started = time.monotonic()
    movie_sha = sha(MOVIE)
    source = json.loads(SOURCE_REPORT.read_text())
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of',
         'json', str(MOVIE)], capture_output=True, text=True, check=True)
    media = json.loads(probe.stdout)
    video = [s for s in media['streams'] if s['codec_type'] == 'video']
    audio = [s for s in media['streams'] if s['codec_type'] == 'audio']
    if not (len(video) == 1 and len(audio) == 1 and
            video[0].get('width') == 1920 and video[0].get('height') == 1080 and
            video[0].get('codec_name') == 'h264' and
            audio[0].get('codec_name') == 'aac' and
            audio[0].get('channels') == 2 and
            int(audio[0].get('sample_rate', 0)) == RATE and
            abs(float(media['format']['duration']) - 64) < .034):
        raise SystemExit('Input is not the completed 64-second native H.264/AAC '
                         'review export. No report written.')
    decoded = subprocess.run(
        ['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2', '-i',
         str(MOVIE), '-map', '0:a:0', '-vn', '-ac', '2', '-ar', str(RATE),
         '-f', 'f32le', 'pipe:1'], capture_output=True, check=True)
    if decoded.stderr.strip():
        raise SystemExit('AAC decode reported an error. No report written: ' +
                         decoded.stderr.decode(errors='replace'))
    waveform = np.frombuffer(decoded.stdout, dtype='<f4').reshape(-1, 2)
    if not np.isfinite(waveform).all() or abs(len(waveform) / RATE - 64) > .034:
        raise SystemExit('Decoded AAC duration or samples are invalid. '
                         'No report written.')

    comparisons = source['blind_mixed_asr_comparison']
    if [row['id'] for row in comparisons] != ['03', '04', '05', '06', '07']:
        raise SystemExit('Frozen robot comparison inventory differs. '
                         'No report written.')
    rows = []
    for comparison in comparisons:
        start, end = comparison['revised_window']
        first, until = round(start * RATE), round(end * RATE)
        if not 0 <= first < until <= len(waveform):
            raise SystemExit('A frozen speech window exceeds decoded AAC. '
                             'No report written.')
        recognized = transcribe(waveform[first:until])
        # Text enters only the scorer after independent recognition has ended.
        expected = comparison['expected']
        expected_words = normalized_words(expected)
        actual_words = normalized_words(recognized)
        edits = word_distance(expected_words, actual_words)
        source_result = comparison['revised_mix_asr']
        rows.append({
            'id': comparison['id'], 'speaker': 'robot',
            'window_seconds': [start, end], 'start_sample_48k': first,
            'end_sample_48k': until, 'expected': expected,
            'recognized_actual_aac': recognized,
            'word_edit_distance': edits,
            'expected_word_count': len(expected_words),
            'exact_normalized_match': expected_words == actual_words,
            'source_mix_recognized': source_result['recognized'],
            'source_mix_word_edit_distance': source_result['word_edit_distance'],
            'source_to_encoded_error_delta':
                edits - source_result['word_edit_distance'],
            'encoded_words_equal_source_words':
                actual_words == normalized_words(source_result['recognized'])
        })
        print(comparison['id'], recognized, f'word edits={edits}', flush=True)

    if sha(MOVIE) != movie_sha:
        raise SystemExit('Movie changed during recognition. No report written.')
    errors = sum(row['word_edit_distance'] for row in rows)
    count = sum(row['expected_word_count'] for row in rows)
    all_match = all(row['exact_normalized_match'] for row in rows)
    regression = any(row['source_to_encoded_error_delta'] > 0 for row in rows)
    report = {
        'schema': 'openline.film.actual-export-robot-asr.v1',
        'status': 'PASS' if all_match else 'REGRESSION' if regression else 'REVIEW',
        'movie': str(MOVIE.relative_to(ROOT)), 'movie_sha256': movie_sha,
        'movie_bytes': MOVIE.stat().st_size,
        'source_comparison': str(SOURCE_REPORT.relative_to(ROOT)),
        'source_comparison_sha256': sha(SOURCE_REPORT),
        'timeline_sha256': sha(ROOT / 'TIMELINE.json'),
        'tool': 'pocketsphinx==' + importlib.metadata.version('pocketsphinx'),
        'recognizer_model': 'Default unrestricted English acoustic model, '
                            'CMU dictionary and language model from official '
                            'installed PocketSphinx wheel.',
        'decoded_audio': {'sample_rate': RATE, 'channels': 2,
                          'samples_per_channel': len(waveform),
                          'seconds': len(waveform) / RATE},
        'method': 'Decode actual completed AAC to stereo48k floatPCM; use the '
                  'same five frozen mixed-speech windows with100ms lead and '
                  '150ms tail; average channels; resample to16k; recognize '
                  'without expected text, prompt, grammar or new dictionary; '
                  'score the returned transcript afterward.',
        'normalization': 'Lowercase, remove punctuation, tokenize apostrophe '
                         'words; OpenLine normalized as open line for scoring '
                         'only, not supplied to the recognizer.',
        'rows': rows, 'word_count': count, 'word_edit_distance': errors,
        'aggregate_word_error_rate': errors / count,
        'all_five_robot_lines_exact': all_match,
        'source_to_encoded_recognition_regression': regression,
        'wall_seconds': round(time.monotonic() - started, 3),
        'human_listening': 'UNVERIFIED',
        'limitations': 'PocketSphinx is an older statistical recognizer. '
                       'Exact recognition does not prove first-listen clarity, '
                       'expressive delivery, comic timing or mouth alignment. '
                       'A recognition regression is a technical comparison '
                       'warning, not proof of audible mumble. This check covers '
                       'the five robot lines only; codec/synchronization and '
                       'visual checks are separate.',
        'movie_modified': False, 'external_api_spend_usd': 0
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(OUTPUT)
    print(json.dumps({'status': report['status'], 'robot_word_errors': errors,
                      'report': str(OUTPUT.relative_to(ROOT)),
                      'movie_sha256': movie_sha}, indent=2))
    return 0 if all_match else 1


if __name__ == '__main__':
    sys.exit(main())
