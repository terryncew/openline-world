# Room manifest schema — research/rooms/MANIFEST-SCHEMA.md

Minimal schema for a Reproducibility Lab room. A room is a bounded,
inspectable container for one frozen experiment and its evidence.
Rooms do not grant authority; they display records.

## ROOM.json fields

- `room_id`: string, unique (e.g. `"repro-lab-001"`).
- `title`: string, human-readable.
- `question`: string, the research question in one sentence.
- `protocol_ref`: object: `{ "path": "PROTOCOL.md", "sha256": "<hex>",
  "frozen": "2026-09-28" }`. The sha256 is of PROTOCOL.md *before* its
  freeze stamp (the hash recorded in the stamp itself).
- `participants`: array of `{ "id", "role", "kind", "description" }`.
  `kind` is one of: `"algorithmic-worker"` (deterministic code, labeled;
  not an AI scientist), `"receiver"` (validates receipts, owns
  acceptance), `"owner"` / `"researcher"` (human; froze the protocol,
  ran the experiment offline).
- `artifacts`: array of `{ "path", "sha256", "kind" }`. `kind` in:
  `"protocol"`, `"experiment-code"`, `"pin"`, `"result"`, `"aggregate"`,
  `"evidence-manifest"`, `"report"`, `"acceptance-record"`.
- `authority_note`: string, verbatim: "Room membership grants no
  spending, execution, or publication authority. The receiver owns
  acceptance; the room displays frozen records."
- `badges`: the three labeled badges applied per result, with the
  explicit non-implication note (see ROOM.json).

## EVIDENCE-MANIFEST.json

Every artifact listed with sha256. Verification = recompute each hash
and compare. Any mismatch invalidates the room display for that
artifact (the UI must show the mismatch, not silently drop it).

## Non-goals (enforced by schema minimalism)

No marketplace, no reputation score, no DAO, no world-building.
If a future room needs a field, amend this schema as a dated revision;
do not improvise fields per room.
