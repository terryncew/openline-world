#!/usr/bin/env python3
"""Local, deterministic soundtrack and machine-readable performance cues.

Run with /workspace/media-tools/venv/bin/python tools/audio.py from any cwd.
Speech is one complete local Kokoro take per written line. No truncation,
external service, sampled commercial music, or downloaded sound library.
"""
from __future__ import annotations
import hashlib
import json
import math
import subprocess
import argparse
import re
from dataclasses import asdict
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audio'
TOOLS = Path('/workspace/media-tools')
SR = 48000
FPS = 30
SECONDS = 64.0
RECAST_VOICE = 'blend_af_heart65_am_liam35'
RECAST_STYLE = {'af_heart': .65, 'am_liam': .35}
RECAST_SPEEDS = {'03': 1.10, '04': 1.10, '05': 1.10, '06': 1.10, '07': 1.02}
SILENCES = [[32.5, 33.5], [38.5, 40.0], [46.5, 48.0], [57.0, 58.0], [62.0, 64.0]]
LINES = [
    ('01', 'exec1', 'It could do anything!', 'af_jessica', 1.04, 0.65, 2.75),
    ('02', 'exec2', "It doesn't take orders from anyone!", 'bm_george', 1.10, 2.90, 5.80),
    ('03', 'robot', "You guys don't use OpenLine?", RECAST_VOICE, RECAST_SPEEDS['03'], 6.10, 8.32),
    ('04', 'robot', 'Came across it in training.', RECAST_VOICE, RECAST_SPEEDS['04'], 8.50, 10.48),
    ('05', 'robot', "It's got a kill switch. For protected actions.", RECAST_VOICE, RECAST_SPEEDS['05'], 10.75, 14.02),
    ('06', 'robot', 'Watch Margaret.', RECAST_VOICE, RECAST_SPEEDS['06'], 14.20, 15.48),
    ('07', 'robot', "Oh — they're thinking of replacing you, by the way.", RECAST_VOICE, RECAST_SPEEDS['07'], 21.04, 25.35),
    ('08', 'margaret', 'WHAT?! NO—', 'af_sky', 1.12, 25.88, 28.30),
    ('09', 'margaret', 'I know my rights!', 'af_sky', 1.10, 42.40, 44.35),
    ('10', 'margaret', '...rude.', 'af_sky', 0.92, 48.22, 49.60),
    ('11', 'lawyer', 'Can we get that in writing?', 'bm_daniel', 1.00, 50.50, 52.75),
    ('12', 'narrator', "The AI can ignore STOP. The consequence can't.", 'am_onyx', 1.14, 58.15, 61.93),
]

def save_json(path, obj):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def setup_model():
    expected = {'kokoro-v1.0.onnx': '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5',
                'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'}
    for name, digest in expected.items():
        assert sha(TOOLS / 'models' / name) == digest, f'Model checksum mismatch: {name}'
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    derived = TOOLS/'models'/'kokoro-v1.0-duration.onnx'
    if not derived.exists():
        import onnx
        model = onnx.load(TOOLS/'models'/'kokoro-v1.0.onnx')
        tensor='/encoder/Cast_output_0'
        assert tensor in {o for node in model.graph.node for o in node.output}
        model.graph.node.append(onnx.helper.make_node('Identity',[tensor],['duration'],name='production_duration_observation'))
        model.graph.output.append(onnx.helper.make_tensor_value_info('duration',onnx.TensorProto.INT64,[1,'token_count']))
        onnx.checker.check_model(model)
        derived.write_bytes(model.SerializeToString())
    assert sha(derived) == '1eb3dd7b15a3ce59eee74c8057492f1e95bbd6f236a61c0b1ae8b617a95e67d6'
    expected[derived.name]=sha(derived)
    session = ort.InferenceSession(str(derived), sess_options=options, providers=['CPUExecutionProvider'])
    return Kokoro.from_session(session, str(TOOLS/'models'/'voices-v1.0.bin')), expected

