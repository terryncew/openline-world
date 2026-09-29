# CHALLENGE-001 — real-candidate comparison (amendment research)

Researched 2026-09-28/29. Research only: no outreach, no contact, nothing built.
Raw notes: `research-notes-candidates.md` (primary-source links inline below).

Standing rule, applied to every row: a plausible beneficiary is not an agreed
participant. Default for all five: **nobody has agreed to anything.**

## Primary selection lens: Credit Cascade (applied 2026-09-29)

Per the owner's amendment: favor the worthwhile task where one participant's
contribution can be **tested, extended, or combined by another** to produce a
useful shared artifact. This is the primary lens. The written maintainer
invitation and the no-execution fit remain in force as secondary criteria.

Cascade scoring, best first:

1. **Candidate 1 — strongest cascade.** The shared artifact is a single
   replication report with a verdict, and every contribution type genuinely
   tests or extends another: the hash verification underwrites the
   re-derivation; the hand-annotation tries to falsify the judge labels the
   re-derivation depends on; the fresh sample extends the re-derivation with
   new data; the provenance review tests the paper's claims against the
   frozen artifacts the others used. Nothing is parallel busywork; each step
   has a named predecessor it checks.
2. **Candidate 4 — strong combination, thinner testing.** Rows accumulate
   into one public ledger (a real shared artifact), each row independently
   checkable, and pattern analysis builds on the rows. But most
   contributions are parallel row-filling; participant-to-participant
   testing is mostly spot-checking, not extension. Closest alternative.
3. **Candidate 3 — moderate.** Automated flags combine into a dataset, and
   each human confirmation genuinely tests one flag. The test chain is real
   but shallow: one flag, one confirmation, no extension step.
4. **Candidate 2 — moderate.** Same shape as 4 (rows into a dataset) with
   less testing between participants than 3.
5. **Candidate 5 — weakest.** Combinable in principle (builder, fixture
   author, reviewer), but speculative with no adopter.

The lens confirms the recommendation rather than changing it: candidate 1
is the only one where the shared artifact is *produced by* participants
testing and extending each other, not merely assembled from parallel parts.

## Comparison

| # | Candidate (area) | Bounded question | Public deliverable | Evaluation under no-execution rule | Still open? | Interested party — agreed? |
|---|---|---|---|---|---|---|
| 1 | Independent replication of the `failure-transparent-agents` benchmark (reproducibility) | Do the published confirmatory numbers (false-success 32.0% → 11.8% → 1.3%) re-derive from the frozen labels, and does the direction hold with a different judge? | Independent replication report | Tier 1 deterministic: re-derived numbers must match the frozen report within stated tolerance. Tier 2 preregistered direction + tolerance from the paper's CIs. Participants run everything in their own environments. | Yes — repo created 2026-09-10, 0 forks, 1 star, no independent replication found | Maintainer invites independent replications in the README. Has NOT agreed to participate. |
| 2 | Data.gov link-health audit, one agency slice (public records) | Which dataset accessURLs in one agency's Data.gov catalog slice are dead, redirected, or erroring? | Machine-readable broken-link report + method note | Every claim is a re-checkable (URL, status, timestamp) assertion; evaluator spot-checks by hand. No submitted code runs on our side. | Yes — CRS report Aug 19, 2026; Data.gov's user guide says it does not fix broken links directly | MuckRock, Harvard LIL — plausible beneficiaries only. Nobody agreed. |
| 3 | Human-confirmed WCAG audit of high-traffic federal dataset pages (accessibility) | On a frozen list of the most-visited federal dataset pages, which of WebAIM's six most common error classes are actually present, each confirmed by a human? | Public dataset of confirmed findings + plain-language report | Each automated flag must carry a human confirmation note; evaluator spot-checks against live pages | Yes — WebAIM Million Feb 2026 is the latest annual; first regression in 6 years (95.9% fail, up from 94.8%) | WebAIM — plausible. Nobody agreed. |
| 4 | FOIA status ledger for the Stanford AI-chatbot request campaign (public records) | For each of the 105 FOIA requests in the Spangher campaign (filed April 2026), what is the current disposition, with citation? | Public CSV ledger + short report on "no records"/fee patterns | Every row cites a public MuckRock page + retrieval date; evaluator spot-checks. Pure review work, no code at all. | Yes — described as preliminary/ongoing Sep 2026; sampled EOUSA request still shows 0 files released | The Stanford research team, MuckRock, Colorado FOIC — plausible beneficiaries. Nobody agreed. |
| 5 | DCAT-US catalog link-liveness checker (open-source research tool) | Can a team ship a reviewed, documented, fixture-tested link-liveness checker for agency data.json catalogs? | MIT tool + fixture catalog + docs | Reviewer runs the deterministic fixture in their own approved environment + code review. No arbitrary execution. | Yes — GSA's link QA covers only their docs site, not the catalog | GSA Data.gov team — plausible. Nobody agreed. Weakest: no maintainer asked for it by name. |

## One paragraph per candidate

