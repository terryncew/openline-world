"""Activate pinned existing Bureau and Exchange source; World Wallet stays unchanged."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / '.venv' / 'component-sources'
PINS = json.loads((ROOT / 'bounty' / 'components.json').read_text())


def activate():
    for name in ('wallet', 'bureau'):
        if not (SOURCES / name).is_dir():
            raise RuntimeError('Run bash bounty/install.sh first')
    for path in (SOURCES / 'bureau', SOURCES / 'wallet' / 'demo' / 'agent-exchange-001'):
        if str(path) not in sys.path:
            sys.path.append(str(path))
