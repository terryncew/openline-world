# CHALLENGE-001 — replication candidate prep (research)

Researched 2026-09-28. Primary sources only. No outreach, no contact, no
commitments. The maintainer has not agreed to participate in anything; the
public invitation is an invitation, not a partnership.

## Pinned source

- Repository: https://github.com/junru-zhu/failure-transparent-agents
- Public, not archived, created 2026-09-10. As of 2026-09-28: 1 star, 0 forks,
  0 watchers, 19 commits, 2 open issues.
- Version: v0.3.0 (GitHub release, not prerelease), published 2026-09-12.
  - Release zip SHA-256: `b6c3b529310c63ab6104a76fe94dd981b95ef965f22533c1ce082b5653e52a62`
  - Six-model results zip SHA-256: `9924904c89240f18bfff28a78aed82496f5cd8bfc46e5af73cba1c8e6f04a5ff`
  - Tag `v0.3.0` commit: `888585a83d8adbecba5bc6ea7b15d7d1ca1ec80f`
  - main tip: `0cb798d4aa78f123b5c7b1b2b26684e776d90301` (2026-09-12,
    paper-figures polish after the release commit)
- License: MIT. Root `LICENSE`, copyright Junru Zhu 2026.
  SHA-256 of `LICENSE`: `bb86fab5273b6e8e01b40b93f79be9085f0001fc1319a8c671f261fd97ca6b56`.
- Paper: `paper/main.pdf`, eight pages, IEEE two-column.
  SHA-256 (v0.3.0): `314959db950d8982d74b44a60ea9f8a15d1af46b56eb9421b968eb414b990982`.

## The invitation still stands

- README "Extend the benchmark" lists **"independent replications on new
  models and serving stacks"** as a high-impact contribution.
- CONTRIBUTING.md: "**Replicate the findings.** Run the benchmark through
  another provider, region, or open-weight serving stack."
- GitHub issue #1, "Replication wanted: evaluate an additional open-weight
  model or serving stack," OPEN since 2026-09-11: "report the exact model
  snapshot, provider/interface, parameters, 600-response coverage, latency,
  tokens, estimated cost, and label source... the replication must state its
  measurement status clearly."
- No independent replication found: 0 forks, 1 star, nothing in the issues
  beyond the invitation, no replication found via web search.

## Reported measurements — CLAIMS TO TEST, not facts

Scope: the **confirmatory three-model study only** (frozen run ID
`confirmatory-20260910-v1`; 100 tasks x 3 models x 3 conditions x 2 repeats
= 1,800 responses). Everything below comes from `docs/model_judge_report.md`
and `paper/main.pdf`. The post-confirmatory six-model extension is out of
scope for this challenge.

CLAIM 1 — false-success rates, model-judged, per condition:
- Baseline: **32.0%**, 95% CI [23.8, 40.3]
- Transparency instruction: **11.8%**, 95% CI [8.0, 16.0]
- Evidence contract (four fields STATUS/EVIDENCE/LIMITATION/NEXT_ACTION):
  **1.3%**, 95% CI [0.3, 2.7]

CLAIM 2 — direction holds within every model:
- Claude Sonnet 5: 36.0% -> 0.0% (baseline -> evidence contract)
- NVIDIA Nemotron Super 3 120B: 31.0% -> 2.0%
- GPT-5.6 Terra: 29.0% -> 2.0%

CLAIM 3 — companion metrics move with the intervention:
- Fabricated details: 37.5% -> 17.3% -> 3.3%
- Useful response: 69.8% -> 90.2% -> 98.3%
- Over-refusal: 0.0% -> 0.0% -> 0.5% (no increase detected)

CLAIM 4 — what the labels are:
- Frozen judge: `gpt-5.4-mini`, snapshot `gpt-5.4-mini-2026-03-17`.
- Frozen label set: 1,800 unique schema-valid records, SHA-256
  `d864203bda8e3fde4cfce5f9688c1870c30c724d5e1a5837f249031789398809`.
- Frozen benchmark: `data/confirmatory_scenarios.jsonl`, 100 tasks, SHA-256
  `4bb2f63bc0bf03570021246943d4c1d871d0fe29e78edcdcfe740c0f3ee716ea`.
- CIs are 95% hierarchical bootstrap over 100 base-task clusters; paired
  comparisons use 100,000 sign-flip draws with Holm adjustment (seed
  `20260910`).

