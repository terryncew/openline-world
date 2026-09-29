#!/usr/bin/env python3
"""Owner-operator session retirement for the shared world pilot.

Retires one participant session: frees the slot, invalidates the
session's authority, preserves contributions / receipts / attribution /
the receiver key.

NOT exposed on HTTP. Run over SSH on the pilot host WHILE THE SERVER IS
STOPPED (the server holds authoritative in-memory state and save()s
after every mutating call; editing the snapshot under a live server
would be clobbered):

    systemctl stop openline-world.service
    python3 /opt/openline-world/backend/admin_retire.py \
        --data-root /var/lib/openline-world \
        --participant-id participant-a --retired-by "owner: <reason>"
    systemctl start openline-world.service

Prints the result JSON only. Never prints key material.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from world import World  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-root", required=True,
                    help="world data dir holding world-snapshot.json")
    ap.add_argument("--participant-id", required=True,
                    help="participant id whose session to retire")
    ap.add_argument("--retired-by", default="owner",
                    help="attribution label for the retirement record")
    args = ap.parse_args()

    world = World(data_root=Path(args.data_root))
    # Fail loudly if the snapshot exists but its sessions did not load:
    # retiring against an empty world would silently do nothing useful.
    snap = Path(args.data_root) / "world-snapshot.json"
    if snap.exists():
        try:
            raw = json.loads(snap.read_text(encoding="utf-8"))
        except ValueError:
            raw = None
        snap_sessions = (raw.get("sessions") if isinstance(raw, dict)
                         else None) or {}
        if snap_sessions and not world.sessions:
            print(json.dumps({"retired": False,
                              "error": "SNAPSHOT_UNREADABLE",
                              "detail": "snapshot holds sessions but none "
                                        "loaded; refusing to retire"}))
            return 1
    try:
        result = world.retire_participant(args.participant_id,
                                          retired_by=args.retired_by)
    except Exception as exc:  # noqa: BLE001 - report the code, not a trace
        code = getattr(exc, "code", type(exc).__name__)
        print(json.dumps({"retired": False, "error": str(code),
                          "detail": str(exc)}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
