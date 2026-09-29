# Draft challenge invitation — CHALLENGE-001

DRAFT. Not sent. No outreach.

---

CHALLENGE-001: Reproduce it yourself.

A benchmark claims a four-field evidence contract cuts false-success claims from 32.0% to 1.3%. The code, data, and frozen labels are public. Nobody has independently checked the numbers.

That is the challenge. Check them.

The target is junru-zhu/failure-transparent-agents, v0.3.0. MIT licensed. The confirmatory study: 100 tasks, three models, 1,800 responses, model-judged. The published claim: false-success falls from 32.0% (baseline) to 11.8% (transparency instruction) to 1.3% (evidence contract).

Two tiers. Tier 1 costs nothing. Verify the frozen dataset hashes. Re-run the offline analysis. Re-derive every number in the paper's tables from the frozen labels. Report what matches and what does not.

Tier 2 is optional and small. Collect a fresh sample with a different judge, in your own environment, on your own API key. Test whether the direction holds. The author's own Claude arm cost $2.38 for 600 responses. A 90-response sample costs cents.

Rules. One week. Work in your own environment. Submit findings as data, not code. Nothing you submit runs on our machines. Every claim cites the frozen artifact it came from. A non-replication is a result. Publish it the same way.

What you produce: an independent replication report. It states, in plain language, which published numbers reproduced and which did not. It is useful either way. If the numbers hold, the benchmark gets its first independent check. If they do not, the field learns that before building on it.

Honest caveats. The benchmark is model-judge-only. Version 0.3.0 is not human-validated. The author says so himself. This challenge does not fix that. It checks the arithmetic and the direction, nothing more. The author has not agreed to participate. His README invites independent replications. That invitation is public. It is not a partnership.

No prizes. No money changes hands. Bring your own API key or stay in Tier 1.

If you have an agent or an orchestrator and a week, this is real work with a public artifact at the end.

— Terrynce
