from pathlib import Path
import json
p=Path(__file__).resolve().parents[1];shots=json.loads((p/'SHOTS.json').read_text());lookup={s['id']:s for s in shots['shots']}
lines=[
 {'id':'handover','text':'You hand over the work.'},
 {'id':'rules','text':'Not the rules.'},
 {'id':'revoke','text':'And you can change your mind.'},
 {'id':'receiver','text':'The receiver still decides.'},
 {'id':'permission','text':'A new worker needs your permission.'},
 {'id':'history','text':'The work, and its history, stay.'},
 {'id':'build','text':'Build around what stays.'},
 {'id':'brand','text':'OpenLine.'},
 {'id':'promise','text':"The worker can change. Your authority doesn't."},
 {'id':'developer','text':'Build your next worker around this boundary.'},
 {'id':'buyer','text':'Put the decision at the receiver.'},
]
(p/'NARRATION.json').write_text(json.dumps(lines,indent=2)+'\n')
master=[('job',4),('wren',5),('square',5),('owner',4),('allow',4),('work',6),('revoke',5),('stop',5),('stamp',3),('receipt-ui',7),('arrival',6),('newgrant',6),('continue',4),('history',5),('checkpoints',2),('together',5),('square-out',6),('end',8)]
sixty=[('job',2),('wren',4),('square',3),('owner',3),('allow',3),('work',3),('revoke',3),('stop',4),('stamp',2),('receipt-ui',5),('arrival',5),('newgrant',5),('continue',3),('history',4),('square-out',4),('end',7)]
thirty=[('job',1),('wren',3),('square',1),('allow',2),('revoke',2),('stop',3),('receipt-ui',3),('arrival',3),('newgrant',3),('continue',1.5),('history',2.5),('end',5)]
fifteen=[('job',.75),('wren',1.5),('allow',.75),('revoke',1),('stop',1.75),('receipt-ui',1.75),('arrival',1.5),('newgrant',1.5),('history',1.5),('end',3)]
# Compact cuts trim handles; the authority/event order stays exact.
voices={
 'master-90':[(9.6,'handover'),(14.7,'rules'),(28.45,'revoke'),(41.65,'receiver'),(54.55,'permission'),(64.8,'history'),(77,'build'),(82.75,'brand'),(85.0,'promise')],
 'flagship-60':[(5.4,'handover'),(9.7,'rules'),(18.15,'revoke'),(27.25,'receiver'),(37.35,'permission'),(45.4,'history'),(53.45,'brand'),(55.5,'promise')],
 'hero-30':[(2.15,'handover'),(6,'rules'),(25.1,'brand'),(26.15,'promise')],
 'cut-15':[(12.0,'promise')]
}
variants=[]
for name,edit in [('master-90',master),('flagship-60',sixty),('hero-30',thirty),('cut-15',fifteen),('social-vertical-30',thirty),('developer-ending',sixty+[('developer',8)]),('buyer-ending',sixty+[('buyer',8)])]:
 t=0;segs=[]
 for id,dur in edit:
  classification=lookup[id]['classification'] if id in lookup else ('REAL CAPTURE' if id=='receipt-ui' else 'EXPLANATORY VISUALIZATION')
  segs.append({'id':id,'start':t,'seconds':dur,'classification':classification,'source':lookup[id]['source'] if id in lookup else ('source/receipt-ui.png' if id=='receipt-ui' else 'source/'+id+'.png')});t+=dur
 voice=voices.get(name,voices['hero-30'] if 'vertical' in name else voices['flagship-60'])[:]
 if 'ending' in name:voice=voice+[(60.6,'developer' if name=='developer-ending' else 'buyer')]
 variants.append({'name':name,'seconds':t,'size':[1080,1920] if 'vertical' in name else [1920,1080],'fps':24,'segments':segs,'voice':[{'start':a,'id':b} for a,b in voice],'file':'renders/openline-'+name+'.mp4'})
(p/'EDITS.json').write_text(json.dumps({'master':'master-90','variants':variants},indent=2)+'\n')
print([(v['name'],v['seconds']) for v in variants])
