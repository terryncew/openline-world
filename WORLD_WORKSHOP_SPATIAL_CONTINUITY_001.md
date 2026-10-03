# WORLD-WORKSHOP-SPATIAL-CONTINUITY-001

## Spatial contract

`frontend/src/spatial/workshopContract.ts` is immutable authored build data.
The town and visualization each bundle their own copy; it is not a runtime
provider, callback, backend client, protocol object, or mutable trust bridge.

Exact values (town units):

- identity: `openline-workshop-threshold-001`
- exterior: width `3.4`, depth `5.8`, wall height `2.2`, total height `3.8`
- door: width `1.3`, height `2.15`, center X `0`, floor Y `0`, facade Z `2.96`
- orientation Y: `-0.12` radians
- floor elevation: `0`
- threshold depth: `1.3`
- interior entrance axis: `[0, 0, -1]`
- palette: cream `#f3ead9`, terracotta `#c26d4b`, dark terracotta
  `#9d5236`, sage `#8ba888`, blue `#4a6f8a`, stone `#cfc4ae`, dark
  stone `#a89a80`, wood `#a9805a`, dark wood `#7d5f40`, ink `#3d3428`,
  warm accent `#e8a34f`.

## Physical sequence

The Square camera dollies to the authored exterior door before navigation.
The workshop renderer starts outside the matching interior portal and crosses
it toward the workroom. The existing event-derived workers act in the
workroom; proposals travel east to the receiver gate; receipt tablets persist
beyond it. The Entrance view looks back through the same portal. Exit moves to
that portal before the Square remounts at the threshold and eases back out.
Reduced-motion preference replaces these dollies with short direct handoffs.

## Security boundary

The narrow message remains exactly `{ type: "openline:navigate", intent:
"enter-workshop" }`, source-checked and user-activation-gated by the parent.
The return query is a fixed decorative camera cue; it carries no protocol or
backend state. Town code still has no backend imports, protocol write surface,
providers, callbacks across the iframe seam, or network primitives. The
workshop remains driven by the existing read-only event source and reducer.

## Verification status

Static spatial-contract, boundary, reducer, motion, TypeScript, backend, and
production-build checks are executable locally. The capture harness is
`frontend/e2e/workshop-continuity.mjs`; it records exterior, approach,
threshold, interior, look-back, exit-threshold, and return at desktop and
390x844 in Chromium and WebKit. Browser binaries are absent in this workspace,
and downloads return HTTP 403, so those captures and cold-viewer continuity
remain explicitly unverified here. Existing captures are not relabeled as
continuity evidence.
