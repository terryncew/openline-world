/**
 * custody.ts — separate key custody for the town UI.
 *
 * A byte-identical browser (TypeScript) port of the participant side of the
 * custody protocol proven in `clients/participant.py` and the vendored
 * `openline_wallet` package: the world server holds exactly one Ed25519 key
 * (its own receiver gate key) and never sees a participant's private keys.
 *
 * What this module does
 * ----------------------
 * - Generates and keeps each participant's owner-root key, owner-epoch key,
 *   and worker key as NON-EXTRACTABLE WebCrypto Ed25519 keys in IndexedDB.
 *   Raw private bytes never enter JavaScript.
 * - Ports the wallet math exactly: canonical JSON (`olp-canonical-json-int-v1`),
 *   `sign_record`, `principal_id`, epoch certificates, mandate issue/revoke
 *   events, `export_bundle`, and worker-signed holder presentations. The
 *   server re-verifies every signature, so a working join is the ultimate
 *   compatibility test.
 * - `CustodyClient` mirrors `clients/participant.py`: ceremony, join,
 *   worker-signed presentations behind receiver challenges, offer / need /
 *   agreement / submit, owner-signed revocation + authority refresh.
 *
 * The owner/worker boundary, honestly stated
 * ------------------------------------------
 * `OwnerVault` and `WorkerVault` are separate classes touching separate
 * IndexedDB records. The worker code path (the town's acting side) can only
 * reach two owner-side operations: `exportBundle()` — a signed attestation of
 * authority the owner ALREADY committed to (bundles travel to the server in
 * the clear at join/refresh anyway) — and nothing else. Granting, narrowing,
 * and revoking mandates are methods on the owner vault wired ONLY to
 * explicit owner-gesture click handlers ("Join the square", "Revoke worker").
 *
 * The real enforcement is cryptographic and server-side: bundles verify only
 * against the owner root key, presentations only against the worker key, and
 * mandate changes only via root/epoch-signed wallet events. A confused or
 * compromised worker script cannot mint authority — it can only ever obtain
 * a bundle attesting to what the owner already granted.
 *
 * Same-origin JavaScript is one trust domain: module separation here is
 * code discipline, not process isolation. That limit is documented, not
 * hidden.
 *
 * Key persistence
 * ---------------
 * Keys persist as JWK in the profile's IndexedDB (this Firefox build's
 * structuredClone cannot clone Ed25519 CryptoKeys — observed in the
 * 2026-09-26 two-profile run — so keys are persisted as JWK, not as
 * non-extractable stored CryptoKeys). In-memory signing
 * keys are imported non-extractable. The profile boundary (OS user +
 * browser profile) is the isolation: another profile cannot reach this
 * profile's IndexedDB. Same-origin script in THIS profile is one trust
 * domain — the enforcement that matters is server-side and cryptographic.
 * The bearer token persists in sessionStorage (tab lifetime). If the wallet
 * state exists but the keys are gone, the identity is NOT recoverable and
 * is NOT silently replaced: the UI must show a keys-missing state and
 * require an explicit "start over as someone new" (fresh keys = fresh
 * principal).
 */

export class CustodyError extends Error {
  readonly code: string;
  constructor(code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "CustodyError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* canonical JSON: byte-identical to openline_wallet/canonical.py      */
/* json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=True) */
/* integer-only profile: floats fail closed.                           */
/* ------------------------------------------------------------------ */

const MAX_SAFE_INTEGER = 2 ** 53 - 1;

function assertCanonicalValue(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || Math.abs(value) > MAX_SAFE_INTEGER) {
      throw new CustodyError("CANONICAL_NUMBER_INVALID", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertCanonicalValue(item, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const k of Object.keys(value)) {
      // Python: key.isascii()
      if (!/^[\x00-\x7f]*$/.test(k)) throw new CustodyError("CANONICAL_KEY_INVALID", `${path}.${k}`);
      assertCanonicalValue((value as Record<string, unknown>)[k], `${path}.${k}`);
    }
    return;
  }
  throw new CustodyError("CANONICAL_VALUE_UNSUPPORTED", `${path}: ${typeof value}`);
}

/** ensure_ascii string quoting: control chars get short escapes or \u00XX,
 *  everything outside printable ASCII becomes \uXXXX (lowercase hex, exactly
 *  like CPython's json with ensure_ascii=True; astral characters become
 *  surrogate pairs because JS strings are UTF-16 code units). */
function quoteString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const cu = s.charCodeAt(i);
    switch (cu) {
      case 0x22: out += '\\"'; break;
      case 0x5c: out += "\\\\"; break;
      case 0x08: out += "\\b"; break;
      case 0x09: out += "\\t"; break;
      case 0x0a: out += "\\n"; break;
      case 0x0c: out += "\\f"; break;
      case 0x0d: out += "\\r"; break;
      default:
        if (cu < 0x20 || cu > 0x7e) out += "\\u" + cu.toString(16).padStart(4, "0");
        else out += s[i];
    }
  }
  return out + '"';
}

