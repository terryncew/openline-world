"""RESEARCH-COMMONS-001 tests: receiver-owned package admission, the five
frozen control verdicts (research/COMMONS-BRIEF.md), the mechanical
isolation properties, and correction propagation to the package claim.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.

Every verdict asserted here comes from the real machinery: the EffectGate
evaluation, backend/package_acceptance.py on the pinned bytes,
backend/package_sandbox.py in a separate OS process, and the real
openline-claim-graph impact engine. Nothing is asserted from an animation
of an expected answer.
"""
import copy
import hashlib
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# world first: it pulls in workshop_gate, which inserts openline-wallet/src
# into sys.path at import (same as the server does).
from world import World, WorldRuleError  # noqa: E402

from custody_client import _Client  # noqa: E402

from package_acceptance import (  # noqa: E402
    canonical_package_bytes,
    evaluate_package,
)
from package_sandbox import SANDBOX_LIMITS, run_study  # noqa: E402

from openline_wallet.crypto import (  # noqa: E402
    public_key_hex,
    record_hash,
    sign_record,
    verify_record,
)

FIXTURE_DIR = (Path(__file__).resolve().parent.parent.parent
               / "research" / "commons" / "package")


def _fixture_package() -> dict:
    manifest = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    files = {n: (FIXTURE_DIR / n).read_text(encoding="utf-8")
             for n in ("study.py", "input.csv")}
    return {"manifest": manifest, "files": files}


def _pinned(package: dict) -> str:
    return hashlib.sha256(canonical_package_bytes(package)).hexdigest()


