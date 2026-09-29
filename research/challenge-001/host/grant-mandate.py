#!/usr/bin/env python3
"""Owner-side mandate grant for a remote CHALLENGE-001 participant.

One participant, one manual grant. The owner runs this ON THEIR OWN
MACHINE (the owner wallet is never on the hosted receiver), then sends
the produced bundle file to the participant out of band (email, chat,
USB — any channel the owner already trusts). No automated issuance:
the owner reads the agent public key, checks it, and runs this command.

Usage:
    python3 grant-mandate.py \
        --wallet ~/.openline/owner-wallet \
        --subject-id agent-alice \
        --subject-public-key <hex ed25519 public key> \
        --display-name "Alice's worker" \
        --scopes challenge.contribute \
        --ttl-days 14 \
        --out bundle-alice.json

The bundle expires 600 seconds after export (the wallet's bundle TTL).
Coordinate the handoff live: export and send in the same sitting. If
the participant's join fails with an expired bundle, just re-run with
--refresh-only: the grant is durable in the wallet timeline; only the
export needs repeating. Private keys never appear here: the owner only
ever handles the agent's PUBLIC key.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(_REPO_ROOT / "backend" / "vendor"))

from openline_wallet.wallet import Wallet  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402

_PUBKEY = re.compile(r"^[0-9a-fA-F]{64}$")
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$")

ALLOWED_SCOPES = {"challenge.contribute", "challenge.admin", "claimgraph.correct"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--wallet", required=True, help="path to the OWNER wallet dir (local, private)")
    ap.add_argument("--subject-id", required=True, help="agent id, e.g. agent-alice")
    ap.add_argument("--subject-public-key", required=True, help="agent's Ed25519 PUBLIC key (hex)")
    ap.add_argument("--display-name", default="", help="human-readable, for the owner's records only")
    ap.add_argument("--scopes", required=True, help="comma-separated, e.g. challenge.contribute")
    ap.add_argument("--ttl-days", type=int, default=14)
    ap.add_argument("--out", required=True, help="where to write the bundle file")
    ap.add_argument("--refresh-only", action="store_true",
                    help="skip grant (participant already has an active mandate); just re-export")
    args = ap.parse_args()

    if not _ID.fullmatch(args.subject_id):
        raise SystemExit("subject-id rejected: must match [A-Za-z0-9][A-Za-z0-9._:/-]{0,63}")
    if not _PUBKEY.fullmatch(args.subject_public_key):
        raise SystemExit("subject-public-key rejected: must be 64 hex chars of the agent PUBLIC key")
    scopes = [s.strip() for s in args.scopes.split(",") if s.strip()]
    unknown = [s for s in scopes if s not in ALLOWED_SCOPES]
    if unknown:
        raise SystemExit(f"unknown scope(s): {', '.join(unknown)} (allowed: {sorted(ALLOWED_SCOPES)})")
    if args.ttl_days < 1 or args.ttl_days > 90:
        raise SystemExit("ttl-days must be 1..90")

    wallet = Wallet.open(Path(args.wallet).expanduser())
    try:
        if not args.refresh_only:
            wallet.grant(
                subject_id=args.subject_id,
                subject_public_key=args.subject_public_key.lower(),
                scopes=scopes,
                expires_at=datetime.now(timezone.utc) + timedelta(days=args.ttl_days),
            )
    except WalletError as exc:
        raise SystemExit(f"grant failed: {exc.code} {exc}") from exc

    bundle = wallet.export_bundle()
    out = Path(args.out)
    out.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    try:
        out.chmod(0o600)
    except OSError:
        pass

    timeline = wallet.timeline()
    mandate_id = timeline.active_by_subject.get(args.subject_id)
    print(json.dumps({
        "granted": not args.refresh_only,
        "subject_id": args.subject_id,
        "display_name": args.display_name,
        "scopes": scopes,
        "mandate_id": mandate_id,
        "principal_id": wallet.principal_id,
        "bundle_file": str(out),
        "bundle_expires_at": bundle["expires_at"],
        "deliver_now": "The bundle expires 600s after export. Send it out of band now.",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
