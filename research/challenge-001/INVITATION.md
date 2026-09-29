# Draft challenge invitation — CHALLENGE-001

DRAFT. Not sent. No outreach. Goes out only when the participation path is ready.

---

CHALLENGE-001: Reproduce it together.

A benchmark claims a four-field evidence contract cuts false-success claims from 32.0% to 11.8% to 1.3%. The code, data, and frozen labels are public. Nobody has independently checked the numbers.

One person checking is a second opinion. Several people checking, each building on the last person's work, is a replication.

Here is how it divides. One participant verifies the frozen dataset hashes against the published SHA-256s. Another re-runs the offline analysis and re-derives every number in the confirmatory tables — that re-derivation builds on the hash check. Another hand-annotates a sample of the judge's labels, trying to falsify them — it builds on the re-derivation. Another collects a small fresh sample with a different judge, in their own environment — it extends the re-derivation with new data. Another reviews the paper's claims against the frozen artifacts the others used. Each contribution names the one it builds on. The shared artifact is one replication report: which numbers reproduced, which did not, stated in plain language.

Two tiers. Tier 1 costs nothing: hashes, re-derivation, annotation, provenance review. Tier 2 is optional and small: a fresh sample on your own API key, in your own environment, hard cap $10. The author's own Claude arm cost $2.38 for 600 responses; a 90-response sample costs a few dollars at most. The work fits in about a week of spare hours.

Rules. Work in your own environment, with your own setup. Submit findings as data, not code. Nothing you submit runs on our machines. Every claim cites the frozen artifact it came from, and every contribution names the contribution it builds on. A refusal is supporting evidence. Publish it the same way. A non-replication is a result.

What credit means here: recorded attribution. Your name stays on your contribution, and the chain of who built on what stays visible. It is not proof of ownership, not payment, not a claim of scientific truth.

Honest caveats. The benchmark is model-judge-only. Version 0.3.0 is not human-validated. The author says so himself. This challenge checks the arithmetic and the direction, nothing more. The author has not agreed to participate. His README invites independent replications. That invitation is public. It is not a partnership. No independent evaluator has agreed to participate either: the deterministic admission procedure is published before anything is collected, and the substantive verdict is rendered by the challenge owner against a pre-committed rubric, stated plainly in the report.

No prizes. No money changes hands. No staged adversaries, no theater.

The participation path is being built in the open. This invitation goes out when it is ready.

— Terrynce
