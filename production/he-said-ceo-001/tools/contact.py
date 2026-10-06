"""Arrange the actual browser playback frames for visual editorial review."""
import argparse
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('edition');a=p.parse_args();import json
t=json.loads((ROOT/'TIMELINE.json').read_text());shots=t['shots'];f=ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',18)
for batch in range(3):
 group=shots[batch*7:(batch+1)*7];out=Image.new('RGB',(7*240,470),(230,221,203));d=ImageDraw.Draw(out)
 for i,s in enumerate(group):
  im=Image.open(ROOT/'review'/('playback-'+a.edition)/(s['id']+'.png')).convert('RGB');im.thumbnail((224,420));out.paste(im,(i*240+8,32));d.text((i*240+8,5),s['id'],font=f,fill=(20,30,40))
 out.save(ROOT/'review'/f'contact-{a.edition}-{batch}.jpg',quality=95)