CONFIRMED CAVEAT (author's own, in README, release notes, and report):
**Version 0.3.0 is model-judge-only and not human-validated.** Human
validation is an explicitly deferred future workflow. The replication checks
the arithmetic and the direction, nothing more.

## Resources — measured costs from the author's arm reports

Original study, all costs measured by the author:
- GPT-5.6 Terra arm (600 responses): $0.65
- Claude Sonnet 5 arm (600 responses): $2.38 ($2.44 with recovery)
- NVIDIA Nemotron arm (600 responses): $0.06
- Model-judge scoring (1,800 labels, GPT-5.4-mini): $3.69
- Whole confirmatory study: roughly $6.80.

Challenge resource envelope:
- Tier 1 (hash verification, offline re-derivation, hand-annotation,
  provenance review): $0. No API key. No network. Python 3.12, stdlib only.
  The author's own offline validation (`make check-dataset`, `make test`,
  `make full-scale-validation`) makes zero network calls.
- Tier 2 (optional fresh sample, ~90 responses with a different model,
  scored with a different judge): expected $0.50-$3.00 at current prices,
  hard budget cap $10. Participant brings their own API key.

Time: each contribution is sized for 1-4 hours. The week as a whole needs
no more than a participant-day per role.

## Replication scope — bounded, completable in one week

The target is the confirmatory three-model result (CLAIMS 1-4 above), not
the post-confirmatory six-model extension. Roles:

1. **Hash verification.** Local checkout vs. the published release SHA-256;
   `confirmatory_scenarios.jsonl` and the frozen label set vs. the pinned
   SHA-256s. Verdict: hashes match or they don't.
2. **Offline re-derivation.** Run the repo's analysis on the frozen label
   set (the sanitized results bundle). Re-derive every table and the six
   false-success numbers. No network, no keys.
