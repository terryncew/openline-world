"""Build restrained phrase graphics from the revised speech timing."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
timeline = json.loads((ROOT/'TIMELINE.json').read_text())
cues = {c['id']:c for c in timeline['dialogue']}
parts = cues['05']['sentence_segments']
assert len(parts) == 2 and parts[1]['text'] == 'For protected actions.'
items = [
    {'id':'openline', 'start':cues['03'].get('speech_onset',cues['03']['start']),
     'end':cues['03']['end']+.20, 'lines':['OPENLINE'], 'font_sizes':[54],
     'rect':[88,76,470,104], 'fade_seconds':.12},
    {'id':'protected-actions', 'start':parts[1].get('speech_onset',parts[1]['start']),
     'end':parts[1]['end']+.25, 'lines':['FOR PROTECTED ACTIONS'], 'font_sizes':[46],
     'rect':[88,76,720,112], 'fade_seconds':.12},
    {'id':'controller-handoff', 'start':29.5, 'end':30.85,
     'lines':['OPENLINE','OWNER CONTROL'], 'font_sizes':[48,30],
     'rect':[88,874,470,138], 'fade_seconds':.12},
    {'id':'owner-revocation', 'start':31.05, 'end':32.30,
     'lines':['DOOR ACCESS','REVOKED BY OWNER'], 'font_sizes':[44,30],
     'rect':[88,874,570,138], 'fade_seconds':.12},
]
for item in items:
    assert item['end']-item['start'] > 2*item['fade_seconds']
(ROOT/'GRAPHICS.json').write_text(json.dumps({
    'native_size':[1920,1080], 'items':items,
    'purpose':'Phrase reinforcement and fictional authorization state; original graphic design, not recorded product UI.',
    'timing':'Question and protected-actions sentence use actual revised speech timing; owner state follows the owner slider cue at31.0s.',
},indent=2)+'\n')
print('Four phrase/state graphics prepared from current timeline.')
