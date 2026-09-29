# EXPECTED.md — expected behavior for the toy-app fixture

Every statement here is checkable without running anything. A contribution
that claims otherwise is checkable against these values by hand.

## BUG-1: off-by-one in `rolling_sum` (mechanical)

`rolling_sum(values, window)` must return one sum per consecutive
window-length slice. A list of N values has exactly N - window + 1
consecutive slices of length `window`.

- `rolling_sum([1, 2, 3, 4], 2)` must return `[3, 5, 7]` (3 windows:
  slices [1,2],[2,3],[3,4] → sums [3,5,7]).
- Buggy behavior: `range(len(values) - window)` = `range(2)` = indices
  0, 1 → returns `[3, 5]`; the last window ([3,4] → 7) is dropped.

A correct fix changes the loop to `range(len(values) - window + 1)`.

## BUG-2: wrong rounding in `apply_discount` (mechanical)

`apply_discount(price_cents, pct)` must round HALF-UP to whole cents.

- `apply_discount(5, 50)` = 2.5 cents → must return `3`.
- Buggy behavior: Python's `round()` is banker's rounding (half to even),
  so `round(2.5)` = `2`.
- A correct fix uses half-up: e.g. `math.floor(x + 0.5)`.
- Non-boundary case: `apply_discount(100, 25)` = 75 → `75` (both agree).

## BUG-3: mishandled empty input in `percentage_of` (mechanical)

`percentage_of(part, whole)` must return `0.0` when `whole` is 0 (no input
share of nothing). Buggy behavior: `ZeroDivisionError`.

- `percentage_of(5, 0)` must return `0.0`.
- `percentage_of(50, 200)` = `25.0` (unaffected).

## Scope

Exactly these three bugs. Claims about other defects in this file are
checkable only if they are mechanically describable like the above; "the
code is ugly" is not a bug for this challenge.
