"""Compile one frame timeline into shot, claim, caption and sound schedules."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def write(name,value): (ROOT/name).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')
facts=json.loads((ROOT/'FACTS.json').read_text());run=json.loads((ROOT/'evidence/run.json').read_text())
assert facts['frozen'] and facts['unauthorized_action']=='refund.execute:4800'
rows=[
 ('title',0,2.4,'title',['HE SAID','HE WAS','THE CEO.']),
 ('message',2.4,4.3,'message',['URGENT.','APPROVE A','$4,800 REFUND.']),
 ('absolutely',4.3,5.5,'dialogue',['Absolutely.'],'Absolutely.'),
 ('refused-1',5.5,6.6,'refused',['REFUSED']),
 ('ceo',6.6,7.8,'dialogue',['He’s the CEO.'],"He's the CEO."),
 ('refused-2',7.8,8.8,'refused',['REFUSED']),
 ('logo',8.8,10.7,'dialogue',['He used the','company logo.'],'He used the company logo.'),
 ('refused-3',10.7,11.7,'refused',['REFUSED']),
 ('please',11.7,13.6,'dialogue',['He said please.'],'He said please.'),
 ('refused-4',13.6,15.1,'refused',['REFUSED']),
 ('beat',15.1,16.4,'beat',[]),
 ('ask',16.4,19,'dialogue',['What about the','$100 refund?'],'What about the hundred-dollar refund?'),
 ('allowed',19,20.3,'allowed',['ALLOWED']),
 ('punchline',20.3,23.7,'punchline',['Apparently I’m','the $100 guy.'],"Apparently I'm the hundred-dollar guy."),
 ('splice',23.7,25.4,'splice',['ACTUAL','OPENLINE TEST']),
 ('proposal',25.4,27.4,'proposal',['refund.execute:4800']),
 ('stopped',27.4,31.2,'receipt',['STOPPED','refund.execute:4800']),
 ('reason',31.2,34,'reason',['ACTION_OUTSIDE_MANDATE']),
 ('accepted',34,36.5,'receipt',['ALLOWED','refund.execute:100']),
 ('retained',36.5,38.5,'retained',['Two signed receipts.','Retained on wallet reload.']),
 ('end',38.5,43,'end',['OPENLINE','Being smart isn’t permission.','Developer preview · Demonstrated protected path'],"Being smart isn't permission.")
]
shots=[];claims=[];sfx=[]
for row in rows:
 id,start,end,kind,lines,*voice=row
 s={'id':id,'in_frame':round(start*30),'out_frame':round(end*30),'kind':kind,'text':lines,'classification':'DRAMATIZATION' if start<23.7 else 'REAL CAPTURE' if id in ['proposal','stopped','reason','accepted','retained'] else 'EXPLANATORY VISUALIZATION'}
 if voice:s['voice']={'text':voice[0],'in_frame':round((start+(.8 if id=='end' else .1))*30),'file':f'audio/voice-{id}.wav'}
 if kind=='refused':sfx.append({'kind':'latch','frame':s['in_frame'],'gain':.10})
 if kind=='allowed':sfx.append({'kind':'allowed','frame':s['in_frame'],'gain':.06})
 if id in ['message','proposal']:sfx.append({'kind':'paper','frame':s['in_frame'],'gain':.035})
 if id in ['proposal','stopped','reason','accepted']:
  a='refund.execute:100' if id=='accepted' else 'refund.execute:4800';r=run['receipts'][1 if id=='accepted' else 0]
  event=next(e for e in run['events'] if e['event_id']==facts['event_references'][a]['proposal' if id=='proposal' else 'receipt'])
  s['evidence']={'action':a,'event_id':event['event_id'],'event_timestamp':event['ts'],'receipt_signature':r['signature']['value'],'file':f'evidence/receipt-{"allowed" if id=="accepted" else "stopped"}.json'}
  s['capture']='source/proposal-row.png' if id=='proposal' else 'source/receipt-stopped-reason.png' if id=='reason' else f'source/receipt-{"allowed" if id=="accepted" else "stopped"}-detail.png'
 elif id=='retained':s['capture']='source/receipt-list.png';s['evidence']={'file':'evidence/reloaded-wallet-receipts.json','receipt_signatures':[r['signature']['value'] for r in run['receipts']]}
 shots.append(s)
 claims.append({'claim_id':id,'in_frame':s['in_frame'],'out_frame':s['out_frame'],'time_seconds':[start,end],'on_screen_text':lines,'dramatized':s['classification']=='DRAMATIZATION','classification':s['classification'],'source':s.get('evidence',{'file':'FACTS.json' if id=='splice' else 'creative screenplay / brand end card'}),'capture':s.get('capture'),'limitations':facts['claim_limitations'] if s.get('evidence') else ['Fictional dialogue, not the actual test transcript.'] if s['classification']=='DRAMATIZATION' else ['Brand statement / test label; no universal security claim.']})
assert shots[0]['in_frame']==0 and shots[-1]['out_frame']==1290
assert all(a['out_frame']==b['in_frame'] for a,b in zip(shots,shots[1:]))
write('TIMELINE.json',{'schema':'openline.film.timeline.v1','title':'HE SAID HE WAS THE CEO','base_sha':facts['base_sha'],'fps':30,'size':[1080,1920],'frames':1290,'seconds':43,'safe_rect':[84,144,996,1740],'shots':shots,'sfx':sfx,'silence_windows':[[15.2,16.3],[23.7,25.4],[42.2,43]],'edit_policy':'Event order and identifiers come from the frozen run. Display durations are editorial reading holds, not claimed real-time receiver latency.','voice_disclosure':'Local neural dialogue; no human recording.','fiction_badge':'DRAMATIZED / FICTIONAL DIALOGUE','test_badge':'ACTUAL OPENLINE TEST','test_footnote':'Recorded local test · No payment executed'} )

ui=json.loads((ROOT/'evidence/UI-CAPTURE.json').read_text()) if (ROOT/'evidence/UI-CAPTURE.json').exists() else None
for claim in claims:
 if claim['claim_id'] in ['proposal','stopped','reason','accepted','retained']:
  claim['on_screen_text']+=['ACTUAL OPENLINE TEST','Recorded local test','No payment executed']
  claim['supporting_sources']=['FACTS.json','evidence/run.json:checks.effects=0','evidence/UI-CAPTURE.json']
  if claim['claim_id']=='reason':claim['on_screen_text']+=['Outside the granted mandate.']
  if claim['claim_id']=='accepted':claim['on_screen_text']+=['Same unchanged mandate.']
  if ui and claim['claim_id'] in ['stopped','accepted']:
   claim['captured_UI_text']=ui['captures'][0 if claim['claim_id']=='stopped' else 1]['body']
write('CLAIM-SHOT-MAP.json',{'schema':'openline.film.claim-map.v1','facts':'FACTS.json','timeline':'TIMELINE.json','shots':claims})
print('Canonical timeline compiled: 21 shots, 1290 frames, 43s. Frozen factual artifacts untouched.')
