"""REPLACE-WORKER-002: replace the worker through the explicit owner-authorized
path. Keep the job.

One job, two workers from two different providers (openai/gpt-4o-mini and
meta/llama-4-scout via the stored Vercel AI Gateway credential). The owner
revokes Worker A, then replaces A with Worker B through the public
World.replace_worker path: owner root-key signature over the replacement
intent (binding participant, old worker, old mandate, new worker key, the
authority head sequence, and the delegated scopes) plus the new worker's
proof of key control. No mechanism changes during the run; scripted
harness; simulated funds; the providers generate only the work-product
text.

Protocol: PROTOCOL-002.md (frozen before the run).
"""
import copy
import hashlib
import json
import sys
import tempfile
import time
import traceback
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "openline-world" / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))  # custody_client test helper
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import (  # noqa: E402
    add_surrogate_to_request, read_json_response)

from world import World, REPLACE_WORKER_VERSION, WorldAuthError  # noqa: E402
from custody_client import _Client  # noqa: E402
from commission import sign_contract_sha  # noqa: E402
from openline_wallet.canonical import canonical_json  # noqa: E402
from openline_wallet.crypto import public_key_hex  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402
from openline_wallet.receiver import create_presentation  # noqa: E402
from openline_wallet.wallet import verify_bundle  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: E402
    Ed25519PrivateKey,)

_SCOPES = ("commission.report-cost", "commission.submit-deliverable")
_GW = "https://ai-gateway.vercel.sh/v1/chat/completions"

EVIDENCE: dict = {"protocol": "REPLACE-WORKER-002",
                  "protocol_file": "PROTOCOL-002.md",
                  "providers": {"worker_a": "openai/gpt-4o-mini",
                                "worker_b": "meta/llama-4-scout",
                                "via": "vercel-ai-gateway (stored credential)"},
                  "steps": [], "assertions": {}}


def record(step: str, **fields) -> None:
    EVIDENCE["steps"].append({"step": step, **fields})


def expect_refusal(label, fn, codes):
    """Run fn; return the error code string. Assert it is one of codes."""
    try:
        fn()
    except (WalletError, WorldAuthError) as exc:
        code = f"{type(exc).__name__}: {exc}"
        assert any(c in code for c in codes), (label, code)
        return code
    raise AssertionError(f"{label}: expected refusal, got success")


def call_provider(model: str, system: str, user: str) -> dict:
    """One provider-backed generation. Returns {ok, text, usage, error}."""
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "max_tokens": 400, "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(
        _GW, data=body, headers={"Content-Type": "application/json"},
        method="POST")
    try:
        add_surrogate_to_request(req, "custom.vercel-ai-gateway",
                                 allowed_hosts=["ai-gateway.vercel.sh"])
    except Exception as exc:
        return {"ok": False, "error": f"credential: {exc}"}
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = read_json_response(resp)
        text = data["choices"][0]["message"]["content"] or ""
        return {"ok": True, "text": text.strip(),
                "usage": data.get("usage")}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def worker_text(model: str, system: str, user: str, label: str) -> str:
    """Generate work-product text with one retry; raise on persistent failure."""
    last = None
    for attempt in (1, 2):
        res = call_provider(model, system, user)
        last = res
        if res["ok"] and res["text"]:
            record(f"{label}-provider", model=model, attempt=attempt,
                   chars=len(res["text"]),
                   usage={k: v for k, v in (res.get("usage") or {}).items()
                          if k in ("prompt_tokens", "completion_tokens")})
            return res["text"]
        time.sleep(2)
    raise RuntimeError(f"provider access blocker for {label} ({model}): "
                       f"{(last or {}).get('error')}")


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


def meets_criteria(text: str) -> bool:
    return ("2.43 m" in text and "harbor" in text.lower()
            and len(text.encode("utf-8")) <= 4096)


