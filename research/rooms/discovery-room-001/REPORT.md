# DISCOVERY-ROOM-001 — Report

One complete inspectable loop on the EXISTING Exchange board:

question -> agreed contribution -> supported experiment -> result + accounting
returned to the question.

There is NO separate discovery board. "research-question" is a LISTING KIND
on the existing Exchange board (backend/world.py TASK_KINDS), per the owner
refinement. No separate view was built: the workflow did not demonstrably
require one. The concrete reason: the existing board already renders each
listing's detail text, the board() API returns the full listing record
(including the new structured disclosure), and the existing agreements API
returns the full agreement record (including the recorded result). A
separate view would duplicate these surfaces without adding a step the
workflow needs.

## The four components (kept distinct)

- AUTHORIZATION — the mandate scopes and the gate-evaluated worker-signed
  presentations stored on the agreement at propose/agree time and
  re-validated at submit (existing `_store_authorization` /
  `_evaluate_presentation`; the new scope `research.verify` joins the
  preview's SUPPORTED_SCOPES). Authorization decides who may act; it runs
  no experiment.
- EXECUTION — the lab-runner path: `World._research_prepare_result`, the
  receiver's own deterministic code run inside submit(). It recomputes
  sha256 over every artifact listed in the frozen room's
  EVIDENCE-MANIFEST.json and reads the frozen aggregate.json. No
  worker-submitted code executes (the 2026-09-27 isolation verdict holds:
  accounting is receiver arithmetic).
- EVALUATION — comparison against the acceptance criteria: match/mismatch
  counts, the listing's manifest-sha pin compared against the manifest
  actually read, and the experiment outcome preserved VERBATIM from the
  frozen aggregate (the receiver never re-runs the experiment).
- ACCEPTANCE — the gate: submit()'s ALLOWED verdict plus the result bound
  under the gate's signature (`sign_record(payload, self.gate.gate_key)`),
  stored on the agreement and the transaction. The gate accepts the RESULT
  record; it does not certify the scientific truth of any claim.

## The loop, demonstrated (real API, real records)

Seed: `research/rooms/discovery-room-001/seed_discovery.py`
(persisted world snapshot: `research/rooms/discovery-room-001/world-state/`).

- Listing `need-d7e806f65cb6` (kind `research-question`, side `need`),
  posted by `owner-researcher` ("Owner Researcher (internal operator)")
  through `World.need`. The disclosure set is stored on the listing
  record (`board()` returns it) and packed into the detail as readable
  markdown so the existing board UI displays it with no frontend change.
- Agreement `agr-3c035b646ce2` proposed by `verifier-1` ("Verifier One
  (internal operator)") via `propose_agreement` with a gate-evaluated
  `research.verify` presentation; agreed by the listing owner via `agree`.
- Submit via `submit` settled the exchange (`ALLOWED`,
  `tx-38552353d2b3`) and recorded the result on the agreement AND the
  transaction (retrievable via `/api/world/agreements/<id>`):
  - EXECUTION: 40/40 artifact hashes recomputed and matched, 0 mismatches.
    (The listing's criteria text says "38 artifacts"; the frozen manifest
    actually lists 40, and all 40 were checked. See "Stale pin" below.)
  - EVALUATION: manifest sha256 `c4aa89ffd7989484…`; the listing's pinned
    sha `604fe0d3…` does NOT match — reported in the result
    (`pin_match: false`), not hidden. Experiment outcome preserved
    verbatim: A mean_mse 0.017645592864057476, B 0.017671206132053512,
    C 0.01688857691891849, pooled_se 0.0030381513629991973,
    improved false, verdict "C did not beat B".
  - Accounting (EXISTING commission ledger, no second ledger):
    commission `com-c0d68c6b2cfe6887`, op `evidence.verify`, 4 spent /
    10 ceiling simulated-compute-units (400c / 1000c at 100c per unit).
    The deliverable was then submitted through the real
    `commission_submit_deliverable` path and settled: seller payout 400c,
    buyer released 600c (simulated funds moved). All simulated.
- SUCCESS: the recorded UNFAVORABLE result (C did not beat B) COMPLETES
  the loop; the negative scientific outcome is not a loop failure.

## The refusal, demonstrated (real path, not seeded)

`observer-3` ("Observer Three (internal operator)"), who is not the
counterpart, called `agree()` on the proposed agreement. The world
refused with `WORLD_RULE_NOT_COUNTERPART` ("only the listing owner
(counterpart) can agree"). This is the existing UI path: in the UI, the
agree button on someone else's proposed agreement calls
`/api/world/agreements/<id>/agree`, and the backend returns this signed
reason code for display. No fake refusal was seeded; the attempt was
really made and really refused. (`WORLD_AGREEMENT_NOT_AGREED` for
submit-before-agree is likewise exercised in the test suite.)

## Reused (existing machinery, untouched)

- Exchange listing/agreement flow: `need`, `propose_agreement`, `agree`,
  `submit`, `board`, the agreements API, idempotency, and the refusal
  codes.
- Commission reservations + SIMULATED accounting: `fund_simulated`,
  `commission_propose_contract`, `commission_authorize_contract`,
  `commission_start`, the cost-event ledger shape, `commission_compute_cost`,
  `commission_submit_deliverable`, `_commission_settle`. No second ledger.
- The gate: `sign_record` / `verify_record` with the server gate key; the
  package-acceptance pattern (signed acceptance bound to the record).

## Added (backend)

- `TASK_KINDS["research-question"] = "research.verify"` (harmless,
  evaluation-only action; the gate evaluates it like any other kind).
- `SUPPORTED_SCOPES` gains `"research.verify"`.
- Disclosure validation (`World._clean_disclosure`): the 12-field set is
  required on research-question listings, rejected on other kinds; the
  resource ceiling may only name `simulated-compute-units`; `reuse_terms`
  must carry the verbatim disclaimer (new codes
  `WORLD_RULE_DISCLOSURE_REQUIRED`, `WORLD_RULE_DISCLAIMER_REQUIRED`).
- The listing record carries `disclosure`; `board()` projects it.
- `submit()` research branch: `_research_prepare_result` (EXECUTION,
  fail-closed pre-settlement), `_research_experiment_outcome`,
  `_research_find_commission`, `_research_accounting_preview`,
  `_research_finalize_result` (ACCEPTANCE-side recording + receiver cost
  event on the existing ledger + gate-signed result on agreement and
  transaction). `_research_signable` renders floats as exact repr strings
  because the canonical signer forbids floats.
- `research/rooms/discovery-room-001/seed_discovery.py` (the loop driver),
  `backend/tests/test_discovery_room.py` (10 tests), this report,
  `ROOM.json`, `EVIDENCE-MANIFEST.json`, `loop-transcript.json`.

## Still unsupported / deliberately not built

- No separate discovery board or view (see top).
- No new ledger, no real money, no funding rails: simulated units only.
- The seed targets a fresh demonstration world, not the live server's
  data dir; promoting the listing to the live board is a separate,
  owner-authorized step.
- Frontend untouched (`frontend/src/App.tsx` and everything else): the
  disclosure is visible through the existing detail rendering and the
  board API.
- `research/rooms/repro-lab-001/` untouched (frozen at 84832b6): read
  only, as evidence.

## Manifest-binding defect (v1) and fix

When the pin diverged: `research/rooms/repro-lab-001/ROOM.json` records
`evidence_manifest_sha256: 604fe0d39639481e…` (recorded before the
repro-lab-001 manifest was regenerated over its final 40 artifacts).
The v1 discovery seed (`seed_discovery.py`) copied that stale value into
the v1 listing's acceptance criteria as "result bound to manifest sha256
604fe0d3..." (the pin regex reads the 8-char prefix `604fe0d3`). The
frozen manifest actually hashes to
`c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533`.

Why it mattered: `World._research_prepare_result` computed
`pin_match: false` (reported, not hidden), but the binding was
INFORMATIONAL — submit proceeded to acceptance AND settlement anyway:
agreement `agr-3c035b646ce2`, transaction `tx-38552353d2b3`, settlement
`stl-4431fbaca0bf1f7e` (seller payout 400c, buyer released 600c on the
existing commission ledger). The receiver accepted a result and settled
funds without the listing, the agreed terms, the evaluated manifest,
the accepted result, and the settlement being bound to one declared
artifact version.

The fix (`backend/world.py`): `_research_enforce_manifest_binding`,
called inside submit() after the pure-read verification and before any
state transition. For research-question listings, if a manifest pin is
declared and does not EXACTLY equal the evaluated manifest's sha256,
submit raises `RESEARCH_MANIFEST_PIN_MISMATCH` — no transaction, no
ALLOWED verdict, no result record, no settlement record, no commission
payout. An unreadable manifest still fails closed; a listing with no
declared pin keeps the existing honest-recording behavior.

Regression: `test_stale_manifest_pin_refuses_acceptance_and_settlement`
in `backend/tests/test_discovery_room.py` reproduces the v1 case
end-to-end (stale-pin listing -> propose -> linked commission -> agree ->
submit) and proves no settlement occurs: the refusal code is asserted,
and the test asserts no transaction for the agreement, no result record,
no ALLOWED verdict, and no commission funds moved
(`recorded_cost_cents` unchanged, `cost_events` empty).
`test_correct_manifest_pin_allows_settlement` proves the corrected case
settles.

Corrected v2 loop (`seed_discovery_v2.py`, world snapshot
`world-state-v2/`): an explicitly versioned corrected listing
(`need-0330b96ce8bd`, "listing version 2" in its detail text) declares
the correct full pin
`c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533`
and the corrected artifact count (40). Full loop rerun against the
frozen research evidence (read-only): agreement `agr-84b3f39b2dfb`,
submit ALLOWED (`tx-40d207c8f2a7`), `pin_match: true`, 40/40 hashes,
verdict preserved verbatim "C did not beat B"
(A 0.0176±0.0078, B 0.0177±0.0077, C 0.0169±0.0057, pooled_SE 0.00304),
4/10 simulated-compute-units, settlement `stl-42b3516009d4e1bd`
(seller payout 400c, buyer released 600c, simulated).

The v1 run is preserved as evidence: `loop-transcript.json` keeps all
v1 keys untouched (the v2 run is appended under the `"v2"` key),
`seed_discovery.py` and `world-state/` are unchanged, and
`pin_match: false` remains in the v1 result record. The v1 settlement
`stl-4431fbaca0bf1f7e` is documented as affected by the binding defect
via the appended record in `ROOM.json` below — it was not erased or
rewritten. Do NOT silently repin agreement `agr-3c035b646ce2`.

## Repo finding (verbatim)

"openline-discovery-market — not found in the locations and access checked
(local: ~/workspace/ listing, find -maxdepth 3, ~/workspace/repos/,
openline-world git branches). GitHub was NOT checked."

## Manifest/pin construction note

`EVIDENCE-MANIFEST.json` is the authoritative hash list: every listed sha
matches the current file bytes (recompute to verify). `ROOM.json`'s
`evidence_manifest_sha256` pin is stale by construction — the pin was
recorded, then the manifest was regenerated over the final `ROOM.json`
bytes. This mirrors the frozen `repro-lab-001` room exactly (its manifest
is fully consistent; its `ROOM.json` pin `604fe0d3…` no longer matches
its manifest `c4aa89ff…`). `ROOM.json`'s internal self-entry likewise
predates the pin addition. Verify against `EVIDENCE-MANIFEST.json`.

## Constraints honored

- Simulated funding only; the ceiling unit is `simulated-compute-units`.
- Internal operators and deterministic workers labeled as such
  ("(internal operator)" display names; "deterministic test clients" in
  the transcript).
- The verbatim disclaimer appears in the listing's `reuse_terms` and in
  `ROOM.json`: "A receipt records an agreement; it does not establish
  intellectual-property rights or scientific truth."
- Frozen dirs, the release, commercials, and `frontend/src/App.tsx`
  untouched. Every UI-visible state in this room comes from real backend
  records.

## Tests

`backend/tests/test_discovery_room.py`: 12 tests, all pass (10 original +
`test_stale_manifest_pin_refuses_acceptance_and_settlement` and
`test_correct_manifest_pin_allows_settlement`). Full suite: all pass
(`test_world`, `test_commons_chapter`, `test_workshop`,
`test_commission_chapter`, and the rest via `unittest discover -s tests`
from `backend/` with `~/workspace/.venvs/workshop/bin/python`).
