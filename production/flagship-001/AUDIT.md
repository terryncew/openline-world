# Production audit — current HEAD

Base `2235fa6ce916876cd39ed35be97263ddfc111b6a` was clean before creating
`film/openline-flagship-001`. All production changes stay under this directory.

ASSET-INVENTORY.json lists 55 media artifacts with SHA-256, sizes and available
stream metadata. Contact sheets were inspected for the existing town, authority,
hero and narrated refusal videos. Many are useful reference, but the early
`authority-demo.webm` and CSS `openline-hero.mp4` precede the current Workshop
visual canon. They were excluded as main footage. Portrait town recordings
are 390×844 and would not meet a native-HD production master. The attack film
is 1280×800 and its realtime software-GPU capture has sparse source cadence.
Its scenario remains available but is not inserted into the replacement story.

Usable production canon: TownApp's authored town and vignettes; WorkshopInterior;
CanonicalRobot's sage Wren and blue/terracotta Juniper; OwnerObelisk; AuthoritySeals;
ReceiverGate's physical shutter; ProposalPackets; JobCrate's persistent ticket,
chronological receipt stamps and checkpoint pieces. These existing components
are reused directly by a read-only production capture stage, with editorial
camera positions, native 1920×1080 rendering, fixed 24-fps presentation time and
real shadows. They generate no protocol facts and call no mutating APIs.

Usable actual proof: the existing ten-step authority fixture; real EffectGate
receipts; owner grants and admitted revocation; the existing ReceiptsPanel;
backend tests for the beat sequence, pre-grant failure and persistent job state.
A fresh run has been exported, signature-verified and retained as public evidence.
Complete signatures remain in evidence/receipt-*.json; no private keys or bearer
tokens are included. The real UI displays the exact public receipt projection.

Other verified repository evidence, inspected but outside this story: separate
client key custody; browser proof-of-control and explicit revocation; hash-bound
Commons intake and correction propagation; simulated capped commission accounting;
bounded internally operated consequence history. README.md and the research
report explicitly limit these demonstrations. None establishes third-party
endorsement, live provider switching, general security, real payments, hardened
arbitrary-code isolation or independent adoption.

Production tools: installed Python, Node, Vite, Playwright/system Chromium,
FFmpeg and FFprobe; locally available checksum-recorded Kokoro narration.
No external creative API or paid provider was called. Frame-clock capture avoids
presenting repeated realtime frames as native smooth animation.

## Scene and UI inventory

| Existing surface | Source | Production use / limit |
|---|---|---|
| Home Square | `frontend/src/square/SquareHost.tsx`, `town/TownApp.tsx`, buildings and five actor families | Existing miniature context; decorative activity has no protocol or transaction meaning |
| Workshop visual canon | `frontend/src/viz/scene/`, `viz/reducer.ts` | Canonical geometry and event-derived roles reused directly |
| Ten-step authority view | `frontend/src/viz/AuthorityDemoView.tsx`, `backend/server.py` | Factual story source; new footage is a read-only recorded-state presentation |
| General visualization and inspectors | `frontend/src/viz/VizView.tsx`, Timeline, Inspector | Existing evidence exploration; interface chrome excluded from story |
| Watch / explore room and tour | `frontend/src/scene/Room.tsx`, `tour/`, `components/Panels.tsx` | Earlier room and guided UI; ReceiptsPanel is the film's actual proof surface |
| Shared World, owner console and inspectors | `frontend/src/world/SharedWorld.tsx`, `world/components/` | Browser participant custody, bounded research and simulated commissions; outside this story |
| What Changed | `frontend/src/changed/WhatChanged.tsx` | Existing explanatory surface; excluded rather than mixed into the new narrative |
| CSS hero | `frontend/src/hero/HeroView.tsx` | Earlier design language; reference only |
| Prompt-injection scenario | `frontend/src/scenarios/PromptInjectionView.tsx` | Genuine local refusal scenario and existing film; left intact and not combined with worker replacement |
| Receipt records | `backend/workshop_gate.py`, `backend/vendor/openline_wallet/`, existing ReceiptsPanel | Exact genuine public UI projection plus full signed records retained for the selected run |

`EVIDENCE-INVENTORY.json` hashes the existing research reports, recorded runs,
accounting evidence, custody/authority/attack tests and pilot records inventoried
as the capability corpus. It records existing artifacts, not newly verified
execution of every experiment. The selected Workshop has fresh test/run evidence
under `evidence/`; other claims remain bounded by their original reports.
Vendored adapter filenames, including provider-facing files in the pilot client,
do not establish a live integration and are not used as film proof.
