"""Hash current production; separate dramatization, real capture and frozen proof."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
timeline = json.loads((ROOT / 'TIMELINE.json').read_text())
current_captures = {shot['capture'] for shot in timeline['shots'] if 'capture' in shot}
current_voice = {shot['voice']['file'] for shot in timeline['shots'] if 'voice' in shot}
frozen_names = {
    'run.json', 'receipt-stopped.json', 'receipt-allowed.json',
    'owner-authority-events.json', 'reloaded-wallet-receipts.json',
}


def entry(path, role):
    return {
        'path': str(path.relative_to(REPO)),
        'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'role': role,
    }


def production_role(path, directory):
    local = str(path.relative_to(ROOT))
    if directory == 'evidence':
        if path.name in frozen_names:
            return 'RECOVERED REAL EVIDENCE — frozen signed test records'
        if path.name in {'UI-CAPTURE.json', 'ui-receipts.json'}:
            return 'REAL UI CAPTURE PROVENANCE — exact preserved public projection'
        return 'PRODUCTION / EVIDENCE AUDIT RECORD'
    if directory == 'source':
        if path.name.startswith(('physical-', 'PHYSICAL-')):
            return 'DRAMATIZATION — original World meshes, production-only fixed-frame poses'
        if local in current_captures:
            return 'REAL UI CAPTURE — current film proof; original recorded STOPPED panel'
        if path.suffix == '.png':
            return 'REAL UI CAPTURE — retained supporting record; excluded from current picture'
        return 'PRODUCTION / SOURCE ARTIFACT'
    if directory == 'audio':
        if path.name.startswith('voice-') and local not in current_voice:
            return 'RETAINED SYNTHETIC AUDIO — superseded dialogue; excluded from current mix'
        return 'SYNTHETIC PRODUCTION AUDIO — local neural voice or original latch; no human recording'
    if directory == 'tools':
        if path.name in {'physical.tsx', 'physical.html', 'capture-physical.mjs'}:
            return 'PRODUCTION-ONLY DRAMATIZATION SOURCE — no protocol events or API mutations'
        return 'EDITABLE PRODUCTION SOURCE'
    return 'DERIVED COMPOSITE — dramatization, one real UI proof and brand end card'


paths = []
for directory in ['evidence', 'source', 'audio', 'tools', 'renders', 'animatic']:
    for path in sorted((ROOT / directory).rglob('*')):
        if path.is_file() and '__pycache__' not in str(path):
            paths.append(entry(path, production_role(path, directory)))
for name in [
    'FACTS.json', 'TIMELINE.json', 'CLAIM-SHOT-MAP.json', 'CAPTIONS.json',
    'captions.srt', 'captions.vtt', 'poster.png', 'README.md', 'AUDIT.md',
    'SCREENPLAY.md', 'DELIVERY.md', 'WATCH.html', 'ANIMATIC-REVIEW.md',
    'TECHNICAL-QA.json', 'PLAYBACK-QA.json',
]:
    path = ROOT / name
    if path.exists():
        paths.append(entry(path, 'PRODUCTION / PROOF MANIFEST'))

refs = []
for path in sorted((REPO / 'frontend/public/prompt-injection').rglob('*')):
    if path.is_file():
        refs.append(entry(path, 'EXISTING REFERENCE ONLY — not footage of this recovered run'))
for name in [
    'frontend/src/viz/scene/CanonicalRobot.tsx',
    'frontend/src/viz/scene/ReceiverGate.tsx',
    'frontend/src/viz/scene/ProposalPackets.tsx',
    'frontend/src/viz/scene/layout.ts',
]:
    refs.append(entry(REPO / name, 'DIRECT CANON REUSE — unchanged World geometry, materials or layout'))
for name in [
    'backend/server.py', 'backend/workshop_gate.py',
    'backend/tests/test_prompt_injection_demo.py',
    'frontend/src/components/Panels.tsx', 'frontend/src/styles.css',
    'production/flagship-001/AUDIT.md', 'production/flagship-001/BRAND-CANON.md',
    'production/flagship-001/ASSET-INVENTORY.json',
    'production/flagship-001/tools/stage.tsx',
    'production/flagship-001/tools/capture.mjs',
    'production/flagship-001/tools/render.py',
    'production/flagship-001/tools/narrate.py',
    'production/flagship-001/tools/playback.mjs',
    'production/flagship-001/tools/verify.py',
]:
    refs.append(entry(REPO / name, 'UNCHANGED PRODUCT / PREVIOUS PRODUCTION REFERENCE'))

manifest = {
    'base_sha': timeline['base_sha'],
    'checkpoint': '13e9c60abc45036c81aaa604855250b0e5384273',
    'replaces_delivery': timeline['replaces_delivery'],
    'previous_reviewed_head': 'f671cb04d265414cbb48d1a78e4886e43a4fa72e',
    'current_delivery': {'seconds': timeline['seconds'], 'frames': timeline['frames'], 'fps': timeline['fps']},
    'timeline_schema': timeline['schema'],
    'timeline_sha256': hashlib.sha256((ROOT / 'TIMELINE.json').read_bytes()).hexdigest(),
    'presentation': timeline['presentation'],
    'physical_source_provenance': [
        {
            'quality': quality,
            'source_file': capture['file'],
            'source_sha256': capture['sha256'],
            'original_capture_timeline_sha256': capture['timeline_sha256'],
            'physical_schedule_sha256': capture['physical_schedule_sha256'],
            'reused_from_reviewed_head': True,
        }
        for quality in ['animatic', 'final']
        for capture in [json.loads((ROOT / f'source/PHYSICAL-{quality}.json').read_text())]
    ],
    'production': paths,
    'inspected_existing_sources': refs,
    'classification_policy': 'Physical scene is DRAMATIZATION. Only the preserved STOPPED UI panel is REAL CAPTURE in the current picture. ALLOWED comparison is underlying evidence only.',
    'private_keys_exported': False,
    'paid_assets': False,
    'external_api_spend': 0,
    'voice_disclosure': 'Local neural voice at natural speed 1.0; full takes included. No human recording; human listening unverified.',
}
(ROOT / 'SOURCE-INVENTORY.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Source/evidence inventory written:', len(paths), 'production items;', len(refs), 'existing references.')
