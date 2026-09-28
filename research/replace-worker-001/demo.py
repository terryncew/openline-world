"""REPLACE-WORKER-001 demo driver: "Replace the worker. Keep the job."

Drives the real World machinery exactly as the backend unit tests do
(in-process World, real EffectGate presentation evaluation, real
backend/commission.py accounting). No mechanism changes, no private APIs,
no session surgery. Simulated funds only.

Protocol: ~/workspace/replace-worker-keep-job/PROTOCOL.md (frozen
8565fe14d73c6af9aa15116434db7a9aa8590c0e9b439109c931285abe176164).

Run: ~/workspace/.venvs/workshop/bin/python demo.py
"""
from __future__ import annotations

import copy
import json
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path("/home/hatch/workspace/openline-world/backend")
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

from world import World  # noqa: E402
from custody_client import _Client  # noqa: E402
from commission import sign_contract_sha  # noqa: E402
from openline_wallet.crypto import public_key_hex  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402
from openline_wallet.receiver import create_presentation  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: E402
    Ed25519PrivateKey,
)

_SCOPES = ("commission.report-cost", "commission.submit-deliverable")
_GOOD_REPORT = ("Harbor tide report: mean tide height 2.43 m at the "
                "harbor in Q3 2026, computed from the harbor log.")

EVIDENCE: dict = {"protocol": "REPLACE-WORKER-001", "steps": [],
                  "assertions": {}}


def record(step: str, **fields) -> None:
    EVIDENCE["steps"].append({"step": step, **fields})


def _contract() -> dict:
    return {
        "schema": "openline.commission.contract.v1",
        "version": 1,
        "job": {
            "task": "Summarize the harbor log into a tide report.",
            "deliverable": "A text tide report naming the mean tide height.",
        },
        "acceptance": {
            "required_substrings": ["2.43 m", "harbor"],
            "forbidden_substrings": [],
            "max_bytes": 4096,
        },
        "buyer_id": "buyer",
        "seller_id": "seller",
        "permitted_operations": [
            {"op": "readings.scan", "rate_cents": 5},
            {"op": "summary.write", "rate_cents": 20},
        ],
        "max_cost_cents": 1000,
        "success_fee_cents": 500,
        "deadline_ts": time.time() + 3600,
    }


