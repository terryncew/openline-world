"""UNATTENDED-COMMISSION-001 demonstration driver.

Runs the six brief demonstrations against a real World (the same object the
HTTP server wraps) with real joined custody clients, worker-signed
presentations, and owner root-key signatures. Writes per-scenario JSON
evidence plus the frozen contract to research/uc001/evidence/.

Run from the repo root:
  ~/workspace/.venvs/workshop/bin/python research/uc001/demo_uc001.py
"""
import json
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "backend" / "tests"))

from world import World  # noqa: E402
from custody_client import _Client  # noqa: E402
from commission import contract_sha256, sign_contract_sha  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402

EVIDENCE = Path(__file__).resolve().parent / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)

SCOPES = ("commission.report-cost", "commission.submit-deliverable")
GOOD_REPORT = ("Harbor tide report: mean tide height 2.43 m at the "
               "harbor in Q3 2026, computed from the harbor log.")
BAD_REPORT = "Harbor tide report: tides were normal this quarter."


def contract(deadline_hours=1):
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
        "buyer_id": "alice",
        "seller_id": "bob",
        "permitted_operations": [
            {"op": "readings.scan", "rate_cents": 5},
            {"op": "summary.write", "rate_cents": 20},
        ],
        "max_cost_cents": 1000,
        "success_fee_cents": 500,
        "deadline_ts": time.time() + deadline_hours * 3600,
    }