**1. failure-transparent-agents replication.** The repo (https://github.com/junru-zhu/failure-transparent-agents, MIT, public, created 2026-09-10) benchmarks whether LLM agents admit tool failure instead of hallucinating success: 100 frozen tasks, deterministic failed-tool simulator, 1,800 confirmatory responses, model-judged. Published claim: false-success falls from 32.0% to 11.8% (transparency instruction) to 1.3% (evidence contract). The README's "Extend the benchmark" section lists "independent replications on new models and serving stacks" as high-impact, and ships a reproduction guide (https://github.com/junru-zhu/failure-transparent-agents/blob/HEAD/docs/reproduction.md), frozen model-judge report, and completion audit with SHA-256-published artifacts. Offline validation makes zero network calls, stdlib only; live collection is opt-in and budget-capped (the Claude arm cost $2.38 for 600 responses). Caveat, from the author himself: v0.3.0 is model-judge-only and not human-validated. The replication must carry that limitation, and target the confirmatory three-model result, not the post-confirmatory six-model extension.

**2. Data.gov link-health audit.** A CRS report covered by MuckRock on 2026-08-19 (https://www.muckrock.com/news/archives/2026/aug/19/crs-report-on-datagov-reveals-major-flaws-in-the-federal-dataset-portal/) found Data.gov is a metadata directory, not a vault: agency site reorganizations silently break catalog links or drop datasets at the next harvest, with no central backup. Data.gov's own user guide (https://github.com/gsa/datagov-11ty/blob/HEAD/pages/user-guide.md) states it does not fix broken links directly. Roughly 3,000 datasets were removed across 2025 (count contested). Bounded version: one agency's public data.json slice, every accessURL checked, report as (dataset, URL, status, timestamp). Federal data is public domain. There is no public, current, systematic link-health dataset for the catalog — that is the gap.

**3. WCAG audit of high-traffic federal dataset pages.** WebAIM Million, February 2026 (https://www.digitalapplied.com/blog/web-accessibility-statistics-2026-wcag-lawsuit-data; https://wcagc.com/blog/webaim-million-2026): 95.9% of top-million home pages had detectable WCAG 2 failures, up from 94.8% — the first regression in six years, 56.1 errors per page. Top classes: low contrast (83.9%), missing alt text (53.1%), unlabeled inputs (51%), empty links (46.3%), empty buttons (30.6%), missing document language (13.5%). WebAIM covers home pages only; AI search now routes users to internal pages (https://news.designrush.com/ai-search-website-accessibility-fixes) which are unaudited. Bounded version: a frozen list of the most-visited federal dataset pages, each flag human-confirmed. Honest caveat: no agency asked for this; frame as research, not shaming.

**4. FOIA status ledger.** In April 2026 a team led by Stanford's Alex Spangher filed 24 federal + 81 state/local requests seeking government AI-chatbot logs, policies, and retention schedules (https://coloradofoic.org/are-the-governments-conversations-with-ai-accessible-under-public-records-laws-and-foia/). Preliminary findings: deployments at 53 federal agencies, all 50 states, 77 local governments; first corpus of 3,216 government AI chat threads; top barriers are "no records responsive" claims and extreme fees (Colorado: $9M). Requests are public MuckRock pages; the EOUSA request (filed Apr 7, 2026, case EOUSA-2026-003224) shows 4 communications, 0 files, acknowledged but unfulfilled (https://www.muckrock.com/foi/united-states-of-america-10/ai-chatbot-interaction-logs-executive-office-for-united-states-attorneys-209329/). Bounded version: disposition per request with citation and date. No code involved at all — the cleanest fit for the no-execution rule.

**5. DCAT-US link-liveness checker.** GSA's docs describe a manual broken-link reporting flow (https://github.com/gsa/datagov-11ty/blob/HEAD/pages/contact.md); their automated weekly link QA covers only their documentation site (https://github.com/GSA/resources.data.gov/blob/HEAD/README.md), not the 364,095-dataset catalog. Bounded version: one-week build of a reviewed, documented, fixture-tested checker emitting signed machine-readable reports. Most speculative — no maintainer asked for it by name, and a tool without an adopter is a demo.

## Recommendation: candidate 1 (confirmed under the Credit Cascade lens)

Run the independent replication of failure-transparent-agents.

Why collaboration helps: the work splits into distinct, combinable contributions different agents can own in parallel — one verifies dataset hashes against the published SHA-256s, one re-runs the offline analysis and re-derives every table, one collects a small fresh sample with a different judge in its own environment, one hand-annotates a sample of judge labels to falsify them, one does provenance review (paper claims vs. frozen artifacts), one writes the report. Nothing duplicates; everything combines into one verdict.

Why it fits the constraints: Tier 1 needs no network, no keys, no spend. Nothing submitted ever executes on our machines. Evaluation is deterministic against a frozen gold standard.

What an unsuccessful week still produces: "the published numbers did (or did not) re-derive from the frozen labels" is a useful public result either way. A non-replication is publishable, checkable, and honestly caveated.

Why it beats the others: it is the only candidate where the target work is explicitly invited in writing by the party who benefits — the README lists independent replication as a high-impact contribution. Candidates 2–4 have plausible beneficiaries but no invitation; candidate 5 has neither invitation nor adopter.

## Gaps before anyone promises a public event

- **Hosting:** where participants coordinate and where the final report lives — undecided.
- **Isolation:** the submission format (findings as data, never code) must be specified in the invitation; no intake mechanism exists.
- **Funding:** no prizes, no money — fine. But Tier 2 needs a stated rule: participants bring their own API keys, or stay in Tier 1.
- **Evaluator:** no named reviewer has agreed to anything. Either publish the deterministic acceptance procedure in advance (Tier 1 re-derivation must match within the paper's stated tolerances) and name who runs it, or recruit a named third-party reviewer. Do not promise review by the maintainer.
- **Scope lock:** confirmatory three-model result only; the model-judge-only limitation goes in the invitation, not discovered later.
