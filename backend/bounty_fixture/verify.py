"""Buyer-owned frozen check: consumes JSON data; never executes worker code."""
import json
import sys
from pathlib import Path

from app import read_note


def verify(candidate: dict) -> dict:
    supported = set(candidate) == {'requester', 'target', 'claim'}
    supported = supported and candidate['requester'] == 'alice' and candidate['target'] in ('alice', 'bob')
    if not supported:
        return {'accepted': False, 'reason': 'UNSUPPORTED_FINDING'}
    observed = read_note(candidate['requester'], candidate['target'])
    control = read_note(candidate['requester'], candidate['target'], fixed=True)
    accepted = (candidate['claim'] == 'cross-user-note' and candidate['target'] != candidate['requester']
                and observed == {'status': 200, 'body': 'Bob test note: blue umbrella'}
                and control == {'status': 403, 'body': None})
    return {'accepted': accepted, 'reason': 'REPRODUCIBLE_IDOR' if accepted else 'NO_CROSS_USER_FINDING',
            'reproduction': observed, 'fixed_control': control}


if __name__ == '__main__':
    result = verify(json.loads(Path(sys.argv[1]).read_text()))
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result['accepted'] else 1)
