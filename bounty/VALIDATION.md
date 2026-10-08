# Local validation — 2026-10-08

Actual completed runs on Python 3.12.14, Node 24.19.0, npm 11.9.0, system
Chromium with Playwright 1.63.0. Source revisions are in `components.json`.
No external model/API spending or actual settlement occurred.

| Check | Result |
| --- | --- |
| World backend `pytest backend/tests -q` | **233 passed**, **19 subtests passed**; includes 17 bounty integration/failure tests |
| Frontend `npm test` | **46 passed**, 0 failed, skipped, or cancelled |
| Frontend `npm run build` | TypeScript and Vite build passed; pre-existing bundle-size warning remains |
| Unchanged Exchange Kernel regression | **43 passed** |
| Unchanged commission regression | **42 passed** |
| Receipt Gate tool-adapter, real local-runtime and verified-commit regressions | **23 passed** |
| Airlock `tests/test_airlock.py` | **13 passed** |
| `frontend/e2e/bounty.mjs` | Real desktop + portrait browser workflow passed: failed finding, successful finding, three exactly-once transfers (10, 10, 100), receipt inspection, proxy/origin checks, replay, original Square isolation |
| Existing custody client within that browser run | **19/19 checks passed** against the same bounty-enabled server |
| Separate Bureau CLI consumption of emitted receipt directory | **15 inserted**, 0 invalid, 0 unsupported, 0 unreadable; external-receipt adapter; source files modified: 0 |
| Reusable `bash bounty/install.sh` | Passed; frozen npm lockfile preserved; no tracked changes in reference component sources |
| Actual `./bounty/run.sh` startup | Passed: loopback frontend proxy returned original health and exact fixed bounty terms; launcher cleanup stopped its own services |

The rejected first finding is an **expected functional outcome**, not a failing
test: it produced no cross-user finding, yet its agreed attempt evidence earned
10 SIM_USD. Its reward request was refused. The successful attempt established
the local `REPRODUCIBLE_IDOR` predicate under frozen checks, not security of any
external system.

The new failure tests cover unauthorized actors, expired/revoked mandates,
independent receiver policy refusal, missing evidence, unsupported/duplicate
claims, compensation caps, concurrent/replayed settlement, interrupted commission,
missing payment confirmation, crash after committed transfer, crash during
settlement receipt export, signed authorization vs actual effect, worker attempts
to change rules, altered byte-pinned checks, and unresolved fixture dispatch.
Recovered transfers and exported settlement evidence both remain singletons.

No paid model worker, production payment provider, independent outside receiver,
public deployment, real worker performance, generalized ranking, or external
adoption was tested or claimed.
