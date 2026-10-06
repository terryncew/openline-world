"""Run the unmodified Workshop fixture and preserve its public, signed evidence."""
from pathlib import Path
import hashlib,json,sys,tempfile
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'backend'),str(ROOT/'backend/vendor')]
from server import Workshop
from openline_wallet.crypto import verify_record
OUT=ROOT/'production/flagship-001/evidence'
OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='openline-film-',dir='/tmp') as td:
 w=Workshop(Path(td)/'session',boot_mandate=False)
 states=[];checks=[];last=[]
 for step in range(1,11):
  before=len(w.gate.receipts);r=w.advance_authority_demo()
  receipts=w.gate.receipt_records()
  for receipt in receipts:
   ok,why=verify_record(receipt,expected_public_key=w.gate.gate.public_key)
   assert ok,(step,why)
  state=w.snapshot()
  events=w.log.replay(0)
  # Pre-grant Juniper is not converted into a fictitious signed refusal.
  if step==8:
   assert before==len(receipts)==2
   assert len(state['job_state']['checkpoints'])==1
   assert 'juniper' not in w.gate.helpers
  # Existing receipts must survive each step byte-for-byte.
  assert receipts[:len(last)]==last
  last=list(receipts)
  states.append({'step':step,'label':r['label'],'events':events,'snapshot':state})
  checks.append({'step':step,'label':r['label'],'receipts':len(receipts),'checkpoints':len(state['job_state']['checkpoints'])})
 assert [r['decision'] for r in last]==['ALLOWED','STOPPED','ALLOWED']
 assert last[1]['reason_codes']==['MANDATE_REVOKED']
 assert [r['subject_id'] for r in last]==['wren','wren','juniper']
 assert len(state['job_state']['checkpoints'])==2
 assert state['job_state']['task_id']=='task-workshop-1'
 assert w.gate.helpers['wren'].mandate_id!=w.gate.helpers['juniper'].mandate_id
 public={'states':states,'signed_receipts':last,'checks':checks,'source_sha':'2235fa6ce916876cd39ed35be97263ddfc111b6a','runtime':'local scripted Workshop; no model calls; synthetic notes checkpoints','verified_signatures':3,'old_receipts_byte_identical':True}
 (OUT/'authority-run.json').write_text(json.dumps(public,indent=2)+'\n')
 for i,r in enumerate(last,1):(OUT/f'receipt-{i}.json').write_text(json.dumps(r,indent=2)+'\n')
 # Public receipt projections are the exact input of the existing receipt UI.
 (OUT/'ui-receipts.json').write_text(json.dumps({'receipts':[e['detail']['receipt'] for e in states[5]['events'] if e['kind']=='receipt']},indent=2)+'\n')
 print('Verified: 10 real steps; 3 Ed25519 receipts; STOP MANDATE_REVOKED; pre-grant has no receipt; same task; 2 checkpoints; separate mandates.')
 print('Evidence SHA256:',hashlib.sha256((OUT/'authority-run.json').read_bytes()).hexdigest())
