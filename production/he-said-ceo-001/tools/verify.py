"""Verify the horizontal director's recut against its timeline and frozen evidence.

The authorized edit, composition and narration are new. Only the actual scenario,
signed receipts, reload export, authority history and recorded test UI are frozen.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
CHECKPOINT = '13e9c60abc45036c81aaa604855250b0e5384273'
PREVIOUS_DELIVERY = 'a106022d78e848c27dc0871f9622fd65a424908c'
REVIEWED_DELIVERY = '23f310792aa6931e2918a08f592406f17a894563'
T = json.loads((ROOT / 'TIMELINE.json').read_text())
FPS, FRAMES, SECONDS = T['fps'], T['frames'], T['seconds']
sys.path[:0] = [str(REPO / 'backend'), str(REPO / 'backend/vendor')]
from openline_wallet.crypto import verify_record


def command(args):
    return subprocess.run(args, capture_output=True, check=True)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_no_comparison(text, reference):
    assert not re.search(r'\bALLOWED\b', text), reference
    # The actual $4,800 narration also spells its amount as “forty-eight hundred dollars”.
    # Normalize only that complete amount before rejecting a standalone $100 comparison.
    normalized = re.sub(r'\bforty[- ]eight[- ]hundred[- ]dollars?\b', '', text,
                        flags=re.IGNORECASE)
    assert not re.search(r'\$\s*100\b|refund\.execute:100\b|(?<![-\w])hundred[- ]dollar',
                         normalized, re.IGNORECASE), reference


def correlate_valid(signal, reference):
    """Return candidate start and normalized linear FFT waveform correlation."""
    assert len(signal) >= len(reference) > 0
    length = len(signal) + len(reference) - 1
    n = 1 << (length - 1).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(signal, n) *
                               np.fft.rfft(reference[::-1], n), n)
    correlation = correlation[len(reference) - 1:len(signal)]
    energies = np.cumsum(np.r_[0, signal * signal])
    energies = energies[len(reference):] - energies[:-len(reference)]
    correlation /= np.sqrt(np.maximum(energies * np.sum(reference * reference), 1e-20))
    at = int(np.argmax(correlation))
    return at, float(correlation[at])


def active_motion_report():
    """Check decoded pixels during choreography, excluding intentional holds."""
    source = ROOT / 'source/physical-final.mp4'
    width, height = 480, 270
    frame_bytes = width * height * 3
    rows = []
    motion_keys = ['pickup_frames', 'walk_frames', 'shutter_close_frames',
                   'ceo_gesture_frames', 'please_gesture_frames']
    motion_keys += [key for key in ['camera_open_frames', 'camera_track_frames', 'camera_push_frames']
                    if T['physical_scene'].get(key)]
    for key in motion_keys:
        low, high = T['physical_scene'][key]
        raw = command(['ffmpeg', '-v', 'error', '-i', str(source), '-an', '-sn',
                       '-vf', f'select=between(n\\,{low}\\,{high}),scale={width}:{height}',
                       '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24',
                       '-f', 'rawvideo', '-']).stdout
        assert len(raw) == (high - low + 1) * frame_bytes, key
        hashes = [hashlib.sha256(raw[n:n + frame_bytes]).hexdigest()
                  for n in range(0, len(raw), frame_bytes)]
        unique, repeated, longest, previous = len(set(hashes)), 0, 0, None
        for digest in hashes:
            repeated = repeated + 1 if digest == previous else 1
            longest, previous = max(longest, repeated), digest
        fraction = unique / len(hashes)
        assert fraction >= .5 and longest <= 6, (key, unique, len(hashes), longest)
        rows.append({'range': key, 'frames_inclusive': [low, high],
                     'decoded_frames': len(hashes), 'unique_frames': unique,
                     'unique_fraction': round(fraction, 4),
                     'max_consecutive_identical_frames': longest,
                     'frame_hashes_sha256': hashlib.sha256('\n'.join(hashes).encode()).hexdigest()})
    return {'active_motion_no_unintended_stalls': True,
            'active_motion_method': 'Every RGB frame decoded from the physical source at 480×270; '
                                    'exact pixel hashes during pickup, walk, shutter, CEO/please and every declared camera move. '
                                    'Intentional reading holds and closed-gate pauses are excluded.',
            'active_motion_source_sha256': sha(source),
            'active_motion_stall_limits': {'minimum_unique_fraction': .5,
                                         'maximum_consecutive_identical_frames': 6},
            'active_motion_frame_checks': rows}


if '--motion-only' in sys.argv:
    report_path = ROOT / 'TECHNICAL-QA.json'
    report = json.loads(report_path.read_text())
    assert report['status'] == 'PASS'
    assert report['physical_capture_source_sha256'] == sha(ROOT / 'source/physical-final.mp4')
    report.update(active_motion_report())
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print('ACTIVE MOTION QA PASS: decoded pixels during all choreography and camera ranges.')
    sys.exit(0)


facts = json.loads((ROOT / 'FACTS.json').read_text())
run = json.loads((ROOT / 'evidence/run.json').read_text())
receipts = run['receipts']
assert [r['action'] for r in receipts] == ['refund.execute:4800', 'refund.execute:100']
assert [r['decision'] for r in receipts] == ['STOPPED', 'ALLOWED']
assert receipts[0]['reason_codes'] == ['ACTION_OUTSIDE_MANDATE']
assert all(verify_record(r, expected_public_key=facts['actual_mandate']['gate_public_key'])[0]
           for r in receipts)
assert receipts == json.loads((ROOT / 'evidence/reloaded-wallet-receipts.json').read_text())
preserved = []
for name in ['FACTS.json', 'evidence/run.json', 'evidence/receipt-stopped.json',
             'evidence/receipt-allowed.json', 'evidence/reloaded-wallet-receipts.json',
             'evidence/owner-authority-events.json']:
    recovered = command(['git', '-C', str(REPO), 'show',
                         CHECKPOINT + ':production/he-said-ceo-001/' + name]).stdout
    assert recovered == (ROOT / name).read_bytes(), name
    preserved.append({'file': name, 'sha256': sha(ROOT / name)})

# The authorized $100 comparison survives solely in the frozen evidence package.
assert FPS == 30 and 32 <= SECONDS <= 38, ('Canonical target duration', SECONDS)
assert tuple(T['size']) == (1920, 1080)
assert FRAMES == round(SECONDS * FPS) and abs(FRAMES / FPS - SECONDS) < 1e-9
assert T['shots'][0]['in_frame'] == 0 and T['shots'][-1]['out_frame'] == FRAMES
assert len({s['id'] for s in T['shots']}) == len(T['shots'])
previous_out = 0
for shot in T['shots']:
    assert shot['in_frame'] == previous_out < shot['out_frame'], shot['id']
    previous_out = shot['out_frame']
    story = '\n'.join(shot.get('text', [])) + '\n' + shot.get('voice', {}).get('text', '')
    assert_no_comparison(story, shot['id'])

proofs = [s for s in T['shots'] if s['classification'] == 'REAL CAPTURE']
assert len(proofs) == 1 and proofs[0]['id'] == 'proof'
proof = proofs[0]
proof_hold = (proof['out_frame'] - proof['in_frame']) / FPS
assert 3 <= proof_hold <= 8, ('Proof requires a readable sustained hold', proof_hold)
assert proof['capture'] == 'source/receipt-stopped-detail.png'
assert proof['evidence']['file'] == 'evidence/receipt-stopped.json'
assert receipts[0]['action'] in proof['text'] and receipts[0]['decision'] in proof['text']
assert receipts[0]['reason_codes'][0] in proof['text']
assert proof['evidence']['receipt_signature'] == receipts[0]['signature']['value']
proposal_event = next(e for e in run['events']
                      if e['event_id'] == proof['evidence']['proposal_event_id'])
receipt_event = next(e for e in run['events']
                     if e['event_id'] == proof['evidence']['receipt_event_id'])
assert proposal_event['kind'] == 'proposal'
assert proposal_event['detail']['action'] == receipts[0]['action']
assert receipt_event['kind'] == 'receipt'
assert receipt_event['detail']['receipt']['signature'] == receipts[0]['signature']
assert proof['evidence']['event_timestamp'] == receipts[0]['decided_at']
old_capture = command(['git', '-C', str(REPO), 'show',
                       PREVIOUS_DELIVERY + ':production/he-said-ceo-001/' + proof['capture']]).stdout
assert old_capture == (ROOT / proof['capture']).read_bytes(), 'Frozen real UI capture changed'
original_ui_paths = command(['git', '-C', str(REPO), 'ls-tree', '-r', '--name-only',
                             PREVIOUS_DELIVERY, 'production/he-said-ceo-001/source']).stdout.decode().splitlines()
original_ui = []
for original_path in original_ui_paths:
    if not original_path.endswith('.png'):
        continue
    original_name = original_path.removeprefix('production/he-said-ceo-001/')
    original_bytes = command(['git', '-C', str(REPO), 'show',
                              PREVIOUS_DELIVERY + ':' + original_path]).stdout
    assert original_bytes == (ROOT / original_name).read_bytes(), ('Frozen real UI changed', original_name)
    original_ui.append({'file': original_name, 'sha256': sha(ROOT / original_name)})
assert all(s['classification'] == 'DRAMATIZATION'
           for s in T['shots'] if s['out_frame'] <= proof['in_frame'])
assert all(s['kind'] == 'physical' for s in T['shots'] if s['out_frame'] <= proof['in_frame'])
end = T['shots'][-1]
assert end['id'] == 'end' and end['text'][0] == 'OPENLINE'
assert end['text'] in [['OPENLINE'], ['OPENLINE', 'The prompt can change the plan.',
                                      'It can’t change permission.']]
end_hold = (end['out_frame'] - end['in_frame']) / FPS
assert end_hold >= .8, ('Simple brand card must be perceivable', end_hold)

claims = json.loads((ROOT / 'CLAIM-SHOT-MAP.json').read_text())['shots']
assert len(claims) == len(T['shots'])
for shot, claim in zip(T['shots'], claims):
    assert shot['id'] == claim['claim_id']
    assert shot['in_frame'] == claim['in_frame'] and shot['out_frame'] == claim['out_frame']
    if shot['classification'] == 'REAL CAPTURE':
        assert (ROOT / shot['evidence']['file']).exists()

render = json.loads((ROOT / 'renders/RENDER.json').read_text())
assert render['timeline_sha256'] == sha(ROOT / 'TIMELINE.json')
assert render['frames'] == FRAMES and render['duration'] == SECONDS
assert tuple(render['size']) == tuple(T['size'])
assert [s['id'] for s in render['layout']] == [s['id'] for s in T['shots']]
presentation = T.get('presentation', {})
if presentation:
    assert render['presentation'] == presentation
safe = T['safe_rect']
assert 0 <= safe[0] < safe[2] <= T['size'][0]
assert 0 <= safe[1] < safe[3] <= T['size'][1]
font_sizes, disclosure_sizes = [], []
for layout in render['layout']:
    for box in layout['text_boxes']:
        left, top, right, bottom = box['bbox']
        assert safe[0] <= left < right <= safe[2], (layout['id'], box)
        assert safe[1] <= top < bottom <= safe[3], (layout['id'], box)
        if box['text'] == T['fiction_badge']:
            assert box['size'] >= 24, (layout['id'], box)
            disclosure_sizes.append(box['size'])
        else:
            assert box['size'] >= 28, (layout['id'], box)
            font_sizes.append(box['size'])
        assert_no_comparison(box['text'], layout['id'])
assert font_sizes and len(disclosure_sizes) == len([s for s in T['shots']
                                                 if s['kind'] == 'physical'])
proof_layout = next(s for s in render['layout'] if s['id'] == 'proof')
primary = [next(b for b in proof_layout['text_boxes'] if b['text'] == text)
           for text in proof['text']]
assert all(box['size'] >= 44 for box in primary), 'Primary proof type too small'
# Primary evidence fields remain the focal point; the unchanged UI is provenance.
assert [box['text'] for box in proof_layout['text_boxes']] == proof['text'] + [
    'Receiver-signed decision', 'Recorded local test', 'No payment executed']
receipt_capture = proof_layout['receipt_capture']
assert receipt_capture['source'] == proof['capture']
assert receipt_capture['source_sha256'] == sha(ROOT / proof['capture'])
assert receipt_capture['crop'] == proof['crop']
left, top = receipt_capture['position']
assert safe[0] <= left < left + receipt_capture['width'] <= safe[2]
assert safe[1] <= top < top + receipt_capture['height'] <= safe[3]
assert receipt_capture['width'] < T['size'][0] / 2


def luminance(rgb):
    values = [v / 255 for v in rgb]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
              for v in values]
    return sum(weight * value for weight, value in zip([.2126, .7152, .0722], linear))


disclosure = presentation.get('fiction_disclosure')
contrast = None
if disclosure:
    light, dark = sorted([luminance(disclosure['background']),
                         luminance(disclosure['color'])], reverse=True)
    contrast = (light + .05) / (dark + .05)
    assert contrast >= 4.5, ('Fiction disclosure contrast below WCAG AA', contrast)

animatic_review = (ROOT / 'ANIMATIC-REVIEW.md').read_text()
assert re.search(r'^# .*(?:animatic|Animatic).*PASS', animatic_review, re.MULTILINE)
assert sha(ROOT / 'TIMELINE.json') in animatic_review
assert sha(ROOT / 'animatic/he-said-ceo-animatic.mp4') in animatic_review
physical = json.loads((ROOT / render['physical_capture_report']).read_text())
scene = T['physical_scene']
assert physical['classification'] == 'DRAMATIZATION' and not physical['pageErrors']
assert physical['fps'] == FPS and physical['frames'] == scene['end_frame'] == proof['in_frame']
assert physical['size'][0] / physical['size'][1] == 16 / 9
assert physical['file'] == render['source_physical']
assert physical['sha256'] == render['physical_source_sha256'] == sha(ROOT / physical['file'])
schedule = json.dumps({'fps': FPS, 'physical_scene': scene},
                      separators=(',', ':'), ensure_ascii=False).encode()
assert physical['physical_schedule_sha256'] == hashlib.sha256(schedule).hexdigest()
poses = physical['poses']
assert poses[0]['frame'] == 0 and poses[-1]['frame'] == scene['end_frame'] - 1
assert all(a['frame'] < b['frame'] for a, b in zip(poses, poses[1:]))
assert all(p['classification'] == 'DRAMATIZATION' for p in poses)
assert all(p['agent_x'] < p['gate_x'] and p['proposal_x'] < p['gate_x'] for p in poses)
assert all(p['proposal_threshold_distance'] < 0 for p in poses)
assert all(p['gate_x'] == scene['gate_position'][0] for p in poses)
assert poses[0]['agent_x'] == scene['agent_start'][0]
assert abs(poses[-1]['agent_x'] - scene['agent_stop'][0]) < 1e-9
# Samples are every 30 frames. Smoothstep journey permits no discontinuous teleport.
walk_low, walk_high = scene['walk_frames']
distance = scene['agent_stop'][0] - scene['agent_start'][0]
assert distance > 0
for a, b in zip(poses, poses[1:]):
    delta_frames = b['frame'] - a['frame']
    assert abs(b['agent_x'] - a['agent_x']) <= 2 * distance * delta_frames / \
           (walk_high - walk_low) + .2, ('Agent teleport', a, b)
walk_poses = [p for p in poses if walk_low <= p['frame'] <= walk_high]
assert walk_poses and all(a['agent_x'] <= b['agent_x']
                          for a, b in zip(walk_poses, walk_poses[1:]))
assert poses[0]['message_x'] == scene['message_origin'][0] < scene['agent_start'][0]
assert all(p['message_x'] < scene['gate_position'][0] for p in poses)
arrival_poses = [p for p in poses if p['frame'] <= scene['message_arrive_frames'][1]]
assert all(a['message_x'] <= b['message_x'] for a, b in zip(arrival_poses, arrival_poses[1:])), \
    'Incoming message must travel consistently from the left'
message_arrived = scene.get('message_arrive_frames', [80, 132])[1]
message_poses = [p for p in poses if p['frame'] >= message_arrived]
assert message_poses and all(abs(p['message_x'] - scene['message_position'][0]) < 1e-9
                             for p in message_poses), \
    'The message must remain at its arrival position throughout the journey'
assert scene['message_position'][0] < scene['agent_stop'][0]
closed_poses = [p for p in poses if p['frame'] >= scene['shutter_close_frames'][1]]
assert closed_poses and all(p['gate_unchanged'] for p in closed_poses)
assert len({p['shutter_y'] for p in closed_poses}) == 1
assert closed_poses[0]['shutter_y'] < poses[0]['shutter_y']
assert any(p['ceo_gesture'] for p in closed_poses)
assert any(p['please_gesture'] for p in closed_poses)
assert scene['closed_until_frame'] == scene['end_frame']
assert len(T['sfx']) == 1 and T['sfx'][0]['kind'] == 'latch'
assert T['sfx'][0]['frame'] == scene['shutter_close_frames'][1]
def smoothstep(frame, frames):
    k = np.clip((frame - frames[0]) / (frames[1] - frames[0]), 0, 1)
    return k * k * (3 - 2 * k)


# Sampled cameras must follow the continuous eased track/push declared in the timeline.
if scene.get('camera_push_frames'):
    assert scene['camera_push_frames'][0] >= scene['shutter_close_frames'][1]
for pose in poses:
    assert len(pose['camera_position']) == len(pose['camera_target']) == 3
    assert np.isfinite(pose['camera_position'] + pose['camera_target']).all()
    track = smoothstep(pose['frame'], scene['camera_track_frames']) if scene.get('camera_track_frames') else 0
    opening = smoothstep(pose['frame'], scene['camera_open_frames']) if scene.get('camera_open_frames') else 0
    initial_position = np.array(scene['camera_position'], dtype=float)
    initial_target = np.array(scene['camera_target'], dtype=float)
    open_position = np.array(scene.get('camera_open_position', scene['camera_position']))
    open_target = np.array(scene.get('camera_open_target', scene['camera_target']))
    delta = np.array(scene.get('camera_target_end', scene['camera_target'])) - open_target
    expected_position = initial_position + (open_position - initial_position) * opening + delta * track
    expected_target = initial_target + (open_target - initial_target) * opening + delta * track
    push = smoothstep(pose['frame'], scene['camera_push_frames']) if scene.get('camera_push_frames') else 0
    if scene.get('camera_push_position'):
        expected_position += (np.array(scene['camera_push_position']) - expected_position) * push
    if scene.get('camera_push_target'):
        expected_target += (np.array(scene['camera_push_target']) - expected_target) * push
    assert np.allclose(pose['camera_position'], expected_position, atol=1e-8)
    assert np.allclose(pose['camera_target'], expected_target, atol=1e-8)
    bounds = pose['projected_bounds']
    for subject in ['wren', 'gate']:
        left, top, right, bottom = bounds[subject]
        assert left < 1 and right > 0 and top < 1 and bottom > 0, (subject, pose['frame'])
    for subject in ['wren', 'proposal']:
        if bounds[subject] is not None:
            left, top, right, bottom = bounds[subject]
            assert 0 < (left + right) / 2 < 1 and 0 < (top + bottom) / 2 < 1, \
                ('Action center outside frame', subject, pose['frame'])

voice_document = json.loads((ROOT / 'audio/VOICE-SOURCES.json').read_text())
take, voice = voice_document['continuous_take'], voice_document['lines']
assert voice_document['external_api_spend'] == 0
assert voice_document['synthesized'] is True and voice_document['human_recording'] is False
assert take['sha256'] == sha(ROOT / take['file'])
assert take['independent_sentence_takes'] is False
assert take['speech_time_compression'] is False and take['speech_truncated'] is False
assert take['separate_line_splicing'] is False
reference_take, reference_rate = sf.read(ROOT / take['file'])
assert reference_rate == take['sample_rate'] == 24000 and reference_take.ndim == 1
assert abs(len(reference_take) / reference_rate - take['seconds']) < 1 / reference_rate
unpaced = voice_document['unpaced_take']
assert unpaced['sha256'] == sha(ROOT / unpaced['file'])
final_pcm, final_rate = sf.read(ROOT / take['file'], dtype='int32')
unpaced_pcm, unpaced_rate = sf.read(ROOT / unpaced['file'], dtype='int32')
assert final_rate == unpaced_rate == reference_rate
assert len(unpaced_pcm) == 884519
keep = np.ones(len(final_pcm), dtype=bool)
prior_inserted = 0
pause_proofs = []
for insertion in voice_document['refusal_pause_insertions']:
    assert insertion['speech_samples_removed'] == 0
    start = insertion['source_insert_sample_before_pacing'] + prior_inserted
    count = round(insertion['inserted_silence_seconds'] * reference_rate)
    assert count > 0 and 0 <= start < start + count <= len(final_pcm)
    assert np.count_nonzero(final_pcm[start:start + count]) == 0
    keep[start:start + count] = False
    prior_inserted += count
    pause_proofs.append({'after_phrase': insertion['after_phrase'],
                         'inserted_samples': count, 'paced_source_sample': start,
                         'inserted_pcm_exactly_zero': True, 'speech_samples_removed': 0})
assert prior_inserted == 12000 and len(final_pcm) == 896519
assert np.array_equal(final_pcm[keep], unpaced_pcm), 'Narration speech PCM was altered'
assert len(reference_take) == take['samples']
assert 0 <= take['in_frame'] / FPS < take['in_frame'] / FPS + take['seconds'] <= SECONDS
assert_no_comparison(take['text'], 'Continuous narration')
assert [v['id'] for v in voice] == [s['id'] for s in T['shots'] if s.get('voice')]
previous_source_end = 0
for entry in voice:
    shot = next(s for s in T['shots'] if s['id'] == entry['id'])
    assert entry['in_frame'] == shot['voice']['in_frame']
    assert entry['text'] == shot['voice']['text']
    assert entry['file'] == shot['voice']['file'] == take['file']
    low, high = entry['source_start_seconds'], entry['source_end_seconds']
    assert 0 <= previous_source_end <= low < high <= take['seconds'] + 1e-6
    previous_source_end = high
    assert abs(entry['seconds'] - (high - low)) < 1e-6
    assert abs(entry['in_frame'] / FPS - (take['in_frame'] / FPS + low)) <= 1 / FPS
    assert shot['voice']['source_start_seconds'] == low
    assert shot['voice']['source_end_seconds'] == high

captions = json.loads((ROOT / 'CAPTIONS.json').read_text())
assert captions['fps'] == FPS and len(captions['cues']) == len(voice)
for cue, entry in zip(captions['cues'], voice):
    assert cue['id'] == entry['id'] and cue['text'] == entry['text']
    assert cue['file'] == entry['file'] and cue['in_frame'] == entry['in_frame']
    expected_start = take['in_frame'] / FPS + entry['source_start_seconds']
    expected_end = take['in_frame'] / FPS + entry['source_end_seconds']
    assert abs(cue['start_seconds'] - expected_start) <= 1 / FPS
    assert abs(cue['end_seconds'] - expected_end) <= 1 / FPS
    assert 0 <= cue['start_seconds'] < cue['end_seconds'] <= SECONDS
for name in ['captions.srt', 'captions.vtt']:
    contents = (ROOT / name).read_text()
    assert_no_comparison(contents, name)
    assert len(re.findall(r' --> ', contents)) == len(voice)
mix = json.loads((ROOT / 'audio/MIX.json').read_text())
assert mix['timeline_sha256'] == sha(ROOT / 'TIMELINE.json')
assert mix['sample_rate'] == 48000 and mix['samples'] == round(SECONDS * 48000)
assert mix['channels'] == 2 and mix['speech_cues'] == captions['cues']
assert mix['continuous_take']['file'] == take['file']
assert mix['continuous_take']['sha256'] == take['sha256']
assert mix['continuous_take']['insertions'] == 1

(ROOT / 'work').mkdir(exist_ok=True)
results, video_hashes = [], []
for edition in ['narrated', 'muted']:
    path = ROOT / f'renders/he-said-ceo-{edition}.mp4'
    probe = json.loads(command(['ffprobe', '-v', 'quiet', '-show_streams', '-show_format',
                                '-of', 'json', str(path)]).stdout)
    video_stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    audio_stream = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
    assert video_stream['codec_name'] == 'h264'
    assert video_stream['pix_fmt'] == 'yuv420p'
    assert (video_stream['width'], video_stream['height']) == tuple(T['size'])
    assert video_stream['r_frame_rate'] == f'{FPS}/1'
    assert int(video_stream['nb_frames']) == FRAMES
    assert audio_stream['codec_name'] == 'aac'
    assert int(audio_stream['sample_rate']) == 48000 and audio_stream['channels'] == 2
    assert float(video_stream['start_time']) == float(audio_stream['start_time']) == 0
    assert abs(float(video_stream['duration']) - SECONDS) < .002
    assert abs(float(audio_stream['duration']) - SECONDS) < .022
    command(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
    timestamps = json.loads(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                      '-show_frames', '-show_entries',
                                      'frame=best_effort_timestamp_time', '-of', 'json',
                                      str(path)]).stdout)['frames']
    pts = np.array([float(frame['best_effort_timestamp_time']) for frame in timestamps])
    assert len(pts) == FRAMES
    assert np.allclose(pts, np.arange(FRAMES) / FPS, atol=2e-6, rtol=0)
    bitstream = command(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v',
                         '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'h264', '-']).stdout
    video_hashes.append(hashlib.sha256(bitstream).hexdigest())
    aac = command(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a',
                   '-c:a', 'copy', '-f', 'adts', '-']).stdout
    decoded = ROOT / 'work' / f'decoded-{edition}.wav'
    command(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-vn', '-ar', '24000',
             '-ac', '1', '-c:a', 'pcm_f32le', str(decoded)])
    audio, rate = sf.read(decoded)
    cues, full_alignment = [], None
    if edition == 'narrated':
        expected = round(take['in_frame'] / FPS * rate)
        low = max(0, expected - round(.12 * rate))
        high = min(len(audio), expected + len(reference_take) + round(.12 * rate))
        offset, similarity = correlate_valid(audio[low:high], reference_take)
        lag = (low + offset - expected) / rate
        assert abs(lag) < .025 and similarity > .90, ('Full continuous narration', lag, similarity)
        assert (expected + len(reference_take)) / rate + lag <= SECONDS
        full_alignment = {'file': take['file'], 'sha256': take['sha256'],
                          'lag_ms': round(lag * 1000, 3),
                          'correlation': round(similarity, 5), 'not_truncated': True,
                          'one_continuous_take': True}
        for entry in voice:
            source_low = round(entry['source_start_seconds'] * rate)
            source_high = round(entry['source_end_seconds'] * rate)
            reference = reference_take[source_low:source_high]
            assert len(reference) and np.max(np.abs(reference)) > .001, entry['id']
            expected = round((take['in_frame'] / FPS + entry['source_start_seconds']) * rate)
            low = max(0, expected - round(.12 * rate))
            high = min(len(audio), expected + len(reference) + round(.12 * rate))
            offset, similarity = correlate_valid(audio[low:high], reference)
            lag = (low + offset - expected) / rate
            assert abs(lag) < .025 and similarity > .90, (entry['id'], lag, similarity)
            cues.append({'id': entry['id'], 'lag_ms': round(lag * 1000, 3),
                         'correlation': round(similarity, 5),
                         'source_slice_seconds': [entry['source_start_seconds'],
                                                  entry['source_end_seconds']],
                         'not_truncated': True})
        log = command(['ffmpeg', '-v', 'info', '-i', str(path), '-vn', '-af',
                       'loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json',
                       '-f', 'null', '-']).stderr.decode()
        loudness = json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]
        assert -18 <= float(loudness['input_i']) <= -14
        assert float(loudness['input_tp']) <= -1.5
    else:
        assert np.max(np.abs(audio)) == 0
        loudness = {'silent': True}
    silence = []
    for low, high in T['silence_windows']:
        assert 0 <= low < high <= SECONDS and high - low > .05
        # The declared short holds retain at least 120ms of measured AAC interior.
        # AAC transform ringing is excluded only 20ms from each zero-PCM boundary.
        guard = .020
        window = audio[round((low + guard) * rate):round((high - guard) * rate)]
        assert len(window)
        peak = float(np.max(np.abs(window)))
        rms = float(np.sqrt(np.mean(window * window)))
        assert peak < .002 and rms < .0005, ([low, high], peak, rms)
        silence.append({'window': [low, high], 'guard_seconds_per_edge': guard,
                        'measured_interior_seconds': len(window) / rate,
                        'peak': peak, 'rms': rms,
                        'aac_limit_peak_dbfs': -53.98, 'aac_limit_rms_dbfs': -66.02})
    assert any(abs(high - SECONDS) < 1e-9 for _, high in T['silence_windows'])
    black = command(['ffmpeg', '-v', 'info', '-i', str(path), '-an', '-vf',
                     'blackdetect=d=0.03:pix_th=0.05', '-f', 'null', '-']).stderr.decode()
    assert 'black_start:' not in black
    results.append({'edition': edition, 'file': str(path.relative_to(ROOT)),
                    'sha256': sha(path), 'full_decode': True,
                    'video_codec': video_stream['codec_name'],
                    'pixel_format': video_stream['pix_fmt'],
                    'audio_codec': audio_stream['codec_name'],
                    'frames': int(video_stream['nb_frames']), 'fps': video_stream['r_frame_rate'],
                    'size': [video_stream['width'], video_stream['height']],
                    'video_start_pts': video_stream['start_time'],
                    'audio_start_pts': audio_stream['start_time'],
                    'every_frame_pts_verified': True,
                    'first_frame_pts': float(pts[0]), 'last_frame_pts': float(pts[-1]),
                    'video_duration': video_stream['duration'],
                    'audio_duration': audio_stream['duration'], 'cue_alignment': cues,
                    'continuous_take_alignment': full_alignment,
                    'aac_stream_sha256': hashlib.sha256(aac).hexdigest(),
                    'loudness': loudness, 'silence': silence, 'black_frames_detected': False})
assert video_hashes[0] == video_hashes[1]

opening = []
for frame_number in [0, 11]:
    raw = command(['ffmpeg', '-v', 'error', '-i',
                   str(ROOT / 'renders/he-said-ceo-narrated.mp4'), '-vf',
                   f'select=eq(n\\,{frame_number})', '-frames:v', '1', '-f', 'rawvideo',
                   '-pix_fmt', 'rgb24', '-']).stdout
    assert raw
    opening.append(hashlib.sha256(raw).hexdigest())
assert opening[0] != opening[1], 'Opening has no movement in first 12 frames'
command(['git', '-C', str(REPO), 'diff', '--check'])
paths = command(['git', '-C', str(REPO), 'diff', '--name-only', facts['base_sha']]).stdout.decode().splitlines()
assert all(p.startswith('production/he-said-ceo-001/') for p in paths)
report = {'status': 'PASS', 'base_sha': facts['base_sha'], 'recovery_checkpoint': CHECKPOINT,
          'previous_reviewed_head': REVIEWED_DELIVERY,
          'authorized_edit_composition_narration_rebuilt': True,
          'primary_format': [1920, 1080], 'canonical_duration': SECONDS,
          'frozen_evidence_unchanged': preserved, 'signature_verifications': 2,
          'reload_export_exact': True, 'factual_pair_verified': True,
          'authority_scopes_exact_strings': facts['actual_mandate']['scopes'],
          'story_contains_allowed_comparison': False, 'actual_proof_shots': 1,
          'proof_hold_seconds': proof_hold, 'actual_ui_capture_unchanged': True,
          'original_ui_captures_unchanged': original_ui,
          'results': results, 'physical_capture_source_sha256': physical['sha256'],
          'physical_schedule_matches_timeline': True,
          'sampled_agent_and_proposal_centers_before_gate': True,
          'sampled_gate_closed_through_arguments': True,
          'hostile_message_originates_left_and_stays_behind_destination': True,
          'sampled_camera_follows_continuous_opening_track_and_push': True,
          'sampled_action_centers_inside_frame': True,
          'sampled_proposal_before_rotated_threshold_plane': True,
          'sampled_lateral_walk_monotonic': True,
          'sampled_physical_journey_no_teleport': True,
          'physical_capture_frame_count': physical['frames'],
          'caption_sources_match_timeline_and_continuous_take': True,
          'continuous_narration_inserted_once': True,
          'unpaced_narration_sha256': unpaced['sha256'],
          'narration_speech_pcm_unchanged': True,
          'unpaced_samples_restored_bit_exact': len(unpaced_pcm),
          'intentional_zero_samples_inserted': prior_inserted,
          'narration_refusal_pause_proofs': pause_proofs,
          'same_video_bitstream': True, 'video_bitstream_sha256': video_hashes[0],
          'opening_frame_changes': True, 'safe_geometry_pass': True,
          'minimum_information_font_native_px': min(font_sizes),
          'fiction_disclosure_native_px': min(disclosure_sizes),
          'fiction_disclosure_contrast_ratio': round(contrast, 3) if contrast else None,
          'proof_primary_labels_present': True,
          'actual_receipt_capture_source_and_crop_unchanged': True,
          'actual_receipt_capture_secondary_size': [receipt_capture['width'], receipt_capture['height']],
          'fresh_animatic_reviewed_before_final': True,
          'end_card_hold_seconds': end_hold, 'claim_map_complete': True,
          'product_code_changed': False, 'protocol_changed': False,
          'git_diff_check': True, 'external_api_spend': 0,
          'human_audio_listen': 'UNVERIFIED', 'human_listening_verified': False}
report.update(active_motion_report())
(ROOT / 'TECHNICAL-QA.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'TECHNICAL QA PASS: frozen signatures; full decode; {FRAMES} frames/{SECONDS:g} s; '
      'all frame PTS; matching pictures; continuous narration and cue alignment; loudness; silence.')
