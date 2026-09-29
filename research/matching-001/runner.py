"""MATCHING-001 runner (frozen after freeze commit).

Phase 1: record worker histories through the real World commission
machinery (separate history-building jobs, buyer mw-buyer-hist).
Phase 2: matched evaluation of policy A vs policy B on held-out tasks.

All money simulated. Workers deterministic-simulated. No new
marketplace or payment system: this reuses backend/commission.py and
the World commission track (propose/authorize/start/report/submit/
settle) plus a runner-level session ledger for the spending ceiling
and the explicitly simulated matching fee.
"""
from __future__ import annotations

import copy
import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / ".." / ".." / "backend"))
sys.path.insert(0, str(HERE / ".." / ".." / "backend" / "tests"))

from world import World  # noqa: E402
from custody_client import _Client  # noqa: E402
from commission import sign_contract_sha, contract_id_for  # noqa: E402
import m1_selectors as selectors  # noqa: E402

DATA_ROOT = HERE / "data"
SCOPES = ("commission.report-cost", "commission.submit-deliverable")
SESSION_CEILING_CENTS = 40000
RETRY_ATTEMPTS = 2  # contract attempts per task
HISTORY_SEED = 20260928


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Session:
    """Runner-level buyer session ledger: ceiling, matching fees, exposure."""

    def __init__(self, ceiling_cents: int):
        self.ceiling = ceiling_cents
        self.matching_fees_cents = 0
        self.declined_tasks: list[dict] = []

    def exposure(self, world: World, buyer_pid: str) -> int:
        """Outstanding reservations + settled spend + matching fees."""
        bal = world.simulated_balances.get(buyer_pid, 0)
        return (self.ceiling - bal) + self.matching_fees_cents

    def check_reserve(self, world: World, buyer_pid: str,
                      reserve_cents: int) -> bool:
        return self.exposure(world, buyer_pid) + reserve_cents <= self.ceiling

    def charge_matching_fee(self, world: World, buyer_pid: str,
                            fee_cents: int, task_id: str, worker_id: str | None,
                            policy: str) -> None:
        self.matching_fees_cents += fee_cents
        assert self.exposure(world, buyer_pid) <= self.ceiling, \
            "C5 BUDGET BREACH after matching fee"


_CLIENTS: dict[str, _Client] = {}


def get_client(world: World, pid: str) -> _Client:
    """One client object per pid per process: keys must stay pinned to the
    session's owner root key, so a fresh _Client per call would break
    authorization signatures."""
    if pid in _CLIENTS:
        return _CLIENTS[pid]
    client = _Client(pid, scopes=SCOPES)
    for sess in world.sessions.values():
        if sess.participant_id == pid:
            client.token = sess.token
            _CLIENTS[pid] = client
            return client
    client.join(world)
    _CLIENTS[pid] = client
    return client


def build_contract(buyer_pid: str, seller_pid: str, job_class: str,
                   task_text: str, required: list[str],
                   rate_cents: int, units: int) -> dict:
    return {
        "schema": "openline.commission.contract.v1",
        "version": 1,
        "job": {"task": task_text, "deliverable": "A text report."},
        "acceptance": {
            "required_substrings": required,
            "forbidden_substrings": [],
            "max_bytes": 4096,
        },
        "buyer_id": buyer_pid,
        "seller_id": seller_pid,
        "permitted_operations": [{"op": "report.write",
                                  "rate_cents": rate_cents}],
        "max_cost_cents": rate_cents * units,
        "success_fee_cents": 300,
        "deadline_ts": time.time() + 3600,
    }


def tide_contract(buyer_pid: str, seller_pid: str, harbor: str,
                  true_height: str, rate_cents: int, units: int) -> dict:
    return build_contract(
        buyer_pid, seller_pid, "tide-report",
        f"[tide-report] Summarize the {harbor} harbor log into a tide report.",
        [harbor, f"{true_height} m"], rate_cents, units)


def authorize_both(world: World, buyer: _Client, seller: _Client,
                   contract_id: str, contract_sha: str) -> None:
    for client in (buyer, seller):
        sig = sign_contract_sha(client.root_key, contract_sha)
        world.commission_authorize_contract(
            client.pid, client.token, contract_id, sig)


def run_attempt(world: World, buyer: _Client, seller: _Client,
                worker: dict, harbor: str, true_height: str,
                tag: str) -> dict:
    """One full commission attempt. Returns the outcome record.

    Raises WorkerDeclined if the worker refuses authorization.
    Unexpected exceptions propagate to be recorded as unresolved.
    """
    contract = tide_contract(buyer.pid, seller.pid, harbor, true_height,
                             worker["posted_rate_cents_per_unit"],
                             worker["units_per_attempt"])
    out = world.commission_propose_contract(buyer.pid, buyer.token, contract)
    cid, sha = out["contract_id"], out["contract_sha256"]

    # Seller decides: decline if the harbor is not in its fact table.
    # (mw-s6 declines everything in tide-report by design.)
    if harbor not in worker["facts"]:
        raise WorkerDeclined(
            f"{seller.pid}: no log entry for {harbor}; declining contract")

    buyer_sig = sign_contract_sha(buyer.root_key, sha)
    world.commission_authorize_contract(buyer.pid, buyer.token, cid, buyer_sig)
    seller_sig = sign_contract_sha(seller.root_key, sha)
    world.commission_authorize_contract(seller.pid, seller.token, cid,
                                        seller_sig)

    start = world.commission_start(buyer.pid, buyer.token, cid,
                                   idempotency_key=f"start-{tag}")
    com_id = start["commission_id"]
    world.commission_report_cost(
        seller.pid, seller.token, com_id, "report.write",
        worker["units_per_attempt"],
        worker["posted_rate_cents_per_unit"] * worker["units_per_attempt"],
        seller.presentation(world, "commission.report-cost"),
        idempotency_key=f"cost-{tag}")
    entry = worker["facts"][harbor]
    text = (f"Tide report for {harbor}: mean tide height {entry} m "
            f"in Q3 2026.")
    result = world.commission_submit_deliverable(
        seller.pid, seller.token, com_id, text,
        seller.presentation(world, "commission.submit-deliverable"),
        idempotency_key=f"submit-{tag}")
    return {"commission_id": com_id, "contract_id": cid,
            "outcome": result["outcome"], "reasons": result["reasons"],
            "settlement": result["settlement"]}


class WorkerDeclined(Exception):
    pass
