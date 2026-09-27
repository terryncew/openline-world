"""Track-A owner control-plane tests: delegation records, activity modes,
the pause switch, and worker_state reporting.

These cover the custody-era control plane that survived the removal of
the in-process worker loop (backend/agent_worker.py, removed in the
custody lane): the owner can still record a delegation, set activity
modes, and flip the pause switch, and state() still exposes the
track-A fields. What these tests do NOT cover is deliberate (see
docs/removed-test-coverage-map.md): delegation limits
(spending_limit/work_limit/permitted_actions/review_conditions/
complete_after_settled) are recorded but not enforced at the receiver,
no code path can create an escalation anymore
(World._create_escalation has no callers), and the pause switch is
displayed but not enforced by the receiver. Those are behavioral gaps
for the owner's call, not test gaps.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.
"""
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from custody_client import _Client  # noqa: E402
from world import (  # noqa: E402
    World,
    WorldRuleError,
    MAX_STANDING_AGE_SECONDS,
)

import tempfile


def _fresh_world():
    return World(data_root=Path(tempfile.mkdtemp(prefix="tracka-test-")))


def _join(world, pid, scopes=("notes.read", "notes.write")):
    client = _Client(pid, scopes=scopes)
    client.join(world)
    return client


def _delegate_body(**over):
    body = {"goal": "Find tidy-notes work and do it within bounds.",
            "permitted_actions": ["tidy-notes"],
            "permitted_resources": ["notes"],
            "spending_limit": 10,
            "work_limit": 10,
            "review_conditions": {}}
    body.update(over)
    return body


class TestDelegationRecords(unittest.TestCase):
    def test_delegate_assigns_automation_and_records(self):
        w = _fresh_world()
        a = _join(w, "alice")
        out = w.delegate(a.pid, a.token, _delegate_body())
        self.assertTrue(out["delegation_id"].startswith("dlg-"))
        self.assertEqual(out["activity_mode"], "automation")
        got = w.delegation_for(a.pid, a.token)["delegation"]
        self.assertEqual(got["goal"],
                         "Find tidy-notes work and do it within bounds.")
        self.assertEqual(got["permitted_actions"], ["tidy-notes"])
        self.assertEqual(got["spending_limit"], 10)
        self.assertEqual(got["work_limit"], 10)
        self.assertEqual(got["status"], "active")
        # The summary exposed in state() carries no secrets.
        by_id = {p["participant_id"]: p for p in w.state()["participants"]}
        self.assertNotIn("token", by_id["alice"]["delegation"])

    def test_redelegate_replaces_goal_and_resets_counters(self):
        w = _fresh_world()
        a = _join(w, "alice")
        first = w.delegate(a.pid, a.token, _delegate_body())
        w.delegations["alice"]["actions_count"] = 3
        second = w.delegate(a.pid, a.token, _delegate_body(
            goal="New direction: summaries only.",
            permitted_actions=["summarize"]))
        self.assertNotEqual(first["delegation_id"], second["delegation_id"])
        got = w.delegation_for(a.pid, a.token)["delegation"]
        self.assertEqual(got["goal"], "New direction: summaries only.")
        self.assertEqual(got["permitted_actions"], ["summarize"])
        self.assertEqual(got["actions_count"], 0)
        self.assertEqual(got["spent"], 0)

    def test_delegate_validation(self):
        w = _fresh_world()
        a = _join(w, "alice")
        bad = [
            {"permitted_actions": ["config.write"]},
            {"spending_limit": -1},
            {"work_limit": 0},
            {"review_conditions": {"teleport": True}},
            {"goal": "   "},
            {"permitted_actions": "tidy-notes"},
            {"complete_after_settled": 0},
            {"complete_after_settled": "many"},
        ]
        for kw in bad:
            with self.assertRaises(WorldRuleError, msg=str(kw)):
                w.delegate(a.pid, a.token, _delegate_body(**kw))
        out = w.delegate(a.pid, a.token,
                         _delegate_body(complete_after_settled=3))
        self.assertEqual(
            w.delegation_for(a.pid, a.token)["delegation"]
            ["complete_after_settled"], 3)
        self.assertTrue(out["delegation_id"].startswith("dlg-"))

    def test_no_delegation_returns_null(self):
        w = _fresh_world()
        a = _join(w, "alice")
        self.assertIsNone(w.delegation_for(a.pid, a.token)["delegation"])