class TestAcceptanceUnit(unittest.TestCase):
    def test_k1_k7_pass_on_fixture(self):
        package = _fixture_package()
        rec = evaluate_package(canonical_package_bytes(package))
        self.assertEqual(rec["verdict"], "ACCEPTED")
        self.assertEqual([r["criterion"] for r in rec["results"]],
                         ["K1", "K2", "K3", "K4", "K5", "K6", "K7"])
        self.assertTrue(all(r["result"] == "pass" for r in rec["results"]))
        self.assertEqual(rec["evaluated_sha256"], _pinned(package))
        self.assertIn("not scientific", rec["scope_note"])

    def _break(self, mutate):
        package = _fixture_package()
        mutate(package)
        return package

    def test_k1_fails_on_tampered_file_hash(self):
        package = self._break(lambda p: p["manifest"]["files"].__setitem__(
            "study.py", {"sha256": "0" * 64}))
        rec = evaluate_package(canonical_package_bytes(package))
        self.assertEqual(rec["verdict"], "REJECTED")
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K1"]["result"], "fail")

    def test_k2_fails_on_empty_study(self):
        package = self._break(lambda p: p["files"].__setitem__("study.py", "\n"))
        # keep K1 consistent so the failure is K2's, not K1's
        package["manifest"]["files"]["study.py"]["sha256"] = hashlib.sha256(
            "\n".encode()).hexdigest()
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K1"]["result"], "pass")
        self.assertEqual(by_c["K2"]["result"], "fail")
        self.assertEqual(rec["verdict"], "REJECTED")

    def test_k3_fails_on_wrong_expected_result(self):
        package = self._break(lambda p: p["manifest"].__setitem__(
            "expected_result", "not the study output\n"))
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K3"]["result"], "fail")
        self.assertEqual(rec["verdict"], "REJECTED")

    def test_k4_fails_on_single_citation(self):
        package = self._break(lambda p: p["manifest"].__setitem__(
            "citations", p["manifest"]["citations"][:1]))
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K4"]["result"], "fail")

    def test_k5_fails_on_empty_limitations(self):
        package = self._break(lambda p: p["manifest"].__setitem__("limitations", "  "))
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K5"]["result"], "fail")

    def test_k6_fails_on_unlabeled_review(self):
        package = self._break(lambda p: p["manifest"].__setitem__(
            "producer_review", "Looks good to me. Ship it."))
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K6"]["result"], "fail")

    def test_k7_fails_on_overclaim_phrase(self):
        package = self._break(lambda p: p["manifest"].__setitem__(
            "claim", p["manifest"]["claim"] + " This is peer reviewed science."))
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K7"]["result"], "fail")

    def test_evaluate_package_is_pure(self):
        package = _fixture_package()
        pbytes = canonical_package_bytes(package)
        self.assertEqual(evaluate_package(pbytes), evaluate_package(pbytes))

    def test_sandbox_limits_recorded(self):
        rec = evaluate_package(canonical_package_bytes(_fixture_package()))
        limits = rec["sandbox"]["limits"]
        self.assertEqual(limits["cpu_seconds"], 10)
        self.assertEqual(limits["memory_bytes"], 256 * 1024 * 1024)
        self.assertEqual(limits["max_file_bytes"], 1024 * 1024)
        self.assertEqual(limits["wall_timeout_seconds"], 15)
        self.assertEqual(limits["stdout_cap_bytes"], 65536)
        self.assertEqual(limits, SANDBOX_LIMITS)
        # The limits bound cost, not access: the record says so.
        self.assertIn("bound cost, not access",
                      limits["execution_policy"])

    def test_untrusted_package_study_never_executes(self):
        # ISOLATION-VERDICT-2026-09-27: arbitrary submitted code is not
        # executed. A well-formed package whose pin is not trusted is
        # refused BEFORE any submitted byte runs: K3 fails with
        # STUDY_EXECUTION_DISABLED, exit_code stays None, executed False.
        package = _fixture_package()
        package["files"]["study.py"] = "import time\ntime.sleep(30)\n"
        package["manifest"]["files"]["study.py"]["sha256"] = hashlib.sha256(
            package["files"]["study.py"].encode()).hexdigest()
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K1"]["result"], "pass")
        self.assertEqual(by_c["K2"]["result"], "pass")
        self.assertEqual(by_c["K3"]["result"], "fail")
        self.assertIn("STUDY_EXECUTION_DISABLED", by_c["K3"]["detail"])
        self.assertEqual(rec["verdict"], "REJECTED")
        sandbox = rec["sandbox"]
        self.assertFalse(sandbox["executed"])
        self.assertIsNone(sandbox["exit_code"])
        self.assertFalse(sandbox["timed_out"])
        self.assertEqual(sandbox["stdout"], "")

    def test_run_study_refuses_without_trusted_pin(self):
        rec = run_study({"study.py": "print('x')\n",
                         "input.csv": "a\n1\n"},
                        package_sha256="0" * 64)
        self.assertFalse(rec["executed"])
        self.assertIn("STUDY_EXECUTION_DISABLED", rec["error"])
        rec2 = run_study({"study.py": "print('x')\n",
                          "input.csv": "a\n1\n"})
        self.assertFalse(rec2["executed"])
        self.assertIn("STUDY_EXECUTION_DISABLED", rec2["error"])

    def test_trusted_fixture_still_reproduces(self):
        # The 9348110 fixture pin is trusted: its study executes and K3
        # passes exactly as demonstrated at 9348110.
        package = _fixture_package()
        rec = evaluate_package(canonical_package_bytes(package))
        by_c = {r["criterion"]: r for r in rec["results"]}
        self.assertEqual(by_c["K3"]["result"], "pass")
        self.assertTrue(rec["sandbox"]["executed"])
        self.assertEqual(rec["sandbox"]["exit_code"], 0)
        self.assertEqual(rec["verdict"], "ACCEPTED")

    def test_study_module_never_imported_into_receiver(self):
        evaluate_package(canonical_package_bytes(_fixture_package()))
        self.assertNotIn("study", sys.modules)
        backend = Path(__file__).resolve().parent.parent
        hits = []
        for path in sorted(backend.glob("*.py")):
            text = path.read_text(encoding="utf-8")
            if re.search(r"^\s*(import\s+study\b|from\s+study\b)", text, re.M):
                hits.append(path.name)
        self.assertEqual(hits, [], f"receiver imports study code: {hits}")


