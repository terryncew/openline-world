#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python - <<'PY'
import json, subprocess
from pathlib import Path
pins = json.loads(Path('bounty/components.json').read_text())
root = Path('.venv/component-sources')
root.mkdir(exist_ok=True)
for name, commit in pins.items():
    dest = root / name
    if not dest.exists():
        subprocess.run(['git', 'init', '-q', str(dest)], check=True)
        subprocess.run(['git', '-C', str(dest), 'remote', 'add', 'origin',
                        f'https://github.com/terryncew/openline-{name}.git'], check=True)
        subprocess.run(['git', '-C', str(dest), 'fetch', '--depth=1', 'origin', commit], check=True)
        subprocess.run(['git', '-C', str(dest), 'checkout', '--detach', commit], check=True)
    actual = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != commit:
        raise SystemExit(f'{name}: unexpected source revision; preserve and inspect before reinstalling')
PY
.venv/bin/pip install -r backend/requirements.txt -r backend/requirements-test.txt \
  .venv/component-sources/receipt-gate .venv/component-sources/airlock
(cd frontend && npm ci --cache "$PWD/../../.npm-cache")
