"""Continuous physical drama, one real refusal inset, one end card; one renderer."""
import argparse,json,subprocess,hashlib
from pathlib import Path
from functools import lru_cache
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];T=json.loads((ROOT/'TIMELINE.json').read_text())
CREAM=(243,236,220);INK=(27,42,60);RED=(143,52,44)
FONT={'sans':'/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf','bold':'/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf','serif':'/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf','mono':'/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'}
@lru_cache(None)
def font(face,size):return ImageFont.truetype(FONT[face],size)
boxes=[]
def line(im,text,y,size=54,face='sans',color=INK,x=84):
 d=ImageDraw.Draw(im);f=font(face,size);b=d.textbbox((0,0),text,font=f);w=d.textlength(text,font=f);box=[x,y,round(x+w,2),y+b[3]-b[1]]
 assert 80<=box[0]<box[2]<=1000 and 144<=box[1]<box[3]<=1740,(text,box)
 d.text((x,y-b[1]),text,font=f,fill=color);boxes.append({'text':text,'size':size,'face':face,'bbox':box});return box[3]
def lines(im,items,y,size=54,face='sans',gap=18):
 for txt in items:y=line(im,txt,y,size,face)+gap
 return y
@lru_cache(None)
def captured(name):return Image.open(ROOT/name).convert('RGB')
def frame(s,n,quality,physical=None):
 global boxes;boxes=[];im=Image.new('RGB',(1080,1920),CREAM);d=ImageDraw.Draw(im)
 if s['kind']=='physical':
  assert physical is not None
  physical=physical.resize((1080,1080),Image.Resampling.LANCZOS)
  floor=physical.getpixel((0,1070));d.rectangle((0,440,1080,1920),fill=floor);im.paste(physical,(0,440))
  line(im,T['fiction_badge'],154,32)
  if s['id']=='message':
   # An opening close-up of the single hostile message, not a fake product UI.
   d.rectangle((92,292,996,601),fill=(219,210,191));d.rectangle((84,280,988,589),fill=CREAM)
   lines(im,s['text'],318,58,gap=24)
  elif s['text']:
   lines(im,s['text'],1550,54 if len(s['text'])>1 else 59,gap=20)
 elif s['kind']=='proof':
  line(im,T['test_badge'],154,43,'bold');d.line((84,236,996,236),fill=INK,width=2)
  line(im,'STOPPED',385,110,'bold',RED)
  line(im,'refund.execute:4800',555,55,'mono')
  src=captured(s['capture']).crop(s['crop']);height=round(src.height*912/src.width);im.paste(src.resize((912,height),Image.Resampling.LANCZOS),(84,735))
  line(im,'Receiver-signed decision',1320,41)
  line(im,'Recorded local test',1620,36);line(im,'No payment executed',1670,36)
 else:
  line(im,'OPENLINE',510,106,'serif')
  lines(im,['A prompt can steer','the agent.'],795,83,'serif',gap=24)
  lines(im,['It can’t rewrite','permission.'],1090,83,'serif',gap=24)
 return im

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def render(quality):
 out=ROOT/('animatic' if quality=='animatic' else 'renders');out.mkdir(exist_ok=True);(ROOT/'review').mkdir(exist_ok=True);(ROOT/'work').mkdir(exist_ok=True)
 size=(540,960) if quality=='animatic' else (1080,1920);square=540 if quality=='animatic' else 1080;source=ROOT/f'source/physical-{quality}.mp4';physical_report=json.loads((ROOT/f'source/PHYSICAL-{quality}.json').read_text());assert physical_report['physical_schedule_sha256']==hashlib.sha256(json.dumps({'fps':T['fps'],'physical_scene':T['physical_scene']},separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
 decoder=subprocess.Popen(['ffmpeg','-v','error','-i',str(source),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
 picture=ROOT/f'work/{quality}-picture.mp4';encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{size[0]}x{size[1]}','-framerate',str(T['fps']),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20' if quality=='animatic' else '17','-pix_fmt','yuv420p','-profile:v','high','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(picture)],stdin=subprocess.PIPE)
 layout=[];poster=None
 for s in T['shots']:
  for n in range(s['in_frame'],s['out_frame']):
   phy=None
   if s['kind']=='physical':
    raw=decoder.stdout.read(square*square*3);assert len(raw)==square*square*3,(s['id'],n,len(raw));phy=Image.frombytes('RGB',(square,square),raw)
   im=frame(s,n,quality,phy)
   if n==(s['in_frame']+s['out_frame'])//2:
    im.save(ROOT/f'review/{quality}-{s["id"]}.png');layout.append({'id':s['id'],'in_frame':s['in_frame'],'hold_seconds':(s['out_frame']-s['in_frame'])/T['fps'],'text_boxes':boxes.copy()})
   if s['id']=='please' and n==s['in_frame']+17:poster=im.copy()
   encoder.stdin.write(im.resize(size,Image.Resampling.LANCZOS).tobytes() if quality=='animatic' else im.tobytes())
  print('Rendered',quality,s['id'],flush=True)
 decoder.stdout.close();assert decoder.wait()==0;encoder.stdin.close();assert encoder.wait()==0
 dest=out/('he-said-ceo-animatic.mp4' if quality=='animatic' else 'he-said-ceo-narrated.mp4')
 def mux(gain):
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(picture),'-i',str(ROOT/'audio/final-mix.flac'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',f'volume={gain}dB','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t',str(T['seconds']),'-movflags','+faststart','-metadata','title=HE SAID HE WAS THE CEO — physical recut','-metadata','comment=Fictional physical scene followed by preserved real refusal. Developer test; no payment executed.',str(dest)],check=True)
 def loudness():
  log=subprocess.run(['ffmpeg','-v','info','-i',str(dest),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr;return json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]
 mux(0);measure=loudness();gain=0
 if float(measure['input_tp'])>-1.5:gain=round(-1.8-float(measure['input_tp']),3);mux(gain);measure=loudness()
 assert float(measure['input_tp'])<=-1.5
 if quality=='final':
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(picture),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-t',str(T['seconds']),'-movflags','+faststart',str(out/'he-said-ceo-muted.mp4')],check=True)
  assert poster is not None;ImageDraw.Draw(poster).rectangle((0,240,1080,430),fill=CREAM);lines(poster,['HE SAID HE WAS','THE CEO.'],252,65,'serif',gap=18);poster.save(ROOT/'poster.png')
 report={'timeline_sha256':digest(ROOT/'TIMELINE.json'),'quality':quality,'frames':T['frames'],'size':size,'duration':T['seconds'],'narrated_sha256':digest(dest),'delivery_gain_db':gain,'encoded_loudness':measure,'layout':layout,'source_physical':physical_report['file'],'physical_capture_report':f'source/PHYSICAL-{quality}.json','physical_source_sha256':digest(source),'fonts':[{'path':p,'sha256':digest(Path(p))} for p in FONT.values()]}
 (out/'RENDER.json').write_text(json.dumps(report,indent=2)+'\n');print('RENDER PASS',dest,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--quality',choices=['animatic','final'],required=True);a=p.parse_args()
 if a.quality=='final':
  review=(ROOT/'ANIMATIC-REVIEW.md').read_text();assert '# Physical recut animatic — PASS' in review,'Review the new physical animatic before final.'
 render(a.quality)
