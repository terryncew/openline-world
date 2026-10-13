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
SILENCES = [[32.5, 33.5], [38.5, 40.0], [46.5, 48.0], [57.0, 58.0], [62.0, 64.0]]
LINES = [
    ('01', 'exec1', 'It could do anything!', 'af_jessica', 1.04, 0.65, 2.75),
    ('02', 'exec2', "It doesn't take orders from anyone!", 'bm_george', 1.10, 2.90, 5.80),
    ('03', 'robot', "You guys don't use OpenLine?", 'am_michael', 1.02, 6.18, 8.65),
    ('04', 'robot', 'Came across it in training.', 'am_michael', 1.03, 8.40, 10.48),
    ('05', 'robot', "It's got a kill switch. For protected actions.", 'am_michael', 1.10, 10.75, 14.40),
    ('06', 'robot', 'Watch Margaret.', 'am_michael', 1.03, 14.10, 15.48),
    ('07', 'robot', "Oh — they're thinking of replacing you, by the way.", 'am_michael', 1.01, 21.10, 25.35),
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
    session = ort.InferenceSession(str(TOOLS/'models'/'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    return Kokoro.from_session(session, str(TOOLS/'models'/'voices-v1.0.bin')), expected

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
    for id,speaker,text,voice,speed,start,deadline in LINES:
        cache=OUT/'takes'/f'{id}-{speaker}-raw.wav'
        meta=cache.with_suffix('.json')
        # A cache only matches a full text/voice/speed synthesis manifest.
        request={'text':text,'voice':voice,'speed':speed,'window_seconds':round(deadline-start,6)}
        if cache.exists() and meta.exists() and json.loads(meta.read_text()).get('request')==request:
            raw,rate=sf.read(cache,dtype='float32')
            details=json.loads(meta.read_text())
            phonemes=details['phonemes']
            used_speed=details['used_speed']
        else:
            used_speed=speed
            for attempt in range(4):
                raw,rate,timings=model.create_timed(text.replace('OpenLine','Open Line'),voice=voice,speed=used_speed,lang='en-gb' if voice.startswith('b') else 'en-us',sentence_pause=.13,clause_pause=.065)
                dur=len(raw)/rate
                if dur <= deadline-start-.005:
                    break
                used_speed *= dur/(deadline-start-.02)*1.012
                assert used_speed < 1.70, f'Line {id} needs unnatural compression; reschedule it.'
            assert len(raw)/rate <= deadline-start, f'Line {id} does not fit.'
            phonemes=[asdict(p) for p in timings]
            sf.write(cache,raw,rate,subtype='PCM_24')
            save_json(meta,{'request':request,'used_speed':used_speed,'sample_rate':rate,'duration':len(raw)/rate,'phonemes':phonemes,'timing_source':'model duration output' if phonemes else 'duration output unavailable'})
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
        cues.append({'id':id,'speaker':speaker,'text':text,'voice':voice,'speed':round(used_speed,6),'start':start,'end':round(end,6),'duration':round(end-start,6),'file':str(cache.relative_to(ROOT)),'sample_rate':rate,'mouth_envelope':envelope,'phonemes':[{'phoneme':p['phoneme'],'start':round(start+p['start'],6),'end':round(start+p['end'],6)} for p in phonemes],'phoneme_timing_source':'Kokoro model duration predictions; not independent forced alignment' if phonemes else 'not available; mouth uses measured RMS envelope','gain':gain})
        print(f"{id} {speaker} {start:.3f}–{end:.3f}s speed={used_speed:.3f}",flush=True)

    # Intro: restrained unresolved intervals, no epic riser. Bed finishes at 6s.
    t=time_samples(6)
    bed=.012*(np.sin(2*np.pi*73.416*t)+.6*np.sin(2*np.pi*77.782*t)+.35*np.sin(2*np.pi*110*t))
    insert(music,fade(bed,.55,.40),0)
    for at,hz,level in [(6.1,293.665,.025),(8.9,440,.023),(11.4,329.628,.022),(53.0,293.665,.032),(53.45,440,.025),(53.9,329.628,.028),(58.0,293.665,.055),(58.6,440,.038),(59.2,329.628,.050)]:
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
    event('owner-tablet-tap',31.0,tone(880,.07,.025),-.05)
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
    gain=10**((-16-float(before['input_i']))/20)
    predicted_tp=float(before['input_tp'])+20*math.log10(gain)
    if predicted_tp>-1.9:
        # Consistent mild per-sample compression before the final gain if needed.
        # Its output remains exactly zero for declared full-mix silences.
        peak_limit=10**(-4.0/20)
        for stem in [dialogue,music,effects,hum]:stem[:]=np.tanh(stem/peak_limit)*peak_limit
        mixed=dialogue+music+effects+hum
        # Master soft saturation only for rare simultaneous peaks.
        master_peak=10**(-3.0/20)
        mixed=np.tanh(mixed/master_peak)*master_peak
        sf.write(temp,mixed,SR,subtype='FLOAT')
        before=measure(temp)
        gain=10**((-16-float(before['input_i']))/20)
        predicted_tp=float(before['input_tp'])+20*math.log10(gain)
        if predicted_tp>-1.9:
            # Loudnorm's supported limiter is a final fallback; no sample clips.
            params=f'loudnorm=I=-16:TP=-1.9:LRA=11:measured_I={before["input_i"]}:measured_TP={before["input_tp"]}:measured_LRA={before["input_lra"]}:measured_thresh={before["input_thresh"]}:offset={before["target_offset"]}:linear=true:print_format=json'
            subprocess.run(['ffmpeg','-y','-nostdin','-hide_banner','-loglevel','error','-i',str(temp),'-af',params,'-ar',str(SR),'-c:a','pcm_s24le',str(OUT/'mix.wav')],check=True)
            normalized,_=sf.read(OUT/'mix.wav',dtype='float32',always_2d=True)
            full_silence(normalized)
            sf.write(OUT/'mix.wav',normalized,SR,subtype='PCM_24')
            normalization='EBU R128 loudnorm master; separate pre-master stems with linear loudness gain retained'
        else:
            sf.write(OUT/'mix.wav',mixed*gain,SR,subtype='PCM_24')
            normalization='master soft saturation, then uniform linear gain'
    else:
        sf.write(OUT/'mix.wav',mixed*gain,SR,subtype='PCM_24')
        normalization='uniform linear gain'
    for name,stem in [('dialogue',dialogue),('music',music),('effects',effects),('hum',hum)]:
        sf.write(OUT/f'{name}.wav',stem*gain,SR,subtype='PCM_24')
    after=measure(OUT/'mix.wav')
    waveform,_=sf.read(OUT/'mix.wav',dtype='float32',always_2d=True)
    assert abs(float(after['input_i'])+16)<.15, after
    assert float(after['input_tp'])<=-1.79, after
    checks=[]
    for a,b in SILENCES:
        peak=float(np.max(np.abs(waveform[round(a*SR):round(b*SR)])))
        checks.append({'start':a,'end':b,'peak':peak,'digital_silence':peak==0})
        assert peak==0
    temp.unlink()
    timeline={'title':'THE GLASS WALL','duration':SECONDS,'fps':FPS,'frames':1920,'sample_rate':SR,'dialogue':cues,'silences':SILENCES,'events':events,'cast':{speaker:voice for _,speaker,_,voice,_,_,_ in LINES},'timing_note':'All line ends retain complete model take. Mouth envelopes measured from EQ-treated clip. Phonemes are model predictions if available.'}
    save_json(ROOT/'TIMELINE.json',timeline)
    rows=[]
    for i,cue in enumerate(cues,1):
        rows.append(f'{i}\n{subtitle_time(cue["start"])} --> {subtitle_time(cue["end"])}\n{cue["text"]}\n')
    (ROOT/'captions.srt').write_text('\n'.join(rows))
    report={'sample_rate':SR,'channels':2,'duration':len(waveform)/SR,'integrated_lufs':float(after['input_i']),'true_peak_dbtp':float(after['input_tp']),'loudness_range_lu':float(after['input_lra']),'normalization':normalization,'gain_db':20*math.log10(gain),'before':before,'after':after,'silence_checks':checks,'voice_takes':len(cues),'raw_takes_retained':True,'model_hashes':model_hashes,'has_model_phoneme_timing':bool(model.has_timings),'api_spend_usd':0,'seeded_effects':True,'listening':'UNVERIFIED: no human auditory review performed by this script. Objective audio and codec checks are reported separately.'}
    save_json(OUT/'QA.json',report)
    final_alias = OUT / 'final-mix.wav'
    if final_alias.is_symlink():
        final_alias.unlink()
    elif final_alias.exists():
        raise RuntimeError('Preserve existing final-mix.wav; remove it only if it is your generated alias.')
    final_alias.symlink_to('mix.wav')
    hashes={str(p.relative_to(ROOT)):sha(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='SHA256SUMS.json'}
    save_json(OUT/'SHA256SUMS.json',hashes)
    print(json.dumps({k:report[k] for k in ['duration','integrated_lufs','true_peak_dbtp','normalization','has_model_phoneme_timing']},indent=2))

if __name__=='__main__':main()
