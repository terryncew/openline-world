# Transports — shared OpenLine world

Scope: how participant devices reach the world, what each transport requires,
and what "offline" is allowed to mean. This file is a specification. It does
not implement anything.

Status labels used below:

- DEMONSTRATED — run against the real code and observed working.
- PLANNED — interface defined here; no implementation, no test.
- UNTESTED — written down but never exercised against real hardware or a real
  network. Treat any claim about it as a design note, not evidence.

The nearby/offline adapter is UNTESTED. It appears in this document only as
a contract for future work.

## The adapter interface contract

Every transport is an adapter between a participant's world client and the
world backend. The backend implements this contract; nearby/offline is a
future adapter against the same interface.

A Transport must implement:

1. `status()` — one of three states, no others:
   - `disconnected` — no path to the world; the client must not present
     actions as sent.
   - `pending` — discovery, pairing, handshake, or reconnection in progress.
     The client may queue; it must not claim delivery.
   - `connected` — the world has acknowledged this participant's join profile
     and standing. Only in this state may the client submit proposals and
     expect receipts.
2. Versioned envelopes — every frame on the wire is a versioned envelope
   (`envelope_version`, `kind`, `payload`). A participant rejects envelopes
   whose version it does not understand rather than guessing at the bytes.
   Version negotiation happens at connect; there is no silent downgrade.
3. `close()` — deterministic teardown: flush pending outbound receipts,
   notify the client of final status, release the radio/socket, and leave the
   adapter in `disconnected`. No half-open state is legal after `close()`.

What the contract does NOT promise: authentication (the local preview uses
Bearer tokens, which are explicitly not authentication — see
`backend/world.py` "Local-preview honesty"), key custody, or delivery
guarantees beyond what the underlying radio provides. Those are the
responsibility of the layers above and below, respectively.

## Demonstrated vs planned

- Local development transport — DEMONSTRATED. Browser -> HTTP to the workshop
  server bound to 127.0.0.1 (default port 8471). One process holds both
  participants' session keys (same-operator custody — documented in
  `backend/world.py`, not hidden).
- Internet transport — PLANNED. Adapter against the same contract; interface
  defined, no implementation.
- Nearby/offline transport — PLANNED and UNTESTED. No implementation exists.
  localhost runs, replayed captures, and synthetic event streams are NOT a
  physical offline-network demonstration and must never be described as one.

## Native/platform requirements per transport

### Web Bluetooth / BLE GATT

Needs: a real Bluetooth adapter on the host; user gesture per connection;
a secure context (HTTPS or localhost). Web Bluetooth is a GATT *client*
API — the browser can talk to peripherals, not advertise as one without
platform-specific extensions; throughput is low and connection setup is
slow. It cannot, by itself, provide mutual discovery between two browsers.

VM finding (2026-09-25): the development VM has NO Bluetooth hardware and
no Bluetooth userspace (`hciconfig`, `bluetoothctl`, `rfkill` all absent;
`/sys/class/bluetooth` absent; no BT PCI/USB devices). Web Bluetooth cannot
function on this VM even in headful Chromium. Testing it requires a physical
host with an adapter.

### Wi-Fi Direct (P2P)

Needs: a Wi-Fi interface whose driver/firmware supports P2P mode (check
`iw list` for P2P interface support); OS permission to manage wireless;
both devices in range. One device becomes the group owner (soft AP) and the
other joins. On Linux this is `wpa_supplicant` P2P; on Android it is the
WifiP2pManager API; iOS does not expose Wi-Fi Direct to apps.

VM finding (2026-09-25): the VM has NO wireless interfaces — only `lo` and
a virtual ethernet (`host0`); `iw` is not installed. Wi-Fi Direct is
impossible on this VM. There is nothing to check P2P capability against.

### Apple MultipeerConnectivity

Needs: iOS, macOS, tvOS, or visionOS; a native app (Swift/ObjC) — the
framework is NOT available to browsers, web views, or server-side code.
Uses infrastructure Wi-Fi, peer-to-peer Wi-Fi (AWDL), and Bluetooth
opportunistically; encryption and peer identity are handled by the
framework, but the app must still do its own authentication of *who* the
peer is. Requires the local-network and Bluetooth permissions and a
packaged, signed app — it cannot be exercised from a web page.

Relevance: the one paired device in this environment is an iPhone (iOS),
so MultipeerConnectivity is the only nearby radio that paired hardware
could ever use — and only through a native iOS app, which does not exist
in this project.

### Google Nearby Connections

Needs: Android (Google Play services) or ChromeOS; the Nearby Connections
API in a native app. Supports BLE, Bluetooth Classic, and Wi-Fi (hotspot /
LAN) under one API with strategy selection (e.g. P2P_CLUSTER). Requires
location and nearby-devices permissions and a packaged app.

Relevance: none of the paired hardware runs Android or ChromeOS. Not
applicable to the current device set.

### WebRTC data channels

Not a nearby transport by itself. Data channels need signaling to exchange
SDP — and signaling is not nearby: it is a rendezvous problem that an
offline scenario has to solve some other way (manual exchange, QR codes,
pre-provisioned introductions). WebRTC is therefore a candidate *data
plane* for a nearby adapter, never the whole adapter. Any design that says
"we'll use WebRTC" must separately answer how two offline devices find
each other and exchange offers without a server.

## OFFLINE RULES

Offline mode must never silently call cloud models or services. No network
call may leave the device for inference, embedding, TTS, transcription, or
any other hosted service while in offline mode. A transport that cannot
verify this must refuse to enter offline mode rather than degrade into
quiet cloud dependence.

What must already be on each device BEFORE going offline:

- The OpenLine wallet and receiver code, installed and version-pinned.
- The world client, same version as the backend it will talk to.
- Pre-provisioned keys: each participant's agent keypair and the public
  keys of the counterparties they may transact with. No key may be fetched
  over the offline link and trusted on first sight.
- Standing data (join profiles, standing records, policy versions) WITH
  explicit expiry and freshness timestamps.

Stale standing rule: if standing data is past its expiry, or its freshness
cannot be verified, the receiver must HOLD consequential actions — refuse
to decide — rather than assume the old standing still holds. Stale data is
never silently treated as current. The failure mode is a visible HOLD, not
a quiet ALLOW.

Runtime model-call note: this demo performs no model calls at runtime —
agents are local/scripted. TTS and voiceover are production-time media
assets, baked in before distribution; they are never a runtime dependency
and must never become one in offline mode. Nothing in the offline path may
require a network round trip to a model provider.

## Honest limitations

- There is no nearby/offline adapter. Designing the contract is not
  demonstrating it.
- The VM cannot test Bluetooth, Wi-Fi Direct, or any radio-based transport:
  it has no Bluetooth hardware, no wireless interfaces, and no relevant
  userspace tools installed.
- The only paired device is an iPhone, whose nearby radio
  (MultipeerConnectivity) requires a native app that does not exist here.
- Until a real adapter runs on real hardware, every offline claim in this
  document is a design intention, and any demo of "offline" behavior on
  localhost is a simulation of the logic, not a demonstration of the
  network.
