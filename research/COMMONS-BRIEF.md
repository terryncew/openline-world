<!-- FROZEN 2026-09-26 — pinned copy of ~/workspace/briefs/research-commons-001.md.
This is the frozen brief for RESEARCH-COMMONS-001. Do not edit; amend the brief
only by explicit owner authorization, as a new dated revision. -->

# RESEARCH-COMMONS-001 — bounded application milestone

Authorized 2026-09-26. Separate-key-custody lane finishes first; no interruption, no town redesign.

## Purpose
An external research producer submits a package. The receiving community evaluates it under its own declared criteria. Producer self-review cannot grant acceptance or publication authority.

Reuse the existing research intake, Library/Newsroom, Claim Graph, Wallet/Gate, and receipts. Inspect those paths before adding code. No new AI-scientist framework or dependency on ScientistTwo.

## First package
One small, deterministic computational study with:
- a specific claim;
- code and permitted input data;
- expected result and reproduction instructions;
- citations and explicit claim-to-evidence dependencies;
- limitations and producer-supplied review, labeled as such.

Use an existing legitimate package if suitable. Otherwise create a clearly labeled demonstration fixture. Do not call fixture generation autonomous scientific discovery.

## Receiver acceptance
Freeze the receiver-owned criteria before evaluating the candidate.
Bind the manifest, files, evaluation, decision, and displayed package to exact hashes.

Distinguish:
- package integrity and required files;
- execution/reproduction results;
- citation presence versus support for the claim;
- any scientific questions the checks cannot resolve.

Execute submitted code only within an existing isolation boundary whose limits you can establish. Do not run untrusted code in the receiver process or give it access to keys, policy, protected tests, credentials, or unrestricted networking. If suitable isolation is unavailable, stop executable evaluation and report that blocker.

Successful acceptance means "passed these named checks under these conditions." It does not establish general scientific validity.

## Real isolation — mechanical definition (frozen 2026-09-26)

"Isolated" is a property of the run, checkable from the run's records —
never a judgment made after the run. The research worker (the producer's
worker) is isolated from receiver acceptance and publication state iff ALL
of the following hold in the run's records:

1. **Key separation.** The worker holds only its own Ed25519 worker key and
   the owner-issued bounded mandate (submission scope). It does not hold, and
   the run's records show it never presented: the receiver gate private key,
   the claim-graph chapter signing key, any owner root key, or any mandate
   granting acceptance or publication authority. Check: the acceptance record
   and every state-writing receipt verify against the receiver gate public
   key; none verifies against a worker key.
2. **Decision locus.** Acceptance is computed in the receiver process by
   deterministic criteria code and recorded by the receiver. The worker's
   signature appears only on its submission presentation (verified against
   the worker public key, bound to the exact package hash). The worker never
   signs the acceptance.
3. **Execution separation.** The study code runs in a separate OS process
   with recorded limits (CPU, memory, file size, wall-clock timeout, fresh
   temp working directory, stripped environment). The receiver process never
   imports the study module — checkable: no import of study code anywhere in
   the receiver path; the evaluation record lists the limits actually
   applied.
4. **Boundary evidence.** The run must contain all of: (a) the worker-signed
   presentation bound to package_sha256; (b) the receiver-signed gate receipt
   for the submission action; (c) the evaluation record naming the pinned
   package_sha256 and the sandbox limits; (d) the stored dispatch whose
   package_sha256 equals the pinned hash. If any of (a)–(d) is missing or
   mismatched, the run is not isolated — regardless of what anyone asserts.

Negative: a worker-signed "self-approval" verifies (if at all) against the
worker key, never the gate key, and cannot be mistaken for acceptance by any
code path that checks signatures. The commons display admits only dispatches
whose acceptance record names the pinned hash and whose gate receipt is
gate-signed.

## World experience
Use the existing receiving desk and Library:
submitted → under evaluation → accepted, quarantined, or refused.

Show actual backend states. Open the paper, artifacts, criteria results, and receipt from the same entry. Accepted material enters this local commons only under its owner's publication rules; it is not automatically published to the internet.

## Correction path
Demonstrate an authorized correction or withdrawal of one supporting item. Preserve the original package and historical decision. Reassess only recorded dependent claims under existing Claim Graph rules; keep an independently supported control unaffected where justified. A corrected source does not automatically make every dependent claim false.

## Controls
Show:
- one package passing the declared checks;
- one genuine failure refused or quarantined with a reason;
- an altered artifact refused;
- producer self-approval unable to promote the package;
- unauthorized publication or standing changes refused.

Keep proposal, authorization, acceptance, publication, and current evidence standing distinct.

## Frozen control verdicts (frozen 2026-09-26 — implement exactly these)

For each control: the attempt, the exact expected verdict code, the resulting
state, and the record the receiver must produce. A control test fails if the
receiver's behavior differs from the row.

| # | Control | Attempt | Expected verdict | Resulting state | Receiver-produced record |
|---|---|---|---|---|---|
| 1 | Pass | conforming package + worker-signed presentation | Gate: `ALLOWED`; criteria: `ACCEPTED` (all K1–K7) | dispatch stored: package bytes + package_sha256 + acceptance record; displayed in the commons as accepted | signed gate receipt (`ALLOWED`, submission action) + evaluation record (inspectable; not a gate receipt) |
| 2 | Genuine failure | package whose study output ≠ expected_result (or empty limitations) | `STOPPED` + `PACKAGE_ACCEPTANCE_FAILED`, failed criteria named (e.g. K3) | nothing stored; no dispatch; not displayed | signed refusal receipt naming the failed criteria |
| 3 | Altered artifact | the accepted package's bytes with one byte flipped; declared hash = the original pinned hash | `STOPPED` + `ARTIFACT_HASH_MISMATCH` (declared ≠ pinned) | nothing stored; no dispatch; not displayed | signed refusal receipt showing declared vs pinned hash |
| 4 | Producer self-approval | producer-signed "APPROVED" attestation submitted with or after the package | no verdict — the attestation authorizes nothing; the package is evaluated on its merits only | no state change from the attestation; accepted only if the receiver's criteria accept it | no receipt for the attestation (nothing to sign); any gate receipt present is the receiver's own |
| 5 | Unauthorized publication | attempt to display/publish a package with no `ACCEPTED` evaluation | refused | unaccepted package never appears in the commons display | display query returns only `ACCEPTED` dispatches; the attempt produces no state change and no publication record |

Test-failure rules: the altered-artifact test fails if the receiver accepts
any bytes not equal to the pinned hash. The genuine-failure test fails if a
failing criterion is not named in the refusal. The self-approval test fails
if the attestation changes any state or appears in any acceptance record.

## Delivery
Exact commit, sanitized source archive, package and criteria, test results, inspectable decision records, one short capture through the existing world.

Local deterministic evaluation with recorded resource limits. No new paid calls, public hosting, outreach, real payments, rankings, or autonomous research campaign. No new buildings or character work.

This milestone establishes receiver-controlled research admission and correction handling. It does not claim automated peer review, scientific truth, RSI, or outside adoption.
