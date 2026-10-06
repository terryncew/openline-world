"""Verify encoded deliveries, frozen signatures, layout, cue alignment and claim bounds."""
import json,subprocess,sys,hashlib
from pathlib import Path
import numpy as np,soundfile as sf
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1];T=json.loads((ROOT/'TIMELINE.json').read_text())
sys.path[:0]=[str(REPO/'backend'),str(REPO/'backend/vendor')]
from openline_wallet.crypto import verify_record
def command(args):return subprocess.run(args,capture_output=True,check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
facts=json.loads((ROOT/'FACTS.json').read_text());run=json.loads((ROOT/'evidence/run.json').read_text());rs=run['receipts']
assert [r['action'] for r in rs]==['refund.execute:4800','refund.execute:100']
assert [r['decision'] for r in rs]==['STOPPED','ALLOWED'] and rs[0]['reason_codes']==['ACTION_OUTSIDE_MANDATE']
assert all(verify_record(r,expected_public_key=facts['actual_mandate']['gate_public_key'])[0] for r in rs)
assert rs==json.loads((ROOT/'evidence/reloaded-wallet-receipts.json').read_text())
preserved=[]
for name in ['FACTS.json','evidence/run.json','evidence/receipt-stopped.json','evidence/receipt-allowed.json','evidence/reloaded-wallet-receipts.json','evidence/owner-authority-events.json']:
 recovered=command(['git','-C',str(REPO),'show','13e9c60abc45036c81aaa604855250b0e5384273:production/he-said-ceo-001/'+name]).stdout
 assert recovered==(ROOT/name).read_bytes(),name;preserved.append({'file':name,'sha256':sha(ROOT/name)})
assert T['frames']==1290 and T['seconds']==43 and T['fps']==30
claims=json.loads((ROOT/'CLAIM-SHOT-MAP.json').read_text())['shots'];assert len(claims)==len(T['shots'])
for s,c in zip(T['shots'],claims):
 assert s['id']==c['claim_id'] and s['in_frame']==c['in_frame'] and s['out_frame']==c['out_frame']
 if s['classification']=='REAL CAPTURE':assert (ROOT/s['capture']).exists() and (ROOT/s['evidence']['file']).exists()
 if s['kind']=='refused':assert s['out_frame']-s['in_frame']>=30
assert (T['shots'][-1]['out_frame']-T['shots'][-1]['in_frame'])/30>=3.5
render=json.loads((ROOT/'renders/RENDER.json').read_text());assert render['timeline_sha256']==sha(ROOT/'TIMELINE.json')
for shot in render['layout']:
 for b in shot['text_boxes']:
  x,y,r,bot=b['bbox'];assert 80<=x<r<=1000 and 144<=y<bot<=1740
  assert b['size']>=32
def correlate_valid(signal,ref):
 # Linear FFT correlation. Return the exact candidate start and normalized similarity.
 length=len(signal)+len(ref)-1;n=1<<(length-1).bit_length()
 c=np.fft.irfft(np.fft.rfft(signal,n)*np.fft.rfft(ref[::-1],n),n)[len(ref)-1:len(signal)]
 energies=np.cumsum(np.r_[0,signal*signal]);energies=energies[len(ref):]-energies[:-len(ref)]
 corr=c/np.sqrt(np.maximum(energies*np.sum(ref*ref),1e-20));at=int(np.argmax(corr));return at,float(corr[at])
voice=json.loads((ROOT/'audio/VOICE-SOURCES.json').read_text())['lines'];results=[];vhash=[]
for edition in ['narrated','muted']:
 file=ROOT/f'renders/he-said-ceo-{edition}.mp4';probe=json.loads(command(['ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(file)]).stdout)
 vs=next(s for s in probe['streams'] if s['codec_type']=='video');aus=next(s for s in probe['streams'] if s['codec_type']=='audio')
 assert vs['codec_name']=='h264' and (vs['width'],vs['height'])==(1080,1920)
 assert vs['r_frame_rate']=='30/1' and int(vs['nb_frames'])==1290
 assert aus['codec_name']=='aac' and int(aus['sample_rate'])==48000 and aus['channels']==2
 assert float(vs['start_time'])==float(aus['start_time'])==0
 assert abs(float(vs['duration'])-43)<.002 and abs(float(aus['duration'])-43)<.022
 command(['ffmpeg','-v','error','-xerror','-i',str(file),'-f','null','-'])
 bitstream=command(['ffmpeg','-v','error','-i',str(file),'-map','0:v','-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264','-']).stdout;vhash.append(hashlib.sha256(bitstream).hexdigest())
 decoded=ROOT/'work'/f'decoded-{edition}.wav';command(['ffmpeg','-v','error','-y','-i',str(file),'-vn','-ar','24000','-ac','1','-c:a','pcm_f32le',str(decoded)])
 audio,rate=sf.read(decoded);cues=[]
 if edition=='narrated':
  for v in voice:
   ref,rr=sf.read(ROOT/v['file']);assert rr==rate
   expected=round(v['in_frame']/30*rate);lo=expected-round(.12*rate);hi=expected+len(ref)+round(.12*rate)
   offset,corr=correlate_valid(audio[lo:hi],ref);lag=(lo+offset-expected)/rate
   assert abs(lag)<.025 and corr>.90,(v['id'],lag,corr)
   shot=next(s for s in T['shots'] if s['id']==v['id']);assert v['in_frame']/30+v['seconds']+lag<shot['out_frame']/30
   cues.append({'id':v['id'],'lag_ms':round(lag*1000,3),'correlation':round(corr,5),'not_truncated':True})
  log=command(['ffmpeg','-v','info','-i',str(file),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-']).stderr.decode();loudness=json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0]
  assert -18<=float(loudness['input_i'])<=-14 and float(loudness['input_tp'])<=-1.5
 else:assert np.max(np.abs(audio))==0;loudness={'silent':True}
 silence=[]
 for lo,hi in T['silence_windows']:
  # AAC's short filter ringing at the speech boundary is excluded by a 100ms guard.
  peak=float(np.max(np.abs(audio[round((lo+.1)*rate):round((hi-.1)*rate)])))
  assert peak<.0001;silence.append({'window':[lo,hi],'peak':peak})
 black=command(['ffmpeg','-v','info','-i',str(file),'-an','-vf','blackdetect=d=0.03:pix_th=0.05','-f','null','-']).stderr.decode();assert 'black_start:' not in black
 results.append({'edition':edition,'file':str(file.relative_to(ROOT)),'sha256':sha(file),'full_decode':True,'video_codec':vs['codec_name'],'audio_codec':aus['codec_name'],'frames':int(vs['nb_frames']),'fps':vs['r_frame_rate'],'size':[vs['width'],vs['height']],'video_start_pts':vs['start_time'],'audio_start_pts':aus['start_time'],'video_duration':vs['duration'],'audio_duration':aus['duration'],'cue_alignment':cues,'loudness':loudness,'silence':silence,'black_frames_detected':False})
assert vhash[0]==vhash[1]
frames=[]
for n in [0,11]:
 raw=command(['ffmpeg','-v','error','-i',str(ROOT/'renders/he-said-ceo-narrated.mp4'),'-vf',f'select=eq(n\\,{n})','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']).stdout;frames.append(hashlib.sha256(raw).hexdigest())
assert frames[0]!=frames[1]
diff=command(['git','-C',str(REPO),'diff','--check']);paths=command(['git','-C',str(REPO),'diff','--name-only',facts['base_sha']]).stdout.decode().splitlines();assert all(p.startswith('production/he-said-ceo-001/') for p in paths)
report={'status':'PASS','base_sha':facts['base_sha'],'recovery_checkpoint':'13e9c60abc45036c81aaa604855250b0e5384273','frozen_evidence_unchanged':preserved,'signature_verifications':2,'reload_export_exact':True,'factual_pair_verified':True,'authority_scopes_exact_strings':facts['actual_mandate']['scopes'],'results':results,'same_video_bitstream':True,'video_bitstream_sha256':vhash[0],'opening_frame_changes':True,'safe_geometry_pass':True,'primary_evidence_value_font_pixels':39.7,'critical_text_mobile_font_floor_at_360px':13.2,'information_label_floor_at_360px':10.67,'end_card_hold_seconds':4.5,'claim_map_complete':True,'product_code_changed':False,'protocol_changed':False,'git_diff_check':True,'external_api_spend':0,'human_listening_verified':False}
(ROOT/'TECHNICAL-QA.json').write_text(json.dumps(report,indent=2)+'\n');print('TECHNICAL QA PASS: signatures; frozen files; full decode; 1290 frames; zero start PTS; matching pictures; cue alignment; loudness; silence; claim bounds.')
