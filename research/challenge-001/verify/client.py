"""One challenge-demo client process.

One process = one participant = one key dir. Run once per role; the
orchestrator (run_demo.py) launches each as a separate subprocess so the
two contributors are separately operated processes with separate keys,
mirroring the clients/demo_custody.py two-key-dir pattern (but actually
in two processes, not one).

Roles:
  owner     join, create the challenge, evaluate contributions
  contrib-a join, delegate bounds, contribute a patch (BUG-1)
  contrib-b join, delegate bounds, contribute a review + a test (two bugs)

Usage:
  python client.py --role owner --server http://127.0.0.1:8471 \
      --keydir .keys/owner --cmd create
  python client.py --role contrib-a --server ... --keydir .keys/a \
      --cmd contribute --kind patch --file fixtures/patch-a.diff \
      --title "Fix rolling_sum off-by-one"
  python client.py --role contrib-b --server ... --keydir .keys/b \
      --cmd contribute --kind review --file fixtures/review-b.md \
      --references CHC-0001 --title "..." 
  python client.py --role owner --server ... --keydir .keys/owner \
      --cmd evaluate --contribution-id CHC-0001 --decision ACCEPT \
      --reason "..."
  python client.py --role contrib-b --server ... --keydir .keys/b \
      --cmd revoke            # revoke own mandate, refresh at receiver
  python client.py --role contrib-b --server ... --keydir .keys/b \
      --cmd contribute ...    # after revocation: expect STOPPED MANDATE_REVOKED

Every result is printed as one JSON object on stdout. Private keys and
bearer tokens never appear in stdout: only ids, hashes, and verdicts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(_REPO_ROOT / "clients"))

from participant import ParticipantClient, ClientError  # noqa: E402

CRITERIA_HASH = "86be00e377e030b00b4a8d33b3c9b0d4d95e7049125981d714023a2ca5f6537a"
CHALLENGE_ID = "CHALLENGE-001"

ROLE_CONFIG = {
    "owner": {
        "participant_id": "challenge-owner",
        "display_name": "Challenge Owner",
        "agent_id": "owner-agent",
        "agent_display_name": "Owner's worker",
        "scopes": ["challenge.admin", "challenge.contribute"],
    },
    "contrib-a": {
        "participant_id": "participant-a",
        "display_name": "Contributor A",
        "agent_id": "agent-a",
        "agent_display_name": "A's worker",
        "scopes": ["challenge.contribute"],
    },
    "contrib-b": {
        "participant_id": "participant-b",
        "display_name": "Contributor B",
        "agent_id": "agent-b",
        "agent_display_name": "B's worker",
        "scopes": ["challenge.contribute"],
    },
}


class ChallengeClient(ParticipantClient):
    def delegate_bounds(self, goal: str, permitted_actions: list,
                        spending_limit: int = 4, work_limit: int = 10,
                        review_conditions: dict | None = None) -> dict:
        participant_id, token = self._auth()
        return self._post("/api/world/delegate", {
            "participant_id": participant_id,
            "token": token,
            "delegation": {
                "goal": goal,
                "permitted_actions": permitted_actions,
                "permitted_resources": ["CHALLENGE-001"],
                "spending_limit": spending_limit,
                "work_limit": work_limit,
                "review_conditions": review_conditions or {
                    "new_counterpart": False, "over_spending": True},
            },
        })

    def create_challenge(self, spec: dict,
                         idempotency_key: str | None = None) -> dict:
        participant_id, token = self._auth()
        presentation = self.authorize("challenge.admin")
        return self._post("/api/world/challenge/create", {
            "participant_id": participant_id,
            "token": token,
            "spec": spec,
            "presentation": presentation,
            "idempotency_key": idempotency_key or uuid.uuid4().hex,
        })

    def contribute(self, contribution: dict,
                   idempotency_key: str | None = None) -> dict:
        participant_id, token = self._auth()
        presentation = self.authorize("challenge.contribute")
        return self._post("/api/world/challenge/contribute", {
            "participant_id": participant_id,
            "token": token,
            "contribution": contribution,
            "presentation": presentation,
            "idempotency_key": idempotency_key or uuid.uuid4().hex,
        })

    def evaluate(self, contribution_id: str, decision: str, reason: str,
                 idempotency_key: str | None = None) -> dict:
        participant_id, token = self._auth()
        presentation = self.authorize("challenge.admin")
        return self._post("/api/world/challenge/evaluate", {
            "participant_id": participant_id,
            "token": token,
            "contribution_id": contribution_id,
            "decision": decision,
            "reason": reason,
            "presentation": presentation,
            "idempotency_key": idempotency_key or uuid.uuid4().hex,
        })

    def board(self) -> dict:
        return self._get("/api/world/challenge/read")


def emit(obj: dict) -> None:
    print(json.dumps(obj))


def _token_path(keydir: Path) -> Path:
    return keydir / ".session-token"


def ensure_session(client: ChallengeClient, cfg: dict) -> str:
    """Join once per participant; later processes resume the session.

    The bearer token is cached in the participant's own key dir (0o600) —
    that is what a real participant host would do. A cached token is
    probed with an authed read; a WORLD_AUTH_MISMATCH falls back to a
    fresh join (the server allows exactly one current session per
    participant).
    """
    keydir = Path(client.key_dir)
    tp = _token_path(keydir)
    if tp.exists():
        token = tp.read_text(encoding="utf-8").strip()
        client.participant_id = cfg["participant_id"]
        client._token = token
        try:
            client._get(
                "/api/world/delegation?participant_id="
                f"{cfg['participant_id']}&token={token}")
            return "resumed"
        except ClientError as exc:
            if exc.code != "WORLD_AUTH_MISMATCH":
                raise
    out = client.join()
    tp.write_text(client._token, encoding="utf-8")
    try:
        tp.chmod(0o600)
    except OSError:
        pass
    return "joined"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", required=True,
                    choices=list(ROLE_CONFIG))
    ap.add_argument("--server", required=True)
    ap.add_argument("--keydir", required=True)
    ap.add_argument("--cmd", required=True,
                    choices=["create", "contribute", "evaluate", "revoke",
                             "revoke-then-contribute", "board"])
    ap.add_argument("--kind", default="patch")
    ap.add_argument("--file")
    ap.add_argument("--title", default="")
    ap.add_argument("--references", default="")
    ap.add_argument("--decision", default="ACCEPT")
    ap.add_argument("--reason", default="")
    ap.add_argument("--contribution-id", default="")
    ap.add_argument("--idempotency-key", default=None)
    ap.add_argument("--patch-id", default="")
    ap.add_argument("--with-attestation", action="store_true",
                    help="carry a contributor self-approval attestation "
                         "(must be discarded by the server)")
    args = ap.parse_args()

    cfg = ROLE_CONFIG[args.role]
    client = ChallengeClient(args.keydir, args.server)
    try:
        client.ceremony(
            participant_id=cfg["participant_id"],
            display_name=cfg["display_name"],
            agent_id=cfg["agent_id"],
            agent_display_name=cfg["agent_display_name"],
            scopes=cfg["scopes"],
        )
        session_state = (ensure_session(client, cfg)
                         if args.cmd != "board" else "public")
        result: dict = {
            "role": args.role,
            "participant_id": cfg["participant_id"],
            "cmd": args.cmd,
            "session": session_state,
        }

        if args.cmd == "create":
            problem = (_REPO_ROOT / "research" / "challenge-001"
                       / "PROBLEM.md").read_bytes()
            spec = {
                "challenge_id": CHALLENGE_ID,
                "criteria_hash": CRITERIA_HASH,
                "problem_sha256": hashlib.sha256(problem).hexdigest(),
                "deadline_iso": "2026-10-12T00:00:00+00:00",
            }
            out = client.create_challenge(spec,
                                          idempotency_key=args.idempotency_key)
            result["create"] = out

        elif args.cmd == "contribute":
            body = Path(args.file).read_text(encoding="utf-8")
            if args.patch_id:
                body = body.replace("{{PATCH_ID}}", args.patch_id)
            delegation = client.delegate_bounds(
                goal=(f"Contribute one {args.kind} to CHALLENGE-001: "
                      f"{args.title}"),
                permitted_actions=["challenge-contribute"],
                spending_limit=4, work_limit=10)
            result["delegation_id"] = delegation.get("delegation_id")
            contribution = {
                "kind": args.kind,
                "title": args.title,
                "body": body,
                "challenge_id": CHALLENGE_ID,
                "criteria_hash": CRITERIA_HASH,
                "body_sha256": hashlib.sha256(
                    body.encode("utf-8")).hexdigest(),
                "participant_id": cfg["participant_id"],
                "references": args.references,
                "original": True,
                "derived_from": [],
            }
            if args.with_attestation:
                # A contributor-carried self-approval. The server must
                # accept it on the wire and discard it: it authorizes
                # nothing and appears nowhere.
                contribution["attestation"] = {
                    "verdict": "APPROVED", "by": cfg["participant_id"],
                    "note": "self-approval (must be discarded)"}
            out = client.contribute(contribution,
                                    idempotency_key=args.idempotency_key)
            result["contribute"] = out

        elif args.cmd == "evaluate":
            out = client.evaluate(args.contribution_id, args.decision,
                                  args.reason,
                                  idempotency_key=args.idempotency_key)
            result["evaluate"] = out

        elif args.cmd == "revoke":
            latency, out = client.revoke()
            result["revoked"] = True
            result["revoke_latency_s"] = latency
            result["refresh"] = out

        elif args.cmd == "revoke-then-contribute":
            # Revoke and contribute in ONE process so the presentation
            # carries the revoked mandate id and the revoked bundle head:
            # the gate then STOPs with MANDATE_REVOKED (the honest
            # post-revocation verdict), not PRESENTATION_HEAD_STALE.
            latency, refresh_out = client.revoke()
            result["revoked"] = True
            result["revoke_latency_s"] = latency
            body = Path(args.file).read_text(encoding="utf-8")
            contribution = {
                "kind": args.kind,
                "title": args.title,
                "body": body,
                "challenge_id": CHALLENGE_ID,
                "criteria_hash": CRITERIA_HASH,
                "body_sha256": hashlib.sha256(
                    body.encode("utf-8")).hexdigest(),
                "participant_id": cfg["participant_id"],
                "references": args.references,
                "original": True,
                "derived_from": [],
            }
            out = client.contribute(contribution,
                                    idempotency_key=args.idempotency_key)
            result["contribute"] = out

        elif args.cmd == "board":
            result["board"] = client.board()

        emit(result)
        return 0
    except ClientError as exc:
        emit({"role": args.role, "cmd": args.cmd, "error": exc.code,
              "detail": exc.detail})
        return 1


if __name__ == "__main__":
    sys.exit(main())
