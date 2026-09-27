# Test-count reconciliation: 142 → 126 → 138 → 170

Recorded 2026-09-26 (RESEARCH-COMMONS-001 pre-code correction). All counts are
`def test_` functions collected from `backend/tests/` at the named commit.

## The numbers

| Commit | Lane | test files | total |
|---|---|---|---|
| `49f0b0a` | art-pass-close | agent_worker (30) + world (58) + claim_graph (11) + newsroom (14) + report_acceptance (8) + workshop (21) | **142** |
| `24f664d` | separate-key-custody | world (72) + claim_graph (11) + newsroom (14) + report_acceptance (8) + workshop (21) | **126** |
| `190487d` | browser-owner-custody | world (72) + browser_custody (12) + claim_graph (11) + newsroom (14) + report_acceptance (8) + workshop (21) | **138** |

## 142 → 126 (custody lane, `49f0b0a` → `24f664d`)

One commit touched `backend/tests/`: `589840d` "Backend: separate participant
key custody".

- **Removed: `test_agent_worker.py` entirely (−30).** The in-process agent
  worker was removed in the custody lane (the old server-side `world.revoke`
  and the in-process worker it served were deleted). The file tested the
  worker's delegation/tick/escalation machinery — delegation, redelegation,
  pause/resume, propose idempotency, stale-standing holds, out-of-scope
  holds — all of which assumed a server-held worker with a server-held key.
  That mechanism no longer exists; its tests were removed with it, not
  renamed or moved. Nothing in the file survives under another name.
- **`test_world.py`: 58 → 72 (−5 removed, +19 added).**
  - Removed 5: `test_fulfiller_stop_refuses_then_settles`,
    `test_multi_party_action_refused_without_second_authorization`,
    `test_reset_leaves_history_on_disk`,
    `test_stale_required_party_holds_before_any_evaluation`,
    `test_stale_standing_holds_accept` — these tested the removed
    server-side revoke/multi-party fulfillment paths.
  - Added 19 custody tests: join rejects forged bundle / owner-principal
    mismatch / revoked mandate / scope mismatch; gate challenge + authority
    refresh over HTTP; missing presentation refused; cross-participant
    presentation refused; offer requires authorization; replay returns
    STOPPED; revoke route is gone (404); restart restores sessions/listings/
    receipts; reset clears sessions and rotates the receiver gate key;
    stale-authority submit refused; idempotent settlement; poster revocation
    before accept refuses stale authority; out-of-scope agree/propose
    refused; stale acceptor holds.
- All other suites unchanged: claim_graph 11, newsroom 14, report_acceptance 8,
  workshop 21.

Arithmetic: 142 − 30 − 5 + 19 = 126. ✓ (matches the 126/126 clean-extraction
run recorded at `24f664d`.)

## 126 → 138 (`24f664d` → `190487d`)

- **Added: `test_browser_custody.py` (+12).** Focused checks for the
  browser-owner custody integration: browser signing path, cross-participant
  misuse, unauthorized owner signing, reload persistence, and absence of the
  server-custody fallback. No existing tests were removed, renamed, or moved.
- `custody_client.py` was added in the custody lane as a test *helper*, not a
  test file; it contributes 0 to the count.

Arithmetic: 126 + 12 = 138. ✓ (matches the 138/138 run recorded at `190487d`.)

## Suite boundary note

The backend suite boundary is exactly `backend/tests/test_*.py`. The
12-check Playwright negative battery (`qa/custody-browser/negative-battery.py`)
and the 19-check headless demo (`clients/demo_custody.py`) are *separate*
harnesses outside the backend suite — they are not part of the 142/126/138
counts and never were. No tests were excluded from any run; there are no
skips, xfail, or deselected items in the suite.

## 138 → 170 (`190487d` → research-commons-001 tip)