def main() -> int:
    tmp = tempfile.TemporaryDirectory()
    world = World(data_root=Path(tmp.name))

    # -- S1: join ---------------------------------------------------------
    buyer = _Client("buyer", scopes=_SCOPES)
    seller = _Client("seller", scopes=_SCOPES, agent_id="seller-worker-a")
    buyer.join(world)
    out_a = seller.join(world)  # Worker A joins as the seller participant
    record("S1-join", buyer_standing="current",
           seller_agent=out_a["agent_id"], seller_mandate=out_a["mandate_id"])

    # -- S2: freeze the contract ------------------------------------------
    contract = _contract()
    prop = world.commission_propose_contract(
        "buyer", buyer.token, contract)
    cid, digest0 = prop["contract_id"], prop["contract_sha256"]
    for client, pid in ((buyer, "buyer"), (seller, "seller")):
        sig = sign_contract_sha(client.root_key, digest0)
        res = world.commission_authorize_contract(pid, client.token, cid, sig)
    assert res["status"] == "frozen", res
    # P2 probe: a duplicate buyer authorization is a no-op.
    dup = world.commission_authorize_contract(
        "buyer", buyer.token, cid, sign_contract_sha(buyer.root_key, digest0))
    record("S2-frozen", contract_id=cid, contract_sha256=digest0,
           authorizations=res["authorizations"],
           duplicate_authorize_status=dup["status"],
           duplicate_authorize_noop=(
               dup["status"] == "frozen"
               and dup["authorizations"] == res["authorizations"]))

    # -- S3: fund + start ---------------------------------------------------
    world.fund_simulated("buyer", buyer.token, 2000,
                         idempotency_key="fund-1")
    started = world.commission_start(
        "buyer", buyer.token, cid, idempotency_key="start-1")
    com_id = started["commission_id"]
    record("S3-started", commission_id=com_id,
           reserved_cents=started["reserved_cents"],
           buyer_balance_cents=started["buyer_balance_cents"])

    # -- S4: Worker A does partial work (the checkpoint) --------------------
    def cost(client, op, units, claimed, key):
        return world.commission_report_cost(
            client.pid, client.token, com_id, op, units, claimed,
            client.presentation(world, "commission.report-cost"),
            idempotency_key=key)

    cost(seller, "readings.scan", 3, 99999, "cost-a1")
    cost(seller, "summary.write", 1, 424242, "cost-a2")
    desc_a = world.commission_describe(com_id)
    checkpoint = {"recorded_cost_cents": desc_a["recorded_cost_cents"],
                  "cost_events": copy.deepcopy(desc_a["cost_events"]),
                  "contract_sha256": desc_a["contract_sha256"]}
    record("S4-checkpoint", recorded_cost_cents=checkpoint["recorded_cost_cents"],
           n_cost_events=len(checkpoint["cost_events"]),
           contract_sha256=checkpoint["contract_sha256"],
           digest_unchanged=(checkpoint["contract_sha256"] == digest0))

    # -- S5: revoke Worker A -------------------------------------------------
    seller.wallet.revoke(seller.mandate_id)
    refresh = world.authority_refresh(
        "seller", seller.token, seller.wallet.export_bundle())
    record("S5-revoke", refresh_revoked=refresh["revoked"],
           mandate_id=refresh["mandate_id"])

    # -- S6: Worker A's next action is refused --------------------------------
    refusal = None
    try:
        cost(seller, "readings.scan", 1, 5, "cost-a3")
    except WalletError as exc:
        refusal = f"{type(exc).__name__}: {exc}"
    desc_after_refusal = world.commission_describe(com_id)
    record("S6-refused", refusal=refusal,
           recorded_cost_cents_still=desc_after_refusal["recorded_cost_cents"],
           a_post_revocation_spend_cents=(
               desc_after_refusal["recorded_cost_cents"]
               - checkpoint["recorded_cost_cents"]))

    # -- S7: owner grants Worker B (disjoint identity, same owner) ------------
    worker_b_key = Ed25519PrivateKey.generate()
    grant = seller.wallet.grant(
        subject_id="seller-worker-b",
        subject_public_key=public_key_hex(worker_b_key),
        scopes=list(_SCOPES),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    mandate_b_id = grant["data"]["mandate_id"]
    record("S7-grant-b", agent_id="seller-worker-b",
           mandate_id=mandate_b_id,
           same_owner_root=(public_key_hex(seller.root_key)
                            == public_key_hex(seller.root_key)))

    # -- S8: Worker B joins as the seller through the PUBLIC path ------------
    nonce = world.challenge()["nonce"]
    profile_b = {
        "version": "openline-join-profile/v1",
        "participant": {"id": "seller", "display_name": "Seller"},
        "agent": {"id": "seller-worker-b", "display_name": "seller agent",
                  "public_key": public_key_hex(worker_b_key)},
        "proof": {"nonce": nonce,
                  "signature": worker_b_key.sign(
                      nonce.encode("utf-8")).hex()},
        "owner": {"principal_id": seller.wallet.principal_id,
                  "root_public_key": public_key_hex(seller.root_key)},
        "mandate_bundle": seller.wallet.export_bundle(),
        "mandate": {"scopes": list(_SCOPES)},
        "capabilities": ["mandate.v1", "receipt.v1", "revocation.v1"],
    }
    joined_b = False
    join_error = None
    token_b = None
    try:
        out_b = world.join(profile_b)
        joined_b = True
        token_b = out_b["token"]
    except WalletError as exc:
        join_error = f"{type(exc).__name__}: {exc}"
    record("S8-join-b", joined=joined_b, join_error=join_error)

    # -- S9: Worker B resumes (only if the public path admitted B) ------------
    settlement = None
    if joined_b:
        def presentation_b(action):
            challenge = world.gate_challenge(
                "seller", token_b, action)["challenge"]
            return create_presentation(
                bundle=seller.wallet.export_bundle(),
                mandate_id=mandate_b_id, subject_id="seller-worker-b",
                subject_key=worker_b_key, action=action,
                receiver_challenge=challenge)

        desc_b = world.commission_describe(com_id)
        remaining = (desc_b["contract"]["max_cost_cents"]
                     - desc_b["recorded_cost_cents"])
        world.commission_report_cost(
            "seller", token_b, com_id, "readings.scan", 10, 50,
            presentation_b("commission.report-cost"),
            idempotency_key="cost-b1")
        world.commission_report_cost(
            "seller", token_b, com_id, "summary.write", 2, 40,
            presentation_b("commission.report-cost"),
            idempotency_key="cost-b2")
        submitted = world.commission_submit_deliverable(
            "seller", token_b, com_id, _GOOD_REPORT,
            presentation_b("commission.submit-deliverable"),
            idempotency_key="submit-b1")
        settlement = submitted["settlement"]
        record("S9-resumed",
               digest_at_resume=desc_b["contract_sha256"],
               digest_unchanged=(desc_b["contract_sha256"] == digest0),
               checkpoint_events_equal=(
                   desc_b["cost_events"] == checkpoint["cost_events"]),
               remaining_budget_cents=remaining,
               outcome=submitted["outcome"],
               settlement_id=settlement["settlement_id"])

    # -- S10: final state ------------------------------------------------------
    desc_final = world.commission_describe(com_id)
    settlements = ([desc_final["settlement"]] if desc_final["settlement"]
                   else [])
    record("S10-final", status=desc_final["status"],
           n_settlements=len(settlements),
           settlement_ids=[s["settlement_id"] for s in settlements],
           recorded_cost_cents=desc_final["recorded_cost_cents"],
           contract_sha256=desc_final["contract_sha256"])

    # -- assertions ------------------------------------------------------------
    a = EVIDENCE["assertions"]
    steps = {s["step"]: s for s in EVIDENCE["steps"]}
    a["P1_digest_stable"] = all(
        steps[k].get("contract_sha256", digest0) == digest0
        for k in ("S4-checkpoint", "S10-final"))
    a["P2_buyer_authorized_once"] = steps["S2-frozen"][
        "duplicate_authorize_noop"] is True
    a["P3_checkpoint_preserved"] = (
        steps["S9-resumed"]["checkpoint_events_equal"]
        if joined_b else None)  # None = not reached; reported, not asserted
    a["P4_budget_bounded"] = (
        desc_final["recorded_cost_cents"] <= 1000)
    a["P5_a_refused"] = (
        steps["S6-refused"]["refusal"] is not None
        and steps["S6-refused"]["a_post_revocation_spend_cents"] == 0)
    a["P6_b_joined_public_path"] = joined_b
    a["P7_single_settlement"] = (
        len(settlements) == 1
        and settlements[0]["payee"] == "seller"
        and settlements[0]["seller_payout_cents"]
        == settlements[0]["recorded_cost_cents"]
        + settlements[0]["success_fee_cents"]) if joined_b else None
    a["P8_a_post_revocation_spend_zero"] = (
        steps["S6-refused"]["a_post_revocation_spend_cents"] == 0)

    decided = [v for v in a.values() if v is not None]
    if not joined_b:
        verdict = ("FAIL (mechanism gap): P6 — the public join path refused "
                   "Worker B while Worker A's revoked session exists; "
                   f"refusal was {join_error!r}. The commission layer kept "
                   "the frozen contract and the recorded checkpoint; the "
                   "session layer has no rejoin path.")
    elif all(decided):
        verdict = ("PASS: P1-P8 hold. The worker changed mid-commission; the "
                   "frozen contract, the recorded checkpoint, and the single "
                   "settlement survived; the buyer authorized once.")
    else:
        failed = [k for k, v in a.items() if v is False]
        verdict = f"FAIL (other): assertions failed: {failed}"
    EVIDENCE["verdict"] = verdict
    EVIDENCE["digest0"] = digest0
    EVIDENCE["commission_id"] = com_id

    out_path = Path(__file__).resolve().parent / "evidence" / (
        f"run-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json")
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(EVIDENCE, indent=2, sort_keys=True) + "\n")
    print(verdict)
    print(f"evidence: {out_path}")
    tmp.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
