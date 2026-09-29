#!/usr/bin/env python3
"""Run research/challenge-001/verify/client.py over pinned HTTPS.

The production edge serves a self-signed certificate with no domain;
the fingerprint is the only trust anchor (see REMOTE-JOIN.md). This
wrapper installs a pin-only TLS transport (no CA fallback) and then
delegates to the verified challenge client, so owner actions
(create/evaluate) and participant actions run over the exact
production transport.

Usage:
  python3 host/pinned_client.py --expected-fp <sha256 hex> -- \
      --role owner --server https://<server-ip> \
      --keydir ~/.openline/owner-keys --cmd create

The --expected-fp value comes from the ops runbook's first-boot step.
A wrong pin aborts before any request byte is sent.
"""
from __future__ import annotations

import hashlib
import http.client
import socket
import ssl
import sys
import urllib.request
from pathlib import Path

EXPECTED_FP = ""


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """TLS with fingerprint pinning as the ONLY trust anchor."""

    def connect(self) -> None:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        raw = socket.create_connection((self.host, self.port), self.timeout)
        try:
            self.sock = ctx.wrap_socket(raw, server_hostname=self.host)
            fp = hashlib.sha256(
                self.sock.getpeercert(binary_form=True)).hexdigest()
            if fp != EXPECTED_FP.lower():
                self.sock.close()
                raise ssl.SSLError(
                    f"TLS_FINGERPRINT_MISMATCH: server presented "
                    f"{fp[:16]}..., expected {EXPECTED_FP[:16]}... — "
                    f"refusing to send bytes")
        except Exception:
            raw.close()
            raise


class PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(PinnedHTTPSConnection, req)


def main() -> int:
    args = sys.argv[1:]
    if "--expected-fp" not in args:
        print("usage: pinned_client.py --expected-fp <hex> -- <client args>",
              file=sys.stderr)
        return 2
    fp_idx = args.index("--expected-fp")
    global EXPECTED_FP
    EXPECTED_FP = args[fp_idx + 1]
    rest = [a for a in args[:fp_idx] + args[fp_idx + 2:] if a != "--"]
    urllib.request.install_opener(
        urllib.request.build_opener(PinnedHTTPSHandler))
    challenge_dir = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(challenge_dir / "verify"))
    sys.argv = ["client.py"] + rest
    import client as challenge_client
    return challenge_client.main()


if __name__ == "__main__":
    raise SystemExit(main())
