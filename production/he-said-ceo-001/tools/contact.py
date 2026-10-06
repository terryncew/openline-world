"""Arrange current browser playback frames for separate editorial inspection."""
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('edition')
args = parser.parse_args()
timeline = json.loads((ROOT / 'TIMELINE.json').read_text())
shots = timeline['shots']
font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', 18)
columns = 7
for batch in range(math.ceil(len(shots) / columns)):
    group = shots[batch * columns:(batch + 1) * columns]
    output = Image.new('RGB', (len(group) * 240, 470), (230, 221, 203))
    draw = ImageDraw.Draw(output)
    for index, shot in enumerate(group):
        image = Image.open(ROOT / 'review' / ('playback-' + args.edition)
                           / (shot['id'] + '.png')).convert('RGB')
        image.thumbnail((224, 420))
        output.paste(image, (index * 240 + 8, 32))
        draw.text((index * 240 + 8, 5), shot['id'], font=font, fill=(20, 30, 40))
    output.save(ROOT / 'review' / f'contact-{args.edition}-{batch}.jpg', quality=95)
