"""ledger.py — tiny accounting helper for CHALLENGE-001.

DELIBERATELY BROKEN VERIFICATION FIXTURE. This file contains exactly three
documented bugs (BUG-1, BUG-2, BUG-3). It is not a library and must not be
used for real accounting. Expected behavior is documented in EXPECTED.md;
every claim below is checkable against that file without running anything.

Contributions (patch/test/review) target THIS file only.
"""


def rolling_sum(values, window):
    """Sum of each consecutive `window`-length slice of `values`."""
    out = []
    for i in range(len(values) - window):  # BUG-1: off-by-one, drops last window
        out.append(sum(values[i:i + window]))
    return out


def apply_discount(price_cents, pct):
    """Apply a percentage discount; result in whole cents, half-up."""
    # BUG-2: round() is banker's rounding (half to even), not half-up.
    return round(price_cents * (100 - pct) / 100)


def percentage_of(part, whole):
    """Share of `whole` taken by `part`, as a percentage (0-100)."""
    # BUG-3: whole=0 raises ZeroDivisionError; expected 0.0.
    return 100.0 * part / whole
