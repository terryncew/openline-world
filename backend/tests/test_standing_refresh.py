"""Standing-refresh tests: a still-authorized participant can prove possession
of its existing key and refresh after inactivity, without rejoining.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests -v
from backend/.

The repair under test: World.standing_refresh (possession-proof via the
bearer token, authority re-checked at the commit point under self._lock).
What it must never do: extend mandate expiry, widen scope, revive revoked
or retired authority, or weaken the freshness check itself.
"""
import sys
import tempfile
import threading
import time
import unittest
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from custody_client import _Client, _expires  # noqa: E402
from openline_wallet.clock import utc_now  # noqa: E402
from openline_wallet.crypto import public_key_hex  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402
from transport import LocalTransport  # noqa: E402
from world import (  # noqa: E402
    World,
    WorldAuthError,
    MAX_STANDING_AGE_SECONDS,
)


def _fresh_world():
    return World(data_root=Path(tempfile.mkdtemp(prefix="world-refresh-")),
                 transport=LocalTransport())


def _join(world, pid, scopes=("notes.read", "notes.write")):
    client = _Client(pid, scopes=scopes)
    out = client.join(world)
    return client, out


def _stale(world, pid, seconds_old=400):
    session = world.sessions[pid]
    session.standing_checked_at = time.time() - seconds_old
    return session


def _code_of(fn):
    try:
        fn()
    except WorldAuthError as e:
        return ("auth", str(e))
    except WalletError as e:
        return ("wallet", e.code if hasattr(e, "code") else str(e))
    return ("ok", None)


