"""Browser-owner custody integration tests.

The town UI now speaks the same custody protocol the headless clients proved
(24f664d): the browser holds each participant's owner + worker keys in its own
IndexedDB; the server holds only its receiver key. These tests pin the
browser's exact contract server-side and cover this lane's negative checks:

- the browser's exact presentation field set (frontend/src/world/custody.ts)
  is accepted by the receiver;
- cross-participant misuse is refused;
- a worker-signed "revocation" (unauthorized owner signing) is rejected;
- a reloaded client (same keys, reopened wallet) keeps its identity and its
  mandate — no silent identity replacement;
- there is no server-custody fallback: no endpoint generates or holds
  participant private keys.

The real browser path is proven end to end by the Playwright two-profile flow
(~/workspace/qa/custody-browser/two-profile-flow.py); byte-compatibility of
the TypeScript canonical-JSON / Ed25519 port was verified against Python's
canonical_json and verify_record before that.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests -v
from backend/.
"""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from custody_client import _Client, _expires  # noqa: E402
from openline_wallet.clock import isoformat, utc_now  # noqa: E402
from openline_wallet.crypto import (  # noqa: E402
    public_key_hex,
    record_hash,
    sign_record,
)
from openline_wallet.errors import WalletError  # noqa: E402
from world import World, WorldAuthError  # noqa: E402

# The exact presentation field set frontend/src/world/custody.ts
# `gatePresentation()` emits (schema openline.wallet.holder_presentation.v1).
# The browser port was verified byte-compatible with Python's canonical JSON
# and Ed25519; this pins the shape server-side.
BROWSER_PRESENTATION_SCHEMA = "openline.wallet.holder_presentation.v1"


def _fresh_world():
    return World(data_root=Path(tempfile.mkdtemp(prefix="world-browser-custody-")))


def _join(world, pid, scopes=("notes.read", "notes.write", "draft.write")):
    client = _Client(pid, scopes=scopes)
    out = client.join(world)
    return client, out


def _browser_presentation(client, world, action):
    """Hand-build the presentation with exactly the browser's fields."""
    challenge = world.gate_challenge(client.pid, client.token, action)["challenge"]
    bundle = client.wallet.export_bundle()
    principal = bundle["principal"]
    head = bundle["head"]
    body = {
        "schema": BROWSER_PRESENTATION_SCHEMA,
        "principal_id": principal["principal_id"],
        "mandate_id": client.mandate_id,
        "subject_id": client.agent_id,
        "subject_public_key": public_key_hex(client.worker_key),
        "action": action,
        "receiver_challenge": challenge,
        "bundle_head_hash": head["event_hash"],
        "issued_at": isoformat(utc_now()),
    }
    return sign_record(body, client.worker_key)


