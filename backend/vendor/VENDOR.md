# Vendored dependencies

This directory pins the two OpenLine library checkouts the workshop backend
imports, so a fresh extraction of this repo runs without sibling checkouts.

- `openline_wallet/` — snapshot of `~/workspace/openline-wallet/src/openline_wallet`
  at commit `2c60e3a830b79fc5292066b10d23ff94811613d8`
  License: Apache-2.0 (see `openline-wallet-LICENSE.txt`)
- `openline_claim_graph/` — snapshot of
  `~/workspace/openline-claim-graph/src/openline_claim_graph`
  at commit `30a3ee1316d0b388fd4f20fa49e25556fef1985b`
  License: MIT (see `openline-claim-graph-LICENSE.txt`)

Both are Terrynce White's own packages; only the `src/` trees are vendored
(no tests, docs, or experiment records). External runtime requirement for
both is `cryptography`, declared in `backend/requirements.txt`.

`workshop_gate.py` and `claim_graph_chapter.py` add this directory to
`sys.path` instead of the sibling checkouts.
