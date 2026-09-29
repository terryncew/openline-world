"""MATCHING-001 frozen selectors. DO NOT MODIFY after the freeze commit.

Policy A: cheapest-eligible-first.
Policy B: evidence-informed (Wilson lower bound on recorded tide-report
acceptance, expected cost per accepted result). Workers with < 3 recorded
tide-report attempts, or history only in other job classes, are labeled
"insufficient history" and are NEVER selected by B (predeclared rule).

Both selectors are pure functions of (offers, task, budget, history);
they never see evaluation outcomes.
"""
from __future__ import annotations

import math
from typing import Any

MIN_HISTORY_ATTEMPTS = 3
Z95 = 1.959963984540054


def wilson_lower(k: int, n: int, z: float = Z95) -> float:
    """Wilson score lower bound for a binomial proportion."""
    if n <= 0:
        return 0.0
    p = k / n
    denom = 1.0 + z * z / n
    center = (p + z * z / (2.0 * n)) / denom
    half = z * math.sqrt(p * (1.0 - p) / n + z * z / (4.0 * n * n)) / denom
    return max(0.0, center - half)


def expected_cost_per_accepted(price_cents: int, matching_fee_cents: int,
                               success_fee_cents: int, p_lower: float) -> float:
    """Expected buyer spend per accepted result at acceptance prob p_lower."""
    if p_lower <= 0.0:
        return float("inf")
    return (price_cents + matching_fee_cents) / p_lower + success_fee_cents


def rank_a(offers: list[dict[str, Any]], harbor: str,
           remaining_cents: int, success_fee_cents: int,
           matching_fee_cents: int,
           tried: set[str]) -> list[dict[str, Any]]:
    """Cheapest-eligible-first ranking. Pure price order."""
    ranked = []
    for o in offers:
        wid = o["worker_id"]
        excluded = None
        if harbor not in o["advertised_coverage"]:
            excluded = "no coverage claimed"
        elif wid in tried:
            excluded = "already tried"
        reserve = o["attempt_price_cents"] + success_fee_cents + matching_fee_cents
        if excluded is None and reserve > remaining_cents:
            excluded = "over budget"
        ranked.append({"worker_id": wid, "price_cents": o["attempt_price_cents"],
                       "reserve_cents": reserve, "excluded": excluded})
    eligible = [r for r in ranked if r["excluded"] is None]
    eligible.sort(key=lambda r: (r["price_cents"], r["worker_id"]))
    return eligible


def rank_b(offers: list[dict[str, Any]], harbor: str,
           remaining_cents: int, success_fee_cents: int,
           matching_fee_cents: int, tried: set[str],
           history: dict[str, dict[str, int]]) -> tuple[list[dict[str, Any]],
                                                       list[dict[str, Any]]]:
    """Evidence-informed ranking. Returns (ranked, evidence_rows).

    evidence_rows carries one row per candidate with the evidence and
    uncertainty behind the choice, or the exclusion reason.
    """
    ranked, rows = [], []
    for o in offers:
        wid = o["worker_id"]
        h = history.get(wid, {"n": 0, "k": 0, "other_class_n": 0})
        n, k = h["n"], h["k"]
        row: dict[str, Any] = {
            "worker_id": wid,
            "price_cents": o["attempt_price_cents"],
            "history_n": n,
            "history_k": k,
            "other_class_history_n": h.get("other_class_n", 0),
        }
        excluded = None
        if harbor not in o["advertised_coverage"]:
            excluded = "no coverage claimed"
        elif wid in tried:
            excluded = "already tried"
        elif n < MIN_HISTORY_ATTEMPTS:
            excluded = ("insufficient history "
                        f"({n} tide-report attempts, need {MIN_HISTORY_ATTEMPTS})")
            if h.get("other_class_n", 0):
                excluded += "; other-class history ignored"
        p = wilson_lower(k, n)
        row["wilson_lower_95"] = round(p, 4)
        exp_cost = expected_cost_per_accepted(
            o["attempt_price_cents"], matching_fee_cents, success_fee_cents, p)
        row["expected_cost_per_accepted_cents"] = (
            None if exp_cost == float("inf") else round(exp_cost, 1))
        reserve = (o["attempt_price_cents"] + success_fee_cents
                   + matching_fee_cents)
        row["reserve_cents"] = reserve
        if excluded is None and reserve > remaining_cents:
            excluded = "over budget"
        row["excluded"] = excluded
        rows.append(row)
        if excluded is None:
            ranked.append({**row, "score": exp_cost})
    ranked.sort(key=lambda r: (r["score"], r["worker_id"]))
    return ranked, rows


def choose(ranked: list[dict[str, Any]], policy: str) -> tuple[str | None, str]:
    """Pick the top-ranked worker, or decline with a reason."""
    if not ranked:
        return None, (f"{policy}: no defensible offer within budget and "
                      "constraints; declining task")
    top = ranked[0]
    if policy == "B":
        reason = (f"B: chose {top['worker_id']}: evidence {top['history_k']}/"
                  f"{top['history_n']} accepted (Wilson lower "
                  f"{top['wilson_lower_95']}), expected cost per accepted "
                  f"{top['expected_cost_per_accepted_cents']}c, reserve "
                  f"{top['reserve_cents']}c")
    else:
        reason = (f"A: chose {top['worker_id']}: cheapest eligible at "
                  f"{top['price_cents']}c/attempt, reserve {top['reserve_cents']}c")
    return top["worker_id"], reason