/** sort_keys=True: CPython sorts dict keys by Unicode code point. */
function cmpKeys(a: string, b: string): number {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const n = Math.min(ac.length, bc.length);
  for (let i = 0; i < n; i++) {
    const d = (ac[i].codePointAt(0) ?? 0) - (bc[i].codePointAt(0) ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return ac.length - bc.length;
}

function stringifyCanonical(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return String(value); // validated integer
  if (typeof value === "string") return quoteString(value);
  if (Array.isArray(value)) return "[" + value.map(stringifyCanonical).join(",") + "]";
  const entries = Object.keys(value as Record<string, unknown>).sort(cmpKeys);
  return (
    "{" +
    entries.map((k) => quoteString(k) + ":" + stringifyCanonical((value as Record<string, unknown>)[k])).join(",") +
    "}"
  );
}

export function canonicalJson(value: unknown): string {
  assertCanonicalValue(value, "$");
  return stringifyCanonical(value);
}

/* ------------------------------------------------------------------ */
/* bytes, hashing, Ed25519                                             */
/* ------------------------------------------------------------------ */

function subtleCrypto(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new CustodyError(
      "SECURE_CONTEXT_REQUIRED",
      "WebCrypto is unavailable (this page is not a secure context). Key custody needs https or localhost — no server-side fallback exists."
    );
  }
  return s;
}

export function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexDecode(hexStr: string): Uint8Array {
  const s = hexStr.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(s) || s.length % 2 !== 0) throw new CustodyError("HEX_INVALID");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = globalThis.atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await subtleCrypto().digest("SHA-256", data as BufferSource);
  return hexEncode(new Uint8Array(digest));
}

/** sha256 over the canonical bytes, like crypto.record_hash. */
export async function recordHash(record: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(record)));
}

function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return hexEncode(buf);
}

export interface EdKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

async function generateEd25519(): Promise<EdKeyPair> {
  const s = subtleCrypto();
  let pair: CryptoKeyPair;
  try {
    // extractable: true — the JWK must persist in IndexedDB (this
    // Firefox's structuredClone cannot clone Ed25519 CryptoKeys).
    // On load the JWK is re-imported non-extractable for in-memory use.
    pair = (await s.generateKey({ name: "Ed25519" } as AlgorithmIdentifier, true, ["sign", "verify"])) as CryptoKeyPair;
  } catch (e) {
    throw new CustodyError("ED25519_UNAVAILABLE", String(e));
  }
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

/** Export a key pair to plain-JSON JWKs for IndexedDB persistence. */
async function exportKeyJwks(pair: EdKeyPair): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }> {
  const s = subtleCrypto();
  const privateJwk = (await s.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const publicJwk = (await s.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { privateJwk, publicJwk };
}

/** Re-import a persisted JWK pair. The private key is non-extractable in
 *  memory; the public key is imported extractable (it is public — and
 *  signRecord raw-exports it for the signature block, which Firefox
 *  refuses on a non-extractable key). */
async function importKeyJwks(privateJwk: JsonWebKey, publicJwk: JsonWebKey): Promise<EdKeyPair> {
  const s = subtleCrypto();
  const privateKey = await s.importKey("jwk", privateJwk, { name: "Ed25519" } as AlgorithmIdentifier, false, ["sign"]);
  const publicKey = await s.importKey("jwk", publicJwk, { name: "Ed25519" } as AlgorithmIdentifier, true, ["verify"]);
  return { privateKey, publicKey };
}

/** Raw public-key hex straight from a JWK (no export needed). */
function publicKeyHexFromJwk(publicJwk: JsonWebKey): string {
  const x = publicJwk.x;
  if (typeof x !== "string" || !x) throw new CustodyError("JWK_MISSING_X");
  return hexEncode(base64UrlDecode(x));
}

export async function exportPublicKeyHex(key: CryptoKey): Promise<string> {
  const raw = await subtleCrypto().exportKey("raw", key);
  return hexEncode(new Uint8Array(raw));
}

async function signBytes(privateKey: CryptoKey, data: Uint8Array): Promise<string> {
  const sig = await subtleCrypto().sign({ name: "Ed25519" } as AlgorithmIdentifier, privateKey, data as BufferSource);
  return hexEncode(new Uint8Array(sig));
}

/** principal_id: "openline:principal:" + sha256(raw 32-byte pubkey). */
export async function principalId(publicKeyHex: string): Promise<string> {
  return "openline:principal:" + (await sha256Hex(hexDecode(publicKeyHex)));
}

export interface SignatureBlock {
  algorithm: "Ed25519";
  public_key: string;
  value: string;
}

export type SignedRecord = Record<string, unknown> & {
  payload_hash: string;
  signature: SignatureBlock;
};

/** sign_record: canonical bytes -> payload_hash -> Ed25519 over canonical bytes. */
export async function signRecord(body: Record<string, unknown>, key: EdKeyPair): Promise<SignedRecord> {
  if ("payload_hash" in body || "signature" in body) throw new CustodyError("SIGNED_BODY_RESERVED_FIELD");
  const canonical = new TextEncoder().encode(canonicalJson(body));
  const payload_hash = await sha256Hex(canonical);
  const value = await signBytes(key.privateKey, canonical);
  const public_key = await exportPublicKeyHex(key.publicKey);
  return { ...body, payload_hash, signature: { algorithm: "Ed25519", public_key, value } };
}

/* ------------------------------------------------------------------ */
/* timestamps: UTC ISO-8601 with Z suffix, like clock.isoformat        */
/* ------------------------------------------------------------------ */

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoPlus(seconds: number, from: number = Date.now()): string {
  return new Date(from + seconds * 1000).toISOString();
}

/* ------------------------------------------------------------------ */
/* IndexedDB key + wallet stores                                       */
/* ------------------------------------------------------------------ */

const DB_NAME = "openline-custody";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys", { keyPath: "id" });
      if (!db.objectStoreNames.contains("wallets")) db.createObjectStore("wallets", { keyPath: "participantId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new CustodyError("IDB_OPEN_FAILED"));
  });
}

interface KeyRecord {
  id: string; // "<participantId>:owner-root" | ":owner-epoch" | ":worker"
  participantId: string;
  role: "owner" | "worker";
  kind: "root" | "epoch" | "worker";
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  publicKeyHex: string;
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const rq = tx.objectStore(store).get(key);
        rq.onsuccess = () => resolve((rq.result as T | undefined) ?? undefined);
        rq.onerror = () => reject(rq.error ?? new CustodyError("IDB_READ_FAILED", store));
      })
  );
}

