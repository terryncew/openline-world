"""Decode all final streams, measure audio/PTS and validate retained factual artifacts."""
from pathlib import Path
import json,subprocess,hashlib,sys
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1]
sys.path.insert(0,str(REPO/'backend/vendor'))
from openline_wallet.crypto import verify_record
edits=json.loads((ROOT/'EDITS.json').read_text())['variants'];reports=[]
run=json.loads((ROOT/'evidence/authority-run.json').read_text())
gate_key=run['signed_receipts'][0]['gate_public_key']
for i,p in enumerate(sorted((ROOT/'evidence').glob('receipt-[1-3].json'))):
 record=json.loads(p.read_text());assert record==run['signed_receipts'][i],p
 assert verify_record(record,expected_public_key=gate_key)[0],p
for e in edits:
 p=ROOT/e['file'];info=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(p)]));v=next(s for s in info['streams'] if s['codec_type']=='video');a=next(s for s in info['streams'] if s['codec_type']=='audio')
 assert [v['width'],v['height']]==e['size'];assert v['codec_name']=='h264' and a['codec_name']=='aac'
 assert v['r_frame_rate']=='24/1';assert a['sample_rate']=='48000' and a['channels']==2
 assert float(v['start_time'])==float(a['start_time'])==0
 assert int(v['nb_frames'])==round(e['seconds']*24)
 assert abs(float(v['duration'])-e['seconds'])<.001;assert abs(float(v['duration'])-float(a['duration']))<.05
 subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(p),'-f','null','-'],check=True,stdout=subprocess.DEVNULL)
 audio=ROOT/'work'/(e['name']+'-decoded.wav');subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),'-vn','-ac','1','-ar','24000',str(audio)],check=True)
 samples,sr=sf.read(audio);cu=json.loads((ROOT/'audio'/(e['name']+'-CUES.json')).read_text());speech=[]
 for cue in [c for c in cu['cues'] if c['kind']=='voice']:
  ref,rr=sf.read(ROOT/'audio'/('voice-'+cue['id']+'.wav'));assert rr==sr
  # Correlation demonstrates timing and non-truncation; it is not a listening verdict.
  at=round(cue['time']*sr);r=ref-ref.mean();norm=np.linalg.norm(r);best=(-1,None)
  for lag in range(-int(.025*sr),int(.025*sr)+1,12):
   x=samples[at+lag:at+lag+len(ref)]
   if len(x)!=len(ref):continue
   x=x-x.mean();c=float(np.dot(r,x)/(norm*np.linalg.norm(x)+1e-12))
   if c>best[0]:best=(c,lag)
  assert best[0]>.72,(e['name'],cue['id'],best)
  assert abs(best[1]/sr)<.025
  speech.append({'id':cue['id'],'start':cue['time'],'correlation':round(best[0],5),'lag_ms':round(best[1]/sr*1000,3),'speech_end':cue['time']+len(ref)/sr})
 silence=next(c for c in cu['cues'] if c['kind']=='complete-silence');lo=int((silence['time']+.10)*sr);hi=int((silence['time']+silence['seconds']-.10)*sr);silence_peak=float(np.max(np.abs(samples[lo:hi])))
 assert silence_peak<.002,(e['name'],silence_peak)
 log=subprocess.run(['ffmpeg','-v','info','-i',str(p),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
 loud=json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0];assert float(loud['input_tp'])<=-1.5,(e['name'],loud)
 assert -17<=float(loud['input_i'])<=-15,(e['name'],loud)
 reports.append({'file':e['file'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'seconds':float(v['duration']),'size':e['size'],'fps':24,'stream_start_seconds':{'video':float(v['start_time']),'audio':float(a['start_time'])},'audio_duration_delta_ms':round((float(a['duration'])-float(v['duration']))*1000,3),'decode':'PASS','voice_windows':speech,'silence_peak':silence_peak,'loudness':loud})
 print('PASS',e['name'],'complete decode, voice windows, STOP silence, stream alignment',flush=True)
(ROOT/'review/TECHNICAL-QA.json').write_text(json.dumps({'base_sha':'2235fa6ce916876cd39ed35be97263ddfc111b6a','signed_receipts_verified':3,'results':reports,'subjective_audio_listening':'UNVERIFIED: audio input unavailable to this agent','cold_viewer_comprehension':'UNRUN: no independent viewer in this environment'},indent=2)+'\n')
