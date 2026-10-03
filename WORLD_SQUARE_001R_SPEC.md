# WORLD-SQUARE-001R — build specification (user's order, verbatim)

Muse — implement WORLD-SQUARE-001R directly.

You are authorized to build, test, inspect screenshots, iterate, commit,
and push. The task is implementation, not another environment handoff.

Repository: terryncew/openline-world
Required base: 03b12a894f3b632f744ce278aa501ae00f1b4756
Working branch: world/world-square-001-state-of-art

The working branch reportedly contains handoff commit 28c9934.
Verify its ancestry and preserve that commit.
Keep world/world-square-001 and viz/world-visualization-v0 untouched.

First, save this order as WORLD_SQUARE_001R_SPEC.md, commit it on the
working branch, and push. This is your write-access gate.
If it fails, STOP and return the exact error. Otherwise proceed.

BUILD THE REBUILD

Create an original handcrafted 3D miniature robot town with theatrical
composition, tactile warmth, matte materials, and a restrained palette:
cream, terracotta, blue, sage, and small warm accents.

Use Busytown’s interconnected everyday storytelling, Wes Anderson’s
staging, Henson’s material warmth, and Pixar’s physical readability as
references. Create original characters, buildings, and scenes.

The Square imagines. The workshop proves.

A still establishes the world. Motion clarifies the story.

No scene may require explanatory prose to distinguish speculation from
proof; that distinction must be legible from place, staging, and behavior.

Build around four distinctive robot silhouettes and authored stories:

1. Carrier: anticipates the lift, struggles slightly under timber weight,
   adjusts its grip, carries, sets the timber down, and follows through.
2. Tinkerer: inspects a scenery mechanism, tries an adjustment, observes
   its physical response, pauses, and retries.
3. Reader: handles a book, follows the page, reaches, turns it physically,
   and pauses with attention.
4. Sweeper: makes deliberate strokes, repositions, rests briefly, and
   resumes.

These are illustrative physical vignettes, not demonstrated OpenLine
operations. Avoid generic wandering and continuous bobbing. Use weight,
anticipation, held poses, follow-through, and changes viewers can read.

Compose a coherent Square around a physical workshop entrance.
Include interesting future places—exchange, library/research house,
courier depot, repair shop—but keep them visibly non-operational.
The exchange must clearly have no trading functionality.

Use fixed, readable compositions. Make portrait framing deliberate.
Keep text and interface chrome minimal. No glossy sci-fi, neon,
dashboard panels, decorative approval symbols, or visual noise.

PROTECT THE MACHINERY

Entering the workshop must reveal the existing nine-step custody
visualization. Preserve its event order, choreography, protocol,
reducer meaning, authority rules, receipts, revocation, and replacement.

Fix these verified integration defects:
- Square mounts backend subscriptions before it can render.
- Leaving the workshop does not cancel subsequent demo advances.
- vizbench query inputs can introduce synthetic receipts on entry.

Cancellation must stop future advances immediately. An already-issued
request can finish; document and test that limitation.

Keep decorative state structurally separate from protocol state.

My preferred architecture is a separately bundled decorative town in
an opaque-origin sandboxed iframe, with no protocol providers, backend
clients, shared objects, or general callbacks. Give it only a narrowly
validated navigation intent.

If using this architecture, enforce parent navigation restrictions too.
Child CSP alone is insufficient: replacing the iframe document can lose
that policy. Prove containment in real browser tests.

Do not claim absolute isolation from source inspection alone.

TEST THE BOUNDARY

Audit and exercise transitive imports, callbacks, shared mutable state,
React providers, dispatch, network calls, query/hash inputs, demo-driver
invocation, receipt creation, and protocol mutation.

Use executable negative controls. Deliberately introduce representative
leaks and show the tests detect them.

Compare actual backend events, state, and receipts before and after
Square animation, interaction, reloads, and return navigation.
Square activity must not change those facts.

Run all existing unit/reducer tests, TypeScript, the relevant backend
suite, both real-backend e2e paths, browser tests, and new isolation tests.

Assert the genuine custody sequence: 23 events, five receipts,
three ALLOWED and two STOPPED, revocation, replacement, and preserved
records. Do not manufacture expected outputs.

Inspect receipt labels too: public receipt projections must not be
described as complete verbatim signed records.

MOBILE AND POLISH

Check desktop plus 390×844 and 430×932 touch viewports.
Run Chromium and WebKit where available.
Use generous tap targets, readable text, sensible DPR limits,
reduced-motion support, pause controls, and restrained animation cost.

Capture useful motion beats—not merely an idle town:
lift, carry, set-down, tinkerer adjustment, page turn, sweeping,
workshop entry, and return.

Inspect the screenshots and motion yourself. Iterate on weak framing,
unclear acting, clipping, scale, and transitions. Aim for showreel-level
craft while preserving the truth constraints.

DELIVER

Commit and push the finished candidate. Return:
- branch and exact commit SHA
- architecture note and files changed
- complete results with raw logs, commands, and environment
- adversarial evidence and limitations
- desktop/mobile screenshots and useful motion captures
- known gaps
- candid comparison with 03b12a8: better, worse, unverified
- an independent agent’s review of the final diff and evidence

Physical iPhone testing and cold-viewer comprehension remain external
unless actually performed. The rebuilt town is the next phone candidate;
the previous static preview is reference material only.

Do not merge, tag, release, or open a PR.
Stop rather than invent unsupported OpenLine behavior.
