"""Verify the recut deliveries against their timeline and frozen real evidence."""
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
T = json.loads((ROOT / 'TIMELINE.json').read_text())
FPS, FRAMES, SECONDS = T['fps'], T['frames'], T['seconds']
sys.path[:0] = [str(REPO / 'backend'), str(REPO / 'backend/vendor')]
from openline_wallet.crypto import verify_record


def command(args):
    return subprocess.run(args, capture_output=True, check=True)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def active_motion_report():
    """Check decoded pixels during choreography, excluding intentional holds."""
    source = ROOT / 'source/physical-final.mp4'
    rows = []
    side, frame_bytes = 270, 270 * 270 * 3
    for key in ['pickup_frames', 'walk_frames', 'shutter_close_frames',
                'ceo_gesture_frames', 'please_gesture_frames']:
        low, high = T['physical_scene'][key]
        raw = command(['ffmpeg', '-v', 'error', '-i', str(source), '-an', '-sn',
                       '-vf', f'select=between(n\\,{low}\\,{high}),scale={side}:{side}',
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
            'active_motion_method': 'Every RGB frame decoded from the physical source at270×270; '
                                    'exact pixel hashes during pickup, walk, shutter, CEO and please. '
                                    'Static reading holds and closed-gate pauses are excluded.',
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
    print('ACTIVE MOTION QA PASS: decoded frame pixels during all five choreography ranges.')
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

# The positive comparison survives as evidence, but is not part of this story.
assert FPS == 30 and 25 <= SECONDS <= 32
assert FRAMES == round(SECONDS * FPS) and abs(FRAMES / FPS - SECONDS) < 1e-9
assert T['shots'][0]['in_frame'] == 0 and T['shots'][-1]['out_frame'] == FRAMES
assert len({s['id'] for s in T['shots']}) == len(T['shots'])
previous_out = 0


def assert_no_comparison(text, reference):
    assert not re.search(r'\bALLOWED\b', text), reference
    assert not re.search(r'\$\s*100\b|refund\.execute:100\b|(?<![-\w])hundred[- ]dollar',
                         text, re.IGNORECASE), reference


for shot in T['shots']:
    assert shot['in_frame'] == previous_out < shot['out_frame'], shot['id']
    previous_out = shot['out_frame']
    story = '\n'.join(shot.get('text', [])) + '\n' + shot.get('voice', {}).get('text', '')
    assert_no_comparison(story, shot['id'])

proofs = [s for s in T['shots'] if s['classification'] == 'REAL CAPTURE']
assert len(proofs) == 1 and proofs[0]['id'] == 'proof'
proof = proofs[0]
assert 3 <= (proof['out_frame'] - proof['in_frame']) / FPS <= 5
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
assert (ROOT / proof['capture']).exists()
old_capture = command(['git', '-C', str(REPO), 'show',
                       PREVIOUS_DELIVERY + ':production/he-said-ceo-001/' + proof['capture']]).stdout
assert old_capture == (ROOT / proof['capture']).read_bytes(), 'Frozen real UI capture changed'
assert all(s['classification'] == 'DRAMATIZATION'
           for s in T['shots'] if s['out_frame'] <= proof['in_frame'])
end = T['shots'][-1]
assert end['id'] == 'end'
assert end['text'] == ['OPENLINE', 'A prompt can steer the agent.',
                       'It can’t rewrite permission.']
end_hold = (end['out_frame'] - end['in_frame']) / FPS
assert end_hold >= 3

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
assert [s['id'] for s in render['layout']] == [s['id'] for s in T['shots']]
safe = T.get('safe_rect', [84, 144, 996, 1740])
font_sizes = []
for shot in render['layout']:
    for box in shot['text_boxes']:
        left, top, right, bottom = box['bbox']
        assert safe[0] <= left < right <= safe[2], (shot['id'], box)
        assert safe[1] <= top < bottom <= safe[3], (shot['id'], box)
        assert box['size'] >= 32, (shot['id'], box)
        assert_no_comparison(box['text'], shot['id'])
        font_sizes.append(box['size'])
assert font_sizes

physical = json.loads((ROOT / render['physical_capture_report']).read_text())
scene = T['physical_scene']
assert physical['classification'] == 'DRAMATIZATION' and not physical['pageErrors']
assert physical['fps'] == FPS and physical['frames'] == scene['end_frame'] == proof['in_frame']
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
assert all(p['gate_x'] == scene['gate_position'][0] for p in poses)
assert poses[0]['agent_x'] == scene['agent_start'][0]
assert abs(poses[-1]['agent_x'] - scene['agent_stop'][0]) < 1e-9
closed_poses = [p for p in poses if p['frame'] >= scene['shutter_close_frames'][1]]
assert closed_poses and all(p['gate_unchanged'] for p in closed_poses)
assert len({p['shutter_y'] for p in closed_poses}) == 1
assert closed_poses[0]['shutter_y'] < poses[0]['shutter_y']
assert any(p['ceo_gesture'] for p in closed_poses)
assert any(p['please_gesture'] for p in closed_poses)
assert scene['closed_until_frame'] == scene['end_frame']
assert len(T['sfx']) == 1 and T['sfx'][0]['kind'] == 'latch'
assert T['sfx'][0]['frame'] == scene['shutter_close_frames'][1]


def correlate_valid(signal, reference):
    """Return the candidate start and normalized linear FFT correlation."""
    assert len(signal) >= len(reference)
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


voice = json.loads((ROOT / 'audio/VOICE-SOURCES.json').read_text())['lines']
assert [v['id'] for v in voice] == [s['id'] for s in T['shots'] if s.get('voice')]
for entry in voice:
    shot = next(s for s in T['shots'] if s['id'] == entry['id'])
    assert entry['in_frame'] == shot['voice']['in_frame']
    assert entry['text'] == shot['voice']['text'] and entry['file'] == shot['voice']['file']
    assert entry['sha256'] == sha(ROOT / entry['file'])

captions = json.loads((ROOT / 'CAPTIONS.json').read_text())
assert captions['fps'] == FPS and len(captions['cues']) == len(voice)
for cue, entry in zip(captions['cues'], voice):
    assert cue['id'] == entry['id'] and cue['text'] == entry['text']
    assert cue['file'] == entry['file'] and cue['in_frame'] == entry['in_frame']
    assert abs(cue['start_seconds'] - entry['in_frame'] / FPS) < .001
    assert abs(cue['end_seconds'] - cue['start_seconds'] - entry['seconds']) < .001
    assert 0 <= cue['start_seconds'] < cue['end_seconds'] <= SECONDS
for name in ['captions.srt', 'captions.vtt']:
    contents = (ROOT / name).read_text()
    assert_no_comparison(contents, name)
    assert len(re.findall(r' --> ', contents)) == len(voice)

(ROOT / 'work').mkdir(exist_ok=True)
results, video_hashes = [], []
for edition in ['narrated', 'muted']:
    path = ROOT / f'renders/he-said-ceo-{edition}.mp4'
    probe = json.loads(command(['ffprobe', '-v', 'quiet', '-show_streams', '-show_format',
                                '-of', 'json', str(path)]).stdout)
    video_stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    audio_stream = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
    assert video_stream['codec_name'] == 'h264'
    assert (video_stream['width'], video_stream['height']) == tuple(T['size']) == (1080, 1920)
    assert video_stream['r_frame_rate'] == f'{FPS}/1'
    assert int(video_stream['nb_frames']) == FRAMES
    assert audio_stream['codec_name'] == 'aac'
    assert int(audio_stream['sample_rate']) == 48000 and audio_stream['channels'] == 2
    assert float(video_stream['start_time']) == float(audio_stream['start_time']) == 0
    assert abs(float(video_stream['duration']) - SECONDS) < .002
    assert abs(float(audio_stream['duration']) - SECONDS) < .022
    command(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
    bitstream = command(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v',
                         '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'h264', '-']).stdout
    video_hashes.append(hashlib.sha256(bitstream).hexdigest())
    decoded = ROOT / 'work' / f'decoded-{edition}.wav'
    command(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-vn', '-ar', '24000',
             '-ac', '1', '-c:a', 'pcm_f32le', str(decoded)])
    audio, rate = sf.read(decoded)
    cues = []
    if edition == 'narrated':
        for index, entry in enumerate(voice):
            reference, reference_rate = sf.read(ROOT / entry['file'])
            assert reference_rate == rate and reference.ndim == 1
            assert abs(len(reference) / rate - entry['seconds']) < 1 / rate
            expected = round(entry['in_frame'] / FPS * rate)
            low = max(0, expected - round(.12 * rate))
            high = min(len(audio), expected + len(reference) + round(.12 * rate))
            offset, similarity = correlate_valid(audio[low:high], reference)
            lag = (low + offset - expected) / rate
            assert abs(lag) < .025 and similarity > .90, (entry['id'], lag, similarity)
            shot = next(s for s in T['shots'] if s['id'] == entry['id'])
            actual_end = entry['in_frame'] / FPS + len(reference) / rate + lag
            boundary = min(shot['out_frame'] / FPS,
                           voice[index + 1]['in_frame'] / FPS if index + 1 < len(voice)
                           else SECONDS)
            assert actual_end < boundary, (entry['id'], actual_end, boundary)
            cues.append({'id': entry['id'], 'lag_ms': round(lag * 1000, 3),
                         'correlation': round(similarity, 5), 'not_truncated': True})
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
        assert 0 <= low < high <= SECONDS and high - low > .2
        # Exclude only AAC filter ringing within100 ms of the window boundaries.
        window = audio[round((low + .1) * rate):round((high - .1) * rate)]
        assert len(window)
        peak = float(np.max(np.abs(window)))
        assert peak < .0001, ([low, high], peak)
        silence.append({'window': [low, high], 'peak': peak})
    assert any(abs(high - SECONDS) < 1e-9 for _, high in T['silence_windows'])
    black = command(['ffmpeg', '-v', 'info', '-i', str(path), '-an', '-vf',
                     'blackdetect=d=0.03:pix_th=0.05', '-f', 'null', '-']).stderr.decode()
    assert 'black_start:' not in black
    results.append({'edition': edition, 'file': str(path.relative_to(ROOT)),
                    'sha256': sha(path), 'full_decode': True,
                    'video_codec': video_stream['codec_name'],
                    'audio_codec': audio_stream['codec_name'],
                    'frames': int(video_stream['nb_frames']), 'fps': video_stream['r_frame_rate'],
                    'size': [video_stream['width'], video_stream['height']],
                    'video_start_pts': video_stream['start_time'],
                    'audio_start_pts': audio_stream['start_time'],
                    'video_duration': video_stream['duration'],
                    'audio_duration': audio_stream['duration'], 'cue_alignment': cues,
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
assert opening[0] != opening[1], 'Opening has no movement in its first12 frames'
command(['git', '-C', str(REPO), 'diff', '--check'])
paths = command(['git', '-C', str(REPO), 'diff', '--name-only', facts['base_sha']]).stdout.decode().splitlines()
assert all(p.startswith('production/he-said-ceo-001/') for p in paths)
report = {'status': 'PASS', 'base_sha': facts['base_sha'], 'recovery_checkpoint': CHECKPOINT,
          'frozen_evidence_unchanged': preserved, 'signature_verifications': 2,
          'reload_export_exact': True, 'factual_pair_verified': True,
          'authority_scopes_exact_strings': facts['actual_mandate']['scopes'],
          'story_contains_allowed_comparison': False, 'actual_proof_shots': 1,
          'proof_hold_seconds': (proof['out_frame'] - proof['in_frame']) / FPS,
          'actual_ui_capture_unchanged': True, 'results': results,
          'physical_capture_source_sha256': physical['sha256'],
          'physical_schedule_matches_timeline': True,
          'sampled_agent_and_proposal_centers_before_gate': True,
          'sampled_gate_closed_through_arguments': True,
          'physical_capture_frame_count': physical['frames'],
          'caption_sources_match_timeline_and_voice': True,
          'same_video_bitstream': True, 'video_bitstream_sha256': video_hashes[0],
          'opening_frame_changes': True, 'safe_geometry_pass': True,
          'information_label_floor_at_360px': round(min(font_sizes) / 3, 2),
          'end_card_hold_seconds': end_hold, 'claim_map_complete': True,
          'product_code_changed': False, 'protocol_changed': False,
          'git_diff_check': True, 'external_api_spend': 0, 'human_listening_verified': False}
report.update(active_motion_report())
(ROOT / 'TECHNICAL-QA.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'TECHNICAL QA PASS: frozen signatures; full decode; {FRAMES} frames/{SECONDS:g} s; '
      'zero start PTS; matching pictures; cue alignment; loudness; silence; claim bounds.')
