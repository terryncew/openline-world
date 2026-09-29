# READER TASK — five minutes, no build required

You are outside the build. Open the extracted archive and locate each item
below. You do not need to run anything. This is a reading exercise, not an
independent verification.

## The five things to find

1. **The question.** Open
   `research/rooms/discovery-room-001/loop-transcript-v2.json` and find
   `"listing_id": "need-0330b96ce8bd"`. The question text is in the v2 seed:
   `research/rooms/discovery-room-001/seed_discovery_v2.py` (search for
   `TITLE`). What is being asked?

2. **The agreed criteria.** In the same seed file, find `DISCLOSURE` →
   `acceptance_criteria`. Four items. Note the third: the result must be
   bound to a specific manifest sha256. Copy that sha.

3. **The accepted evidence.** Open
   `research/rooms/repro-lab-001/EVIDENCE-MANIFEST.json`. How many artifacts
   does it list? In `loop-transcript-v2.json`, find `verification` →
   `matches` / `artifacts_checked` and `pin_match`. Does the declared pin
   from step 2 equal the evaluated manifest sha?

4. **The unfavorable result.** In `loop-transcript-v2.json`, find
   `experiment_outcome` → `verdict`. What does it say about condition C vs
   condition B? (The room's own `REPORT.md` states it first, in plain words.)

5. **The simulated settlement.** In `loop-transcript-v2.json`, find the
   settlement step: `settlement_id`, `seller_payout_cents`,
   `buyer_release_cents`. What unit is the money in? (Check
   `resource_ceiling` in the disclosure for the answer.)

## Then read the defect note

Open `research/rooms/discovery-room-001/REPORT.md`, section "Stale pin".
The v1 loop settled while `pin_match` was false. How is that settlement
marked, and what does the v2 loop do differently? Confirm both records
still exist (v1: `loop-transcript.json`; v2: `loop-transcript-v2.json`).

Done. If any of the five items is missing or the defect note is absent,
that is the finding — report it as such.
