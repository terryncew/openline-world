"""Mux deterministic picture and complete audio; preserve native timing."""
import argparse,json,subprocess,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--final',action='store_true');a=p.parse_args()
quality='final' if a.final else 'animatic'
mix=ROOT/'audio/final-mix.wav'
assert mix.exists(),mix
out=ROOT/('renders/the-glass-wall-revised.mp4' if a.final else 'review/the-glass-wall-animatic.mp4')
subprocess.run(['ffmpeg','-v','error','-y','-i',str(ROOT/f'source/picture-{quality}.mp4'),'-i',str(mix),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-t','64','-movflags','+faststart',str(out)],check=True)
print(out)
if a.final:
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(out),'-an','-c:v','copy',str(ROOT/'renders/the-glass-wall-muted.mp4')],check=True)
    subprocess.run(['ffmpeg','-v','error','-y','-ss','38.0','-i',str(out),'-frames:v','1',str(ROOT/'poster.png')],check=True)
    for name,t in [('opening-frame',0),('final-title-card',60)]:
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(out),'-frames:v','1',str(ROOT/f'{name}.png')],check=True)
