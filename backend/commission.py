"""Unattended commission: one bounded service job, receiver-side accounting.

Two owners authorize frozen terms once. Their workers complete the job
without further owner input; the receiver records cost events, evaluates
the deliverable against the frozen acceptance criteria, and settles from
the frozen contract plus recorded events. Correct accounting on rejection.

Inherited from the 2026-09-27 isolation verdict: submitted code never
executes. Every amount is deterministic receiver arithmetic over
(contract rates x worker-reported units). A worker-reported cost total is
audit data only — settlement recomputes it. The payee is always the
frozen contract's seller_id; altered payees in messages are ignored.

All money is simulated. Cost events are never provider invoices.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

CONTRACT_SCHEMA = "openline.commission.contract.v1"
CONTRACT_VERSION = 1

# Contract rule defaults (frozen into each contract at proposal time).
_RULES = {
    "on_reject": "pay recorded authorized costs only; no success fee",
    "on_revoke": "stop new gated work; account already-incurred authorized costs",
    "on_unknown_outcome": "unresolved until reconciled; never repeat an effect or charge",
}


class CommissionError(Exception):
    """A commission operation was refused. `code` is the verdict code."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def _canonical(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def contract_sha256(contract: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical(contract)).hexdigest()


def _require_int(value: Any, name: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise CommissionError("COMMISSION_CONTRACT_INVALID",
                              f"{name} must be an integer >= {minimum}")
    return value


def validate_contract(raw: Any) -> dict[str, Any]:
    """Validate and normalize a proposed commission contract.

    Money is integer cents. Rates are per unit of a permitted operation.
    The acceptance criteria are a deterministic, receiver-evaluated
    predicate over the deliverable text: required substrings present,
    forbidden substrings absent, max bytes.
    """
    if not isinstance(raw, dict):
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "contract")
    if raw.get("schema") != CONTRACT_SCHEMA:
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "schema")
    if raw.get("version") != CONTRACT_VERSION:
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "version")

    job = raw.get("job")
    if not isinstance(job, dict):
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "job")
    task = job.get("task")
    deliverable = job.get("deliverable")
    if not isinstance(task, str) or not task.strip():
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "job.task")
    if not isinstance(deliverable, str) or not deliverable.strip():
        raise CommissionError("COMMISSION_CONTRACT_INVALID",
                              "job.deliverable")

    acceptance = raw.get("acceptance")
    if not isinstance(acceptance, dict):
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "acceptance")
    required = acceptance.get("required_substrings")
    if (not isinstance(required, list) or not required
            or any(not isinstance(s, str) or not s for s in required)):
        raise CommissionError("COMMISSION_CONTRACT_INVALID",
                              "acceptance.required_substrings")
    forbidden = acceptance.get("forbidden_substrings") or []
    if not isinstance(forbidden, list) or any(
            not isinstance(s, str) for s in forbidden):
        raise CommissionError("COMMISSION_CONTRACT_INVALID",
                              "acceptance.forbidden_substrings")
    max_bytes = _require_int(acceptance.get("max_bytes"), "max_bytes", 1)

    buyer_id = raw.get("buyer_id")
    seller_id = raw.get("seller_id")
    if not isinstance(buyer_id, str) or not buyer_id:
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "buyer_id")
    if not isinstance(seller_id, str) or not seller_id:
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "seller_id")
    if buyer_id == seller_id:
        raise CommissionError("COMMISSION_CONTRACT_INVALID",
                              "buyer and seller must differ")

    ops = raw.get("permitted_operations")
    if not isinstance(ops, list) or not ops:
        raise CommissionError("COMMISSION_CONTRACT_INVALID",
                              "permitted_operations")
    seen: set[str] = set()
    norm_ops = []
    for entry in ops:
        if not isinstance(entry, dict):
            raise CommissionError("COMMISSION_CONTRACT_INVALID",
                                  "permitted_operations entry")
        op = entry.get("op")
        rate = entry.get("rate_cents")
        if not isinstance(op, str) or not op or op in seen:
            raise CommissionError("COMMISSION_CONTRACT_INVALID",
                                  "permitted_operations op")
        _require_int(rate, f"rate for {op}", 0)
        seen.add(op)
        norm_ops.append({"op": op, "rate_cents": rate})

    contract = {
        "schema": CONTRACT_SCHEMA,
        "version": CONTRACT_VERSION,
        "job": {"task": task.strip(), "deliverable": deliverable.strip()},
        "acceptance": {
            "required_substrings": list(required),
            "forbidden_substrings": list(forbidden),
            "max_bytes": max_bytes,
        },
        "buyer_id": buyer_id,
        "seller_id": seller_id,
        "permitted_operations": norm_ops,
        "max_cost_cents": _require_int(raw.get("max_cost_cents"),
                                       "max_cost_cents", 1),
        "success_fee_cents": _require_int(raw.get("success_fee_cents"),
                                          "success_fee_cents", 0),
        "deadline_ts": raw.get("deadline_ts"),
        "rules": dict(_RULES),
    }
    deadline = contract["deadline_ts"]
    if not isinstance(deadline, (int, float)) or deadline <= 0:
        raise CommissionError("COMMISSION_CONTRACT_INVALID", "deadline_ts")
    return contract


