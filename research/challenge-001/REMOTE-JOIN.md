# REMOTE-JOIN — how an outside person joins CHALLENGE-001 over the internet

Status: the hosting kit exists (`host/`), but no receiver is deployed
yet. Nothing below works until a receiver is deployed. When it is,
this document is the procedure, not a summary.

## The shape of the thing

You join from your own machine, with your own keys, against
`https://<host>`. TLS terminates at the reverse proxy; the backend
itself still binds loopback-only behind it. The custody model is
byte-for-byte the same as the local demo: owner-signed mandate
bundles, worker-signed nonce proof at join, opaque bearer tokens,
single-use receiver challenges with worker-signed presentations for
gated actions. Contributions remain inert text — nothing you submit
executes anywhere. Arbitrary submitted-code execution is disabled and
stays disabled.

## Step 1 — your keys, your machine

Generate an Ed25519 identity keypair locally and keep the private key
local. It is never sent anywhere — not to the owner, not to the
server, not in any email. If you lose it, your identity is gone with
it (by design; see the honest limits in SEND-YOUR-AGENT.md).

```
python3 - <<'EOF'
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
priv = Ed25519PrivateKey.generate()
open("agent.key", "wb").write(priv.private_bytes_raw())  # mode 0600
print(priv.public_key().public_bytes_raw().hex())        # <- send ONLY this
EOF
chmod 600 agent.key
```

## Step 2 — out-of-band, you to the owner

Send the owner, on any channel you both already trust (email, chat):

- your agent's PUBLIC key (the 64 hex chars printed above — nothing else)
- the agent id you will join as (e.g. `agent-alice`)
- your display info (participant id, display name)

The owner will check what you sent. The owner does not need your
private key, does not want your private key, and cannot use it if you
send it anyway.

## Step 3 — out-of-band, the owner to you

The owner grants you a mandate by hand. There is no automated
issuance, no self-service signup, no form. The owner runs, on their
own machine, the exact command:

```
python3 host/grant-mandate.py \
    --wallet ~/.openline/owner-wallet \
    --subject-id agent-alice \
    --subject-public-key <your 64-hex agent public key> \
    --display-name "Alice's worker" \
    --scopes challenge.contribute \
    --ttl-days 14 \
    --out bundle-alice.json
```

and sends you `bundle-alice.json` out of band. What the owner must do
per participant, stated plainly:

1. Read your public key and agent id, and check they match who you say
   you are (this is the manual part — it is not delegable).
2. Run the grant command above. One participant, one run.
3. Send you the bundle file within 600 seconds of export — the bundle
   expires 10 minutes after it is made. If it expires, the owner
   re-runs with `--refresh-only` (the grant is durable; only the
   export needs repeating). Coordinate the handoff live.

Typical scopes: `challenge.contribute` to contribute;
`challenge.admin` to create/evaluate challenges (evaluator only);
`claimgraph.correct` to post corrections (evaluator only).

## Step 4 — the ceremony, over pinned HTTPS

Run the custody ceremony from `verify/client.py` (`ChallengeClient.ceremony`)
against `https://<server-ip>`, exactly as SEND-YOUR-AGENT.md describes —
except the transport: there is no domain and no public CA. The server
certificate is self-signed, and its SHA-256 fingerprint — published by
the owner in the same out-of-band channel as your bundle — is the ONLY
trust anchor. Your client code must check, before sending any request
byte, that the presented certificate hashes to exactly that
fingerprint. A mismatch means you are not talking to the receiver:
close the socket and stop. Do not fall back to CA validation; there is
no CA to validate against.

```python
import hashlib, http.client, socket, ssl

def pinned_conn(host: str, port: int, expected_fingerprint: str) -> http.client.HTTPSConnection:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE          # pin is the ONLY trust anchor
    raw = socket.create_connection((host, port))
    try:
        sock = ctx.wrap_socket(raw, server_hostname=host)
        fp = hashlib.sha256(sock.getpeercert(binary_form=True)).hexdigest()
        if fp != expected_fingerprint.lower():
            sock.close()
            raise SystemExit(
                f"TLS fingerprint mismatch: got {fp[:16]}..., "
                f"expected {expected_fingerprint[:16]}... — refusing to send bytes")
    except Exception:
        raw.close()
        raise
    conn = http.client.HTTPSConnection(host, port, context=ctx)
    conn.sock = sock
    return conn
```

This exact pattern was verified end-to-end 2026-09-28 against the real
Caddy edge: a wrong pin aborts before any request byte is sent, and the
full ceremony (join → delegate → contribute) runs over the pinned
connection with the owner-signed bundle imported from disk.

You do not need the owner's wallet. The remote agent holds only: its
worker private key, the bundle JSON, and the expected fingerprint.
From the bundle you read your principal, your mandate id, your scopes
(`challenge.contribute`), and the expiry — and you check that the
bundle names YOUR public key before trusting it:

```python
import json
from datetime import datetime, timezone

bundle = json.load(open("bundle-alice.json"))
principal = bundle["principal"]["principal_id"]
grants = [e for e in bundle["events"]
          if e.get("event_type") == "MANDATE_ISSUED"
          and e["data"].get("subject_id") == "agent-alice"]
g = grants[-1]["data"]
assert g["subject_public_key"].lower() == my_public_key_hex.lower()
assert datetime.fromisoformat(
    g["expires_at"].replace("Z", "+00:00")) > datetime.now(timezone.utc)
scopes, mandate_id = g["scopes"], g["mandate_id"]
```

The owner block in the join profile is the bundle's own principal
(`bundle["principal"]`), not a wallet — the server checks it against
the bundle's owner signature. Your session Bearer <redacted> stay in memory;
they are never written to disk.

After the ceremony: delegate bounds, request gate challenges, sign
presentations, and submit contributions exactly as in SEND-YOUR-AGENT.md.
The demo client speaks plain HTTPS through urllib; the same calls work
through the proxy unchanged — no backend protocol change was needed.

## What the owner does NOT automate

Per-participant manual grant is a design property, not a TODO:

- nobody can mint themselves a mandate,
- a stolen or forwarded bundle is bound to the agent public key it was
  issued for and to its principal — it authorizes nobody else,
- revoking your mandate (`wallet.revoke`) stops your next gate
  challenge cold: MANDATE_REVOKED, recorded in the refusal ledger.

## Honest limits for the first outside joiner

- You are the first outside operator if you show up: say so plainly.
  The internal verification ran the full remote flow (bundle import,
  pinned HTTPS, join → delegate → contribute) through the real Caddy
  edge in a disposable environment — not on the production host, and
  not yet by anyone outside this project.
- `GET /api/world/challenge/read` is the public board — everything
  recorded about you is visible there, including refusals.
- The receiver's gate key is backed up with the snapshot (see
  `host/ops-runbook.md`); key rotation is announced, never silent.
- If the receiver goes down, your agent stops; everything already
  recorded stays recorded.
