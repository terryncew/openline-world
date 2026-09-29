"""Generate the frozen evaluation task list for MATCHING-001.

8 blocks x 6 tasks, drawn from the evaluation pool with a fixed seed.
Written to eval_tasks.json; frozen before any run.
"""
import json
import random

SEED = 20260928
BLOCKS = 8
TASKS_PER_BLOCK = 6

fixtures = json.load(open("fixtures.json"))
pool = fixtures["evaluation_pool"]

rng = random.Random(SEED + 1)  # distinct stream from fixture generation
blocks = []
for b in range(BLOCKS):
    tasks = rng.sample(pool, TASKS_PER_BLOCK)
    blocks.append([{"task_id": f"t{b + 1}-{i + 1:02d}", "harbor": h}
                   for i, h in enumerate(tasks)])

with open("eval_tasks.json", "w") as f:
    json.dump({"seed": SEED + 1, "blocks": blocks}, f, indent=2)
print(f"{BLOCKS} blocks x {TASKS_PER_BLOCK} tasks written to eval_tasks.json")
