"""Review frames taken from the exported films, never from source mocks."""
from pathlib import Path
import json, subprocess, math
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
edits=json.loads((ROOT/'EDITS.json').read_text())['variants']
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
for name in ['master-90','social-vertical-30']:
    edit=next(e for e in edits if e['name']==name)
    vertical=edit['size'][0]<edit['size'][1]
    w,h,cols=(216,384,6) if vertical else (384,216,3)
    sheet=Image.new('RGB',(cols*w,math.ceil(len(edit['segments'])/cols)*(h+34)), '#f3ead9')
    draw=ImageDraw.Draw(sheet)
    for i,seg in enumerate(edit['segments']):
        t=seg['start']+min(seg['seconds']*.65,2.8)
        frame=ROOT/'work'/f"review-{name}-{seg['id']}.jpg"
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(ROOT/edit['file']),'-frames:v','1','-vf',f'scale={w}:{h}',str(frame)],check=True)
        x=(i%cols)*w; y=(i//cols)*(h+34)
        with Image.open(frame) as im: sheet.paste(im,(x,y))
        draw.text((x+8,y+h+8),f"{t:05.1f}s  {seg['id']}",font=font,fill='#3d3428')
    sheet.save(ROOT/'review'/f'{name}-contact-sheet.jpg',quality=94)
subprocess.run(['ffmpeg','-v','error','-y','-ss','73','-i',str(ROOT/'renders/openline-master-90.mp4'),'-frames:v','1',str(ROOT/'review/poster.jpg')],check=True)
