"""One production, seven editorial derivatives. All source classifications survive."""
from pathlib import Path
import json,subprocess,os,hashlib
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'work';WORK.mkdir(exist_ok=True)
shots={s['id']:s for s in json.loads((ROOT/'SHOTS.json').read_text())['shots']}
edits=json.loads((ROOT/'EDITS.json').read_text())['variants']
# Import just the editorial trim policy without rerunning the audio generator.
def trim_policy(id,seconds,total):
 if seconds>=total:return 0
 if id=='arrival':return min(total-seconds,2.2 if seconds<2 else 1.05)
 if id=='newgrant' and seconds<2:return .3
 if id=='stop' and seconds<2:return .25
 if id=='allow' and seconds<1:return .7
 if id=='history':return min(total-seconds,.9)
 if id=='wren' and seconds<2:return .35
 return 0
def trim_start(id,seconds,total):
 # Source footage has discrete 24-fps samples. Fractional seeks can discard
 # the first output frame and shorten a cut by 1/24 second.
 return round(trim_policy(id,seconds,total)*24)/24
crop={'job':656,'wren':658,'square':665,'allow':777,'revoke':660,'stop':735,'arrival':1256,'continue':777,'history':656,'newgrant':570}
selected=os.environ.get('EDITS','').split(',');manifest=[]
for edit in edits:
 if selected!=[''] and edit['name'] not in selected:continue
 vertical=edit['size'][0]<edit['size'][1];parts=[];entries=[]
 for k,seg in enumerate(edit['segments']):
  id=seg['id'];dur=seg['seconds'];w,h=edit['size'];key=f'{id}-{dur}-{w}';part=WORK/(key+'.mp4');filters=[];args=[]
  if id in shots:
   src=ROOT/shots[id]['source'];start=trim_start(id,dur,shots[id]['seconds']);args=['-ss',str(start),'-i',str(src)]
   if vertical:
    if id=='newgrant':
     # Preserve the entire gold path and both endpoints rather than losing the owner in a crop.
     filters+=['scale=1080:608:flags=lanczos','pad=1080:1920:0:656:color=0xf3ead9',"drawtext=fontfile=/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf:text='Permission comes from you.':fontsize=44:fontcolor=0x3d3428:x=(w-tw)/2:y=480"]
    else:filters += [f'crop=608:1080:{crop.get(id,656)}:0','scale=1080:1920:flags=lanczos']
   filters+=['eq=contrast=1.025:brightness=0.008:saturation=0.96']
  else:
   src=ROOT/'source'/((('receipt-proof' if id=='receipt-ui' else id)+('-vertical' if vertical else ''))+'.png')
   args=['-loop','1','-framerate','24','-i',str(src)];start=0
   if id=='end':filters+=['fade=t=in:st=0:d=0.28:color=0xf3ead9']
  if start:filters+=['setpts=PTS-STARTPTS']
  filters+=['fps=24','setsar=1','format=yuv420p']
  cache=hashlib.sha256(src.read_bytes()+json.dumps({'filters':filters,'start':start,'duration':dur,'size':[w,h]}).encode()).hexdigest()[:12]
  part=WORK/(key+'-'+cache+'.mp4')
  expected_frames=round(dur*24)
  valid=False
  if part.exists():
   probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-of','json',str(part)]))['streams'][0]
   valid=int(probe['nb_frames'])==expected_frames
  if not valid:
   cmd=['ffmpeg','-v','error','-y','-threads','2',*args,'-frames:v',str(expected_frames),'-vf',','.join(filters),'-an','-c:v','libx264','-threads','2','-preset','fast','-crf','17','-profile:v','high','-level:v','4.1','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(part)]
   subprocess.run(cmd,check=True)
  parts.append(part);entries.append({**seg,'render_source':src.relative_to(ROOT).as_posix(),'render_source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'source_trim_start':start,'crop_x':crop.get(id,656) if vertical and id in shots and id!='newgrant' else None,'framing':'Full owner-link inset' if vertical and id=='newgrant' else 'Authored portrait crop' if vertical and id in shots else 'Native frame','proof_overlay':'Factual fields from receipt-2.json with existing UI pixels' if id=='receipt-ui' else None})
 sequence=WORK/(edit['name']+'.ffconcat');sequence.write_text('ffconcat version 1.0\n'+''.join(f"file '{p.as_posix()}'\n" for p in parts))
 dest=ROOT/edit['file'];dest.parent.mkdir(exist_ok=True)
 def encode(gain_db=0):
  subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(sequence),'-i',str(WORK/(edit['name']+'-mix.flac')),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',f'volume={gain_db}dB','-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-t',str(edit['seconds']),'-movflags','+faststart','-metadata','title=OpenLine — The Work Stays — '+edit['name'],'-metadata','comment=Local developer preview. Real receiver receipts; event-derived World; synthetic project-notes work. No provider integration.',str(dest)],check=True)
 def measured_audio():
  log=subprocess.run(['ffmpeg','-v','info','-i',str(dest),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
  return json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]
 encode();audio=measured_audio();gain_db=0
 if float(audio['input_tp'])>-1.5:
  # AAC reconstruction can overshoot even the -2 dBTP PCM ceiling.
  # Adjust only the delivery gain; timing, silence and shared stems stay exact.
  gain_db=round(-1.8-float(audio['input_tp']),3);encode(gain_db);audio=measured_audio()
 assert float(audio['input_tp'])<=-1.5,(edit['name'],audio)
 entry={**edit,'segments':entries,'delivery_gain_db':gain_db,'encoded_audio_measurement':audio,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()};manifest.append(entry)
 (ROOT/'renders'/(edit['name']+'-MANIFEST.json')).write_text(json.dumps(entry,indent=2)+'\n');print('Rendered',edit['name'],edit['seconds'],dest.stat().st_size,flush=True)
all_manifests=[json.loads((ROOT/'renders'/(e['name']+'-MANIFEST.json')).read_text()) for e in edits if (ROOT/'renders'/(e['name']+'-MANIFEST.json')).exists()]
(ROOT/'renders/INDEX.json').write_text(json.dumps({'title':'The Work Stays','base_sha':'2235fa6ce916876cd39ed35be97263ddfc111b6a','renders':all_manifests},indent=2)+'\n')
