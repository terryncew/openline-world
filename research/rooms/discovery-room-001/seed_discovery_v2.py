"""DISCOVERY-ROOM-001 v2: corrected loop after the manifest-binding fix.

Runs the FULL research-question loop a second time on the EXISTING
Exchange board, with an explicitly versioned corrected listing:

  - v1 listing (seed_discovery.py) declared the STALE manifest pin
    604fe0d3... in its acceptance criteria. The receiver evaluated the
    real manifest (c4aa89ff...) and recorded pin_match:false, but v1
    submit settled anyway (settlement stl-4431fbaca0bf1f7e) -- the
    binding defect. v1 records are PRESERVED untouched.
  - v2 listing declares the CORRECT full pin
    c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533.
    The receiver's binding enforcement (_research_enforce_manifest_binding)
    now requires the declared pin to exactly equal the evaluated
    manifest's sha256, so v2 submit is accepted and settles.

Steps (all through the real World API, in order), mirroring v1:
  1. Three participants join (internal operators, deterministic clients).
  2. owner-researcher posts the version-2 research-question listing.
  3. verifier-1 proposes; commission frozen/started on the existing
     simulated ledger (100c per simulated-compute-unit, 1000c ceiling).
  4. owner-researcher agrees.
  5. verifier-1 submits: receiver verifies (pin_match must be true),
     records the cost, the gate accepts the result.
  6. Deliverable submitted through the real commission path; settled.

The recorded UNFAVORABLE experiment outcome (C did not beat B) is
preserved VERBATIM from the frozen aggregate; it completes the loop.

Run:  ~/workspace/.venvs/workshop/bin/python research/rooms/discovery-room-001/seed_discovery_v2.py
from the repo root. Uses a fresh world under world-state-v2/ (v1's
world-state/ is preserved as evidence). Writes loop-transcript-v2.json
and appends the v2 run under the "v2" key of loop-transcript.json
(v1 keys untouched).
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

CORRECT_PIN = ("c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096"
               "116533")
STALE_PIN_V1 = "604fe0d3"

DISCLOSURE_V2 = {
    # NOTE: the 12-field shape is fixed by World._clean_disclosure; the
    # version-2 identity lives in the listing detail text and the
    # acceptance criteria (correct full manifest pin below), not in extra
    # fields. v1 records are preserved; v1 settlement stl-4431fbaca0bf1f7e
    # is documented as affected by the manifest-binding defect.
    "proposed": ("Structured, validated receipts with provenance improve "
                 "bounded search vs ordinary sharing."),
    "unproven": ("Whether any improvement generalizes beyond this task, "
                  "budget (400 evals), and identical workers."),
    "test_spec": ("Hidden-parameter recovery; 3 conditions (A independent / "
                  "B ordinary sharing / C receipt sharing); 4 workers; "
                  "10 replications; frozen protocol repro-lab-001."),
    "required_contribution": ("Independent verification of the evidence "
                              "manifest: recompute sha256 of all 40 "
                              "artifacts in research/rooms/repro-lab-001/"
                              "EVIDENCE-MANIFEST.json and compare."),
    "resource_ceiling": {"amount": 10, "unit": "simulated-compute-units"},
    "acceptance_criteria": [
        "all 40 artifact hashes recomputed",
        "match/mismatch counts reported",
        f"result bound to manifest sha256 {CORRECT_PIN}",
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
        "RESEARCH QUESTION (listing version 2) -- disclosure set",
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
        f"Version: 2 (corrects v1's stale manifest pin {STALE_PIN_V1}...; "
        "v1 records preserved).",
        "Posted by: owner (researcher, internal operator).",
    ]
    return "\n".join(lines)


def _commission_contract(buyer_id: str, seller_id: str,
                         agreement_id: str) -> dict:
    return {
        "schema": "openline.commission.contract.v1",
        "version": 1,
        "job": {
            "task": (f"Independent verification contribution (v2) for "
                     f"agreement {agreement_id}: recompute sha256 of the "
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
    transcript: dict = {"version": 2, "steps": []}

    def step(name: str, **kw):
        entry = {"step": name, **kw}
        transcript["steps"].append(entry)
        print(f"-- {name}")
        for k, v in kw.items():
            print(f"     {k}: {v if not isinstance(v, (dict, list)) else json.dumps(v)[:160]}")
        return entry

    state_dir = ROOM_DIR / "world-state-v2"
    if state_dir.exists():
        print(f"-- resetting {state_dir} (fresh v2 demonstration world)")
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
            "detail": _detail_markdown(DISCLOSURE_V2),
            "terms": {"requires": []},
            "disclosure": copy.deepcopy(DISCLOSURE_V2)}
    assert len(TITLE) <= 80, len(TITLE)
    assert len(task["detail"]) <= 2000, len(task["detail"])
    need_id = world.need(owner.pid, owner.token, task,
                         idempotency_key="seed2-need-1")["need_id"]
    step("listing v2 posted (need, real API)", need_id=need_id,
         kind="research-question", manifest_pin_declared=CORRECT_PIN)

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
        idempotency_key="seed2-propose-1")
    agr_id = agr["agreement_id"]
    step("agreement proposed by contributor", agreement_id=agr_id,
         status=agr["status"])

    contract = _commission_contract(owner.pid, verifier.pid, agr_id)
    ctr = world.commission_propose_contract(owner.pid, owner.token, contract)
    cid, sha = ctr["contract_id"], ctr["contract_sha256"]
    for client in (owner, verifier):
        world.commission_authorize_contract(
            client.pid, client.token, cid,
            sign_contract_sha(client.root_key, sha))
    world.fund_simulated(owner.pid, owner.token, 2000,
                         idempotency_key="seed2-fund-1")
    com = world.commission_start(owner.pid, owner.token, cid,
                                 idempotency_key="seed2-start-1")
    com_id = com["commission_id"]
    step("commission frozen + started on the existing simulated ledger",
         contract_id=cid, commission_id=com_id,
         reserved_cents=com["reserved_cents"])

    world.agree(owner.pid, owner.token, agr_id,
                owner.presentation(world, "research.verify"),
                idempotency_key="seed2-agree-1")
    step("listing owner agreed (counterpart's explicit act)",
         agreement_id=agr_id, status="agreed")

    # Submit: the receiver runs the verification, ENFORCES the manifest
    # binding (declared pin must exactly equal the evaluated manifest
    # sha256), records the cost, and the gate accepts the result.
    sub = world.submit(verifier.pid, verifier.token, agr_id,
                       idempotency_key="seed2-submit-1")
    agreement = world.agreements[agr_id]
    tx = world.transactions[sub["transaction_id"]]
    result = agreement["result"]["payload"]
    assert result["verification"]["pin_match"] is True, \
        "v2 pin must bind"
    assert result["verification"]["manifest_sha256"] == CORRECT_PIN
    assert result["experiment_outcome"]["verdict"] == "C did not beat B", \
        "unfavorable outcome preserved verbatim"
    step("submitted through the receiver (binding enforced, pin matched)",
         decision=sub["decision"], transaction_id=sub["transaction_id"],
         verification_matches=(f"{result['verification']['matches']}/"
                               f"{result['verification']['artifacts_checked']}"),
         pin_match=result["verification"]["pin_match"],
         manifest_sha256=result["verification"]["manifest_sha256"],
         verdict=result["experiment_outcome"]["verdict"],
         spent_units=result["accounting"]["spent_units"],
         ceiling_units=result["accounting"]["ceiling_units"])
    assert tx["result"]["payload"]["agreement_id"] == agr_id

    report_lines = [
        "Independent verification (v2) of the repro-lab-001 evidence manifest.",
        (f"Recomputed sha256 for "
         f"{result['verification']['artifacts_checked']} artifacts: "
         f"{result['verification']['matches']} matches, "
         f"{len(result['verification']['mismatches'])} mismatches."),
        (f"Manifest sha256 {result['verification']['manifest_sha256']} "
         f"(declared pin {result['verification']['manifest_sha256_pinned']}: "
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
        idempotency_key="seed2-deliver-1")
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
    transcript["binding_defect_note"] = (
        "v1 settlement stl-4431fbaca0bf1f7e (agreement agr-3c035b646ce2) "
        "is documented as affected by the manifest-binding defect: the v1 "
        "listing declared stale pin 604fe0d3..., the receiver recorded "
        "pin_match:false, and v1 submit settled anyway. v1 records are "
        "preserved unchanged; see ROOM.json defect record.")

    v2_path = ROOM_DIR / "loop-transcript-v2.json"
    v2_path.write_text(json.dumps(transcript, indent=2,
                                  ensure_ascii=False) + "\n")
    print(f"-- v2 transcript written to {v2_path}")

    # Append the v2 run to loop-transcript.json under the "v2" key;
    # all v1 keys stay exactly as they were.
    main_path = ROOM_DIR / "loop-transcript.json"
    main_transcript = json.loads(main_path.read_text())
    assert "v1" not in main_transcript and "v2" not in main_transcript, \
        "loop-transcript.json already carries a v2 run"
    v1_keys_before = set(main_transcript.keys())
    main_transcript["v2"] = transcript
    assert v1_keys_before <= set(main_transcript.keys())
    for key in v1_keys_before:
        assert key != "v2"
    main_path.write_text(json.dumps(main_transcript, indent=2,
                                    ensure_ascii=False) + "\n")
    print(f"-- v2 run appended under 'v2' in {main_path} "
          f"(v1 keys preserved: {sorted(v1_keys_before)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
