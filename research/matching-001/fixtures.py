"""MATCHING-001 fixture generator (deterministic).

Generates the frozen worker population and task pools from a fixed seed.
The outputs are printed and then embedded into PROTOCOL.md; after that the
fixtures are FIXED and this generator is not re-run for this experiment.

Design (from the frozen protocol):
- 24 harbors with true tide heights.
- 6 workers. Each has a posted per-unit rate (cents), a fixed fact table
  (harbor -> height string or absent), and a fixed execution cost per attempt.
  Fact tables are drawn with a seeded RNG: for each worker x harbor,
  has_entry with p=0.75; if entry, correct with p=0.7 else stale (drift).
  mw-s6 is special: NO tide-report entries (declines all tide-report
  contracts), but it has 2 recorded accepted WEATHER-REPORT commissions
  (irrelevant-history control).
- History pool: harbors 1-12. Evaluation pool: harbors 13-24.

Nothing here is tuned to favor either selector. The draw is one fixed
seed; the protocol is frozen before any outcome exists.
"""

import json
import random

SEED = 20260928

HARBORS = [
    ("harbor", "2.43"), ("marina", "1.87"), ("cove", "3.12"), ("inlet", "0.95"),
    ("bay", "4.20"), ("quay", "2.05"), ("dock", "1.44"), ("pier", "3.66"),
    ("jetty", "2.78"), ("wharf", "1.19"), ("anchorage", "5.02"), ("lagoon", "0.61"),
    ("roads", "3.35"), ("haven", "2.90"), ("sound", "4.47"), ("strait", "1.58"),
    ("channel", "2.21"), ("basin", "3.83"), ("pool", "0.84"), ("reach", "2.67"),
    ("arm", "4.95"), ("bight", "1.32"), ("firth", "3.08"), ("gulf", "2.14"),
]

# (worker_id, posted_rate_cents_per_unit, execution_cost_cents_per_attempt)
WORKER_DEFS = [
    ("mw-s1", 10, 30),
    ("mw-s2", 6, 18),
    ("mw-s3", 18, 40),
    ("mw-s4", 30, 60),
    ("mw-s5", 45, 90),
    ("mw-s6", 8, 20),   # posts tide-report offers but has no tide-report entries
]

UNITS_PER_ATTEMPT = 4
SUCCESS_FEE_CENTS = 300
MATCHING_FEE_CENTS = 5


def main():
    rng = random.Random(SEED)
    workers = []
    for wid, rate, exec_cost in WORKER_DEFS:
        facts = {}
        for harbor, height in HARBORS:
            if wid == "mw-s6":
                continue  # no tide-report entries by design
            if rng.random() < 0.75:
                if rng.random() < 0.70:
                    facts[harbor] = height
                else:
                    drift = rng.choice([-0.5, -0.4, -0.3, -0.2, -0.1,
                                        0.1, 0.2, 0.3, 0.4, 0.5])
                    stale = round(float(height) + drift, 2)
                    facts[harbor] = f"{stale:.2f}"
        n_correct = sum(1 for h, hh in HARBORS
                        if facts.get(h) == hh)
        n_stale = sum(1 for h, hh in HARBORS
                       if h in facts and facts[h] != hh)
        workers.append({
            "worker_id": wid,
            "posted_rate_cents_per_unit": rate,
            "units_per_attempt": UNITS_PER_ATTEMPT,
            "attempt_price_cents": rate * UNITS_PER_ATTEMPT,
            "execution_cost_cents_per_attempt": exec_cost,
            "fact_entries": len(facts),
            "correct_entries": n_correct,
            "stale_entries": n_stale,
            "facts": facts,
        })
    fixtures = {
        "seed": SEED,
        "harbors": [{"harbor": h, "true_height_m": hh} for h, hh in HARBORS],
        "history_pool": [h for h, _ in HARBORS[:12]],
        "evaluation_pool": [h for h, _ in HARBORS[12:]],
        "units_per_attempt": UNITS_PER_ATTEMPT,
        "success_fee_cents": SUCCESS_FEE_CENTS,
        "matching_fee_cents": MATCHING_FEE_CENTS,
        "workers": workers,
    }
    print(json.dumps(fixtures, indent=2, sort_keys=False))


if __name__ == "__main__":
    main()
