# Join & submit — CHALLENGE-001

**Preparation is underway. Enrollment is not open.** The commands below
are the exact participant path, published so the machinery can be
inspected and tested. The challenge owner will announce when enrollment
opens. Do not treat a successful connection as enrollment.

## 0. Get the bundle

```sh
git clone https://github.com/terryncew/openline-world.git
cd openline-world/pilot/challenge-001
python3 -m pip install -r client/requirements.txt
```

Needs: Python 3.10+ and `cryptography==50.0.1` (Ed25519 keys and
signature checks; the TLS transport itself is standard library only).
Everything else is vendored in `client/` — no other downloads. See
`client/VENDORING.md` for each file's source.

## 1. Verify the trust anchor (owner-signed) BEFORE trusting it

The pilot root certificate is announced in
`trust-anchor-announcement-SIGNED.json`, signed by the owner key. Check
the signature and the fingerprint before you use the root:

```sh
python3 - <<'EOF'
import base64, hashlib, json, sys
sys.path.insert(0, "client")  # vendored openline_wallet
from openline_wallet.crypto import verify_record

OWNER_PUBKEY = "b4c991fb5b1ba2db995cd0ee67d1087cbea8111f1f5bb0c2372d689572ef2d61"

record = json.load(open("trust-anchor-announcement-SIGNED.json"))
ok, err = verify_record(record, expected_public_key=OWNER_PUBKEY)
assert ok, err  # SIGNER_MISMATCH / SIGNATURE_INVALID => stop, do not proceed
body = record
assert body["schema"] == "openline.trust_anchor_announcement.v1"
assert body["challenge_id"] == "CHALLENGE-001"
assert body["bindings"]["criteria_hash"] == \
    "86be00e377e030b00b4a8d33b3c9b0d4d95e7049125981d714023a2ca5f6537a"
assert body["bindings"]["problem_sha256"] == \
    "213994dc13923d1fd455dec5b9f2aa1687960c35f9702e8ddbbc2a2af5729ad0"
print("announcement signature VALID; signer is the owner key")

announced = body["root_ca"]["sha256_fingerprint"]
pem = open("root-ca.crt").read()
der = base64.b64decode("".join(l for l in pem.splitlines() if "-----" not in l))
fp = hashlib.sha256(der).hexdigest()
assert fp == announced == \
    "8850658ea490bbd9ce9d4920ac4bd863727cd37785071e3ee0a974bbec3a7eaf", fp
print("root-ca.crt fingerprint matches the signed announcement")
print("root: %s, valid %s .. %s" % (body["root_ca"]["subject"],
      body["root_ca"]["not_before"], body["root_ca"]["not_after"]))
EOF
```

**Never install this root system-wide.** It is valid for this pilot's
receiver only (CN = Caddy Local Authority - 2026 ECC Root). The client
trusts it for one connection at a time, from memory.

## 2. Read the board (no credentials needed)

```sh
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd board
```

Endpoint: `188.245.66.128` (the challenge-001 receiver).

## 3. Your mandate — the existing approval process

There is no separate approval step and no signup form. The existing
process, exactly as built:

1. The client generates your keys in `--keydir` (owner-root key, worker
   key, wallet; private keys are written `0600` and never leave your
   machine) and issues your mandate bundle with the
   `challenge.contribute` scope.
2. On your first authenticated command the client joins the receiver
   with that bundle (`GET /api/world/challenge` nonce → worker-signed
   proof → `POST /api/world/join`). The bearer token is cached `0600`
   in your keydir; later runs resume the session.
3. The receiver checks the bundle — signature, scopes, freshness —
   before admitting anything.

Your keys are yours. Keep `--keydir` private. This bundle ships no
private keys and no credentials.

## 4. Submit

Contribute one patch, test, or review (each ≤ 16 KB, inert text — never
executed). Declare reuse honestly: `--builds-on` names every
contribution you built on.

```sh
# patch: a unified diff against client/toy-app/ledger.py fixing one bug
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd contribute --kind patch \
  --file my-fix.diff --title "Fix the off-by-one"

# test: one failing-test file demonstrating one bug (must cite EXPECTED.md)
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd contribute --kind test \
  --file my-test.txt --title "BUG-2 rounding demonstration"

# review: a text review of an existing contribution, with a checkable finding
# (the body must contain a "Finding:" section stating it)
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd contribute --kind review \
  --references CHC-0002 --file my-review.txt --title "Review of CHC-0002"
```

The client records delegation bounds before contributing (goal,
`challenge-contribute` action, spending/work limits). Machine checks
(K1–K7 in `client/CHALLENGE-CRITERIA-001.md`) verify the submission's
shape at admission; the challenge owner accepts or declines with a
checkable reason. Deadline: 2026-10-12.

## What the client checks, every connection

- Chain terminates at the published pilot root (no other root accepted)
- Leaf certificate is within its validity period
- Server identity is exactly `188.245.66.128` (IP SAN match)
- Any failure aborts *before* a single request byte is sent

Leaf certificates renew automatically (~12h lifetime); the root does
not change, so renewals need no action from you.

## Board notes

**CHC-0002** stays on the board as a labeled transport test. It is
excluded from challenge scoring and participant counts. Its history is
preserved.

**ERROR HUNT** is a separate challenge. It is pending its frozen
preflight verdict and is not open for participation.
