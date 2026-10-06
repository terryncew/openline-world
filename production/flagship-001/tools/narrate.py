"""Local campaign voice sources, generated once and shared by every cut."""
import os,json,hashlib
from pathlib import Path
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro
ROOT=Path(__file__).resolve().parents[1]
mp=Path(os.environ.get('KOKORO_MODEL','/workspace/media-tools/models/kokoro-v1.0.onnx'))
vp=Path(os.environ.get('KOKORO_VOICES','/workspace/media-tools/models/voices-v1.0.bin'))
expected=['7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5','bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d']
for path,digest in zip([mp,vp],expected):assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
original=ort.InferenceSession
def session(*a,**kw):
 opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1;opts.enable_cpu_mem_arena=False;kw['sess_options']=opts;return original(*a,**kw)
ort.InferenceSession=session
model=Kokoro(str(mp),str(vp));results=[]
for line in json.loads((ROOT/'NARRATION.json').read_text()):
 samples,rate=model.create(line['text'],voice='af_heart',speed=.96,lang='en-us')
 import numpy as np
 active=np.flatnonzero(np.abs(samples)>.001)
 if len(active):samples=samples[max(0,active[0]-int(.055*rate)):min(len(samples),active[-1]+int(.09*rate))]
 dest=ROOT/'audio'/('voice-'+line['id']+'.wav');sf.write(dest,samples,rate,subtype='PCM_24')
 entry={**line,'file':str(dest.relative_to(ROOT)),'seconds':len(samples)/rate,'sample_rate':rate,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()};results.append(entry);print(json.dumps(entry),flush=True)
(ROOT/'audio/VOICE-SOURCES.json').write_text(json.dumps({'engine':'kokoro-onnx 0.6.1','voice':'af_heart','speed':.96,'synthesized':True,'human_recording':False,'model_sha256':expected[0],'voice_file_sha256':expected[1],'upstream':'https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0','lines':results},indent=2)+'\n')
