# BOUNTY-001 — one bounded local transaction

A buyer approves two $10 attempts plus a $100 reward for a reproducible finding.
A deterministic worker first claims a finding that fails verification, then
finds deliberately missing ownership checks in a harmless in-memory notes app.
A separate fixed version refuses the cross-user read. There are no real targets,
model calls, paid APIs, production credentials, real payments or public deployment.

From the repository root:

```bash
./bounty/run.sh
```

The launcher installs dependencies on first use, binds both services to loopback,
and waits for the bounty API through the frontend proxy. Open the local frontend
on port 5173, with `?scenario=bounty`. Approve the displayed fixed terms, then
advance the steps. The existing Square and custody demonstration remain available.
Ctrl-C stops the services. Run `bash bounty/install.sh` explicitly to refresh an
existing installation. Prerequisites: Python 3.11+, Node 22.12+ (tested on 24.19),
npm, Git. All five inspected reference repositories are pinned in `components.json`
and installed/read under ignored `.venv/component-sources/`; none is modified.

State and keys persist under `backend/data/bounty`. To start a **new** transaction,
set `BOUNTY_DATA_DIR` to a new directory before launching; old receipts and
revocations are preserved. Do not erase state to recover an interrupted payment.
A restored environment must restart its services; a live process is not retained.

## What is reused

- **Agent Exchange Kernel:** `openline-wallet/demo/agent-exchange-001`:
  `Exchange`, `FileRegistry`, mailbox transport, `CommissionReceiver`, and
  `CommissionSettlement`. No kernel/commission/Wallet/settlement/reconciliation
  source is changed, copied into World, or monkey-patched.
- **Commission:** its existing `text_digest` service, frozen signed agreements,
  buyer exact-recomputation checks, reservations, signed results/verdicts,
  atomic deduplicated SIM_USD ledger and read-only reconciliation.
- **Wallet:** World's existing vendored `Wallet`, `EffectGate`, one-use worker
  presentations, Ed25519 record signing and revocation. The kernel is also
  exercised against its pinned upstream Wallet in its regression tests.
- **Receipt Gate:** the real `@authorize` / `LocalAuthorityRuntime` exact-call
  guard executes the fixture only with receiver-owned evidence and policy,
  after Wallet authorization. The zero-value payment semantics helper is used
  only to classify the guarded call; it moves no funds. This is **not** a
  Receipt Gate financial settlement integration.
- **Airlock:** existing `run_checks(kind='target')` executes the fixed buyer
  verification command and authenticates its record with Airlock's local HMAC
  primitive. This does **not** invoke an agent tournament or code promotion.
- **Bureau:** existing conformance validator, source adapters and SQLite store
  ingest signed `bureau.receipt.v0.1` evidence and native Wallet gate decisions.
  No scores, rankings or allocation experiment are implemented.
- **openline-exchange:** inspected, not used as a worker marketplace. That
  repository lists receipts for sale and cannot implement this worker workflow.

## Compensation and finding verification are different

The buyer signs the exact conditions **before** fixture attempts. The worker
receives a one-hour mandate for `bounty.fixture.read`; the receiver separately
permits at most two allowlisted JSON-data attempts. Submitted code, replacement
policies, extra candidate fields, and changed byte-pinned checks are refused.

An attempt earns $10 only after current authorization, an observed fixture
response, a bound candidate, and a completed buyer verification record exist.
The finding itself may fail those verification checks. The kernel commissions
and independently verifies a digest of this evidence package before accepting
compensation. An observed response with missing verification/evidence earns
nothing. Unsupported inputs and refused actions earn nothing.

The $100 reward becomes eligible only for the first finding that the fixed
buyer-owned checker reproduces against the vulnerable app, rejects against the
fixed control, and matches to the observed attempt response. Duplicate findings
cannot earn another reward. **A signed receipt alone proves no vulnerability.**

The original kernel only knows `text_digest`; it does not natively understand
vulnerability bounties. This adapter maps each eligible attempt evidence package
and the eligible reward evidence package to one existing commission. Its built-in
acceptance verifies **evidence packaging**, not that a vulnerability exists.
The separate finding-verification record establishes that local predicate.
No new payment engine or success predicate is inserted into the kernel.

The happy path pays three separately reserved and settled obligations:
$10 for the failed finding's eligible attempt, $10 for the successful attempt,
and $100 for the verified finding. Maximum attempt compensation remains $20.
Amounts are **SIM_USD units**, not integer cents and not dollars with real value.
The kernel's owner test account begins with 10,000 SIM_USD and delegates 120;
the adapter limits the attempt and reward purposes within that allowance.

## Crash and replay behavior

The adapter persists intent before a protected fixture effect or settlement.
Missing confirmation stays `UNRESOLVED`, never an inferred failure.

- `Read-only kernel reconciliation` changes no files and dispatches no work or
  payment. It reports the original durable ledger state.
- A transfer confirmed in the authenticated agreement/ledger can have its
  incomplete local records completed through the existing kernel's recovery
  path. The same settlement ID produces no second transfer.
- Without transfer confirmation, the adapter blocks both normal retries and
  "complete committed" requests. There is no automatic blind retry or production
  payment-provider reconciliation claim.
- An interrupted evidence commission can resume its **same frozen input/nonce**
  through the existing kernel's deterministic request transaction.
- An unresolved fixture dispatch is held across restart, not silently rerun.
- Completed payment calls return the retained result. Calling the underlying
  kernel settle again refuses with `ALREADY_SETTLED`.

## Evidence and limits

[Evidence contract](EVIDENCE.md) specifies exactly what Bureau consumes.
Authorization, observed attempts/effects, finding verification, compensation
acceptance, and simulated settlement remain separate linked records.
All owner/worker/receiver roles and their keys are operated on this machine.
This is buyer-controlled local verification, **not an independently operated
outside receiver**, browser key custody, hardened worker isolation, an audit,
external adoption, a production security assessment or actual financial settlement.
Airlock's HMAC is local authentication; its key is not public verification.
Bureau preserves signatures; its general ingest adapter does not authenticate
signatures itself. This adapter verifies its signed records before ingestion.

## Validation

```bash
.venv/bin/python -m pytest backend/tests -q
(cd frontend && npm run build && npm test)
(cd frontend && BROWSER_EXECUTABLE=/usr/bin/chromium node e2e/bounty.mjs)
(cd .venv/component-sources/wallet/demo/agent-exchange-001 && \
  PYTHONPATH=.:../../src ../../../../bin/python -m unittest discover -s tests -t .)
(cd .venv/component-sources/wallet && \
  PYTHONPATH=src ../../bin/python -m unittest discover -s tests -p test_commission_work.py)
```

`BROWSER_EXECUTABLE` is an optional existing Chromium override. Without it,
use an installed Playwright browser. The real-browser test starts isolated
loopback services and a fresh bounty, walks both attempts and all three
settlements, checks receipt inspection, mobile layout, replay, foreign-origin
refusal and the original Square's zero-backend-contact boundary, then runs the
existing 19-check separate-participant custody client against that same server.
It writes current-run results/screenshots to a fresh temporary directory
(or `EVIDENCE_DIR`). Services are stopped when it finishes.
