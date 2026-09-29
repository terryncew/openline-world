"""MATCHING-001 runner part 2: history phase, evaluation phase, controls.

Appended to runner.py via this file's contents; run as `python3 run_all.py`.
"""
from __future__ import annotations

import json
import random
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / ".." / ".." / "backend"))
sys.path.insert(0, str(HERE / ".." / ".." / "backend" / "tests"))

from world import World  # noqa: E402
from commission import sign_contract_sha  # noqa: E402
import m1_selectors as selectors  # noqa: E402
from runner import (DATA_ROOT, SCOPES, SESSION_CEILING_CENTS, RETRY_ATTEMPTS,
                    HISTORY_SEED, Session, WorkerDeclined, get_client,
                    build_contract, tide_contract, run_attempt,
                    utcnow_iso)  # noqa: E402

FIX = json.load(open(HERE / "fixtures.json"))
EVAL = json.load(open(HERE / "eval_tasks.json"))
HEIGHT = {h["harbor"]: h["true_height_m"] for h in FIX["harbors"]}
WORKERS = {w["worker_id"]: w for w in FIX["workers"]}
MATCHING_FEE = FIX["matching_fee_cents"]
SUCCESS_FEE = FIX["success_fee_cents"]
HISTORY_BUYER = "mw-buyer-hist"
POLICY_BUYERS = {"A": "mw-buyer-A", "B": "mw-buyer-B"}


def offers_for(harbor: str) -> list[dict]:
    """Offer list: posted price + advertised (self-reported) coverage."""
    offers = []
    for wid, w in WORKERS.items():
        coverage = (list(FIX["harbors"][i]["harbor"] for i in range(24))
                    if wid == "mw-s6" else sorted(w["facts"].keys()))
        offers.append({"worker_id": wid,
                       "attempt_price_cents": w["attempt_price_cents"],
                       "advertised_coverage": coverage})
    return offers


def history_query(world: World, cutoff_iso: str,
                  job_class: str = "tide-report") -> dict[str, dict]:
    """Recorded attempts before the cutoff, from real commission records."""
    hist: dict[str, dict] = {}
    for com in world.commissions.values():
        if not com.get("settlement"):
            continue
        if com.get("started_at", "") >= cutoff_iso:
            continue
        task = com["contract"]["job"]["task"]
        cls = task[1:].split("]")[0] if task.startswith("[") else ""
        wid = com["contract"]["seller_id"]
        entry = hist.setdefault(wid, {"n": 0, "k": 0, "other_class_n": 0})
        if cls == job_class:
            entry["n"] += 1
            if com["deliverable"] and com["deliverable"]["accepted"]:
                entry["k"] += 1
        else:
            entry["other_class_n"] += 1
    return hist


def phase_history(world: World) -> str:
    """Record history-building commissions. Returns the cutoff timestamp."""
    buyer = get_client(world, HISTORY_BUYER)
    sellers = {wid: get_client(world, wid) for wid in WORKERS}
    world.fund_simulated(buyer.pid, buyer.token, 200000,
                         idempotency_key="m1-fund-hist")
    rng = random.Random(HISTORY_SEED + 2)
    n = 0
    for wid in ("mw-s1", "mw-s2", "mw-s3", "mw-s4", "mw-s5"):
        w = WORKERS[wid]
        cand = sorted(set(w["facts"]) & set(FIX["history_pool"]))
        assert len(cand) >= 4, f"{wid} has <4 history candidates"
        for i, harbor in enumerate(rng.sample(cand, 4)):
            rec = run_attempt(world, buyer, sellers[wid], w, harbor,
                              HEIGHT[harbor], f"hist-{wid}-{i}")
            n += 1
            print(f"  history {rec['commission_id']}: {wid} {harbor} "
                  f"-> {rec['outcome']}")
    # mw-s6: irrelevant-class history (weather-report, accepted).
    w6 = WORKERS["mw-s6"]
    for i in range(2):
        contract = build_contract(
            buyer.pid, sellers["mw-s6"].pid, "weather-report",
            "[weather-report] Summarize the bay weather log.",
            ["bay", "14 kt"], 8, 4)
        out = world.commission_propose_contract(
            buyer.pid, buyer.token, contract)
        cid, sha = out["contract_id"], out["contract_sha256"]
        for c in (buyer, sellers["mw-s6"]):
            sig = sign_contract_sha(c.root_key, sha)
            world.commission_authorize_contract(
                c.pid, c.token, cid, sig)
        st = world.commission_start(buyer.pid, buyer.token, cid,
                                    idempotency_key=f"start-histw-{i}")
        com_id = st["commission_id"]
        world.commission_report_cost(
            sellers["mw-s6"].pid, sellers["mw-s6"].token, com_id,
            "report.write", 4, 32,
            sellers["mw-s6"].presentation(world, "commission.report-cost"),
            idempotency_key=f"cost-histw-{i}")
        res = world.commission_submit_deliverable(
            sellers["mw-s6"].pid, sellers["mw-s6"].token, com_id,
            "Weather report for bay: winds 14 kt from the west.",
            sellers["mw-s6"].presentation(
                world, "commission.submit-deliverable"),
            idempotency_key=f"submit-histw-{i}")
        n += 1
        print(f"  history {com_id}: mw-s6 weather-report -> {res['outcome']}")
    world.save()
    cutoff = utcnow_iso()
    print(f"  {n} history commissions recorded; cutoff {cutoff}")
    return cutoff


