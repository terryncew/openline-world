"""MATCHING-001 analysis: metric tables, verdict, sensitivity.

Reads results.json + selection_reasons.jsonl. Writes REPORT.md data
tables to stdout and analysis.json. No world access needed.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from collections import defaultdict

HERE = Path(__file__).resolve().parent
Z95 = 1.959963984540054


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + Z95 * Z95 / n
    c = (p + Z95 * Z95 / (2 * n)) / denom
    h = Z95 * math.sqrt(p * (1 - p) / n + Z95 * Z95 / (4 * n * n)) / denom
    return (max(0.0, c - h), min(1.0, c + h))


def main() -> None:
    results = json.load(open(HERE / "results.json"))
    fixtures = json.load(open(HERE / "fixtures.json"))
    workers = {w["worker_id"]: w for w in fixtures["workers"]}
    reasons = [json.loads(l) for l in
               open(HERE / "selection_reasons.jsonl") if l.strip()]
    # Selections per policy (exclude C4: separate file).
    selections = defaultdict(int)
    for r in reasons:
        if r["choice"] is not None:
            selections[r["policy"]] += 1

    metrics: dict[str, dict] = {}
    for policy, rep in results["policies"].items():
        tasks = rep["tasks"]
        offered = len(tasks)
        accepted = sum(1 for t in tasks if t["outcome"] == "accepted")
        declined = sum(1 for t in tasks if t["outcome"] == "declined")
        unfinished = sum(1 for t in tasks if t["outcome"] == "unfinished")
        unresolved = sum(1 for t in tasks if t["outcome"] == "unresolved")
        lo, hi = wilson(accepted, offered)
        # Per-task buyer spend = attempt payouts + matching fees for
        # selections on that task.
        task_sel = defaultdict(int)
        for r in reasons:
            if r["policy"] == policy and r["choice"] is not None:
                task_sel[r["task_id"]] += 1
        spend_never_accepted = 0
        for t in tasks:
            s = sum(a.get("seller_payout_cents", 0)
                    for a in t["attempts"]) + 5 * task_sel[t["task_id"]]
            t["buyer_spend_cents"] = s
            if t["outcome"] != "accepted":
                spend_never_accepted += s
        total = rep["total_buyer_spend_cents"]
        # Cross-check: task-level sum must equal the ledger reconciliation.
        task_sum = sum(t["buyer_spend_cents"] for t in tasks)
        assert task_sum == total, \
            f"accounting mismatch {policy}: {task_sum} != {total}"
        cpa = total / accepted if accepted else float("inf")
        metrics[policy] = {
            "offered": offered, "accepted": accepted, "declined": declined,
            "unfinished": unfinished, "unresolved": unresolved,
            "acceptance_rate": round(accepted / offered, 4) if offered else 0,
            "acceptance_ci95": [round(lo, 4), round(hi, 4)],
            "total_buyer_spend_cents": total,
            "cost_per_accepted_cents": round(cpa, 1),
            "spend_never_accepted_cents": spend_never_accepted,
            "matching_overhead_cents": rep["matching_fees_cents"],
            "n_selections": selections[policy],
        }

    # Per-block uncertainty on the cost-per-accepted difference.
    block_diff = []
    for b in range(1, 9):
        cpas = {}
        for policy in ("A", "B"):
            ts = [t for t in results["policies"][policy]["tasks"]
                  if t["task_id"].startswith(f"{policy}-b{b}-")]
            acc = sum(1 for t in ts if t["outcome"] == "accepted")
            sp = sum(t["buyer_spend_cents"] for t in ts)
            cpas[policy] = sp / acc if acc else None
        if cpas["A"] is not None and cpas["B"] is not None:
            block_diff.append(cpas["A"] - cpas["B"])
    mean_d = sum(block_diff) / len(block_diff)
    sd_d = math.sqrt(sum((d - mean_d) ** 2 for d in block_diff)
                     / (len(block_diff) - 1)) if len(block_diff) > 1 else 0.0

    # Verdict (predeclared rule).
    A, B = metrics["A"], metrics["B"]
    if B["accepted"] < A["accepted"]:
        verdict = ("NO IMPROVEMENT: B accepted fewer jobs "
                   f"({B['accepted']} < {A['accepted']}); declining is not "
                   "rewarded.")
    elif B["cost_per_accepted_cents"] < A["cost_per_accepted_cents"]:
        verdict = ("IMPROVEMENT: B accepted >= as many jobs "
                   f"({B['accepted']} vs {A['accepted']}) at lower cost per "
                   f"accepted result ({B['cost_per_accepted_cents']}c vs "
                   f"{A['cost_per_accepted_cents']}c).")
    elif B["cost_per_accepted_cents"] == A["cost_per_accepted_cents"]:
        verdict = "NO DIFFERENCE: identical cost per accepted result."
    else:
        verdict = ("NO IMPROVEMENT: B cost per accepted result "
                   f"({B['cost_per_accepted_cents']}c) >= A's "
                   f"({A['cost_per_accepted_cents']}c).")

    # Sensitivity: recompute cost-per-accepted under alternate fees.
    sens = {}
    for mf in (0, 20):
        for sf in (150, 600):
            row = {}
            for policy in ("A", "B"):
                tasks = results["policies"][policy]["tasks"]
                chain = sum(sum(a.get("recorded_cost_cents", 0)
                                for a in t["attempts"]) for t in tasks)
                n_acc_attempts = sum(
                    1 for t in tasks for a in t["attempts"]
                    if a.get("outcome") == "accepted")
                total_alt = (chain + sf * n_acc_attempts
                             + mf * selections[policy])
                row[policy] = {"cost_per_accepted_cents":
                               round(total_alt / n_acc_attempts, 1)
                               if n_acc_attempts else None}
            b_wins = (row["B"]["cost_per_accepted_cents"] is not None
                      and row["A"]["cost_per_accepted_cents"] is not None
                      and B["accepted"] >= A["accepted"]
                      and row["B"]["cost_per_accepted_cents"]
                      < row["A"]["cost_per_accepted_cents"])
            sens[f"matching_fee_{mf}_success_fee_{sf}"] = {
                **row, "verdict_holds": b_wins}

    # Seller accounting per policy.
    seller_table = {}
    for policy in ("A", "B"):
        per_worker: dict[str, dict] = {}
        for wid, w in workers.items():
            atts = [a for t in results["policies"][policy]["tasks"]
                    for a in t["attempts"] if a.get("worker_id") == wid
                    and a.get("commission_id")]
            n_att = len(atts)
            n_acc = sum(1 for a in atts if a["outcome"] == "accepted")
            revenue = sum(a.get("seller_payout_cents", 0) for a in atts)
            costs = n_att * w["execution_cost_cents_per_attempt"]
            per_worker[wid] = {"attempts": n_att, "accepted": n_acc,
                               "revenue_cents": revenue,
                               "execution_cost_cents": costs,
                               "net_cents": revenue - costs}
        seller_table[policy] = per_worker
    # Capable sellers: >=3 accepted evaluation tasks across both policies.
    capable = [wid for wid in workers
               if sum(seller_table[p][wid]["accepted"] for p in ("A", "B")) >= 3]
    capable_nets = {wid: {p: seller_table[p][wid]["net_cents"]
                          for p in ("A", "B")} for wid in capable}

    analysis = {
        "metrics": metrics,
        "per_block_cpa_difference_A_minus_B_cents": [round(d, 1)
                                                    for d in block_diff],
        "mean_difference_cents": round(mean_d, 1),
        "sd_difference_cents": round(sd_d, 1),
        "verdict": verdict,
        "sensitivity": sens,
        "seller_table": seller_table,
        "capable_sellers_ge3_accepted": capable,
        "capable_seller_nets_cents": capable_nets,
        "controls": results["controls"],
        "claim_ceiling": results["claim_ceiling"],
    }
    json.dump(analysis, open(HERE / "analysis.json", "w"), indent=2)

    # Console summary.
    print("== MATCHING-001 ==")
    for policy in ("A", "B"):
        m = metrics[policy]
        print(f"policy {policy}: offered={m['offered']} accepted={m['accepted']} "
              f"rate={m['acceptance_rate']} ci95={m['acceptance_ci95']} "
              f"declined={m['declined']} unfinished={m['unfinished']} "
              f"unresolved={m['unresolved']}")
        print(f"  total buyer spend={m['total_buyer_spend_cents']}c "
              f"cost/accepted={m['cost_per_accepted_cents']}c "
              f"spend never-accepted={m['spend_never_accepted_cents']}c "
              f"matching overhead={m['matching_overhead_cents']}c "
              f"selections={m['n_selections']}")
    print(f"per-block CPA(A-B): mean {mean_d:.1f}c, sd {sd_d:.1f}c, n={len(block_diff)}")
    print("VERDICT:", verdict)
    print("sensitivity (does the verdict hold?):")
    for k, v in sens.items():
        print(f"  {k}: A={v['A']['cost_per_accepted_cents']}c "
              f"B={v['B']['cost_per_accepted_cents']}c holds={v['verdict_holds']}")
    print("capable sellers (>=3 accepted):", capable)
    for wid, nets in capable_nets.items():
        print(f"  {wid}: net A={nets['A']}c B={nets['B']}c")
    print("controls:", {k: v.get("pass") for k, v in
                        results["controls"].items()})


if __name__ == "__main__":
    main()
