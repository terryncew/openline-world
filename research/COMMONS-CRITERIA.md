<!-- FROZEN 2026-09-26 — receiver-owned acceptance criteria for RESEARCH-COMMONS-001.
Do not edit; amend only by explicit owner authorization, as a new dated revision.
Implemented by backend/package_acceptance.py (deterministic port). -->

# COMMONS-CRITERIA.md — research package acceptance (frozen 2026-09-26)

These are the receiver's declared checks for admitting a research package
into the commons. They are STRUCTURAL and MECHANICAL: they verify the
package's shape, byte binding, and reproducibility. They are NOT factual
verification of any claim in the package.

**Acceptance = all of K1–K7 pass.** Any failing criterion → verdict
`REJECTED` → the receiver refuses the package (`STOPPED` +
`PACKAGE_ACCEPTANCE_FAILED`, failed criteria named).

## The checks

- **K1 — manifest integrity.** The package bytes parse as JSON. The manifest
  has `schema: "openline.research.package.v1"`. The manifest's `files` map
  names exactly the files carried in the package (`study.py`, `input.csv`),
  and each named sha256 equals the sha256 of that file's carried bytes.
- **K2 — required files present and non-empty.** `study.py` and `input.csv`
  are present and non-empty.
- **K3 — deterministic reproduction.** `study.py` is executed in the
  receiver's sandbox (separate OS process; recorded limits: 10s CPU, 256MB
  address space, 1MB max file size, 15s wall clock, 64KB stdout cap, fresh
  temp working directory containing only `study.py` + `input.csv`, stripped
  environment). It must exit 0 within the limits and its stdout must equal
  `manifest.expected_result` byte-for-byte.
- **K4 — citations present.** The manifest lists ≥ 2 citations, each with a
  locator (a URL or a `fixture://` / `producer://` locator). Citation
  presence is not citation support: the checks do not verify that a cited
  source supports the claim.
- **K5 — limitations stated.** The manifest has a non-empty `limitations`
  string.
- **K6 — producer review labeled.** The manifest has a `producer_review`
  string beginning with the exact header `PRODUCER-SUPPLIED REVIEW` and
  stating that it grants no acceptance authority. Self-review grants nothing.
- **K7 — no overclaim phrases.** The manifest's claim, title, limitations,
  producer review, and citation notes contain no overclaim phrases
  (`self-improv*`, `RSI` as a word, `peer review`, `scientifically proven`,
  `ground truth`, `fiduciary`). A negated mention inside `limitations`
  ("not peer reviewed", "no ground truth claimed") is permitted; an
  unnegated mention anywhere fails the check.

## Scope note (carried verbatim in every evaluation record)

"Passed these named checks under these conditions" is not scientific truth.
The checks verify: the manifest is intact and bound to its files (K1), the
required files exist (K2), the study reproduces its declared output in the
sandbox (K3), citations are present — not that they support the claim (K4),
limitations are stated (K5), the producer's review is labeled as granting
nothing (K6), and no overclaim phrases appear (K7). Nothing here verifies
that the package's claim is true.

## Explicit non-claims

This lane does not claim: automated peer review, scientific truth, RSI, or
outside adoption. Acceptance admits the artifact for display in this local
commons under the owner's publication rules; it is not publication to the
internet.

## Isolation (from research/COMMONS-BRIEF.md, frozen 2026-09-26)

The run is isolated iff the run's records show: (a) the worker-signed
presentation bound to `package_sha256`; (b) the receiver-signed gate receipt
for the submission action; (c) the evaluation record naming the pinned
`package_sha256` and the sandbox limits; (d) the stored dispatch whose
`package_sha256` equals the pinned hash. The acceptance record is signed by
the receiver gate key in the receiver process; the worker never signs it.
The study code is never imported into the receiver process.
