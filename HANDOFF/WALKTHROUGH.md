# WALKTHROUGH — one complete loop

Question → agreement → pinned evidence → result → simulated settlement.

All paths are relative to the extract root. All funding is simulated
(`simulated-compute-units` on the existing commission ledger). All
participants (owner-researcher, verifier-1, observer-3) and the evaluation
were internally operated — deterministic test clients, not outside parties.

## 1. The question

`research/rooms/discovery-room-001/seed_discovery_v2.py` (v2; v1 is
`seed_discovery.py`) posts a `research-question` listing on the existing
Exchange board:

> "Does structured receipt exchange improve a bounded computational search task?"

The listing carries a 12-field disclosure set (`proposed`, `unproven`,
`test_spec`, `required_contribution`, `resource_ceiling`, `acceptance_criteria`,
`contributor_receives`, `buyer_receives`, `authorized_by`, `visibility_terms`,
`reuse_terms`). The reuse terms carry the verbatim disclaimer: "A receipt
records an agreement; it does not establish intellectual-property rights or
scientific truth."

Records: `research/rooms/discovery-room-001/loop-transcript-v2.json`
(`"listing_id": "need-0330b96ce8bd"`).

## 2. The agreement

verifier-1 proposes a bounded contribution; owner-researcher (the counterpart)
agrees. The gate evaluates worker-signed presentations at each step
(authorization). observer-3's attempt to agree is refused
(`WORLD_RULE_NOT_COUNTERPART`) — a real refusal on the real path.

Records: `loop-transcript-v2.json` (`"agreement_id": "agr-84b3f39b2dfb"`).

## 3. The pinned evidence

The receiver runs its own deterministic verification over the FROZEN
evidence manifest — it never executes worker-submitted code:

- `research/rooms/repro-lab-001/EVIDENCE-MANIFEST.json`
- sha256 `c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533`
- 40/40 artifact hashes recomputed and matched.

The v2 listing declares this exact pin. Binding is enforced: a declared pin
that does not exactly equal the evaluated manifest sha256 refuses acceptance
AND settlement before any effect (`RESEARCH_MANIFEST_PIN_MISMATCH`).

## 4. The result

The experiment outcome is preserved verbatim from the frozen aggregate
(`research/rooms/repro-lab-001/results/aggregate.json`) — never re-run:

**C did not beat B.** A: 0.0176±0.0078 · B: 0.0177±0.0077 · C: 0.0169±0.0057 ·
pooled_SE 0.00304 · frozen rule not met. The unfavorable result completes the
loop; it is not a loop failure.

## 5. The simulated settlement

4/10 simulated-compute-units spent; settlement `stl-42b3516009d4e1bd`
(seller 400c, buyer 600c) on the existing commission ledger. No second ledger.

## The v1 record (preserved, marked)

The v1 loop (`seed_discovery.py`, `loop-transcript.json`,
`research/rooms/discovery-room-001/world-state/`) settled as
`stl-4431fbaca0bf1f7e` DESPITE a manifest mismatch (`pin_match: false`:
declared `604fe0d3...` vs evaluated `c4aa89ff...`). It is marked
**AFFECTED BY THE BINDING DEFECT** in `ROOM.json` and `REPORT.md`. It was
not repinned or rewritten. The v2 loop links both records without altering
either.

## The stale pin (HISTORICAL — do not use)

`604fe0d3...` was copied into the v1 listing from the research room's
`ROOM.json` pin, which predates the manifest's regeneration over its final
40 artifacts. It is HISTORICAL. The corrected pin is the full
`c4aa89ff...` sha above, declared by the v2 listing and enforced by the
receiver. The frozen research evidence was not edited to "fix" this.