function idbPut(store: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const rq = tx.objectStore(store).put(value);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error ?? new CustodyError("IDB_WRITE_FAILED", store));
      })
  );
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const rq = tx.objectStore(store).delete(key);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error ?? new CustodyError("IDB_DELETE_FAILED", store));
      })
  );
}

function keyId(participantId: string, kind: "owner-root" | "owner-epoch" | "worker"): string {
  return `${participantId}:${kind}`;
}

/* ------------------------------------------------------------------ */
/* wallet state: minimal port of openline_wallet/wallet.py             */
/*                                                                     */
/* Only the participant-side operations are ported: create (epoch      */
/* certificate), grant (MANDATE_ISSUED, epoch-signed), revoke          */
/* (MANDATE_REVOKED, root-signed), export_bundle (root-signed). The    */
/* server performs the authoritative verification; locally we track    */
/* just enough (head + mandate index) to build correct events.         */
/* ------------------------------------------------------------------ */

export const STATE_SCHEMA = "openline.wallet.local_state.v1";
export const EPOCH_SCHEMA = "openline.wallet.epoch_certificate.v1";
export const EVENT_SCHEMA = "openline.wallet.timeline_event.v1";
export const BUNDLE_SCHEMA = "openline.wallet.receiver_bundle.v1";
export const PRESENTATION_SCHEMA = "openline.wallet.holder_presentation.v1";
export const JOIN_PROFILE_VERSION = "openline-join-profile/v1";

export const SUPPORTED_SCOPES = ["notes.read", "notes.write", "draft.write", "claimgraph.correct", "newsroom.review"] as const;
export type Scope = (typeof SUPPORTED_SCOPES)[number];

/** All supported scopes: the bound of this preview. Every one is an
 *  evaluation-only action through the participant's own gate. */
export const DEFAULT_GRANT_SCOPES: Scope[] = [...SUPPORTED_SCOPES];

export const TASK_KINDS: Record<string, string> = {
  "tidy-notes": "notes.write",
  summarize: "notes.read",
  draft: "draft.write",
};

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SCOPE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function checkId(value: string, label: string): string {
  if (!ID_RE.test(value)) throw new CustodyError(`${label}_INVALID`, value);
  return value;
}

function checkScopes(values: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) throw new CustodyError("SCOPES_REQUIRED");
  const normalized = [...new Set(values.map((v) => {
    if (!SCOPE_RE.test(v)) throw new CustodyError("SCOPE_INVALID", v);
    return v;
  }))].sort();
  if (normalized.length !== values.length) throw new CustodyError("SCOPE_DUPLICATE");
  if (normalized.length > 32) throw new CustodyError("TOO_MANY_SCOPES");
  return normalized;
}

export interface WalletStateJson {
  schema: typeof STATE_SCHEMA;
  version: 1;
  label: string;
  created_at: string;
  principal_id: string;
  root_public_key: string;
  epoch_certificate: SignedRecord;
  events: SignedRecord[];
  receipts: unknown[];
  wallet_policy_authority: "NONE";
  decision_authority: "RECEIVER_GATE";
}

interface MandateView {
  mandate_id: string;
  subject_id: string;
  subject_public_key: string;
  scopes: string[];
  expires_at: string;
  status: "ACTIVE" | "REVOKED" | "SUPERSEDED";
}

/** Light local replay of our own events: head + mandate index. The server
 *  re-verifies everything; this only keeps locally-built events correct. */
function replayLocal(events: SignedRecord[]): { headSequence: number; mandates: Map<string, MandateView>; activeBySubject: Map<string, string> } {
  const mandates = new Map<string, MandateView>();
  const activeBySubject = new Map<string, string>();
  for (const event of events) {
    const data = event.data as Record<string, unknown>;
    if (event.event_type === "MANDATE_ISSUED") {
      const m: MandateView = {
        mandate_id: String(data.mandate_id),
        subject_id: String(data.subject_id),
        subject_public_key: String(data.subject_public_key),
        scopes: data.scopes as string[],
        expires_at: String(data.expires_at),
        status: "ACTIVE",
      };
      mandates.set(m.mandate_id, m);
      activeBySubject.set(m.subject_id, m.mandate_id);
    } else if (event.event_type === "MANDATE_REVOKED") {
      const m = mandates.get(String(data.mandate_id));
      if (m && m.status === "ACTIVE") {
        m.status = "REVOKED";
        activeBySubject.delete(m.subject_id);
      }
    }
  }
  return { headSequence: events.length, mandates, activeBySubject };
}

