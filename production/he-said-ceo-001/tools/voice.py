"""One full-script local neural narration with source phoneme alignment.

Run from /workspace/media-tools so the phonemizer's cache stays out of the
checkout. The original checksum-verified model weights are unchanged: a local
ONNX derivative exposes an already-computed duration tensor as a second output.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import soundfile as sf
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
    return hashlib.sha256(path.read_bytes()).hexdigest()


def duration_model():
    assert sha(MODEL) == MODEL_SHA
    assert sha(VOICES) == VOICES_SHA
    model = onnx.load(MODEL)
    assert DURATION_TENSOR in {out for node in model.graph.node for out in node.output}
    model.graph.node.append(onnx.helper.make_node(
        'Identity', [DURATION_TENSOR], ['duration'],
        name='production_duration_observation'))
    model.graph.output.append(onnx.helper.make_tensor_value_info(
        'duration', onnx.TensorProto.INT64, [1, 'token_count']))
    onnx.checker.check_model(model)
    serialized = model.SerializeToString()
    if not DERIVED.exists() or DERIVED.read_bytes() != serialized:
        DERIVED.write_bytes(serialized)
    return sha(DERIVED)


def bounded_session(*args, **kwargs):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    kwargs['sess_options'] = options
    return ORIGINAL_SESSION(*args, **kwargs)


ORIGINAL_SESSION = ort.InferenceSession
ort.InferenceSession = bounded_session


def pace_refusals(audio, rate, timings, known, config, model):
    """Lengthen only existing quiet intervals; retain every speech sample."""
    phrase_edges, cursor = {}, 0
    for phrase in config['phrases']:
        phonemes = model.tokenizer.known(' '.join(
            model.tokenizer.phonemize(phrase['text'], config['lang']).split()))
        index = known.find(phonemes, cursor)
        assert index >= cursor
        phrase_edges[phrase['id']] = (index, index + len(phonemes))
        cursor = index + len(phonemes)
    frame = max(1, round(.01 * rate))
    quiet = _quiet_frames(audio, frame)
    inserts, reports = [], []
    for target in config.get('refusal_pause_targets', []):
        ending_index = phrase_edges[target['after_phrase']][1] - 1
        marker = timings[ending_index]
        assert marker['phoneme'] in '.?!'
        start, length = _run_around(quiet, round(marker['end'] * rate / frame), 15)
        assert length, ('No existing quiet boundary to pace safely', target['after_phrase'])
        existing = length * frame / rate
        if 'add_silence_seconds' in target:
            added = round(target['add_silence_seconds'] * rate)
            assert added >= 0
            # The new quiet performance starts immediately after the phrase.
            # Keep its caption end outside the inserted silence.
            middle = round(marker['end'] * rate)
            assert start * frame <= middle < (start + length) * frame
            assert quiet[middle // frame], 'Phrase end must already be quiet.'
        else:
            added = max(0, round((target['minimum_quiet_seconds'] - existing) * rate))
            middle = (start + length // 2) * frame
        inserts.append((middle, added))
        reports.append({
            **target, 'original_quiet_seconds':existing,
            'inserted_silence_seconds':added / rate,
            'source_insert_sample_before_pacing':middle,
            'speech_samples_removed':0,
            'method':'Insert zero PCM only inside an existing -40 dB relative-RMS quiet interval.'
        })
    parts, cursor = [], 0
    for middle, added in sorted(inserts):
        assert middle >= cursor
        parts.extend([audio[cursor:middle], np.zeros(added, dtype=audio.dtype)])
        cursor = middle
    parts.append(audio[cursor:])
    paced = np.concatenate(parts) if inserts else audio
    def shifted(seconds, ending=False):
        return seconds + sum(added / rate for middle, added in inserts
                             if (round(seconds * rate) > middle if ending
                                 else round(seconds * rate) >= middle))
    moved = [{**span, 'start':shifted(span['start']), 'end':shifted(span['end'], ending=True)}
             for span in timings]
    shift = 0
    for report in reports:
        middle = report['source_insert_sample_before_pacing'] / rate
        report['film_source_silence_start_seconds'] = middle + shift
        report['film_source_silence_end_seconds'] = middle + shift + report['inserted_silence_seconds']
        shift += report['inserted_silence_seconds']
    return paced, moved, reports


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--metadata-from', type=Path,
                        help='Reuse a completed continuous inference and its phoneme timings; no synthesis.')
    args = parser.parse_args()
    config = json.loads((ROOT / 'NARRATION.json').read_text())
    assert config['continuous'] is True and config['speed'] == 1.0
    assert config['text'] == ' '.join(phrase['text'] for phrase in config['phrases'])
    derived_sha = duration_model()
    model = Kokoro(str(DERIVED), str(VOICES))
    text = config['text']
    phonemes = ' '.join(model.tokenizer.phonemize(text, config['lang']).split())
    known = model.tokenizer.known(phonemes)
    destination = ROOT / config['source_file']
    destination.parent.mkdir(exist_ok=True)
    if args.metadata_from:
        previous = json.loads(args.metadata_from.read_text())
        if 'continuous_take' in previous:
            assert previous['continuous_take']['text'] == text
            raw = previous['unpaced_take']
            raw_file = ROOT / raw['file']
            assert sha(raw_file) == raw['sha256']
            audio, rate = sf.read(raw_file, dtype='float32')
            if 'unpaced_phoneme_timings' in previous:
                timings = previous['unpaced_phoneme_timings']
            else:
                assert not previous['refusal_pause_insertions'], 'Raw timings required before repacing.'
                timings = previous['phoneme_timings']
            assert ''.join(span['phoneme'] for span in timings) == known
            assert abs(len(audio) / rate - raw['seconds']) <= 1 / rate
        else:
            assert previous['text'] == text and previous['known'] == known
            audio, rate = sf.read(destination, dtype='float32')
            assert abs(len(audio) / rate - previous['seconds']) <= 1 / rate, \
                'The reuse input must be the unpaced continuous inference, not an already paced source.'
            timings = previous['timings']
    else:
        audio, rate, spans = model.create_timed(
            text, voice=config['voice'], speed=1.0, lang=config['lang'],
            continuous=True, sentence_pause=config['sentence_pause_seconds'],
            clause_pause=config['clause_pause_seconds'])
        timings = [{'phoneme':span.phoneme, 'start':span.start, 'end':span.end}
                   for span in spans]
    raw_destination = ROOT / 'audio/voice-continuous-unpaced.wav'
    # PCM quantization occurs once before pacing, so removing only the inserted
    # zero intervals reconstructs the raw continuous source sample for sample.
    sf.write(raw_destination, audio, rate, subtype='PCM_24')
    audio, rate = sf.read(raw_destination, dtype='float32')
    raw_audio_sha = sha(raw_destination)
    raw_seconds = len(audio) / rate
    raw_timings = [dict(span) for span in timings]
    audio, timings, refusal_pauses = pace_refusals(audio, rate, timings, known, config, model)
    # Save every speech sample from the full source, with deliberate quiet holds.
    sf.write(destination, audio, rate, subtype='PCM_24')
    assert len(timings) == len(known)
    assert np.isfinite(audio).all() and rate == 24000 and audio.ndim == 1
    seconds = len(audio) / rate
    audio_sha = sha(destination)
    cursor, lines = 0, []
    for phrase in config['phrases']:
        phrase_phonemes = model.tokenizer.known(' '.join(
            model.tokenizer.phonemize(phrase['text'], config['lang']).split()))
        index = known.find(phrase_phonemes, cursor)
        assert index >= cursor, ('Phrase differs from full-script phonemes', phrase['id'])
        until = index + len(phrase_phonemes)
        start = max(0.0, timings[index]['start'])
        end = min(seconds, timings[until - 1]['end'])
        assert end > start
        lines.append({
            **phrase, 'file':config['source_file'], 'sha256':audio_sha,
            'source_start_seconds':start, 'source_end_seconds':end,
            'source_start_sample':round(start * rate),
            'source_end_sample':round(end * rate),
            'seconds':end - start, 'sample_rate':rate,
            'in_frame':config['in_frame'] + round(start * 30),
            'out_frame':config['in_frame'] + math.ceil(end * 30),
            'phoneme_start_index':index, 'phoneme_end_index':until,
            'timing_kind':'model-predicted phoneme alignment'
        })
        cursor = until
        print(phrase['id'], f'{start:.3f}–{end:.3f}', flush=True)
    assert cursor == len(known)
    result = {
        'schema':'openline.film.continuous-voice-source.v1',
        'engine':'kokoro-onnx ' + importlib.metadata.version('kokoro-onnx'),
        'voice':config['voice'], 'speed':1.0,
        'synthesized':True, 'human_recording':False,
        'human_audio_listen':'UNVERIFIED', 'external_api_spend':0,
        'model_sha256':MODEL_SHA, 'voice_file_sha256':VOICES_SHA,
        'derived_duration_model_sha256':derived_sha,
        'duration_model_derivation':{
            'source_model_sha256':MODEL_SHA,
            'observed_existing_tensor':DURATION_TENSOR,
            'added_operation':'Identity to second graph output duration',
            'weights_changed':False,
            'audio_output_computation_changed':False,
            'onnx_version':importlib.metadata.version('onnx'),
            'model_file_not_committed':'Recreated from the verified local original by tools/voice.py'
        },
        'continuous_take':{
            'file':config['source_file'], 'sha256':audio_sha, 'text':text,
            'in_frame':config['in_frame'], 'seconds':seconds,
            'sample_rate':rate, 'samples':len(audio),
            'synthesis_mode':'Full-script continuous synthesis with overlapping phoneme context windows',
            'independent_sentence_takes':False,
            'speech_time_compression':False,
            'speech_truncated':False,
            'separate_line_splicing':False,
            'sentence_pause_seconds':config['sentence_pause_seconds'],
            'clause_pause_seconds':config['clause_pause_seconds'],
            'phoneme_count':len(known)
        },
        'unpaced_synthesis_seconds':raw_seconds,
        'unpaced_existing_source_sha256':raw_audio_sha,
        'unpaced_take':{
            'file':'audio/voice-continuous-unpaced.wav',
            'sha256':raw_audio_sha, 'seconds':raw_seconds,
            'purpose':'Complete natural continuous inference before the three intentional silence holds; no speech samples removed.'
        },
        'refusal_pause_insertions':refusal_pauses,
        'lines':lines,
        'phoneme_timings':timings,
        'unpaced_phoneme_timings':raw_timings
    }
    (ROOT / 'audio/VOICE-SOURCES.json').write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print('CONTINUOUS SOURCE', f'{seconds:.6f}s', audio_sha, flush=True)


if __name__ == '__main__':
    main()
