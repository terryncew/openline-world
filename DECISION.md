# Reuse decision — OpenLine Workshop (2026-09-25)

Inspected before building:

- **diorama-builder** (github.com/hitesh153/diorama-builder, MIT): a full 3D-world
  monorepo (engine, app, cli, plugins, UI) with an agent-centric ingest protocol
  (`task.started`, agent creates itself in the world). Vendoring its engine would
  drag in a monorepo's worth of machinery for a single diorama, and its protocol
  has no receiver-decision model at all. Reuse would cost more than it saves.
  Not vendored. No branding or assets taken.
- **claude-office** (github.com/paulrobello/claude-office, MIT): Python FastAPI +
  DB backend with a Next.js frontend, plus a hooks package that maps Claude Code
  lifecycle events to HTTP POSTs. Its backend is heavier than this workshop needs;
  I borrowed only its documented hook-to-event mapping approach (from its README)
  and the official hooks reference. Not vendored. No branding or assets taken.
- **Claude Code hooks reference** (code.claude.com/docs/en/hooks): the documented
  event catalog and input schemas. The CONNECTED adapter follows this document;
  hook payloads are treated as agent-reported activity only.

Built instead:

- **Rendering**: hand-built React + TypeScript + Three.js via React Three Fiber,
  one diorama, no engine dependency beyond three/fiber/drei.
- **Authorization and execution**: the real OpenLine `openline_wallet` package
  from the local checkout (`~/workspace/openline-wallet`): `Wallet.grant` /
  `Wallet.revoke`, `EffectGate.admit_bundle` / `issue_challenge` / `evaluate`,
  and Ed25519-signed gate receipts. Imported via `sys.path`; nothing reimplemented.
  The workshop never mints a receipt itself — only the gate's signed decisions
  become receipts.
- **Backend**: small Python stdlib HTTP server (no framework). Rendering,
  execution, and authorization live in separate layers: browser → workshop
  backend → real gate.

Attribution is preserved in NOTICE.