class Demo:
    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w = World(data_root=Path(self.tmp.name))
        self.alice = _Client("alice", scopes=SCOPES)
        self.bob = _Client("bob", scopes=SCOPES)
        self.alice.join(self.w)
        self.bob.join(self.w)
        self.w.fund_simulated("alice", self.alice.token, 20000,
                              idempotency_key="demo-fund")
        self.evidence = {}

    def frozen(self, **over):
        c = contract(**over)
        out = self.w.commission_propose_contract(
            "alice", self.alice.token, c)
        cid, sha = out["contract_id"], out["contract_sha256"]
        for client, pid in ((self.alice, "alice"), (self.bob, "bob")):
            self.w.commission_authorize_contract(
                pid, client.token, cid,
                sign_contract_sha(client.root_key, sha))
        return cid, sha

    def start(self, cid, key):
        return self.w.commission_start(
            "alice", self.alice.token, cid,
            idempotency_key=key)["commission_id"]

    def cost(self, com_id, op, units, claimed, key):
        return self.w.commission_report_cost(
            "bob", self.bob.token, com_id, op, units, claimed,
            self.bob.presentation(self.w, "commission.report-cost"),
            idempotency_key=key)

    def submit(self, com_id, text, key):
        return self.w.commission_submit_deliverable(
            "bob", self.bob.token, com_id, text,
            self.bob.presentation(self.w, "commission.submit-deliverable"),
            idempotency_key=key)

    def work(self, com_id, tag):
        # 3 scans x 5c + 1 write x 20c = 35c; claimed amounts are inflated
        # on purpose to prove settlement ignores worker-reported totals.
        self.cost(com_id, "readings.scan", 3, 99999, f"{tag}-c1")
        self.cost(com_id, "summary.write", 1, 424242, f"{tag}-c2")

    def save(self, name, obj):
        self.evidence[name] = obj
        (EVIDENCE / f"{name}.json").write_text(
            json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")

    def run(self):
        # -- 1. accepted -------------------------------------------------
        cid, sha = self.frozen()
        (EVIDENCE / "CONTRACT-frozen.json").write_text(
            json.dumps(self.w.commission_contracts[cid]["contract"],
                       indent=2, sort_keys=True), encoding="utf-8")
        com = self.start(cid, "s1-start")
        self.work(com, "s1")
        out = self.submit(com, GOOD_REPORT, "s1-submit")
        assert out["outcome"] == "accepted"
        self.save("demo1-accepted", self.w.commission_describe(com))
        print(f"1. accepted: seller {out['settlement']['seller_payout_cents']}c, "
              f"buyer released {out['settlement']['buyer_release_cents']}c")

        # -- 2. rejected --------------------------------------------------
        cid, _ = self.frozen()
        com = self.start(cid, "s2-start")
        self.work(com, "s2")
        out = self.submit(com, BAD_REPORT, "s2-submit")
        assert out["outcome"] == "rejected"
        self.save("demo2-rejected", self.w.commission_describe(com))
        print(f"2. rejected: seller {out['settlement']['seller_payout_cents']}c "
              f"(costs only), buyer released {out['settlement']['buyer_release_cents']}c")

        # -- 3. cost cap ---------------------------------------------------
        cid, _ = self.frozen()
        com = self.start(cid, "s3-start")
        self.cost(com, "readings.scan", 100, 500, "s3-c1")  # 500c
        try:
            self.cost(com, "readings.scan", 200, 1000, "s3-c2")
            raise AssertionError("cap should have refused")
        except WalletError as e:
            assert e.code == "COMMISSION_COST_CAP_EXCEEDED", e.code
        self.save("demo3-cap", self.w.commission_describe(com))
        print("3. cap: event refused (COMMISSION_COST_CAP_EXCEEDED), "
              "settled costs-only")

        # -- 4. revocation --------------------------------------------------
        cid, _ = self.frozen()
        com = self.start(cid, "s4-start")
        self.cost(com, "readings.scan", 3, 15, "s4-c1")
        sig = self.alice.root_key.sign(f"{com}:revoke".encode()).hex()
        out = self.w.commission_revoke("alice", self.alice.token, com, sig)
        assert out["status"] == "revoked"
        try:
            self.cost(com, "readings.scan", 1, 5, "s4-c2")
            raise AssertionError("revoked should refuse")
        except WalletError as e:
            assert e.code == "COMMISSION_REVOKED", e.code
        self.save("demo4-revocation", self.w.commission_describe(com))
        print("4. revocation: next gated op refused (COMMISSION_REVOKED), "
              "incurred 15c accounted")

        # -- 5. crash / retry ------------------------------------------------
        cid, _ = self.frozen()
        com = self.start(cid, "s5-start")
        first = self.cost(com, "readings.scan", 3, 15, "s5-c1")
        replay = self.cost(com, "readings.scan", 3, 15, "s5-c1")
        assert replay["replayed"] and replay["event_id"] == first["event_id"]
        self.work(com, "s5w")
        s1 = self.submit(com, GOOD_REPORT, "s5-submit")
        bal = dict(self.w.simulated_balances)
        s2 = self.submit(com, GOOD_REPORT, "s5-submit")
        assert s2["replayed"]
        assert dict(self.w.simulated_balances) == bal
        self.save("demo5-crash-retry", self.w.commission_describe(com))
        print("5. crash/retry: duplicate cost + duplicate submit replayed, "
              "balances unchanged")

        # -- 6. altered terms / payee / costs ---------------------------------
        cid, sha = self.frozen()
        bad_sig = sign_contract_sha(self.alice.root_key, "0" * 64)
        try:
            self.w.commission_authorize_contract(
                "alice", self.alice.token, cid, bad_sig)
            raise AssertionError("altered sha should be refused")
        except WalletError as e:
            assert e.code == "COMMISSION_AUTHORIZATION_INVALID", e.code
        com = self.start(cid, "s6-start")
        self.cost(com, "readings.scan", 3, 10000, "s6-c1")  # claims 10000c
        out = self.submit(com, GOOD_REPORT, "s6-submit")
        stl = out["settlement"]
        assert stl["recorded_cost_cents"] == 15, stl
        assert stl["payee"] == "bob", stl
        self.save("demo6-altered", self.w.commission_describe(com))
        print("6. altered: bad signature refused; inflated claim settled at "
              "15c; payee always the frozen seller")

        # -- balances ---------------------------------------------------------
        self.save("balances", {
            "simulated_balances_cents": dict(self.w.simulated_balances),
            "ledger": self.w.commission_ledger,
            "simulated": True,
            "note": "Simulated funds only. Cost events are not provider invoices.",
        })
        print("evidence written to", EVIDENCE)


if __name__ == "__main__":
    Demo().run()
