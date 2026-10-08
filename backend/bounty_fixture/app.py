"""Harmless, deliberately vulnerable in-memory notes fixture. No network or files."""
NOTES = {'alice': 'Alice test note', 'bob': 'Bob test note: blue umbrella'}


def read_note(requester: str, target: str, *, fixed: bool = False) -> dict:
    if requester not in NOTES or target not in NOTES:
        return {'status': 404, 'body': None}
    if fixed and requester != target:
        return {'status': 403, 'body': None}
    # Deliberate IDOR: the vulnerable version omits the ownership check.
    return {'status': 200, 'body': NOTES[target]}
