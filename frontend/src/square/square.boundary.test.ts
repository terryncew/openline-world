/**
 * Square boundary test — run with: npm test
 *
 * The Square is decoration. It must never manufacture protocol facts:
 * no POSTs, no event-log writes, no synthesized receipts, and no
 * runtime imports of the protocol write surface or the replay path.
 *
 * Follows the same static-scan pattern as viz/source.readonly.test.ts.
 * (*.test.ts files are not scanned: they legitimately name the patterns.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** absolute paths the square may never runtime-import, whatever the relative depth */
const FORBIDDEN_PREFIXES = [
  join(here, "..", "viz", "director"),
  join(here, "..", "viz", "source"),
  join(here, "..", "viz", "reducer"),
  join(here, "..", "viz", "protocol"),
  join(here, "..", "api"),
  join(here, "..", "world", "api"),
];
const VIZ_VIEW = join(here, "..", "viz", "VizView");

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
  /EventLog/,
  /mintReceipt/,
  /synthesize\w*receipt/i,
];

/** runtime imports the square may never take (type-only imports are erased) */
const FORBIDDEN_IMPORTS = [
  "../api",
  "../world/api",
  "../viz/director",
  "../viz/source",
  "../viz/reducer",
  "../viz/protocol",
  "../../api",
  "../../world/api",
  "../../viz/director",
  "../../viz/source",
  "../../viz/reducer",
  "../../viz/protocol",
];

function squareFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      out.push(...squareFiles(p));
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
  // side-effect imports: import "./x"
  for (const m of src.matchAll(/^import\s*["']([^"']+)["']/gm)) {
    out.push(m[1]);
  }
  return out;
}

const files = squareFiles(here);
assert.ok(files.length > 0, "expected square source files to scan");

test("square performs no mutating calls", () => {
  for (const f of files) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const re of MUTATING) {
      assert.doesNotMatch(src, re, `${f}: mutating pattern ${re} in square`);
    }
  }
});

test("square never runtime-imports the write surface or replay path", () => {
  for (const f of files) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const imp of runtimeImports(src)) {
      const norm = imp.replace(/^\.\//, "");
      // 1. legacy string-level check (kept for readable failure messages)
      for (const forbidden of FORBIDDEN_IMPORTS) {
        assert.notEqual(
          norm,
          forbidden.replace(/^\.\.\//, "../"),
          `${f}: runtime import of ${imp} forbidden in square`
        );
      }
      // 2. resolved-path check: catches any relative depth, e.g.
      //    ../../viz/director from src/square/scene/
      if (imp.startsWith(".")) {
        const target = resolve(dirname(f), imp);
        for (const prefix of FORBIDDEN_PREFIXES) {
          assert.ok(
            target !== prefix && !target.startsWith(prefix + sep),
            `${f}: runtime import ${imp} resolves into forbidden ${prefix}`
          );
        }
      }
    }
  }
});

test("square's only viz import is the VizView component (screen composition)", () => {
  for (const f of files) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const imp of runtimeImports(src)) {
      if (!imp.startsWith(".")) continue;
      const target = resolve(dirname(f), imp);
      if (target === join(here, "..", "viz") || target.startsWith(join(here, "..", "viz") + sep)) {
        assert.equal(
          target,
          VIZ_VIEW,
          `${f}: square may only import the VizView component from viz, got ${imp}`
        );
      }
    }
  }
});

test("worldState.ts imports nothing outside the square (pure decoration)", () => {
  const f = resolve(here, "worldState.ts");
  const src = stripComments(readFileSync(f, "utf8"));
  for (const imp of runtimeImports(src)) {
    assert.ok(
      !imp.startsWith("."),
      `worldState.ts must not import ${imp}`
    );
  }
});
