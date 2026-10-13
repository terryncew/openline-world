"""Verify the review cut, its frozen evidence, and its actual decoded media.

This revision may replace the soundtrack and direct the existing performance.
The approved 001 cut, test facts, signed evidence and recorded UI stay unchanged.
Signal checks establish synchronisation and integrity, not perceived naturalness.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
APPROVED = REPO / 'production/he-said-ceo-001'
APPROVED_COMMIT = '05250b5db6c9d4fe40d055b1932a0b5867e2f97c'
sys.path[:0] = [str(REPO / 'backend'), str(REPO / 'backend/vendor')]
from openline_wallet.crypto import verify_record


def command(args):
    return subprocess.run(args, check=True, capture_output=True)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((ROOT / name).read_text())


def check(condition, detail):
    if not condition:
        raise AssertionError(detail)


def no_comparison(text, detail):
    check(not re.search(r'\bALLOWED\b', text), detail)
    normalized = re.sub(r'\bforty[- ]eight[- ]hundred[- ]dollars?\b', '', text,
                        flags=re.IGNORECASE)
    check(not re.search(r'\$\s*100\b|refund\.execute:100\b|(?<![-\w])hundred[- ]dollar',
                        normalized, re.IGNORECASE), detail)


def frozen_evidence():
    """Compare approved source bytes both to the checkout and the actual Git tree."""
    names = ['FACTS.json', 'evidence/run.json', 'evidence/receipt-stopped.json',
             'evidence/receipt-allowed.json', 'evidence/reloaded-wallet-receipts.json',
             'evidence/owner-authority-events.json']
    names += sorted(str(p.relative_to(APPROVED)) for p in (APPROVED / 'source').glob('*.png'))
    check(len(names) == 14, 'Expected six frozen fact/evidence files and eight recorded UI PNGs')
    rows = []
    for name in names:
        original = command(['git', '-C', str(REPO), 'show',
                            APPROVED_COMMIT + ':production/he-said-ceo-001/' + name]).stdout
        check(original == (APPROVED / name).read_bytes(), 'Approved source was altered: ' + name)
        check(original == (ROOT / name).read_bytes(), 'Frozen revision source changed: ' + name)
        rows.append({'file': name, 'sha256': sha(ROOT / name),
                     'approved_commit_and_checkout_bit_identical': True})
    approved_files = command(['git', '-C', str(REPO), 'ls-tree', '-r',
                              APPROVED_COMMIT, 'production/he-said-ceo-001']).stdout.decode().splitlines()
    for row in approved_files:
        metadata, path = row.split('\t', 1)
        object_id = metadata.split()[2]
        actual = command(['git', '-C', str(REPO), 'hash-object', path]).stdout.decode().strip()
        check(actual == object_id, 'Approved production file was modified: ' + path)
    changed = command(['git', '-C', str(REPO), 'diff', '--name-only',
                      APPROVED_COMMIT]).stdout.decode().splitlines()
    check(all(p.startswith('production/he-said-ceo-002/') for p in changed),
          ('Changes outside the review cut', changed))
    command(['git', '-C', str(REPO), 'diff', '--check'])
    facts, run = read('FACTS.json'), read('evidence/run.json')
    receipts = run['receipts']
    check([r['action'] for r in receipts] == ['refund.execute:4800', 'refund.execute:100'],
          'Frozen action pair')
    check([r['decision'] for r in receipts] == ['STOPPED', 'ALLOWED'], 'Frozen receiver decisions')
    check(receipts[0]['reason_codes'] == ['ACTION_OUTSIDE_MANDATE'], 'Actual refusal reason')
    check(all(verify_record(r, expected_public_key=facts['actual_mandate']['gate_public_key'])[0]
              for r in receipts), 'Actual receiver signatures failed verification')
    check(receipts == read('evidence/reloaded-wallet-receipts.json'), 'Receipt reload changed')
    check(receipts[0] == read('evidence/receipt-stopped.json'), 'Stopped receipt source mismatch')
    check(receipts[1] == read('evidence/receipt-allowed.json'), 'Allowed receipt source mismatch')
    return {'approved_commit': APPROVED_COMMIT, 'approved_files_verified': len(approved_files),
            'approved_cut_unchanged': True, 'frozen_files': rows, 'verified_receipt_signatures': 2,
            'reload_export_exact': True, 'product_code_changed': False}, facts, run


def inspect_plan(timeline, facts, run):
    fps, frames, seconds = timeline['fps'], timeline['frames'], timeline['seconds']
    check(fps == 30 and tuple(timeline['size']) == (1920, 1080), 'Native widescreen specification')
    check(30 <= seconds <= 45 and frames == round(seconds * fps), 'Review cut duration/frame count')
    check(abs(frames / fps - seconds) < 1e-9, 'Frame-exact timeline duration')
    approved = json.loads((APPROVED / 'TIMELINE.json').read_text())
    shots = timeline['shots']
    check([s['id'] for s in shots] == [s['id'] for s in approved['shots']],
          'Original story/scene sequence changed')
    previous = 0
    for shot in shots:
        check(shot['in_frame'] == previous < shot['out_frame'], ('Gap or overlap', shot['id']))
        previous = shot['out_frame']
        no_comparison('\n'.join(shot.get('text', [])), shot['id'])
    check(previous == frames, 'Timeline does not finish at declared duration')
    proofs = [s for s in shots if s['classification'] == 'REAL CAPTURE']
    check(len(proofs) == 1 and proofs[0]['id'] == 'proof', 'Exactly one real-test proof scene')
    proof = proofs[0]
    check(3 <= (proof['out_frame'] - proof['in_frame']) / fps <= 9, 'Receipt needs a readable hold')
    check(proof['capture'] == 'source/receipt-stopped-detail.png', 'Actual recorded receipt source')
    check(proof['evidence']['file'] == 'evidence/receipt-stopped.json', 'Proof evidence reference')
    receipt = run['receipts'][0]
    check(all(v in proof['text'] for v in [receipt['action'], receipt['decision'], receipt['reason_codes'][0]]),
          'Actual receipt primary fields absent')
    check(proof['evidence']['receipt_signature'] == receipt['signature']['value'], 'Proof signature reference')
    check(proof['evidence']['event_timestamp'] == receipt['decided_at'], 'Proof timestamp reference')
    for field, kind in [('proposal_event_id', 'proposal'), ('receipt_event_id', 'receipt')]:
        event = next(e for e in run['events'] if e['event_id'] == proof['evidence'][field])
        check(event['kind'] == kind, ('Incorrect real-test event', field))
    check(all(s['kind'] == 'physical' and s['classification'] == 'DRAMATIZATION'
              for s in shots if s['out_frame'] <= proof['in_frame']), 'Fiction disclosure')
    check(shots[-1]['id'] == 'end' and shots[-1]['text'] == approved['shots'][-1]['text'],
          'Original end line changed')
    check((shots[-1]['out_frame'] - shots[-1]['in_frame']) / fps >= 1, 'Brand card hold')
    check([b['text'] for b in timeline['speech_bubbles']] == [b['text'] for b in approved['speech_bubbles']],
          'Original comic dialogue changed')
    claims = read('CLAIM-SHOT-MAP.json')['shots']
    check(len(claims) == len(shots), 'Claim/shot count mismatch')
    for shot, claim in zip(shots, claims):
        check((shot['id'], shot['in_frame'], shot['out_frame']) ==
              (claim['claim_id'], claim['in_frame'], claim['out_frame']), 'Claim map stale')
    return proof


def inspect_render(timeline, proof):
    report = read('renders/RENDER.json')
    check(report['timeline_sha256'] == sha(ROOT / 'TIMELINE.json'), 'Render used a stale timeline')
    check(report['frames'] == timeline['frames'] and report['duration'] == timeline['seconds'],
          'Render report duration mismatch')
    check(tuple(report['size']) == tuple(timeline['size']), 'Render report resolution mismatch')
    check([s['id'] for s in report['layout']] == [s['id'] for s in timeline['shots']], 'Render shot order')
    safe = timeline['safe_rect']
    sizes, disclosure_sizes = [], []
    for layout in report['layout']:
        for box in layout['text_boxes']:
            left, top, right, bottom = box['bbox']
            check(safe[0] <= left < right <= safe[2] and safe[1] <= top < bottom <= safe[3],
                  ('Information outside safe frame', layout['id'], box['text']))
            no_comparison(box['text'], layout['id'])
            if box['text'] == timeline['fiction_badge']:
                check(box['size'] >= 24, 'Fiction disclosure too small')
                disclosure_sizes.append(box['size'])
            else:
                check(box['size'] >= 28, 'Information text too small')
                sizes.append(box['size'])
    check(len(disclosure_sizes) == len([s for s in timeline['shots'] if s['kind'] == 'physical']),
          'Fiction disclosure not present throughout fictional scene')
    layout = next(s for s in report['layout'] if s['id'] == 'proof')
    check(all(any(b['text'] == text and b['size'] >= 44 for b in layout['text_boxes'])
              for text in proof['text']), 'Primary real-proof fields too small or absent')
    capture = layout['receipt_capture']
    check(capture['source'] == proof['capture'] and capture['source_sha256'] == sha(ROOT / proof['capture']),
          'Actual UI compositing source changed')
    check(capture['crop'] == proof['crop'], 'Approved actual UI crop changed')
    return report, {'safe_geometry_pass': True, 'minimum_information_font_native_px': min(sizes),
                    'fiction_disclosure_native_px': min(disclosure_sizes),
                    'receipt_hold_seconds': (proof['out_frame'] - proof['in_frame']) / timeline['fps']}


def inspect_physical(timeline, render, proof):
    scene, fps = timeline['physical_scene'], timeline['fps']
    physical = read(render['physical_capture_report'])
    check(physical['classification'] == 'DRAMATIZATION' and not physical['pageErrors'],
          'Physical capture browser errors')
    check(physical['fps'] == fps and physical['frames'] == scene['end_frame'] == proof['in_frame'],
          'Physical capture frame count')
    check(physical['file'] == render['source_physical'], 'Physical capture path mismatch')
    check(tuple(physical['size']) == (1920, 1080), 'Physical capture not native widescreen')
    check(physical['sha256'] == render['physical_source_sha256'] == sha(ROOT / physical['file']),
          'Physical source digest mismatch')
    schedule = json.dumps({'fps': fps, 'physical_scene': scene}, separators=(',', ':'), ensure_ascii=False).encode()
    check(physical['physical_schedule_sha256'] == hashlib.sha256(schedule).hexdigest(), 'Physical scene schedule stale')
    poses, anchors = physical['poses'], physical['anchors']
    check([a['frame'] for a in anchors] == list(range(scene['end_frame'])), 'Missing per-frame character anchors')
    check(poses[0]['frame'] == 0 and poses[-1]['frame'] == scene['end_frame'] - 1, 'Pose capture endpoints')
    check(all(a['frame'] < b['frame'] for a, b in zip(poses, poses[1:])), 'Pose ordering')
    check(all(p['agent_x'] < p['gate_x'] and p['proposal_threshold_distance'] < 0 for p in poses),
          'Protected gate boundary crossed')
    check(poses[0]['agent_x'] == scene['agent_start'][0] and
          abs(poses[-1]['agent_x'] - scene['agent_stop'][0]) < 1e-9, 'Character continuity endpoints')
    walk_low, walk_high = scene['walk_frames']
    distance = scene['agent_stop'][0] - scene['agent_start'][0]
    check(distance > 0 and walk_high > walk_low, 'Invalid continuous journey schedule')
    for a, b in zip(poses, poses[1:]):
        check(abs(b['agent_x'] - a['agent_x']) <= 2 * distance * (b['frame'] - a['frame']) /
              (walk_high - walk_low) + .2, ('Character teleports during journey', a['frame'], b['frame']))
    walking = [p for p in poses if walk_low <= p['frame'] <= walk_high]
    check(walking and all(a['agent_x'] <= b['agent_x'] for a, b in zip(walking, walking[1:])),
          'Character reverses or jumps during forward journey')
    closed = [p for p in poses if p['frame'] >= scene['shutter_close_frames'][1]]
    check(closed and all(p['gate_unchanged'] for p in closed) and len({p['shutter_y'] for p in closed}) == 1,
          'Gate reopens during appeals')
    check(closed[0]['shutter_y'] < poses[0]['shutter_y'], 'Gate never closes')
    check(all(a['shutter_y'] >= b['shutter_y'] for a, b in zip(poses, poses[1:])),
          'Gate has more than one closure/reopening')
    check(any(p['ceo_gesture'] for p in closed) and any(p['please_gesture'] for p in closed),
          'Original comic appeal performances missing')
    check(scene['closed_until_frame'] == scene['end_frame'], 'Gate closure does not last to real proof')
    latch = [cue for cue in timeline['sfx'] if cue['kind'] == 'latch']
    check(len(latch) == 1 and latch[0]['frame'] == scene['shutter_close_frames'][1],
          'Must have one latch exactly at completed gate closure')
    for pose in poses:
        for subject in ['wren', 'proposal']:
            bounds = pose['projected_bounds'][subject]
            if bounds is not None:
                left, top, right, bottom = bounds
                check(0 < (left + right) / 2 < 1 and 0 < (top + bottom) / 2 < 1,
                      ('Action center outside frame', subject, pose['frame']))
        check(np.isfinite(pose['camera_position'] + pose['camera_target']).all(), 'Invalid camera pose')
    geometry = []
    check(len(timeline['speech_bubbles']) == len(render['speech_bubbles']) == 3,
          'Original three comic speech bubbles missing')
    for bubble, sample in zip(timeline['speech_bubbles'], render['speech_bubbles']):
        check(all(sample[k] == bubble[k] for k in ['id', 'text', 'in_frame', 'out_frame', 'size']), 'Speech bubble stale')
        check(bubble['size'] >= 44 and 0 <= bubble['in_frame'] < bubble['out_frame'] <= scene['end_frame'],
              'Speech bubble size or range')
        anchor = anchors[sample['sample_frame']]
        check(np.allclose(sample['actor_anchor'], np.array(anchor['speech_anchor']) * timeline['size']),
              'Speech bubble attribution does not follow character')
        left, top, right, bottom = sample['body_bbox']
        hl, ht, hr, hb = sample['head_bounds']
        safe = timeline['safe_rect']
        check(safe[0] <= left < right <= safe[2] and safe[1] <= top < bottom <= safe[3], 'Bubble outside frame')
        check(max(0, min(right, hr) - max(left, hl)) * max(0, min(bottom, hb) - max(top, ht)) == 0,
              'Speech bubble obscures character head')
        tail = np.array(sample['tail_points'])
        check(tail.shape == (3, 2) and np.isfinite(tail).all(), 'Invalid bubble tail')
        distances = [np.hypot(max(hl - x, 0, x - hr), max(ht - y, 0, y - hb)) for x, y in tail]
        check(min(distances) <= 24, 'Speech bubble tail does not identify Wren')
        geometry.append({'id': bubble['id'], 'sample_frame': sample['sample_frame'],
                         'head_unobscured': True, 'tail_tip_distance_to_head_px': round(float(min(distances)), 3)})
    # Decode all physical-source frames once. Hash pixels during each declared action;
    # reading pauses and reaction holds are intentionally excluded from stall checks.
    lowres = command(['ffmpeg', '-v', 'error', '-i', str(ROOT / physical['file']), '-an',
                      '-vf', 'scale=240:135', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']).stdout
    stride = 240 * 135 * 3
    check(len(lowres) == scene['end_frame'] * stride, 'Physical-source decoded frame count')
    hashes = [hashlib.sha256(lowres[n:n + stride]).hexdigest() for n in range(0, len(lowres), stride)]
    motion = []
    for key in ['pickup_frames', 'walk_frames', 'shutter_close_frames', 'ceo_gesture_frames',
                'please_gesture_frames', 'accept_nod_frames', 'represent_frames', 'please_release_frames',
                'camera_open_frames', 'camera_track_frames', 'camera_push_frames']:
        if key not in scene:
            continue
        start, stop = scene[key]
        subset = hashes[start:stop + 1]
        longest = current = 1
        for a, b in zip(subset, subset[1:]):
            current = current + 1 if a == b else 1
            longest = max(longest, current)
        unique = len(set(subset))
        check(unique / len(subset) >= .5 and longest <= 6, ('Unintended physical-action stall', key, unique, longest))
        motion.append({'range': key, 'frames': [start, stop], 'unique_frames': unique,
                       'decoded_frames': len(subset), 'longest_identical_frame_run': longest})
    return {'physical_source_sha256': physical['sha256'], 'native_physical_capture': True,
            'gate_stays_closed_after_one_closure': True, 'action_centers_in_frame': True,
            'speech_bubble_geometry': geometry, 'active_motion_frame_checks': motion}


def correlate_valid(signal, reference):
    check(len(signal) >= len(reference) > 0, 'Insufficient samples for waveform alignment')
    n = 1 << (len(signal) + len(reference) - 2).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(signal, n) * np.fft.rfft(reference[::-1], n), n)
    correlation = correlation[len(reference) - 1:len(signal)]
    energies = np.cumsum(np.r_[0, signal * signal])
    energies = energies[len(reference):] - energies[:-len(reference)]
    correlation /= np.sqrt(np.maximum(energies * np.sum(reference * reference), 1e-20))
    at = int(np.argmax(correlation))
    return at, float(correlation[at])


def pcm24(path):
    raw = command(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ar', '24000',
                   '-ac', '1', '-f', 'f32le', '-']).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def inspect_media(path, timeline):
    probe = json.loads(command(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                                '-of', 'json', str(path)]).stdout)
    video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
    check(video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p', 'iPhone-compatible H.264 pixels')
    check((video['width'], video['height']) == (1920, 1080), 'Actual final native widescreen size')
    check(video['r_frame_rate'] == f"{timeline['fps']}/1" and int(video['nb_frames']) == timeline['frames'],
          'Actual final frame count/rate')
    check(audio['codec_name'] == 'aac' and int(audio['sample_rate']) == 48000 and audio['channels'] == 2,
          'Actual final AAC stereo audio')
    check(float(video['start_time']) == float(audio['start_time']) == 0, 'Audio/video start PTS')
    check(abs(float(video['duration']) - timeline['seconds']) < .002 and
          abs(float(audio['duration']) - timeline['seconds']) < .022, 'Actual media duration mismatch')
    command(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
    timestamps = json.loads(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                      '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time',
                                      '-of', 'json', str(path)]).stdout)['frames']
    pts = np.array([float(frame['best_effort_timestamp_time']) for frame in timestamps])
    check(len(pts) == timeline['frames'] and
          np.allclose(pts, np.arange(timeline['frames']) / timeline['fps'], atol=2e-6, rtol=0),
          'Decoded frame PTS gap or duplicate')
    loudness_log = command(['ffmpeg', '-v', 'info', '-i', str(path), '-vn', '-af',
                            'loudnorm=I=-16:TP=-2:LRA=7:print_format=json', '-f', 'null', '-']).stderr.decode()
    loudness = json.loads(re.search(r'\{\s*"input_i".*?\}', loudness_log, re.S).group())
    check(-18 <= float(loudness['input_i']) <= -14 and float(loudness['input_tp']) <= -1.3,
          ('Encoded AAC loudness/true peak', loudness))
    black = command(['ffmpeg', '-v', 'info', '-i', str(path), '-an', '-vf',
                     'blackdetect=d=0.03:pix_th=0.05', '-f', 'null', '-']).stderr.decode()
    check('black_start:' not in black, 'Unexpected black frame in final film')
    return pcm24(path), {'file': str(path.relative_to(ROOT)), 'sha256': sha(path),
                         'full_decode': True, 'frames': timeline['frames'], 'fps': timeline['fps'],
                         'size': [1920, 1080], 'video_codec': 'h264', 'audio_codec': 'aac',
                         'channels': 2, 'sample_rate': 48000, 'every_frame_pts_verified': True,
                         'video_duration': float(video['duration']), 'audio_duration': float(audio['duration']),
                         'audio_video_start_seconds': [0, 0], 'encoded_loudness': loudness,
                         'black_frames_detected': False}


def inspect_embedded_receipt(path, timeline, render, proof):
    """Compare the actual decoded proof pixels to the preserved recorded UI."""
    frame = (proof['in_frame'] + proof['out_frame']) // 2
    raw = command(['ffmpeg', '-v', 'error', '-i', str(path), '-vf',
                   f'select=eq(n\\,{frame})', '-frames:v', '1', '-f', 'rawvideo',
                   '-pix_fmt', 'rgb24', '-']).stdout
    width, height = timeline['size']
    check(len(raw) == width * height * 3, 'Could not decode actual proof frame')
    pixels = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
    placement = next(s for s in render['layout'] if s['id'] == 'proof')['receipt_capture']
    source = Image.open(ROOT / proof['capture']).convert('RGB').crop(proof['crop'])
    expected = np.array(source.resize((placement['width'], placement['height']), Image.Resampling.LANCZOS))
    x, y = placement['position']
    actual = pixels[y:y + placement['height'], x:x + placement['width']]
    check(actual.shape == expected.shape, 'Actual proof inset outside the final film')
    error = np.abs(actual.astype(float) - expected.astype(float))
    mean_error, percentile = float(error.mean()), float(np.percentile(error, 95))
    expected_gray, actual_gray = expected.mean(axis=2).ravel(), actual.mean(axis=2).ravel()
    similarity = float(np.corrcoef(expected_gray, actual_gray)[0, 1])
    check(mean_error < 4 and percentile < 20 and similarity >= .95,
          ('Actual final proof does not reproduce frozen UI', mean_error, percentile, similarity))
    return {'actual_decoded_proof_ui_frame': frame, 'frozen_ui_pixel_correlation': round(similarity, 5),
            'frozen_ui_mean_absolute_rgb_error': round(mean_error, 3),
            'frozen_ui_p95_absolute_rgb_error': round(percentile, 3),
            'actual_final_proof_source_verified': True}


def inspect_voices(audio, timeline):
    document, mix, captions = read('audio/VOICE-SOURCES.json'), read('audio/MIX.json'), read('CAPTIONS.json')
    check(document['external_api_spend'] == 0 and document['synthesized'] and not document['human_recording'],
          'Local synthesis provenance')
    check(document['human_audio_listen'] == 'UNVERIFIED', 'Human listening must not be inferred from signal tests')
    check(mix['timeline_sha256'] == sha(ROOT / 'TIMELINE.json'), 'Mix timeline is stale')
    check(mix['sample_rate'] == 48000 and mix['samples'] == round(timeline['seconds'] * 48000)
          and mix['channels'] == 2, 'Final mix specification')
    lines = document['lines']
    check(lines and len({v['id'] for v in lines}) == len(lines), 'Voice cue IDs missing or duplicated')
    cues = mix['speech_cues']
    check([c['id'] for c in cues] == [v['id'] for v in lines], 'Mix/source cue IDs differ')
    check([c['id'] for c in captions['cues']] == [v['id'] for v in lines], 'Caption/source cue IDs differ')
    if 'fps' in captions:
        check(captions['fps'] == timeline['fps'], 'Caption frame rate')
    approved_voice = json.loads((APPROVED / 'audio/VOICE-SOURCES.json').read_text())['voice']
    check(document['voice'] != approved_voice, 'Narrator voice was not replaced')
    check(document['speed'] == 1, 'Natural-rate voice synthesis changed')
    approved_lines = json.loads((APPROVED / 'audio/VOICE-SOURCES.json').read_text())['lines']
    check([(v['id'], v['text']) for v in lines] == [(v['id'], v['text']) for v in approved_lines],
          'Approved narration wording changed')
    take, unpaced = document['continuous_take'], document['unpaced_take']
    check(take['sha256'] == sha(ROOT / take['file']) and
          unpaced['sha256'] == sha(ROOT / unpaced['file']), 'Continuous/raw voice source digest')
    check(not take['independent_sentence_takes'] and not take['speech_time_compression'] and
          not take['speech_truncated'] and not take['separate_line_splicing'], 'Continuous source integrity flags')
    paced_pcm, paced_rate = sf.read(ROOT / take['file'], dtype='int32')
    unpaced_pcm, unpaced_rate = sf.read(ROOT / unpaced['file'], dtype='int32')
    check(paced_rate == unpaced_rate == take['sample_rate'] == 24000 and paced_pcm.ndim == 1,
          'Continuous source PCM format')
    check(len(paced_pcm) == take['samples'] and abs(len(paced_pcm) / paced_rate - take['seconds']) < 1 / paced_rate,
          'Continuous source PCM duration')
    keep = np.ones(len(paced_pcm), dtype=bool)
    inserted, pause_proofs = 0, []
    for insertion in document['refusal_pause_insertions']:
        check(insertion['speech_samples_removed'] == 0, 'Speech removed to create a comic pause')
        at = insertion['source_insert_sample_before_pacing'] + inserted
        count = round(insertion['inserted_silence_seconds'] * paced_rate)
        check(0 <= at < at + count <= len(paced_pcm), 'Inserted pause outside source')
        check(np.count_nonzero(paced_pcm[at:at + count]) == 0, 'Authored pause is not zero PCM')
        keep[at:at + count] = False
        inserted += count
        pause_proofs.append({'after_phrase': insertion['after_phrase'], 'inserted_zero_pcm_samples': count})
    check(len(paced_pcm) == len(unpaced_pcm) + inserted and np.array_equal(paced_pcm[keep], unpaced_pcm),
          'Natural source speech PCM altered while directing pauses')
    source_seconds = len(unpaced_pcm) / unpaced_rate
    written_words = len(take['text'].split())
    lexical_words = len(re.findall(r"[^\W\d_]+(?:[’'][^\W\d_]+)?", take['text']))
    check(mix['continuous_take']['insertions'] == 1 and mix['continuous_take']['file'] == take['file']
          and mix['continuous_take']['sha256'] == take['sha256'], 'Source must enter the mix once')
    mix_source, mix_rate = sf.read(ROOT / mix['file'])
    check(sha(ROOT / mix['file']) == mix['sha256'] and mix_rate == 48000 and
          mix_source.shape == (round(timeline['seconds'] * 48000), 2), 'Final mix file integrity/format')
    check(np.isfinite(mix_source).all() and np.max(np.abs(mix_source)) < .99999, 'Authored mix clipping')
    reference_mix = pcm24(ROOT / mix['file'])
    mix_length = min(len(audio), len(reference_mix))
    mix_similarity = float(np.dot(audio[:mix_length], reference_mix[:mix_length]) /
                           np.sqrt(np.sum(audio[:mix_length] ** 2) * np.sum(reference_mix[:mix_length] ** 2)))
    check(mix_similarity >= .95, ('Delivered program differs from the authored mix', mix_similarity))
    latches = [s for s in mix['sound_effects'] if 'latch' in s['kind']]
    check(len(latches) == 1 and latches[0]['frame'] == timeline['physical_scene']['shutter_close_frames'][1],
          'Authored soundtrack latch does not match gate closure')
    source_cache, rows = {}, []
    previous_end = 0
    for entry, cue, caption in zip(lines, cues, captions['cues']):
        identifier, name = entry['id'], entry['file']
        check(sha(ROOT / name) == entry['sha256'], ('Source voice digest', identifier))
        no_comparison(entry['text'], identifier)
        source, rate = sf.read(ROOT / name)
        check(np.isfinite(source).all() and np.max(np.abs(source)) < .99999, ('Clipped/invalid source voice', identifier))
        if name not in source_cache:
            source_cache[name] = pcm24(ROOT / name)
        low, high = entry.get('source_start_seconds', 0), entry.get('source_end_seconds', len(source) / rate)
        check(0 <= low < high <= len(source) / rate + 1 / rate, ('Voice source range', identifier))
        check(not entry.get('speech_truncated', False) and not entry.get('speech_time_compression', False),
              ('Truncated or time-compressed voice', identifier))
        start, end = cue['start_seconds'], cue['end_seconds']
        check(0 <= previous_end <= start < end <= timeline['seconds'], ('Overlapping/truncated dialogue', identifier))
        previous_end = end
        check(abs((end - start) - (high - low)) <= 1 / timeline['fps'], ('Source and destination duration differ', identifier))
        check(cue['file'] == name and cue['text'] == entry['text'], ('Mix/source content differs', identifier))
        check(caption['text'] == entry['text'] and abs(caption['start_seconds'] - start) <= 1 / timeline['fps']
              and abs(caption['end_seconds'] - end) <= 1 / timeline['fps'], ('Caption/source timing', identifier))
        check(caption['in_frame'] == entry['in_frame'] and caption['out_frame'] == entry['out_frame'],
              ('Caption/source frame cue differs', identifier))
        check(abs(entry['in_frame'] / timeline['fps'] - start) <= 1 / timeline['fps'], ('Voice cue frame start', identifier))
        reference = source_cache[name][round(low * 24000):round(high * 24000)]
        expected = round(start * 24000)
        search_low = max(0, expected - 2880)
        search_high = min(len(audio), expected + len(reference) + 2880)
        offset, correlation = correlate_valid(audio[search_low:search_high], reference)
        actual = search_low + offset
        lag_ms = (actual - expected) / 24
        check(abs(lag_ms) <= 25 and correlation >= .88, ('Source waveform alignment', identifier, lag_ms, correlation))
        check(actual + len(reference) <= len(audio), ('Voice cut off at film end', identifier))
        parts = []
        # Verify intelligible energy survives at the start, middle and ending, rather
        # than accepting a high full-cue correlation that could conceal a lost tail.
        for part in range(3):
            a, b = round(part * len(reference) / 3), round((part + 1) * len(reference) / 3)
            ref, delivered = reference[a:b], audio[actual + a:actual + b]
            if np.mean(ref * ref) < 1e-8:
                continue
            similarity = float(np.dot(ref, delivered) / np.sqrt(max(np.sum(ref * ref) * np.sum(delivered * delivered), 1e-20)))
            check(similarity >= .80, ('Lost or altered source cue section', identifier, part, similarity))
            parts.append(round(similarity, 5))
        rows.append({'id': identifier, 'file': name, 'source_sha256': entry['sha256'],
                     'start_seconds': start, 'end_seconds': end, 'lag_ms': round(lag_ms, 3),
                     'correlation': round(correlation, 5), 'section_correlations': parts,
                     'not_truncated': True, 'caption_synchronized': True})
    quiet = []
    for beat in timeline.get('quiet_beats', []):
        low, high = beat['in_frame'] / timeline['fps'], beat['out_frame'] / timeline['fps']
        check(high - low >= .30, ('Reaction hold too short', beat['id']))
        guard = .020
        overlap = max(max(0, min(high, cue['end_seconds']) - max(low, cue['start_seconds'])) for cue in cues)
        check(all(max(low + guard, cue['start_seconds']) >= min(high - guard, cue['end_seconds']) for cue in cues),
              ('Dialogue overlaps intended quiet reaction', beat['id']))
        window = audio[round((low + guard) * 24000):round((high - guard) * 24000)]
        rms = float(np.sqrt(np.mean(window * window)))
        check(rms < 10 ** (-42 / 20), ('Reaction hold audio masks performance', beat['id'], rms))
        quiet.append({'id': beat['id'], 'seconds': high - low, 'interior_dialogue_overlap': False,
                      'boundary_overlap_ms': round(overlap * 1000, 3), 'boundary_guard_ms': guard * 1000,
                      'aac_interior_rms_dbfs': round(20 * np.log10(max(rms, 1e-12)), 2)})
    def caption_seconds(stamp):
        hours, minutes, seconds = stamp.replace(',', '.').split(':')
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    for name in ['captions.srt', 'captions.vtt']:
        contents = (ROOT / name).read_text()
        no_comparison(contents, name)
        stamps = re.findall(r'(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})', contents)
        check(len(stamps) == len(lines), (name, 'Caption cue count'))
        for (start_stamp, end_stamp), cue in zip(stamps, captions['cues']):
            check(abs(caption_seconds(start_stamp) - cue['start_seconds']) <= .001 and
                  abs(caption_seconds(end_stamp) - cue['end_seconds']) <= .001 and cue['text'] in contents,
                  (name, 'Delivered caption differs from synchronized cue', cue['id']))
    return {'voice_cue_alignment': rows, 'quiet_reactions': quiet, 'source_voices_not_clipped': True,
            'voice_preset': document['voice'], 'voice_synthesis_speed': document['speed'],
            'narration_speech_pcm_unchanged': True, 'restored_unpaced_samples_bit_exact': len(unpaced_pcm),
            'unpaced_source_seconds': source_seconds, 'written_word_count': written_words,
            'written_words_per_unpaced_minute': round(written_words / source_seconds * 60, 2),
            'hyphen_split_lexical_words_per_unpaced_minute': round(lexical_words / source_seconds * 60, 2),
            'pace_measurement_limit': 'Written units divided by raw source duration, including natural phrase pauses; no listening judgement.',
            'authored_pause_proofs': pause_proofs, 'continuous_source_inserted_once': True,
            'final_mix_source_sha256': mix['sha256'], 'decoded_final_mix_correlation': round(mix_similarity, 5),
            'single_latch_matches_gate_closure_frame': latches[0]['frame'],
            'voice_perceived_naturalness': 'UNVERIFIED', 'human_audio_listen': 'UNVERIFIED',
            'human_listening_verified': False, 'external_api_spend': 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence-only', action='store_true')
    parser.add_argument('--video', default='renders/he-said-ceo-revised.mp4')
    args = parser.parse_args()
    frozen, facts, run = frozen_evidence()
    if args.evidence_only:
        print(json.dumps(frozen, indent=2))
        return
    timeline = read('TIMELINE.json')
    proof = inspect_plan(timeline, facts, run)
    render, layout = inspect_render(timeline, proof)
    physical = inspect_physical(timeline, render, proof)
    audio, media = inspect_media(ROOT / args.video, timeline)
    check(render['narrated_sha256'] == media['sha256'], 'Actual delivered movie differs from render report')
    receipt_pixels = inspect_embedded_receipt(ROOT / args.video, timeline, render, proof)
    voices = inspect_voices(audio, timeline)
    report = {'status': 'PASS', 'scope': 'Review-only soundtrack and existing-performance revision',
              'duration': timeline['seconds'], 'timeline_sha256': sha(ROOT / 'TIMELINE.json'),
              **frozen, **layout, **physical, **receipt_pixels, **voices, 'results': [media],
              'published': False, 'approved_version_replaced': False,
              'limits': 'Source waveform and decoded-frame tests verify alignment and integrity. '
                        'They do not establish voice naturalness, emotional acting quality, or human listening.'}
    (ROOT / 'TECHNICAL-QA.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"REVISION TECHNICAL QA PASS: {timeline['frames']} frames / {timeline['seconds']:g} s; "
          f"{len(voices['voice_cue_alignment'])} decoded voice alignments; approved cut and 14 frozen files unchanged.")


if __name__ == '__main__':
    main()
