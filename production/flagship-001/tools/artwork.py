"""Campaign typography over canon colors; proof card retains actual UI pixels."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'source'
CREAM='#f3ead9';INK='#3d3428';RED='#a13d32';GOLD='#bf963b'
SERIF='/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf'
SANS='/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
MONO='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
def font(path,size):return ImageFont.truetype(path,size)
def center(d,text,y,f,fill=INK,w=1920):
 box=d.textbbox((0,0),text,font=f);d.text(((w-(box[2]-box[0]))/2,y),text,font=f,fill=fill)
def paper(w,h):
 rng=np.random.default_rng(11001);base=np.zeros((h,w,3),dtype=np.int16)+[243,234,217];noise=rng.normal(0,.55,(h,w,1));return Image.fromarray(np.clip(base+noise,0,255).astype(np.uint8))
for vertical in [False,True]:
 w,h=(1080,1920) if vertical else (1920,1080);suffix='-vertical' if vertical else ''
 im=paper(w,h);d=ImageDraw.Draw(im)
 center(d,'OpenLine',670 if vertical else 315,font(SERIF,162 if vertical else 172),w=w)
 y=960 if vertical else 575;d.line((w/2-32,y,w/2+32,y),fill=GOLD,width=3)
 center(d,'The worker can change.',1028 if vertical else 638,font(SANS,49 if vertical else 43),w=w)
 center(d,"Your authority doesn’t.",1114 if vertical else 704,font(SANS,49 if vertical else 43),w=w)
 im.save(OUT/f'end{suffix}.png')
for id,heading,sub in [('developer','Build your next worker','around this boundary.'),('buyer','Put the decision','at the receiver.')]:
 im=paper(1920,1080);d=ImageDraw.Draw(im)
 d.text((180,165),'OPENLINE / '+('BUILD' if id=='developer' else 'RECEIVER AUTHORITY'),font=font(SANS,24),fill=INK)
 d.text((180,322),heading,font=font(SERIF,91),fill=INK);d.text((180,434),sub,font=font(SERIF,91),fill=INK)
 d.line((180,618,244,618),fill=GOLD,width=3)
 if id=='developer':
  d.text((180,684),'Explore the local developer preview.',font=font(SANS,34),fill=INK)
  d.text((180,757),'github.com/terryncew/openline-world',font=font(MONO,32),fill=INK)
  d.text((180,844),'./launch-preview.sh',font=font(MONO,28),fill=INK)
 else:
  d.text((180,685),'Explicit owner grants. Exact-action decisions. Signed receipts.',font=font(SANS,34),fill=INK)
  d.text((180,770),'Demonstrated in the local developer preview.',font=font(SANS,28),fill=INK)
 im.save(OUT/f'{id}.png')
if (OUT/'receipt-ui.png').exists():
 ui=Image.open(OUT/'receipt-ui.png').convert('RGB').crop((550,110,1370,970))
 r=json.loads((ROOT/'evidence/receipt-2.json').read_text())
 im=paper(1920,1080);d=ImageDraw.Draw(im)
 d.text((160,173),'THE ACTUAL RECEIPT',font=font(SANS,26),fill=INK)
 d.text((155,342),r['decision']+'.',font=font(SERIF,105),fill=RED)
 d.text((160,538),r['action'],font=font(MONO,36),fill=INK)
 d.text((160,607),r['reason_codes'][0],font=font(MONO,27),fill=INK)
 d.line((160,694,224,694),fill=GOLD,width=3)
 d.text((160,766),'Recorded local Workshop',font=font(SANS,25),fill=INK)
 d.text((160,810),'Project-notes fixture • signed by the Receiver',font=font(SANS,24),fill=INK)
 ui.thumbnail((805,870));im.paste(ui,(970,(1080-ui.height)//2));im.save(OUT/'receipt-proof.png')
 im=paper(1080,1920);d=ImageDraw.Draw(im)
 center(d,'THE ACTUAL RECEIPT',185,font(SANS,32),w=1080)
 center(d,r['decision']+'.',282,font(SERIF,119),RED,1080)
 center(d,r['reason_codes'][0],487,font(MONO,37),w=1080)
 ui=ui.resize((940,round(ui.height*940/ui.width)),Image.Resampling.LANCZOS);im.paste(ui,(70,690))
 center(d,'Recorded local Workshop',1730,font(SANS,31),w=1080)
 center(d,'Project-notes fixture',1783,font(SANS,28),w=1080)
 im.save(OUT/'receipt-proof-vertical.png')
print('Campaign artwork prepared')
