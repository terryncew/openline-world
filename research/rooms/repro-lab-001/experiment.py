#!/usr/bin/env python3
"""RESEARCH-ROOM-001 experiment: hidden-parameter recovery with three
sharing conditions.

Implements research/rooms/repro-lab-001/PROTOCOL.md (frozen 2026-09-28)
exactly. Deterministic algorithmic workers, clearly labeled: this tests
the coordination mechanism (structured receipt exchange vs ordinary
result sharing vs independent search), not autonomous discovery.

Stdlib only, except PyNaCl for Ed25519 receipts in condition C.
No network, no model calls, no file writes outside the result artifact.

Usage:
  python3 experiment.py --condition {A,B,C} --replication N --seed S --budget B

Writes a JSON result artifact to stdout (caller redirects to results/).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys

# --- Frozen task definition (from PROTOCOL.md) -----------------------------
THETA_STAR = [1.5, -2.0, 0.75, 3.25]
NOISE_SD = 0.1
N_TRAIN = 40
N_VALID = 100
TRAIN_SEED = 777001
VALID_SEED = 777002
COND_CODES = {"A": 1, "B": 2, "C": 3}
EVALS_PER_WORKER = 100
N_WORKERS = 4
GENESIS_HASH = "0" * 64


def phi(x: float) -> list[float]:
    return [1.0, x, x * x, math.sin(2.0 * math.pi * x)]


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def make_dataset(n: int, seed: int) -> tuple[list[float], list[float]]:
    rng = random.Random(seed)
    xs = [i / (n - 1) for i in range(n)] if n > 1 else [0.0]
    ys = [dot(THETA_STAR, phi(x)) + rng.gauss(0.0, NOISE_SD) for x in xs]
    return xs, ys


def mse(theta: list[float], xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    return sum((dot(theta, phi(x)) - y) ** 2 for x, y in zip(xs, ys)) / n


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# --- Condition C: structured receipts --------------------------------------
class Receiver:
    """Validates structured receipts before they enter the shared log.

    Validation: (1) schema, (2) Ed25519 signature, (3) score
    recomputation against the frozen validation set, (4) hash chain.
    Recomputations are overhead, counted separately from the search budget.
    """

    def __init__(self, vxs, vys, worker_pubkeys: dict[int, bytes]):
        self.vxs = vxs
        self.vys = vys
        self.worker_pubkeys = worker_pubkeys
        self.log: list[dict] = []
        self.head_hash = GENESIS_HASH
        self.best_mse = math.inf
        self.best_theta: list[float] | None = None
        self.submitted = 0
        self.rejected = 0
        self.overhead_evals = 0
        self.rejections: list[dict] = []

    def validation_input_hash(self) -> str:
        return sha256_hex(canonical([self.vxs, self.vys]))

    def submit(self, receipt: dict) -> tuple[bool, str]:
        from nacl.signing import VerifyKey
        from nacl.exceptions import BadSignatureError
        self.submitted += 1
        body = receipt.get("body")
        # (1) schema
        if not isinstance(body, dict):
            return self._reject(receipt, "SCHEMA_BODY_NOT_OBJECT")
        for field in ("worker_id", "iteration", "theta", "mse",
                      "validation_input_hash", "prev_receipt_hash"):
            if field not in body:
                return self._reject(receipt, f"SCHEMA_MISSING_{field}")
        if (not isinstance(body["theta"], list) or len(body["theta"]) != 4
                or not all(isinstance(v, (int, float)) for v in body["theta"])):
            return self._reject(receipt, "SCHEMA_BAD_THETA")
        if body["validation_input_hash"] != self.validation_input_hash():
            return self._reject(receipt, "VALIDATION_INPUT_HASH_MISMATCH")
        if body["prev_receipt_hash"] != self.head_hash:
            return self._reject(receipt, "HASH_CHAIN_BREAK")
        # (2) signature
        wid = body["worker_id"]
        sig_hex = receipt.get("signature")
        try:
            sig = bytes.fromhex(sig_hex)
            VerifyKey(self.worker_pubkeys[wid]).verify(
                canonical(body).encode("utf-8"), sig)
        except (BadSignatureError, Exception):
            return self._reject(receipt, "BAD_SIGNATURE")
        # (3) score recomputation (overhead: 1 evaluation, not from budget)
        self.overhead_evals += 1
        recomputed = mse(body["theta"], self.vxs, self.vys)
        if abs(recomputed - body["mse"]) > 1e-9:
            return self._reject(receipt, "SCORE_RECOMPUTATION_MISMATCH")
        # accepted
        receipt_hash = sha256_hex(canonical(body) + sig_hex)
        self.log.append({"body": body, "signature": sig_hex,
                         "receipt_hash": receipt_hash})
        self.head_hash = receipt_hash
        if body["mse"] < self.best_mse:
            self.best_mse = body["mse"]
            self.best_theta = list(body["theta"])
        return True, "ACCEPTED"

    def _reject(self, receipt: dict, reason: str) -> tuple[bool, str]:
        self.rejected += 1
        self.rejections.append({"reason": reason,
                                "worker_id": (receipt.get("body") or {}).get("worker_id")})
        return False, reason

    def read_best(self) -> tuple[list[float] | None, float]:
        return self.best_theta, self.best_mse


def run_condition(condition: str, master_seed: int, budget: int,
                  vxs, vys) -> dict:
    """Run one replication of one condition. Returns the run record."""
    from nacl.signing import SigningKey

    n_workers = N_WORKERS
    per_worker = budget // n_workers
    assert budget % n_workers == 0, "budget must split evenly"

    # Worker keys for condition C (deterministic from master seed).
    worker_keys = {}
    for w in range(n_workers):
        sk_seed = hashlib.sha256(
            f"room001-workerkey-{master_seed}-{w}".encode()).digest()
        worker_keys[w] = SigningKey(sk_seed)
    pubkeys = {w: bytes(worker_keys[w].verify_key) for w in range(n_workers)}

    receiver = Receiver(vxs, vys, pubkeys) if condition == "C" else None
    shared_best_mse = math.inf
    shared_best_theta: list[float] | None = None  # condition B

    # Condition C genesis: receiver log starts empty; head = GENESIS_HASH.
    total_evals = 0
    first_reach_eval: int | None = None  # evals to first reach MSE < 0.05
    worker_minima: list[float] = []  # condition A: per-worker best

    def note_eval(m: float):
        nonlocal first_reach_eval, total_evals
        total_evals += 1
        if first_reach_eval is None and m < 0.05:
            first_reach_eval = total_evals

    for w in range(n_workers):
        rng = random.Random(1_000_000 * master_seed
                            + 10_000 * COND_CODES[condition]
                            + 100 * w + 7)
        best = [0.0, 0.0, 0.0, 0.0]
        best_mse = mse(best, vxs, vys)
        note_eval(best_mse)
        step = 0.5
        for i in range(1, per_worker):
            # Read shared state (B and C).
            if condition == "B" and shared_best_theta is not None \
                    and shared_best_mse < best_mse:
                best = list(shared_best_theta)
                best_mse = shared_best_mse
            elif condition == "C":
                r_theta, r_mse = receiver.read_best()
                if r_theta is not None and r_mse < best_mse:
                    best = list(r_theta)
                    best_mse = r_mse
            proposal = [b + rng.gauss(0.0, step) for b in best]
            m = mse(proposal, vxs, vys)
            note_eval(m)
            if m < best_mse:
                best = proposal
                best_mse = m
                if condition == "B":
                    if m < shared_best_mse:
                        shared_best_mse = m
                        shared_best_theta = list(proposal)
                elif condition == "C":
                    body = {
                        "worker_id": w,
                        "iteration": i,
                        "theta": list(proposal),
                        "mse": m,
                        "validation_input_hash": receiver.validation_input_hash(),
                        "prev_receipt_hash": receiver.head_hash,
                    }
                    sig = worker_keys[w].sign(
                        canonical(body).encode("utf-8")).signature.hex()
                    ok, _ = receiver.submit({"body": body, "signature": sig})
                    # Per protocol failure criterion (b): >20% rejections
                    # invalidates the replication; honest workers should
                    # see ~0 rejections.
            step *= 0.98
        worker_minima.append(best_mse)

    if condition == "A":
        # Independent: result is min over workers' individual best.
        result_mse = min(worker_minima)
    elif condition == "B":
        result_mse = shared_best_mse
    else:
        result_mse = receiver.best_mse

    record = {
        "condition": condition,
        "master_seed": master_seed,
        "budget": budget,
        "evaluations_used": total_evals,
        "best_mse": result_mse,
        "evals_to_reach_0_05": first_reach_eval,
        "worker_algorithm": ("deterministic seeded random search with local "
                             "refinement (algorithmic workers, not AI "
                             "scientists); see PROTOCOL.md"),
        "theta_star": THETA_STAR,
        "validation": {"n": N_VALID, "seed": VALID_SEED,
                       "input_hash": sha256_hex(canonical([vxs, vys]))},
    }
    if condition == "C":
        record["receipts_submitted"] = receiver.submitted
        record["receipts_rejected"] = receiver.rejected
        record["rejections"] = receiver.rejections
        record["overhead_evals"] = receiver.overhead_evals
        record["log_head_hash"] = receiver.head_hash
        record["log_length"] = len(receiver.log)
        # Failure criterion (b): >20% rejected -> invalid.
        if receiver.submitted and receiver.rejected / receiver.submitted > 0.20:
            record["invalid_reason"] = "RECEIPT_REJECTION_RATE_EXCEEDED"
    else:
        record["overhead_evals"] = 0
    if total_evals > budget:
        record["invalid_reason"] = "BUDGET_EXCEEDED"
    return record


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--condition", choices=["A", "B", "C"], required=True)
    ap.add_argument("--replication", type=int, required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--budget", type=int, required=True)
    args = ap.parse_args()

    vxs, vys = make_dataset(N_VALID, VALID_SEED)
    # (The workers score only against the frozen validation set.)
    record = run_condition(args.condition, args.seed, args.budget, vxs, vys)
    record["replication"] = args.replication
    record["code_hash"] = sha256_hex(open(__file__, encoding="utf-8").read())
    record["protocol_frozen_hash"] = (
        "2ba607e0eb6166b28fa4d83130448e0632b1bd0e1cced752380e5c20e2fbffe3")
    print(json.dumps(record, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
