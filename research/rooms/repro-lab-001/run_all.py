#!/usr/bin/env python3
"""Run all RESEARCH-ROOM-001 replications through the pinned experiment.

Pin enforcement: sha256 of experiment.py must equal the pinned hash or
the runner refuses to run anything. This is the "reviewed, pinned
experiment through a supported execution path": the bytes are reviewed
once, pinned, and only those exact bytes execute.

Writes results/cond_<C>_rep_<N>.json for 3 conditions x 10 replications,
plus results/aggregate.json with the primary/secondary metrics.

Deterministic: re-running produces byte-identical outputs.
"""
from __future__ import annotations

import hashlib
import json
import os
import statistics
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERIMENT = os.path.join(HERE, "experiment.py")
RESULTS = os.path.join(HERE, "results")

# Pin: sha256 of the reviewed experiment.py bytes. Set by pin.py after
# review; run_all.py refuses to run if the bytes do not match.
PIN_FILE = os.path.join(HERE, "EXPERIMENT.PIN")

MASTER_SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010]
CONDITIONS = ["A", "B", "C"]
BUDGET = 400


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def main() -> int:
    if not os.path.exists(PIN_FILE):
        print("REFUSED: no EXPERIMENT.PIN; the experiment bytes are not "
              "pinned. Run pin.py after review.", file=sys.stderr)
        return 2
    pinned = open(PIN_FILE, encoding="utf-8").read().strip().split()[0]
    actual = sha256_file(EXPERIMENT)
    if actual != pinned:
        print(f"REFUSED: experiment.py hash {actual[:16]}... does not match "
              f"pinned {pinned[:16]}.... Not running.", file=sys.stderr)
        return 2
    os.makedirs(RESULTS, exist_ok=True)
    records = []
    for cond in CONDITIONS:
        for i, seed in enumerate(MASTER_SEEDS, start=1):
            out_path = os.path.join(RESULTS, f"cond_{cond}_rep_{i}.json")
            proc = subprocess.run(
                [sys.executable, EXPERIMENT,
                 "--condition", cond,
                 "--replication", str(i),
                 "--seed", str(seed),
                 "--budget", str(BUDGET)],
                capture_output=True, text=True, timeout=300)
            if proc.returncode != 0:
                print(f"FAILED: {cond} rep {i}: {proc.stderr[-500:]}",
                      file=sys.stderr)
                return 1
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(proc.stdout)
            records.append(json.loads(proc.stdout))
            print(f"done {cond} rep {i}: mse={json.loads(proc.stdout)['best_mse']:.4f}")

    # Aggregate.
    by_cond: dict[str, list[dict]] = {c: [] for c in CONDITIONS}
    for r in records:
        by_cond[r["condition"]].append(r)
    agg: dict = {"conditions": {}, "budget": BUDGET,
                 "replications": len(MASTER_SEEDS),
                 "experiment_pin": pinned}
    for cond in CONDITIONS:
        rs = by_cond[cond]
        mses = [r["best_mse"] for r in rs]
        overhead = [r.get("overhead_evals", 0) for r in rs]
        reached = [r["evals_to_reach_0_05"] for r in rs
                   if r["evals_to_reach_0_05"] is not None]
        agg["conditions"][cond] = {
            "n": len(rs),
            "mean_mse": statistics.mean(mses),
            "std_mse": statistics.stdev(mses) if len(mses) > 1 else 0.0,
            "min_mse": min(mses),
            "max_mse": max(mses),
            "reached_0_05_count": len(reached),
            "median_evals_to_0_05": (statistics.median(reached)
                                     if reached else None),
            "mean_overhead_evals": statistics.mean(overhead),
            "overhead_pct_of_budget": 100.0 * statistics.mean(overhead) / BUDGET,
            "total_rejections": sum(r.get("receipts_rejected", 0) for r in rs),
            "invalid_count": sum(1 for r in rs if "invalid_reason" in r),
        }
    # Frozen decision rule: C improves on B iff
    # mean(C) < mean(B) - pooled_SE.
    b, c = agg["conditions"]["B"], agg["conditions"]["C"]
    pooled_se = (b["std_mse"] ** 2 / b["n"]
                 + c["std_mse"] ** 2 / c["n"]) ** 0.5
    agg["decision"] = {
        "rule": "C improves on B iff mean_MSE(C) < mean_MSE(B) - pooled_SE",
        "mean_B": b["mean_mse"], "mean_C": c["mean_mse"],
        "pooled_se": pooled_se,
        "improved": c["mean_mse"] < b["mean_mse"] - pooled_se,
    }
    with open(os.path.join(RESULTS, "aggregate.json"), "w",
              encoding="utf-8") as f:
        json.dump(agg, f, indent=2, sort_keys=True)
        f.write("\n")
    print(json.dumps(agg["decision"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
