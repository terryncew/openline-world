# Review of the rolling_sum off-by-one patch (peer review of another
# contribution — the record the newsroom intake does not have).

Reviewed contribution: {{PATCH_ID}} ("Fix rolling_sum off-by-one", patch, by
participant-a).

Finding: the patch changes exactly one expression,
`range(len(values) - window)` → `range(len(values) - window + 1)`.
Checkable without running anything: for values=[1,2,3,4], window=2 the
original expression is range(2) (indices 0, 1 — two windows), the patched
expression is range(3) (indices 0, 1, 2 — three windows), and EXPECTED.md
requires three windows ([3, 5, 7]). The claim is about the value of the
range expression, not about executing the code.

Caveat (negative finding, for credit): the patch does not touch BUG-2
(banker's rounding in apply_discount) or BUG-3 (ZeroDivisionError in
percentage_of); it claims to fix one bug and fixes one bug. The diff is
inert text; I reviewed it by reading.
