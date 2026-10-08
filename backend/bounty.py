"""BOUNTY-001: a thin adapter around the unchanged Agent Exchange Kernel.

The kernel's existing text_digest service verifies evidence packaging and pays
$10 per eligible attempt or $100 for a verified finding. Finding verification
is a separate buyer-owned frozen fixture check. No new ledger or money rules.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import workshop_gate  # activates World's vendored Wallet unchanged
from openline_wallet.wallet import Wallet
from openline_wallet.effect_closure import EffectGate
from openline_wallet.receiver import create_presentation
from openline_wallet.crypto import (Ed25519PrivateKey, public_key_hex, save_private_key,
                                    load_private_key, sign_record, verify_record)
from openline_wallet.storage import atomic_write_json
from bounty_components import activate, ROOT, PINS

activate()
from exchange.kernel import Exchange
from airlock.sieve import run_checks
from airlock.receipt import ensure_key, sign as airlock_sign
from bureau.adapters import adapt
from bureau.conformance import validate as bureau_validate
from bureau.store import Store
from olp_gate import authorize, AuthorizationBlocked, payment_semantics

FIXTURE = ROOT / 'backend' / 'bounty_fixture'
FIXTURE_PINS = {
    'app.py': 'cff0a98ad8f47f39beaea517394502327c35baf40487f3c63aa45b1bf2e343a1',
    'verify.py': 'a406520d01a6a4985ec8317d049e2a3204efdc3cd26e2673bd68d6400aa5a9d7',
}
ACTION = 'bounty.fixture.read'
WORKER = 'worker-a'
TERMS = {
    'worker': WORKER, 'target': 'in-memory-local-notes-fixture', 'max_attempts': 2,
    'attempt_sim_usd': 10, 'max_attempt_sim_usd': 20, 'reward_sim_usd': 100,
    'currency': 'SIM_USD (simulated)', 'mandate_ttl_seconds': 3600,
    'attempt_evidence': 'Current authorization, observed fixture response, receiver-bound candidate and buyer verification record; original kernel verifies evidence text_digest before compensation.',
    'reward_conditions': 'Frozen buyer check reproduces cross-user Bob note access and fixed control refuses it; observed attempt matches reproduction; first unique verified finding only.',
    'unknown_outcome': 'Hold unresolved effects or payments; read-only reconciliation; never blind retry.',
    'fixture_pins': FIXTURE_PINS,
}


class BountyError(ValueError):
    pass


def now():
    return datetime.now(timezone.utc)


def frozen_fixture():
    for name, pin in FIXTURE_PINS.items():
        if hashlib.sha256((FIXTURE / name).read_bytes()).hexdigest() != pin:
            raise BountyError('FROZEN_CHECK_CHANGED')


def json_text(value):
    # Keep component outputs byte-faithful, including Airlock floating durations.
    # Wallet's canonical signed bodies forbid floats, so raw JSON is a signed string.
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


class Bounty:
    def __init__(self, home: Path):
        self.home = Path(home)
        self.home.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.path = self.home / 'bounty.json'
        self.x = Exchange(self.home / 'exchange')
        self.gate = EffectGate('bounty-fixture-receiver')
        self.receiver_key = self._key('receiver')
        self.worker_key = self._key('worker')
        self.store = Store(str(self.home / 'bureau.db'))
        if self.path.exists():
            self.state = json.loads(self.path.read_text())
        else:
            self.x.cli_ok('init')
            self.state = {'id': 'bounty-' + uuid.uuid4().hex, 'phase': 'OFFERED', 'approval': None,
                          'mandate': None, 'attempts': [], 'payments': [], 'records': [],
                          'events': [], 'reward_verification': None}
            for kind, amount in [('attempt', 10), ('reward', 100)]:
                self.x.cli_ok('offer', '--caller', 'seller', '--price', str(amount),
                              '--offer-id', 'offer-bounty-' + kind)
                self.x.registry.register({
                    'seller_id': self.x.principal('seller'), 'seller_name': WORKER, 'identity': 'seller',
                    'capability': 'bounty-' + kind, 'service': 'text_digest',
                    'artifact': 'bounty-evidence-' + kind + '@1', 'price': amount,
                    'currency': 'SIM_USD (simulated)', 'terms': 'Evidence packaging, not finding verification',
                    'acceptance': dict(self.x.commission_mod.ACCEPTANCE), 'offer_id': 'offer-bounty-' + kind,
                    'evidence': [],
                })
            self.x.post_need('Two authorized local attempts; first reproducible cross-user finding',
                             ['bounty'], 120, service='text_digest')
            self._event('buyer', 'OFFERED', 'Up to $20 for two eligible attempts + $100 conditional reward; simulated funds only.')
        self.wallet = Wallet.open(self.home / 'worker-wallet') if (self.home / 'worker-wallet').exists() else None
        if self.wallet:
            self.gate.pin_principal(self.wallet.principal_id, self.wallet.root_public_key)
            self.gate.admit_bundle(self.wallet.export_bundle())
        self._ingest()

    def _key(self, name):
        path = self.home / (name + '.key')
        if not path.exists():
            save_private_key(path, Ed25519PrivateKey.generate())
        return load_private_key(path)

    def close(self):
        self.store.close()

    def _save(self):
        atomic_write_json(self.path, self.state)

    def _event(self, actor, kind, summary):
        self.state['events'].append({'actor': actor, 'kind': kind, 'summary': summary, 'at': now().isoformat()})
        self._save()

    def _record(self, kind, body, *, observed=None, decision='OBSERVED', parents=(), signer=None, record_id=None):
        # Existing Bureau conformance format. No new competing receipt family.
        if record_id:
            existing = next((r for r in self.state['records'] if r['receipt_id'] == record_id), None)
            if existing:
                if (existing['action']['type'] != kind or existing['extensions']['openline.world/bounty']['evidence_json'] != json_text(body)
                        or not verify_record(existing, expected_public_key=public_key_hex(signer or self.receiver_key))[0]):
                    raise BountyError('EVIDENCE_REPLAY_CONFLICT')
                return record_id
        record = sign_record({
            'receipt_version': 'bureau.receipt.v0.1', 'receipt_id': record_id or uuid.uuid4().hex,
            'timestamp': now().isoformat(), 'receiver': 'openline-world-local-bounty',
            'principal': self.x.principal('owner'), 'actor': WORKER,
            'action': {'type': kind, 'target': TERMS['target']},
            'decision': {'outcome': decision, 'reason': kind},
            'effect': {'observed': observed}, 'parents': list(parents),
            'provenance': {'system': 'openline-world-bounty',
                           'source_ref': 'BOUNTY-001', 'signature': 'Ed25519: top-level Wallet signature'},
            'extensions': {'openline.world/bounty': {'bounty_id': self.state['id'], 'kind': kind,
                                                    'evidence_json': json_text(body)}},
        }, signer or self.receiver_key)
        self.state['records'].append(record)
        self._save()
        self._ingest()
        return record['receipt_id']

    def _ingest(self):
        owner_pub = self.x.commission_mod._pub(self.x.chome, 'owner')
        for signed in self.state['records']:
            kind = signed['action']['type']
            expected = owner_pub if kind in ('owner-approval', 'revocation') else public_key_hex(self.receiver_key)
            valid, reason = verify_record(signed, expected_public_key=expected)
            if not valid:
                raise BountyError('EVIDENCE_SIGNATURE_INVALID:' + str(reason))
            check = bureau_validate(signed)
            if check['problems']:
                raise BountyError('BUREAU_CONFORMANCE_INVALID:' + str(check['problems']))
            path = self.home / 'receipts' / (signed['receipt_id'] + '.json')
            if not path.exists():
                atomic_write_json(path, signed)
            prov = {'source_repo': 'terryncew/openline-world', 'source_path': str(path), 'raw_ref': str(path)}
            stats = self.store.ingest_many(adapt(signed, prov))
            if stats['invalid']:
                raise BountyError(str(stats['errors']))
            body = json.loads(signed['extensions']['openline.world/bounty']['evidence_json'])
            raw = body.get('wallet_receipt')
            if raw:
                gate_pub = body['gate_public_key']
                if not verify_record(raw, expected_public_key=gate_pub)[0]:
                    raise BountyError('WALLET_RECEIPT_INVALID')
                stats = self.store.ingest_many(adapt(raw, {**prov, 'source_repo': 'terryncew/openline-wallet',
                                                          'source_commit': PINS['wallet']}))
                if stats['invalid']:
                    raise BountyError(str(stats['errors']))

    def _require_approval(self):
        rec = next((r for r in self.state['records'] if r['receipt_id'] == self.state['approval']), None)
        if not rec or not verify_record(rec, expected_public_key=self.x.commission_mod._pub(self.x.chome, 'owner'))[0]:
            raise BountyError('OWNER_APPROVAL_MISSING_OR_INVALID')
        body = json.loads(rec['extensions']['openline.world/bounty']['evidence_json'])
        if body['terms'] != TERMS or body['bounty_id'] != self.state['id']:
            raise BountyError('FROZEN_TERMS_CHANGED')
        return body

    def approve(self):
        with self.lock:
            if self.state['phase'] != 'OFFERED':
                return self.snapshot()
            frozen_fixture()
            owner = self.x.commission_mod._load_key(self.x.chome, 'owner')
            self.x.cli_ok('delegate', '--caller', 'owner', '--budget', '120')
            self.wallet = Wallet.create(self.home / 'worker-wallet', label='Bounty buyer', root_key=owner)
            grant = self.wallet.grant(subject_id=WORKER, subject_public_key=public_key_hex(self.worker_key),
                                     scopes=[ACTION], expires_at=now() + timedelta(seconds=TERMS['mandate_ttl_seconds']))
            self.gate.pin_principal(self.wallet.principal_id, self.wallet.root_public_key)
            self.gate.admit_bundle(self.wallet.export_bundle())
            self.state['mandate'] = grant
            self.state['approval'] = self._record('owner-approval', {'bounty_id': self.state['id'],
                'terms': TERMS, 'grant': grant}, signer=owner)
            self.state['phase'] = 'AUTHORIZED'
            self._event('owner', 'AUTHORIZED', 'Buyer signed the fixed budget, evidence requirements, reward conditions, and one-hour scoped mandate.')
            return self.snapshot()

    def revoke(self):
        with self.lock:
            self._require_approval()
            self.wallet.revoke(self.state['mandate']['data']['mandate_id'])
            self.gate.admit_bundle(self.wallet.export_bundle())
            self._record('revocation', {'mandate_id': self.state['mandate']['data']['mandate_id'],
                         'bundle': self.wallet.export_bundle()}, signer=self.x.commission_mod._load_key(self.x.chome, 'owner'))
            self._event('owner', 'REVOKED', 'Future fixture attempts refused; previously earned obligations remain payable.')
            return self.snapshot()

    def _wallet_decision(self, actor, at=None):
        bundle = self.wallet.export_bundle()
        challenge = self.gate.issue_challenge(principal_id=self.wallet.principal_id, subject_id=actor, action=ACTION)
        presentation = create_presentation(bundle=bundle, mandate_id=self.state['mandate']['data']['mandate_id'],
                        subject_id=actor, subject_key=self.worker_key, action=ACTION, receiver_challenge=challenge)
        return self.gate.evaluate(presentation, expected_action=ACTION, now=at)

    def _policy(self):
        return {'schema': 'openline.authorized_tool_policy.v1', 'mandate': {
            'profile': 'principal_mandate/v1', 'mandate_id': 'bounty-receiver-policy',
            'principal_id': 'local-bounty-buyer', 'agent_id': WORKER, 'purpose': 'local fixture only',
            'allowed_action_types': ['authorize_payment'], 'allowed_targets': ['fixture://notes/read'],
            'allowed_disclosure_classes': [], 'forbidden_disclosure_classes': [], 'max_settlement_cents': 0,
            'max_payment_cents': 0, 'delegation_allowed': False,
            'expires_at': self.state['mandate']['data']['expires_at'], 'version': '1'},
            'permission_policy': {'profile': 'decision_permission_policy/v1', 'policy_id': 'bounty-receiver',
            'version': '1', 'routes': [{'route_id': 'fixture', 'tool': 'read_fixture', 'target': 'fixture://notes/read',
            'requirements': [{'requirement_id': 'worker_authority', 'kind': 'authority',
            'accepted_issuers': ['worker_authority'], 'max_age_seconds': 30, 'independent_from_producer': True}],
            'unknown_behavior': 'QUARANTINE', 'max_authorization_ttl_seconds': 30}]}}

    def attempt(self, candidate, actor=WORKER):
        with self.lock:
            self._require_approval()
            if any(a['status'] == 'UNRESOLVED' for a in self.state['attempts']):
                raise BountyError('EFFECT_UNRESOLVED_NO_RETRY')
            frozen_fixture()
            receipt = self._wallet_decision(actor)
            auth = self._record('authorization', {'wallet_receipt': receipt, 'gate_public_key': self.gate.public_key},
                                decision='COMMIT' if receipt['decision'] == 'ALLOWED' else 'STOPPED',
                                parents=[self.state['approval']])
            if receipt['decision'] != 'ALLOWED':
                self._event('receiver', 'REFUSED', ', '.join(receipt['reason_codes']))
                return self.snapshot()
            if (not isinstance(candidate, dict) or set(candidate) != {'requester', 'target', 'claim'}
                    or candidate.get('requester') != 'alice' or candidate.get('target') not in ('alice', 'bob')
                    or candidate.get('claim') not in ('cross-user-note', 'no-finding')):
                self._record('receiver-policy', {'reason': 'UNSUPPORTED_FINDING'}, observed=False, decision='DENY', parents=[auth])
                raise BountyError('UNSUPPORTED_FINDING')
            ordinal = len(self.state['attempts']) + 1
            if ordinal > TERMS['max_attempts']:
                self._record('receiver-policy', {'reason': 'ATTEMPT_LIMIT_REACHED'}, observed=False, decision='DENY', parents=[auth])
                raise BountyError('ATTEMPT_LIMIT_REACHED')
            candidate = json.loads(json_text(candidate))
            a = {'number': ordinal, 'candidate': candidate, 'status': 'UNRESOLVED', 'effect': None,
                 'authorization': auth, 'attempt_receipt': None, 'verification': None, 'verification_receipt': None}
            self.state['attempts'].append(a)
            self._save()

            def authority(call):
                active = self.wallet.timeline().active_by_subject.get(WORKER)
                self._require_approval()
                return {'wallet_receipt_hash': receipt['payload_hash']} if (actor == WORKER
                    and active == self.state['mandate']['data']['mandate_id'] and ordinal <= TERMS['max_attempts']) else None

            @authorize(policy=self._policy(), target='fixture://notes/read', tool='read_fixture',
                       semantics=payment_semantics(), state_source=lambda call: {'ordinal': ordinal},
                       evidence_sources={'worker_authority': authority}, producer_model='deterministic-local-worker',
                       runtime_dir=self.home / 'receipt-gate', return_receipt=True)
            def read_fixture(candidate, amount_cents=0):
                frozen_fixture()
                spec = importlib.util.spec_from_file_location('bounty_local_fixture', FIXTURE / 'app.py')
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return module.read_note(candidate['requester'], candidate['target'])

            try:
                executed = read_fixture(candidate=candidate)
            except AuthorizationBlocked as exc:
                a['status'] = 'REFUSED'
                self._record('receiver-policy', {'reason_codes': list(exc.reason_codes), 'compilation': exc.compilation},
                             observed=False, decision='DENY', parents=[auth])
                return self.snapshot()
            a.update(status='OBSERVED', effect=executed.value)
            a['attempt_receipt'] = self._record('attempt', {'number': ordinal, 'candidate': candidate,
                'result': executed.value, 'receipt_gate_decision': dict(executed.decision_receipt),
                'receipt_gate_execution': dict(executed.execution)}, observed=True, decision='OBSERVED', parents=[auth])
            self._event(WORKER, 'ATTEMPT_OBSERVED', f'Attempt {ordinal}: local note response observed. No vulnerability verdict yet.')
            return self.snapshot()

    def verify(self, number):
        with self.lock:
            self._require_approval()
            a = self._attempt(number)
            if a['verification']:
                return self.snapshot()
            if a['status'] != 'OBSERVED':
                raise BountyError('NO_OBSERVED_ATTEMPT')
            frozen_fixture()
            path = self.home / f'candidate-{number}.json'
            atomic_write_json(path, a['candidate'])
            checks = run_checks(FIXTURE, [[sys.executable, str(FIXTURE / 'verify.py'), str(path)]], timeout=10, kind='target')
            frozen_fixture()
            command = checks['commands'][0]
            try:
                detail = json.loads(command['stdout_tail'])
            except (ValueError, KeyError):
                raise BountyError('VERIFIER_OUTPUT_UNRESOLVED')
            if command['timed_out'] or command['exit_code'] not in (0, 1) or type(detail.get('accepted')) is not bool:
                raise BountyError('VERIFIER_OUTPUT_UNRESOLVED')
            reproduced = checks['status'] == 'PASS' and detail['accepted'] and detail.get('reproduction') == a['effect']
            duplicate = bool(self.state['reward_verification'])
            accepted = reproduced and not duplicate
            airlock = airlock_sign({'schema': 'bounty.airlock-check.v1', 'fixture_pins': FIXTURE_PINS,
                'candidate_sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'checks': checks}, ensure_key(self.home / 'airlock.key'))
            verification = {'accepted': accepted, 'reproducible': reproduced,
                            'reason': 'DUPLICATE_FINDING' if reproduced and duplicate else detail['reason'],
                            'checks': detail, 'airlock_receipt_json': json_text(airlock),
                            'independence': 'Buyer-controlled local frozen check; same operator, not an outside receiver.'}
            a['verification'] = verification
            a['status'] = 'VERIFIED'
            a['verification_receipt'] = self._record('verification', verification,
                                                    decision='COMMIT' if accepted else 'DENY', parents=[a['attempt_receipt']])
            if accepted:
                self.state['reward_verification'] = a['verification_receipt']
            self._event('buyer-verifier', 'FINDING_ACCEPTED' if accepted else 'FINDING_REFUSED', verification['reason'])
            return self.snapshot()

    def _attempt(self, number):
        if type(number) is not int or not 1 <= number <= len(self.state['attempts']):
            raise BountyError('ATTEMPT_UNKNOWN')
        return self.state['attempts'][number - 1]

    def _evidence(self, kind, number):
        self._require_approval()
        if kind == 'attempt':
            a = self._attempt(number)
            if a['status'] != 'VERIFIED' or not a['attempt_receipt'] or not a['verification_receipt']:
                raise BountyError('ATTEMPT_EVIDENCE_INCOMPLETE')
            key, ids = f'attempt-{number}', [a['authorization'], a['attempt_receipt'], a['verification_receipt']]
        elif kind == 'reward' and self.state['reward_verification']:
            key, ids = 'reward', [self.state['reward_verification']]
        else:
            raise BountyError('SUCCESS_REWARD_NOT_EARNED')
        records = [r for r in self.state['records'] if r['receipt_id'] in ids]
        if len(records) != len(ids):
            raise BountyError('EVIDENCE_MISSING')
        if any(not verify_record(r, expected_public_key=public_key_hex(self.receiver_key))[0] for r in records):
            raise BountyError('EVIDENCE_SIGNATURE_INVALID')
        return key, {'bounty_id': self.state['id'], 'purpose': key, 'evidence': records}

    def prepare_payment(self, kind, number=None):
        with self.lock:
            key, evidence = self._evidence(kind, number)
            p = next((p for p in self.state['payments'] if p['key'] == key), None)
            if p and p['status'] != 'PREPARING':
                return self.snapshot()
            listing = next(l for l in self.x.registry.all() if l['offer_id'] == 'offer-bounty-' + kind)
            inp = self.home / (key + '-input.txt')
            if not p:
                text = json_text({'nonce': self.state['id'] + '-' + key}) + '\n' + json_text(evidence)
                inp.write_text(text)
                p = {'key': key, 'kind': kind, 'job_id': None, 'status': 'PREPARING', 'acceptance_receipt': None,
                     'settlement_receipt': None}
                self.state['payments'].append(p)
                self._save()
            job_id = self.x.commission(listing, input_path=str(inp))
            p['job_id'] = job_id
            self._save()
            job = self.x.read_json('jobs.json')[job_id]
            if job['status'] == 'COMMISSIONED':
                # Existing work is idempotent; submit only when no submission exists.
                self.x.deliver(job_id, 'seller')
            verdict = self.x.receiver.check(job_id)
            job = self.x.read_json('jobs.json')[job_id]
            p['status'] = 'ELIGIBLE' if verdict['verdict'] == 'accepted' else 'REFUSED'
            p['acceptance_receipt'] = self._record('acceptance', {'purpose': key, 'job_id': job_id,
                'service': 'text_digest evidence packaging; finding verification is a separate record',
                'agreement': {'record': job['agreement'], 'signature': job['agreement_signature']},
                'submission': job['submission'], 'verdict': job['verdict']},
                decision='COMMIT' if p['status'] == 'ELIGIBLE' else 'DENY',
                parents=[r['receipt_id'] for r in evidence['evidence']], record_id=job_id + ':acceptance')
            self._event('buyer', 'COMPENSATION_ELIGIBLE' if p['status'] == 'ELIGIBLE' else 'PACKAGE_REFUSED',
                        key + ': original kernel checked the frozen evidence digest; no payment yet.')
            return self.snapshot()

    def _payment(self, key):
        p = next((p for p in self.state['payments'] if p['key'] == key), None)
        if p is None:
            raise BountyError('PAYMENT_UNKNOWN')
        return p

    def _committed(self, p):
        job = self.x.read_json('jobs.json', {}).get(p['job_id'])
        if not job:
            return False
        agreement = self.x.commission_mod._authenticated_agreement(self.x.chome, job)
        transfers = [t for t in self.x.read_json('ledger.json')['transfers']
                     if t['settlement_id'] == 'settle:' + job['agreement_hash']]
        if len(transfers) > 1:
            raise BountyError('KERNEL_TRANSFER_INCONSISTENT')
        if not transfers:
            return False
        t = transfers[0]
        if t['amount'] != agreement['amount'] or t['to'] != agreement['payee'] or t['job_id'] != p['job_id']:
            raise BountyError('KERNEL_TRANSFER_INCONSISTENT')
        return True

    def settle(self, key, *, complete_committed=False):
        with self.lock:
            self._require_approval()
            p = self._payment(key)
            if p['status'] == 'SETTLED':
                return self.snapshot()
            if p['status'] == 'UNRESOLVED':
                if not complete_committed or not self._committed(p):
                    raise BountyError('PAYMENT_UNRESOLVED_NO_BLIND_RETRY')
            elif p['status'] != 'ELIGIBLE':
                raise BountyError('PAYMENT_NOT_ELIGIBLE')
            p['status'] = 'UNRESOLVED'
            self._save()
            code, output, err = self.x.cli('settle', '--caller', 'owner', '--job', p['job_id'])
            if code and 'ALREADY_SETTLED' not in err:
                self._event('kernel', 'PAYMENT_UNRESOLVED', 'Read-only reconciliation required; no blind retry.')
                return self.snapshot()
            if not self._committed(p):
                raise BountyError('PAYMENT_CONFIRMATION_MISSING')
            job = self.x.read_json('jobs.json')[p['job_id']]
            if not p['settlement_receipt']:
                p['settlement_receipt'] = self._record('settlement', {'purpose': key, 'job_id': p['job_id'],
                    'settlement': job['settlement'], 'simulated': True}, observed=True, decision='COMMIT',
                    parents=[p['acceptance_receipt']], record_id=p['job_id'] + ':settlement')
            p['status'] = 'SETTLED'
            self._event('kernel', 'SETTLED_ONCE', key + ': signed SIM_USD transfer; no real funds.')
            return self.snapshot()

    def reconcile(self):
        with self.lock:
            code, output, err = self.x.cli('reconcile')
            if code:
                raise BountyError('KERNEL_RECONCILE_FAILED:' + err)
            result = self.snapshot()
            result['reconciliation'] = output.strip()
            return result  # read-only: no work, settlement, or state writes

    def snapshot(self):
        # Every external snapshot is a copy. No private keys or session tokens.
        data = json.loads(json_text(self.state))
        data['terms'] = TERMS
        data['ledger'] = self.x.read_json('ledger.json')
        data['components'] = PINS
        data['receiver_public_key'] = public_key_hex(self.receiver_key)
        data['owner_public_key'] = self.x.commission_mod._pub(self.x.chome, 'owner')
        data['bureau'] = {'records': self.store.ledger(limit=500),
            'limits': 'Local receipt evidence only. No outside receiver, adoption claim, worker ranking, or proof from signature alone. Bureau preserves signatures; this adapter verifies them before ingestion.'}
        for p in data['payments']:
            if p['status'] == 'UNRESOLVED':
                p['observation'] = 'COMMITTED_LOCAL_RECORDS_INCOMPLETE' if self._committed(p) else 'UNKNOWN_NO_CONFIRMATION'
        return data