def contract_id_for(contract: dict[str, Any]) -> str:
    return "ctr-" + contract_sha256(contract)[:16]


def verify_owner_authorization(root_public_key_hex: str, contract_sha: str,
                               signature_hex: str) -> None:
    """Verify an owner's root-key signature over the contract sha256.

    Raises CommissionError(COMMISSION_AUTHORIZATION_INVALID) on failure.
    """
    try:
        pub = Ed25519PublicKey.from_public_bytes(
            bytes.fromhex(root_public_key_hex))
        sig = bytes.fromhex(signature_hex)
        pub.verify(sig, contract_sha.encode("utf-8"))
    except Exception:
        raise CommissionError("COMMISSION_AUTHORIZATION_INVALID",
                              "owner signature over contract sha256")


def sign_contract_sha(root_private_key: Ed25519PrivateKey,
                      contract_sha: str) -> str:
    """Owner-side helper: sign the contract sha256 with the owner root key."""
    return root_private_key.sign(contract_sha.encode("utf-8")).hex()


def compute_cost_cents(contract: dict[str, Any], op: str, units: int) -> int:
    """Receiver-computed cost for (op, units) from the frozen contract rates.

    The worker's claimed amount is never an input here.
    """
    if isinstance(units, bool) or not isinstance(units, int) or units <= 0:
        raise CommissionError("COMMISSION_COST_UNITS_INVALID", "units")
    for entry in contract["permitted_operations"]:
        if entry["op"] == op:
            return entry["rate_cents"] * units
    raise CommissionError("COMMISSION_COST_OP_UNKNOWN", op)


def evaluate_deliverable(contract: dict[str, Any],
                         deliverable_text: Any) -> tuple[bool, list[str]]:
    """Deterministic receiver-side acceptance check. No code executes."""
    reasons: list[str] = []
    if not isinstance(deliverable_text, str):
        return False, ["deliverable is not text"]
    text = deliverable_text
    if len(text.encode("utf-8")) > contract["acceptance"]["max_bytes"]:
        reasons.append("deliverable exceeds max_bytes")
    for required in contract["acceptance"]["required_substrings"]:
        if required not in text:
            reasons.append(f"missing required text: {required!r}")
    for forbidden in contract["acceptance"]["forbidden_substrings"]:
        if forbidden in text:
            reasons.append(f"forbidden text present: {forbidden!r}")
    return (len(reasons) == 0), reasons


def settle_amounts(contract: dict[str, Any], recorded_cost_cents: int,
                   accepted: bool) -> dict[str, int]:
    """Settlement arithmetic from the frozen contract + recorded costs.

    The payee is always the contract's seller_id. Altered payees or
    worker-reported totals in messages cannot change this: they are not
    inputs.
    """
    fee = contract["success_fee_cents"] if accepted else 0
    seller_payout = recorded_cost_cents + fee
    reserved = contract["max_cost_cents"] + contract["success_fee_cents"]
    buyer_release = reserved - seller_payout
    return {
        "recorded_cost_cents": recorded_cost_cents,
        "success_fee_cents": fee,
        "seller_payout_cents": seller_payout,
        "buyer_release_cents": buyer_release,
        "payee": contract["seller_id"],
    }


def new_settlement_id() -> str:
    return "stl-" + secrets.token_hex(8)
