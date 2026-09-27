"""Scripted demo of separate participant key custody.

Two participants (separate key dirs, separate keys), one world:

  1. A and B join (proof-of-control + owner-signed mandate bundles).
  2. A posts an offer (+A's authorization) -> B proposes an agreement
     (+B's authorization) -> A agrees (+A's authorization) -> A submits ->
     settled once; receipt ids captured.
  3. Negative checks: altered presentation binding refused
     (WORLD_PRESENTATION_BINDING); missing authorization refused
     (WORLD_AUTHORIZATION_MISSING); replayed presentation refused
     (PRESENTATION_REPLAYED).
  4. A revokes its worker locally -> refresh admitted (latency measured) ->
     A's next gated action STOPPED MANDATE_REVOKED -> B still ALLOWED.
  5. Server restart: revocation still enforced (tokens persist in the
     snapshot), settled transaction still recorded, duplicate submit returns
     the recorded settlement (idempotent).
  6. Prints the custody map and the one-machine disclosure.

Usage:
  python clients/demo_custody.py --server http://127.0.0.1:8471
  python clients/demo_custody.py --launch            # starts the server itself
  python clients/demo_custody.py --launch --port 8471

--launch wipes the server data dir first (env WORLD_DATA_DIR, else the
repo's backend/data/world) so the demo starts from a clean world. The same
WORLD_DATA_DIR is passed to the server subprocess; if the server honors it,
wiping and serving stay on the same directory.

Private keys and bearer tokens NEVER appear in stdout: only ids and public
key prefixes (first 8 hex chars + "...").
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from participant import ParticipantClient, ClientError  # noqa: E402

DEFAULT_PORT = 8471


def _redact(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value)
    return text[:8] + "..." if len(text) > 11 else text


class Demo:
    def __init__(self, server_base: str) -> None:
        self.server_base = server_base
        self.failures: list[str] = []
        self.checks = 0

    def check(self, name: str, cond: bool, detail: str = "") -> None:
        self.checks += 1
        mark = "PASS" if cond else "FAIL"
        print(f"[{mark}] {name}" + (f" -- {detail}" if detail and not cond else ""))
        if not cond:
            self.failures.append(name)

    def expect_error(self, name: str, code: str, fn) -> str:
        try:
            fn()
        except ClientError as exc:
            self.check(name, exc.code == code, f"got {exc.code}, detail={exc.detail}")
            return exc.code
        self.check(name, False, "no error raised")
        return ""

    def expect_stopped(self, name: str, reason: str, resp: Any) -> None:
        codes = (resp or {}).get("reason_codes", []) if isinstance(resp, dict) else []
        self.check(
            name,
            isinstance(resp, dict) and resp.get("decision") == "STOPPED" and reason in codes,
            f"decision={resp.get('decision') if isinstance(resp, dict) else resp!r} "
            f"reasons={codes}",
        )

    def expect_allowed(self, name: str, resp: Any) -> None:
        self.check(
            name,
            isinstance(resp, dict) and resp.get("decision") == "ALLOWED",
            f"decision={resp.get('decision') if isinstance(resp, dict) else resp!r}",
        )

    @staticmethod
    def _first_id(resp: Any, *keys: str) -> str:
        for key in keys:
            if isinstance(resp, dict) and resp.get(key):
                return str(resp[key])
        raise AssertionError(f"no id in response: {json.dumps(resp)[:200]}")


def _wait_for_health(server_base: str, timeout: float = 20.0) -> None:
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(server_base + "/api/health", timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"server at {server_base} did not become healthy")


def _launch_server(port: int, *, wipe: bool = True) -> subprocess.Popen:
    data_dir = Path(os.environ.get("WORLD_DATA_DIR", _REPO_ROOT / "backend" / "data" / "world"))
    if wipe:
        if data_dir.exists():
            shutil.rmtree(data_dir)
        data_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["WORKSHOP_PORT"] = str(port)
    env["WORLD_DATA_DIR"] = str(data_dir)
    log = open(_REPO_ROOT / "clients" / "demo-server.log", "w", encoding="utf-8")  # noqa: PTH123
    proc = subprocess.Popen(
        [sys.executable, "backend/server.py"],
        cwd=_REPO_ROOT,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    print(f"launched server pid={proc.pid} port={port} data_dir={data_dir}")
    _wait_for_health(f"http://127.0.0.1:{port}")
    print("server healthy")
    return proc


def _stop_server(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


def run_demo(server_base: str) -> int:
    demo = Demo(server_base)
    key_root = Path(tempfile.mkdtemp(prefix="custody-demo-keys-"))
    scopes = ["notes.write", "draft.write"]

    def make_client(name: str, display: str, agent: str) -> ParticipantClient:
        client = ParticipantClient(key_root / name, server_base)
        info = client.ceremony(
            participant_id=f"participant-{name}",
            display_name=display,
            agent_id=agent,
            agent_display_name=f"{display}'s worker",
            scopes=scopes,
        )
        print(
            f"ceremony {name}: participant={info['participant_id']} "
            f"principal={_redact(info['principal_id'])} mandate={_redact(info['mandate_id'])} "
            f"worker_pub={info['worker_public_key']}"
        )
        return client

    alice = make_client("a", "Alice", "agent-alice")
    bob = make_client("b", "Bob", "agent-bob")

    # -- step 1: join ---------------------------------------------------------
    for client, name in ((alice, "A"), (bob, "B")):
        client.join()
        demo.check(f"{name} join", True)
    print("A and B joined; tokens held in memory only")

    # -- step 2: the agreement walk -------------------------------------------
    task = {"kind": "tidy-notes", "title": "Tidy the shared notes",
            "detail": "File the week's notes.", "requires": []}
    offer_resp = alice.post_offer(task)
    offer_id = demo._first_id(offer_resp, "offer_id", "listing_id", "id")
    print(f"offer posted: offer_id={offer_id}")
    demo.check("offer posted", bool(offer_id))

    prop_resp = bob.propose_agreement(offer_id)
    agreement_id = demo._first_id(prop_resp, "agreement_id", "id")
    print(f"agreement proposed: agreement_id={agreement_id}")
    demo.check("agreement proposed", bool(agreement_id))

    alice.agree(agreement_id)
    demo.check("counterpart agreed", True)

    submit_resp = alice.submit(agreement_id)
    demo.check("submit settled", isinstance(submit_resp, dict)
               and submit_resp.get("status") == "settled",
               f"status={submit_resp.get('status') if isinstance(submit_resp, dict) else submit_resp!r}")
    receipt_ids = [v for k, v in (submit_resp.items() if isinstance(submit_resp, dict) else [])
                   if "receipt" in k.lower()]
    print(f"settled once; receipt fields: {json.dumps(receipt_ids)[:200]}")
    agr = alice.agreement(agreement_id)
    demo.check("agreement inspector shows settled",
               isinstance(agr, dict) and agr.get("status") == "settled")

    # -- step 3: negative checks ----------------------------------------------
    action = "notes.write"
    good = alice.authorize(action)
    tampered = dict(good)
    tampered["subject_public_key"] = bob.worker_public_key
    demo.expect_error(
        "altered binding refused",
        "WORLD_PRESENTATION_BINDING",
        lambda: alice.propose(action, tampered),
    )
    demo.expect_error(
        "missing authorization refused",
        "WORLD_AUTHORIZATION_MISSING",
        lambda: alice.propose(action),
    )
    first = alice.authorize(action)
    first_resp = alice.propose(action, first)
    demo.expect_allowed("first presentation allowed", first_resp)
    replay_resp = alice.propose(action, first)
    demo.expect_stopped("replayed presentation refused", "PRESENTATION_REPLAYED", replay_resp)

    # -- step 4: revocation -----------------------------------------------------
    latency, refresh_resp = alice.revoke()
    print(f"A revoked worker; refresh admitted in {latency:.3f}s "
          f"(local revoke -> server admission; NOT instant)")
    demo.check("revocation refresh admitted", isinstance(refresh_resp, dict))
    demo.check("revocation latency measured", latency >= 0, f"{latency:.3f}s")

    stopped = alice.propose(action, alice.authorize(action))
    demo.expect_stopped("A's gated action STOPPED after revoke", "MANDATE_REVOKED", stopped)

    bob_ok = bob.propose(action, bob.authorize(action))
    demo.expect_allowed("B unaffected by A's revocation", bob_ok)

    # -- step 5: restart --------------------------------------------------------
    return demo, key_root, alice, bob, agreement_id, submit_resp, latency


def _after_restart(demo: Demo, alice: ParticipantClient, bob: ParticipantClient,
                   agreement_id: str, submit_resp: Any, server_base: str,
                   *, restarted: bool) -> None:
    # Tokens persist in the world snapshot; the clients kept theirs in memory.
    # No re-join: the contract path is reuse, not a fresh ceremony.
    action = "notes.write"
    stopped = alice.propose(action, alice.authorize(action))
    demo.expect_stopped(
        f"revocation {'survives restart' if restarted else 'still enforced'} (A STOPPED)",
        "MANDATE_REVOKED", stopped)

    agr = alice.agreement(agreement_id)
    demo.check("settled transaction still recorded" + (" after restart" if restarted else ""),
               isinstance(agr, dict) and agr.get("status") == "settled",
               f"status={agr.get('status') if isinstance(agr, dict) else agr!r}")

    # Idempotency check as the non-revoked party: Alice's own submit would be
    # refused on standing (she revoked), which is correct but not the point.
    again = bob.submit(agreement_id)
    same = (isinstance(again, dict) and isinstance(submit_resp, dict)
            and again.get("status") == "settled"
            and again.get("transaction_id", again.get("status"))
            == submit_resp.get("transaction_id", submit_resp.get("status")))
    demo.check("duplicate submit returns recorded settlement (idempotent)", same,
               f"status={again.get('status') if isinstance(again, dict) else again!r}")

    bob_ok = bob.propose(action, bob.authorize(action))
    demo.expect_allowed("B still ALLOWED after restart", bob_ok)


def _print_custody_map(alice: ParticipantClient, bob: ParticipantClient, latency: float) -> None:
    print()
    print("=== custody map ===")
    print("world server process: its own receiver-gate Ed25519 key; per participant ONLY")
    print("  pinned owner principal id + root public key, worker public key, mandate id +")
    print("  scopes, latest verified authority bundle, bearer token, public world state.")
    print("  No owner private keys. No worker private keys. No wallets.")
    print("participant client A (this process, key dir): owner root private key, worker")
    print("  private key, owner wallet (grant/revoke/export), latest exported bundle,")
    print("  bearer token (memory only). Signs every authorization itself.")
    print("participant client B: same, with its own isolated key dir.")
    print()
    print("DISCLOSURE: this demo ran all three processes on one machine for")
    print("developer-preview purposes. The custody separation is by process + key dir,")
    print("not by machine.")
    print(f"measured revocation-propagation interval: {latency:.3f}s "
          "(local wallet.revoke -> admitted authority/refresh; NOT instant)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Separate key custody demo")
    parser.add_argument("--server", default=None)
    parser.add_argument("--launch", action="store_true")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    proc = None
    if args.launch:
        proc = _launch_server(args.port)
        server_base = f"http://127.0.0.1:{args.port}"
    elif args.server:
        server_base = args.server.rstrip("/")
    else:
        parser.error("pass --server URL or --launch")
        return 2

    exit_code = 0
    key_root = None
    try:
        demo, key_root, alice, bob, agreement_id, submit_resp, latency = run_demo(server_base)

        if proc is not None:
            print("--- restarting server (same data dir) ---")
            _stop_server(proc)
            proc = _launch_server(args.port, wipe=False)
            restarted = True
        else:
            restarted = False

        _after_restart(demo, alice, bob, agreement_id, submit_resp, server_base,
                       restarted=restarted)
        _print_custody_map(alice, bob, latency)

        print()
        print(f"{demo.checks - len(demo.failures)}/{demo.checks} checks passed")
        if demo.failures:
            print("FAILURES:", "; ".join(demo.failures))
            exit_code = 1
    except ClientError as exc:
        print(f"ABORT: {exc.code}: {exc.detail}")
        exit_code = 2
    except RuntimeError as exc:
        print(f"ABORT: {exc}")
        exit_code = 2
    finally:
        if proc is not None:
            _stop_server(proc)
        if key_root is not None:
            shutil.rmtree(key_root, ignore_errors=True)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
