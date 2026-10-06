"""Hash actual evidence and production sources; distinguish reference-only media."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1]
def entry(p,role):return {'path':str(p.relative_to(REPO)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'role':role}
paths=[]
for d in ['evidence','source','audio','tools','renders','animatic']:
 for p in sorted((ROOT/d).rglob('*')):
  if p.is_file() and '__pycache__' not in str(p):paths.append(entry(p,'RECOVERED REAL EVIDENCE' if d=='evidence' and p.name in ['run.json','receipt-stopped.json','receipt-allowed.json','owner-authority-events.json','reloaded-wallet-receipts.json'] else 'REAL UI CAPTURE' if d=='source' else 'PRODUCTION / DERIVED ARTIFACT'))
for name in ['FACTS.json','TIMELINE.json','CLAIM-SHOT-MAP.json','CAPTIONS.json','captions.srt','captions.vtt','poster.png','README.md','AUDIT.md','SCREENPLAY.md','DELIVERY.md','WATCH.html','ANIMATIC-REVIEW.md','TECHNICAL-QA.json','PLAYBACK-QA.json']:
 p=ROOT/name
 if p.exists():paths.append(entry(p,'PRODUCTION / PROOF MANIFEST'))
refs=[]
for p in sorted((REPO/'frontend/public/prompt-injection').rglob('*')):
 if p.is_file():refs.append(entry(p,'EXISTING REFERENCE ONLY — not footage of this recovered run'))
for name in ['backend/server.py','backend/workshop_gate.py','backend/tests/test_prompt_injection_demo.py','frontend/src/components/Panels.tsx','frontend/src/styles.css','production/flagship-001/AUDIT.md','production/flagship-001/BRAND-CANON.md','production/flagship-001/ASSET-INVENTORY.json','production/flagship-001/tools/render.py','production/flagship-001/tools/narrate.py','production/flagship-001/tools/playback.mjs','production/flagship-001/tools/verify.py']:
 refs.append(entry(REPO/name,'UNCHANGED PRODUCT / PREVIOUS PRODUCTION REFERENCE'))
(ROOT/'SOURCE-INVENTORY.json').write_text(json.dumps({'base_sha':'792372a2cd87a01e0500a229e60114b0a00ac64c','checkpoint':'13e9c60abc45036c81aaa604855250b0e5384273','production':paths,'inspected_existing_sources':refs,'private_keys_exported':False,'paid_assets':False,'external_api_spend':0,'voice_disclosure':'Local neural voice; full takes included. No human recording.'},indent=2)+'\n')
print('Source/evidence inventory written:',len(paths),'production items;',len(refs),'existing references.')