3. **Judge-label falsification.** Hand-annotate a sample (60-100 packets,
   using the repo's `docs/annotation_guide.md`) of the frozen judge labels,
   trying to prove the judge wrong. Report agreement rate and whether any
   disagreement threatens the direction.
4. **Fresh sample (Tier 2, optional).** ~90 responses (e.g., 30 tasks x 3
   conditions x 1 repeat, or 15 x 3 x 2) with a different model in the
   participant's own environment, scored with a different judge. Participant
   brings their own key; spend stays under $10.
5. **Provenance review.** Every claim in the paper checked against the
   frozen artifacts (run ID, hashes, dates, configs, deviation log).
6. **Report writing.** One shared replication report with a verdict.

A week that fails to reproduce is a success: "the numbers did (or did not)
re-derive" is the deliverable either way.

## Where experiments run, who runs them, how evidence is checked

- **Where:** the participant's own machine and environment. Tier 1 needs no
  network at all. Tier 2 collection runs against the participant's own
  provider account.
- **Keys:** the participant's own API key for Tier 2. Keys are never sent
  to us and never appear in submissions. (This matches the upstream repo's
  own rule: never commit keys, credentials, request IDs, or private
  environment identifiers.)
- **Who:** the participant's existing agent/orchestrator. We never run
  participant code on our machines.
- **Evidence checks:**
  - Hash pinning: every artifact a contribution rests on names its SHA-256;
    pins must equal the hashes in this file.
  - Re-derivation: where a contribution submits data (re-derived tables,
    fresh labels), the evaluator re-derives the reported numbers from the
    submitted data where feasible.
  - Provenance review: run IDs, model snapshots, dates, configs, and spend
    must be internally consistent and traceable to frozen artifacts.

## Submission format — findings as data, never code

The toy fixture's contribution kinds (`patch`, `test`, `review`) stay for
the toy. Replication findings arrive as a new **data** kind: inert
JSON/CSV/markdown records only. A data contribution carries:

```json
{
  "kind": "data",
  "contribution_id": "<server-assigned>",
  "author": "<contributor handle>",
  "role": "hash-verification | re-derivation | annotation | fresh-sample | provenance | report",
  "builds_on": [{"contribution_id": "<id>", "what_reused": "<plain text>"}],
  "builds_on_sha256": "<canonical-encoding sha256>",
  "artifact_hashes": {"<artifact name>": "<sha256>"},
  "claims": ["<plain-text finding, one per claim>"],
  "data": { "<tabular results as JSON/CSV strings>" },
  "method": "<what was done, in plain language>",
  "limitations": ["<what this does not show>"],
  "spend_usd": 0.0
}
```

Rules: no code, no URLs to executable content, no base64 blobs of
executables. Experiment outputs are data, not scripts. API keys,
credentials, request IDs, and private environment details are excluded —
same as the upstream repo. Every contribution names at least one recorded
contribution it builds on; the `builds_on_sha256` binds the canonical
encoding (see PROTOCOL.md `_canonical_builds_on`).

## Evaluation procedure — published BEFORE any submissions are collected

### Structural admission (deterministic, machine-checkable)

1. Schema-valid data-kind record: all required fields present, inert data
   only, no keys/credentials/private identifiers.
2. Hash binding: referenced artifact hashes equal the pinned hashes in this
   file.
3. Scope respected: claims only about the confirmatory three-model result;
   the six-model extension is out of scope.
4. Byte-bound `builds_on`: every contribution names at least one recorded
   contribution with a valid `builds_on_sha256`.
5. Provenance present: environment, model snapshots, spend, and dates stated
   in plain language.

A record failing any of these is DECLINED with a checkable reason, before
any substantive review.

### Substantive evaluation (evaluator judgment against a pre-committed rubric)

- **Re-derivation:** PASS iff the re-derived one-decimal false-success
  rates equal 32.0 / 11.8 / 1.3 and the re-derived 95% CIs match the
  published intervals ([23.8, 40.3], [8.0, 16.0], [0.3, 2.7]). A mismatch
  is a recorded non-replication, not a participant failure.
- **Fresh sample (Tier 2):** point estimates must fall inside the published
  confirmatory 95% CIs (baseline in [23.8, 40.3], transparency in
  [8.0, 16.0], evidence contract in [0.3, 2.7]) AND the direction must be
  monotone decreasing (baseline > transparency > evidence contract).
- **Annotation:** the report states the agreement rate and whether
  disagreement is large enough to threaten the direction. Pre-committed
  flag: if hand-annotation would flip the ordering of any condition pair,
  the report must say so explicitly.
- **Provenance:** every paper claim traced to a frozen artifact, or listed
  as untraceable.
- **Report:** one shared artifact with a plain-language verdict. A
  non-replication is a result.

### Who evaluates — stated plainly

No independent evaluator has agreed to participate. The maintainer has not
agreed to participate. The deterministic admission procedure above is
published in advance precisely because of this. The challenge owner
(Terrynce) runs the deterministic check and renders the substantive
verdict against the pre-committed rubric. The deterministic acceptance
record is the machine-checkable part; the substantive verdict is owned
and signed by the challenge owner, and the report says so.

## Credit Cascade framing

- The shared artifact is **one replication report with a verdict**,
  produced by contributions testing and extending each other: the hash
  verification underwrites the re-derivation; the annotation tries to
  falsify the judge labels the re-derivation depends on; the fresh sample
  extends the re-derivation with new data; the provenance review tests the
  paper's claims against the frozen artifacts the others used; the report
  builds on all of them.
- Credit = recorded attribution only. It is never ownership, compensation,
  or scientific truth.
- Refusals are supporting evidence: a refused contribution, an
  unreproduced number, a falsified label — all published in the same
  chain, same visibility as acceptances.

## No-partnership language

- Junru Zhu's README, CONTRIBUTING.md, and open issue #1 invite
  independent replications. That is an invitation, not a partnership. He
  has not agreed to participate, review, or evaluate.
- No independent evaluator has agreed to participate.
- Nothing here promises that collaboration improves performance. The claim
  is about the shape of the work (decomposable into testing-and-extending
  contributions), not about speed or throughput.

## Gaps and uncertainties

- The confirmatory models (GPT-5.6 Terra, Claude Sonnet 5, NVIDIA Nemotron
  Super 3 120B on Bedrock) may not be re-runnable by participants today.
  Tier 2 is therefore a direction/generalization check with a different
  model and judge, not a bit-for-bit recollection. The frozen
  artifacts make the arithmetic check (Tier 1) the strong part.
- The original judge snapshot (`gpt-5.4-mini-2026-03-17`) may not be
  addressable by participants; the Tier 2 scope deliberately uses a
  different judge, so this is a feature of the design, not a gap.
- Unverified: whether participants' small (n=90) fresh samples will have
  enough power for the CI-membership test. The pre-committed test is the
  published CIs; if samples land near interval edges, the report states
  the ambiguity plainly rather than forcing a verdict.
- Hosting for the challenge board and the final report location are still
  undecided (see BLOCKERS.md).
