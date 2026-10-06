"""Local checksum-verified neural dialogue. Never calls a paid service."""
import json,hashlib
from pathlib import Path
import numpy as np,onnxruntime as ort,soundfile as sf
from kokoro_onnx import Kokoro
ROOT=Path(__file__).resolve().parents[1]
paths=[Path('/workspace/media-tools/models/kokoro-v1.0.onnx'),Path('/workspace/media-tools/models/voices-v1.0.bin')]
digests=['7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5','bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d']
for p,h in zip(paths,digests):assert hashlib.sha256(p.read_bytes()).hexdigest()==h
orig=ort.InferenceSession
def bounded(*a,**kw):
 o=ort.SessionOptions();o.intra_op_num_threads=2;o.inter_op_num_threads=1;o.enable_cpu_mem_arena=False;kw['sess_options']=o;return orig(*a,**kw)
ort.InferenceSession=bounded
m=Kokoro(*map(str,paths));timeline=json.loads((ROOT/'TIMELINE.json').read_text());entries=[]
(ROOT/'audio').mkdir(exist_ok=True)
for s in timeline['shots']:
 if 'voice' not in s:continue
 v=s['voice'];samples,rate=m.create(v['text'],voice='af_heart',speed=1.0,lang='en-us')
 active=np.flatnonzero(np.abs(samples)>.001)
 samples=samples[max(0,active[0]-int(.025*rate)):min(len(samples),active[-1]+int(.045*rate))]
 seconds=len(samples)/rate;available=(s['out_frame']-v['in_frame'])/30-.035
 # Timing is adjusted explicitly before the animatic, never by clipping speech.
 assert seconds<available, ('Adjust the timeline before rendering; never truncate a take', s['id'], seconds, available)
 dest=ROOT/v['file'];sf.write(dest,samples,rate,subtype='PCM_24')
 entries.append({'id':s['id'],**v,'seconds':seconds,'sample_rate':rate,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()});print(s['id'],round(seconds,3),flush=True)
(ROOT/'audio/VOICE-SOURCES.json').write_text(json.dumps({'engine':'kokoro-onnx 0.6.1','voice':'af_heart','speed':1.0,'synthesized':True,'human_recording':False,'model_sha256':digests[0],'voice_file_sha256':digests[1],'external_api_spend':0,'lines':entries},indent=2)+'\n')
