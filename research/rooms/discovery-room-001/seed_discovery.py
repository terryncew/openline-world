"""DISCOVERY-ROOM-001 seed + loop demonstration.

Posts the first research-question listing on the EXISTING Exchange board
(no separate board), then runs one complete loop through the REAL Exchange
agreement flow:

    question -> agreed contribution -> supported experiment
        -> result + accounting returned to the question

Steps (all through the real World API, in order):
  1. Three participants join: owner-researcher (listing owner / buyer),
     verifier-1 (contributor / seller), observer-3 (uninvolved third party).
     All are labeled internal operators; the workers are deterministic
     test clients, not AI scientists.
  2. owner-researcher posts the research-question listing (need) with the
     full disclosure set.
  3. verifier-1 proposes an agreement on it (worker-signed presentation
     evaluated by the gate: AUTHORIZATION).
  4. A commission contract is proposed/frozen/started between owner
     (buyer) and verifier (seller) on the EXISTING simulated ledger --
     100c per simulated-compute-unit, 1000c (10 units) ceiling.
  5. REFUSAL DEMO (real, not seeded): observer-3, who is not the
     counterpart, attempts agree() -> WORLD_RULE_NOT_COUNTERPART.
  6. owner-researcher agrees (second explicit act).
  7. verifier-1 submits. The receiver runs the evidence-manifest hash
     verification FOR REAL (EXECUTION), evaluates it against the
     acceptance criteria (EVALUATION), records the cost on the existing
     commission ledger, and the gate accepts the result (ACCEPTANCE) --
     all bound under the gate's signature on the agreement/transaction.
  8. verifier-1 submits the deliverable through the real commission path;
     the receiver evaluates it and settles (simulated funds move).

The recorded UNFAVORABLE experiment outcome (C did not beat B) COMPLETES
the loop; it is not a loop failure.

Run:  ~/workspace/.venvs/workshop/bin/python research/rooms/discovery-room-001/seed_discovery.py
from the repo root. Writes loop-transcript.json next to this script and
persists the world snapshot under world-state/.
"""
import copy
import json
import shutil
import sys
import time
from pathlib import Path

ROOM_DIR = Path(__file__).resolve().parent
REPO_ROOT = ROOM_DIR.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))
sys.path.insert(0, str(REPO_ROOT / "backend" / "tests"))

from world import World, WorldRuleError  # noqa: E402
from custody_client import _Client  # noqa: E402
from commission import sign_contract_sha  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402

_SCOPES = ("research.verify", "commission.report-cost",
           "commission.submit-deliverable")

DISCLAIMER = ("A receipt records an agreement; it does not establish "
              "intellectual-property rights or scientific truth.")

DISCLOSURE = {
    "proposed": ("Structured, validated receipts with provenance improve "
                 "bounded search vs ordinary sharing."),
    "unproven": ("Whether any improvement generalizes beyond this task, "
                  "budget (400 evals), and identical workers."),
    "test_spec": ("Hidden-parameter recovery; 3 conditions (A independent / "
                  "B ordinary sharing / C receipt sharing); 4 workers; "
                  "10 replications; frozen protocol repro-lab-001."),
    "required_contribution": ("Independent verification of the evidence "
                              "manifest: recompute sha256 of all 38 "
                              "artifacts in research/rooms/repro-lab-001/"
                              "EVIDENCE-MANIFEST.json and compare."),
    "resource_ceiling": {"amount": 10, "unit": "simulated-compute-units"},
    "acceptance_criteria": [
        "all 38 artifact hashes recomputed",
        "match/mismatch counts reported",
        "result bound to manifest sha256 604fe0d3...",
        "experiment outcome preserved verbatim (C did not beat B)",
    ],
    "contributor_receives": ("A gate-signed verification receipt; credit "
                             "in the room record."),
    "buyer_receives": ("Independent confirmation of evidence integrity, "
                       "bound to the question."),
    "authorized_by": "receiver (gate); terms acceptance requires discovery.accept scope",
    "visibility_terms": ("Listing public. Contribution artifacts private by "
                         "default; only explicitly selected material "
                         "published."),
    "reuse_terms": ("Artifacts reusable for verification. No IP transfer. "
                    + DISCLAIMER),
}

TITLE = ("Does structured receipt exchange improve a bounded computational "
         "search task?")


