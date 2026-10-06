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
boxes=[];bubble_boxes=[];anchors={}
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
def centered_line(im,item):
 f=font(item['face'],item['size']);d=ImageDraw.Draw(im);b=d.textbbox((0,0),item['text'],font=f);width=d.textlength(item['text'],font=f);cx,cy=item['center']
 return line(im,item['text'],round(cy-(b[3]-b[1])/2),item['size'],item['face'],x=round(cx-width/2))
def speech_bubble(im,bubble,n):
 pose=anchors[n];ax,ay=[v*s for v,s in zip(pose['speech_anchor'],(W,H))];style=T['presentation']['speech_bubble'];d=ImageDraw.Draw(im);f=font('sans',bubble['size']);b=d.textbbox((0,0),bubble['text'],font=f)
 tw=d.textlength(bubble['text'],font=f);th=b[3]-b[1];px,py=style['padding'];width=tw+2*px;height=th+2*py
 # The tail points to Wren's head. The left-aligned body leaves the gate and STOP clear.
 half=style['tail_width']/2
 if bubble['id']=='absolutely':
  # Beside the face, below the already-read incoming message: both texts stay clear.
  tip=[pose['head_bounds'][0]*W-8,(pose['head_bounds'][1]+pose['head_bounds'][3])*H/2]
  right=tip[0]-62;left=max(128,right-width);right=left+width;top=tip[1]-height/2;bottom=top+height
  tail=[[right-2,tip[1]-half],tip,[right-2,tip[1]+half]];seam=[(right-2,tip[1]-half+2),(right-2,tip[1]+half-2)]
 else:
  tip=[ax,pose['head_bounds'][1]*H-8];right=min(T['safe_rect'][2]-12,ax+100);left=max(128,right-width);right=left+width
  bottom=max(150+height,tip[1]-42);top=bottom-height
  tx=max(left+30,min(right-30,ax));tail=[[tx-half,bottom-2],tip,[tx+half,bottom-2]];seam=[(tx-half+2,bottom-2),(tx+half-2,bottom-2)]
 bg=tuple(style['background']);color=tuple(style['color']);stroke=style['stroke_width']
 d.polygon(tail,fill=bg);d.line([tail[0],tail[1],tail[2]],fill=color,width=stroke)
 d.rounded_rectangle([left,top,right,bottom],radius=style['radius'],fill=bg,outline=color,width=stroke)
 d.line(seam,fill=bg,width=stroke+2)
 line(im,bubble['text'],top+py,bubble['size'],'sans',color,x=round(left+px))
 metadata={'id':bubble['id'],'text':bubble['text'],'in_frame':bubble['in_frame'],'out_frame':bubble['out_frame'],'sample_frame':n,'size':bubble['size'],'body_bbox':[left,top,right,bottom],'tail_points':tail,'actor_anchor':[ax,ay],'head_bounds':[pose['head_bounds'][i]*(W if i%2==0 else H) for i in range(4)],'text_bbox':boxes[-1]['bbox']}
 bubble_boxes.append(metadata)
