"""Deterministic automation worker for the shared world.

THIS IS DETERMINISTIC AUTOMATION, NOT A MODEL. There is no inference, no
scoring, no ranking, and no randomness anywhere in this module: each tick
runs a fixed rule loop over the world's existing mechanical state. Every
docstring, comment, and API label in this file says so, and nothing here
may imply otherwise.

What the worker does, once per tick, for each participant with an ACTIVE
owner delegation whose session is in "automation" mode, not paused, and
with no pending escalation -- at most ONE step per participant per tick,
in this fixed order:

    0. Stop conditions (checked first, every tick): the loop STOPS for a
       delegation when (a) its goal is complete (complete_after_settled
       worker-settled exchanges reached -- status "complete"), (b) its
       budget is exhausted (a limit breach escalated and paused the
       delegation), (c) authority is revoked (the mandate is no longer
       active -- status "revoked", set before any further gate
       evaluation), or (d) required approval is pending (an escalation
       awaits the owner). While an approval is pending the worker waits
       quietly: no repeated requests, no spending, no polling side
       effects. The per-participant worker_state in world state exposes
       all of this for UI display.
    1. Standing freshness: if the session's standing check is older than
       MAX_STANDING_AGE_SECONDS, HOLD -- record the hold and do nothing
       else. A stale standing is never assumed current.
    2. Agreements needing this participant's explicit act, oldest first:
       as counterpart of a "proposed" agreement -> agree (consent only);
       as proposer of an "agreed" agreement -> perform the supported work
       by proposing the TASK_KINDS-mapped action through the participant's
       OWN gate (a permission check -- it never executes the action), then
       submit through the receiver for its verdict (settled/refused).
    3. Discovery: the world's mechanical suggestions_for() (kind-match of
       the participant's own open listings against others' -- deterministic,
       no scoring). For the first uncovered match, within limits, propose
       an agreement (consent record, no gate evaluation) with an
       idempotency key derived from the delegation id + listing id.

"Within limits" means: the task kind is in the delegation's
permitted_actions, actions_count < work_limit, the spending rules below
hold, and no review condition fires. Anything else -- a task kind outside
permitted_actions, a breached limit, a fired review condition -- becomes
an ESCALATION: the delegation pauses and NOTHING is evaluated, minted, or
executed until the owner approves (one-shot authorization; the action
still goes through the receiver) or denies (the delegation resumes
without that action; the denial is recorded by fingerprint so the worker
never re-proposes or re-escalates it). Out-of-scope kinds are NEVER
proposed through any gate.

Spending: each worker-initiated gate evaluation (the work propose, the
submit) costs one unit against spending_limit. If spent + cost would
exceed the limit -> escalate "over_spending". If the review condition
over_spending is set, the FIRST spend under a delegation escalates
"spending_review" so the owner sees the spend plan before anything runs.
Consent records (propose_agreement, agree) cost nothing: they mint no
receipt and evaluate no gate.

Agreement stays distinct from authorization throughout: "agreed" is
mutual consent only -- exactly as in World -- and only the receiver's
verdict on submit settles or refuses the exchange.

Revocation still stops the worker: an inactive mandate is detected at
the top of the tick (a local record read -- no gate evaluation, no
receipt, no polling side effect) and the delegation is marked "revoked",
terminally. A STOPPED verdict on a work propose is likewise terminal for
the delegation and is never submitted past.

Replays are fresh sessions: the worker holds no cross-session memory
beyond the world's own records. Kill and restart is safe: every effect
the worker produces carries an idempotency key derived from the
delegation id + the listing/agreement id, only successful outcomes are
recorded in the world's idempotency ledger, and the worker never
re-proposes a listing it already has an agreement record on -- so a
restarted worker replays stored outcomes instead of duplicating work.
"""
from __future__ import annotations

import threading
from typing import Any

from openline_wallet.clock import utc_now
from openline_wallet.errors import WalletError
from world import MAX_STANDING_AGE_SECONDS, TASK_KINDS, WorldRuleError