async function computeHead(events: SignedRecord[]): Promise<{ sequence: number; event_hash: string | null }> {
  if (events.length === 0) return { sequence: 0, event_hash: null };
  return { sequence: events.length, event_hash: await recordHash(events[events.length - 1]) };
}

/* ------------------------------------------------------------------ */
/* OwnerVault — the owner's keys and authority.                        */
/*                                                                     */
/* Reachable ONLY from explicit owner-gesture handlers, except         */
/* exportBundle(): a signed attestation of already-committed state     */
/* (bundles travel to the server in the clear anyway). The worker path */
/* can never grant, narrow, or revoke.                                 */
/* ------------------------------------------------------------------ */

export class OwnerVault {
  private readonly participantId: string;
  constructor(participantId: string) {
    this.participantId = participantId;
  }

  private kid(kind: "owner-root" | "owner-epoch"): string {
    return keyId(this.participantId, kind);
  }

  async hasIdentity(): Promise<boolean> {
    const wallet = await idbGet<WalletStateJson>("wallets", this.participantId);
    if (!wallet) return false;
    const root = await idbGet<KeyRecord>("keys", this.kid("owner-root"));
    const epoch = await idbGet<KeyRecord>("keys", this.kid("owner-epoch"));
    return !!root && !!epoch;
  }

  /** Wallet state exists but the keys are gone: the identity is not
   *  recoverable and must not be silently replaced. */
  async keysMissing(): Promise<boolean> {
    const wallet = await idbGet<WalletStateJson>("wallets", this.participantId);
    if (!wallet) return false;
    return !(await this.hasIdentity());
  }

  private async loadKeys(): Promise<{ root: EdKeyPair; epoch: EdKeyPair }> {
    const root = await idbGet<KeyRecord>("keys", this.kid("owner-root"));
    const epoch = await idbGet<KeyRecord>("keys", this.kid("owner-epoch"));
    if (!root || !epoch) throw new CustodyError("OWNER_KEYS_MISSING", this.participantId);
    return {
      root: await importKeyJwks(root.privateJwk, root.publicJwk),
      epoch: await importKeyJwks(epoch.privateJwk, epoch.publicJwk),
    };
  }

  /** Persist a key pair as JWKs (plain JSON — always IDB-cloneable). */
  private async saveKey(kind: "owner-root" | "owner-epoch", pair: EdKeyPair): Promise<void> {
    const { privateJwk, publicJwk } = await exportKeyJwks(pair);
    await idbPut("keys", {
      id: this.kid(kind),
      participantId: this.participantId,
      role: "owner",
      kind: kind === "owner-root" ? "root" : "epoch",
      privateJwk, publicJwk,
      publicKeyHex: publicKeyHexFromJwk(publicJwk),
    });
  }

  private async loadWallet(): Promise<WalletStateJson> {
    const wallet = await idbGet<WalletStateJson>("wallets", this.participantId);
    if (!wallet) throw new CustodyError("WALLET_NOT_FOUND", this.participantId);
    return wallet;
  }

  private async saveWallet(state: WalletStateJson): Promise<void> {
    await idbPut("wallets", { participantId: this.participantId, ...state });
  }

  /** The join ceremony: generate owner keys, issue the epoch certificate,
   *  grant the worker's mandate. Called ONLY from an explicit owner tap. */
  async ceremony(opts: { label: string; agentId: string; workerPublicKeyHex: string; scopes?: Scope[]; mandateTtlSeconds?: number }): Promise<{ mandateId: string; principalId: string; rootPublicKey: string }> {
    subtleCrypto(); // fail fast outside a secure context
    if (await idbGet<WalletStateJson>("wallets", this.participantId)) {
      throw new CustodyError("IDENTITY_ALREADY_EXISTS", this.participantId);
    }
    const root = await generateEd25519();
    const epoch = await generateEd25519();
    const rootPub = await exportPublicKeyHex(root.publicKey);
    const epochPub = await exportPublicKeyHex(epoch.publicKey);
    const principal = await principalId(rootPub);
    const now = isoNow();
    const epochCertificate = await signRecord(
      {
        schema: EPOCH_SCHEMA,
        principal_id: principal,
        epoch_id: `epoch_${randHex(8)}`,
        sequence: 1,
        epoch_public_key: epochPub,
        issued_at: now,
        expires_at: isoPlus(366 * 86400),
        authority: "ISSUE_AND_NARROW_MANDATES",
      },
      root
    );
    const state: WalletStateJson = {
      schema: STATE_SCHEMA,
      version: 1,
      label: opts.label.slice(0, 128),
      created_at: now,
      principal_id: principal,
      root_public_key: rootPub,
      epoch_certificate: epochCertificate,
      events: [],
      receipts: [],
      wallet_policy_authority: "NONE",
      decision_authority: "RECEIVER_GATE",
    };
    await this.saveKey("owner-root", root);
    await this.saveKey("owner-epoch", epoch);
    await this.saveWallet(state);
    const { mandateId } = await this.grantMandate({
      subjectId: opts.agentId,
      subjectPublicKey: opts.workerPublicKeyHex,
      scopes: opts.scopes ?? DEFAULT_GRANT_SCOPES,
      expiresAt: isoPlus(opts.mandateTtlSeconds ?? 3600),
    });
    return { mandateId, principalId: principal, rootPublicKey: rootPub };
  }

