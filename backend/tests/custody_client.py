"""Shared custody-ceremony client for the backend test suite.

_Client is the participant's own client: it holds the owner root key, the
worker key, and the wallet, and never touches the server except through the
public World API. It builds its own mandate bundles and worker-signed
presentations against receiver-issued challenges.

Import with the tests directory on sys.path::

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from custody_client import _Client
"""
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# The vendored wallet must be importable even when this module is imported
# before world.py (same insertion world.py performs at its own import).
_VENDOR = str(Path(__file__).resolve().parent.parent / "vendor")
if _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from openline_wallet.crypto import public_key_hex  # noqa: E402
from openline_wallet.receiver import create_presentation  # noqa: E402
from openline_wallet.wallet import Wallet  # noqa: E402
from world import TASK_KINDS  # noqa: E402


def _expires(**kw):
    return datetime.now(timezone.utc) + timedelta(**kw)


class _Client:
    """The participant's own client: owner root key, worker key, wallet.

    Never touches the server except through the public World API. Builds its
    own mandate bundles and worker-signed presentations."""

    def __init__(self, pid, scopes=("notes.read", "notes.write"),
                 display=None, agent_id=None):
        self.pid = pid
        self.display = display or pid.title()
        self.agent_id = agent_id or f"{pid}-agent"
        self.scopes = list(scopes)
        self.root_key = Ed25519PrivateKey.generate()
        self.worker_key = Ed25519PrivateKey.generate()
        self.wallet_dir = tempfile.mkdtemp(prefix=f"wallet-{pid}-")
        self.wallet = Wallet.create(self.wallet_dir, label=pid,
                                    root_key=self.root_key,
                                    epoch_key=Ed25519PrivateKey.generate())
        self.mandate_id = None
        if self.scopes:
            ev = self.wallet.grant(subject_id=self.agent_id,
                                   subject_public_key=public_key_hex(self.worker_key),
                                   scopes=self.scopes,
                                   expires_at=_expires(hours=1))
            self.mandate_id = ev["data"]["mandate_id"]
        self.token = None

    def profile(self, w, scopes=None, nonce=None, **overrides):
        if nonce is None:
            nonce = w.challenge()["nonce"]
        profile = {
            "version": "openline-join-profile/v1",
            "participant": {"id": self.pid, "display_name": self.display},
            "agent": {"id": self.agent_id, "display_name": f"{self.pid} agent",
                      "public_key": public_key_hex(self.worker_key)},
            "proof": {"nonce": nonce,
                      "signature": self.worker_key.sign(nonce.encode("utf-8")).hex()},
            "owner": {"principal_id": self.wallet.principal_id,
                      "root_public_key": public_key_hex(self.root_key)},
            "mandate_bundle": self.wallet.export_bundle(),
            "mandate": {"scopes": list(self.scopes) if scopes is None else list(scopes)},
            "capabilities": ["mandate.v1", "receipt.v1", "revocation.v1"],
        }
        profile.update(overrides)
        return profile

    def join(self, w):
        out = w.join(self.profile(w))
        self.token = out["token"]
        return out

    def presentation(self, w, action):
        """One worker-signed presentation against a fresh receiver challenge."""
        challenge = w.gate_challenge(self.pid, self.token, action)["challenge"]
        return self.presentation_for(challenge, action)

    def presentation_for(self, challenge, action):
        """One worker-signed presentation against a given challenge string."""
        return create_presentation(bundle=self.wallet.export_bundle(),
                                   mandate_id=self.mandate_id,
                                   subject_id=self.agent_id,
                                   subject_key=self.worker_key,
                                   action=action,
                                   receiver_challenge=challenge)

    def gated(self, w, action, **kw):
        """propose with a fresh worker-signed presentation."""
        return w.propose(self.pid, self.token, action,
                         presentation=self.presentation(w, action), **kw)

    def authorization(self, w, task):
        """A presentation for the allowlisted action behind a task kind."""
        return self.presentation(w, TASK_KINDS[task["kind"]])

    def profile_with_nonce(self, nonce, scopes=None, **overrides):
        return self.profile(None, scopes=scopes, nonce=nonce, **overrides)

    def refresh(self, w):
        """Submit the current owner-signed bundle to the receiver."""
        return w.authority_refresh(self.pid, self.token, self.wallet.export_bundle())

    def revoke(self, w):
        """Revoke locally in the owner wallet, then refresh at the receiver."""
        self.wallet.revoke(self.mandate_id)
        return self.refresh(w)