def _main() -> int:
    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name)
    world = World(data_root=root)

    # -- S1: join ---------------------------------------------------------
    buyer = _Client("buyer", scopes=_SCOPES)
    seller = _Client("seller", scopes=_SCOPES, agent_id="seller-worker-a")
    buyer.join(world)
    out_a = seller.join(world)
    token_a = out_a["token"]
    record("S1-join", seller_agent=out_a["agent_id"],
           seller_mandate=out_a["mandate_id"], buyer_standing="current")

    # -- S2: freeze the contract; Q0: does it bind the worker key? --------
    contract = _contract()
    prop = world.commission_propose_contract("buyer", buyer.token, contract)
    cid, digest0 = prop["contract_id"], prop["contract_sha256"]
    # Q0 stop condition: the contract must bind the participant, not the key.
    bound_keys = [k for k in contract
                  if "worker" in k.lower() or "agent" in k.lower()
                  or "key" in k.lower()]
    assert not bound_keys, f"Q0 STOP: contract binds worker key: {bound_keys}"
    assert contract["seller_id"] == "seller"
    for client, pid in ((buyer, "buyer"), (seller, "seller")):
        sig = sign_contract_sha(client.root_key, digest0)
        res = world.commission_authorize_contract(pid, client.token, cid, sig)
    assert res["status"] == "frozen", res
    record("S2-frozen", contract_id=cid, contract_sha256=digest0,
           q0_worker_key_binding="absent: contract binds seller_id only")

    # -- S3: fund + start ---------------------------------------------------
    world.fund_simulated("buyer", buyer.token, 2000,
                         idempotency_key="fund-1")
    started = world.commission_start(
        "buyer", buyer.token, cid, idempotency_key="start-1")
    com_id = started["commission_id"]
    record("S3-started", commission_id=com_id,
           reserved_cents=started["reserved_cents"])

    # -- S4: Worker A (provider 1) does partial work -------------------------
    partial_a = worker_text(
        EVIDENCE["providers"]["worker_a"],
        ("You are worker A, a worker agent on a bounded commission. Task: "
         "write a harbor tide report. Frozen acceptance criteria for the "
         "FINAL report: it must state the tide height '2.43 m' and mention "
         "the 'harbor'. Your job now: write only the FIRST HALF (2-3 short "
         "sentences), ending mid-report. Plain text only, no preamble."),
        "Begin the harbor tide report.",
        "S4-worker-a")
    partial_a_sha = hashlib.sha256(partial_a.encode()).hexdigest()

    def present(pid, token, agent_id, worker_key, mandate_id, action):
        challenge = world.gate_challenge(pid, token, action)["challenge"]
        return create_presentation(
            bundle=seller.wallet.export_bundle(),
            mandate_id=mandate_id, subject_id=agent_id,
            subject_key=worker_key, action=action,
            receiver_challenge=challenge)

    def cost_a(op, units, claimed, key):
        return world.commission_report_cost(
            "seller", token_a, com_id, op, units, claimed,
            present("seller", token_a, "seller-worker-a",
                    seller.worker_key, out_a["mandate_id"],
                    "commission.report-cost"),
            idempotency_key=key)

    cost_a("readings.scan", 3, 99999, "cost-a1")
    cost_a("summary.write", 1, 424242, "cost-a2")
    desc_a = world.commission_describe(com_id)
    assert desc_a["recorded_cost_cents"] == 35, desc_a
    checkpoint = {
        "recorded_cost_cents": desc_a["recorded_cost_cents"],
        "cost_events": copy.deepcopy(desc_a["cost_events"]),
        "contract_sha256": desc_a["contract_sha256"],
        "partial_text_sha256": partial_a_sha,
    }
    record("S4-checkpoint", recorded_cost_cents=35,
           partial_text_sha256=partial_a_sha,
           digest_unchanged=(desc_a["contract_sha256"] == digest0))

    # -- S5: owner revokes Worker A; A's next action is refused --------------
    seller.wallet.revoke(seller.mandate_id)
    refresh = world.authority_refresh(
        "seller", token_a, seller.wallet.export_bundle())
    assert refresh["revoked"] is True
    refused = expect_refusal(
        "S5-a-refused",
        lambda: cost_a("readings.scan", 1, 5, "cost-a3"),
        ["MANDATE_REVOKED", "WORLD_AUTHORIZATION_REFUSED"])
    desc_r = world.commission_describe(com_id)
    assert desc_r["recorded_cost_cents"] == 35
    record("S5-revoked", revoked=refresh["revoked"], refusal=refused,
           recorded_still_cents=35)
    head_after_revoke = (refresh["head_hash"], refresh["head_sequence"])

    # -- S6: build the replacement bundle; adversarial pre-tests ------------
    worker_b_key = Ed25519PrivateKey.generate()
    worker_b_pub = public_key_hex(worker_b_key)
    grant = seller.wallet.grant(
        subject_id="seller-worker-b", subject_public_key=worker_b_pub,
        scopes=list(_SCOPES),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    mandate_b_id = grant["data"]["mandate_id"]
    bundle_b = seller.wallet.export_bundle()
    _, timeline_b = verify_bundle(bundle_b)
    head_hash, head_seq = timeline_b.head_hash, timeline_b.head_sequence
    assert head_seq > head_after_revoke[1]

    def build_request(sign_key, ihead_hash, ihead_seq):
        intent = {
            "participant_id": "seller",
            "old_agent_id": "seller-worker-a",
            "old_mandate_id": out_a["mandate_id"],
            "new_agent_id": "seller-worker-b",
            "new_agent_public_key": worker_b_pub,
            "head_hash": ihead_hash,
            "head_sequence": ihead_seq,
            "delegated_scopes": list(_SCOPES),
        }
        sig = sign_key.sign(canonical_json(intent)).hex()
        nonce = world.challenge()["nonce"]
        return {
            "version": REPLACE_WORKER_VERSION,
            "participant_id": "seller",
            "agent": {"id": "seller-worker-b",
                      "display_name": "seller agent b",
                      "public_key": worker_b_pub},
            "mandate": {"scopes": list(_SCOPES)},
            "owner": {"principal_id": seller.wallet.principal_id,
                      "root_public_key": public_key_hex(seller.root_key)},
            "mandate_bundle": bundle_b,
            "replacement": {**intent, "owner_signature": sig},
            "proof": {"nonce": nonce,
                      "signature": worker_b_key.sign(
                          nonce.encode("utf-8")).hex()},
            "capabilities": ["mandate.v1", "receipt.v1", "revocation.v1"],
        }

    attacker_key = Ed25519PrivateKey.generate()
    unauth = expect_refusal(
        "S6-unauthorized",
        lambda: world.replace_worker(
            build_request(attacker_key, head_hash, head_seq)),
        ["REPLACEMENT_OWNER_SIGNATURE_INVALID"])
    stale = expect_refusal(
        "S6-stale",
        lambda: world.replace_worker(
            build_request(seller.root_key, head_after_revoke[0],
                          head_after_revoke[1])),
        ["REPLACEMENT_HEAD_STALE"])
    sess = world.sessions["seller"]
    assert sess.agent_id == "seller-worker-a"
    assert sess.authority_head_hash == head_after_revoke[0]
    record("S6-adversarial-pre", unauthorized_refusal=unauth,
           stale_refusal=stale, state_unchanged=True)

    # -- S7: the replacement, through the public path ------------------------
    good_request = build_request(seller.root_key, head_hash, head_seq)
    out_b = world.replace_worker(good_request)
    token_b = out_b["token"]
    assert out_b["agent_id"] == "seller-worker-b"
    assert out_b["standing"] == "current"
    assert "seller-worker-a" not in [
        s.agent_id for s in world.sessions.values()]
    repl_record = world.worker_replacements[-1]
    assert repl_record["old_agent_id"] == "seller-worker-a"
    assert repl_record["new_agent_id"] == "seller-worker-b"
    assert repl_record["new_mandate_id"] == mandate_b_id
    assert repl_record["new_mandate_id"] != out_a["mandate_id"]
    _, timeline_now = verify_bundle(bundle_b)
    old_m = timeline_now.mandates.get(out_a["mandate_id"])
    assert old_m is None or old_m.get("status") != "ACTIVE"
    record("S7-replaced", new_agent=out_b["agent_id"],
           new_mandate=out_b["mandate_id"],
           old_mandate_status=(old_m or {}).get("status", "absent"),
           head_sequence=head_seq,
           owner_signature_prefix=repl_record["owner_signature"][:16])

    # -- S8: adversarial post-tests: replay, A returns, no join weakening ----
    replay = expect_refusal(
        "S8-replay", lambda: world.replace_worker(good_request),
        ["REPLACEMENT_UNKNOWN_WORKER"])
    a_old_token = expect_refusal(
        "S8-a-old-token",
        lambda: world.commission_report_cost(
            "seller", token_a, com_id, "readings.scan", 1, 5,
            {"unused": True}, idempotency_key="cost-a4"),
        ["WORLD_AUTH_MISMATCH"])
    # A tries the public join path again: still refused, not weakened.
    nonce_a = world.challenge()["nonce"]
    rejoin_a = expect_refusal(
        "S8-a-rejoin",
        lambda: world.join({
            "version": "openline-join-profile/v1",
            "participant": {"id": "seller", "display_name": "Seller"},
            "agent": {"id": "seller-worker-a",
                      "display_name": "seller agent",
                      "public_key": public_key_hex(Ed25519PrivateKey.generate())},
            "proof": {"nonce": nonce_a, "signature": "00" * 64},
            "owner": {"principal_id": seller.wallet.principal_id,
                      "root_public_key": public_key_hex(seller.root_key)},
            "mandate_bundle": bundle_b,
            "mandate": {"scopes": list(_SCOPES)},
            "capabilities": ["mandate.v1"]}),
        ["JOIN_STANDING_NOT_CURRENT"])
    record("S8-adversarial-post", replay_refusal=replay,
           a_old_token_refusal=a_old_token, a_rejoin_refusal=rejoin_a)

    # -- S9: restart during the handoff --------------------------------------
    world2 = World(data_root=root)
    assert len(world2.worker_replacements) == 1
    assert world2.worker_replacements[0]["new_agent_id"] == "seller-worker-b"
    b_dead_check = expect_refusal(
        "S9-a-token-dead-after-restart",
        lambda: world2.commission_report_cost(
            "seller", token_a, com_id, "readings.scan", 1, 5,
            {"unused": True}, idempotency_key="cost-dead"),
        ["WORLD_AUTH_MISMATCH"])
    desc_restart = world2.commission_describe(com_id)
    assert desc_restart["recorded_cost_cents"] == 35
    assert desc_restart["contract_sha256"] == digest0
    record("S9-restart", replacements_persisted=1,
           a_token_dead=b_dead_check,
           recorded_still_cents=35, digest_unchanged=True)
    world = world2  # continue on the restarted world

    # -- S10: B inspects the checkpoint and finishes the work ----------------
    desc_b = world.commission_describe(com_id)
    assert desc_b["contract_sha256"] == digest0
    assert desc_b["recorded_cost_cents"] == 35
    record("S10-checkpoint-inspected", digest_unchanged=True,
           recorded_cost_cents=35)

    completed_b = worker_text(
        EVIDENCE["providers"]["worker_b"],
        ("You are worker B, the replacement worker resuming a commission "
         "from a recorded checkpoint. The previous worker was revoked after "
         "partial work; the contract, checkpoint, and budget are unchanged. "
         "Frozen acceptance criteria for the FINAL report: it must state "
         "the tide height '2.43 m' and mention the 'harbor'. Complete the "
         "report in 4-6 short sentences total, incorporating and finishing "
         "the partial text below. Plain text only, no preamble."),
        ("Partial text from the checkpoint:\n---\n" + partial_a +
         "\n---\nRecorded costs so far: 35c of a 1000c budget. "
         "Complete the report."),
        "S10-worker-b")
    if not meets_criteria(completed_b):
        completed_b = worker_text(
            EVIDENCE["providers"]["worker_b"],
            ("You write harbor tide reports. The final report MUST contain "
             "the exact string '2.43 m' and the word 'harbor', plain text, "
             "4-6 short sentences."),
            "Write the completed harbor tide report now.",
            "S10-worker-b-retry")
    assert meets_criteria(completed_b), "provider text failed criteria twice"
    record("S10-completed", chars=len(completed_b),
           sha256=hashlib.sha256(completed_b.encode()).hexdigest(),
           meets_criteria=True)

    # B must incorporate A's checkpoint, not merely generate fresh text on
    # the same topic. The handoff prompt carries A's partial verbatim; require
    # at least two distinctive content words from the partial to appear in
    # the completion.
    _stop = {"the", "and", "with", "from", "that", "this", "into",
             "over", "under", "between", "through", "about", "after",
             "while", "report"}
    def _distinctive(text):
        return [w.strip(".,;:!?\"'()").lower() for w in text.split()
                if len(w.strip(".,;:!?\"'()")) >= 5
                and w.strip(".,;:!?\"'()").lower() not in _stop]
    _a_words = _distinctive(partial_a)
    _b_low = completed_b.lower()
    _shared = sorted({w for w in _a_words if w in _b_low})
    assert len(_shared) >= 2, {"shared": _shared, "partial_a": partial_a,
                               "completed_b": completed_b}
    record("S10-checkpoint-used", shared_distinctive_words=_shared,
           partial_sha256=partial_a_sha,
           completed_sha256=hashlib.sha256(
               completed_b.encode()).hexdigest())

    def cost_b(op, units, claimed, key):
        return world.commission_report_cost(
            "seller", token_b, com_id, op, units, claimed,
            present("seller", token_b, "seller-worker-b", worker_b_key,
                    mandate_b_id, "commission.report-cost"),
            idempotency_key=key)

    cost_b("readings.scan", 2, 111, "cost-b1")
    cost_b("summary.write", 1, 222, "cost-b2")
    desc_c = world.commission_describe(com_id)
    assert desc_c["recorded_cost_cents"] == 65, desc_c

    pres_submit = present("seller", token_b, "seller-worker-b",
                          worker_b_key, mandate_b_id,
                          "commission.submit-deliverable")
    submitted = world.commission_submit_deliverable(
        "seller", token_b, com_id, completed_b, pres_submit,
        idempotency_key="submit-1")
    assert submitted["outcome"] == "accepted", submitted
    settlement = submitted["settlement"]
    # Buyer-side independent verification (the existing buyer evaluation).
    buyer_ok = meets_criteria(completed_b)
    record("S10-submitted", outcome="accepted",
           settlement_id=settlement["settlement_id"],
           buyer_verification=buyer_ok,
           recorded_cost_cents=65)

    # -- S11: settlement exactly once; reconciliation -------------------------
    EVIDENCE["_diag"] = {
        "balances": dict(world.simulated_balances),
        "settle_ledger": [e for e in world.commission_ledger
                          if e["kind"] == "settle"],
        "settlement": settlement,
    }
    resub = world.commission_submit_deliverable(
        "seller", token_b, com_id, completed_b, pres_submit,
        idempotency_key="submit-1")
    assert resub["replayed"] is True
    assert resub["settlement"]["settlement_id"] == settlement["settlement_id"]
    bal_buyer = world.simulated_balances["buyer"]
    bal_seller = world.simulated_balances["seller"]
    settles = [e for e in world.commission_ledger if e["kind"] == "settle"]
    assert len(settles) == 1
    assert settlement["seller_payout_cents"] == 565, settlement
    assert settlement["buyer_release_cents"] == 935, settlement
    assert bal_buyer == 1435, bal_buyer
    # Seller was never funded in this run: S3 funds the buyer only (2000c),
    # so the seller's opening balance is 0 and the contract payout is the
    # whole final balance: 0 + (65 recorded + 500 fee) = 565. Ledger-derived:
    # 1435 + 565 = 2000 = total funded (conservation), and
    # 565 + 935 = 1500 = reserved. See evidence/DIAGNOSIS-S11.md.
    assert bal_buyer + bal_seller == 2000, (bal_buyer, bal_seller)
    assert bal_seller == 565, bal_seller
    record("S11-settled-once", replayed=resub["replayed"],
           settlement_id=settlement["settlement_id"],
           seller_payout_cents=565, buyer_release_cents=935,
           buyer_balance_cents=bal_buyer, seller_balance_cents=bal_seller)

    # -- S12: restart after settlement: nothing duplicates --------------------
    world3 = World(data_root=root)
    desc_final = world3.commission_describe(com_id)
    assert desc_final["recorded_cost_cents"] == 65
    assert world3.simulated_balances["buyer"] == 1435
    assert world3.simulated_balances["seller"] == 565
    assert len([e for e in world3.commission_ledger
                if e["kind"] == "settle"]) == 1
    assert len(world3.worker_replacements) == 1
    record("S12-restart-final", recorded_still_cents=65,
           balances_unchanged=True, single_settlement=True)

    # -- signed decision records ----------------------------------------------
    receipts = []
    for r in world3.sessions["seller"].receipts:
        receipts.append({
            "action": r.get("action"),
            "decision": r.get("decision"),
            "signature_prefix": str(r.get("signature") or "")[:16],
        })
    EVIDENCE["signed_decision_records"] = {
        "seller_session_receipts": receipts,
        "replacement_record": world3.worker_replacements[0],
        "settlement": settlement,
    }
    EVIDENCE["work_product"] = {
        "partial_a_sha256": partial_a_sha,
        "completed_b_sha256": hashlib.sha256(
            completed_b.encode()).hexdigest(),
        "partial_a_text": partial_a,
        "completed_b_text": completed_b,
    }
    EVIDENCE["assertions"] = {
        "P1": True, "P2": True, "P3": True, "P4": True, "P5": True,
        "P6": True, "P7": True, "P8": True, "P9": True, "P10": True,
        "P11": True,
    }
    EVIDENCE["terminal_verdict"] = "PASS"
    EVIDENCE.pop("_diag", None)
    return 0


def main() -> int:
    try:
        return _main()
    except Exception as exc:
        EVIDENCE["terminal_verdict"] = "FAIL-other"
        EVIDENCE["failure"] = f"{type(exc).__name__}: {exc}"
        EVIDENCE["traceback"] = traceback.format_exc(limit=12)[-3000:]
        if EVIDENCE.get("_diag"):
            EVIDENCE["failure_diagnostics"] = EVIDENCE.pop("_diag")
        return 1


if __name__ == "__main__":
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    try:
        rc = main()
    except Exception as exc:
        EVIDENCE["terminal_verdict"] = "FAIL-other"
        EVIDENCE["failure"] = f"{type(exc).__name__}: {exc}"
        rc = 1
    out = Path(__file__).resolve().parent / "evidence" / f"run-002-{ts}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(EVIDENCE, indent=2, default=str))
    print(f"verdict={EVIDENCE['terminal_verdict']} evidence={out}")
    if EVIDENCE["terminal_verdict"] != "PASS":
        print(json.dumps(EVIDENCE.get("failure", ""), indent=2)[:500])
    sys.exit(rc)