def _detail_markdown(d: dict) -> str:
    lines = [
        "RESEARCH QUESTION -- disclosure set",
        f"Proposed: {d['proposed']}",
        f"Unproven: {d['unproven']}",
        f"Test spec: {d['test_spec']}",
        f"Required contribution: {d['required_contribution']}",
        (f"Resource ceiling: {d['resource_ceiling']['amount']} "
         f"{d['resource_ceiling']['unit']}."),
        "Acceptance criteria: "
        + "; ".join(f"({i+1}) {c}" for i, c in
                    enumerate(d["acceptance_criteria"])),
        f"Contributor receives: {d['contributor_receives']}",
        f"Buyer receives: {d['buyer_receives']}",
        f"Authorized by: {d['authorized_by']}",
        f"Visibility: {d['visibility_terms']}",
        f"Reuse: {d['reuse_terms']}",
        "Posted by: owner (researcher, internal operator).",
    ]
    return "\n".join(lines)


def _commission_contract(buyer_id: str, seller_id: str,
                         agreement_id: str) -> dict:
    return {
        "schema": "openline.commission.contract.v1",
        "version": 1,
        "job": {
            "task": (f"Independent verification contribution for agreement "
                     f"{agreement_id}: recompute sha256 of the "
                     f"repro-lab-001 evidence manifest artifacts."),
            "deliverable": ("A verification report naming the manifest "
                            "sha256, match/mismatch counts, and the "
                            "preserved experiment outcome."),
        },
        "acceptance": {
            "required_substrings": ["verification", "sha256",
                                   "repro-lab-001"],
            "forbidden_substrings": [],
            "max_bytes": 4096,
        },
        "buyer_id": buyer_id,
        "seller_id": seller_id,
        "permitted_operations": [
            {"op": "evidence.verify", "rate_cents": 100},
        ],
        "max_cost_cents": 1000,   # 10 simulated-compute-units at 100c each
        "success_fee_cents": 0,
        "deadline_ts": time.time() + 86400,
    }


