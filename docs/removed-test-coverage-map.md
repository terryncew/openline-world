# Removed-test coverage map (2026-09-27)

The count reconciliation (docs/test-count-reconciliation.md) explains
142 → 126 → 138 → 170 arithmetically. This document maps every removed
test to what it covered, in exactly one of three buckets:

- **(a) Protection still covered elsewhere** — the behavior is enforced
  by current code and asserted by a named current test.
- **(b) Functionality intentionally removed** — the behavior belonged to
  the removed in-process worker loop; nothing enforces it now because the
  mechanism is gone, by design.
- **(c) Genuine coverage gap** — the code path still exists (or the
  behavior is still claimed) but no test covers it. Action taken is
  stated per item: either a new test was added, or the gap is a
  behavioral question for the owner's call.

Removed in the custody lane (`589840d`): `test_agent_worker.py` (−30)
and 5 tests in `test_world.py` (−5).

## Bucket (a) — still covered elsewhere

| Removed test | Protection | Covered by |
|---|---|---|
| test_full_flow_settles_through_receiver | propose→agree→submit→settle through the receiver with signed receipts | `test_world.py::TestSeparateCustody` settlement tests + `clients/demo_custody.py` 19/19 headless demo (join→offer→agreement→settle once) |
| test_stale_standing_holds_with_no_action | stale standing holds before any action | `test_world.py::test_stale_standing_holds_propose`, `test_stale_acceptor_holds_before_any_evaluation` |
| test_revoked_mandate_stops_worker_with_no_side_effects | revoked mandate stops further action, no side effects | `test_world.py::test_revocation_stops_next_action_only_for_that_agent`, `test_poster_revocation_before_accept_refuses_stale_authority`; negative battery N3 (STOPPED/MANDATE_REVOKED pre-reload, STOPPED/MANDATE_UNKNOWN post-reload) |
| test_restart_never_duplicates_effects | restart never duplicates effects | `test_world.py::test_restart_restores_sessions_listings_and_receipts`, `test_idempotent_settlement_no_resubmit`, `test_replay_returns_stopped_not_allowed`; headless demo restart checks |
| test_out_of_scope_held_with_no_gate_evaluation_and_no_receipt (mandate-scope dimension) | action outside the mandate's scopes is refused | `test_world.py::test_outside_scope_task_is_refused_not_obligated`, `test_propose_refused_outside_scope_raises`, `test_agree_refused_outside_scope_raises`; negative battery N2 (token-only offer refused 409; foreign presentation refused) |
| test_fulfiller_stop_refuses_then_settles | narrow-scope fulfiller's gated action is STOPPED (ACTION_OUTSIDE_MANDATE), no obligation forms | `test_commons_chapter.py::test_out_of_scope_is_stopped` (same verdict code through the real receiver gate for a narrow-scope participant) + `test_world.py::test_outside_scope_task_is_refused_not_obligated` |
| test_multi_party_action_refused_without_second_authorization | offerer revocation before acceptance refuses stale authority | `test_world.py::test_poster_revocation_before_accept_refuses_stale_authority` |
| test_stale_required_party_holds_before_any_evaluation | stale offerer holds before any evaluation | `test_world.py::test_stale_authority_submit_refused` (WORLD_AUTHORITY_STALE on moved head); `test_stale_standing_holds_propose` |
| test_stale_standing_holds_accept | stale acceptor holds, no receipts | `test_world.py::test_stale_acceptor_holds_before_any_evaluation` |
| test_propose_is_idempotent_across_ticks | repeated propose does not duplicate | `test_world.py::test_propose_idempotent_no_duplicate_receipt`, `test_propose_agree_submit_idempotent`, `test_offer_idempotent_no_duplicate_offer` |

## Bucket (b) — intentionally removed with the in-process worker loop

The deterministic in-process worker (`AgentWorker.tick_once()`) is gone:
the server no longer runs a worker loop, so tick-driven behaviors have no
mechanism and no tests, by design. The worker now runs out-of-process
holding its own keys and authorizes every act through the receiver.

- test_tick_with_no_delegation_performs_zero_actions — no loop exists to tick.
- test_tick_quiet_when_mode_manual_despite_delegation — same.
- test_awaiting_approval_waits_quietly — the loop's quiet-wait behavior; the
  external worker's polling discipline is the worker's own concern.
- test_reset_leaves_history_on_disk — the "history on disk" model changed
  by design: reset now unlinks the world snapshot and rotates the receiver
  gate key ("a reset world is a new world"); per-session dirs no longer
  exist. Covered in its new form by
  `test_world.py::test_reset_clears_sessions_and_listings` and
  `test_reset_rotates_receiver_gate_key`.

