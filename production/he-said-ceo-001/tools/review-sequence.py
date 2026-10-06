"""Decode chronological review sheets from the completed encoded film.

These samples support producing-agent inspection; they do not claim that every
frame was visually watched or that an agent heard the soundtrack. Full ordinary
playback is verified separately by playback.mjs.
"""
import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
T = json.loads((ROOT / 'TIMELINE.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('edition', choices=['animatic', 'narrated', 'muted'])
parser.add_argument('--file')
args = parser.parse_args()
relative = args.file or ('animatic/he-said-ceo-animatic.mp4' if args.edition == 'animatic'
                         else f'renders/he-said-ceo-{args.edition}.mp4')
source = ROOT / relative
assert source.is_file()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def command(argv):
    return subprocess.run(argv, capture_output=True, check=True).stdout


probe = json.loads(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                            '-show_streams', '-of', 'json', str(source)]))['streams'][0]
assert int(probe['nb_frames']) == T['frames']
assert probe['r_frame_rate'] == f"{T['fps']}/1"
assert abs(float(probe['duration']) - T['seconds']) < .002
assert probe['width'] / probe['height'] == 16 / 9
one_second = [round(second * T['fps']) for second in range(math.ceil(T['seconds']))]
scene = T['physical_scene']
walk_range = scene['walk_frames']
argument_range = [next(s['in_frame'] for s in T['shots'] if s['id'] == 'stop'),
                  scene['end_frame'] - 1]


def quarter_frames(bounds):
    start, stop = bounds
    count = math.floor((stop - start) / (T['fps'] * .25))
    frames = [round(start + index * T['fps'] * .25) for index in range(count + 1)]
    if frames[-1] != stop:
        frames.append(stop)
    return frames


groups = {'one-second': one_second, 'walk-quarter-second': quarter_frames(walk_range),
          'argument-quarter-second': quarter_frames(argument_range)}
requested = sorted(set(frame for group in groups.values() for frame in group))
assert requested[0] == 0 and requested[-1] < T['frames']
expression = '+'.join(f'eq(n\\,{frame})' for frame in requested)
width, height = 640, 360
raw = command(['ffmpeg', '-v', 'error', '-i', str(source), '-an', '-sn',
               '-vf', f'select={expression},scale={width}:{height}',
               '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
frame_bytes = width * height * 3
assert len(raw) == len(requested) * frame_bytes
images, decoded_hashes = {}, {}
for index, frame in enumerate(requested):
    pixels = raw[index * frame_bytes:(index + 1) * frame_bytes]
    images[frame] = Image.frombytes('RGB', (width, height), pixels)
    decoded_hashes[frame] = hashlib.sha256(pixels).hexdigest()
font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', 17)
review = ROOT / 'review'
review.mkdir(exist_ok=True)
outputs = []
for name, frames in groups.items():
    # Chronological full-film sheets use 18 samples each; motion strips remain one sheet.
    per_sheet = 18 if name == 'one-second' else len(frames)
    for batch in range(math.ceil(len(frames) / per_sheet)):
        portion = frames[batch * per_sheet:(batch + 1) * per_sheet]
        columns, tile_width, tile_height = 6, 320, 208
        sheet = Image.new('RGB', (columns * tile_width,
                                  math.ceil(len(portion) / columns) * tile_height),
                          (230, 221, 203))
        draw = ImageDraw.Draw(sheet)
        for index, frame in enumerate(portion):
            x, y = index % columns * tile_width, index // columns * tile_height
            im = images[frame].resize((320, 180), Image.Resampling.LANCZOS)
            sheet.paste(im, (x, y + 28))
            shot = next(s for s in T['shots'] if s['in_frame'] <= frame < s['out_frame'])
            draw.text((x + 6, y + 3), f"{frame / T['fps']:.2f}s  f{frame}  {shot['id']}",
                      font=font, fill=(20, 30, 40))
        output = review / f'sequence-{args.edition}-{name}-{batch}.jpg'
        sheet.save(output, quality=96)
        outputs.append({'file': str(output.relative_to(ROOT)), 'sha256': sha(output),
                        'sample_group': name, 'frames': portion,
                        'sample_seconds': [frame / T['fps'] for frame in portion]})
path = review / 'FULL-SEQUENCE.json'
timeline_sha = sha(ROOT / 'TIMELINE.json')
report = json.loads(path.read_text()) if path.exists() else {}
if report.get('timeline_sha256') != timeline_sha:
    report = {'timeline_sha256': timeline_sha, 'editions': {}}
report['editions'][args.edition] = {
    'file': relative, 'sha256': sha(source), 'frames': T['frames'],
    'seconds': T['seconds'], 'fps': T['fps'], 'native_size': [probe['width'], probe['height']],
    'method': 'Decode completed encoded MP4; select one frame per second over the entire '
              'film plus approximately quarter-second samples of the whole walk and stop/argument '
              'sequence. Actual frame numbers/times are recorded; RGB samples are scaled to '
              '640×360 then arranged chronologically as 320×180 thumbnails.',
    'limitations': 'Frame samples complement full normal-speed playback and separate visual '
                  'inspection. They do not prove subjective editorial quality or audio listening.',
    'requested_unique_frames': len(requested),
    'decoded_sample_size': [width, height],
    'decoded_rgb_sample_sha256': {str(frame): decoded_hashes[frame] for frame in requested},
    'sheets': outputs,
}
path.write_text(json.dumps(report, indent=2) + '\n')
print('FULL SEQUENCE SAMPLES READY', args.edition, len(one_second),
      'chronological seconds;', len(requested), 'unique decoded samples;', len(outputs), 'sheets.')
