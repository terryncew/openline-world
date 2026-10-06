"""Native horizontal performance, one preserved proof reveal, one simple brand card."""
import argparse,json,subprocess,hashlib,re
from pathlib import Path
from functools import lru_cache
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];T=json.loads((ROOT/'TIMELINE.json').read_text())
CREAM=(243,236,220);INK=(27,42,60);RED=(143,52,44);W,H=T['size']
FONT={'sans':'/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf','bold':'/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf','serif':'/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf','mono':'/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'}
@lru_cache(None)
def font(face,size):return ImageFont.truetype(FONT[face],size)
boxes=[]
def line(im,text,y,size=48,face='sans',color=INK,x=128):
 d=ImageDraw.Draw(im);f=font(face,size);b=d.textbbox((0,0),text,font=f);w=d.textlength(text,font=f);box=[x,y,round(x+w,2),y+b[3]-b[1]];safe=T['safe_rect']
 assert safe[0]<=box[0]<box[2]<=safe[2] and safe[1]<=box[1]<box[3]<=safe[3],(text,box)
 d.text((x,y-b[1]),text,font=f,fill=color);boxes.append({'text':text,'size':size,'face':face,'bbox':box,'color':list(color)});return box[3]
def lines(im,items,y,size=48,face='sans',gap=16,x=128):
 for txt in items:y=line(im,txt,y,size,face,x=x)+gap
 return y
@lru_cache(None)
def captured(name):return Image.open(ROOT/name).convert('RGB')
def placed_line(im,item):
 x,y=item['position'];return line(im,item['text'],y,item['size'],item['face'],tuple(item.get('color',INK)),x)