  /** MANDATE_ISSUED, signed by the epoch key. Owner gesture only. */
  async grantMandate(args: { subjectId: string; subjectPublicKey: string; scopes: Scope[] | string[]; expiresAt: string; mandateId?: string }): Promise<{ mandateId: string }> {
    const { root: _root, epoch } = await this.loadKeys();
    void _root;
    const state = await this.loadWallet();
    const view = replayLocal(state.events);
    const subjectId = checkId(args.subjectId, "SUBJECT_ID");
    const scopes = checkScopes([...args.scopes]);
    const head = await computeHead(state.events);
    const mandateId = args.mandateId ?? `mandate_${randHex(8)}`;
    const event = await signRecord(
      {
        schema: EVENT_SCHEMA,
        principal_id: state.principal_id,
        sequence: head.sequence + 1,
        previous_event_hash: head.event_hash,
        event_type: "MANDATE_ISSUED",
        issued_at: isoNow(),
        data: {
          mandate_id: mandateId,
          subject_id: subjectId,
          subject_public_key: args.subjectPublicKey.trim().toLowerCase(),
          scopes,
          expires_at: args.expiresAt,
          predecessor_mandate_id: null,
        },
      },
      epoch
    );
    // local guard mirrors the server: one active mandate per subject
    const activeId = view.activeBySubject.get(subjectId);
    if (activeId) {
      const active = view.mandates.get(activeId);
      if (active && active.status === "ACTIVE" && active.expires_at > isoNow()) {
        throw new CustodyError("SUBJECT_ALREADY_HAS_ACTIVE_MANDATE", activeId);
      }
    }
    state.events.push(event);
    await this.saveWallet(state);
    return { mandateId };
  }

  /** MANDATE_REVOKED, signed by the root key. Owner gesture only.
   *  Permanent within the session: nothing here can un-revoke. */
  async revokeMandate(mandateId: string, reason = "USER_REVOKED"): Promise<void> {
    const { root } = await this.loadKeys();
    const state = await this.loadWallet();
    const view = replayLocal(state.events);
    const mandate = view.mandates.get(mandateId);
    if (!mandate || mandate.status !== "ACTIVE") throw new CustodyError("MANDATE_NOT_ACTIVE", mandateId);
    const head = await computeHead(state.events);
    const event = await signRecord(
      {
        schema: EVENT_SCHEMA,
        principal_id: state.principal_id,
        sequence: head.sequence + 1,
        previous_event_hash: head.event_hash,
        event_type: "MANDATE_REVOKED",
        issued_at: isoNow(),
        data: {
          mandate_id: mandateId,
          reason: checkId(reason.toUpperCase().replace(/ /g, "_"), "REVOCATION_REASON"),
        },
      },
      root
    );
    state.events.push(event);
    await this.saveWallet(state);
  }

  /** The one cross-boundary attestation: a root-signed bundle of the
   *  already-committed wallet state. Creates no authority. */
  async exportBundle(ttlSeconds = 600): Promise<SignedRecord> {
    const { root } = await this.loadKeys();
    const state = await this.loadWallet();
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 600) {
      throw new CustodyError("BUNDLE_TTL_INVALID", "maximum is 600s");
    }
    const head = await computeHead(state.events);
    return signRecord(
      {
        schema: BUNDLE_SCHEMA,
        principal: { principal_id: state.principal_id, root_public_key: state.root_public_key },
        epoch_certificate: state.epoch_certificate,
        events: state.events,
        receipts: state.receipts,
        head: { sequence: head.sequence, event_hash: head.event_hash },
        issued_at: isoNow(),
        expires_at: isoPlus(ttlSeconds),
        canonicalization: "olp-canonical-json-int-v1",
        wallet_policy_authority: "NONE",
        decision_authority: "RECEIVER_GATE",
      },
      root
    );
  }

  async publicInfo(): Promise<{ principalId: string; rootPublicKey: string; mandateId: string | null; headSequence: number }> {
    const state = await this.loadWallet();
    const view = replayLocal(state.events);
    const actives = [...view.mandates.values()].filter((m) => m.status === "ACTIVE");
    return {
      principalId: state.principal_id,
      rootPublicKey: state.root_public_key,
      mandateId: actives.length > 0 ? actives[actives.length - 1].mandate_id : null,
      headSequence: state.events.length,
    };
  }

  /** Explicit "start over as someone new": destroys this participant's
   *  owner keys and wallet. The old principal is gone, not replaced. */
  async destroyIdentity(): Promise<void> {
    await idbDelete("keys", this.kid("owner-root"));
    await idbDelete("keys", this.kid("owner-epoch"));
    await idbDelete("keys", keyId(this.participantId, "worker"));
    await idbDelete("wallets", this.participantId);
  }
}

/* ------------------------------------------------------------------ */
/* WorkerVault — the worker's key. The acting side of the client.       */
/* ------------------------------------------------------------------ */

export class WorkerVault {
  private readonly participantId: string;
  constructor(participantId: string) {
    this.participantId = participantId;
  }

  private get kid(): string {
    return keyId(this.participantId, "worker");
  }

  async hasWorker(): Promise<boolean> {
    return !!(await idbGet<KeyRecord>("keys", this.kid));
  }

  async ensureWorker(): Promise<EdKeyPair> {
    const existing = await idbGet<KeyRecord>("keys", this.kid);
    if (existing) return importKeyJwks(existing.privateJwk, existing.publicJwk);
    const pair = await generateEd25519();
    const { privateJwk, publicJwk } = await exportKeyJwks(pair);
    await idbPut("keys", {
      id: this.kid, participantId: this.participantId, role: "worker", kind: "worker",
      privateJwk, publicJwk, publicKeyHex: publicKeyHexFromJwk(publicJwk),
    });
    return pair;
  }

