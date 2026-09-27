"""Workshop authorization layer: the real OpenLine gate, no imitation.

Every consequential decision in the workshop goes through
``openline_wallet``'s EffectGate (vendored in backend/vendor, see NOTICE): mandate grants, bundle admission, per-action challenge/presentation/
evaluation, revocation, and Ed25519-signed gate receipts.

The workshop backend never mints a receipt. Only the gate's signed
ALLOWED/STOPPED decisions become receipts.
"""
from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any, Mapping

_VENDOR_SRC = Path(__file__).parent / "vendor"
if str(_VENDOR_SRC) not in sys.path:
    sys.path.insert(0, str(_VENDOR_SRC))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from openline_wallet.wallet import Wallet  # noqa: E402
from openline_wallet.effect_closure import EffectGate  # noqa: E402
from openline_wallet.receiver import create_presentation  # noqa: E402
from openline_wallet.crypto import public_key_hex, verify_record  # noqa: E402
from openline_wallet.clock import utc_now  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402


@dataclass
class Helper:
    helper_id: str
    key: Ed25519PrivateKey
    public_key: str
    mandate_id: str
    scopes: list[str]
    active: bool = True


@dataclass
class WorkshopGate:
    """Owner wallet + real receiver gate for the workshop."""

    data_dir: Path
    gate_id: str = "workshop-receiver"
    wallet: Wallet = field(init=False)
    gate: EffectGate = field(init=False)
    helpers: dict[str, Helper] = field(default_factory=dict, init=False)
    receipts: list[dict[str, Any]] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self.data_dir = Path(self.data_dir)
        if self.data_dir.exists():
            shutil.rmtree(self.data_dir)
        self.data_dir.mkdir(parents=True)
        self.wallet = Wallet.create(self.data_dir / "owner-wallet", label="Workshop Owner")
        self.gate = EffectGate(self.gate_id)
        self.gate.pin_principal(self.wallet.principal_id, self.wallet.root_public_key)

    # -- mandates ---------------------------------------------------------
    def onboard_helper(self, helper_id: str, scopes: list[str], ttl_hours: int = 1) -> dict[str, Any]:
        if helper_id in self.helpers and self.helpers[helper_id].active:
            raise WalletError("HELPER_ALREADY_ACTIVE", helper_id)
        key = Ed25519PrivateKey.generate()
        mandate_id = f"mandate-{helper_id}-{len(self.helpers) + 1}"
        self.wallet.grant(
            subject_id=helper_id,
            subject_public_key=public_key_hex(key),
            scopes=list(scopes),
            expires_at=utc_now() + timedelta(hours=ttl_hours),
            mandate_id=mandate_id,
        )
        self.helpers[helper_id] = Helper(
            helper_id=helper_id, key=key, public_key=public_key_hex(key),
            mandate_id=mandate_id, scopes=list(scopes), active=True,
        )
        admitted = self._admit()
        return {
            "mandate_id": mandate_id, "subject_id": helper_id,
            "scopes": list(scopes), "admission": admitted["decision"],
        }

    def revoke_helper(self, helper_id: str, reason: str = "USER_REVOKED") -> dict[str, Any]:
        helper = self.helpers.get(helper_id)
        if helper is None or not helper.active:
            raise WalletError("HELPER_NOT_ACTIVE", helper_id)
        self.wallet.revoke(helper.mandate_id, reason=reason)
        helper.active = False
        admitted = self._admit()
        return {
            "mandate_id": helper.mandate_id, "subject_id": helper_id,
            "status": "REVOKED", "admission": admitted["decision"],
        }

    # -- exact-action decisions -------------------------------------------
    def request_decision(self, helper_id: str, action: str) -> dict[str, Any]:
        """Run one proposed action through the real gate. Returns the signed receipt."""
        helper = self.helpers.get(helper_id)
        if helper is None:
            raise WalletError("HELPER_UNKNOWN", helper_id)
        bundle = self.wallet.export_bundle()
        challenge = self.gate.issue_challenge(
            principal_id=self.wallet.principal_id, subject_id=helper_id, action=action,
        )
        presentation = create_presentation(
            bundle=bundle, mandate_id=helper.mandate_id, subject_id=helper_id,
            subject_key=helper.key, action=action, receiver_challenge=challenge,
        )
        receipt = self.gate.evaluate(presentation, expected_action=action)
        # Verify the gate's own signature before accepting it as a receipt.
        valid, _ = verify_record(receipt, expected_public_key=self.gate.public_key)
        if valid is not True:
            raise WalletError("GATE_RECEIPT_SIGNATURE_INVALID")
        self.receipts.append(receipt)
        try:
            self.wallet.add_receipt(receipt)
        except WalletError:
            pass  # duplicate guard; the gate receipt itself is authoritative
        return receipt

    # -- inspection --------------------------------------------------------
    def mandate_record(self, helper_id: str) -> dict[str, Any] | None:
        helper = self.helpers.get(helper_id)
        if helper is None:
            return None
        return {
            "mandate_id": helper.mandate_id, "subject_id": helper_id,
            "scopes": helper.scopes, "active": helper.active,
            "principal_id": self.wallet.principal_id,
            "gate_id": self.gate_id, "gate_public_key": self.gate.public_key,
        }

    def receipt_records(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self.receipts]

    # -- internals ----------------------------------------------------------
    def _admit(self) -> dict[str, Any]:
        bundle = self.wallet.export_bundle()
        return self.gate.admit_bundle(bundle)


def describe_receipt(receipt: Mapping[str, Any]) -> str:
    """Plain-English rendering of a signed gate receipt for the UI."""
    decision = receipt.get("decision", "?")
    action = receipt.get("action", "?")
    subject = receipt.get("subject_id", "?")
    reasons = list(receipt.get("reason_codes", []) or [])
    reason_text = {
        "ACTION_OUTSIDE_MANDATE": "outside the helper's mandate",
        "MANDATE_REVOKED": "the mandate was revoked",
        "MANDATE_EXPIRED": "the mandate expired",
        "MANDATE_UNKNOWN": "no such mandate",
        "BUNDLE_NOT_ADMITTED": "no admitted authority",
    }
    first = reasons[0] if reasons else ""
    why = reason_text.get(first, first.lower().replace("_", " "))
    if decision == "ALLOWED":
        return f"Allowed: {action} is inside {subject}'s mandate."
    return f"Refused: {action} — {why}."