class TestBrowserSigningContract(unittest.TestCase):
    def test_browser_presentation_shape_accepted(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        presentation = _browser_presentation(a, w, "notes.read")
        decision = w.propose(a.pid, a.token, "notes.read", presentation=presentation)
        self.assertEqual(decision["decision"], "ALLOWED")

    def test_join_profile_carries_no_private_key_material(self):
        w = _fresh_world()
        a = _Client("alice")
        profile = a.profile(w)
        self.assertNotIn("private", json.dumps(profile).lower())

    def test_server_stores_no_participant_private_keys(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        session = w.sessions[a.pid]
        bundle_json = json.dumps(session.authority_bundle).lower()
        self.assertNotIn("private", bundle_json)


class TestCrossParticipantMisuse(unittest.TestCase):
    def test_token_cannot_act_as_other_participant(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        b, _ = _join(w, "bob")
        with self.assertRaises(WorldAuthError):
            w.propose(b.pid, a.token, "notes.read")

    def test_presentation_bound_to_other_participant_refused(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        b, _ = _join(w, "bob")
        # A's worker-signed presentation, replayed under B's session.
        presentation = _browser_presentation(a, w, "notes.read")
        with self.assertRaises((WalletError, WorldAuthError)):
            w.propose(b.pid, b.token, "notes.read", presentation=presentation)

    def test_join_without_proof_of_control_rejected(self):
        w = _fresh_world()
        a = _Client("alice")
        profile = a.profile(w)
        del profile["proof"]
        with self.assertRaises((WalletError, KeyError, TypeError)):
            w.join(profile)


class TestUnauthorizedOwnerSigning(unittest.TestCase):
    def test_worker_signed_revocation_bundle_rejected(self):
        """A revocation event signed by the worker key (not the owner root)
        must not move authority: the receiver rejects the forged bundle."""
        w = _fresh_world()
        a, _ = _join(w, "alice")
        bundle = copy.deepcopy(a.wallet.export_bundle())
        forged = sign_record(
            {
                "schema": "openline.wallet.timeline_event.v1",
                "principal_id": a.wallet.principal_id,
                "sequence": bundle["head"]["sequence"] + 1,
                "previous_event_hash": bundle["head"]["event_hash"],
                "event_type": "MANDATE_REVOKED",
                "issued_at": isoformat(utc_now()),
                "data": {"mandate_id": a.mandate_id, "reason": "USER_REVOKED"},
            },
            a.worker_key,  # the worker may never sign as the owner
        )
        bundle["events"].append(forged)
        bundle["head"] = {
            "sequence": forged["sequence"],
            "event_hash": record_hash(forged),
        }
        with self.assertRaises(WalletError):
            w.authority_refresh(a.pid, a.token, bundle)
        # authority is unchanged: the worker still acts
        decision = a.gated(w, "notes.read")
        self.assertEqual(decision["decision"], "ALLOWED")


class TestReloadPersistence(unittest.TestCase):
    def _reopened_client(self, client):
        """Simulate a browser reload: same keys, wallet reopened from disk."""
        from openline_wallet.wallet import Wallet

        reopened = _Client.__new__(_Client)
        reopened.pid = client.pid
        reopened.display = client.display
        reopened.agent_id = client.agent_id
        reopened.scopes = list(client.scopes)
        reopened.root_key = client.root_key
        reopened.worker_key = client.worker_key
        reopened.wallet_dir = client.wallet_dir
        reopened.wallet = Wallet.open(client.wallet_dir)
        reopened.mandate_id = client.mandate_id
        reopened.token = client.token
        return reopened

    def test_reload_keeps_identity_and_mandate(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        principal_before = a.wallet.principal_id
        reopened = self._reopened_client(a)
        self.assertEqual(reopened.wallet.principal_id, principal_before)
        decision = reopened.gated(w, "notes.read")
        self.assertEqual(decision["decision"], "ALLOWED")

    def test_reload_preserves_settlement_without_duplicates(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        b, _ = _join(w, "bob", scopes=("notes.read", "notes.write", "draft.write"))
        task = {"kind": "tidy-notes", "title": "Tidy", "detail": "x"}
        offer_id = w.offer(a.pid, a.token, task,
                           authorization=a.authorization(w, task))["offer_id"]
        agreement_id = w.propose_agreement(
            b.pid, b.token, offer_id,
            authorization=b.authorization(w, task))["agreement_id"]
        w.agree(a.pid, a.token, agreement_id,
                authorization=a.authorization(w, task))
        first = w.submit(b.pid, b.token, agreement_id)
        self.assertEqual(first["status"], "settled")
        # reload: same identity, re-submit returns the recorded settlement
        reopened_b = self._reopened_client(b)
        again = w.submit(reopened_b.pid, reopened_b.token, agreement_id)
        self.assertEqual(again["status"], "settled")
        self.assertEqual(again.get("transaction_id") or again.get("receipt_id"),
                         first.get("transaction_id") or first.get("receipt_id"))

    def test_revocation_survives_reload(self):
        w = _fresh_world()
        a, _ = _join(w, "alice")
        a.revoke(w)
        reopened = self._reopened_client(a)
        stopped = reopened.gated(w, "notes.read")
        self.assertEqual(stopped["decision"], "STOPPED")
        self.assertIn("MANDATE_REVOKED", stopped.get("reason_codes", []))


class TestNoServerCustodyFallback(unittest.TestCase):
    def test_no_participant_key_generation_api(self):
        w = _fresh_world()
        for name in dir(w):
            lowered = name.lower()
            if "generat" in lowered or "mint" in lowered:
                self.assertNotIn("participant", lowered)
                self.assertNotIn("owner", lowered)
                self.assertNotIn("worker", lowered)
        self.assertFalse(hasattr(w, "generate_participant_keys"))
        self.assertFalse(hasattr(w, "mint_owner_keys"))

    def test_join_requires_client_held_keys(self):
        # The server can only verify; it never mints the participant side.
        # A profile with a null agent public key is rejected.
        w = _fresh_world()
        a = _Client("alice")
        profile = a.profile(w)
        profile["agent"]["public_key"] = None
        with self.assertRaises((WalletError, WorldAuthError, TypeError)):
            w.join(profile)


if __name__ == "__main__":
    unittest.main()
