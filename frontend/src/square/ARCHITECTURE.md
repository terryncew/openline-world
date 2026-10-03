# WORLD-SQUARE-001R — architecture note

Branch: `world/world-square-001-state-of-art` (from 03b12a8). The Square is
the home screen; the workshop door opens the proven custody visualization.
Nothing merges.

## The boundary: an opaque-origin sandboxed iframe

The decorative town is a **separately bundled document** (`frontend/town.html`
→ `dist/town.html`, its own rollup entry) loaded as:

```html
<iframe sandbox="allow-scripts" src="town.html" />
```

No `allow-same-origin`: the child gets an **opaque origin**. Consequences,
each enforced and tested:

- The child cannot read the parent's DOM, cookies, or storage (SOP).
- The child cannot navigate the top frame or open popups (sandbox).
- The child makes no network requests: `town.html` sets
  `Content-Security-Policy: connect-src 'none'` (defense in depth;
  statically asserted in `square.boundary.test.ts`).
- The child's ONLY outbound channel is one postMessage intent
  (`src/town/protocol.ts`):
  `{ type: "openline:navigate", intent: "enter-workshop" }`.
  Static tests assert exactly one `postMessage` call exists in `town/`.

The parent (`src/square/SquareHost.tsx`) enforces its side:

- It never writes into the frame: no `postMessage` to the child, no
  `contentDocument`/`srcdoc` access (statically asserted).
- It validates every inbound message by EXACT shape
  (`src/square/navigate.ts`: exactly two keys, exact string values —
  extra fields, wrong case, trailing whitespace all rejected; 16-case
  adversarial unit test) AND by source frame
  (`ev.source === iframe.contentWindow`). Origin checks are meaningless
  against an opaque origin, so they are not relied upon.
- It passes no callbacks, objects, or providers into the frame — only the
  `src`, `sandbox`, and `title` attributes.

Containment is proven in REAL BROWSER TESTS (`frontend/e2e/town-isolation.mjs`),
not by inspection: the child attempts fetch/XHR/EventSource (blocked),
forged/extra-field messages are ignored, wrong-source messages are ignored,
top-navigation attempts fail, and a fully replaced hostile child document
still cannot move the parent except through the validated intent.

## The two layers

**Speculative layer — `frontend/src/town/`** (the town)
Handcrafted miniature: cream/terracotta/blue/sage, matte materials, four
authored vignettes (Carrier, Tinkerer, Reader, Sweeper) as deterministic
pose functions of loop time (`pose = f(t)`, seamless by construction).
No backend clients, no protocol imports, no shared state. Pure decoration.

**Proven layer — `frontend/src/viz/`** (the workshop interior)
Unchanged custody choreography: owner authority, worker proposal, receiver
decision (ALLOWED/STOPPED), receipts, revocation, replacement. Every visible
event derives from the backend's authoritative event log through the pure
reducer. The Square never touches this path.

## Fixed defects (verified at 03b12a8, fixed here)

- **Boot gate**: `App.tsx` no longer calls `useWorkshop()` for the Square.
  The Square mounts with zero backend contact; backend-dependent views keep
  their own loading states behind `BackendApp`.
- **Demo cancellation**: `VizView` sets `stopDemoRef` on unmount and on exit.
  No new `/api/demo/advance` POST is issued after cancel; an already-issued
  request may still complete (documented, e2e-covered).
- **vizbench**: synthetic events are compiled in ONLY with
  `VITE_ENABLE_VIZBENCH=1`. Default builds ignore `?vizbench=` entirely.

## What the town is and isn't

The Square IMAGINES what an agent town could feel like. The workshop PROVES
how consequential work is governed. The exchange is shuttered and barred;
the depot hatch is shut; the repair bench's work sits under a tarp. That
distinction is legible from place and staging — no prose does the job.
