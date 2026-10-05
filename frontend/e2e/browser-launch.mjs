/**
 * Shared Playwright browser launch (WORLD-AUTHORITY-001 repair §7).
 *
 * Portability: explicit BROWSER_EXECUTABLE env override first, then a
 * known local install, otherwise Playwright's default Chromium resolution.
 * SwiftShader args preserved in all cases. Harness-only: no application
 * semantics affected.
 */
import { existsSync } from "node:fs";

const KNOWN_INSTALL =
  "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";

export function browserLaunchOptions(extraArgs = []) {
  const opts = {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", ...extraArgs],
  };
  if (process.env.BROWSER_EXECUTABLE) {
    opts.executablePath = process.env.BROWSER_EXECUTABLE;
  } else if (existsSync(KNOWN_INSTALL)) {
    opts.executablePath = KNOWN_INSTALL;
  }
  return opts;
}
