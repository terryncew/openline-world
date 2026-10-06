"""Arrange current horizontal browser frames for editorial inspection."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('edition')
parser.add_argument('--device', choices=['phone', 'laptop'], default='phone')
args = parser.parse_args()
timeline = json.loads((ROOT / 'TIMELINE.json').read_text())
shots = timeline['shots']
font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', 18)
columns, tile_width, tile_height = 4, 384, 248
suffix = '' if args.device == 'phone' else '-' + args.device
for batch in range(math.ceil(len(shots) / columns)):
    group = shots[batch * columns:(batch + 1) * columns]
    output = Image.new('RGB', (len(group) * tile_width, tile_height), (230, 221, 203))
    draw = ImageDraw.Draw(output)
    for index, shot in enumerate(group):
        image = Image.open(ROOT / 'review' / ('playback-' + args.edition + suffix)
                           / (shot['id'] + '.png')).convert('RGB')
        image.thumbnail((tile_width - 16, tile_height - 40))
        output.paste(image, (index * tile_width + 8, 32))
        draw.text((index * tile_width + 8, 5), shot['id'], font=font, fill=(20, 30, 40))
    output.save(ROOT / 'review' / f'contact-{args.edition}{suffix}-{batch}.jpg', quality=95)
