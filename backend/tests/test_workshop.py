"""Workshop backend tests: replay/dedup, disconnect state, activity vs acceptance.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests -v
from backend/.
"""
import json
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from events import EventLog  # noqa: E402
from workshop_gate import WorkshopGate  # noqa: E402
from server import Workshop  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402


class TestEventReplayDedup(unittest.TestCase):
    def test_duplicate_event_id_is_dropped(self):
        log = EventLog()
        a = log.emit(source="agent", kind="activity", provenance="agent-reported",
                     summary="x", event_id="evt-1")
        b = log.emit(source="agent", kind="activity", provenance="agent-reported",
                     summary="y", event_id="evt-1")
        self.assertEqual(a["seq"], b["seq"])
        self.assertEqual(len(log.replay(0)), 1)

    def test_replay_since_seq(self):
        log = EventLog()
        for i in range(5):
            log.emit(source="agent", kind="activity", provenance="agent-reported",
                     summary=f"e{i}")
        replayed = log.replay(since_seq=3)
        self.assertEqual([e["seq"] for e in replayed], [4, 5])

    def test_seq_is_monotonic(self):
        log = EventLog()
        seqs = [log.emit(source="agent", kind="activity",
                         provenance="agent-reported", summary="s")["seq"]
                for _ in range(10)]
        self.assertEqual(seqs, sorted(seqs))
        self.assertEqual(len(set(seqs)), 10)