  private async loadWorker(): Promise<EdKeyPair> {
    const rec = await idbGet<KeyRecord>("keys", this.kid);
    if (!rec) throw new CustodyError("WORKER_KEY_MISSING", this.participantId);
    return importKeyJwks(rec.privateJwk, rec.publicJwk);
  }

  async publicKeyHex(): Promise<string> {
    const rec = await idbGet<KeyRecord>("keys", this.kid);
    if (!rec) throw new CustodyError("WORKER_KEY_MISSING", this.participantId);
    // stored at creation — no export needed
    if (rec.publicKeyHex) return rec.publicKeyHex;
    const w = await importKeyJwks(rec.privateJwk, rec.publicJwk);
    return exportPublicKeyHex(w.publicKey);
  }

  /** Proof-of-control for join: worker signs the receiver's nonce. */
  async signNonce(nonce: string): Promise<string> {
    const w = await this.loadWorker();
    return signBytes(w.privateKey, new TextEncoder().encode(nonce));
  }

  /** Sign a holder-presentation body with the worker key. The ONLY thing
   *  the worker ever signs. */
  async signPresentation(body: Record<string, unknown>): Promise<SignedRecord> {
    const w = await this.loadWorker();
    return signRecord(body, w);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP: same-origin /api/world, the proven custody interface.         */
/* No other backend is ever contacted; there is no server-side key     */
/* custody to fall back to.                                            */
/* ------------------------------------------------------------------ */

const API_PREFIX = "/api/world";

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new CustodyError("BACKEND_UNREACHABLE", String(e));
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new CustodyError("BACKEND_NON_JSON", `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error || `HTTP ${res.status}`;
    throw new CustodyError("BACKEND_REJECTED", err);
  }
  return data as T;
}

async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, { method: "GET" });
  } catch (e) {
    throw new CustodyError("BACKEND_UNREACHABLE", String(e));
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new CustodyError("BACKEND_NON_JSON", `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error || `HTTP ${res.status}`;
    throw new CustodyError("BACKEND_REJECTED", err);
  }
  return data as T;
}

export interface GateDecision {
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  transaction_id?: string;
  [k: string]: unknown;
}

export interface CustodyProfile {
  participantId: string;
  agentId: string;
  displayName: string;
  agentDisplayName: string;
  token: string;
  mandateId: string;
  principalId: string;
}

/* ------------------------------------------------------------------ */
/* CustodyClient — the participant's own client. Mirrors               */
/* clients/participant.py. Never touches the server except through     */
/* the public World API.                                               */
/* ------------------------------------------------------------------ */

export interface OpenOptions {
  participantId: string;
  displayName: string;
  agentDisplayName?: string;
  scopes?: Scope[];
  mandateTtlSeconds?: number;
}

export type ClientStatus =
  | { kind: "fresh" } // no identity yet: the owner may run the ceremony
  | { kind: "returning"; token: string | null } // keys + wallet present
  | { kind: "keys-missing" }; // wallet state without keys: not recoverable

const tokenKey = (participantId: string) => `openline-custody-token:${participantId}`;

export class CustodyClient {
  readonly owner: OwnerVault;
  readonly worker: WorkerVault;
  readonly participantId: string;
  readonly displayName: string;
  readonly agentId: string;
  readonly agentDisplayName: string;
  readonly scopes: Scope[];
  readonly mandateTtlSeconds: number;

  private token: string | null = null;
  private mandateId: string | null = null;

  private constructor(opts: OpenOptions) {
    this.participantId = opts.participantId;
    this.displayName = opts.displayName;
    this.agentId = `${opts.participantId}-agent`;
    this.agentDisplayName = opts.agentDisplayName ?? `${opts.displayName} agent`;
    this.scopes = opts.scopes ?? DEFAULT_GRANT_SCOPES;
    this.mandateTtlSeconds = opts.mandateTtlSeconds ?? 3600;
    this.owner = new OwnerVault(opts.participantId);
    this.worker = new WorkerVault(opts.participantId);
  }

  static async open(opts: OpenOptions): Promise<{ client: CustodyClient; status: ClientStatus }> {
    const client = new CustodyClient(opts);
    if (await client.owner.keysMissing()) {
      return { client, status: { kind: "keys-missing" } };
    }
    if (await client.owner.hasIdentity()) {
      const info = await client.owner.publicInfo();
      client.mandateId = info.mandateId;
      let token: string | null = null;
      try {
        token = sessionStorage.getItem(tokenKey(opts.participantId));
      } catch { /* storage unavailable: rejoin explicitly */ }
      if (token) client.token = token;
      return { client, status: { kind: "returning", token } };
    }
    return { client, status: { kind: "fresh" } };
  }

  get bearerToken(): string | null {
    return this.token;
  }

  get currentMandateId(): string | null {
    return this.mandateId;
  }

  private requireToken(): string {
    if (!this.token) throw new CustodyError("NOT_JOINED", "no session token — join first");
    return this.token;
  }

  /* -- owner gestures ------------------------------------------------ */