## Bucket (c) — genuine gaps; action taken

The custody lane kept the Track-A control-plane surface (delegation
records, activity modes, pause switch, escalation records,
`resolve_escalation`, `worker_state` reporting) but removed the only
driver and all its tests. Two kinds of gap resulted.

### (c1) Code path exists, was untested → new tests added

`backend/tests/test_track_a_control_plane.py` (+11) now covers:

| Removed test | New covering test |
|---|---|
| test_delegate_assigns_automation_and_returns_summary | test_delegate_assigns_automation_and_records |
| test_redelegate_redirects_goal_and_resets | test_redelegate_replaces_goal_and_resets_counters |
| test_delegate_validation | test_delegate_validation |
| test_no_delegation_returns_null | test_no_delegation_returns_null |
| test_join_defaults_to_manual | test_join_defaults_to_manual |
| test_scripted_assignable_directly | test_scripted_assignable_directly |
| test_automation_only_via_delegate | test_automation_only_via_delegate |
| test_live_never_assignable, test_unknown_mode_rejected | test_live_and_unknown_modes_rejected |
| test_pause_stops_worker_and_resume_restarts (switch half) | test_pause_switch_set_and_reported, test_pause_switch_rejects_non_bool |
| test_worker_state_transitions (idle/running/paused/held_standing) | test_worker_state_idle_running_held_standing |
| test_state_exposes_track_a_fields | covered via test_delegate_assigns_automation_and_records (state() summary, no secrets) |
| test_delegate_pause_escalation_routes (delegate + pause routes) | delegate/pause behavior covered above; escalation routes have no live path (see c2) |
| test_resolve_errors | NOT re-added: `resolve_escalation` error paths are unreachable in practice because no escalation can exist (see c2). Documented for the owner's call. |

### (c2) Behavioral gaps — documented for the owner's call, not redesigned here

These are not test gaps; the behavior itself has no live enforcement
since the worker loop was removed. Restoring or redesigning enforcement
is a mechanism decision and was explicitly out of scope for this lane.

1. **Delegation limits are recorded, never enforced.** `spending_limit`,
   `work_limit`, `permitted_actions`, `review_conditions`,
   `complete_after_settled` are validated at `delegate()` time and stored,
   but no action path reads them: `World._evaluate_presentation` checks
   mandate scopes, standing freshness, and revocation — not the
   delegation. (Removed tests that asserted enforcement:
   test_escalation_fires_when_action_exceeds_spending_limit,
   test_work_limit_breach_escalates,
   test_new_counterpart_review_condition_escalates,
   test_goal_complete_stops_worker,
   test_out_of_scope_held_with_no_gate_evaluation_and_no_receipt's
   delegation-permitted_actions dimension — the mandate-scope dimension
   is still enforced, bucket (a).)
2. **No escalation can be created.** `World._create_escalation` has no
   callers — the only caller was the removed worker loop. The escalation
   record shape, `escalations_for`, `resolve_escalation`, and the
   `pending_escalations` count still exist, but the create path is dead
   code. (Removed tests: test_approve_resume_flow_end_to_end,
   test_deny_leaves_protected_state_unchanged,
   test_approve_out_of_scope_grant_lets_action_proceed_once,
   test_resolve_errors.) The `worker_state` values `awaiting_approval`
   and `complete` are unreachable: nothing sets a delegation to
   `complete` or creates a pending escalation.
3. **The pause switch is display-only.** `set_paused` flips
   `session.paused`, and `_worker_state` reports `"paused"`, but no gate
   or action path consults it — a paused participant's worker-signed
   presentations are still evaluated. In the custody model the worker is
   external, so pause is advisory to the worker's own loop; the receiver
   does not enforce it. (Removed test: the enforcement half of
   test_pause_stops_worker_and_resume_restarts; the switch half is now
   tested in c1.)
4. **Stale docstrings.** Several `world.py` comments still describe the
   deterministic worker loop as the live driver (e.g. the Track-A
   section header, `_create_escalation`'s "The worker calls this").
   These were left in place except where the lane's edits touched them;
   they describe a retired mechanism and should be revised when the c2
   mechanism decision is made.

Coverage after this lane: backend suite 170 + 11 (new control-plane
tests, `test_track_a_control_plane.py`) + 3 (new trust-gate tests in
`test_commons_chapter.py`: untrusted package never executes,
`run_study` refuses without a trusted pin, trusted fixture still
reproduces) − 2 reworked out = **182** at the isolation-verification commit.
The UNATTENDED-COMMISSION-001 lane adds 21 (`test_commission_chapter.py`)
for **203** total. The Playwright negative battery and headless demo remain
separate harnesses.
