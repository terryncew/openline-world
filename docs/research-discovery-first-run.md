# First run — the research/discovery path (v0.1.3)

Local developer preview. Everything here is synthetic: the experiment is
simulated, all participants (owner-researcher, verifier-1, observer-3) and
the evaluation were internally operated, all funding is simulated, and the
result shows no demonstrated advantage over ordinary sharing. Arbitrary
submitted-code execution is disabled — the receiver never runs
worker-submitted code.

Launch per `HANDOFF/LAUNCH.md`, then use the one invitation on the Exchange
board panel: **Explore a research question.**

## 1. Find the question and the agreed test

The invitation filters the board to the `research-question` listing:

> "Does structured receipt exchange improve a bounded computational search task?"

Open it. The listing carries the 12-field disclosure set — `proposed`,
`unproven`, `test_spec`, `required_contribution`, `resource_ceiling`,
`acceptance_criteria`, `contributor_receives`, `buyer_receives`,
`authorized_by`, `visibility_terms`, `reuse_terms`. The agreed test is the
`acceptance_criteria` field. The reuse terms carry the verbatim disclaimer:
"A receipt records an agreement; it does not establish
intellectual-property rights or scientific truth."

Record: `research/rooms/discovery-room-001/loop-transcript-v2.json`
(`"listing_id": "need-0330b96ce8bd"`, `"agreement_id": "agr-84b3f39b2dfb"`).

## 2. Inspect the accepted evidence and the result

The result panel shows the receiver-accepted artifact version:

- manifest `c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533`
- 40 artifacts checked, hashes matched — `pin_match: true`

Source: `research/rooms/repro-lab-001/EVIDENCE-MANIFEST.json` (frozen; never
re-run, never edited).

The outcome is preserved verbatim from the frozen aggregate
(`research/rooms/repro-lab-001/results/aggregate.json`):

**C did not beat B.** A: 0.0176±0.0078 · B: 0.0177±0.0077 ·
C: 0.0169±0.0057 · pooled_SE 0.00304 · frozen rule not met.

An unfavorable result completes the loop; it is not a loop failure.

## 3. Follow the simulated settlement

4/10 simulated-compute-units spent. Settlement `stl-42b3516009d4e1bd`
(seller 400c, buyer 600c) on the existing commission ledger — no second
ledger. Repeat submission returns the same transaction; it does not pay
twice.

## 4. Identify the affected v1 run and the corrected v2 run

- **v1 (affected):** `research/rooms/discovery-room-001/world-state/`,
  `loop-transcript.json`. Settled as `stl-4431fbaca0bf1f7e` DESPITE a
  manifest mismatch (`pin_match: false`). Marked **AFFECTED BY THE BINDING
  DEFECT** in `ROOM.json` and `REPORT.md`. Not repinned, not rewritten.
- **v2 (correction):** `research/rooms/discovery-room-001/world-state-v2/`,
  `loop-transcript-v2.json`. Declares the full correct pin; the receiver
  enforces it before any effect (`RESEARCH_MANIFEST_PIN_MISMATCH` on a
  stale pin — no acceptance, no result record, no settlement, no funds
  moved). v2 links both records without altering either.

The pin `604fe0d3...` is HISTORICAL — do not use it. The enforced pin is the
full `c4aa89ff...` sha above.

Full loop narrative: `HANDOFF/WALKTHROUGH.md`. Outside-reader exercise:
`HANDOFF/READER-TASK.md`.