class TestSubmitPackageEndpoint(unittest.TestCase):
    def _world(self):
        import tempfile
        return World(data_root=Path(tempfile.mkdtemp(prefix="commons-test-")))

    def _join(self, world, pid, scopes=("newsroom.review",)):
        client = _Client(pid, scopes=scopes)
        out = client.join(world)
        return client, out

    def _submit(self, world, client, package, declared=None, **kw):
        idem = kw.pop("idempotency_key", None)
        return world.newsroom_submit_package(
            client.pid, client.token,
            {"package": package,
             "package_sha256": declared or _pinned(package),
             **kw},
            client.presentation(world, "newsroom.review"),
            idem)

    def _package_dispatches(self, world):
        return [d for d in world.newsroom_describe()["dispatches"]
                if d.get("research_package")]

    # -- C1: pass ---------------------------------------------------------
    def test_c1_pass_accepted_and_displayed(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        pinned = _pinned(package)
        r = self._submit(world, client, package)
        self.assertEqual(r["decision"], "ALLOWED")
        self.assertEqual(r["acceptance"]["verdict"], "ACCEPTED")
        self.assertTrue(r["binding"]["match"])
        dispatches = self._package_dispatches(world)
        self.assertEqual(len(dispatches), 1)
        d = dispatches[0]
        self.assertEqual(d["package_sha256"], pinned)
        self.assertEqual(d["acceptance"]["evaluated_sha256"], pinned)
        self.assertEqual(d["acceptance"]["verdict"], "ACCEPTED")
        # boundary evidence (d): the stored bytes hash to the pinned hash
        stored_bytes = canonical_package_bytes(d["package"])
        self.assertEqual(hashlib.sha256(stored_bytes).hexdigest(), pinned)
        # the package's claim is registered in the claim graph
        reports = {rep["report_id"]: rep
                   for rep in world.claim_graph.describe()["reports"]}
        self.assertIn(d["claim_report_id"], reports)
        claim_texts = [c["text"] for c in
                       reports[d["claim_report_id"]]["claims"]]
        self.assertIn(package["manifest"]["claim"], claim_texts)

    # -- C2: genuine failure ----------------------------------------------
    def test_c2_genuine_failure_refused_with_criterion_named(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        package["manifest"]["expected_result"] = "wrong output\n"
        r = self._submit(world, client, package)
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("PACKAGE_ACCEPTANCE_FAILED", r["reason_codes"])
        # the failing criterion is named: the test fails otherwise
        self.assertIn("CRITERION_FAILED_K3", r["reason_codes"])
        self.assertEqual(r["acceptance"]["verdict"], "REJECTED")
        self.assertIsNone(r["dispatch_id"])
        self.assertEqual(self._package_dispatches(world), [])

    def test_c2_empty_limitations_refused(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        package["manifest"]["limitations"] = ""
        r = self._submit(world, client, package)
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("PACKAGE_ACCEPTANCE_FAILED", r["reason_codes"])
        self.assertIn("CRITERION_FAILED_K5", r["reason_codes"])
        self.assertEqual(self._package_dispatches(world), [])

    # -- C3: altered artifact ----------------------------------------------
    def test_c3_altered_artifact_refused(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        pinned = _pinned(package)
        # sanity: the unaltered package is accepted
        r0 = self._submit(world, client, package)
        self.assertEqual(r0["decision"], "ALLOWED")
        # flip one byte of the accepted package's bytes, keep the declared
        # hash at the ORIGINAL pinned hash
        raw = bytearray(canonical_package_bytes(package))
        raw[100] ^= 0x01
        altered = json.loads(bytes(raw).decode("utf-8"))
        r = world.newsroom_submit_package(
            client.pid, client.token,
            {"package": altered, "package_sha256": pinned},
            client.presentation(world, "newsroom.review"))
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("ARTIFACT_HASH_MISMATCH", r["reason_codes"])
        self.assertFalse(r["binding"]["match"])
        self.assertIsNone(r["dispatch_id"])
        # the receiver accepts nothing not equal to the pinned hash: only
        # the original dispatch exists
        dispatches = self._package_dispatches(world)
        self.assertEqual(len(dispatches), 1)
        self.assertEqual(dispatches[0]["package_sha256"], pinned)

    def test_c3_declared_hash_must_name_submitted_bytes(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        # a different artifact that would satisfy the study criteria is
        # still refused when the declared hash does not name its bytes
        other = _fixture_package()
        other["manifest"]["title"] = "A different package"
        r = world.newsroom_submit_package(
            client.pid, client.token,
            {"package": other, "package_sha256": _pinned(package)},
            client.presentation(world, "newsroom.review"))
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("ARTIFACT_HASH_MISMATCH", r["reason_codes"])

    # -- C4: producer self-approval -----------------------------------------
    def test_c4_self_approval_authorizes_nothing(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        pinned = _pinned(package)
        attestation = sign_record(
            {"schema": "producer-attestation/v1",
             "statement": "APPROVED",
             "package_sha256": pinned,
             "producer": "external-producer-demo"},
            client.worker_key)
        before_dispatches = len(world.newsroom.dispatches)
        before_reports = len(world.claim_graph.reports)
        r = world.newsroom_submit_package(
            client.pid, client.token,
            {"package": package, "package_sha256": pinned,
             "attestation": attestation},
            client.presentation(world, "newsroom.review"))
        # evaluated on its merits only: the conforming package is accepted
        self.assertEqual(r["decision"], "ALLOWED")
        d = self._package_dispatches(world)[0]
        # the attestation appears in NO record: not the dispatch, not the
        # acceptance record, not the result, not the newsroom describe
        blob = json.dumps({
            "result": r,
            "dispatch": d,
            "newsroom": world.newsroom_describe(),
        }, sort_keys=True, default=str)
        self.assertNotIn("APPROVED", blob)
        self.assertNotIn("producer-attestation", blob)
        self.assertNotIn(attestation["signature"]["value"], blob)
        self.assertNotIn("attestation", blob)
        # no state change attributable to the attestation: one dispatch,
        # one claim report, and the byte binding is the package's own hash
        self.assertEqual(len(world.newsroom.dispatches), before_dispatches + 1)
        self.assertEqual(len(world.claim_graph.reports), before_reports + 1)
        self.assertEqual(d["package_sha256"], pinned)

    def test_c4_attestation_cannot_rescue_a_failing_package(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        package["manifest"]["expected_result"] = "wrong\n"
        attestation = sign_record(
            {"schema": "producer-attestation/v1", "statement": "APPROVED",
             "package_sha256": _pinned(package)}, client.worker_key)
        r = world.newsroom_submit_package(
            client.pid, client.token,
            {"package": package, "package_sha256": _pinned(package),
             "attestation": attestation},
            client.presentation(world, "newsroom.review"))
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("PACKAGE_ACCEPTANCE_FAILED", r["reason_codes"])
        self.assertEqual(self._package_dispatches(world), [])

    # -- C5: unauthorized publication ----------------------------------------
    def test_c5_display_admits_only_accepted_dispatches(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        self._submit(world, client, package)  # accepted
        bad = _fixture_package()
        bad["manifest"]["expected_result"] = "wrong\n"
        r = self._submit(world, client, bad)  # refused
        self.assertEqual(r["decision"], "STOPPED")
        desc = world.newsroom_describe()
        pkg_dispatches = [d for d in desc["dispatches"] if d.get("research_package")]
        # only the accepted package is displayed; the refused one is absent
        self.assertEqual(len(pkg_dispatches), 1)
        self.assertEqual(pkg_dispatches[0]["title"], package["manifest"]["title"])
        for d in pkg_dispatches:
            self.assertEqual(d["acceptance"]["verdict"], "ACCEPTED")
            self.assertEqual(d["package_sha256"],
                             d["acceptance"]["evaluated_sha256"])

    # -- authorization boundaries --------------------------------------------
    def test_revoked_producer_is_stopped_and_records_nothing(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        client.revoke(world)
        r = self._submit(world, client, _fixture_package())
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("MANDATE_REVOKED", r["reason_codes"])
        self.assertEqual(self._package_dispatches(world), [])

    def test_out_of_scope_is_stopped(self):
        world = self._world()
        client, _ = self._join(world, "alice", scopes=("notes.read",))
        r = self._submit(world, client, _fixture_package())
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("ACTION_OUTSIDE_MANDATE", r["reason_codes"])
        self.assertEqual(self._package_dispatches(world), [])

    def test_missing_presentation_raises(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        from openline_wallet.errors import WalletError
        with self.assertRaises(WalletError) as ctx:
            world.newsroom_submit_package(
                client.pid, client.token,
                {"package": package, "package_sha256": _pinned(package)},
                None)
        self.assertEqual(ctx.exception.code, "WORLD_AUTHORIZATION_MISSING")

    def test_idempotent_retry_returns_original(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        first = self._submit(world, client, package, idempotency_key="pkg-key-1")
        second = self._submit(world, client, package, idempotency_key="pkg-key-1")
        self.assertEqual(first["dispatch_id"], second["dispatch_id"])
        self.assertEqual(len(self._package_dispatches(world)), 1)

    def test_resubmit_without_key_dedupes_by_content(self):
        world = self._world()
        client, _ = self._join(world, "producer")
        package = _fixture_package()
        first = self._submit(world, client, package)
        second = self._submit(world, client, package)
        self.assertTrue(second["replayed"])
        self.assertEqual(first["dispatch_id"], second["dispatch_id"])
        self.assertEqual(len(self._package_dispatches(world)), 1)
        # one claim-graph report, not two
        self.assertEqual(
            len([r for r in world.claim_graph.reports
                 if r["report_id"].startswith("package-report:")]), 1)


class TestIsolationProperties(unittest.TestCase):
    """The brief's four mechanical properties, asserted from the records."""

    def _world(self):
        import tempfile
        return World(data_root=Path(tempfile.mkdtemp(prefix="commons-iso-")))

    def _accepted(self):
        world = self._world()
        client = _Client("producer", scopes=("newsroom.review",))
        client.join(world)
        package = _fixture_package()
        pinned = _pinned(package)
        presentation = client.presentation(world, "newsroom.review")
        r = world.newsroom_submit_package(
            client.pid, client.token,
            {"package": package, "package_sha256": pinned}, presentation)
        self.assertEqual(r["decision"], "ALLOWED")
        d = [x for x in world.newsroom_describe()["dispatches"]
             if x.get("research_package")][0]
        return world, client, package, pinned, presentation, r, d

    def test_acceptance_verifies_under_gate_key_never_worker_key(self):
        world, client, package, pinned, _, r, d = self._accepted()
        worker_pub = public_key_hex(client.worker_key)
        acc = d["acceptance"]
        ok_gate, _ = verify_record(acc, expected_public_key=world.gate.public_key)
        self.assertTrue(ok_gate)
        ok_worker, _ = verify_record(acc, expected_public_key=worker_pub)
        self.assertFalse(ok_worker)
        # the worker never signed the acceptance: the signer IS the gate
        self.assertEqual(acc["signature"]["public_key"].lower(),
                         world.gate.public_key.lower())

    def test_gate_receipt_is_gate_signed(self):
        world, client, package, pinned, _, r, d = self._accepted()
        receipt = d["gate_receipt"]
        self.assertEqual(receipt["decision"], "ALLOWED")
        ok, why = verify_record(receipt, expected_public_key=world.gate.public_key)
        self.assertTrue(ok, why)

    def test_presentation_is_worker_signed_and_bound_to_package(self):
        world, client, package, pinned, _, r, d = self._accepted()
        worker_pub = public_key_hex(client.worker_key)
        pres = d["presentation"]
        ok, why = verify_record(pres, expected_public_key=worker_pub)
        self.assertTrue(ok, why)
        # the gate receipt commits to this exact presentation...
        self.assertEqual(d["gate_receipt"]["presentation_hash"],
                         record_hash(pres))
        # ...and the run's records bind that presentation to the pinned hash
        self.assertEqual(r["presentation_binding"]["presentation_hash"],
                         record_hash(pres))
        self.assertEqual(r["presentation_binding"]["package_sha256"], pinned)

    def test_boundary_evidence_all_names_pinned_hash(self):
        world, client, package, pinned, _, r, d = self._accepted()
        # (a) presentation bound to package_sha256 (see previous test)
        # (b) receiver-signed gate receipt for the submission action
        self.assertEqual(d["gate_receipt"]["action"], "newsroom.review")
        # (c) evaluation record naming pinned package_sha256 + sandbox limits
        self.assertEqual(d["acceptance"]["evaluated_sha256"], pinned)
        self.assertEqual(d["acceptance"]["sandbox"]["limits"], SANDBOX_LIMITS)
        # (d) stored dispatch whose package_sha256 equals the pinned hash
        self.assertEqual(d["package_sha256"], pinned)
        self.assertEqual(
            hashlib.sha256(canonical_package_bytes(d["package"])).hexdigest(),
            pinned)


class TestCorrectionPropagation(unittest.TestCase):
    def _world(self):
        import tempfile
        return World(data_root=Path(tempfile.mkdtemp(prefix="commons-corr-")))

    def test_correction_propagates_to_package_claim_control_unaffected(self):
        world = self._world()
        producer = _Client("producer", scopes=("newsroom.review",))
        producer.join(world)
        package = _fixture_package()
        r = world.newsroom_submit_package(
            producer.pid, producer.token,
            {"package": package, "package_sha256": _pinned(package)},
            producer.presentation(world, "newsroom.review"))
        self.assertEqual(r["decision"], "ALLOWED")
        report_id = r["claim_report_id"]
        d_before = [x for x in world.newsroom_describe()["dispatches"]
                    if x.get("research_package")][0]
        bytes_before = canonical_package_bytes(d_before["package"])
        acceptance_before = json.dumps(d_before["acceptance"], sort_keys=True)

        # the authorized correction goes through the existing gated path
        owner = _Client("owner", scopes=("claimgraph.correct",))
        owner.join(world)
        cr = world.claimgraph_correct(
            owner.pid, owner.token, "CORRECTED",
            owner.presentation(world, "claimgraph.correct"))
        self.assertEqual(cr["decision"], "ALLOWED")

        desc = world.claim_graph.describe()
        by_report = {rep["report_id"]: rep for rep in desc["reports"]}
        pkg_claims = {c["text"]: c for c in by_report[report_id]["claims"]}
        # The package's INFERENCE claim leans on the harbor log through a
        # HARD supports edge -- exactly like Report A's inference claim --
        # so the engine quarantines it (proposes review; not a verdict on
        # truth) with ALL_ADMITTED_SUPPORT_PATHS_LOST. AFFECTED_UNRESOLVED
        # is the engine's term for advisory-edge exposure only.
        pkg_standing = pkg_claims[package["manifest"]["claim"]]["standing"]
        self.assertIsNotNone(pkg_standing)
        self.assertEqual(pkg_standing["classification"], "QUARANTINE")
        self.assertEqual(pkg_standing["reason"], "ALL_ADMITTED_SUPPORT_PATHS_LOST")
        quote_standing = pkg_claims["The tide gauge read 2.4 m at 06:35."]["standing"]
        self.assertEqual(quote_standing["classification"], "QUARANTINE")
        self.assertEqual(quote_standing["reason"], "SOURCE_BASIS_LOST")
        # the independent control (Report B, memo-only) stays UNAFFECTED
        for claim in by_report["report-tide-memo"]["claims"]:
            standing = claim["standing"]
            self.assertIsNotNone(standing)
            self.assertEqual(standing["classification"], "UNAFFECTED",
                             claim["text"])
        # the original package bytes and acceptance record are byte-identical
        d_after = [x for x in world.newsroom_describe()["dispatches"]
                   if x.get("research_package")][0]
        self.assertEqual(canonical_package_bytes(d_after["package"]), bytes_before)
        self.assertEqual(json.dumps(d_after["acceptance"], sort_keys=True),
                         acceptance_before)

    def test_package_report_receipt_verifies(self):
        world = self._world()
        producer = _Client("producer", scopes=("newsroom.review",))
        producer.join(world)
        package = _fixture_package()
        r = world.newsroom_submit_package(
            producer.pid, producer.token,
            {"package": package, "package_sha256": _pinned(package)},
            producer.presentation(world, "newsroom.review"))
        checks = world.claim_graph.verify_all()
        self.assertTrue(all(c["valid"] for c in checks["receipts"]))


if __name__ == "__main__":
    unittest.main()
