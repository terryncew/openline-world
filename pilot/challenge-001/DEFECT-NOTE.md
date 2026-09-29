# DEFECT NOTE — session freshness repair (2026-09-29)

Public record of a defect found in the deployed session-freshness
repair, what it did, and what replaced it. Preparation is underway;
enrollment is not open.

## What broke
The first version of the session-freshness repair (deployed
2026-09-29, source commit `f940132` on `work/challenge-001`) handled
an expired authority bundle by marking the session **revoked** —
permanently. The intended behavior was: refuse the refresh as stale,
let the participant supply fresh evidence through the authenticated
path, and recover on the same session.

The bug: the refresh path treated "the admitted bundle no longer
verifies" (which includes ordinary bundle expiry after 10 minutes of
idle) as "the mandate is dead", and wrote a terminal revocation. The
recovery path destroyed what it was built to recover. One internal
test session was revoked this way without the owner ever revoking it;
its record is preserved, not erased.

## Why the tests missed it
The pre-deploy proof idled a real session for 310 seconds — inside the
600-second bundle TTL. The bundle-expiry path was never hit. The unit
tests used fresh bundles throughout. The failure mode needs
idle-at-refresh > bundle TTL, which no test reached.

## The correction (deployed 2026-09-29)
- An expired admitted bundle now refuses the refresh as
  `STANDING_BUNDLE_STALE`. **Expiry alone never writes a revocation.**
  The refusal mutates nothing.
- Fresh evidence is supplied through the authenticated
  `POST /api/world/authority/refresh` path, still checked against
  current authority: it cannot revive an owner-revoked, retired, or
  expired mandate.
- Revocation still wins any race with recovery: a genuinely revoked
  mandate is still refused, and can never be revived by fresh evidence.

Proven before deploy: real idle past the 10-minute bundle TTL →
stale refusal (no revocation written) → fresh evidence →
refresh on the SAME session, no retirement. Revocation-vs-recovery
races, restarts, and both timing boundaries (5-minute freshness,
10-minute bundle TTL) covered separately and together.

## Source
Corrected source: `work/challenge-001` on
https://github.com/terryncew/openline-world
(commit `fdf8f82`; `f940132` kept as the historical candidate showing
the defect). Server deployed from the corrected source; the receiver
key is unchanged.

## What this means for participants
If your session goes quiet for a while, refresh it before acting:

```sh
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd refresh-standing
```

If the bundle expired, you get `STANDING_BUNDLE_STALE` (not a
revocation). Then:

```sh
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd refresh-authority
python3 client/trust_anchored_client.py --root-pem root-ca.crt -- \
  --role contrib-a --server https://188.245.66.128 \
  --keydir ./my-keys --cmd refresh-standing
```

Same session, same identity, no rejoin, no retirement.