def main() -> int:
    transcript: dict = {"steps": []}

    def step(name: str, **kw):
        entry = {"step": name, **kw}
        transcript["steps"].append(entry)
        print(f"-- {name}")
        for k, v in kw.items():
            print(f"     {k}: {v if not isinstance(v, (dict, list)) else json.dumps(v)[:160]}")
        return entry

    state_dir = ROOM_DIR / "world-state"
    if state_dir.exists():
        print(f"-- resetting {state_dir} (fresh demonstration world)")
        shutil.rmtree(state_dir)
    world = World(data_root=state_dir)

    owner = _Client("owner-researcher", scopes=_SCOPES,
                    display="Owner Researcher (internal operator)")
    verifier = _Client("verifier-1", scopes=_SCOPES,
                       display="Verifier One (internal operator)")
    observer = _Client("observer-3", scopes=_SCOPES,
                       display="Observer Three (internal operator)")
    for client in (owner, verifier, observer):
        client.join(world)
    step("participants joined",
         owner=owner.pid, contributor=verifier.pid, observer=observer.pid,
         note="all labeled internal operators; deterministic test clients")

    task = {"kind": "research-question", "title": TITLE,
            "detail": _detail_markdown(DISCLOSURE),
            "terms": {"requires": []},
            "disclosure": copy.deepcopy(DISCLOSURE)}
    assert len(TITLE) <= 80, len(TITLE)
    assert len(task["detail"]) <= 2000, len(task["detail"])
    need_id = world.need(owner.pid, owner.token, task,
                         idempotency_key="seed-need-1")["need_id"]
    step("listing posted (need, real API)", need_id=need_id,
         kind="research-question")

    board = world.board({"kind": "research-question"})
    listed = [entry for entry in board["listings"]
              if entry["listing_id"] == need_id]
    assert len(listed) == 1 and listed[0]["disclosure"] is not None
    assert DISCLAIMER in listed[0]["disclosure"]["reuse_terms"]
    step("board() exposes the disclosure set",
         disclosure_fields=sorted(listed[0]["disclosure"].keys()))

    agr = world.propose_agreement(
        verifier.pid, verifier.token, need_id,
        verifier.presentation(world, "research.verify"),
        idempotency_key="seed-propose-1")
    agr_id = agr["agreement_id"]
    step("agreement proposed by contributor", agreement_id=agr_id,
         status=agr["status"])

    # Existing simulated ledger: commission contract between owner (buyer)
    # and verifier (seller), frozen by both owner root keys, funded, started.
    contract = _commission_contract(owner.pid, verifier.pid, agr_id)
    ctr = world.commission_propose_contract(owner.pid, owner.token, contract)
    cid, sha = ctr["contract_id"], ctr["contract_sha256"]
    for client in (owner, verifier):
        world.commission_authorize_contract(
            client.pid, client.token, cid,
            sign_contract_sha(client.root_key, sha))
    world.fund_simulated(owner.pid, owner.token, 2000,
                         idempotency_key="seed-fund-1")
    com = world.commission_start(owner.pid, owner.token, cid,
                                 idempotency_key="seed-start-1")
    com_id = com["commission_id"]
    step("commission frozen + started on the existing simulated ledger",
         contract_id=cid, commission_id=com_id,
         reserved_cents=com["reserved_cents"])

    # REFUSAL DEMO (real, not seeded): a non-counterpart attempts agree().
    try:
        world.agree(observer.pid, observer.token, agr_id,
                    observer.presentation(world, "research.verify"))
        raise AssertionError("non-counterpart agree() was NOT refused")
    except WorldRuleError as exc:
        assert exc.code == "WORLD_RULE_NOT_COUNTERPART", exc.code
        step("REFUSAL demonstrated (real path)",
             attempt="non-counterpart agree()",
             code=exc.code, detail=str(exc))

    world.agree(owner.pid, owner.token, agr_id,
                owner.presentation(world, "research.verify"),
                idempotency_key="seed-agree-1")
    step("listing owner agreed (counterpart's explicit act)",
         agreement_id=agr_id, status="agreed")

    # Submit: the receiver runs the verification, records the cost, and the
    # gate accepts the result. A recorded UNFAVORABLE experiment outcome
    # completes the loop; it is not a loop failure.
    sub = world.submit(verifier.pid, verifier.token, agr_id,
                       idempotency_key="seed-submit-1")
    agreement = world.agreements[agr_id]
    tx = world.transactions[sub["transaction_id"]]
    result = agreement["result"]["payload"]
    step("submitted through the receiver",
         decision=sub["decision"], transaction_id=sub["transaction_id"],
         verification_matches=(f"{result['verification']['matches']}/"
                               f"{result['verification']['artifacts_checked']}"),
         pin_match=result["verification"]["pin_match"],
         verdict=result["experiment_outcome"]["verdict"],
         spent_units=result["accounting"]["spent_units"],
         ceiling_units=result["accounting"]["ceiling_units"])
    assert tx["result"]["payload"]["agreement_id"] == agr_id

    # Close the accounting through the real commission path: the seller
    # submits the verification report as the deliverable; the receiver
    # evaluates it against the frozen acceptance criteria and settles.
    report_lines = [
        "Independent verification of the repro-lab-001 evidence manifest.",
        (f"Recomputed sha256 for "
         f"{result['verification']['artifacts_checked']} artifacts: "
         f"{result['verification']['matches']} matches, "
         f"{len(result['verification']['mismatches'])} mismatches."),
        (f"Manifest sha256 {result['verification']['manifest_sha256']} "
         f"(pinned {result['verification']['manifest_sha256_pinned']}: "
         f"pin_match={result['verification']['pin_match']})."),
        ("Experiment outcome preserved verbatim: "
         f"{result['experiment_outcome']['verdict']} "
         f"(A mean_mse={result['experiment_outcome']['conditions']['A']['mean_mse']} "
         f"B mean_mse={result['experiment_outcome']['conditions']['B']['mean_mse']} "
         f"C mean_mse={result['experiment_outcome']['conditions']['C']['mean_mse']}; "
         f"pooled_se={result['experiment_outcome']['pooled_se']}; "
         f"improved={result['experiment_outcome']['improved']})."),
    ]
    report = " ".join(report_lines)
    settle = world.commission_submit_deliverable(
        verifier.pid, verifier.token, com_id, report,
        verifier.presentation(world, "commission.submit-deliverable"),
        idempotency_key="seed-deliver-1")
    step("deliverable submitted; commission settled (simulated funds moved)",
         outcome=settle["outcome"],
         settlement_id=settle["settlement"]["settlement_id"],
         seller_payout_cents=settle["settlement"]["seller_payout_cents"],
         buyer_release_cents=settle["settlement"]["buyer_release_cents"])

    transcript["listing_id"] = need_id
    transcript["agreement_id"] = agr_id
    transcript["commission_id"] = com_id
    transcript["transaction_id"] = sub["transaction_id"]
    transcript["result"] = result
    transcript["refusal"] = {"attempt": "non-counterpart agree()",
                             "code": "WORLD_RULE_NOT_COUNTERPART"}
    out_path = ROOM_DIR / "loop-transcript.json"
    out_path.write_text(json.dumps(transcript, indent=2,
                                   ensure_ascii=False) + "\n")
    print(f"-- transcript written to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
