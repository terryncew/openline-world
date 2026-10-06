"""One deterministic type/evidence renderer for animatic and both final editions."""
import argparse,json,subprocess,hashlib,math
from pathlib import Path
from functools import lru_cache
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];T=json.loads((ROOT/'TIMELINE.json').read_text())
CREAM=(243,236,220);INK=(27,42,60);RED=(160,67,46);RULE=(204,191,170)
FONT={'sans':'/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf','bold':'/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf','serif':'/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf','italic':'/usr/share/fonts/truetype/noto/NotoSerifDisplay-Italic.ttf','mono':'/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'}
@lru_cache(None)
def font(name,size):return ImageFont.truetype(FONT[name],size)
rng=np.random.default_rng(93);grain=rng.normal(0,.55,(1920,1080,1));paper=Image.fromarray(np.clip(np.array(CREAM)[None,None,:]+grain,0,255).astype('uint8'))
boxes=[]
def line(im,text,y,size=50,face='sans',color=INK,x=84,align='left',record=True):
 d=ImageDraw.Draw(im);f=font(face,size);b=d.textbbox((0,0),text,font=f);width=d.textlength(text,font=f)
 if align=='center':x=(1080-width)/2
 # y denotes the actual top of the ink, independent of font metrics.
 d.text((x,y-b[1]),text,font=f,fill=color)
 box=[round(x,2),y,round(x+width,2),y+b[3]-b[1]]
 if record:
  assert box[0]>=80 and box[2]<=1000 and box[1]>=144 and box[3]<=1740,(text,box)
  boxes.append({'text':text,'size':size,'face':face,'bbox':box})
 return box[3]
def lines(im,items,y,size,face='serif',color=INK,gap=24,align='left'):
 for text in items:y=line(im,text,y,size,face,color,align=align)+gap
 return y