  /** The join ceremony, explicit owner tap: worker key -> owner ceremony
   *  (epoch certificate + mandate grant) -> proof-of-control -> join.
   *  Join proves key control; it grants no action permission. */
  async join(): Promise<CustodyProfile> {
    await this.worker.ensureWorker();
    const workerPub = await this.worker.publicKeyHex();
    let mandateId = this.mandateId;
    if (!(await this.owner.hasIdentity())) {
      const c = await this.owner.ceremony({
        label: this.displayName,
        agentId: this.agentId,
        workerPublicKeyHex: workerPub,
        scopes: this.scopes,
        mandateTtlSeconds: this.mandateTtlSeconds,
      });
      mandateId = c.mandateId;
      this.mandateId = c.mandateId;
    }
    const info = await this.owner.publicInfo();
    const bundle = await this.owner.exportBundle();
    const { nonce } = await apiGet<{ nonce: string }>("/challenge");
    const proof = { nonce, signature: await this.worker.signNonce(nonce) };
    const profile = {
      version: JOIN_PROFILE_VERSION,
      participant: { id: this.participantId, display_name: this.displayName },
      agent: { id: this.agentId, display_name: this.agentDisplayName, public_key: workerPub },
      proof,
      owner: { principal_id: info.principalId, root_public_key: info.rootPublicKey },
      mandate_bundle: bundle,
      mandate: { scopes: [...this.scopes] },
      capabilities: ["mandate.v1", "receipt.v1", "revocation.v1"],
    };
    const out = await apiPost<{ participant_id: string; agent_id: string; token: string; mandate_id: string }>("/join", { profile });
    this.token = out.token;
    this.mandateId = out.mandate_id ?? mandateId;
    try {
      sessionStorage.setItem(tokenKey(this.participantId), this.token);
    } catch { /* ignore */ }
    return {
      participantId: out.participant_id,
      agentId: out.agent_id,
      displayName: this.displayName,
      agentDisplayName: this.agentDisplayName,
      token: this.token,
      mandateId: this.mandateId ?? "",
      principalId: info.principalId,
    };
  }

  /** Owner revokes the worker's mandate: local wallet revocation (root-signed)
   *  then authority refresh at the receiver. Permanent within the session. */
  async revokeWorker(reason = "USER_REVOKED"): Promise<{ revoked: boolean; mandate_id: string }> {
    const token = this.requireToken();
    const mandateId = this.mandateId ?? (await this.owner.publicInfo()).mandateId;
    if (!mandateId) throw new CustodyError("NO_ACTIVE_MANDATE", this.participantId);
    await this.owner.revokeMandate(mandateId, reason);
    const bundle = await this.owner.exportBundle();
    const out = await apiPost<{ revoked: boolean; mandate_id: string }>("/authority/refresh", {
      participant_id: this.participantId,
      token,
      bundle,
    });
    return out;
  }

  /** Push the current owner-signed bundle to the receiver (e.g. after
   *  reload, to re-sync authority head). */
  async refreshAuthority(): Promise<{ revoked: boolean }> {
    const token = this.requireToken();
    const bundle = await this.owner.exportBundle();
    return apiPost("/authority/refresh", { participant_id: this.participantId, token, bundle });
  }

  /** Forget the local session token (e.g. after a world reset). The keys
   *  and wallet stay; rejoining re-uses the same identity. */
  forgetSession(): void {
    this.token = null;
    try {
      sessionStorage.removeItem(tokenKey(this.participantId));
    } catch { /* ignore */ }
  }

  /* -- worker path ---------------------------------------------------- */
  /* Every gated act: fresh receiver challenge -> worker-signed         */
  /* presentation binding action + challenge + current bundle head.      */

  /** One worker-signed presentation against a fresh receiver challenge.
   *  Exposed for the desks (claim graph, newsroom) that carry their own
   *  action names. */
  async gatePresentation(action: string): Promise<SignedRecord> {
    const token = this.requireToken();
    const { challenge } = await apiPost<{ challenge: string }>("/gate/challenge", {
      participant_id: this.participantId,
      token,
      action,
    });
    const bundle = await this.owner.exportBundle();
    const head = bundle.head as { event_hash: string | null };
    const principal = bundle.principal as { principal_id: string };
    return this.worker.signPresentation({
      schema: PRESENTATION_SCHEMA,
      principal_id: principal.principal_id,
      mandate_id: this.mandateId ?? "",
      subject_id: this.agentId,
      subject_public_key: await this.worker.publicKeyHex(),
      action,
      receiver_challenge: challenge,
      bundle_head_hash: head.event_hash,
      issued_at: isoNow(),
    });
  }

  private idem(): string {
    return `idem_${randHex(8)}`;
  }

  /** Generic gate check: the receiver decides, the UI only displays. */
  async proposeAction(action: string): Promise<GateDecision> {
    const token = this.requireToken();
    const presentation = await this.gatePresentation(action);
    return apiPost<GateDecision>("/propose", {
      participant_id: this.participantId,
      token,
      action,
      presentation,
      idempotency_key: this.idem(),
    });
  }

  private actionForTaskKind(kind: string): string {
    const action = TASK_KINDS[kind];
    if (!action) throw new CustodyError("TASK_KIND_UNKNOWN", kind);
    return action;
  }

  async postOffer(task: { kind: string; title: string; detail: string; terms?: { requires: string[] } }): Promise<{ offer_id: string }> {
    const token = this.requireToken();
    const authorization = await this.gatePresentation(this.actionForTaskKind(task.kind));
    return apiPost("/offer", {
      participant_id: this.participantId,
      token,
      task,
      authorization,
      idempotency_key: this.idem(),
    });
  }

