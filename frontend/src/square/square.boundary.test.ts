/**
 * Square/town boundary tests — run with: npm test
 * frontend/src/square/square.boundary.test.ts
 *
 * The decorative town (src/town/) runs in an opaque-origin sandboxed
 * iframe. These tests enforce the containment STRUCTURALLY:
 *
 *  town/ may not: import the protocol write surface or replay path,
 *    touch the network (fetch/XHR/EventSource/WebSocket/beacon),
 *    touch storage/cookies, or postMessage except through protocol.ts.
 *  square/ (the parent host) may: compose VizView for the workshop screen.
 *  square/ may not: import director/source/reducer/protocol/api/hooks,
 *    postMessage INTO the frame, or write the frame's document.
 *
 * Negative controls: each test names the attack it blocks. See
 * e2e/town-isolation.mjs for the runtime (browser) half of the proof.
 * (*.test.ts files are not scanned: they legitimately name the patterns.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const townDir = join(here, "..", "town");
const frontendDir = join(here, "..");

/** absolute paths neither town/ nor square/ may runtime-import */
const FORBIDDEN_PREFIXES = [
  join(frontendDir, "viz", "director"),
  join(frontendDir, "viz", "source"),
  join(frontendDir, "viz", "reducer"),
  join(frontendDir, "viz", "protocol"),
  join(frontendDir, "api"),
  join(frontendDir, "hooks"),
  join(frontendDir, "world", "api"),
];
const VIZ_VIEW = join(frontendDir, "viz", "VizView");

/** network / storage primitives: the town must not reach the network at all */
const TOWN_FORBIDDEN_TOKENS = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /EventSource/,
  /WebSocket/,
  /sendBeacon/,
  /document\.cookie/,
  /localStorage/,
  /sessionStorage/,
  /\.postMessage\s*\(/, // town/ posts ONLY via protocol.ts (checked separately)
];

/** the parent host must never talk INTO the frame */
const HOST_FORBIDDEN_TOKENS = [
  /\.postMessage\s*\(/,
  /contentDocument/,
  /contentWindow\.document/,
  /srcdoc/,
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      out.push(...tsFiles(p));
      continue;
    }
    if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function runtimeImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^import(?!\s+type)[^;]*?from\s*["']([^"']+)["']/gm)) {
    out.push(m[1]);
  }
  for (const m of src.matchAll(/^import\s*["']([^"']+)["']/gm)) {
    out.push(m[1]);
  }
  return out;
}

function checkNoForbiddenImports(f: string, allowVizView: boolean) {
  const src = stripComments(readFileSync(f, "utf8"));
  for (const imp of runtimeImports(src)) {
    if (!imp.startsWith(".")) continue;
    const target = resolve(dirname(f), imp);
    for (const prefix of FORBIDDEN_PREFIXES) {
      assert.ok(
        target !== prefix && !target.startsWith(prefix + sep),
        `${f}: runtime import ${imp} resolves into forbidden ${prefix}`
      );
    }
    if (target === VIZ_VIEW || target.startsWith(join(frontendDir, "viz") + sep)) {
      assert.ok(
        allowVizView && target === VIZ_VIEW,
        `${f}: may only import the VizView component from viz, got ${imp}`
      );
    }
  }
}

const townFiles = tsFiles(townDir);
const squareFiles = tsFiles(here);
assert.ok(townFiles.length > 0, "expected town source files to scan");
assert.ok(squareFiles.length > 0, "expected square source files to scan");

test("town has no network, storage, or cookie primitives", () => {
  for (const f of townFiles) {
    if (f.endsWith("protocol.ts")) continue; // checked below
    const src = stripComments(readFileSync(f, "utf8"));
    for (const re of TOWN_FORBIDDEN_TOKENS) {
      assert.doesNotMatch(src, re, `${f}: forbidden token ${re} in town`);
    }
  }
});

test("town never runtime-imports the write surface, replay path, or app shell", () => {
  for (const f of townFiles) checkNoForbiddenImports(f, false);
});

test("town's only postMessage is the navigation intent in protocol.ts", () => {
  let count = 0;
  for (const f of townFiles) {
    const src = stripComments(readFileSync(f, "utf8"));
    const hits = src.match(/\.postMessage\s*\(/g) ?? [];
    count += hits.length;
    if (hits.length > 0) {
      assert.ok(
        f.endsWith(join("town", "protocol.ts")),
        `${f}: postMessage outside protocol.ts is forbidden`
      );
      assert.ok(
        src.includes('"openline:navigate"') && src.includes('"enter-workshop"'),
        `${f}: protocol.ts must only send the narrow navigation intent`
      );
    }
  }
  assert.equal(count, 1, "exactly one postMessage call may exist in town/");
});

test("square host never runtime-imports the write surface or replay path", () => {
  for (const f of squareFiles) checkNoForbiddenImports(f, true);
});

test("square host never talks into the frame", () => {
  for (const f of squareFiles) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const re of HOST_FORBIDDEN_TOKENS) {
      assert.doesNotMatch(src, re, `${f}: host must not write into the frame (${re})`);
    }
  }
});

test("town.html carries a network-denying CSP and no inline event handlers", () => {
  const html = readFileSync(join(frontendDir, "..", "town.html"), "utf8");
  assert.match(html, /Content-Security-Policy/, "town.html must set a CSP");
  assert.match(html, /connect-src 'none'/, "town.html CSP must deny network");
  assert.doesNotMatch(html, /\son\w+\s*=/, "town.html must have no inline event handlers");
});

// --- the validator itself, against adversarial inputs ---
import { isNavigateMessage } from "./navigate.ts";

test("isNavigateMessage accepts only the exact intent", () => {
  assert.equal(
    isNavigateMessage({ type: "openline:navigate", intent: "enter-workshop" }),
    true
  );
});

test("isNavigateMessage rejects forgeries and malformed shapes", () => {
  const bad: unknown[] = [
    null,
    undefined,
    "openline:navigate",
    42,
    [],
    {},
    { type: "openline:navigate" }, // missing intent
    { intent: "enter-workshop" }, // missing type
    { type: "openline:navigate", intent: "enter-workshop", admin: true }, // extra field
    { type: "openline:navigate", intent: "enter-workshop", extra: undefined }, // extra key, undefined value
    { type: "openline:navigate", intent: "exit-workshop" }, // unknown intent
    { type: "openline:navigate", intent: "ENTER-WORKSHOP" }, // case
    { type: "openline:navigate ", intent: "enter-workshop" }, // trailing space
    { type: "openline:navigate", intent: "enter-workshop\0" },
    { type: ["openline:navigate"], intent: "enter-workshop" },
  ];
  for (const v of bad) {
    assert.equal(isNavigateMessage(v), false, `must reject ${JSON.stringify(v)}`);
  }
});
