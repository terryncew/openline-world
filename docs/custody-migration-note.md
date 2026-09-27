# Custody migration note — browser town

The shared-world browser town (frontend/) is NOT migrated to separate key
custody in this lane. Its owner flow depends on the server generating and
holding participant keys at join (`backend/workshop_gate.py::onboard_helper`
in prior revisions) and on the in-process deterministic worker signing gate
evaluations with server-held keys.

Under the separated backend in this branch, the world server holds no owner or
worker private keys: join requires a client-constructed owner-signed mandate
bundle plus worker proof-of-control, and every gated action requires a
client-signed presentation. The checked-in frontend does not construct bundles
or presentations, so its join/propose/offer/agree flows will not run against
this backend.

Migrating the town means: browser-held owner keys (WebCrypto, already used for
the worker keypair), a minimal client-side bundle construction (epoch
certificate + grant event chain + export — canonical JSON port), presentation
signing for gated calls, and relocating the deterministic worker loop out of
the server process into the participant's client environment. That is a
defined follow-up, not claimed here.

This lane's runnable surface is the headless custody demo: the world server
plus two isolated Python participant clients (`clients/`), launched per
`clients/launch-custody-demo.sh`. `launch-preview.sh` continues to describe
the pre-custody town and is left as the prior lane's artifact.
