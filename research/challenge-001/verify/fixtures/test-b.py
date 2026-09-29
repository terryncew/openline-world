# test_two_bugs.py — failing-test file for toy-app/ledger.py (CHALLENGE-001)
#
# NOTE: this file deliberately demonstrates TWO documented bugs (BUG-1 and
# BUG-2). Per the frozen criteria it is structurally well-formed, so the
# machine admits it — and the evaluator DECLINES it with the checkable
# reason "bundles BUG-1 and BUG-2; one bug per test". That is the frozen
# control 2, implemented exactly as specified.
#
# Expected behavior per toy-app/EXPECTED.md (checkable without running):
#   rolling_sum([1, 2, 3, 4], 2) == [3, 5, 7]      (BUG-1: off-by-one)
#   apply_discount(5, 50) == 3                      (BUG-2: banker's rounding)
from toy_app.ledger import rolling_sum, apply_discount


def test_rolling_sum_last_window():
    # BUG-1: the last window ([3,4] -> 7) is dropped by the off-by-one.
    got = rolling_sum([1, 2, 3, 4], 2)
    assert got == [3, 5, 7], f"expected [3, 5, 7], got {got}"


def test_apply_discount_half_up():
    # BUG-2: round() is banker's rounding; round(2.5) == 2, expected 3.
    got = apply_discount(5, 50)
    assert got == 3, f"expected 3 (half-up), got {got}"