def frame(s,n,physical=None):
 global boxes,bubble_boxes;boxes=[];bubble_boxes=[]
 im=physical.resize((W,H),Image.Resampling.LANCZOS) if s['kind']=='physical' else Image.new('RGB',(W,H),CREAM)
 d=ImageDraw.Draw(im)
 if s['kind']=='physical':
  disclosure=T['presentation']['fiction_disclosure'];x,y=disclosure['position'];f=font(disclosure['face'],disclosure['font_size']);b=d.textbbox((0,0),T['fiction_badge'],font=f)
  d.rectangle((x-12,y-8,x+b[2]+12,y+b[3]-b[1]+8),fill=tuple(disclosure['background']))
  line(im,T['fiction_badge'],y,disclosure['font_size'],disclosure['face'],tuple(disclosure['color']),x)
  if s['text']:
   dialog=T['presentation']['dialogue'];x,y=dialog['position'];size=44 if s['id']=='opener' else dialog['size']
   lines(im,s['text'],y,size,gap=dialog['gap'],x=x)
  for bubble in T['speech_bubbles']:
   if bubble['in_frame']<=n<bubble['out_frame']:speech_bubble(im,bubble,n)
 elif s['kind']=='proof':
  proof=T['presentation']['actual_test_layout']
  for item in proof['primary']:placed_line(im,item)
  if n>=s['in_frame']+proof['receipt_reveal_delay_frames']:
   placed_line(im,proof['receipt_label']);layout=proof['receipt_capture'];src=captured(s['capture']).crop(s['crop']);width=layout['width'];height=round(src.height*width/src.width)
   im.paste(src.resize((width,height),Image.Resampling.LANCZOS),tuple(layout['position']))
   for item in proof['footnotes']:placed_line(im,item)
 else:
  end=T['presentation']['end_card'];centered_line(im,end)
  for item in end['support']:centered_line(im,item)
 return im

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def render(quality):
 global anchors
 out=ROOT/('animatic' if quality=='animatic' else 'renders');out.mkdir(exist_ok=True);(ROOT/'review').mkdir(exist_ok=True);(ROOT/'work').mkdir(exist_ok=True)
 size=(960,540) if quality=='animatic' else (W,H);source=ROOT/f'source/physical-{quality}.mp4';physical_report=json.loads((ROOT/f'source/PHYSICAL-{quality}.json').read_text());assert physical_report['physical_schedule_sha256']==hashlib.sha256(json.dumps({'fps':T['fps'],'physical_scene':T['physical_scene']},separators=(',',':'),ensure_ascii=False).encode()).hexdigest();assert tuple(physical_report['size'])==size
 anchors={p['frame']:p for p in physical_report['anchors']};assert len(anchors)==T['physical_scene']['end_frame']
 decoder=subprocess.Popen(['ffmpeg','-v','error','-i',str(source),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
 picture=ROOT/f'work/{quality}-picture.mp4';encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{size[0]}x{size[1]}','-framerate',str(T['fps']),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20' if quality=='animatic' else '17','-pix_fmt','yuv420p','-profile:v','high','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(picture)],stdin=subprocess.PIPE)
 layout=[];poster=None;bubble_samples=[]
 for s in T['shots']:
  for n in range(s['in_frame'],s['out_frame']):
   phy=None
   if s['kind']=='physical':
    raw=decoder.stdout.read(size[0]*size[1]*3);assert len(raw)==size[0]*size[1]*3,(s['id'],n,len(raw));phy=Image.frombytes('RGB',size,raw)
   im=frame(s,n,phy)
   for bubble in bubble_boxes:
    if n==(bubble['in_frame']+bubble['out_frame'])//2:
     bubble_samples.append(bubble.copy());im.save(ROOT/f'review/{quality}-bubble-{bubble["id"]}.png')
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
 report={'timeline_sha256':digest(ROOT/'TIMELINE.json'),'quality':quality,'frames':T['frames'],'size':size,'duration':T['seconds'],'narrated_sha256':digest(dest),'delivery_gain_db':gain,'encoded_loudness':measure,'layout':layout,'speech_bubbles':bubble_samples,'presentation':T['presentation'],'picture_edit':'One unbroken physical performance until the proof cut; one brand cut. Text cue markers are not picture cuts.','source_physical':physical_report['file'],'physical_capture_report':f'source/PHYSICAL-{quality}.json','physical_source_sha256':digest(source),'fonts':[{'path':p,'sha256':digest(Path(p))} for p in FONT.values()]}
 (out/'RENDER.json').write_text(json.dumps(report,indent=2)+'\n');print('RENDER PASS',dest,flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--quality',choices=['animatic','final'],required=True);a=p.parse_args()
 if a.quality=='final':
  review=(ROOT/'ANIMATIC-REVIEW.md').read_text();assert re.search(r'^# .*animatic.*PASS',review,re.M),'Review the current animatic before final.'
  assert digest(ROOT/'TIMELINE.json') in review and digest(ROOT/'animatic/he-said-ceo-animatic.mp4') in review,'Review must identify the current timeline and freshly rendered animatic.'
 render(a.quality)