def run_policy(world: World, policy: str, cutoff_iso: str,
               reason_log, blocks=None,
               ceiling_cents: int = SESSION_CEILING_CENTS,
               buyer_pid_override: str | None = None) -> dict:
    """Run evaluation tasks under one policy. Returns the policy report."""
    buyer_pid = buyer_pid_override or POLICY_BUYERS[policy]
    buyer = get_client(world, buyer_pid)
    sellers = {wid: get_client(world, wid) for wid in WORKERS}
    world.fund_simulated(buyer.pid, buyer.token, ceiling_cents,
                         idempotency_key=f"m1-fund-{policy}-{buyer_pid}")
    session = Session(ceiling_cents)
    history = history_query(world, cutoff_iso)
    offers_cache: dict[str, list[dict]] = {}

    report = {"policy": policy, "buyer_pid": buyer_pid, "tasks": [],
              "matching_fees_cents": 0}
    for b, block in enumerate(blocks or EVAL["blocks"]):
        for t in block:
            task_id = f"{policy}-b{b + 1}-{t['task_id']}"
            harbor = t["harbor"]
            offers = offers_cache.setdefault(harbor, offers_for(harbor))
            tried: set[str] = set()
            task_rec = {"task_id": task_id, "harbor": harbor,
                        "attempts": [], "outcome": None,
                        "buyer_spend_cents": 0}
            attempts = 0
            while attempts < RETRY_ATTEMPTS:
                remaining = (ceiling_cents
                             - session.exposure(world, buyer_pid))
                if policy == "A":
                    ranked = selectors.rank_a(
                        offers, harbor, remaining, SUCCESS_FEE, MATCHING_FEE,
                        tried)
                    rows = [{"worker_id": r["worker_id"],
                             "price_cents": r["price_cents"],
                             "excluded": r["excluded"]} for r in ranked]
                else:
                    ranked, rows = selectors.rank_b(
                        offers, harbor, remaining, SUCCESS_FEE, MATCHING_FEE,
                        tried, history)
                choice, reason = selectors.choose(ranked, policy)
                reason_log.write(json.dumps({
                    "task_id": task_id, "policy": policy, "harbor": harbor,
                    "round": attempts + 1, "candidates": rows,
                    "choice": choice, "reason": reason,
                    "remaining_budget_cents": remaining}) + "\n")
                if choice is None:
                    task_rec["outcome"] = "declined"
                    task_rec["decline_reason"] = reason
                    session.declined_tasks.append(task_rec)
                    break
                # Charge the explicitly simulated matching fee at selection.
                session.charge_matching_fee(world, buyer_pid, MATCHING_FEE,
                                            task_id, choice, policy)
                report["matching_fees_cents"] += MATCHING_FEE
                tried.add(choice)
                w = WORKERS[choice]
                tag = f"{policy}-{task_id}-a{attempts + 1}"
                try:
                    rec = run_attempt(world, buyer, sellers[choice], w,
                                      harbor, HEIGHT[harbor], tag)
                except WorkerDeclined as e:
                    task_rec["attempts"].append(
                        {"worker_id": choice, "outcome": "declined",
                         "reason": str(e)})
                    continue  # decline costs the fee, not an attempt
                except Exception as e:  # noqa: BLE001 - recorded, not retried
                    task_rec["attempts"].append(
                        {"worker_id": choice, "outcome": "unresolved",
                         "reason": f"{type(e).__name__}: {e}"})
                    task_rec["outcome"] = "unresolved"
                    break
                attempts += 1
                task_rec["attempts"].append(
                    {"worker_id": choice, "outcome": rec["outcome"],
                     "commission_id": rec["commission_id"],
                     "submit_tag": f"submit-{tag}",
                     "recorded_cost_cents":
                         rec["settlement"]["recorded_cost_cents"],
                     "success_fee_cents":
                         rec["settlement"]["success_fee_cents"],
                     "seller_payout_cents":
                         rec["settlement"]["seller_payout_cents"],
                     "reasons": rec["reasons"]})
                if rec["outcome"] == "accepted":
                    task_rec["outcome"] = "accepted"
                    break
            else:
                pass
            if task_rec["outcome"] is None:
                task_rec["outcome"] = ("unfinished"
                                       if task_rec["attempts"] else "declined")
            # Buyer spend on this task: settled chain movement + fees.
            report["tasks"].append(task_rec)
    # Reconcile buyer spend from the world ledger.
    bal = world.simulated_balances.get(buyer_pid, 0)
    chain_spend = ceiling_cents - bal
    report["buyer_chain_spend_cents"] = chain_spend
    report["total_buyer_spend_cents"] = (chain_spend
                                         + report["matching_fees_cents"])
    world.save()
    return report