  /** A need is a request, not an action: no gate, no presentation. */
  async postNeed(task: { kind: string; title: string; detail: string; terms_text?: string }): Promise<{ listing_id: string }> {
    const token = this.requireToken();
    const d = await apiPost<{ listing_id?: string; need_id?: string }>("/needs", {
      participant_id: this.participantId,
      token,
      task,
      idempotency_key: this.idem(),
    });
    return { listing_id: d.listing_id ?? d.need_id ?? "unavailable" };
  }

  async proposeAgreement(listingId: string, taskKind: string): Promise<{ agreement_id: string; status: string }> {
    const token = this.requireToken();
    const authorization = await this.gatePresentation(this.actionForTaskKind(taskKind));
    return apiPost("/agreements", {
      participant_id: this.participantId,
      token,
      listing_id: listingId,
      authorization,
      idempotency_key: this.idem(),
    });
  }

  async agreeAgreement(agreementId: string, taskKind: string): Promise<{ status: string }> {
    const token = this.requireToken();
    const authorization = await this.gatePresentation(this.actionForTaskKind(taskKind));
    return apiPost(`/agreements/${encodeURIComponent(agreementId)}/agree`, {
      participant_id: this.participantId,
      token,
      authorization,
      idempotency_key: this.idem(),
    });
  }

  async declineAgreement(agreementId: string): Promise<{ status: string }> {
    const token = this.requireToken();
    return apiPost(`/agreements/${encodeURIComponent(agreementId)}/decline`, {
      participant_id: this.participantId,
      token,
      idempotency_key: this.idem(),
    });
  }

  /** Submit: the receiver re-checks the authority head itself; the stored
   *  banked authorizations are re-validated server-side. */
  async submitAgreement(agreementId: string): Promise<{ status: string }> {
    const token = this.requireToken();
    return apiPost(`/agreements/${encodeURIComponent(agreementId)}/submit`, {
      participant_id: this.participantId,
      token,
      idempotency_key: this.idem(),
    });
  }

  async acceptOffer(offerId: string, taskKind: string): Promise<GateDecision> {
    const token = this.requireToken();
    const authorization = await this.gatePresentation(this.actionForTaskKind(taskKind));
    return apiPost<GateDecision>("/offer/accept", {
      participant_id: this.participantId,
      token,
      offer_id: offerId,
      authorization,
      idempotency_key: this.idem(),
    });
  }

  async claimgraphCorrect(status: "CORRECTED" | "WITHDRAWN"): Promise<GateDecision & { event_id: string | null; replayed: boolean }> {
    const token = this.requireToken();
    const presentation = await this.gatePresentation("claimgraph.correct");
    return apiPost("/claimgraph/correct", {
      participant_id: this.participantId,
      token,
      status,
      presentation,
      idempotency_key: this.idem(),
    });
  }

  async newsroomReview(proposalId: string, decision: "accept" | "decline"): Promise<{ decision: string; receipt_id: string; reason_codes: string[]; proposal_id: string; review: "accept" | "decline" | null }> {
    const token = this.requireToken();
    const presentation = await this.gatePresentation("newsroom.review");
    return apiPost("/newsroom/review", {
      participant_id: this.participantId,
      token,
      proposal_id: proposalId,
      decision,
      presentation,
      idempotency_key: this.idem(),
    });
  }

  /** Import a fixture dispatch: gated on "newsroom.review" like any other
   *  newsroom action — only an ALLOWED verdict records anything. */
  async newsroomImport(article: unknown): Promise<GateDecision & { dispatch_id: string | null; replayed: boolean }> {
    const token = this.requireToken();
    const presentation = await this.gatePresentation("newsroom.review");
    return apiPost("/newsroom/import", {
      participant_id: this.participantId,
      token,
      article,
      presentation,
      idempotency_key: this.idem(),
    });
  }

  /* Aliases matching the SharedWorld UI names. */
  correctClaim(status: "CORRECTED" | "WITHDRAWN") {
    return this.claimgraphCorrect(status);
  }
  importDispatch(article: unknown) {
    return this.newsroomImport(article);
  }
  reviewProposal(proposalId: string, decision: "accept" | "decline") {
    return this.newsroomReview(proposalId, decision);
  }

  /** Submit a research package: gated on "newsroom.review" like any other
   *  newsroom action — only an ALLOWED verdict records anything. The
   *  worker-signed presentation is the worker's only signature in the run;
   *  the acceptance record is signed by the receiver gate, never the
   *  worker. Any producer-side `attestation` in the submission is unread
   *  by the receiver and must not appear in the verdict. */
  async newsroomSubmitPackage(submission: { package: unknown; package_sha256: string }): Promise<{
    decision: string; receipt_id: string; reason_codes: string[];
    binding?: { declared_sha256: string; pinned_sha256: string; match: boolean } | null;
    acceptance?: unknown; presentation_binding?: unknown;
    dispatch_id: string | null; claim_report_id?: string | null; replayed: boolean;
  }> {
    const token = this.requireToken();
    const presentation = await this.gatePresentation("newsroom.review");
    return apiPost("/newsroom/submit-package", {
      participant_id: this.participantId,
      token,
      submission,
      presentation,
      idempotency_key: this.idem(),
    });
  }
  submitPackage(submission: { package: unknown; package_sha256: string }) {
    return this.newsroomSubmitPackage(submission);
  }
}
