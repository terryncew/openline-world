"""Sample-accurate dialogue and original dry physical punctuation from TIMELINE."""
import json,subprocess
from pathlib import Path
import numpy as np,soundfile as sf
ROOT=Path(__file__).resolve().parents[1];T=json.loads((ROOT/'TIMELINE.json').read_text());SR=48000
voice=json.loads((ROOT/'audio/VOICE-SOURCES.json').read_text());mix=np.zeros(round(T['seconds']*SR));entries=[]
def insert(samples,start):
 at=round(start*SR);assert at+len(samples)<=len(mix);mix[at:at+len(samples)]+=samples
for v in voice['lines']:
 data,rate=sf.read(ROOT/v['file']);x=np.interp(np.arange(round(len(data)*SR/rate))*rate/SR,np.arange(len(data)),data)
 x*=.38/max(np.max(np.abs(x)),.01);start=v['in_frame']/T['fps'];insert(x,start)
 entries.append({'id':v['id'],'text':v['text'],'in_frame':v['in_frame'],'out_frame':round((start+len(x)/SR)*T['fps']),'start_seconds':start,'end_seconds':start+len(x)/SR,'file':v['file']})
rng=np.random.default_rng(20261006)
for cue in T['sfx']:
 kind=cue['kind'];dur=.13 if kind=='latch' else .21 if kind=='allowed' else .2;t=np.arange(round(dur*SR))/SR
 if kind=='latch':x=(np.sin(2*np.pi*164*t)*np.exp(-t*55)+.32*rng.normal(size=len(t))*np.exp(-t*115))
 elif kind=='allowed':x=(np.sin(2*np.pi*293.66*t)+.25*np.sin(2*np.pi*440*t))*np.exp(-t*23)
 else:
  x=rng.normal(size=len(t));x=np.convolve(x,np.ones(5)/5,mode='same')*np.sin(np.pi*t/dur)**2*.35
 x*=cue['gain'];insert(x,cue['frame']/T['fps'])
for lo,hi in T['silence_windows']:assert np.max(np.abs(mix[round(lo*SR):round(hi*SR)]))==0
(ROOT/'work').mkdir(exist_ok=True);sf.write(ROOT/'work/mix-raw.wav',np.stack([mix,mix],axis=1),SR,subtype='PCM_24')
cmd=['ffmpeg','-v','info','-i',str(ROOT/'work/mix-raw.wav'),'-af','loudnorm=I=-16:TP=-2:LRA=8:print_format=json','-f','null','-']
log=subprocess.run(cmd,capture_output=True,text=True,check=True).stderr;measure=json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]
f='loudnorm=I=-16:TP=-2:LRA=8:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true'.format(**measure)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(ROOT/'work/mix-raw.wav'),'-af',f,'-ar',str(SR),'-c:a','flac',str(ROOT/'audio/final-mix.flac')],check=True)
(ROOT/'audio/MIX.json').write_text(json.dumps({'timeline':'TIMELINE.json','sample_rate':SR,'samples':len(mix),'channels':2,'original_sfx':True,'score':False,'voice_sources':'VOICE-SOURCES.json','loudness_first_pass':measure,'speech_cues':entries,'silence_windows':T['silence_windows']},indent=2)+'\n')
(ROOT/'CAPTIONS.json').write_text(json.dumps({'source':'TIMELINE.json + measured full voice takes','fps':30,'visual_policy':'Physical staging plus only essential designed dialogue/value lines. Full voiceover captions remain external; no duplicated burned-in narration.','cues':entries},indent=2,ensure_ascii=False)+'\n')
def timestamp(s):
 ms=round(s*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
(ROOT/'captions.srt').write_text('\n\n'.join(f"{i+1}\n{timestamp(e['start_seconds'])} --> {timestamp(e['end_seconds'])}\n{e['text']}" for i,e in enumerate(entries))+'\n')
(ROOT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f"{timestamp(e['start_seconds']).replace(',','.')} --> {timestamp(e['end_seconds']).replace(',','.')}\n{e['text']}" for e in entries)+'\n')
print('Sample-accurate mix and captions generated.',T['seconds'],'s; all takes intact; silence preserved.')
