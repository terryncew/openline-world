# Known limitations — OpenLine World closeout (frozen)

## KNOWN LIMITATION — WORKER-FAMILY-OVERFLOW

For worker counts >8, workshop visualization falls back to generic capsules rather than the authored town character families. The frozen World demo is constrained to ≤8 workers, so this path is not exercised by the verified experience. No fix under current feature freeze. Reopen only if >8 workers becomes a supported visible scenario.

Trigger: `useFigures(workerCount)` in `frontend/src/viz/scene/workerMotion.ts`
returns true only for `workerCount <= 8`. Above 8, `VizView` (and the
`AuthoritySeals`, `ProposalPackets`, `SpeechPuffs` stagers) render the
instanced `WorkerSwarm` capsules instead of the `WorkerFigures` town
families.

Safeguard: `frontend/src/viz/worker-family-guard.test.ts` locks the
trigger value and asserts the frozen demo beat never produces more than
8 workers. Any drift above 8 fails loudly in `npm test`.