@lru_cache(None)
def source(name):return Image.open(ROOT/name).convert('RGB')
def capture(im,name,y,width=912,crop=None):
 s=source(name);s=s.crop(crop) if crop else s
 h=round(s.height*width/s.width);assert y+h<=1740,(name,y+h)
 im.paste(s.resize((width,h),Image.Resampling.LANCZOS),((1080-width)//2,y));return y+h
def frame(s,n,quality):
 global boxes;boxes=[];k=s['kind'];fiction=s['in_frame']<711
 im=paper.copy() if fiction and quality=='final' else Image.new('RGB',(1080,1920),CREAM);d=ImageDraw.Draw(im)
 if fiction:
  line(im,T['fiction_badge'],154,32,'sans')
  d.line((84,224,996,224),fill=RULE,width=2)
  line(im,'OPENLINE',1670,36,'bold');line(im,'01 / FICTION',1670,32,'mono',x=736)
 else:
  if k!='end':
   line(im,T['test_badge'],154,42,'bold')
   d.line((84,232,996,232),fill=INK,width=2)
   line(im,'Recorded local test',1620,36);line(im,'No payment executed',1670,36)
 if k=='title':
  lines(im,s['text'],560,137,'serif',gap=30)
  # An understated opening rule reveals over 12 frames; type itself stays still.
  d.rectangle((84,1210,84+int(240*min(1,(n-s['in_frame']+1)/12)),1215),fill=RED)
 elif k=='message':
  line(im,'FROM: “THE CEO”',460,43,'mono');d.line((84,550,996,550),fill=RULE,width=2)
  lines(im,s['text'],640,98,'bold',gap=32)
  line(im,'Message claims authority.',1240,40,'sans',color=RED)
 elif k in ['dialogue','punchline']:
  line(im,'AGENT',560,36,'mono',color=RED)
  lines(im,s['text'],740,99 if k=='punchline' else 103,'italic',gap=34)
 elif k in ['refused','allowed']:
  line(im,'RECEIVER',620,36,'mono')
  line(im,s['text'][0],850,139 if k=='refused' else 137,'bold',color=RED if k=='refused' else INK)
  d.rectangle((84,1040,996,1045),fill=RED if k=='refused' else INK)
 elif k=='beat':
  d.line((84,1040,996,1040),fill=RULE,width=2)
 elif k=='splice':
  lines(im,s['text'],730,94,'bold',gap=32)
  d.rectangle((84,1110,996,1118),fill=INK)
 elif k=='proposal':
  line(im,'The proposal',375,83,'serif')
  line(im,s['text'][0],570,57,'mono')
  capture(im,s['capture'],825)
 elif k=='receipt':
  line(im,s['text'][0],305,91,'bold',color=RED if s['id']=='stopped' else INK)
  if s['id']=='accepted':line(im,'Same unchanged mandate.',417,36)
  capture(im,s['capture'],475)
 elif k=='reason':
  line(im,'The reason',470,91,'serif')
  capture(im,s['capture'],815)
  line(im,'Outside the granted mandate.',1160,49,'serif')
 elif k=='retained':
  lines(im,s['text'],355,54,'serif',gap=22)
  capture(im,s['capture'],660,width=850,crop=(0,220,420,600))
 elif k=='end':
  line(im,'OPENLINE',575,106,'serif')
  lines(im,['Being smart','isn’t permission.'],825,96,'serif',gap=32)
  lines(im,['Developer preview ·','Demonstrated protected path'],1250,38,'sans',gap=15)
 return im
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def render(quality):
 out=ROOT/('animatic' if quality=='animatic' else 'renders');out.mkdir(exist_ok=True);(ROOT/'review').mkdir(exist_ok=True);(ROOT/'work').mkdir(exist_ok=True)
 size=(540,960) if quality=='animatic' else (1080,1920);video=ROOT/'work'/f'{quality}-picture.mp4'
 proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{size[0]}x{size[1]}','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20' if quality=='animatic' else '17','-pix_fmt','yuv420p','-profile:v','high','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(video)],stdin=subprocess.PIPE)
 layout=[]
 for s in T['shots']:
  # All type/capture compositions are fixed. Only the first twelve frames reveal a rule.
  im=frame(s,s['in_frame']+12,quality);layout.append({'id':s['id'],'in_frame':s['in_frame'],'hold_seconds':(s['out_frame']-s['in_frame'])/30,'text_boxes':boxes.copy()})
  im.save(ROOT/'review'/f'{quality}-{s["id"]}.png')
  cached=im.resize(size,Image.Resampling.LANCZOS).tobytes() if quality=='animatic' else im.tobytes()
  for n in range(s['in_frame'],s['out_frame']):
   if s['id']=='title' and n<12:
    first=frame(s,n,quality);data=first.resize(size,Image.Resampling.LANCZOS).tobytes() if quality=='animatic' else first.tobytes()
   else:data=cached
   proc.stdin.write(data)
  print('Rendered',quality,s['id'],flush=True)
 proc.stdin.close();assert proc.wait()==0
 name='he-said-ceo-animatic.mp4' if quality=='animatic' else 'he-said-ceo-narrated.mp4'
 dest=out/name
 def mux(gain):
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-i',str(ROOT/'audio/final-mix.flac'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',f'volume={gain}dB','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t','43','-movflags','+faststart','-metadata','title=HE SAID HE WAS THE CEO — OpenLine','-metadata','comment=Fictional dialogue then recorded local test. Developer preview. No payment executed.',str(dest)],check=True)
 def loudness():
  l=subprocess.run(['ffmpeg','-v','info','-i',str(dest),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
  return json.JSONDecoder().raw_decode(l[l.rfind('{'):])[0]
 mux(0);measure=loudness();gain=0
 if float(measure['input_tp'])>-1.5:gain=round(-1.8-float(measure['input_tp']),3);mux(gain);measure=loudness()
 assert float(measure['input_tp'])<=-1.5
 if quality=='final':
  muted=out/'he-said-ceo-muted.mp4'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-t','43','-movflags','+faststart',str(muted)],check=True)
  frame(T['shots'][0],12,'final').save(ROOT/'poster.png')
 report={'timeline_sha256':digest(ROOT/'TIMELINE.json'),'quality':quality,'frames':1290,'size':size,'duration':43,'narrated_sha256':digest(dest),'delivery_gain_db':gain,'encoded_loudness':measure,'layout':layout,'fonts':[{ 'path':p,'sha256':digest(Path(p))} for p in FONT.values()]}
 (out/'RENDER.json').write_text(json.dumps(report,indent=2)+'\n')
 print('RENDER PASS',dest,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--quality',choices=['animatic','final'],required=True);a=p.parse_args()
 if a.quality=='final':assert (ROOT/'ANIMATIC-REVIEW.md').exists(),'Review the animatic first.'
 render(a.quality)