- **Added: `test_commons_chapter.py` (+32).** The RESEARCH-COMMONS-001
  backend chapter: acceptance unit tests (fixture ACCEPTED, each of K1–K7
  failing in turn, evaluator purity — no signing and no state mutation,
  resource limits recorded in every evaluation record, untrusted packages
  refused without executing any submitted byte (STUDY_EXECUTION_DISABLED),
  `run_study` refusing without a trusted pin, the trusted fixture still
  reproducing, and a static + dynamic check that study code is never
  imported into the receiver), the submit-package endpoint tests (control C1 pass →
  ALLOWED/ACCEPTED, C2 genuine failure → STOPPED/PACKAGE_ACCEPTANCE_FAILED
  with CRITERION_FAILED_K2, C3 altered artifact → STOPPED/
  ARTIFACT_HASH_MISMATCH, C4 producer self-approval ignored — attestation
  in no record, C5 display admits only ACCEPTED dispatches, revoked
  producer STOPPED with zero state change, out-of-scope presentation
  HOLD, missing presentation WORLD_AUTHORIZATION_MISSING, idempotent
  retry replays, content dedupe without a key), isolation-property tests
  (acceptance and gate receipt verify against the receiver gate key and
  never a worker key; worker-signed presentation bound to the pinned
  package hash via the presentation binding; stored package_sha256 ==
  pinned hash), and correction propagation (package INFERENCE claim →
  QUARANTINE/ALL_ADMITTED_SUPPORT_PATHS_LOST under the existing hard
  edge rules, Report B UNAFFECTED, original bytes and the acceptance
  record byte-identical after the correction, receipts still verify).
  No existing tests were removed, renamed, or moved.

Arithmetic: 138 + 32 = 170. ✓ (matches the 170/170 run at the lane tip:
world 72 + browser_custody 12 + claim_graph 11 + newsroom 14 +
report_acceptance 8 + workshop 21 + commons_chapter 32.)

## Addendum 2026-09-27 (isolation-verification lane)

- **Added: `test_track_a_control_plane.py` (+11).** Covers the retained
  Track-A control plane left untested when the in-process worker loop was
  removed: delegation records + validation, activity modes, the pause
  switch, and `worker_state` reporting. See
  docs/removed-test-coverage-map.md for the full removed-test bucket
  mapping ((a) still covered / (b) intentionally removed / (c) gaps with
  actions taken).
- **`test_commons_chapter.py`: +3, −2 reworked.** The isolation verdict
  (research/ISOLATION-VERDICT-2026-09-27.md) disabled arbitrary
  submitted-code execution: K3 is now trusted-fixture reproduction
  (research/COMMONS-CRITERIA-2026-09-27.md). Reworked:
  `test_sandbox_timeout_is_a_k3_failure` and
  `test_sandbox_fsize_limit_is_enforced` (both assumed arbitrary code
  executes) → replaced by
  `test_untrusted_package_study_never_executes`,
  `test_run_study_refuses_without_trusted_pin`, and
  `test_trusted_fixture_still_reproduces`. Net +1 in the file (32 → 33).

Arithmetic: 170 + 11 + 1 = **182**.

## Addendum 2026-09-27 (unattended-commission-001 lane)

- **Added: `test_commission_chapter.py` (+21).** Two owners authorize frozen
  terms once; workers complete one bounded service job unattended; the
  receiver settles from the frozen contract plus recorded cost events. The
  six brief demonstrations are each a test: accepted (costs + fee), rejected
  (costs only), cost cap / deadline (honest stop, costs-only), revocation
  (next gated op refused), crash/retry (idempotent start / cost / submit),
  altered terms / payee / costs (bad signature refused, inflated claims and
  altered payee cannot move settlement). Plus guards: frozen-contract-only
  start, buyer-only start, seller-only work, unknown op / bad units refused,
  insufficient simulated funds, snapshot restart restoring balances and
  commissions.
- **Mechanism additions (not redesigns):** `SUPPORTED_SCOPES` gains
  `commission.report-cost` and `commission.submit-deliverable` (the new
  gated actions need grantable scopes); `World.state()` reports
  `simulated_balance_cents` per participant and a `commissions` summary;
  the snapshot persists `simulated_balances`, `commission_contracts`,
  `commissions`, and `commission_ledger`.
- **Missing-primitive report (per the brief):** no simulated-funds ledger
  existed on this lineage — new `backend/commission.py` (deterministic
  receiver-side accounting; no submitted code executes, per the 2026-09-27
  isolation verdict) plus World integration. Cost amounts are computed from
  frozen contract rates; worker-reported totals are audit data only.

Arithmetic: 182 + 21 = **203**.
