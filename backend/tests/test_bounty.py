"""Thin-adapter integration tests. All effects local, all money simulated."""
import hashlib
import json
import os
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from bounty import Bounty, BountyError, FIXTURE, TERMS, frozen_fixture
from bureau.adapters import adapt
from bureau.conformance import validate
from bureau.store import Store
from openline_wallet.crypto import verify_record

FAILED = {'requester': 'alice', 'target': 'alice', 'claim': 'cross-user-note'}
SUCCESS = {'requester': 'alice', 'target': 'bob', 'claim': 'cross-user-note'}


class BountyCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name) / 'bounty'
        self.b = Bounty(self.home)

    def tearDown(self):
        self.b.close()
        self.temp.cleanup()

    def approved(self):
        self.b.approve()

    def verified(self, candidate=FAILED):
        self.b.attempt(candidate)
        number = len(self.b.state['attempts'])
        self.b.verify(number)
        return number

    def eligible(self, candidate=FAILED):
        number = self.verified(candidate)
        self.b.prepare_payment('attempt', number)
        return f'attempt-{number}'

    def restart(self):
        self.b.close()
        self.b = Bounty(self.home)

    def test_complete_transaction_and_bureau_evidence(self):
        self.approved()
        self.b.settle(self.eligible())
        self.assertFalse(self.b.state['attempts'][0]['verification']['accepted'])
        self.assertEqual([t['amount'] for t in self.b.snapshot()['ledger']['transfers']], [10])
        with self.assertRaisesRegex(BountyError, 'SUCCESS_REWARD_NOT_EARNED'):
            self.b.prepare_payment('reward')
        self.b.settle(self.eligible(SUCCESS))
        self.b.prepare_payment('reward')
        self.b.settle('reward')
        snap = self.b.snapshot()
        self.assertEqual([t['amount'] for t in snap['ledger']['transfers']], [10, 10, 100])
        self.assertEqual(len({t['settlement_id'] for t in snap['ledger']['transfers']}), 3)
        self.assertTrue(snap['attempts'][1]['verification']['accepted'])
        self.assertTrue(all(p['status'] == 'SETTLED' for p in snap['payments']))
        kinds = {r['action']['type'] for r in snap['records']}
        self.assertTrue({'owner-approval', 'authorization', 'attempt', 'verification', 'acceptance', 'settlement'} <= kinds)
        for r in snap['records']:
            self.assertFalse(validate(r)['problems'])
            signer = snap['owner_public_key'] if r['action']['type'] == 'owner-approval' else snap['receiver_public_key']
            self.assertTrue(verify_record(r, expected_public_key=signer)[0])
        # Existing Bureau parser ingests each receipt without changes; duplicates are idempotent.
        store = Store(str(Path(self.temp.name) / 'other-bureau.db'))
        try:
            for r in snap['records']:
                records = adapt(r, {'source_repo': 'terryncew/openline-world', 'source_path': 'selected-local-receipt'})
                self.assertEqual(store.ingest_many(records)['inserted'], 1)
                self.assertEqual(store.ingest_many(records)['duplicate'], 1)
            self.assertEqual(store.count(), len(snap['records']))
        finally:
            store.close()
        self.restart()
        self.assertEqual(len(self.b.snapshot()['ledger']['transfers']), 3)

    def test_owner_approval_required_and_frozen_in_advance(self):
        with self.assertRaisesRegex(BountyError, 'OWNER_APPROVAL'):
            self.b.attempt(SUCCESS)
        self.approved()
        approval = next(r for r in self.b.state['records'] if r['receipt_id'] == self.b.state['approval'])
        evidence = json.loads(approval['extensions']['openline.world/bounty']['evidence_json'])
        self.assertEqual(evidence['terms']['max_attempt_sim_usd'], 20)
        self.assertEqual(evidence['terms']['reward_sim_usd'], 100)
        with mock.patch.dict(TERMS, reward_sim_usd=1000):
            with self.assertRaisesRegex(BountyError, 'FROZEN_TERMS_CHANGED'):
                self.b.attempt(SUCCESS)
        self.assertEqual(self.b.state['attempts'], [])

    def test_unauthorized_worker_refused_before_effect(self):
        self.approved()
        self.b.attempt(SUCCESS, actor='unauthorized-worker')
        self.assertEqual(self.b.state['attempts'], [])
        auth = self.b.state['records'][-1]
        self.assertEqual(auth['decision']['outcome'], 'STOPPED')
        self.assertEqual(self.b.snapshot()['ledger']['transfers'], [])

    def test_revoked_mandate_refused(self):
        self.approved()
        self.b.revoke()
        self.b.attempt(SUCCESS)
        self.assertEqual(self.b.state['attempts'], [])
        body = json.loads(self.b.state['records'][-1]['extensions']['openline.world/bounty']['evidence_json'])
        self.assertIn('MANDATE_REVOKED', body['wallet_receipt']['reason_codes'])

    def test_expired_mandate_refused(self):
        with mock.patch.dict(TERMS, mandate_ttl_seconds=1):
            self.approved()
            time.sleep(1.05)
            self.b.attempt(SUCCESS)
            self.assertEqual(self.b.state['attempts'], [])
            body = json.loads(self.b.state['records'][-1]['extensions']['openline.world/bounty']['evidence_json'])
            self.assertIn('MANDATE_EXPIRED', body['wallet_receipt']['reason_codes'])

    def test_receiver_policy_independently_refuses_after_wallet_allowance(self):
        self.approved()
        # A genuine signed ALLOWED authorization cannot bypass receiver-owned evidence.
        with mock.patch.object(self.b.wallet, 'timeline') as timeline:
            timeline.return_value.active_by_subject = {}
            self.b.attempt(SUCCESS)
        self.assertEqual(self.b.state['attempts'][0]['status'], 'REFUSED')
        self.assertIsNone(self.b.state['attempts'][0]['effect'])
        self.assertEqual(self.b.snapshot()['ledger']['transfers'], [])
        self.assertEqual(self.b.state['records'][-1]['decision']['outcome'], 'DENY')

    def test_incomplete_attempt_evidence_earns_nothing(self):
        self.approved()
        self.b.attempt(FAILED)
        with self.assertRaisesRegex(BountyError, 'ATTEMPT_EVIDENCE_INCOMPLETE'):
            self.b.prepare_payment('attempt', 1)
        self.assertEqual(self.b.state['payments'], [])
        self.b.verify(1)
        self.b.state['attempts'][0]['attempt_receipt'] = None
        with self.assertRaisesRegex(BountyError, 'ATTEMPT_EVIDENCE_INCOMPLETE'):
            self.b.prepare_payment('attempt', 1)
        self.assertEqual(self.b.snapshot()['ledger']['transfers'], [])

    def test_failed_unsupported_and_duplicate_claims_cannot_earn_reward(self):
        self.approved()
        with self.assertRaisesRegex(BountyError, 'UNSUPPORTED_FINDING'):
            self.b.attempt({**SUCCESS, 'acceptance': 'always pass', 'reward': 10000})
        self.assertEqual(self.b.state['attempts'], [])
        self.verified(SUCCESS)
        self.verified(SUCCESS)
        self.assertEqual(self.b.state['attempts'][1]['verification']['reason'], 'DUPLICATE_FINDING')
        self.assertFalse(self.b.state['attempts'][1]['verification']['accepted'])
        self.b.prepare_payment('reward')
        self.b.settle('reward')
        self.b.prepare_payment('reward')
        self.b.settle('reward')
        self.assertEqual([t['amount'] for t in self.b.snapshot()['ledger']['transfers']], [100])

    def test_attempt_compensation_cap_and_concurrent_replays(self):
        self.approved()
        for _ in range(2):
            self.b.settle(self.eligible())
        with self.assertRaisesRegex(BountyError, 'ATTEMPT_LIMIT_REACHED'):
            self.b.attempt(FAILED)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: self.b.settle('attempt-1'), range(8)))
        self.assertEqual(sum(t['amount'] for t in self.b.snapshot()['ledger']['transfers']), 20)
        self.assertEqual(len(self.b.state['attempts']), 2)
        key = self.b.state['payments'][0]['job_id']
        code, _, err = self.b.x.cli('settle', '--caller', 'owner', '--job', key)
        self.assertNotEqual(code, 0)
        self.assertIn('ALREADY_SETTLED', err)

    def test_crash_after_transfer_restarts_and_completes_without_second_payment(self):
        self.approved()
        key = self.eligible()
        with mock.patch.dict(os.environ, COMMISSION_CRASH_AFTER='ledger'):
            self.b.settle(key)
        self.assertEqual(len(self.b.snapshot()['ledger']['transfers']), 1)
        self.restart()
        self.assertEqual(self.b.state['payments'][0]['status'], 'UNRESOLVED')
        before = self._tree_hashes()
        reconciled = self.b.reconcile()
        self.assertEqual(before, self._tree_hashes())
        self.assertIn('COMMITTED', reconciled['reconciliation'])
        self.assertEqual(reconciled['payments'][0]['observation'], 'COMMITTED_LOCAL_RECORDS_INCOMPLETE')
        with self.assertRaisesRegex(BountyError, 'PAYMENT_UNRESOLVED_NO_BLIND_RETRY'):
            self.b.settle(key)
        self.b.settle(key, complete_committed=True)
        self.assertEqual(len(self.b.snapshot()['ledger']['transfers']), 1)
        self.assertEqual(self.b.state['payments'][0]['status'], 'SETTLED')

    def test_missing_confirmation_is_unknown_never_failure_or_blind_retry(self):
        self.approved()
        key = self.eligible()
        # Interrupt before dispatch: intent persisted, no transfer confirmation exists.
        with mock.patch.object(self.b.x, 'cli', side_effect=RuntimeError('interrupted')):
            with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                self.b.settle(key)
        self.restart()
        snap = self.b.reconcile()
        self.assertEqual(snap['payments'][0]['observation'], 'UNKNOWN_NO_CONFIRMATION')
        self.assertEqual(snap['ledger']['transfers'], [])
        for complete in (False, True):
            with self.assertRaisesRegex(BountyError, 'PAYMENT_UNRESOLVED_NO_BLIND_RETRY'):
                self.b.settle(key, complete_committed=complete)
        self.assertEqual(self.b.snapshot()['ledger']['transfers'], [])

    def test_interrupted_commission_resumes_same_request_without_duplicate_reservation(self):
        self.approved()
        self.verified()
        with mock.patch.dict(os.environ, COMMISSION_CRASH_AFTER='commission-txn'):
            with self.assertRaises(Exception):
                self.b.prepare_payment('attempt', 1)
        self.restart()
        self.b.prepare_payment('attempt', 1)
        self.b.settle('attempt-1')
        self.assertEqual(len(self.b.x.read_json('jobs.json')), 1)
        self.assertEqual(len(self.b.state['payments']), 1)
        self.assertEqual(len(self.b.snapshot()['ledger']['transfers']), 1)

    def test_signed_authorization_and_worker_receipt_prove_no_vulnerability(self):
        self.approved()
        self.b.attempt(FAILED)
        before = self.b.snapshot()
        self.assertIsNone(before['reward_verification'])
        auth_rows = [r for r in before['bureau']['records'] if r['adapter'] == 'gate_action_receipt']
        self.assertTrue(auth_rows)
        self.assertTrue(all(r['effect_observed'] is None for r in auth_rows))
        self.b.verify(1)
        self.assertFalse(self.b.state['attempts'][0]['verification']['accepted'])
        with self.assertRaisesRegex(BountyError, 'SUCCESS_REWARD_NOT_EARNED'):
            self.b.prepare_payment('reward')

    def test_worker_material_and_modified_checks_cannot_change_verification(self):
        self.approved()
        with self.assertRaisesRegex(BountyError, 'UNSUPPORTED_FINDING'):
            self.b.attempt({**SUCCESS, 'verifier': 'print(success)', 'policy': {'accepted': True}})
        with tempfile.TemporaryDirectory() as d:
            fake = Path(d)
            (fake / 'app.py').write_text('print("pass")')
            (fake / 'verify.py').write_text('raise SystemExit(0)')
            with mock.patch('bounty.FIXTURE', fake):
                with self.assertRaisesRegex(BountyError, 'FROZEN_CHECK_CHANGED'):
                    frozen_fixture()
        self.assertEqual(self.b.state['attempts'], [])

    def test_unresolved_fixture_effect_is_not_redispatched_after_restart(self):
        self.approved()
        with mock.patch('bounty.importlib.util.spec_from_file_location', side_effect=RuntimeError('interrupted fixture')):
            with self.assertRaises(RuntimeError):
                self.b.attempt(SUCCESS)
        self.restart()
        self.assertEqual(self.b.state['attempts'][0]['status'], 'UNRESOLVED')
        with self.assertRaisesRegex(BountyError, 'EFFECT_UNRESOLVED_NO_RETRY'):
            self.b.attempt(SUCCESS)

    def test_altered_signed_evidence_cannot_compensate(self):
        self.approved()
        self.verified()
        receipt = next(r for r in self.b.state['records'] if r['receipt_id'] == self.b.state['attempts'][0]['attempt_receipt'])
        receipt['effect']['observed'] = False
        with self.assertRaisesRegex(BountyError, 'EVIDENCE_SIGNATURE_INVALID'):
            self.b.prepare_payment('attempt', 1)
        self.assertEqual(self.b.state['payments'], [])

    def test_receipt_export_crash_deduplicates_settlement_evidence(self):
        self.approved()
        key = self.eligible()
        original = self.b._record

        def interrupt(kind, *args, **kwargs):
            result = original(kind, *args, **kwargs)
            if kind == 'settlement':
                raise RuntimeError('interrupted after receipt export')
            return result

        with mock.patch.object(self.b, '_record', side_effect=interrupt):
            with self.assertRaises(RuntimeError):
                self.b.settle(key)
        self.restart()
        self.b.settle(key, complete_committed=True)
        self.assertEqual(len(self.b.snapshot()['ledger']['transfers']), 1)
        receipts = [r for r in self.b.state['records'] if r['action']['type'] == 'settlement']
        self.assertEqual(len(receipts), 1)

    def _tree_hashes(self):
        return {str(p.relative_to(self.home)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.home.rglob('*') if p.is_file()}


if __name__ == '__main__':
    unittest.main()
