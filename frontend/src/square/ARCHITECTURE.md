# WORLD-SQUARE-001 — architecture note

Branch: `world/world-square-001` (from 55751ef). The Square is the home screen;
the workshop door opens the proven custody visualization. Nothing merges.

## The two layers

**Speculative layer — `frontend/src/square/`** (the town)
- Ambient robots, buildings, streets, lamps, fountain. All motion is local
  animation state: `worldState.ts` is a seeded, deterministic pose function
  (`poseAt(wanderer, t)`), no clocks besides the render clock, no network,
  no protocol knowledge. Robots stroll, carry crates, sweep, chat. Pure
  decoration.

**Proven layer — `frontend/src/viz/`** (the workshop interior)
- Unchanged custody choreography: the nine-step demo replays from the
  backend EventLog through the canonical `source → reducer → scene` path.
  The only viz change is `VizView` gaining two props — `autoRunDemo`
  (square entry runs the demo once through the same code path as the
  "Run the live demo" button) and `exitLabel` ("Back to the Square").
  The viz's director still owns every POST; the square never calls it.

## The boundary (enforced, not asserted)

`src/square/square.boundary.test.ts` statically scans every square source
file on every `npm test` run:

1. No mutating calls: no POST/PUT/DELETE/PATCH, no `/api/demo/`,
   `/api/owner/`, `/api/mode`, no `advanceDemo`/`resetDemo`, no `EventLog`,
   no `mintReceipt`, no synthesized receipts.
2. No runtime imports of the write surface or replay path. Imports are
   resolved against the importing file's directory and checked against
   absolute forbidden prefixes (`viz/director`, `viz/source`,
   `viz/reducer`, `viz/protocol`, `api`, `world/api`) — catches any
   relative depth, e.g. `../../viz/director` from `scene/`.
3. The square's single allowed viz import is the `VizView` component
   (screen composition). Nothing else under `viz/` is reachable.
4. `worldState.ts` imports nothing at all — pure decoration.

A negative control was run: a planted `../../viz/director` import in
`scene/` fails two boundary tests. The boundary is a real enforced
separation, not a promise.

## Honesty rules for the scenery

The town imagines; the workshop proves. Buildings that suggest economic
activity OpenLine has not demonstrated are labeled honestly in-world:
EXCHANGE — "opening soon, no trading yet"; REPAIR SHOP — "under
construction"; LIBRARY — "quiet, please"; COURIER DEPOT — parked couriers
only, static decoration. The workshop sign reads "see how work gets
approved". No transactions, markets, payments, reputation systems, or
autonomous commerce are simulated anywhere.

## Routing

`?view=square` is now the default home screen. All existing views
(`watch`, `explore`, `changed`, `world`, `viz`) stay reachable by their
explicit `?view=` param. The square nav links Tour / Visualize / World.

## Stop conditions — none triggered

No stop condition fired: the town needed no unsupported economic
mechanics, no fake protocol events, and no changes to OpenLine semantics.
The custody choreography is byte-identical except the enter/exit props.

## Gaps

- No physical iPhone run yet (SwiftShader only); the merge gate for the
  viz layer still requires it.
- The town is small by design (Square + workshop only). More destinations
  need the same honesty treatment per building.
- Decorative animation state lives on the render clock, not the seeded
  world clock — fine for scenery, never to be mistaken for replay state.
