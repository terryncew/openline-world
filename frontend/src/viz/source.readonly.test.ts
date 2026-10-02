/**
 * Read-only invariant test — run with: npm test
 *
 * viz/source.ts and everything it imports must contain no POST or other
 * mutating calls. The renderer reads the World; it never writes to it.
 * (director.ts is the one module allowed to POST, and nothing in the
 * read path imports it.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const MUTATING = [
  /\bPOST\b/,
  /\bPUT\b/,
  /\bDELETE\b/,
  /\bPATCH\b/,
  /method\s*:\s*["']POST["']/,
  /\/api\/demo\//,
  /\/api\/owner\//,
  /\/api\/mode/,
  /advanceDemo/,
  /resetDemo/,
];

function localImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  // match `from "./x"` / `from "../y"` — but skip `import type` (erased)
  for (const m of src.matchAll(/^import(?!\s+type)[^;]*?from\s*["'](\.[^"']*)["']/gm)) {
    let p = resolve(dirname(file), m[1]);
    if (!p.endsWith(".ts")) p += ".ts";
    if (existsSync(p)) out.push(p);
  }
  return out;
}

function checkFile(file: string, seen: Set<string>) {
  if (seen.has(file)) return;
  seen.add(file);
  const raw = readFileSync(file, "utf8");
  // strip comments: doc text may legitimately name forbidden endpoints
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const re of MUTATING) {
    assert.doesNotMatch(src, re, `${file}: mutating pattern ${re} in read path`);
  }
  for (const imp of localImports(file)) checkFile(imp, seen);
}

test("viz/source.ts (+ its imports) performs no mutating calls", () => {
  checkFile(resolve(here, "source.ts"), new Set());
});

test("viz/reducer.ts (+ its imports) performs no mutating calls", () => {
  checkFile(resolve(here, "reducer.ts"), new Set());
});

test("viz/protocol.ts is free of mutating calls", () => {
  checkFile(resolve(here, "protocol.ts"), new Set());
});

test("source.ts imports the api module type-only (no runtime POST surface)", () => {
  const src = readFileSync(resolve(here, "source.ts"), "utf8");
  for (const m of src.matchAll(/^import[^\n]*from\s*["']\.\.\/api["']/gm)) {
    assert.match(m[0], /^import\s+type\b/, "runtime import of ../api in read path");
  }
});
