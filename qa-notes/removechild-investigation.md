# Node.removeChild investigation (2026-09-27)

Two `NotFoundError: Node.removeChild: The node to be removed is not a child
of this node` page errors were observed during the clean-extraction smoke
test. Investigated; concluded harmless. No code change made.

## Reproduction

1. Fresh extraction of the distribution, fresh venv, `npm install`.
2. Backend 8471 + frontend 5173 from the extraction.
3. Headful Firefox, 450x800, `localStorage workshop-onboarded=1`.
4. Load `/`, click Explore, click World. Two errors fire.

Scripts: `/tmp/removechild-probe.py`, `/tmp/removechild-probe2.py`,
`/tmp/removechild-probe3.py` (probes; not shipped).

## Root cause

Stack trace shows the throw inside drei's `Html` component cleanup
(`@react-three_drei.js` `Html` unmount → `ReactDOMRoot.prototype.unmount`
→ `removeChildFromContainer` → NotFoundError). It is the known drei `Html`
unmount race: the label's own React root unmounts against a container div
React DOM has already removed. Both errors fire in the Explore→World view
transition (phase-tagged "explore"), i.e. the tour/onboarding scene's Html
labels unmounting — before the join veil even appears.

## Evidence of harmlessness

- Joining is not interrupted: the join veil completes and hides normally in
  all three probes; the world scene renders robots.
- No stale UI: after the transition, 9 `.room-label` nodes exist (the world's
  own live labels), 0 detached.
- No duplicate handlers: the error is on the deletion path of labels that no
  longer exist; nothing re-registers.
- Owner controls unaffected: the Owner console opens, the delegation prompt
  renders, location buttons work — all after the errors fired.

Decision: no fix. A narrow change (e.g. guarding drei's unmount) would touch
vendored-library behavior to silence a benign warning; the mechanism is
frozen and the evidence shows no user-facing defect.