def frame(s,n,physical=None):
 global boxes;boxes=[]
 im=physical.resize((W,H),Image.Resampling.LANCZOS) if s['kind']=='physical' else Image.new('RGB',(W,H),CREAM)
 d=ImageDraw.Draw(im)
 if s['kind']=='physical':
  disclosure=T['presentation']['fiction_disclosure'];x,y=disclosure['position'];f=font(disclosure['face'],disclosure['font_size']);b=d.textbbox((0,0),T['fiction_badge'],font=f)
  d.rectangle((x-12,y-8,x+b[2]+12,y+b[3]-b[1]+8),fill=tuple(disclosure['background']))
  line(im,T['fiction_badge'],y,disclosure['font_size'],disclosure['face'],tuple(disclosure['color']),x)
  if s['text']:
   dialog=T['presentation']['dialogue'];x,y=dialog['position'];size=44 if s['id']=='opener' else dialog['size']
   lines(im,s['text'],y,size,gap=dialog['gap'],x=x)
 elif s['kind']=='proof':
  proof=T['presentation']['actual_test_layout']
  for item in proof['primary']:placed_line(im,item)
  if n>=s['in_frame']+proof['receipt_reveal_delay_frames']:
   placed_line(im,proof['receipt_label']);layout=proof['receipt_capture'];src=captured(s['capture']).crop(s['crop']);width=layout['width'];height=round(src.height*width/src.width)
   im.paste(src.resize((width,height),Image.Resampling.LANCZOS),tuple(layout['position']))
   for item in proof['footnotes']:placed_line(im,item)
 else:
  end=T['presentation']['end_card'];f=font(end['face'],end['size']);bbox=d.textbbox((0,0),end['text'],font=f);width=d.textlength(end['text'],font=f);height=bbox[3]-bbox[1];cx,cy=end['center']
  line(im,end['text'],round(cy-height/2),end['size'],end['face'],x=round(cx-width/2))
 return im

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def render(quality):
 out=ROOT/('animatic' if quality=='animatic' else 'renders');out.mkdir(exist_ok=True);(ROOT/'review').mkdir(exist_ok=True);(ROOT/'work').mkdir(exist_ok=True)
 size=(960,540) if quality=='animatic' else (W,H);source=ROOT/f'source/physical-{quality}.mp4';physical_report=json.loads((ROOT/f'source/PHYSICAL-{quality}.json').read_text());assert physical_report['physical_schedule_sha256']==hashlib.sha256(json.dumps({'fps':T['fps'],'physical_scene':T['physical_scene']},separators=(',',':'),ensure_ascii=False).encode()).hexdigest();assert tuple(physical_report['size'])==size
 decoder=subprocess.Popen(['ffmpeg','-v','error','-i',str(source),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
 picture=ROOT/f'work/{quality}-picture.mp4';encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{size[0]}x{size[1]}','-framerate',str(T['fps']),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20' if quality=='animatic' else '17','-pix_fmt','yuv420p','-profile:v','high','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(picture)],stdin=subprocess.PIPE)
 layout=[];poster=None
 for s in T['shots']:
  for n in range(s['in_frame'],s['out_frame']):
   phy=None
   if s['kind']=='physical':
    raw=decoder.stdout.read(size[0]*size[1]*3);assert len(raw)==size[0]*size[1]*3,(s['id'],n,len(raw));phy=Image.frombytes('RGB',size,raw)
   im=frame(s,n,phy)
   if n==(s['in_frame']+s['out_frame'])//2:
    im.save(ROOT/f'review/{quality}-{s["id"]}.png');item={'id':s['id'],'in_frame':s['in_frame'],'hold_seconds':(s['out_frame']-s['in_frame'])/T['fps'],'text_boxes':boxes.copy()}
    if s['kind']=='physical':item['physical_scene_frame']=n
    if s['kind']=='proof':
     receipt=T['presentation']['actual_test_layout']['receipt_capture'];item['receipt_capture']={'source':s['capture'],'source_sha256':digest(ROOT/s['capture']),'crop':s['crop'],'position':receipt['position'],'width':receipt['width'],'height':round((s['crop'][3]-s['crop'][1])*receipt['width']/(s['crop'][2]-s['crop'][0]))};item['receipt_reveal_frame']=s['in_frame']+T['presentation']['actual_test_layout']['receipt_reveal_delay_frames']
    layout.append(item)
   if s['id']=='please' and n==s['in_frame']+17:poster=im.copy()
   encoder.stdin.write(im.resize(size,Image.Resampling.LANCZOS).tobytes() if quality=='animatic' else im.tobytes())
  print('Rendered',quality,s['id'],flush=True)
 decoder.stdout.close();assert decoder.wait()==0;encoder.stdin.close();assert encoder.wait()==0
 dest=out/('he-said-ceo-animatic.mp4' if quality=='animatic' else 'he-said-ceo-narrated.mp4')
 def mux(gain):
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(picture),'-i',str(ROOT/'audio/final-mix.flac'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',f'volume={gain}dB','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t',str(T['seconds']),'-movflags','+faststart','-metadata','title=HE SAID HE WAS THE CEO — horizontal director recut','-metadata','comment=Fictional physical scene followed by preserved real refusal. Recorded local test; no payment executed.',str(dest)],check=True)
 def loudness():
  log=subprocess.run(['ffmpeg','-v','info','-i',str(dest),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr;return json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]
 mux(0);measure=loudness();gain=0
 if float(measure['input_tp'])>-1.5:gain=round(-1.8-float(measure['input_tp']),3);mux(gain);measure=loudness()
 assert float(measure['input_tp'])<=-1.5
 if quality=='final':
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(picture),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-t',str(T['seconds']),'-movflags','+faststart',str(out/'he-said-ceo-muted.mp4')],check=True)
  assert poster is not None;title='HE SAID HE WAS THE CEO.';d=ImageDraw.Draw(poster);f=font('serif',64);b=d.textbbox((0,0),title,font=f);d.rectangle((116,136,140+b[2],225),fill=CREAM);line(poster,title,150,64,'serif');poster.save(ROOT/'poster.png')
 report={'timeline_sha256':digest(ROOT/'TIMELINE.json'),'quality':quality,'frames':T['frames'],'size':size,'duration':T['seconds'],'narrated_sha256':digest(dest),'delivery_gain_db':gain,'encoded_loudness':measure,'layout':layout,'presentation':T['presentation'],'picture_edit':'One unbroken physical performance until the proof cut; one brand cut. Text cue markers are not picture cuts.','source_physical':physical_report['file'],'physical_capture_report':f'source/PHYSICAL-{quality}.json','physical_source_sha256':digest(source),'fonts':[{'path':p,'sha256':digest(Path(p))} for p in FONT.values()]}
 (out/'RENDER.json').write_text(json.dumps(report,indent=2)+'\n');print('RENDER PASS',dest,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--quality',choices=['animatic','final'],required=True);a=p.parse_args()
 if a.quality=='final':
  review=(ROOT/'ANIMATIC-REVIEW.md').read_text();assert re.search(r'^# .*animatic.*PASS',review,re.M),'Review the current animatic before final.'
  assert digest(ROOT/'TIMELINE.json') in review and digest(ROOT/'animatic/he-said-ceo-animatic.mp4') in review,'Review must identify the current timeline and freshly rendered animatic.'
 render(a.quality)
