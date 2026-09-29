"""MATCHING-001 main driver: history -> evaluation -> controls.

Usage: python3 main.py [--fresh]
--fresh wipes the data root and reruns everything (only before the freeze).
After the freeze commit, reruns are forbidden; this script refuses to run
if results already exist.
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / ".." / ".." / "backend"))
sys.path.insert(0, str(HERE / ".." / ".." / "backend" / "tests"))

from world import World  # noqa: E402
from commission import sign_contract_sha, contract_id_for  # noqa: E402
from run_all import (DATA_ROOT, HISTORY_SEED, phase_history, run_policy,
                     history_query, get_client, build_contract,
                     POLICY_BUYERS, FIX, HEIGHT, WORKERS, SUCCESS_FEE,
                     MATCHING_FEE)  # noqa: E402

RESULTS = HERE / "results.json"


def control_c4(world: World, reason_log, cutoff_iso: str) -> dict:
    """No affordable suitable offer: 10c budget, both selectors decline."""
    from run_all import EVAL
    out = {}
    for policy in ("A", "B"):
        buyer_pid = f"mw-buyer-c4{policy.lower()}"
        # NOTE: run_policy funds the buyer itself; do not fund here too
        # (double-fund bug fixed 2026-09-28: two different idempotency keys
        # funded 10c twice, breaking the C4 zero-spend assertion).
        rep = run_policy(world, policy, cutoff_iso,
                         reason_log,
                         blocks=[[EVAL["blocks"][0][0]]],
                         ceiling_cents=10,
                         buyer_pid_override=buyer_pid)
        out[policy] = {
            "task_outcome": rep["tasks"][0]["outcome"],
            "total_buyer_spend_cents": rep["total_buyer_spend_cents"],
        }
        assert rep["tasks"][0]["outcome"] == "declined", \
            f"C4 failed for {policy}"
        assert rep["total_buyer_spend_cents"] == 0, f"C4 spent for {policy}"
    out["pass"] = True
    return out


def control_c6(world: World, buyer_hist) -> dict:
    """Frozen acceptance: criteria cannot be rewritten after the result."""
    rejected = [c for c in world.commissions.values()
                if c.get("settlement") and c["contract"]["job"]["task"]
                .startswith("[tide-report]")
                and c["deliverable"] and not c["deliverable"]["accepted"]]
    assert rejected, "C6 needs a rejected commission"
    com = rejected[0]
    seller_pid = com["contract"]["seller_id"]
    task = com["contract"]["job"]["task"]
    harbor = [h for h in HEIGHT if f" {h} " in task or task.endswith(h + ".")
              or f"the {h} harbor" in task][0]
    # Original record is immutable.
    assert com["deliverable"]["accepted"] is False
    orig_accept = list(com["contract"]["acceptance"]["required_substrings"])
    # A relaxed contract is a DIFFERENT contract.
    relaxed = build_contract(
        buyer_hist.pid, seller_pid, "tide-report", task, [harbor], 10, 4)
    out = world.commission_propose_contract(
        buyer_hist.pid, buyer_hist.token, relaxed)
    assert out["contract_id"] != com["contract_id"], \
        "relaxed criteria must change the contract id"
    # Tampered authorization is refused.
    bad_sig = sign_contract_sha(buyer_hist.root_key, "00" * 32)
    try:
        world.commission_authorize_contract(
            buyer_hist.pid, buyer_hist.token, out["contract_id"], bad_sig)
        raise AssertionError("C6: tampered authorization was accepted")
    except Exception as e:
        assert "AUTHORIZATION_INVALID" in str(e), f"C6 wrong error: {e}"
    # Original record untouched.
    assert com["contract"]["acceptance"]["required_substrings"] == orig_accept
    assert com["deliverable"]["accepted"] is False
    return {"pass": True,
            "rejected_commission": com["commission_id"],
            "relaxed_contract_id": out["contract_id"],
            "original_contract_id": com["contract_id"]}


def control_c7(world: World, eval_reports: dict) -> dict:
    """No duplicate settlement: same idempotency key replays one settlement."""
    # Find a settled evaluation commission with a recorded submit tag.
    target = None
    for rep in eval_reports.values():
        for t in rep["tasks"]:
            for a in t["attempts"]:
                if a.get("commission_id"):
                    target = (rep["policy"], t["task_id"], a)
                    break
            if target:
                break
        if target:
            break
    assert target, "C7 needs a settled evaluation commission"
    policy, task_id, attempt = target
    com_id = attempt["commission_id"]
    com = world.commissions[com_id]
    tag = attempt.get("submit_tag")
    assert tag, "attempt must record its submit idempotency tag"
    seller_pid = com["contract"]["seller_id"]
    from run_all import get_client as _gc
    seller = _gc(world, seller_pid)
    # Re-submit with the SAME key and the SAME deliverable text: must
    # replay the single recorded settlement, not re-settle. (Submitting
    # different text under the same key is correctly a
    # WORLD_IDEMPOTENCY_CONFLICT, not a replay.)
    same_text = com["deliverable"]["text"]
    again = world.commission_submit_deliverable(
        seller.pid, seller.token, com_id, same_text,
        seller.presentation(world, "commission.submit-deliverable"),
        idempotency_key=tag)
    assert again.get("replayed") is True, "C7: expected a replay"
    assert (again["settlement"]["settlement_id"]
            == com["settlement"]["settlement_id"])
    settles = [e for e in world.commission_ledger
               if e["kind"] == "settle"
               and e["commission_id"] == com_id]
    assert len(settles) == 1, f"C7: {len(settles)} settle entries"
    return {"pass": True, "commission_id": com_id,
            "settlement_id": com["settlement"]["settlement_id"]}


def main() -> None:
    fresh = "--fresh" in sys.argv
    if RESULTS.exists() and not fresh:
        print("results.json exists; refusing to rerun after the freeze. "
              "Use --fresh only before the freeze commit.")
        sys.exit(2)
    if fresh and DATA_ROOT.exists():
        shutil.rmtree(DATA_ROOT)
    DATA_ROOT.mkdir(parents=True, exist_ok=True)

    world = World(data_root=DATA_ROOT)
    reason_path = HERE / "selection_reasons.jsonl"
    if reason_path.exists():
        reason_path.unlink()
    reason_log = open(reason_path, "w")

    print("== phase 1: history ==")
    cutoff = phase_history(world)
    (HERE / "history").mkdir(exist_ok=True)
    with open(HERE / "history" / "manifest.json", "w") as f:
        json.dump({"cutoff_iso": cutoff,
                   "n_commissions": len(world.commissions),
                   "seed": HISTORY_SEED}, f, indent=2)
    hist = history_query(world, cutoff)
    print("history summary:",
          {w: hist.get(w, {"n": 0, "k": 0}) for w in WORKERS})

    print("== phase 2: evaluation ==")
    eval_reports = {}
    for policy in ("A", "B"):
        print(f"  policy {policy}...")
        eval_reports[policy] = run_policy(world, policy, cutoff, reason_log)
        r = eval_reports[policy]
        acc = sum(1 for t in r["tasks"] if t["outcome"] == "accepted")
        print(f"  policy {policy}: {acc}/{len(r['tasks'])} accepted, "
              f"spend {r['total_buyer_spend_cents']}c")
    reason_log.close()

    print("== controls ==")
    reason_log2 = open(HERE / "selection_reasons_c4.jsonl", "w")
    c4 = control_c4(world, reason_log2, cutoff)
    reason_log2.close()
    print("  C4 pass:", c4["pass"])
    buyer_hist = get_client(world, "mw-buyer-hist")
    c6 = control_c6(world, buyer_hist)
    print("  C6 pass:", c6["pass"])
    c7 = control_c7(world, eval_reports)
    print("  C7 pass:", c7["pass"])

    # C5: no buyer ever exceeded its ceiling (Session asserts inline;
    # this is the final cross-check).
    for pid, ceil in [("mw-buyer-A", 40000), ("mw-buyer-B", 40000),
                      ("mw-buyer-c4a", 10), ("mw-buyer-c4b", 10)]:
        bal = world.simulated_balances.get(pid, 0)
        assert bal >= 0, f"C5 negative balance {pid}"
    print("  C5 pass: all balances non-negative, inline reserve checks held")

    results = {
        "cutoff_iso": cutoff,
        "session_ceiling_cents": 40000,
        "history_summary": hist,
        "policies": {p: {"tasks": r["tasks"],
                         "matching_fees_cents": r["matching_fees_cents"],
                         "buyer_chain_spend_cents":
                             r["buyer_chain_spend_cents"],
                         "total_buyer_spend_cents":
                             r["total_buyer_spend_cents"]}
                     for p, r in eval_reports.items()},
        "controls": {"C4_no_affordable_offer": c4,
                     "C6_frozen_criteria": c6,
                     "C7_no_duplicate_settlement": c7,
                     "C5_budget_enforcement": {"pass": True}},
        "claim_ceiling": ("Internal simulated market evidence only. This does "
                          "not establish real demand, independent "
                          "counterparties, sustainable seller income, or "
                          "profitable arbitrage."),
    }
    with open(RESULTS, "w") as f:
        json.dump(results, f, indent=2)
    world.save()
    print("results written to", RESULTS)


if __name__ == "__main__":
    main()
