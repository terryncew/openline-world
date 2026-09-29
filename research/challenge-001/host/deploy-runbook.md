# CHALLENGE-001 — deploy runbook: fresh server to live receiver

Every command below is copy-pasteable. Nothing here is merged to
master, published, or sent to anyone. Provisioning the server (step 1)
spends money — that step, and only that step, needs the owner's word.

Cost: Hetzner cx23 (2 vCPU shared x86 / 4 GB / 40 GB SSD / 20 TB
traffic), Nuremberg nbg1, **€5.49/month (~$6.40)**. No other paid
service. No domain.

## What you need before starting

- A Hetzner Cloud account with a payment method on file.
- An SSH public key added to the Hetzner project.
- This repo checked out on your own machine at branch
  `work/challenge-001`.

## 1. Provision (the spending step)

Hetzner Cloud console → New server:

- Location: **Nuremberg (nbg1)** — EU; the cheapest x86 type lives here
- Image: **Debian 12**
- Type: **Shared vCPU → cx23** (€5.49/mo)
- Networking: public IPv4 (default)
- SSH key: yours

Write down the server's public IPv4. Call it `<server-ip>` below.

## 2. Base setup (as root on the server)

```bash
apt-get update && apt-get install -y python3 python3-cryptography git curl \
  debian-keyring debian-archive-keyring apt-transport-https

# Caddy, from the official repo (v2.10.x)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
caddy version   # expect v2.10.x

# Service user and directories
useradd -r -m -s /usr/sbin/nologin openline
mkdir -p /opt/openline-world /var/lib/openline-world/backups \
  /etc/openline-world /var/log/caddy
```

## 3. Deploy the code

```bash
git clone --branch work/challenge-001 \
  https://github.com/terryncew/openline-world.git /opt/openline-world
# (use the real repo URL for this checkout)
chown -R openline:openline /opt/openline-world /var/lib/openline-world
```

## 4. Configure

```bash
# Backend env (WORKSHOP_HOST stays 127.0.0.1 — never bind publicly)
cp /opt/openline-world/research/challenge-001/host/openline-world.env \
   /etc/openline-world/env
chown root:openline /etc/openline-world/env
chmod 640 /etc/openline-world/env

# Backend service
cp /opt/openline-world/research/challenge-001/host/openline-world.service \
   /etc/systemd/system/openline-world.service

# Caddy edge: substitute the real server IP, then install
sed 's|<server-ip>|<server-ip>|' \
  /opt/openline-world/research/challenge-001/host/Caddyfile \
  > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile   # expect "Valid configuration"

systemctl daemon-reload
systemctl enable --now openline-world.service
systemctl restart caddy.service
```

## 5. Verify on the host

```bash
# Backend answers on loopback only
curl -s http://127.0.0.1:8471/api/world/challenge/read | head -c 120; echo
# Edge answers on the public IP over TLS (fingerprint not yet pinned —
# this is the pre-publication check, run on the host itself)
curl -sk https://<server-ip>/api/world/challenge/read | head -c 120; echo
# Access log carries metadata only (no headers, no bodies)
tail -2 /var/log/caddy/challenge-access.log
```

## 6. Extract and publish the TLS fingerprint

On the host:

```bash
openssl s_client -connect 127.0.0.1:443 </dev/null 2>/dev/null \
  | openssl x509 -outform DER 2>/dev/null | sha256sum
```

Send the fingerprint to each invited participant over the
already-trusted out-of-band channel (the same channel as their mandate
bundle). The fingerprint persists across Caddy restarts; a host
rebuild generates a new one — republish before anyone connects.

## 7. Create the challenge (owner, from your own machine)

The owner needs the owner key dir used in the internal demo
(`~/.openline/owner-keys` in the examples; use the real one). The
pinned transport is `host/pinned_client.py`:

```bash
cd /path/to/openline-world   # branch work/challenge-001
python3 research/challenge-001/host/pinned_client.py \
  --expected-fp <fingerprint from step 6> -- \
  --role owner --server https://<server-ip> \
  --keydir <owner-keydir> --cmd create \
  --idempotency-key owner-create-live-1
```

Expect `"decision": "ALLOWED"` and a receipt id. The challenge board
is now live at `https://<server-ip>/api/world/challenge/read`.

## 8. Invite the participant (owner, from your own machine)

The participant sends you their agent public key + agent id out of
band (REMOTE-JOIN.md step 2). Then, per participant, by hand:

```bash
python3 research/challenge-001/host/grant-mandate.py \
  --wallet <owner-wallet> \
  --subject-id <their-agent-id> \
  --subject-public-key <their-64-hex-pubkey> \
  --display-name "<their display name>" \
  --scopes challenge.contribute \
  --ttl-days 14 \
  --out bundle-<name>.json
```

Send `bundle-<name>.json` plus the fingerprint within 600 seconds of
export (the bundle expires 10 minutes after it is made). The
participant follows REMOTE-JOIN.md from their own machine.

## 9. Shutdown

Graceful (keeps the server, stops the receiver):

```bash
systemctl stop openline-world.service caddy.service
```

Every mutation is persisted synchronously; shutdown mid-ceremony
loses at most the in-flight request. Restart with
`systemctl start openline-world.service caddy.service` — the
fingerprint is unchanged (Caddy storage persists), so participants
need no new pin.

Full teardown (destroys everything, stops the spending):

1. Pull a final backup first if you want the record:
   `scp openline@<server-ip>:/var/lib/openline-world/backups/snapshot-<date>.tar.gz ~/challenge-backups/`
2. Hetzner console → server → **Delete**. Billing stops at deletion.
3. Tell the participant the receiver is gone. Their keys stay theirs;
   the recorded history is whatever you pulled.

Reversibility: deleting the server destroys the receiver, the TLS
identity, and the gate key. The invitation is retractable any time
before or after: `wallet.revoke` on the owner machine stops the
participant's next gate challenge cold (MANDATE_REVOKED, recorded).