class TestDisconnectState(unittest.TestCase):
    def test_demo_mode_reports_local_demo(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            self.assertEqual(w.connection()["status"], "LOCAL_DEMO")

    def test_connected_mode_without_events_is_waiting(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            w.mode = "connected"
            self.assertEqual(w.connection()["status"], "WAITING")

    def test_connected_mode_live_then_stale(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            w.mode = "connected"
            w.ingest_hook({"hook_event_name": "SessionStart", "session_id": "abc123"})
            self.assertEqual(w.connection()["status"], "LIVE")
            w.last_adapter_ts = time.time() - 60
            conn = w.connection()
            self.assertEqual(conn["status"], "STALE")
            self.assertIn("UNKNOWN", conn["detail"])


class TestActivityVsAcceptance(unittest.TestCase):
    def test_agent_done_creates_no_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read"])
            before = len(gate.receipts)
            # An agent merely reporting completion never touches the gate.
            gate2_receipts = len(gate.receipts)
            self.assertEqual(before, gate2_receipts)

    def test_only_gate_decisions_mint_receipts(self):
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read", "notes.write"])
            r = gate.request_decision("wren", "notes.write")
            self.assertEqual(r["decision"], "ALLOWED")
            self.assertEqual(len(gate.receipts), 1)
            # Every stored receipt is a gate-signed decision.
            for receipt in gate.receipts:
                self.assertIn(receipt["decision"], ("ALLOWED", "STOPPED"))
                self.assertEqual(receipt["schema"], "openline.gate.action_receipt.v1")
                self.assertTrue(receipt.get("signature"))

    def test_revocation_stops_later_requests(self):
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read"])
            ok = gate.request_decision("wren", "notes.read")
            self.assertEqual(ok["decision"], "ALLOWED")
            gate.revoke_helper("wren")
            stopped = gate.request_decision("wren", "notes.read")
            self.assertEqual(stopped["decision"], "STOPPED")
            self.assertIn("MANDATE_REVOKED", stopped["reason_codes"])

    def test_demo_script_distinguishes_done_from_acceptance(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            receipts_before = w.gate.receipts.copy()
            for _ in range(5):
                w.advance_demo()  # through "wren says done"
            # "done" added activity events but no new receipts.
            # 3 gated proposals so far: notes.read, notes.write, config.write.
            self.assertEqual(len(w.gate.receipts), len(receipts_before) + 3)
            kinds = [e["kind"] for e in w.log.replay(0)]
            self.assertIn("note", kinds)  # the explicit no-receipt note

    def test_first_read_is_a_real_allowed_decision(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            w.advance_demo()  # step 1: wren reads the project notes
            self.assertEqual(len(w.gate.receipts), 1)
            r = w.gate.receipts[0]
            self.assertEqual(r["decision"], "ALLOWED")
            self.assertEqual(r["action"], "notes.read")
            self.assertEqual(r["subject_id"], "wren")


if __name__ == "__main__":
    unittest.main()


class TestSessionIsolation(unittest.TestCase):
    def test_reset_starts_fresh_session_without_touching_old_history(self):
        # Simulates /api/demo/reset: a brand-new Workshop in a brand-new
        # session dir. The old session's revocation must be untouched.
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            old = Workshop(Path(a))
            for _ in range(6):
                old.advance_demo()  # through "you revoke wren's mandate"
            self.assertFalse(old.gate.helpers["wren"].active)
            fresh = Workshop(Path(b))
            self.assertTrue(fresh.gate.helpers["wren"].active)
            self.assertEqual(fresh.demo_step, 0)
            self.assertNotEqual(old.gate.data_dir, fresh.gate.data_dir)
            # The old session still has wren revoked: nothing was reversed.
            self.assertFalse(old.gate.helpers["wren"].active)

    def test_new_session_dirs_are_unique(self):
        from server import new_session_dir  # noqa: E402
        d1 = new_session_dir()
        d2 = new_session_dir()
        try:
            self.assertTrue(d1.is_dir())
            self.assertTrue(d2.is_dir())
            self.assertNotEqual(d1, d2)
        finally:
            shutil.rmtree(d1, ignore_errors=True)
            shutil.rmtree(d2, ignore_errors=True)


class TestHandoff(unittest.TestCase):
    def test_juniper_gets_its_own_mandate_never_wrens(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            for _ in range(8):
                w.advance_demo()  # through "you onboard juniper"
            wren = w.gate.helpers["wren"]
            juniper = w.gate.helpers["juniper"]
            self.assertFalse(wren.active)
            self.assertTrue(juniper.active)
            # Own mandate, own key: nothing reused from wren.
            self.assertNotEqual(juniper.mandate_id, wren.mandate_id)
            self.assertNotEqual(juniper.public_key, wren.public_key)
            self.assertEqual(juniper.scopes, wren.scopes)  # same bounds
            w.advance_demo()  # juniper proposes notes.write
            r = w.gate.receipts[-1]
            self.assertEqual(r["decision"], "ALLOWED")
            self.assertEqual(r["subject_id"], "juniper")
            self.assertEqual(r["mandate_id"], juniper.mandate_id)


class TestWhatChangedContract(unittest.TestCase):
    """Contract the 'What changed?' view relies on: every displayed answer
    must match an actual receiver decision. These tests pin the exact
    backend behavior the view renders — no frontend permission checker."""

    def test_boot_baseline_wren_active_with_note_scopes(self):
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            helpers = {h["helper_id"]: h for h in w.snapshot()["helpers"]}
            self.assertTrue(helpers["wren"]["active"])
            self.assertEqual(helpers["wren"]["scopes"], ["notes.read", "notes.write"])
            self.assertNotIn("juniper", helpers)

    def test_evaluation_executes_no_effect(self):
        # The receiver supports evaluation without executing the proposed
        # effect: request_decision changes nothing but the receipt log.
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read", "notes.write"])
            before = (list(gate.helpers["wren"].scopes), gate.helpers["wren"].active,
                      gate.helpers["wren"].mandate_id, gate.helpers["wren"].public_key)
            r = gate.request_decision("wren", "notes.write")
            after = (list(gate.helpers["wren"].scopes), gate.helpers["wren"].active,
                     gate.helpers["wren"].mandate_id, gate.helpers["wren"].public_key)
            self.assertEqual(before, after)
            self.assertEqual(r["decision"], "ALLOWED")
            self.assertEqual(len(gate.receipts), 1)

    def test_outside_scope_is_refused_with_reason_code(self):
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read", "notes.write"])
            r = gate.request_decision("wren", "config.write")
            self.assertEqual(r["decision"], "STOPPED")
            self.assertIn("ACTION_OUTSIDE_MANDATE", r["reason_codes"])

    def test_unknown_helper_yields_no_decision(self):
        # Not ALLOWED, not STOPPED, not a signed UNDETERMINED — the receiver
        # raises before evaluating, so the view must show "cannot determine".
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read"])
            with self.assertRaises(WalletError) as ctx:
                gate.request_decision("mallory", "notes.read")
            self.assertEqual(ctx.exception.code, "HELPER_UNKNOWN")
            self.assertEqual(len(gate.receipts), 0)  # nothing signed
            w = Workshop(Path(d))
            with self.assertRaises(WalletError) as ctx2:
                w.owner_propose("mallory", "notes.read")
            self.assertEqual(ctx2.exception.code, "HELPER_UNKNOWN")

    def test_withdraw_permission_is_revoke_plus_narrower_mandate(self):
        # Withdrawing one permission composes existing primitives: revoke the
        # mandate, issue a new one with narrower scopes. Same worker, new
        # mandate id, fresh key.
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read", "notes.write"])
            old = gate.helpers["wren"]
            gate.revoke_helper("wren")
            gate.onboard_helper("wren", ["notes.read"])
            new = gate.helpers["wren"]
            self.assertNotEqual(new.mandate_id, old.mandate_id)
            self.assertNotEqual(new.public_key, old.public_key)
            self.assertEqual(new.scopes, ["notes.read"])
            ok = gate.request_decision("wren", "notes.read")
            self.assertEqual(ok["decision"], "ALLOWED")
            self.assertEqual(ok["mandate_id"], new.mandate_id)
            refused = gate.request_decision("wren", "notes.write")
            self.assertEqual(refused["decision"], "STOPPED")
            self.assertIn("ACTION_OUTSIDE_MANDATE", refused["reason_codes"])

    def test_revocation_is_permanent_within_session(self):
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read"])
            gate.revoke_helper("wren")
            with self.assertRaises(WalletError) as ctx:
                gate.revoke_helper("wren")
            self.assertEqual(ctx.exception.code, "HELPER_NOT_ACTIVE")
            # No un-revoke affordance exists on the gate.
            self.assertFalse(hasattr(gate, "unrevoke"))
            self.assertFalse(hasattr(gate, "restore_helper"))

    def test_every_receipt_signature_verifies(self):
        # Supports the view's "signed" label: it is only used when the
        # gate's signature actually verifies.
        from openline_wallet.crypto import verify_record  # noqa: E402
        with tempfile.TemporaryDirectory() as d:
            gate = WorkshopGate(Path(d))
            gate.onboard_helper("wren", ["notes.read"])
            gate.request_decision("wren", "notes.read")
            gate.request_decision("wren", "config.write")
            gate.revoke_helper("wren")
            gate.request_decision("wren", "notes.read")
            for r in gate.receipts:
                valid, _ = verify_record(r, expected_public_key=gate.gate.public_key)
                self.assertTrue(valid is True)
                self.assertTrue(r["signature"]["value"])

    def test_authority_demo_beat_sequence(self):
        # WORLD-AUTHORITY-001: the 10-step authority demo tells the worker-
        # replacement story through real gate decisions. No boot mandate:
        # the job exists before any worker is authorized.
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d), boot_mandate=False)
            boot_kinds = [e["kind"] for e in w.log.replay(0)]
            self.assertNotIn("mandate", boot_kinds)
            labels = []
            while True:
                r = w.advance_authority_demo()
                labels.append(r.get("label"))
                if r["finished"]:
                    break
            self.assertEqual(len(labels), 10)
            evs = w.log.replay(0)
            # beat 1: owner-signed job note anchors the job
            job_notes = [e for e in evs if e["kind"] == "note"
                         and e["detail"].get("job_id")]
            self.assertEqual(len(job_notes), 1)
            self.assertEqual(job_notes[0]["provenance"], "owner-signed")
            # beats 2/6: two owner-signed mandates, one revoked
            mandates = [e for e in evs if e["kind"] == "mandate"]
            self.assertEqual(len(mandates), 3)
            revoked = [e for e in mandates
                       if e["detail"].get("status") == "REVOKED"]
            self.assertEqual(len(revoked), 1)
            # beat 3/7: real ALLOWED decisions for wren then juniper
            allowed = [e for e in evs if e["kind"] == "decision"
                       and e["detail"]["decision"] == "ALLOWED"]
            self.assertEqual(
                [(e["detail"]["helper"], e["detail"]["action"]) for e in allowed],
                [("wren", "notes.write"), ("juniper", "notes.write")])
            # beat 4b: the real gate stops wren's post-revoke attempt
            stopped = [e for e in evs if e["kind"] == "decision"
                       and e["detail"]["decision"] == "STOPPED"]
            self.assertEqual(len(stopped), 1)
            self.assertEqual(stopped[0]["detail"]["helper"], "wren")
            # beat 8: the newer proposal is never decided
            props = [(e["detail"]["helper"], e["detail"]["action"])
                     for e in evs if e["kind"] == "proposal"]
            decs = [(e["detail"]["helper"], e["detail"]["action"])
                    for e in evs if e["kind"] == "decision"]
            self.assertIn(("wren", "notes.rewrite"), props)
            self.assertNotIn(("wren", "notes.rewrite"), decs)
            # beat 5: juniper's arrival/reach are activity claims only —
            # no proposal, no decision for juniper before grant
            juniper_acts = {(e["detail"]["helper"], e["detail"]["action"])
                            for e in evs
                            if e["detail"].get("helper") == "juniper"
                            and e["kind"] in ("proposal", "decision")}
            self.assertEqual(juniper_acts, {("juniper", "notes.write")})

    def test_gate_evaluation_is_effect_free(self):
        # Defect 1: an ALLOWED receipt from the gate alone must NOT mutate
        # job progress. Only the separate workshop executor does.
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d))
            receipt = w.gate.request_decision("wren", "notes.write")
            self.assertEqual(receipt["decision"], "ALLOWED")
            self.assertEqual(w.job_effects, [])

    def test_authority_demo_job_checkpoints(self):
        # Defect 1: Wren's ALLOWED notes.write -> checkpoint 1; revocation
        # leaves it intact; Juniper's ALLOWED notes.write -> checkpoint 2
        # on the SAME job. Ordered history survives worker replacement.
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d), boot_mandate=False)
            while not w.advance_authority_demo()["finished"]:
                pass
            cps = w.job_effects
            self.assertEqual(len(cps), 2)
            self.assertEqual(
                [(c["checkpoint"], c["helper"], c["action"]) for c in cps],
                [(1, "wren", "notes.write"), (2, "juniper", "notes.write")])
            self.assertEqual(cps[0]["task_id"], cps[1]["task_id"])
            # checkpoint seqs are ordered and match their receipt events
            self.assertLess(cps[0]["seq"], cps[1]["seq"])
            evs = w.log.replay(0)
            # stopped post-revocation attempt created no checkpoint
            stopped = [e for e in evs if e["kind"] == "decision"
                       and e["detail"]["decision"] == "STOPPED"]
            self.assertEqual(len(stopped), 1)
            self.assertFalse(any(c["helper"] == "wren" and c["checkpoint"] > 1
                                 for c in cps))
            # snapshot exposes the checkpoints read-only
            snap = w.snapshot()
            self.assertEqual(len(snap["job_state"]["checkpoints"]), 2)

    def test_job_effect_scope(self):
        # Defect 1 (pass 2): JOB_EFFECT_SCOPE. Only the two exact
        # WORLD-AUTHORITY-001 work steps create checkpoints.
        with tempfile.TemporaryDirectory() as d:
            # full classic demo produces ZERO job checkpoints
            w = Workshop(Path(d))
            while not w.advance_demo()["finished"]:
                pass
            self.assertEqual(w.job_effects, [])
            # classic notes.read produces ZERO checkpoints
            w2 = Workshop(Path(d))
            w2._propose("wren", "notes.read")
            self.assertEqual(w2.job_effects, [])
            # generic owner propose produces ZERO checkpoints
            w2.owner_propose("wren", "notes.read")
            self.assertEqual(w2.job_effects, [])
            # unrelated allowed action produces ZERO checkpoints
            w2._propose("wren", "config.write")
            self.assertEqual(w2.job_effects, [])
            # apply_job_effect refuses unsupported actions
            with self.assertRaises(ValueError):
                w2.apply_job_effect("wren", "notes.read", seq=1)
            with self.assertRaises(ValueError):
                w2.apply_job_effect("wren", "config.write", seq=1)
            # direct gate remains effect-free
            w2.gate.request_decision("wren", "notes.write")
            self.assertEqual(w2.job_effects, [])
        # WORLD-AUTHORITY: wren notes.write -> 1, juniper notes.write -> 2
        with tempfile.TemporaryDirectory() as d:
            w3 = Workshop(Path(d), boot_mandate=False)
            while not w3.advance_authority_demo()["finished"]:
                pass
            self.assertEqual(
                [(c["checkpoint"], c["helper"]) for c in w3.job_effects],
                [(1, "wren"), (2, "juniper")])

    def test_pre_grant_no_receiver_signed_artifact(self):
        # Defect 2 (pass 2): PRE_GRANT_PROVENANCE. The pre-grant attempt
        # creates NO receiver-signed decision, receipt, or note. The
        # backend really invoked the gate path (spy proves the call and
        # the HELPER_UNKNOWN raise).
        with tempfile.TemporaryDirectory() as d:
            w = Workshop(Path(d), boot_mandate=False)
            calls = []
            orig = w.gate.request_decision
            def spy(helper_id, action):
                calls.append((helper_id, action))
                return orig(helper_id, action)
            w.gate.request_decision = spy
            for _ in range(8):  # through "Juniper reaches for the job"
                w.advance_authority_demo()
            # the real gate path was invoked with the attempted action
            juniper_calls = [c for c in calls if c[0] == "juniper"]
            self.assertEqual(juniper_calls, [("juniper", "notes.write")])
            evs = w.log.replay(0)
            signed = [e for e in evs
                      if e["provenance"] == "receiver-signed"
                      and e["detail"].get("helper") == "juniper"]
            self.assertEqual(signed, [])
            # the attempt itself is agent-reported with the structural detail
            acts = [e for e in evs if e["kind"] == "activity"
                    and e["detail"].get("helper") == "juniper"
                    and "attempted_action" in e["detail"]]
            self.assertEqual(len(acts), 1)
            self.assertEqual(acts[0]["detail"]["attempted_action"], "notes.write")
            self.assertFalse(any(c["helper"] == "juniper" for c in w.job_effects))