class StandingRefreshTests(unittest.TestCase):
    def test_freshness_check_untouched(self):
        w = _fresh_world()
        _join(w, "p1")
        self.assertEqual(MAX_STANDING_AGE_SECONDS, 300)
        session = _stale(w, "p1")
        with self.assertRaises(WalletError) as ctx:
            w._require_fresh_standing(session)
        self.assertEqual(ctx.exception.code, "HOLD_STANDING_UNKNOWN")

    def test_freshness_boundary_300s(self):
        # 299s idle: still fresh, gated actions pass.
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = _stale(w, "p1", 299)
        w._require_fresh_standing(session)  # no raise
        # 301s idle: held, refresh fixes it.
        _stale(w, "p1", 301)
        with self.assertRaises(WalletError) as ctx:
            w._require_fresh_standing(session)
        self.assertEqual(ctx.exception.code, "HOLD_STANDING_UNKNOWN")
        out = w.standing_refresh("p1", client.token)
        self.assertTrue(out["refreshed"])
        w._require_fresh_standing(session)  # no raise

    def test_refresh_after_idle_succeeds_and_acts(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = _stale(w, "p1", 400)
        # Gated action holds while stale...
        with self.assertRaises(WalletError):
            w._require_fresh_standing(session)
        # ...refresh fixes it...
        out = w.standing_refresh("p1", client.token)
        self.assertTrue(out["refreshed"])
        self.assertEqual(out["participant_id"], "p1")
        self.assertEqual(out["mandate_id"], session.mandate_id)
        self.assertEqual(sorted(out["scopes"]), sorted(session.mandate_scopes))
        # ...and the session acts normally afterward.
        w._require_fresh_standing(session)  # no raise
        w._assert_standing(session)  # no raise

    def test_refresh_preserves_identity_history(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        before = (session.participant_id, session.mandate_id,
                  tuple(session.mandate_scopes), session.owner_principal_id,
                  session.agent_id, list(session.receipts))
        old_checked = session.standing_checked_at
        _stale(w, "p1", 500)
        time.sleep(0.01)
        w.standing_refresh("p1", client.token)
        after = (session.participant_id, session.mandate_id,
                 tuple(session.mandate_scopes), session.owner_principal_id,
                 session.agent_id, list(session.receipts))
        self.assertEqual(before, after)
        self.assertGreater(session.standing_checked_at, old_checked)

    def test_wrong_key_refresh_refused(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        _stale(w, "p1", 400)
        kind, _ = _code_of(lambda: w.standing_refresh("p1", "wrong-token"))
        self.assertEqual(kind, "auth")

    def test_replayed_refresh_after_revocation_refused(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        _stale(w, "p1", 400)
        # Capture the exact refresh call, then revoke.
        captured = ("p1", client.token)
        client.wallet.revoke(client.mandate_id)
        w.authority_refresh("p1", client.token, client.wallet.export_bundle())
        self.assertTrue(w.sessions["p1"].revoked)
        # Replay the captured refresh: refused, revocation stands.
        kind, code = _code_of(lambda: w.standing_refresh(*captured))
        self.assertEqual(kind, "wallet")
        self.assertEqual(code, "JOIN_STANDING_NOT_CURRENT")
        self.assertTrue(w.sessions["p1"].revoked)
        # And it stays refused.
        kind2, _ = _code_of(lambda: w.standing_refresh(*captured))
        self.assertEqual(kind2, "wallet")

    def test_replayed_refresh_after_retire_refused(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        _stale(w, "p1", 400)
        captured = ("p1", client.token)
        w.retire_participant("p1", retired_by="test")
        kind, _ = _code_of(lambda: w.standing_refresh(*captured))
        self.assertEqual(kind, "auth")  # retired session: auth mismatch

    def test_expired_mandate_refused_no_extension(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        # Replace the live mandate with a 2-second one, then let it lapse.
        client.wallet.revoke(client.mandate_id)
        client.wallet.grant(
            subject_id=client.agent_id,
            subject_public_key=public_key_hex(client.worker_key),
            scopes=client.scopes, expires_at=_expires(seconds=2))
        w.authority_refresh("p1", client.token, client.wallet.export_bundle())
        session = w.sessions["p1"]
        self.assertFalse(session.revoked)
        new_mandate_id = session.mandate_id
        time.sleep(2.5)
        _stale(w, "p1", 400)
        kind, code = _code_of(lambda: w.standing_refresh("p1", client.token))
        self.assertEqual(kind, "wallet")
        self.assertEqual(code, "JOIN_STANDING_NOT_CURRENT")
        # Expiry was not extended: still the same lapsed mandate, and the
        # session is marked revoked rather than resurrected.
        self.assertTrue(session.revoked)
        self.assertEqual(session.mandate_id, new_mandate_id)
        self.assertIsNone(w._active_mandate(session))

    def test_restart_preserves_refresh_outcomes(self):
        root = Path(tempfile.mkdtemp(prefix="world-refresh-restart-"))
        w = World(data_root=root, transport=LocalTransport())
        client, _ = _join(w, "p1")
        _stale(w, "p1", 400)
        w.standing_refresh("p1", client.token)
        client.wallet.revoke(client.mandate_id)
        w.authority_refresh("p1", client.token, client.wallet.export_bundle())
        w2 = World(data_root=root, transport=LocalTransport())
        # Revoked stays revoked across restart; refresh still refused.
        self.assertTrue(w2.sessions["p1"].revoked)
        kind, _ = _code_of(lambda: w2.standing_refresh("p1", client.token))
        self.assertEqual(kind, "wallet")
        # A live session's fresh standing survives restart too.
        c2, _ = _join(w2, "p2")
        w2.standing_refresh("p2", c2.token)
        checked = w2.sessions["p2"].standing_checked_at
        w3 = World(data_root=root, transport=LocalTransport())
        self.assertAlmostEqual(
            w3.sessions["p2"].standing_checked_at, checked, places=2)
        w3._require_fresh_standing(w3.sessions["p2"])  # no raise

    def test_race_revocation_during_inflight_refresh_wins(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        _stale(w, "p1", 400)
        entered = threading.Event()
        proceed = threading.Event()
        orig = World._mandate_evidence

        def slow(world_self, session):
            entered.set()
            assert proceed.wait(30), "proceed never set"
            return orig(world_self, session)

        World._mandate_evidence = slow
        errors = []
        try:
            t = threading.Thread(
                target=lambda: errors.append(
                    _code_of(lambda: w.standing_refresh("p1", client.token))))
            t.start()
            self.assertTrue(entered.wait(10))
            # Revocation is admitted WHILE the refresh is in flight.
            client.wallet.revoke(client.mandate_id)
            w.authority_refresh("p1", client.token,
                                client.wallet.export_bundle())
            proceed.set()
            t.join(30)
            self.assertFalse(t.is_alive())
        finally:
            World._mandate_evidence = orig
        kind, code = errors[0]
        # The in-flight refresh did not revive anything: refused, revoked.
        self.assertEqual(kind, "wallet")
        self.assertEqual(code, "JOIN_STANDING_NOT_CURRENT")
        self.assertTrue(w.sessions["p1"].revoked)

    def test_race_refresh_before_revocation_revocation_still_wins(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        _stale(w, "p1", 400)
        out = w.standing_refresh("p1", client.token)
        self.assertTrue(out["refreshed"])
        client.wallet.revoke(client.mandate_id)
        w.authority_refresh("p1", client.token, client.wallet.export_bundle())
        # Revocation after a successful refresh: session dead, refresh
        # refused from here on.
        kind, _ = _code_of(lambda: w.standing_refresh("p1", client.token))
        self.assertEqual(kind, "wallet")
        self.assertTrue(w.sessions["p1"].revoked)


class StaleBundleTests(unittest.TestCase):
    """WORLD-REPAIR-002: an expired admitted bundle is STALE evidence, not a
    dead mandate. standing_refresh must refuse with STANDING_BUNDLE_STALE and
    mutate nothing -- expiry alone never writes a revocation. Recovery is via
    authority_refresh with a fresh owner-signed bundle, checked against
    current authority: it cannot revive an owner-revoked mandate."""

    def test_expired_bundle_refuses_stale_no_mutation(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=601))
        checked_before = session.standing_checked_at
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual((kind, code), ("wallet", "STANDING_BUNDLE_STALE"))
        self.assertFalse(session.revoked)  # never revoked
        self.assertEqual(session.standing_checked_at, checked_before)

    def test_stale_refusal_leaves_snapshot_byte_identical(self):
        import hashlib
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=601))
        w.save()
        before = hashlib.sha256(
            w._snapshot_path().read_bytes()).hexdigest()
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual(code, "STANDING_BUNDLE_STALE")
        after = hashlib.sha256(
            w._snapshot_path().read_bytes()).hexdigest()
        self.assertEqual(before, after)  # no save happened

    def test_bundle_ttl_boundary(self):
        # 599s-old bundle still verifies: refresh succeeds.
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=599))
        _stale(w, "p1", 400)
        out = w.standing_refresh("p1", client.token)
        self.assertTrue(out["refreshed"])
        # 601s-old bundle is expired: STALE refusal.
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=601))
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual((kind, code), ("wallet", "STANDING_BUNDLE_STALE"))

    def test_combined_stale_standing_and_stale_bundle(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=601))
        _stale(w, "p1", 400)
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual((kind, code), ("wallet", "STANDING_BUNDLE_STALE"))
        self.assertFalse(session.revoked)

    def test_stale_recovery_via_fresh_evidence_no_rejoin(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        before = (session.participant_id, session.mandate_id,
                  tuple(session.mandate_scopes), session.owner_principal_id,
                  session.agent_id)
        # Bundle expired while idle: the designed recovery path destroyed
        # the session before WORLD-REPAIR-002. Now it refuses as stale...
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=601))
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual(code, "STANDING_BUNDLE_STALE")
        self.assertFalse(session.revoked)
        # ...fresh evidence over the authenticated authority_refresh path...
        refresh_out = w.authority_refresh(
            "p1", client.token, client.wallet.export_bundle())
        self.assertFalse(refresh_out["revoked"])
        self.assertFalse(session.revoked)
        # ...and the same session refreshes and acts, no rejoin.
        out = w.standing_refresh("p1", client.token)
        self.assertTrue(out["refreshed"])
        after = (session.participant_id, session.mandate_id,
                 tuple(session.mandate_scopes), session.owner_principal_id,
                 session.agent_id)
        self.assertEqual(before, after)
        w._require_fresh_standing(session)  # no raise
        w._assert_standing(session)  # no raise

    def test_fresh_evidence_cannot_revive_revoked_mandate(self):
        w = _fresh_world()
        client, _ = _join(w, "p1")
        session = w.sessions["p1"]
        # Bundle expired while idle...
        session.authority_bundle = client.wallet.export_bundle(
            now=utc_now() - timedelta(seconds=601))
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual(code, "STANDING_BUNDLE_STALE")
        # ...and the owner revoked while the participant was away. The
        # fresh bundle now shows REVOKED: it must mark revoked, not
        # revive.
        client.wallet.revoke(client.mandate_id)
        refresh_out = w.authority_refresh(
            "p1", client.token, client.wallet.export_bundle())
        self.assertTrue(refresh_out["revoked"])
        self.assertTrue(session.revoked)
        kind, code = _code_of(
            lambda: w.standing_refresh("p1", client.token))
        self.assertEqual(code, "JOIN_STANDING_NOT_CURRENT")


if __name__ == "__main__":
    unittest.main()
