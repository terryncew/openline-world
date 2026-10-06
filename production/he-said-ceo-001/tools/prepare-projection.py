"""Read the frozen run through the unchanged public API helper; create no decisions."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1]
sys.path[:0]=[str(REPO/'backend'),str(REPO/'backend/vendor')]
from server import _public_receipt
from openline_wallet.crypto import verify_record
facts=json.loads((ROOT/'FACTS.json').read_text());run=json.loads((ROOT/'evidence/run.json').read_text())
assert run['receipts']==json.loads((ROOT/'evidence/reloaded-wallet-receipts.json').read_text())
assert len(run['receipts'])==2
for r in run['receipts']:assert verify_record(r,expected_public_key=facts['actual_mandate']['gate_public_key'])[0]
(ROOT/'evidence/ui-receipts.json').write_text(json.dumps({'receipts':[_public_receipt(r) for r in run['receipts']]},indent=2)+'\n')
print('Frozen verified pair projected through unchanged server._public_receipt; no rerun.')
