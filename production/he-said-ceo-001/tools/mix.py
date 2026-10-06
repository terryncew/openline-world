"""Insert the complete continuous narration once; normalize the whole mix.

Phrase captions use source offsets, never separately inserted sentence takes.
"""
import hashlib
import json
import math
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
T = json.loads((ROOT / 'TIMELINE.json').read_text())
VOICE = json.loads((ROOT / 'audio/VOICE-SOURCES.json').read_text())
SR = 48000
FPS = T['fps']
TAKE = VOICE['continuous_take']
MIX = np.zeros(round(T['seconds'] * SR), dtype=np.float64)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def insert(samples, start):
    at = round(start * SR)
    assert 0 <= at and at + len(samples) <= len(MIX), 'Never truncate speech or sound.'
    MIX[at:at + len(samples)] += samples
    return at


source = ROOT / TAKE['file']
assert sha(source) == TAKE['sha256']
audio, rate = sf.read(source, dtype='float64')
assert audio.ndim == 1 and rate == TAKE['sample_rate'] == 24000
assert len(audio) == TAKE['samples']
assert abs(len(audio) / rate - TAKE['seconds']) <= 1 / rate
assert TAKE['in_frame'] == 6
# Ordinary sample-rate conversion preserves the full source duration and every
# original sample at the matching output position. It never speeds speech up.
count = round(len(audio) * SR / rate)
resampled = np.interp(np.arange(count) * rate / SR, np.arange(len(audio)), audio)
assert np.array_equal(resampled[::2], audio)
start = TAKE['in_frame'] / FPS
insert_sample = insert(resampled, start)

entries = []
for line in VOICE['lines']:
    low, high = line['source_start_seconds'], line['source_end_seconds']
    assert line['file'] == TAKE['file'] and 0 <= low < high <= TAKE['seconds']
    cue_start, cue_end = start + low, start + high
    assert 0 <= cue_start < cue_end <= T['seconds']
    entries.append({
        'id':line['id'], 'text':line['text'], 'file':TAKE['file'],
        'source_start_seconds':low, 'source_end_seconds':high,
        'start_seconds':cue_start, 'end_seconds':cue_end,
        'in_frame':line['in_frame'], 'out_frame':math.ceil(cue_end * FPS),
        'start_sample_48k':round(cue_start * SR),
        'end_sample_48k':round(cue_end * SR),
        'timing_kind':'Continuous-source model-predicted phoneme alignment'
    })

assert len(T['sfx']) == 1 and T['sfx'][0]['kind'] == 'latch'
rng = np.random.default_rng(20261006)
cue = T['sfx'][0]
duration = .13
time = np.arange(round(duration * SR)) / SR
latch = (np.sin(2 * np.pi * 164 * time) * np.exp(-time * 55)
         + .32 * rng.normal(size=len(time)) * np.exp(-time * 115)) * cue['gain']
insert(latch, cue['frame'] / FPS)

# A single global pre-gain avoids PCM clipping before final normalization.
raw_peak = float(np.max(np.abs(MIX)))
pre_gain = min(1.0, .95 / max(raw_peak, .0001))
MIX *= pre_gain
silence_checks = []
for low, high in T['silence_windows']:
    lo, hi = round(low * SR), round(high * SR)
    assert 0 <= lo < hi <= len(MIX)
    # Linear rate conversion can touch one edge sample with neighboring sound.
    interior = MIX[lo + 1:hi - 1]
    assert len(interior) and np.count_nonzero(interior) == 0, (low, high)
    silence_checks.append({'window':[low, high], 'raw_pcm_peak':0,
                           'edge_guard_samples':1, 'checked_samples':len(interior)})

(ROOT / 'work').mkdir(exist_ok=True)
raw_path = ROOT / 'work/mix-raw.wav'
sf.write(raw_path, np.stack([MIX, MIX], axis=1), SR, subtype='PCM_24')
first = subprocess.run([
    'ffmpeg', '-v', 'info', '-i', str(raw_path), '-af',
    'loudnorm=I=-16:TP=-2:LRA=8:print_format=json', '-f', 'null', '-'
], capture_output=True, text=True, check=True).stderr
measure = json.JSONDecoder().raw_decode(first[first.rfind('{'):])[0]
normalization = (
    'loudnorm=I=-16:TP=-2:LRA=8:measured_I={input_i}:measured_TP={input_tp}:'
    'measured_LRA={input_lra}:measured_thresh={input_thresh}:'
    'offset={target_offset}:linear=true'
).format(**measure)
final = ROOT / 'audio/final-mix.flac'
subprocess.run([
    'ffmpeg', '-v', 'error', '-y', '-i', str(raw_path), '-af', normalization,
    '-ar', str(SR), '-c:a', 'flac', str(final)
], check=True)
normalized, normalized_rate = sf.read(final)
assert normalized_rate == SR and normalized.shape == (len(MIX), 2)

mix_document = {
    'schema':'openline.film.continuous-mix.v1',
    'timeline':'TIMELINE.json', 'timeline_sha256':sha(ROOT / 'TIMELINE.json'),
    'sample_rate':SR, 'samples':len(MIX), 'channels':2,
    'original_sfx':True, 'sound_effects':T['sfx'], 'score':False,
    'voice_sources':'VOICE-SOURCES.json',
    'continuous_take':{
        'file':TAKE['file'], 'sha256':TAKE['sha256'], 'insertions':1,
        'in_frame':TAKE['in_frame'], 'start_seconds':start,
        'end_seconds':start + TAKE['seconds'],
        'source_seconds':TAKE['seconds'], 'source_sample_rate':rate,
        'source_samples':len(audio), 'mix_start_sample':insert_sample,
        'mix_samples':len(resampled), 'speech_truncated':False,
        'speech_time_compression':False, 'sentence_take_splicing':False
    },
    'raw_global_pre_gain':pre_gain, 'raw_peak_before_pre_gain':raw_peak,
    'normalization':'Whole-program two-pass loudnorm, -16 LUFS / -2 dBTP',
    'loudness_first_pass':measure, 'speech_cues':entries,
    'silence_windows':T['silence_windows'], 'raw_pcm_silence_checks':silence_checks,
    'file':'audio/final-mix.flac', 'sha256':sha(final),
    'human_audio_listen':'UNVERIFIED', 'external_api_spend':0
}
(ROOT / 'audio/MIX.json').write_text(
    json.dumps(mix_document, indent=2, ensure_ascii=False) + '\n')
(ROOT / 'CAPTIONS.json').write_text(json.dumps({
    'source':'One continuous narration + model-predicted source phoneme offsets',
    'fps':FPS, 'continuous_source_file':TAKE['file'],
    'continuous_source_sha256':TAKE['sha256'],
    'visual_policy':'External full-voiceover captions; physical performance carries the scene without burned-in narration.',
    'cues':entries
}, indent=2, ensure_ascii=False) + '\n')


def timestamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


(ROOT / 'captions.srt').write_text('\n\n'.join(
    f"{index + 1}\n{timestamp(entry['start_seconds'])} --> {timestamp(entry['end_seconds'])}\n{entry['text']}"
    for index, entry in enumerate(entries)) + '\n')
(ROOT / 'captions.vtt').write_text('WEBVTT\n\n' + '\n\n'.join(
    f"{timestamp(entry['start_seconds']).replace(',', '.')} --> {timestamp(entry['end_seconds']).replace(',', '.')}\n{entry['text']}"
    for entry in entries) + '\n')
print('Continuous mix and captions generated:', T['seconds'],
      'seconds; one full narration insertion;', len(entries), 'source-timed cues.')
