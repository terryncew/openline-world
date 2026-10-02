import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone-ish viewport
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:5189/openline-world/?static=1", { waitUntil: "networkidle" });
await sleep(5000);
const sq = await page.locator(".square-view").count();
await page.screenshot({ path: "/tmp/preview-square.png" });
await page.click("text=Enter the workshop");
await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 23, null, { timeout: 60000, polling: 1000 });
await sleep(2000);
await page.screenshot({ path: "/tmp/preview-workshop.png" });
console.log(`DIST CHECK: square=${sq} events>=23 ok pageErrors=${errors.length}`);
await browser.close();
