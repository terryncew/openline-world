# Claim ledger

| Film claim | Repository evidence at the production base | Exact scope |
|---|---|---|
| An owner delegates bounded work | backend/server.py `_a_onboard_wren`; backend/workshop_gate.py `onboard_helper`; vendor Wallet.grant | Local Workshop owner/key and read/write notes scopes |
| Receiver checks the action | WorkshopGate.request_decision; vendored EffectGate.evaluate; test_workshop.py | Evaluation is separate from execution |
| The owner can revoke | `_a_revoke_wren`; Wallet.revoke; admission of the updated owner bundle | Explicit revocation in this local session |
| Revoked Wren is stopped | `_a_wren_after_revoke`; receiver-signed STOPPED receipt; test_authority_demo_beat_sequence | notes.read / MANDATE_REVOKED; no effect |
| A replacement inherits no mandate | `_a_juniper_arrives`, `_a_juniper_reaches`; test_workshop.py pre-grant gate assertions | HELPER_UNKNOWN before evaluation; no signed receipt |
| Owner authorizes the replacement | `_a_onboard_juniper`; separate mandate-juniper-2 | Same bounds, newly granted authority; no transferred mandate |
| Work and history survive | `_a_juniper_works`; `apply_job_effect`; test_authority_demo_job_checkpoints; JobCrate | Same task-workshop-1, three receipts, two synthetic checkpoints |
| Receipts are genuine signed artifacts | WorkshopGate verifies `verify_record` before Wallet.add_receipt; production evidence export | Public projection UI truncates signature display; complete signed source retained privately-safe in evidence |
| Different systems can be built around this boundary | Closing invitation | Architectural possibility, not a deployment/integration claim |

## Audited, excluded capabilities

README.md and research/bureau/CONSEQUENCE-HISTORY-REPORT.md constrain claims.
Browser-profile custody, Research Commons admission/correction, simulated
commission accounting and local participant transport have bounded evidence.
They are not needed for this one story and do not appear as integrations.
Arbitrary submitted-code execution is disabled after failed isolation probes.
Nearby/Bluetooth transport and physical-phone behavior are not demonstrated.
No provider migration or third-party endorsement is established by this film.