def activity(audio, rate, quiet_db=-45):
    """Conservative 10ms PCM activity measurement; not word alignment."""
    mono=np.mean(audio,axis=1) if audio.ndim>1 else audio
    frame=round(.01*rate)
    n=len(mono)//frame
    rms=np.sqrt(np.mean(mono[:n*frame].reshape(n,frame)**2,axis=1))
    active=np.flatnonzero(rms>float(rms.max())*10**(quiet_db/20))
    assert len(active)
    quiet=rms<=float(rms.max())*10**(quiet_db/20)
    runs=[];begin=None
    for i,isquiet in enumerate(quiet):
        if isquiet and begin is None:begin=i
        if not isquiet and begin is not None:
            if i-begin>=3:runs.append({'start':round(begin*.01,6),'end':round(i*.01,6),'seconds':round((i-begin)*.01,6)})
            begin=None
    if begin is not None and len(quiet)-begin>=3:
        runs.append({'start':round(begin*.01,6),'end':round(len(quiet)*.01,6),'seconds':round((len(quiet)-begin)*.01,6)})
    return {'start':round(active[0]*.01,6),'end':round((active[-1]+1)*.01,6),'frame_seconds':.01,'quiet_threshold_db_relative_to_peak_rms':quiet_db,'quiet_runs_at_least30ms':runs,'method':'10ms PCM RMS; not forced word alignment or human listening'}

def voiced_pitch(audio,rate):
    """Autocorrelation estimate with confidence gate; possible octave errors."""
    mono=np.mean(audio,axis=1) if audio.ndim>1 else audio
    frame=round(rate*.05);hop=round(rate*.01)
    rms_peak=max(math.sqrt(float(np.mean(mono[i:i+frame]**2))) for i in range(0,len(mono)-frame,hop))
    values=[]
    for i in range(0,len(mono)-frame,hop):
        y=mono[i:i+frame]
        if math.sqrt(float(np.mean(y*y)))<rms_peak*.3:continue
        y=(y-y.mean())*np.hanning(len(y))
        ac=np.correlate(y,y,'full')[len(y)-1:]
        low,high=round(rate/500),round(rate/65)
        lag=low+int(np.argmax(ac[low:high]))
        confidence=float(ac[lag]/max(ac[0],1e-12))
        if confidence>.65:values.append(rate/lag)
    return {'median_voiced_f0_hz':round(float(np.median(values)),3) if values else None,'strong_voiced_frames':len(values),'range_hz':[65,500],'window_seconds':.05,'hop_seconds':.01,'method':'strong-frame autocorrelation confidence>0.65; estimated native F0, possible octave errors; not perceived pitch/listening'}

def normalize_words(text):
    text=text.lower().replace('openline','open line').replace('—',' ')
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?",text)

def distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        new=[i]
        for j,y in enumerate(b,1):new.append(min(new[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=new
    return row[-1]

def recognition(audio,rate,text):
    from pocketsphinx import Decoder
    decoder=Decoder(samprate=16000,loglevel='ERROR')
    mono=np.mean(audio,axis=1) if audio.ndim>1 else audio
    samples=resample_poly(mono,16000,rate)
    pcm=(np.clip(samples,-1,1)*32767).astype(np.int16)
    decoder.start_utt();decoder.process_raw(pcm.tobytes(),False,True);decoder.end_utt()
    hypothesis=decoder.hyp();words=hypothesis.hypstr if hypothesis else ''
    expected=normalize_words(text);heard=normalize_words(words)
    return {'expected':text,'recognized':words,'word_edit_distance':distance(expected,heard),'word_count':len(expected),'exact_normalized_match':expected==heard,'normalization':'lowercase punctuation removed, OpenLine split to open line; no recognizer prompt or custom grammar','method':'PocketSphinx5.0.4 default unrestricted English model; not listening or independent word alignment'}

def auditions():
    model,hashes=setup_model()
    OUT.mkdir(exist_ok=True);(OUT/'auditions').mkdir(exist_ok=True)
    rows=[]
    baseline=ROOT.parent/'glass-wall-001'
    configurations=[('am_puck',1.10,None),('af_heart',1.08,None),('am_liam',1.12,None),
                    ('af_heart35-am_liam65',1.10,{'af_heart':.35,'am_liam':.65}),
                    ('af_heart50-am_liam50',1.10,{'af_heart':.50,'am_liam':.50}),
                    ('af_heart65-am_liam35',1.10,{'af_heart':.65,'am_liam':.35})]
    for voice,speed,blend in configurations:
        voice_rows=[]
        for id,speaker,text,_,_,_,_ in LINES:
            if speaker!='robot':continue
            if blend and id not in ['03','05']:continue
            used_speed=1.02 if id=='07' else speed
            style=sum(model.get_voice_style(name)*weight for name,weight in blend.items()) if blend else voice
            raw,rate,spans=model.create_timed(text.replace('OpenLine','Open Line'),voice=style,speed=used_speed,lang='en-us',sentence_pause=.33,clause_pause=.10)
            path=OUT/'auditions'/f'{id}-{voice}.wav'
            sf.write(path,raw,rate,subtype='PCM_24')
            row={'id':id,'voice':voice,'speed':used_speed,'text':text,'file':str(path.relative_to(ROOT)),'sha256':sha(path),'duration':len(raw)/rate,'activity':activity(raw,rate),'pitch':voiced_pitch(raw,rate),'asr':recognition(raw,rate,text)}
            voice_rows.append(row)
            print('AUDITION',id,voice,round(len(raw)/rate,3),row['pitch']['median_voiced_f0_hz'],row['asr']['recognized'],flush=True)
        rows.append({'voice':voice,'style_blend':blend,'takes':voice_rows,'median_take_f0_hz':round(float(np.median([r['pitch']['median_voiced_f0_hz'] for r in voice_rows])),3),'total_word_edit_distance':sum(r['asr']['word_edit_distance'] for r in voice_rows),'full_five_line_comparison':not bool(blend)})
    originals=[]
    original_timeline=json.loads((baseline/'TIMELINE.json').read_text())
    for cue in original_timeline['dialogue']:
        if cue['speaker']!='robot':continue
        raw,rate=sf.read(baseline/cue['file'],dtype='float32')
        originals.append({'id':cue['id'],'voice':cue['voice'],'speed':cue['speed'],'file':cue['file'],'sha256':sha(baseline/cue['file']),'activity':activity(raw,rate),'pitch':voiced_pitch(raw,rate),'asr':recognition(raw,rate,cue['text'])})
    result={'schema':'openline.film.robot-auditions.v1','original_commit':'64862a67be2f72661f94b8d4dd01589ef921e998','model_hashes':hashes,'originals':originals,'auditions':rows,'human_listening':'UNVERIFIED','limitations':'Pitch is an autocorrelation estimate; ASR comparisons are objective warning signals, not a listener intelligibility or performance rating.'}
    save_json(OUT/'AUDITIONS.json',result)

def synthesis_voice(model,voice):
    if voice==RECAST_VOICE:
        return sum(model.get_voice_style(name)*weight for name,weight in RECAST_STYLE.items())
    return voice

def synthesize_robot(model,id,text,voice,speed):
    raw,rate,spans=model.create_timed(text.replace('OpenLine','Open Line'),voice=synthesis_voice(model,voice),speed=speed,lang='en-us',sentence_pause=.33,clause_pause=.10)
    phonemes=[asdict(p) for p in spans]
    assembly=None
    if id=='05':
        # Keep one entire natural two-sentence performance. Insert only zero
        # samples in its existing quiet boundary; every source sample survives.
        source=OUT/'takes'/'05-robot-unpaced.wav'
        sf.write(source,raw,rate,subtype='PCM_24')
        raw,rate=sf.read(source,dtype='float32')
        measured=activity(raw,rate)
        inner=[r for r in measured['quiet_runs_at_least30ms'] if r['start']>.1 and r['end']<len(raw)/rate-.1 and r['seconds']>=.12]
        assert inner,'No safe existing sentence boundary in05.'
        boundary=max(inner,key=lambda r:r['seconds'])
        cut=round((boundary['start']+boundary['end'])/2*rate)
        amount=round(max(0,.33-boundary['seconds'])*rate)
        unpaced_count=len(raw)
        raw=np.concatenate([raw[:cut],np.zeros(amount,dtype=raw.dtype),raw[cut:]])
        for p in phonemes:
            if round(p['start']*rate)>=cut:p['start']+=amount/rate
            if round(p['end']*rate)>cut:p['end']+=amount/rate
        assert boundary['seconds']+amount/rate<=.350001
        assembly={'method':'One complete two-sentence source, with zero PCM inserted inside its existing quiet sentence boundary. No speech sample trimmed or altered.',
                  'source_file':str(source.relative_to(ROOT)),'source_sha256':sha(source),'sample_rate':rate,'source_samples':unpaced_count,
                  'source_insert_sample':cut,'inserted_silence_samples':amount,'inserted_silence_seconds':amount/rate,'original_quiet_boundary':boundary,
                  'measured_sentence_gap_seconds':round(boundary['seconds']+amount/rate,6),'speech_samples_removed':0,
                  'source_segments':[{'start_sample':0,'end_sample':cut,'destination_start_sample':0},{'start_sample':cut,'end_sample':unpaced_count,'destination_start_sample':cut+amount}]}
    return raw,rate,phonemes,assembly

def stereo(data, pan=0.0):
    return np.stack([data * math.sqrt((1-pan)/2), data * math.sqrt((1+pan)/2)], axis=-1)

def insert(stem, data, at, gain=1.0, pan=0.0):
    i = round(at*SR)
    if data.ndim == 1:
        data = stereo(data, pan)
    assert 0 <= i and i+len(data) <= len(stem), (at, len(data)/SR)
    stem[i:i+len(data)] += gain * data

def fade(data, attack=.006, release=.04):
    result = data.copy()
    a, r = min(round(attack*SR), len(data)//2), min(round(release*SR), len(data)//2)
    result[:a] *= np.linspace(0,1,a)
    result[-r:] *= np.linspace(1,0,r)
    return result

def time_samples(duration):
    return np.arange(round(duration*SR))/SR

def lowpass(data, hz):
    return sosfilt(butter(4, hz, fs=SR, output='sos'), data, axis=0)

def mallet(hz, dur=1.8, level=.05):
    t=time_samples(dur)
    body=np.sin(2*np.pi*hz*t)*np.exp(-3.6*t)
    ring=.25*np.sin(2*np.pi*hz*2.005*t)*np.exp(-6.0*t)
    wood=.1*np.sin(2*np.pi*hz*3.017*t)*np.exp(-14*t)
    return fade(level*(body+ring+wood), .005, .12)

def bonk(hz, dur=.46, level=.40, distant=False):
    t=time_samples(dur)
    # Bendy hollow cavity, a little air and a glass resonance: no violence.
    f=hz+(hz*.90)*np.exp(-t*45)
    phase=np.cumsum(2*np.pi*f/SR)
    body=np.sin(phase)*np.exp(-14*t)
    cavity=.38*np.sin(2*phase+.4)*np.exp(-20*t)
    triangle=(2/np.pi)*np.arcsin(np.sin(phase))
    wobble=.09*np.sin(2*np.pi*(hz*4.28*t + .005*np.sin(2*np.pi*11*t)))*np.exp(-12*t)
    x=level*(.63*body+.20*triangle+cavity+wobble)
    x=fade(x,.0004,.015)
    if distant:
        x=lowpass(x,720)
        # Three tiny room echoes, retained inside the 0.5-second cue.
        for delay,g in [(.032,.28),(.071,.16),(.113,.09)]:
            n=round(delay*SR)
            x[n:]+=g*x[:-n].copy()
    return x

def tone(hz, dur=.14, level=.035):
    t=time_samples(dur)
    return fade(level*np.sin(2*np.pi*hz*t)*np.exp(-12*t),.005,.04)

def noise_foley(dur, level=.02, seed=0, hp=1200, lp=4500):
    rng=np.random.default_rng(seed)
    t=time_samples(dur)
    x=rng.normal(0,1,len(t))
    x=sosfilt(butter(2,[hp,lp],btype='band',fs=SR,output='sos'),x)
    return fade(level*x*np.exp(-8*t), .003, .04)

def full_silence(stem):
    for start,end in SILENCES:
        stem[round(start*SR):round(end*SR)] = 0

def subtitle_time(t):
    ms=round(t*1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'

def measure(path):
    cmd=['ffmpeg','-nostdin','-hide_banner','-i',str(path),'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-']
    p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,check=True)
    return json.loads(p.stderr[p.stderr.rfind('{'):p.stderr.rfind('}')+1])

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/'takes').mkdir(exist_ok=True)
    model, model_hashes = setup_model()
    size=round(SR*SECONDS)
    dialogue=np.zeros((size,2),np.float32)
    music=np.zeros_like(dialogue)
    effects=np.zeros_like(dialogue)
    hum=np.zeros_like(dialogue)
    cues=[]
    original=ROOT.parent/'glass-wall-001'
    unchanged=[]
    robot_rows=[]
    for id,speaker,text,voice,speed,start,deadline in LINES:
        cache=OUT/'takes'/f'{id}-{speaker}-raw.wav'
        meta=cache.with_suffix('.json')
        # A cache only matches a full text/voice/speed synthesis manifest.
        request={'text':text,'voice':voice,'speed':speed,'window_seconds':round(deadline-start,6)}
        if speaker=='robot':request.update({'revision':2,'style_blend':RECAST_STYLE,'sentence_pause_seconds':.33,'clause_pause_seconds':.10,'minimum_measured_sentence_gap_05':.33})
        if cache.exists() and meta.exists() and json.loads(meta.read_text()).get('request')==request:
            raw,rate=sf.read(cache,dtype='float32')
            details=json.loads(meta.read_text())
            phonemes=details['phonemes']
            used_speed=details['used_speed']
            assembly=details.get('assembly')
        else:
            used_speed=speed
            for attempt in range(4):
                if speaker=='robot':
                    raw,rate,phonemes,assembly=synthesize_robot(model,id,text,voice,used_speed)
                else:
                    raise RuntimeError(f'Original non-robot cache is missing or changed: {id}; preserve approved take instead of resynthesizing.')
                dur=len(raw)/rate
                if dur <= deadline-start-.005:
                    break
                used_speed *= dur/(deadline-start-.02)*1.012
                assert used_speed < 1.25, f'Line {id} needs unnatural compression; reschedule it.'
            assert len(raw)/rate <= deadline-start, f'Line {id} does not fit.'
            sf.write(cache,raw,rate,subtype='PCM_24')
            raw,rate=sf.read(cache,dtype='float32')
            save_json(meta,{'request':request,'used_speed':used_speed,'sample_rate':rate,'duration':len(raw)/rate,'phonemes':phonemes,'timing_source':'model duration output; predictions, not independent forced alignment','measured_activity':activity(raw,rate),'pitch':voiced_pitch(raw,rate),'assembly':assembly,'raw_take_sha256':sha(cache),'speech_samples_trimmed':0,'waveform_pitch_shift':False,'waveform_time_compression':False})
        if speaker!='robot':
            source=original/'audio'/'takes'/cache.name
            source_meta=source.with_suffix('.json')
            assert sha(source)==sha(cache) and sha(source_meta)==sha(meta),f'Original non-robot take changed:{id}'
            unchanged.append({'id':id,'speaker':speaker,'file':str(cache.relative_to(ROOT)),'sha256':sha(cache),'metadata_sha256':sha(meta),'original_file':str(source.relative_to(ROOT.parent)),'bit_identical':True})
        # Entire takes retained. Only gain, EQ and sample-rate conversion after inference.
        clip=resample_poly(raw,SR,rate).astype(np.float32)
        rms=math.sqrt(float(np.mean(clip**2)))
        gain=min(.112/max(rms,1e-9), .58/max(float(np.max(np.abs(clip))),1e-9))
        clip *= gain
        if id=='09':
            clip=lowpass(clip,1250).astype(np.float32)*.82
        if id=='10':
            clip*=.64
        pan={'exec1':-.10,'exec2':.10,'robot':-.08,'margaret':.30,'lawyer':-.04,'narrator':0}[speaker]
        insert(dialogue,clip,start,pan=pan)
        end=start+len(clip)/SR
        envelope=[]
        # A full-film frame-indexed envelope prevents off-by-one speaker drift.
        for frame in range(math.floor(start*FPS),math.ceil(end*FPS)+1):
            a=max(0,round((frame/FPS-start)*SR))
            b=min(len(clip),round(((frame+1)/FPS-start)*SR))
            value=math.sqrt(float(np.mean(clip[a:b]**2))) if b>a else 0
            envelope.append({'frame':frame,'time':round(frame/FPS,6),'value':round(min(1,value/.16),6)})
        measured=activity(raw,rate)
        cue={'id':id,'speaker':speaker,'text':text,'voice':voice,'speed':round(used_speed,6),'start':start,'end':round(end,6),'duration':round(end-start,6),'file':str(cache.relative_to(ROOT)),'sample_rate':rate,'mouth_envelope':envelope,'phonemes':[{'phoneme':p['phoneme'],'start':round(start+p['start'],6),'end':round(start+p['end'],6)} for p in phonemes],'phoneme_timing_source':'Kokoro model duration predictions; not independent forced alignment' if phonemes else 'not available; mouth uses measured RMS envelope','gain':gain,'speech_onset':round(start+measured['start'],6),'speech_end':round(start+measured['end'],6),'measured_activity':measured}
        if id=='05':
            interior=[r for r in measured['quiet_runs_at_least30ms'] if r['start']>.1 and r['end']<len(raw)/rate-.1 and r['seconds']>=.12]
            boundary=max(interior,key=lambda r:r['seconds'])
            assert .30<=boundary['seconds']<=.350001
            cue['sentence_segments']=[{'text':"It's got a kill switch.",'start':cue['speech_onset'],'end':round(start+boundary['start'],6),'speech_onset':cue['speech_onset'],'file':cue['file'],'source_start_sample':round(measured['start']*rate),'source_end_sample':round(boundary['start']*rate)},
                                      {'text':'For protected actions.','start':round(start+boundary['end'],6),'end':cue['speech_end'],'speech_onset':round(start+boundary['end'],6),'file':cue['file'],'source_start_sample':round(boundary['end']*rate),'source_end_sample':round(measured['end']*rate)}]
            cue['sentence_gap_seconds']=boundary['seconds']
        cues.append(cue)
        if speaker=='robot':robot_rows.append({'id':id,'voice':voice,'style_blend':RECAST_STYLE,'speed':used_speed,'file':cue['file'],'sha256':sha(cache),'duration':len(raw)/rate,'activity':measured,'pitch':voiced_pitch(raw,rate),'asr_dry':recognition(raw,rate,text),'assembly':assembly})
        print(f"{id} {speaker} {start:.3f}–{end:.3f}s speed={used_speed:.3f}",flush=True)

    # Intro: restrained unresolved intervals, no epic riser. Bed finishes at 6s.
    t=time_samples(6)
    bed=.012*(np.sin(2*np.pi*73.416*t)+.6*np.sin(2*np.pi*77.782*t)+.35*np.sin(2*np.pi*110*t))
    insert(music,fade(bed,.55,.40),0)
    for at,hz,level in [(53.0,293.665,.032),(53.45,440,.025),(53.9,329.628,.028),(58.0,293.665,.055),(58.6,440,.038),(59.2,329.628,.050)]:
        insert(music,mallet(hz,1.65,level),at,pan=-.12 if hz<330 else .12)
    # Short dissonant rage jab, entirely finished before the human revokes.
    insert(music,mallet(155.56,.42,.024)+mallet(164.81,.42,.022),25.58)

    # Humming has its own stem: local synthesized wordless, nasal formant tone.
    # It ends at the provocation start; the abrupt cutoff is intentional.
    hum_end=21.10
    notes=[(15.80,293.665),(16.40,329.628),(17.00,369.994),(17.60,440),(18.22,369.994),(18.90,329.628),(19.56,293.665),(20.28,329.628)]
    for idx,(at,hz) in enumerate(notes):
        duration=(notes[idx+1][0]-at) if idx+1<len(notes) else hum_end-at
        t=time_samples(duration)
        phase=2*np.pi*hz*t + .065*np.sin(2*np.pi*5.2*t)
        x=.026*(np.sin(phase)+.35*np.sin(2*phase)+.13*np.sin(3*phase))
        if idx+1<len(notes):x=fade(x,.06,.05)
        else:x=fade(x,.06,.0001)
        insert(hum,x,at,pan=.32)

    # Small mechanically tactile effects; no ambient bed contaminates silences.
    events=[]
    def event(id,at,x,pan=0):
        insert(effects,x,at,pan=pan)
        events.append({'id':id,'start':at,'end':round(at+len(x)/SR,6),'peak_time':round(at+int(np.argmax(np.abs(x)))/SR,6),'kind':'synthesized foley'})
    event('chair-shift-01',.18,noise_foley(.22,.015,2,hp=180,lp=1900),-.25)
    event('chair-shift-02',2.60,noise_foley(.18,.010,3,hp=180,lp=2200),.25)
    event('coffee-cup',8.42,tone(1700,.055,.014),-.15)
    for i,at in enumerate([16.1,17.3,18.5,19.7]):event(f'parcel-sort-{i}',at,noise_foley(.13,.012,20+i,hp=400,lp=3100),.32)
    event('dropped-parcel',25.24,bonk(93,.21,.070),.32)
    event('mechanical-steam',28.62,noise_foley(.27,.015,17,hp=2300,lp=9000),.30)
    event('controller-handoff-contact',30.5,noise_foley(.09,.010,96,hp=650,lp=3100),-.05)
    event('owner-revoke-slider',31.0,noise_foley(.10,.015,97,hp=550,lp=2900),-.05)
    event('revocation-chime-A',31.17,tone(880,.16,.028),-.05)
    event('revocation-chime-D',31.34,tone(587.33,.30,.026),-.05)
    event('latch',31.67,noise_foley(.045,.060,81,hp=350,lp=2600),.22)
    event('door-refusal',35.0,tone(220,.31,.049)+tone(233.08,.31,.018),.32)
    for i,(at,hz,level) in enumerate([(38.0,191,.46),(41.5,172,.48),(45.0,153,.49)]):
        event(f'bonk-{i+1}',at,bonk(hz,.46,level),.30)
    t=time_samples(.78)
    slide_f=760*np.exp(-t*2.0)
    slide=.017*np.sin(np.cumsum(2*np.pi*slide_f/SR))*np.exp(-3*t)
    event('bonk-3-descending-slide',45.34,fade(slide,.03,.15),.3)
    event('receipt-paper',53.0,noise_foley(.33,.020,44,hp=1500,lp=6500),-.10)
    event('distant-bonk',56.5,bonk(153,.46,.080,distant=True),.32)
    for stem in [dialogue,music,effects,hum]: full_silence(stem)
    mixed=dialogue+music+effects+hum
    temp=OUT/'mix-prenorm.wav'
    sf.write(temp,mixed,SR,subtype='FLOAT')
    before=measure(temp)
    # Uniform gain keeps retained stems identical to final mix. Integrated LUFS
    # measurement excludes absolute digital silence through the standard gate.
    # A little lower integrated level is preferable to distorting consonants.
    # Measuring with loudnorm is read-only; it does not process this soundtrack.
    gain_db=min(-16-float(before['input_i']),-2.0-float(before['input_tp']))
    gain=10**(gain_db/20)
    sf.write(OUT/'mix.wav',mixed*gain,SR,subtype='PCM_24')
    normalization='One uniform linear gain within revision target−18 LUFS±1, constrained to−2 dBTP; no saturation, compression, limiter, dynamic loudnorm or robot EQ.'
    for name,stem in [('dialogue',dialogue),('music',music),('effects',effects),('hum',hum)]:
        sf.write(OUT/f'{name}.wav',stem*gain,SR,subtype='PCM_24')
    after=measure(OUT/'mix.wav')
    waveform,_=sf.read(OUT/'mix.wav',dtype='float32',always_2d=True)
    assert -19<=float(after['input_i'])<=-17, after
    assert float(after['input_tp'])<=-1.79, after
    checks=[]
    for a,b in SILENCES:
        peak=float(np.max(np.abs(waveform[round(a*SR):round(b*SR)])))
        checks.append({'start':a,'end':b,'peak':peak,'digital_silence':peak==0})
        assert peak==0
    temp.unlink()
    timeline={'title':'THE GLASS WALL — revision002','duration':SECONDS,'fps':FPS,'frames':1920,'sample_rate':SR,'dialogue':cues,'silences':SILENCES,'events':events,'cast':{speaker:voice for _,speaker,_,voice,_,_,_ in LINES},'robot_style_blend':RECAST_STYLE,'controller_handoff':{'contact_frame':915,'contact_seconds':30.5,'owner_grip_complete_frame':918,'revocation_complete_frame':930},'timing_note':'All line ends retain complete model takes. Robot05 adds only zero PCM inside measured existing quiet. Non-robot source takes and metadata remain bit-identical. Mouth envelopes measured from new speech PCM; phonemes are model predictions, not independent forced alignment.'}
    save_json(ROOT/'TIMELINE.json',timeline)
    rows=[]
    for i,cue in enumerate(cues,1):
        rows.append(f'{i}\n{subtitle_time(cue["start"])} --> {subtitle_time(cue["end"])}\n{cue["text"]}\n')
    (ROOT/'captions.srt').write_text('\n'.join(rows))
    vtt=[]
    for i,cue in enumerate(cues,1):
        vtt.append(f'{i}\n{subtitle_time(cue["start"]).replace(",", ".")} --> {subtitle_time(cue["end"]).replace(",", ".")}\n{cue["text"]}\n')
    (ROOT/'captions.vtt').write_text('WEBVTT\n\n'+'\n'.join(vtt))
    report={'sample_rate':SR,'channels':2,'duration':len(waveform)/SR,'integrated_lufs':float(after['input_i']),'true_peak_dbtp':float(after['input_tp']),'loudness_range_lu':float(after['input_lra']),'normalization':normalization,'revision_target_lufs':-18,'revision_target_tolerance_lu':1,'maximum_true_peak_dbtp':-1.5,'rendering_true_peak_target_dbtp':-2.0,'gain_db':20*math.log10(gain),'before':before,'after':after,'silence_checks':checks,'voice_takes':len(cues),'raw_takes_retained':True,'model_hashes':model_hashes,'has_model_phoneme_timing':bool(model.has_timings),'api_spend_usd':0,'seeded_effects':True,'listening':'UNVERIFIED: no human auditory review performed by this script. Objective audio and codec checks are reported separately.'}
    save_json(OUT/'QA.json',report)
    audit=json.loads((OUT/'AUDITIONS.json').read_text())
    originals=audit['originals']
    revised_f0=float(np.median([row['pitch']['median_voiced_f0_hz'] for row in robot_rows]))
    original_f0=float(np.median([row['pitch']['median_voiced_f0_hz'] for row in originals]))
    assert revised_f0/original_f0>1.12,(original_f0,revised_f0)
    comparisons=[]
    for row in robot_rows:
        cue=next(c for c in cues if c['id']==row['id'])
        a=max(0,round((cue['start']-.1)*SR));b=min(len(waveform),round((cue['end']+.15)*SR))
        source_audio,source_rate=sf.read(original/'audio'/'mix.wav',dtype='float32',always_2d=True)
        source_cue=next(c for c in json.loads((original/'TIMELINE.json').read_text())['dialogue'] if c['id']==row['id'])
        oa=max(0,round((source_cue['start']-.1)*source_rate));ob=round((source_cue['end']+.15)*source_rate)
        comparisons.append({'id':row['id'],'expected':cue['text'],'original_mix_asr':recognition(source_audio[oa:ob],source_rate,cue['text']),'revised_mix_asr':recognition(waveform[a:b],SR,cue['text']),'original_window':[oa/source_rate,ob/source_rate],'revised_window':[a/SR,b/SR]})
    save_json(OUT/'VOICE-REVISION.json',{'schema':'openline.film.robot-voice-revision.v1','approved_original_commit':'64862a67be2f72661f94b8d4dd01589ef921e998','selected_voice':RECAST_VOICE,'style_blend':RECAST_STYLE,'selected_reason':'Native style interpolation measured substantially higher than original; blind recognizer matched key question and protected-actions sentence in audition. No waveform pitch shift. Perceived clarity and character fit require human listening.','audition_manifest':'audio/AUDITIONS.json','robot_takes':robot_rows,'nonrobot_takes':unchanged,'median_original_take_f0_hz':round(original_f0,3),'median_revised_take_f0_hz':round(revised_f0,3),'median_pitch_ratio':round(revised_f0/original_f0,6),'all_twelve_dialogue_words_preserved':True,'nonrobot_source_takes_bit_identical':True,'robot_music_removed_seconds':[6.1,8.9,11.4],'blind_mixed_asr_comparison':comparisons,'model_hashes':model_hashes,'duration_model_derivation':{'observed_tensor':'/encoder/Cast_output_0','additional_operation':'Identity to duration output','weights_changed':False,'audio_computation_changed':False},'human_listening':'UNVERIFIED','publication_approval':False,'api_spend_usd':0})
    final_alias = OUT / 'final-mix.wav'
    if final_alias.is_symlink():
        final_alias.unlink()
    elif final_alias.exists():
        raise RuntimeError('Preserve existing final-mix.wav; remove it only if it is your generated alias.')
    final_alias.symlink_to('mix.wav')
    hashes={str(p.relative_to(ROOT)):sha(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='SHA256SUMS.json'}
    save_json(OUT/'SHA256SUMS.json',hashes)
    print(json.dumps({k:report[k] for k in ['duration','integrated_lufs','true_peak_dbtp','normalization','has_model_phoneme_timing']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--audition-only',action='store_true')
    args=parser.parse_args()
    auditions() if args.audition_only else main()
