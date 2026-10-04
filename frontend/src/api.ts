// Same-origin API path: the browser only talks to the dev server that served
// this page, and Vite proxies /api/* to the loopback-only backend. The
// backend port is never exposed to the LAN and never hard-coded here.
const BASE = "";

export interface HelperInfo {
  helper_id: string;
  active: boolean;
  scopes: string[];
  mandate_id: string;
}

export interface ReviewInfo {
  helper: string;
  action: string;
  rule: string;
  decision: "ALLOWED" | "STOPPED";
  reason: string;
  receipt_id: string;
  decided_at: string;
}

export interface ReceiptInfo {
  schema: string;
  gate_id: string;
  gate_public_key: string;
  principal_id: string;
  mandate_id: string;
  subject_id: string;
  action: string;
  decision: "ALLOWED" | "STOPPED";
  reason_codes: string[];
  presentation_hash: string;
  decided_at: string;
  payload_hash: string;
  signature: { algorithm: string; public_key: string; value: string };
}

export interface WEvent {
  event_id: string;
  seq: number;
  task_id: string;
  ts: string;
  source: string;
  kind: string;
  provenance: "agent-reported" | "receiver-signed" | "owner-signed" | "adapter-mapped";
  summary: string;
  detail: Record<string, unknown>;
}

export interface Snapshot {
  mode: "demo" | "connected";
  connection: { status: string; detail: string };
  task: { task_id: string; title: string };
  helpers: HelperInfo[];
  review: ReviewInfo | null;
  receipts: number;
  demo: { step: number; total: number; finished: boolean; next: string | null };
  gate: { gate_id: string; gate_public_key: string; principal_id: string };
  session: string;
  notice: string;
}

async function req(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data;
}

export const api = {
  state: () => req("/api/state") as Promise<Snapshot>,
  receipts: () => req("/api/receipts") as Promise<{ receipts: ReceiptInfo[] }>,
  advanceDemo: () => req("/api/demo/advance", "POST") as Promise<{ finished: boolean; step: number; total: number; label?: string }>,
  resetDemo: () => req("/api/demo/reset", "POST") as Promise<{ reset: boolean }>,
  advanceAuthorityDemo: () => req("/api/demo/authority/advance", "POST") as Promise<{ finished: boolean; step: number; total: number; label?: string }>,
  resetAuthorityDemo: () => req("/api/demo/authority/reset", "POST") as Promise<{ reset: boolean }>,
  setMode: (mode: "demo" | "connected") => req("/api/mode", "POST", { mode }),
  propose: (helper: string, action: string) => req("/api/owner/propose", "POST", { helper, action }),
  revoke: (helper: string) => req("/api/owner/revoke", "POST", { helper }),
  onboard: (helper: string, scopes: string[]) => req("/api/owner/onboard", "POST", { helper, scopes }),
  streamUrl: `${BASE}/api/events`,
};
