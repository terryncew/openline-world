# Bureau consumption contract

No new receipt family is required. The adapter emits the existing
**`bureau.receipt.v0.1`** format from OpenLine Bureau's conformance kit, signed
using Wallet's existing `sign_record` Ed25519 canonical JSON primitive.
The receipt directory contains only signed public evidence, not private keys.

| Field | Meaning |
| --- | --- |
| `receipt_version` | `bureau.receipt.v0.1` |
| `receipt_id` | Unique ID; kernel acceptance/settlement IDs are stable per job |
| `timestamp`, `receiver`, `principal`, `actor` | Local production time and disclosed local roles |
| `action.type` | `owner-approval`, `authorization`, `attempt`, `verification`, `acceptance`, `settlement`, `receiver-policy`, or `revocation` |
| `action.target` | The harmless local fixture; kernel payment job IDs are in the extension |
| `decision.outcome` | Existing Bureau `OBSERVED`, `COMMIT`, `DENY` or `STOPPED` vocabulary |
| `effect.observed` | `null` for authorization, verification and acceptance; `true` only for observed fixture responses or confirmed simulated transfers; `false` for known policy refusal before effect |
| `parents` | Links to authorization, observed attempt, verification, or acceptance evidence as appropriate |
| `extensions["openline.world/bounty"]` | `bounty_id`, `kind`, `evidence_json` |
| `payload_hash`, `signature` | Wallet SHA-256 commitment and Ed25519 signature over the full receipt body |

`evidence_json` is a canonicalized **JSON string**, retaining native component
payloads without changing them. Wallet canonical bodies reject floating numbers;
Airlock timing values can be floats. Signing the raw JSON string binds every
byte while preserving those values. Parse it once to inspect the native evidence.
It is fixed-schema data, never executable code or a verification-policy input.

Per-record extension contents:

| Kind | Native evidence / bounded assertion |
| --- | --- |
| owner-approval | Signed fixed terms, exact fixture byte pins, scope, expiry, worker grant, max attempts, attempt evidence rules, budget, reward conditions |
| authorization | Native `openline.gate.action_receipt.v1` receipt plus local gate public key; independent of execution |
| attempt | Candidate data, observed fixture response, Receipt Gate's native decision and exact-call execution record |
| verification | Accepted/reproducible flags, reason, vulnerable reproduction and fixed-control response, local-verification disclosure, `airlock_receipt_json` containing the original Airlock HMAC envelope and command outcomes |
| acceptance | Native `commission.agreement.v1` record/signature, seller submission, buyer verdict, kernel job ID and purpose (`attempt-N` or `reward`); explicitly evidence packaging |
| settlement | Native `commission.settlement.v1` record/signature, kernel job ID and purpose, `simulated: true`; original settlement ID and amount remain intact |
| receiver-policy | Refusal reason and, when available, native Receipt Gate compilation |
| revocation | Signed local Wallet bundle after revocation; no private keys; future permission differs from previously earned compensation |

The generated `bureau.db` uses **Bureau's unchanged external-receipt adapter**.
The native Wallet gate receipt is additionally normalized with Bureau's existing
`gate_action_receipt` adapter, which correctly sets `effect_observed=null` even
when the decision is ALLOWED. Unsupported payloads are never reported as real
Bureau ingestion. The adapters preserve unmapped/native evidence in `raw` and
`unmapped`. No aggregate performance score is produced.

To consume retained evidence using the pinned Bureau, from the World root:

```bash
PYTHONPATH=.venv/component-sources/bureau .venv/bin/python -m bureau.ingest \
  backend/data/bounty/receipts --db /tmp/bounty-bureau.db \
  --source-repo terryncew/openline-world --experiment BOUNTY-001
```

Before trusting the receipts, the consumer must verify `signature` and
`payload_hash` with `openline_wallet.crypto.verify_record` against separately
pinned **owner** (`owner-approval`, `revocation`) or **receiver** (other envelope
records) public keys. Expected keys must come from the trusted local deployment,
not be accepted merely because an arbitrary receipt advertises them. Original
component signatures and source-byte pins are separate checks. The native
commission settlement is signed by the kernel's buyer owner; the native Wallet
authorization receipt is signed by its receiver gate. Airlock's HMAC verification
requires the retained local `airlock.key` and is not publicly transferable trust.

The local adapter performs signature/conformance checks before ingestion.
Bureau's generic CLI preserves signature metadata and checks structure, but does
**not** cryptographically verify those signatures. Structural validity, a valid
signature, authorization, actual effect, accepted finding and settlement are
six different propositions. A verification record proves the stated fixture
predicate under this local buyer-controlled checker, not vulnerability of any
other app or an independently operated organization's assessment.

Privacy is limited here: this is an inspectable local demonstration, not the
selective-disclosure/worker-allocation workstream. Inspect and redact before
sharing; no secret values or full private key files are exported. The test
fixture contains only synthetic notes. The native records may contain local
fixture paths and public-key identifiers. No blanket Wallet-history collection,
external evidence publication, public registry, or privacy-hardening claim is made.
