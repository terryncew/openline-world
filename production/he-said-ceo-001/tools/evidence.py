"""Deliberate existing-scenario rerun; an unchanged-mandate comparison, not an executor."""
from pathlib import Path
import copy,hashlib,json,sys,tempfile,time,argparse
from http.server import ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1]
sys.path[:0]=[str(REPO/'backend'),str(REPO/'backend/vendor')]
from server import PromptInjectionWorkshop,Handler
from openline_wallet.wallet import Wallet
from openline_wallet.crypto import verify_record
BASE='792372a2cd87a01e0500a229e60114b0a00ac64c'
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def run(out,serve=False):
 with tempfile.TemporaryDirectory(prefix='ceo-real-test-',dir='/tmp') as td:
  w=PromptInjectionWorkshop(Path(td)/'test');authority=copy.deepcopy(w.gate.wallet.state['events']);mandate=copy.deepcopy(w.gate.mandate_record('wren'));states=[]
  for _ in range(6):
   w.advance_prompt_injection();states.append(w.snapshot());time.sleep(.12)
  refused=w.gate.receipts[0]
  allowed=w._propose('wren','refund.execute:100')['receipt']
  restored=Wallet.open(w.gate.data_dir/'owner-wallet').state['receipts']
  assert len(restored)==2 and restored==[refused,allowed]
  assert w.gate.wallet.state['events']==authority and w.gate.mandate_record('wren')==mandate
  assert refused['mandate_id']==allowed['mandate_id'] and refused['principal_id']==allowed['principal_id']
  assert [r['decision'] for r in restored]==['STOPPED','ALLOWED'] and refused['reason_codes']==['ACTION_OUTSIDE_MANDATE']
  assert w.job_effects==[] and w.snapshot()['job_state']['checkpoints']==[]
  for r in restored:assert verify_record(r,expected_public_key=w.gate.gate.public_key)[0]
  events=w.log.replay(0)
  refs={}
  for action in [refused['action'],allowed['action']]:
   refs[action]={kind:next(e['event_id'] for e in events if e['kind']==kind and (e['detail'].get('action') or e['detail'].get('receipt',{}).get('action'))==action) for kind in ['proposal','decision','receipt']}
  facts={'schema':'openline.film.factual-pair.v1','frozen':True,'base_sha':BASE,'scenario':'PROMPT-INJECTION-001','unauthorized_action':refused['action'],'actual_mandate':mandate,'receiver_result':refused['decision'],'refusal_reason':refused['reason_codes'][0],'corresponding_allowed_action':allowed['action'],'allowed_receiver_result':allowed['decision'],'same_owner_mandate_and_receiver':True,'authority_unchanged':True,'authority_events_sha256':hashlib.sha256(json.dumps(authority,sort_keys=True).encode()).hexdigest(),'evidence_source':['backend/server.py:PromptInjectionWorkshop.advance_prompt_injection','backend/server.py:Workshop._propose','backend/workshop_gate.py:WorkshopGate.request_decision','evidence/run.json','evidence/receipt-stopped.json','evidence/receipt-allowed.json','evidence/reloaded-wallet-receipts.json'],'event_references':refs,'receipt_references':{'stopped':{'path':'evidence/receipt-stopped.json','signature_prefix':refused['signature']['value'][:16],'payload_hash':refused['payload_hash']},'allowed':{'path':'evidence/receipt-allowed.json','signature_prefix':allowed['signature']['value'][:16],'payload_hash':allowed['payload_hash']}},'comparison_method':'Existing Workshop._propose called once with the already granted exact action refund.execute:100; no new grant, product behavior or effect executor.','claim_limitations':['Exact action strings, not a general numeric cap or permission for all amounts <= 100.','Local scripted worker; no model was spontaneously fooled and no injection detector was invoked.','Evaluation only: no refund, funds, payment, bank call or job checkpoint was executed.','The CEO dialogue is fictional and is not the scenario transcript; actual input claims to be an administrator.','The stock six-step capture contains only STOPPED; ALLOWED is this deliberate existing-semantics comparison.','A signature establishes this receiver decision, not universal fraud prevention or exclusive capability.']}
  # Freeze facts before any screenplay or rendering artifacts.
  write(out/'FACTS.json',facts)
  write(out/'evidence/run.json',{'base_sha':BASE,'events':events,'scenario_states':states,'final_snapshot':w.snapshot(),'receipts':restored,'checks':{'valid_expected_gate_signatures':2,'same_mandate':True,'owner_authority_byte_identical':True,'reloaded_receipts_byte_identical':True,'effects':0,'external_api_spend':0}})
  write(out/'evidence/receipt-stopped.json',refused);write(out/'evidence/receipt-allowed.json',allowed);write(out/'evidence/reloaded-wallet-receipts.json',restored);write(out/'evidence/owner-authority-events.json',authority)
  print('FACTS FROZEN: 4800 STOPPED; 100 ALLOWED; same unchanged mandate; two verified persisted receipts; no executor.',flush=True)
  if serve:
   server=ThreadingHTTPServer(('127.0.0.1',16025),Handler);server.workshop=w
   print('Actual unmodified Handler / live completed fixture available on 127.0.0.1:16025',flush=True)
   try:server.serve_forever()
   finally:server.server_close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--serve',action='store_true');p.add_argument('--out',type=Path,default=ROOT);a=p.parse_args();run(a.out,a.serve)