class TestActivityModes(unittest.TestCase):
    def _mode(self, w, pid):
        for p in w.state()["participants"]:
            if p["participant_id"] == pid:
                return p["activity_mode"]
        self.fail("participant missing from state")

    def test_join_defaults_to_manual(self):
        w = _fresh_world()
        _join(w, "alice")
        self.assertEqual(self._mode(w, "alice"), "manual")

    def test_scripted_assignable_directly(self):
        w = _fresh_world()
        a = _join(w, "alice")
        out = w.set_activity_mode(a.pid, a.token, "scripted")
        self.assertEqual(out["activity_mode"], "scripted")
        self.assertEqual(self._mode(w, "alice"), "scripted")
        w.set_activity_mode(a.pid, a.token, "manual")
        self.assertEqual(self._mode(w, "alice"), "manual")

    def test_automation_only_via_delegate(self):
        w = _fresh_world()
        a = _join(w, "alice")
        with self.assertRaises(WorldRuleError) as ctx:
            w.set_activity_mode(a.pid, a.token, "automation")
        self.assertEqual(ctx.exception.code, "WORLD_RULE_ACTIVITY_MODE_INVALID")
        w.delegate(a.pid, a.token, _delegate_body())
        self.assertEqual(self._mode(w, "alice"), "automation")

    def test_live_and_unknown_modes_rejected(self):
        w = _fresh_world()
        a = _join(w, "alice")
        for mode in ("live", "turbo"):
            with self.assertRaises(WorldRuleError, msg=mode):
                w.set_activity_mode(a.pid, a.token, mode)
        self.assertEqual(self._mode(w, "alice"), "manual")


class TestPauseSwitch(unittest.TestCase):
    def test_pause_switch_set_and_reported(self):
        w = _fresh_world()
        a = _join(w, "alice")
        w.delegate(a.pid, a.token, _delegate_body())
        out = w.set_paused(a.pid, a.token, True)
        self.assertEqual(out, {"paused": True})
        by_id = {p["participant_id"]: p for p in w.state()["participants"]}
        self.assertTrue(by_id["alice"]["paused"])
        self.assertEqual(by_id["alice"]["worker_state"], "paused")
        w.set_paused(a.pid, a.token, False)
        by_id = {p["participant_id"]: p for p in w.state()["participants"]}
        self.assertFalse(by_id["alice"]["paused"])
        self.assertEqual(by_id["alice"]["worker_state"], "running")

    def test_pause_switch_rejects_non_bool(self):
        w = _fresh_world()
        a = _join(w, "alice")
        with self.assertRaises(WorldRuleError):
            w.set_paused(a.pid, a.token, "yes")

    def test_worker_state_idle_running_held_standing(self):
        w = _fresh_world()
        a = _join(w, "alice")
        states = lambda: {p["participant_id"]: p["worker_state"]  # noqa: E731
                          for p in w.state()["participants"]}
        self.assertEqual(states()["alice"], "idle")  # manual, no delegation
        w.delegate(a.pid, a.token, _delegate_body())
        self.assertEqual(states()["alice"], "running")
        w.sessions["alice"].standing_checked_at = (
            time.time() - MAX_STANDING_AGE_SECONDS - 10)
        self.assertEqual(states()["alice"], "held_standing")
        w.sessions["alice"].standing_checked_at = time.time()
        self.assertEqual(states()["alice"], "running")


if __name__ == "__main__":
    unittest.main()
