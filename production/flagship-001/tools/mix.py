"""Original deterministic score/foley; shared voice takes and semantic cue timing."""
from pathlib import Path
import json,subprocess,math
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1];SR=48000
edits=json.loads((ROOT/'EDITS.json').read_text())['variants'];voices={v['id']:v for v in json.loads((ROOT/'audio/VOICE-SOURCES.json').read_text())['lines']}
rng=np.random.default_rng(125839)
def bell(freq,seconds=2.5):
 t=np.arange(int(seconds*SR))/SR
 env=(1-np.exp(-t*230))*np.exp(-t*2.4)
 y=sum(amp*np.sin(2*np.pi*freq*ratio*t)*np.exp(-t*decay) for ratio,amp,decay in [(1,.58,.1),(2.01,.18,1.7),(3.99,.12,3.2),(6.23,.035,5.5)])
 return y*env

def wood():
 t=np.arange(int(.2*SR))/SR;n=rng.normal(0,1,len(t));smooth=np.convolve(n,np.ones(9)/9,'same')
 return (.3*smooth+.45*np.sin(2*np.pi*190*t)+.13*np.sin(2*np.pi*510*t))*np.exp(-t*38)*(1-np.exp(-t*1600))
def paper():
 n=rng.normal(0,1,int(.35*SR));h=n-np.convolve(n,np.ones(19)/19,'same');t=np.arange(len(n))/SR
 return h*.19*np.sin(np.pi*t/.35)**2*(.65+.35*np.sin(t*41)**2)
def latch():
 t=np.arange(int(.65*SR))/SR;n=rng.normal(0,1,len(t));pulse=np.exp(-t*23)
 body=np.sin(2*np.pi*74*t)*np.exp(-t*10)+.45*np.sin(2*np.pi*137*t)*np.exp(-t*14)
 metal=.19*np.sin(2*np.pi*1120*t)*np.exp(-t*25)
 return .4*body+.16*n*pulse+metal

def ratchet():
 a=np.zeros(int(.46*SR))
 for at in [0,.045,.095,.155,.235,.335]:
  z=wood()*.4;start=int(at*SR);take=min(len(z),len(a)-start);a[start:start+take]+=z[:take]
 return a

def place(dst,y,at,gain=1,pan=0):
 start=int(round(at*SR));end=min(len(dst),start+len(y))
 if end<=max(0,start):return
 src=max(0,-start);start=max(0,start);take=end-start
 if y.ndim==2:dst[start:end]+=y[src:src+take]*gain
 else:dst[start:end,0]+=y[src:src+take]*gain*math.sqrt((1-pan)/2);dst[start:end,1]+=y[src:src+take]*gain*math.sqrt((1+pan)/2)

# Same visual handles used by the editor. No accelerated or fabricated decision.
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
 return round(trim_policy(id,seconds,total)*24)/24
