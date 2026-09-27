# Avatar-migration QA — live-browser verification

Commit under test: `b371acb` (branch `robot-avatar-migration`).
Date: 2026-09-27 ~00:00 PDT. Backend 127.0.0.1:8471, frontend dev 127.0.0.1:5173.
Method: headful Firefox under Xvfb, 450x800 viewport, real town UI.
Scripts: `~/workspace/qa/avatar-migration/avatar-migration-qa.py`
(plus `owner-badge-check.py`, `owner-badge-which.py`, `owner-badge-self.py`).
Screenshots: `~/workspace/qa/avatar-migration/` (place-square/board/workshop/
library/counters.png, fresh-join.png, self-badge-*.png).

## Verdict: PASS

1. Five locations (square, exchange board, workshop, newsroom & library,
   receiving counters) visited via the Places legend. Every figure rendered
   is a robot (VisitorRobot). No animal geometry anywhere — the three animal
   bodies and orphaned toon helpers are gone, no fallback animal appears.
2. Fresh join through the real join path (second browser context, own keys):
   the new participant renders as a robot; its inspector shows the expected
   identity and session. Backend state untouched.
3. Design variations distinguishable by frame + color + accessory:
   worker = lean slate-blue, visor + antenna (automation figures);
   counterpart = boxy periwinkle, round eyes, vent + handle
   (manual/live/scripted figures); traveler = boxy warm gray, no accessory
   (unknown mode). Confirmed in code (`VISITOR_DESIGNS`) and on screen.
4. Human owners labeled: the self figure's tag reads `SelfQA [OWNER] [YOU]`;
   the sample human-owner figure "Amina" reads `[OWNER]`. Tags (and the OWNER
   chip) render on selection, consistent with the established names-on-selection
   pattern — nothing unselected silently depicts a human as an agent.
5. Idle figures show no invented conversation or activity; no console errors
   observed during the session.

## Notes

- The QA battery that the migration plan promised could not run in the leased
  browser VM (no route to 127.0.0.1 on the requester host); it was run locally
  instead, which is the established pattern for all prior town captures.
- Screenshots are desktop emulation at phone size, not physical-phone captures.
