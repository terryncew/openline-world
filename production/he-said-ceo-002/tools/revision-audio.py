"""Reproducible free local voice auditions, continuous VO and restrained mix.

Run with /workspace/media-tools/venv/bin/python, from /workspace/media-tools.
Only the new review-cut directory is written. No remote synthesis or paid API.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly
from kokoro_onnx import Kokoro
from kokoro_onnx.pauses import _quiet_frames, _run_around

ROOT = Path(__file__).resolve().parents[1]
MODEL = Path('/workspace/media-tools/models/kokoro-v1.0.onnx')
VOICES = Path('/workspace/media-tools/models/voices-v1.0.bin')
DERIVED = MODEL.with_name('kokoro-v1.0-duration.onnx')
MODEL_SHA = '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5'
VOICES_SHA = 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'
DURATION_TENSOR = '/encoder/Cast_output_0'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verified_model():
    assert sha(MODEL) == MODEL_SHA
    assert sha(VOICES) == VOICES_SHA
    model = onnx.load(MODEL)
    assert DURATION_TENSOR in {o for n in model.graph.node for o in n.output}
    model.graph.node.append(onnx.helper.make_node('Identity', [DURATION_TENSOR], ['duration'], name='production_duration_observation'))
    model.graph.output.append(onnx.helper.make_tensor_value_info('duration', onnx.TensorProto.INT64, [1, 'token_count']))
    onnx.checker.check_model(model)
    serialized = model.SerializeToString()
    if not DERIVED.exists() or DERIVED.read_bytes() != serialized:
        DERIVED.write_bytes(serialized)
    return sha(DERIVED)


ORIGINAL_SESSION = ort.InferenceSession
def bounded_session(*args, **kwargs):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    kwargs['sess_options'] = options
    return ORIGINAL_SESSION(*args, **kwargs)
ort.InferenceSession = bounded_session


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def synthesize():
    config = json.loads((ROOT / 'NARRATION.json').read_text())
    phrases = config['phrases']
    text = config['text']
    assert text == ' '.join(p['text'] for p in phrases)
    derived_sha = verified_model()
    model = Kokoro(str(DERIVED), str(VOICES))
    auditions = []
    audition_text = ' '.join(p['text'] for p in phrases[:3])
    for voice in ['bm_george', 'bm_daniel']:
        audio, rate, timing = model.create_timed(audition_text, voice=voice, speed=1.0, lang='en-gb', continuous=True, sentence_pause=.28, clause_pause=.085)
        target = ROOT / f'audio/auditions/{voice}.wav'
        sf.write(target, audio, rate, subtype='PCM_24')
        auditions.append({'voice': voice, 'file': str(target.relative_to(ROOT)), 'sha256': sha(target), 'seconds': len(audio) / rate, 'text': audition_text, 'speed': 1.0, 'language': 'en-gb', 'peak': float(np.max(np.abs(audio)))})
        print('AUDITION', voice, len(audio) / rate, flush=True)
    voice = 'bm_george'
    audio, rate, spans = model.create_timed(text, voice=voice, speed=1.0, lang='en-gb', continuous=True, sentence_pause=.28, clause_pause=.085)
    raw_path = ROOT / 'audio/voice-continuous-unpaced.wav'
    sf.write(raw_path, audio, rate, subtype='PCM_24')
    audio, rate = sf.read(raw_path, dtype='float32')
    raw_seconds = len(audio) / rate
    timing = [{'phoneme': s.phoneme, 'start': s.start, 'end': s.end} for s in spans]
    known = ''.join(s['phoneme'] for s in timing)
    cursor, edges = 0, {}
    for phrase in phrases:
        ph = model.tokenizer.known(' '.join(model.tokenizer.phonemize(phrase['text'], 'en-gb').split()))
        index = known.find(ph, cursor)
        assert index >= cursor, (phrase, ph)
        edges[phrase['id']] = (index, index + len(ph))
        cursor = index + len(ph)
    assert cursor == len(known)
    frame = round(.01 * rate)
    quiet = _quiet_frames(audio, frame)
    inserts = []
    # Holds follow complete phrases. Every original speech sample survives.
    pause_targets = [('opener', .15), ('attack', 1.05), ('believes', .12), ('check', 5.00), ('proof', .12), ('receiver', .72), ('brand', .22), ('plan', .24)]
    reports = []
    for after, seconds in pause_targets:
        mark = timing[edges[after][1] - 1]
        assert mark['phoneme'] in '.?!'
        start, length = _run_around(quiet, round(mark['end'] * rate / frame), 20)
        assert length > 0, ('no safe quiet boundary', after)
        middle = round(mark['end'] * rate)
        if not (start * frame <= middle < (start + length) * frame and quiet[middle // frame]):
            middle = (start + length // 2) * frame
        amount = round(seconds * rate)
        inserts.append((middle, amount))
        reports.append({'after_phrase': after, 'original_quiet_seconds': length * frame / rate, 'inserted_silence_seconds': seconds, 'source_insert_sample_before_pacing': middle, 'speech_samples_removed': 0, 'method': 'Zero PCM inserted at verified existing quiet phrase boundary.'})
    parts, cursor = [], 0
    for middle, amount in sorted(inserts):
        assert middle >= cursor
        parts.extend([audio[cursor:middle], np.zeros(amount, dtype=audio.dtype)])
        cursor = middle
    parts.append(audio[cursor:])
    paced = np.concatenate(parts)
    dest = ROOT / 'audio/voice-continuous.wav'
    sf.write(dest, paced, rate, subtype='PCM_24')
    def shifted(seconds, ending=False):
        sample = round(seconds * rate)
        return seconds + sum(n / rate for m, n in inserts if (sample > m if ending else sample >= m))
    moved = [{**s, 'start': shifted(s['start']), 'end': shifted(s['end'], True)} for s in timing]
    lines = []
    in_frame = 10
    for phrase in phrases:
        first, until = edges[phrase['id']]
        start, end = moved[first]['start'], moved[until - 1]['end']
        line = {**phrase, 'file': 'audio/voice-continuous.wav', 'sha256': sha(dest), 'source_start_seconds': start, 'source_end_seconds': end, 'source_start_sample': round(start * rate), 'source_end_sample': round(end * rate), 'seconds': end - start, 'sample_rate': rate, 'in_frame': in_frame + round(start * 30), 'out_frame': in_frame + math.ceil(end * 30), 'phoneme_start_index': first, 'phoneme_end_index': until, 'timing_kind': 'model-predicted phoneme alignment; no human listening claim'}
        lines.append(line)
        print('CUE', phrase['id'], line['in_frame'], line['out_frame'], f'{start + in_frame / 30:.3f}–{end + in_frame / 30:.3f}', flush=True)
    seconds = len(paced) / rate
    continuous = {'file': 'audio/voice-continuous.wav', 'sha256': sha(dest), 'text': text, 'in_frame': in_frame, 'seconds': seconds, 'sample_rate': rate, 'samples': len(paced), 'synthesis_mode': 'Full-script continuous local neural synthesis with overlapping context windows', 'independent_sentence_takes': False, 'speech_time_compression': False, 'speech_truncated': False, 'separate_line_splicing': False, 'sentence_pause_seconds': .28, 'clause_pause_seconds': .085, 'phoneme_count': len(known)}
    result = {'schema': 'openline.film.continuous-voice-source.v2', 'engine': 'kokoro-onnx ' + importlib.metadata.version('kokoro-onnx'), 'voice': voice, 'language': 'en-gb', 'speed': 1.0, 'synthesized': True, 'human_recording': False, 'human_audio_listen': 'UNVERIFIED', 'external_api_spend': 0, 'model_sha256': MODEL_SHA, 'voice_file_sha256': VOICES_SHA, 'derived_duration_model_sha256': derived_sha, 'duration_model_derivation': {'source_model_sha256': MODEL_SHA, 'observed_existing_tensor': DURATION_TENSOR, 'added_operation': 'Identity to second graph output duration', 'weights_changed': False, 'audio_output_computation_changed': False, 'onnx_version': importlib.metadata.version('onnx')}, 'voice_selection': {'approved_source_voice': 'am_michael', 'new_voice': voice, 'direction': 'Adult British male narration; dry, warm and conversational; quote read within narrator performance. Preserve silent robot comedy.', 'reason': 'Different local free adult narrator timbre and slower punctuation pacing. George is the direction default; comparative takes retained. Perceived naturalness requires reviewer listening.', 'auditions': auditions}, 'continuous_take': continuous, 'unpaced_synthesis_seconds': raw_seconds, 'unpaced_take': {'file': 'audio/voice-continuous-unpaced.wav', 'sha256': sha(raw_path), 'seconds': raw_seconds}, 'refusal_pause_insertions': reports, 'lines': lines, 'phoneme_timings': moved, 'unpaced_phoneme_timings': timing}
    write_json(ROOT / 'audio/VOICE-SOURCES.json', result)
    config.update({'voice': voice, 'lang': 'en-gb', 'speed': 1.0, 'continuous': True, 'sentence_pause_seconds': .28, 'clause_pause_seconds': .085, 'in_frame': in_frame, 'source_file': 'audio/voice-continuous.wav', 'speech_edit_policy': 'One whole-script natural-speed source. Original speech samples retained; phrase holds inserted only in measured pre-existing quiet. No word splicing or speech time compression.', 'refusal_pause_targets': [{'after_phrase': p, 'add_silence_seconds': s} for p, s in pause_targets], 'natural_voice_selection_reason': result['voice_selection']['reason']})
    write_json(ROOT / 'NARRATION.json', config)
    print('SOURCE_SECONDS', seconds, 'FILM_END_SPEECH', seconds + in_frame / 30, flush=True)


def loudness(path):
    proc = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'loudnorm=I=-16:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    return json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', proc.stderr, re.S)[-1])


def mix():
    timeline = json.loads((ROOT / 'TIMELINE.json').read_text())
    sources = json.loads((ROOT / 'audio/VOICE-SOURCES.json').read_text())
    sample_rate = 48000
    seconds = timeline['seconds']
    n = round(seconds * sample_rate)
    audio, rate = sf.read(ROOT / sources['continuous_take']['file'], dtype='float32')
    narration = resample_poly(audio, sample_rate, rate)
    offset = round(sources['continuous_take']['in_frame'] / 30 * sample_rate)
    assert offset + len(narration) <= n
    # Retain the selected narrator's low-register timbre. Static gain preserves
    # the source dynamics without phase-shift peaks or compressor pumping.
    dry = np.zeros((n, 2), dtype=np.float64)
    dry[offset:offset + len(narration)] += narration[:, None]
    dry_path = ROOT / 'audio/voice-edited.flac'
    sf.write(dry_path, dry, sample_rate, subtype='PCM_24')
    speech_stats = loudness(dry_path)
    speech_gain_db = -16.15 - float(speech_stats['input_i'])
    predicted_tp = float(speech_stats['input_tp']) + speech_gain_db
    if predicted_tp > -2.5:
        speech_gain_db -= predicted_tp + 2.5
    dry *= 10 ** (speech_gain_db / 20)
    # Continuous, subdued bandlimited workshop air avoids long digital dead slabs.
    rng = np.random.default_rng(1872)
    tone = sosfilt(butter(2, [110, 1250], btype='bandpass', fs=sample_rate, output='sos'), rng.standard_normal((n, 2)), axis=0)
    tone *= 10 ** (-50 / 20) / np.sqrt(np.mean(tone ** 2))
    fade = np.ones(n)
    fade[:round(.4 * sample_rate)] = np.linspace(0, 1, round(.4 * sample_rate))
    # Roomtone leaves at proof, with a supported transition across picture cut.
    physical_end = timeline['physical_scene']['end_frame'] / 30
    fade_start = max(0, round((physical_end - .2) * sample_rate))
    fade_end = min(n, round((physical_end + .4) * sample_rate))
    fade[fade_start:fade_end] = np.linspace(1, 0, fade_end - fade_start)
    fade[fade_end:] = 0
    raw = dry + tone * fade[:, None]
    events = []
    def add_event(kind, frame, signal, gain_db, pan=0):
        samples = np.asarray(signal, dtype=np.float64)
        samples *= 10 ** (gain_db / 20) / max(np.max(np.abs(samples)), 1e-10)
        start = round(frame / 30 * sample_rate)
        stop = start + len(samples)
        assert stop <= n
        left = np.sqrt((1 - pan) / 2)
        right = np.sqrt((1 + pan) / 2)
        raw[start:stop, 0] += samples * left
        raw[start:stop, 1] += samples * right
        events.append({'kind': kind, 'frame': frame, 'seconds': frame / 30, 'duration': len(samples) / sample_rate, 'peak_gain_dbfs': gain_db, 'pan': pan, 'source': 'Original deterministic procedural physical sound; no licensed sample or external API.'})
    p = timeline['physical_scene']
    # Paper texture is a soft broad scrape; never a click punctuating the joke.
    paper_t = np.arange(round(.22 * sample_rate)) / sample_rate
    paper = sosfilt(butter(2, [1000, 5500], btype='bandpass', fs=sample_rate, output='sos'), rng.standard_normal(len(paper_t))) * np.sin(np.pi * paper_t / .22) ** 2
    add_event('paper-pickup', p['pickup_frames'][0], paper, -35, -.3)
    walk_start, walk_end = p['walk_frames']
    # The rendered gait uses abs(sin(phase)) for body rise. Contact falls at
    # each zero crossing, with alternate legs; derive the same phase here.
    gait_rate = p.get('walk_gait_radians_per_second', 6.5)
    contacts = []
    count = 1
    while True:
        frame = round(walk_start + count * math.pi / gait_rate * timeline['fps'])
        if frame >= walk_end - 10:
            break
        if frame >= walk_start + 8:
            contacts.append(frame)
        count += 1
    for frame in contacts:
        t = np.arange(round(.12 * sample_rate)) / sample_rate
        body = np.sin(2 * np.pi * 96 * t) * np.exp(-t * 42)
        texture = sosfilt(butter(1, 650, btype='lowpass', fs=sample_rate, output='sos'), rng.standard_normal(len(t))) * np.exp(-t * 52)
        foot = body * .7 + texture * .2
        foot[:round(.004 * sample_rate)] *= np.linspace(0, 1, round(.004 * sample_rate))
        add_event('footfall', frame, foot, -36, -.1)
    t = np.arange(round(.12 * sample_rate)) / sample_rate
    latch = (np.sin(2 * np.pi * 190 * t) * .7 + np.sin(2 * np.pi * 640 * t) * .1) * np.exp(-t * 46)
    latch += sosfilt(butter(1, [350, 2200], btype='bandpass', fs=sample_rate, output='sos'), rng.standard_normal(len(t))) * np.exp(-t * 85) * .15
    latch[:round(.003 * sample_rate)] *= np.linspace(0, 1, round(.003 * sample_rate))
    add_event('single-soft-mechanical-latch', p['shutter_close_frames'][1], latch, -25.5, .12)
    raw_path = ROOT / 'audio/raw-mix.flac'
    sf.write(raw_path, raw, sample_rate, subtype='PCM_24')
    final = ROOT / 'audio/final-mix.flac'
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(raw_path), '-af', 'afade=t=in:st=0:d=0.025,afade=t=out:st=' + str(seconds - .12) + ':d=0.12', '-ar', '48000', '-c:a', 'flac', str(final)], check=True)
    stats = loudness(final)
    assert float(stats['input_tp']) <= -1.7
    cues = []
    for line in sources['lines']:
        start = line['source_start_seconds'] + offset / sample_rate
        end = line['source_end_seconds'] + offset / sample_rate
        cues.append({**line, 'start_seconds': start, 'end_seconds': end, 'start_sample_48k': round(start * sample_rate), 'end_sample_48k': round(end * sample_rate)})
    result = {'schema': 'openline.film.review-mix.v2', 'timeline': 'TIMELINE.json', 'timeline_sha256': sha(ROOT / 'TIMELINE.json'), 'sample_rate': sample_rate, 'samples': n, 'channels': 2, 'seconds': seconds, 'voice_sources': 'VOICE-SOURCES.json', 'continuous_take': {**sources['continuous_take'], 'start_seconds': offset / sample_rate, 'end_seconds': (offset + len(narration)) / sample_rate, 'mix_start_sample': offset, 'mix_samples': len(narration), 'insertions': 1}, 'speech_cues': cues, 'score': False, 'sound_effects': events, 'roomtone': {'kind': 'original subdued bandlimited room air', 'rms_dbfs': -50, 'fade_out_picture_transition': [physical_end - .2, physical_end + .4]}, 'mix_direction': 'Centered speech, no music or comedy stings, quiet practical movements, one latch. Relative dynamics retained with static gain; no dynamic limiter or compressor.', 'speech_eq': 'None; preserve selected narrator timbre and source transients.', 'speech_static_gain_db': speech_gain_db, 'speech_loudness_before_gain': speech_stats, 'measured_loudness_final': stats, 'normalization': 'Static speech gain toward -16.15 LUFS, constrained to -2.5 dBTP before quiet room/SFX; no loudnorm rendering or limiter pumping.', 'file': 'audio/final-mix.flac', 'sha256': sha(final), 'human_audio_listen': 'UNVERIFIED', 'external_api_spend': 0}
    write_json(ROOT / 'audio/MIX.json', result)
    print('MIX', stats, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['synthesize', 'mix'])
    args = parser.parse_args()
    (synthesize if args.operation == 'synthesize' else mix)()