shots={s['id']:s for s in json.loads((ROOT/'SHOTS.json').read_text())['shots']}
(ROOT/'work').mkdir(exist_ok=True)
for edit in edits:
 name=edit['name'];
 import os
 if os.environ.get('EDITS') and name not in os.environ['EDITS'].split(','):continue
 n=round(edit['seconds']*SR);music=np.zeros((n,2));fx=np.zeros((n,2));vo=np.zeros((n,2));cues=[]
 # Air without simulated office noise: quiet harmonics provide scale.
 t=np.arange(n)/SR
 act=np.ones(n);stop=next(s for s in edit['segments'] if s['id']=='stop');grant=next(s for s in edit['segments'] if s['id']=='newgrant')
 act[(t>=stop['start']-.3)&(t<grant['start'])]=.23
 start=next(s['start'] for s in edit['segments'] if s['id']=='wren')+.7
 env=np.minimum(1,np.maximum(0,(t-start)/3))*np.minimum(1,np.maximum(0,(edit['seconds']-t)/2))*act
 pad=(np.sin(2*np.pi*146.832*t)*.010+np.sin(2*np.pi*220*t+.11*np.sin(.7*t))*.006+np.sin(2*np.pi*293.665*t)*.004)*env
 music[:,0]=pad;music[:,1]=pad*.95
 def theme(at,gain=.1):
  for k,(freq,pan) in enumerate([(293.665,-.18),(440,.12),(659.255,.25)]):place(music,bell(freq),at+k*.43,gain,pan)
 for segment in edit['segments']:
  id=segment['id'];at=segment['start'];dur=segment['seconds'];tr=trim_start(id,dur,shots[id]['seconds']) if id in shots else 0
  def cue(kind,local,gain=.5,pan=0):
   when=at+local-tr
   if when<at-.01 or when>at+dur: return
   y={'paper':paper,'wood':wood,'latch':latch,'ratchet':ratchet}.get(kind,lambda:bell(520,.6))()
   place(fx,y,when,gain,pan);cues.append({'kind':kind,'time':round(when,6),'shot':id})
  if id=='job':cue('paper',.15,.45)
  if id in ['square','square-out']:
   for k in range(int(dur/.48)):cue('wood',.2+k*.48,.1,(-1 if k%2 else 1)*.3)
  if id=='wren':
   for k in range(4):cue('wood',.48+k*.24,.32,-.2)
   theme(at+.55,.1)
  if id=='owner':cue('bell',.3,.32,-.4)
  if id in ['allow','continue']:
   cue('ratchet',.5,.5,.2);cue('paper',1.2,.65);theme(at+min(dur-.4,1.1),.105)
  if id=='work':
   for k in range(int(dur)):cue('wood',.35+k,.24,-.1)
  if id=='revoke':cue('bell',.75,.15,-.3)
  if id=='stop':cue('ratchet',.7,.72,.1);cue('latch',1.85,.95,.1)
  if id in ['stamp','receipt-ui','history']:cue('paper',.25,.48)
  if id=='arrival':
   for k in range(5):cue('wood',.5+k*.28,.38,.25)
  if id=='newgrant':theme(at+max(.25,1.55-tr),.16);cue('bell',1.55,.26,-.25)
  if id=='checkpoints':cue('wood',.1,.25);cue('wood',.45,.2)
  if id=='together':theme(at+.8,.11)
  if id=='square-out':theme(at+.75,.10)
  if id=='end':theme(at+.4,.17);place(music,bell(587.33,3.5),at+dur-3,.09)
  if id in ['developer','buyer']:theme(at+.2,.1)
 # Place the canonical voice sources; these exact windows go to verification.
 for cue in edit['voice']:
  source=voices[cue['id']];y,sr=sf.read(ROOT/source['file']);newlen=round(len(y)*SR/sr);y=np.interp(np.arange(newlen)*sr/SR,np.arange(len(y)),y)
  # Level the dry voice consistently before the complete mix is loudness-normalized.
  rms=math.sqrt(np.mean(y*y)+1e-12);gain=.085/rms
  place(vo,y,cue['start'],gain)
  a=max(0,round((cue['start']-.15)*SR));b=min(n,round((cue['start']+len(y)/SR+.4)*SR));music[a:b]*=.31;fx[a:b]*=.72
  cues.append({'kind':'voice','id':cue['id'],'time':cue['start'],'seconds':len(y)/SR,'text':source['text']})
 # The STOP removes the score and room as well as the mechanism's tail.
 tr=trim_start('stop',stop['seconds'],shots['stop']['seconds']);silent_start=stop['start']+2.06-tr;silent_end=min(edit['seconds'],silent_start+.62)
 a=round(silent_start*SR);b=round(silent_end*SR)
 for stem in [music,fx,vo]:stem[a:b]=0
 cues.append({'kind':'complete-silence','time':silent_start,'seconds':silent_end-silent_start})
 raw=music+fx+vo;path=ROOT/'work'/f'{name}-mix.wav';sf.write(path,raw,SR,subtype='PCM_24')
 out=ROOT/'work'/f'{name}-mix.flac'
 # Measure before normalizing. One-pass estimates missed the integrated target
 # on this deliberately sparse mix. Leave encoding headroom below -1.5 dBTP.
 first=subprocess.run(['ffmpeg','-v','info','-i',str(path),'-af','loudnorm=I=-16:TP=-2:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 measured=json.JSONDecoder().raw_decode(first.stderr[first.stderr.rfind('{'):])[0]
 filt='loudnorm=I=-16:TP=-2:LRA=8:'+':'.join(f'{key}={measured[value]}' for key,value in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])+':linear=true:print_format=json'
 log=subprocess.run(['ffmpeg','-v','info','-y','-i',str(path),'-af',filt,'-ar','48000','-c:a','flac',str(out)],capture_output=True,text=True,check=True)
 (ROOT/'work'/f'{name}-loudness.txt').write_text(log.stderr)
 if name=='master-90':
  for kind,data in [('score',music),('foley',fx),('narration',vo)]:sf.write(ROOT/'audio'/f'master-{kind}.flac',data,SR,subtype='PCM_24')
 (ROOT/'audio'/f'{name}-CUES.json').write_text(json.dumps({'name':name,'sample_rate':SR,'cues':sorted(cues,key=lambda c:c['time']),'original_score':'D-A-E motif; deterministic physical synth score and foley','perceptual_listening':'unavailable to this agent'},indent=2)+'\n')
 print(name,'mixed',edit['seconds'],'seconds',flush=True)
