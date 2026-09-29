#!/usr/bin/env python3
"""Run the CHALLENGE-001 challenge client over a root-anchored TLS transport.

Trust model (pilot-scoped, replaces per-rotation leaf pinning):
  - The ONLY trust anchor is the published Caddy local-CA root certificate
    for challenge-001, delivered via the owner-signed trust-anchor
    announcement. It is loaded into a PER-CONNECTION trust store built
    fresh for every connection. It is NEVER installed system-wide.
  - The client validates, for every connection:
      (a) the full certificate chain terminates at the published root
          (the server must present the intermediate; a chain that does
          not end at the published root is rejected);
      (b) the leaf's validity period covers the current time;
      (c) the endpoint identity matches EXACTLY: the leaf must carry
          IP SAN 188.245.66.128, which must equal the server we dialed.
          Any other IP or any DNS name fails.
  - On ANY validation failure the connection aborts inside connect(),
    before a single application byte is written.

Usage (from this bundle's directory):
  python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
      --role contrib-a --server https://188.245.66.128 \
      --keydir ./my-keys --cmd board

The --root-pem value comes from the owner-signed trust-anchor
announcement (trust-anchor-announcement-SIGNED.json), whose signature
the participant verifies against the owner root public key they
already hold from their invitation bundle before trusting it.

Standard library only. The vendored challenge client lives in this
same directory (client.py, participant.py, openline_wallet/); see
VENDORING.md for sources.
"""
from __future__ import annotations

import http.client
import os
import socket
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT_PEM = ""
EXPECTED_HOST = "188.245.66.128"

BUNDLE_DIR = Path(__file__).resolve().parent


def _tunneled_socket(host, port, timeout=20):
    """TCP to host:port, optionally via an HTTP CONNECT egress proxy.

    A proxy is used only when the standard HTTPS_PROXY / https_proxy /
    ALL_PROXY / all_proxy environment variables are set (proxy
    credentials come from those variables and are never printed or
    persisted). Without them, this is a direct TCP connection.
    Loopback destinations always bypass the proxy.
    """
    import base64
    import ipaddress
    from urllib.parse import urlparse
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = host.lower() in ("localhost",)
    proxy_url = (os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
                 or os.environ.get("ALL_PROXY") or os.environ.get("all_proxy"))
    if loopback or not proxy_url:
        return socket.create_connection((host, port), timeout)
    u = urlparse(proxy_url)
    s = socket.create_connection((u.hostname, u.port or 3128), timeout)
    lines = [f"CONNECT {host}:{port} HTTP/1.1", f"Host: {host}:{port}"]
    if u.username:
        auth = base64.b64encode(
            f"{u.username}:{u.password or ''}".encode()).decode()
        lines.append(f"Proxy-Authorization: Basic {auth}")
    lines += ["", ""]
    s.sendall("\r\n".join(lines).encode())
    head = b""
    while b"\r\n\r\n" not in head:
        chunk = s.recv(4096)
        if not chunk:
            raise ConnectionError("proxy closed the CONNECT")
        head += chunk
    status = head.split(b"\r\n", 1)[0].decode("iso-8859-1", "replace")
    if " 200" not in status:
        raise ConnectionError(f"proxy refused CONNECT: {status}")
    return s


def build_context(root_pem: str) -> ssl.SSLContext:
    """Per-connection trust store: the published root and nothing else."""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.verify_mode = ssl.CERT_REQUIRED
    ctx.check_hostname = True
    # cadata (not cafile/capath): the anchor lives in memory for this
    # connection only. No system trust store is consulted or modified.
    ctx.load_verify_locations(cadata=root_pem)
    # Hardening: no legacy protocol versions, no compression.
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.options |= ssl.OP_NO_COMPRESSION
    return ctx


class TrustAnchoredHTTPSConnection(http.client.HTTPSConnection):
    """TLS anchored at the published pilot root, with exact IP identity."""

    def connect(self) -> None:
        if self.host != EXPECTED_HOST:
            raise ssl.SSLError(
                f"UNEXPECTED_ENDPOINT: dialing {self.host}, pilot expects "
                f"{EXPECTED_HOST} — refusing before connect")
        ctx = build_context(ROOT_PEM)
        raw = _tunneled_socket(self.host, self.port or 443,
                               timeout=self.timeout)
        try:
            # server_hostname as the IP string: with check_hostname=True,
            # Python matches it against the leaf's IP SANs (RFC 6125 /
            # RFC 2818 IP-literal handling). A DNS SAN or a different IP
            # SAN fails here, during the handshake, before any HTTP byte.
            self.sock = ctx.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


class TrustAnchoredHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(TrustAnchoredHTTPSConnection, req)


def main() -> int:
    args = sys.argv[1:]
    if "--root-pem" not in args:
        print("usage: trust_anchored_client.py --root-pem <root-ca.crt> -- "
              "<client args>", file=sys.stderr)
        return 2
    pem_idx = args.index("--root-pem")
    global ROOT_PEM
    ROOT_PEM = Path(args[pem_idx + 1]).read_text(encoding="utf-8")
    rest = [a for a in args[:pem_idx] + args[pem_idx + 2:] if a != "--"]
    # Build an opener with ONLY the trust-anchored handler. The default
    # build_opener() would add ProxyHandler, which rewrites the request
    # host to the egress proxy and breaks the manual tunnel.
    opener = urllib.request.OpenerDirector()
    opener.add_handler(TrustAnchoredHTTPSHandler())
    urllib.request.install_opener(opener)
    # Standalone bundle: the vendored challenge client lives beside this
    # file (see VENDORING.md); no machine-local paths are referenced.
    if str(BUNDLE_DIR) not in sys.path:
        sys.path.insert(0, str(BUNDLE_DIR))
    sys.argv = ["client.py"] + rest
    import client as challenge_client
    return challenge_client.main()


if __name__ == "__main__":
    raise SystemExit(main())