class AgentWorker:
    """The deterministic automation loop. See the module docstring."""

    def __init__(self, world: Any, tick_seconds: float = 5.0) -> None:
        self._world = world
        self.tick_seconds = float(tick_seconds)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        # Ticks completed. Monotonic; used by operators, never by the rules.
        self.ticks = 0

    # -- lifecycle ------------------------------------------------------
    def start(self) -> None:
        """Start the daemon tick thread. Idempotent."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="agent-worker", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        """Signal the loop to stop and wait for the thread."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)

    def _run(self) -> None:
        while not self._stop.wait(self.tick_seconds):
            try:
                self.tick_once()
            except Exception as exc:  # never let one bad tick kill the loop
                self._world.events.emit(
                    source="worker", kind="worker-error",
                    provenance="worker-loop",
                    summary=f"Worker tick failed: {type(exc).__name__}.",
                    detail={"error": type(exc).__name__})

    def tick_once(self) -> None:
        """Run one deterministic tick synchronously.

        The test entry point: the full rule loop, no threads, no timing.
        The world's coarse lock is held so a tick never interleaves with
        itself."""
        with self._world._lock:
            self._tick()
            self.ticks += 1

    # -- one tick ---------------------------------------------------------
    def _tick(self) -> None:
        for session in list(self._world.sessions.values()):
            try:
                self._tick_participant(session)
            except Exception as exc:
                # One participant's step must never abort the tick for the
                # others.
                self._world.events.emit(
                    source="worker", kind="worker-error",
                    provenance="worker-loop",
                    summary=(f"Worker step failed for "
                             f"{session.participant_id}: {type(exc).__name__}."),
                    detail={"participant_id": session.participant_id,
                            "error": type(exc).__name__})

    def _tick_participant(self, session: Any) -> None:
        w = self._world
        pid = session.participant_id
        dlg = w.delegations.get(pid)
        if dlg is None or dlg.get("status") != "active":
            return
        if session.activity_mode != "automation":
            return
        if session.paused:
            return
        if any(e["participant_id"] == pid and e["status"] == "pending"
               for e in w.escalations.values()):
            return
        # Stop condition (c): authority revoked. A local record read -- no
        # gate evaluation, no receipt, no polling side effect. Terminal:
        # the delegation is marked "revoked" and the worker never steps
        # for it again. (Revocation is permanent within a session.)
        rec = session.gate.mandate_record(session.agent_id)
        if rec is None or not rec.get("active"):
            if dlg.get("status") == "active":
                dlg["status"] = "revoked"
                dlg["updated_at"] = utc_now().isoformat()
                w.events.emit(
                    source="worker", kind="worker-stopped",
                    provenance="worker-loop",
                    summary=(f"Worker stopped for {session.display_name}: "
                             "mandate revoked; delegation marked revoked."),
                    detail={"participant_id": pid})
            return
        # Standing freshness: stale or unknown -> HOLD, record it, do
        # nothing else. No gate runs, no receipt, no effects.
        try:
            w._require_fresh_standing(session)
        except WalletError:
            dlg["holds"].append({"at": utc_now().isoformat(),
                                 "reason": "HOLD_STANDING_UNKNOWN"})
            w.events.emit(
                source="worker", kind="worker-hold", provenance="worker-loop",
                summary=(f"Worker held for {session.display_name}: standing "
                         "not current; nothing acted on."),
                detail={"participant_id": pid})
            return
        # Agreements needing this participant's explicit act, oldest first.
        mine = [a for a in w.agreements.values()
                if pid in (a["proposer"], a["counterpart"])
                and a["status"] in ("proposed", "agreed")]
        mine.sort(key=lambda a: (a["created_at"], a["agreement_id"]))
        for agr in mine:
            if agr["status"] == "proposed" and pid == agr["counterpart"]:
                if self._counterpart_agree(w, session, dlg, agr):
                    return
            elif agr["status"] == "agreed" and pid == agr["proposer"]:
                if self._fulfill_and_submit(w, session, dlg, agr):
                    return
        # Discovery: mechanical kind-match only, first uncovered match.
        suggestions = w.suggestions_for(pid, session.token)["suggestions"]
        for s in suggestions:
            if self._covered(w, pid, s["listing_id"]):
                continue
            if self._maybe_propose(w, session, dlg, s):
                return

    # -- guards -----------------------------------------------------------
    def _guard(self, w: Any, session: Any, dlg: dict[str, Any], reason: str,
               proposed_kind: str, label: str, target_id: str,
               context: dict[str, Any]) -> str:
        """Limit/review gate for one worker step.

        Returns "proceed" (an unused one-shot owner grant was consumed --
        act once), "held" (a fresh escalation was created and the
        delegation paused -- stop this tick), or "skip" (the owner denied
        this exact action -- try the next candidate, never re-escalate).
        """
        fp = f"{reason}:{proposed_kind}:{target_id}"
        if fp in dlg["denied"]:
            return "skip"
        grant = dlg["grants"].get(fp)
        if grant is not None and grant["uses"] > 0:
            grant["uses"] -= 1
            if grant["uses"] <= 0:
                del dlg["grants"][fp]
            w.events.emit(
                source="worker", kind="worker-grant", provenance="worker-loop",
                summary=(f"One-shot owner approval consumed for "
                         f"{session.display_name}: {label}."),
                detail={"participant_id": session.participant_id,
                        "fingerprint": fp})
            return "proceed"
        w._create_escalation(session, dlg, reason,
                             {"kind": proposed_kind, "label": label},
                             dict(context, target_id=target_id))
        return "held"

    def _covered(self, w: Any, pid: str, listing_id: str) -> bool:
        """True when this participant already has an agreement record on
        this listing in any non-withdrawn state -- the worker never
        proposes twice. A declined agreement also covers: the counterpart's
        no stands for this delegation."""
        for a in w.agreements.values():
            if (a["listing_id"] == listing_id and a["proposer"] == pid
                    and a["status"] in ("proposed", "agreed", "submitted",
                                        "accepted", "refused", "settled",
                                        "declined")):
                return True
        return False

    def _skip(self, w: Any, pid: str, what: str, listing_or_agreement: str,
              code: str) -> bool:
        w.events.emit(
            source="worker", kind="worker-skip", provenance="worker-loop",
            summary=(f"Worker could not {what} {listing_or_agreement}: "
                     f"{code}."),
            detail={"participant_id": pid})
        return True

    # -- step: propose ------------------------------------------------------
    def _maybe_propose(self, w: Any, session: Any, dlg: dict[str, Any],
                       suggestion: dict[str, Any]) -> bool:
        """Propose an agreement on a discovered listing, within limits.

        Returns True when the tick's step is consumed (acted, held on an
        escalation, or skipped on a world-rule failure) and False when the
        worker should try the next suggestion (owner denied this one)."""
        pid = session.participant_id
        kind = suggestion["kind"]
        listing_id = suggestion["listing_id"]
        counterpart = suggestion["from_participant"]
        if kind not in dlg["permitted_actions"]:
            # Out of scope: NEVER proposed through any gate. The escalation
            # is created with no gate evaluation and no receipt.
            g = self._guard(
                w, session, dlg, "out_of_scope", "agreement",
                f"propose an agreement on {suggestion['title']!r} (task kind "
                f"{kind!r}): outside the delegated permitted_actions -- "
                "awaiting owner",
                listing_id, {"counterpart": counterpart})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        if dlg["actions_count"] >= dlg["work_limit"]:
            g = self._guard(
                w, session, dlg, "work_limit", "agreement",
                f"propose an agreement on {listing_id}: work_limit "
                f"{dlg['work_limit']} reached -- awaiting owner",
                listing_id, {"counterpart": counterpart})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        if (dlg["review_conditions"].get("new_counterpart")
                and counterpart not in dlg["known_counterparts"]):
            g = self._guard(
                w, session, dlg, "new_counterpart", "agreement",
                f"propose an agreement on {listing_id}: first contact with "
                f"new counterpart {counterpart} -- owner review requested",
                listing_id, {"counterpart": counterpart})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        # Within limits: record this participant's consent (a world-rule
        # record, not a gate evaluation). Idempotency key derives from the
        # delegation id + listing id.
        try:
            w.propose_agreement(pid, session.token, listing_id,
                                f"{dlg['delegation_id']}:{listing_id}")
        except (WalletError, WorldRuleError) as exc:
            return self._skip(w, pid, "propose an agreement on", listing_id,
                              getattr(exc, "code", type(exc).__name__))
        dlg["actions_count"] += 1
        dlg["known_counterparts"].add(counterpart)
        dlg["updated_at"] = utc_now().isoformat()
        return True

    # -- step: agree (as counterpart) ---------------------------------------
    def _counterpart_agree(self, w: Any, session: Any, dlg: dict[str, Any],
                           agreement: dict[str, Any]) -> bool:
        """Record the counterpart's explicit agree on a proposed agreement.

        "Agreed" is mutual consent only -- no gate is evaluated, no receipt
        is minted, nothing is authorized. Same limits and guards as
        proposing."""
        pid = session.participant_id
        agr_id = agreement["agreement_id"]
        listing, _side = w._find_listing(agreement["listing_id"])
        kind = listing["task"]["kind"] if listing else "unknown"
        proposer = agreement["proposer"]
        if kind not in dlg["permitted_actions"]:
            g = self._guard(
                w, session, dlg, "out_of_scope", "agreement",
                f"agree to {agr_id} (task kind {kind!r}): outside the "
                "delegated permitted_actions -- awaiting owner",
                agr_id, {"counterpart": proposer})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        if dlg["actions_count"] >= dlg["work_limit"]:
            g = self._guard(
                w, session, dlg, "work_limit", "agreement",
                f"agree to {agr_id}: work_limit {dlg['work_limit']} "
                "reached -- awaiting owner",
                agr_id, {"counterpart": proposer})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        if (dlg["review_conditions"].get("new_counterpart")
                and proposer not in dlg["known_counterparts"]):
            g = self._guard(
                w, session, dlg, "new_counterpart", "agreement",
                f"agree to {agr_id}: first contact with new counterpart "
                f"{proposer} -- owner review requested",
                agr_id, {"counterpart": proposer})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        try:
            w.agree(pid, session.token, agr_id,
                    f"{dlg['delegation_id']}:{agr_id}:agree")
        except (WalletError, WorldRuleError) as exc:
            return self._skip(w, pid, "agree to", agr_id,
                              getattr(exc, "code", type(exc).__name__))
        dlg["actions_count"] += 1
        dlg["known_counterparts"].add(proposer)
        dlg["updated_at"] = utc_now().isoformat()
        return True

    # -- step: perform + submit (as proposer) --------------------------------
    def _fulfill_and_submit(self, w: Any, session: Any, dlg: dict[str, Any],
                            agreement: dict[str, Any]) -> bool:
        """The proposer's turn on an agreed agreement: perform the supported
        work by proposing the TASK_KINDS-mapped action through the
        participant's OWN gate (a permission check -- harmless, it never
        executes the action), then submit through the receiver for its
        verdict. The receiver decides settled vs refused; the worker does
        not."""
        pid = session.participant_id
        agr_id = agreement["agreement_id"]
        listing, _side = w._find_listing(agreement["listing_id"])
        if listing is None:
            return self._skip(w, pid, "fulfill", agr_id,
                              "listing no longer exists")
        kind = listing["task"]["kind"]
        action = TASK_KINDS[kind]
        if kind not in dlg["permitted_actions"]:
            g = self._guard(
                w, session, dlg, "out_of_scope", action,
                f"perform {action} for {agr_id} (task kind {kind!r}): "
                "outside the delegated permitted_actions -- awaiting owner",
                agr_id, {})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        if dlg["actions_count"] >= dlg["work_limit"]:
            g = self._guard(
                w, session, dlg, "work_limit", action,
                f"perform {action} for {agr_id}: work_limit "
                f"{dlg['work_limit']} reached -- awaiting owner",
                agr_id, {})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        # Spending review: with over_spending set, the first spend under a
        # delegation goes to the owner before anything runs.
        if (dlg["review_conditions"].get("over_spending")
                and not dlg["spending_reviewed"]):
            g = self._guard(
                w, session, dlg, "spending_review", action,
                f"perform {action} for {agr_id}: first spend under this "
                f"delegation (spending_limit {dlg['spending_limit']}) -- "
                "owner review requested",
                agr_id, {})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        # Hard cap: the work propose and the submit each cost one unit.
        if dlg["spent"] + 2 > dlg["spending_limit"]:
            g = self._guard(
                w, session, dlg, "over_spending", action,
                f"perform {action} for {agr_id}: would exceed "
                f"spending_limit {dlg['spending_limit']} (spent "
                f"{dlg['spent']}) -- awaiting owner",
                agr_id, {})
            if g == "held":
                return True  # escalation created; tick step consumed
            if g == "skip":
                return False  # owner denied; try the next candidate
            # "proceed": one-shot owner grant consumed -- act below
        # Perform the supported work: a real gate evaluation through the
        # participant's OWN gate. Harmless by construction -- the workshop
        # gate's propose is a permission check that never executes.
        try:
            work = w.propose(pid, session.token, action,
                             f"{dlg['delegation_id']}:{agr_id}:work")
        except (WalletError, WorldRuleError) as exc:
            return self._skip(w, pid, "perform work for", agr_id,
                              getattr(exc, "code", type(exc).__name__))
        dlg["spent"] += 1
        dlg["actions_count"] += 1
        dlg["updated_at"] = utc_now().isoformat()
        if work["decision"] != "ALLOWED":
            # A STOPPED work propose is terminal for the delegation: the
            # signed STOPPED receipt stands as the record, the worker does
            # not submit past it, and the delegation is marked "revoked"
            # so no further step is ever taken for it.
            dlg["status"] = "revoked"
            dlg["updated_at"] = utc_now().isoformat()
            w.events.emit(
                source="worker", kind="worker-stopped",
                provenance="worker-loop",
                summary=(f"Worker work propose for {agr_id} {work['decision']}: "
                         "not submitting; delegation marked revoked."),
                detail={"participant_id": pid, "agreement_id": agr_id,
                        "decision": work["decision"]})
            return True
        try:
            sub = w.submit(pid, session.token, agr_id,
                           f"{dlg['delegation_id']}:{agr_id}:submit")
        except (WalletError, WorldRuleError) as exc:
            return self._skip(w, pid, "submit", agr_id,
                              getattr(exc, "code", type(exc).__name__))
        dlg["spent"] += 1
        dlg["actions_count"] += 1
        # Stop condition (a): mechanical goal completion. Each exchange
        # the worker settles counts; reaching complete_after_settled marks
        # the delegation "complete" -- terminal, the loop takes no further
        # step for it.
        if sub["status"] == "settled" and sub["decision"] == "ALLOWED":
            dlg["settled_count"] += 1
            target = dlg.get("complete_after_settled")
            if (target is not None
                    and dlg["settled_count"] >= target
                    and dlg.get("status") == "active"):
                dlg["status"] = "complete"
                w.events.emit(
                    source="worker", kind="worker-complete",
                    provenance="worker-loop",
                    summary=(f"Worker goal complete for {session.display_name}: "
                             f"{dlg['settled_count']} exchange(s) settled; "
                             "delegation marked complete."),
                    detail={"participant_id": pid,
                            "settled_count": dlg["settled_count"]})
        dlg["updated_at"] = utc_now().isoformat()
        return True
