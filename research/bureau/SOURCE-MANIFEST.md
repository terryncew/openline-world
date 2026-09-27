# Bureau source-record manifest

Every record the consequence-history report draws on, with size and
sha256 (truncated). All records are read-only inputs to
`research/bureau/recalculate.py`. Original evidence is preserved; see
REDACTIONS.md for the redaction accounting.

## In-repo records (branch `bureau-consequence-history`)

| Record | Bytes | sha256 |
|---|---|---|
| `captures/custody-demo-transcript.txt` | 2308 | `9e320c60a5e1f7a8…` |
| `docs/custody-browser-integration.md` | 9720 | `8392657b1198f86d…` |
| `docs/test-count-reconciliation.md` | 8296 | `61bb32a4df35ac7b…` |
| `research/COMMONS-BRIEF.md` | 8312 | `ed22a3375792f937…` |
| `research/COMMONS-CRITERIA.md` | 3946 | `80f6f2d5b98d814d…` |
| `research/COMMONS-CRITERIA-2026-09-27.md` | 3635 | `3e83ee7171f82931…` |
| `research/ISOLATION-VERDICT-2026-09-27.md` | 5263 | `537ef1661dcafc81…` |
| `research/EVIDENCE-REDACTION.md` | 3675 | `17b1505db338a74a…` |
| `research/evaluation-20260926T233916Z.json` | 1454 | `b25aa02616a98d35…` |
| `research/correction-20260927T000442Z.json` | 1664 | `0ee6933c8f5a1611…` |
| `research/bureau/CONSEQUENCE-HISTORY-REPORT.md` | — | (this report) |
| `research/bureau/recalculate.py` | 10200 | `e2e82dc2a83a1de0…` |
| `research/bureau/records/canary-evidence.json` | 1180 | `3a115e2ae96b0b02…` |
| `research/bureau/records/canary-probe2.py` | 8398 | `009bedad47e40277…` |
| `research/uc001/ACCOUNTING-EVIDENCE.md` | 2990 | `3c2bed3ef47dfe2e…` |
| `research/uc001/evidence/CONTRACT-frozen.json` | 913 | `e10c74e4065a0877…` |
| `research/uc001/evidence/balances.json` | 3528 | `f9ab3ed82db3ad1e…` |
| `research/uc001/evidence/demo1-accepted.json` | 3396 | `459bfc9874584f4f…` |
| `research/uc001/evidence/demo2-rejected.json` | 3429 | `a145edb4987adf5f…` |
| `research/uc001/evidence/demo3-cap.json` | 2677 | `8581c368c722a1be…` |
| `research/uc001/evidence/demo4-revocation.json` | 2655 | `3e81f276ed7bafad…` |
| `research/uc001/evidence/demo5-crash-retry.json` | 3913 | `d04353fdf81cd430…` |
| `research/uc001/evidence/demo6-altered.json` | 2871 | `bce1c2870ceff89f…` |

## QA harnesses and captures (outside the repo, `~/workspace/qa/`)

| Record | Bytes | sha256 |
|---|---|---|
| `qa/custody-browser/negative-battery.py` | 16737 | `671d37c23194e21f…` |
| `qa/custody-browser/two-profile-flow.py` | 13065 | `7b73649e6563905f…` |
| `qa/research-commons/qa-battery.py` | 18199 | `b61b336e09941517…` |
| `qa/custody-browser/custody-browser-take-450x800.mp4` | 5056806 | `cb4ae54e8784fdc9…` |
| `qa/research-commons/research-commons-take-450x800.mp4` | 3408412 | `fcda5f68e6396658…` |
| `qa/uc001/uc001-take-450x800.mp4` | 1261901 | `2f8cbd10e6c6c474…` |

