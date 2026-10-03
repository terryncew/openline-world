import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// wall-time -> vignette beats (offsets: carrier 0, tinkerer +4, reader +8, sweeper +2)
const shots = [
  ["sweeper-strokes", 1000],
  ["carrier-lift", 4000],
  ["carrier-carry", 7000],
  ["reader-pageturn", 11500],
  ["tinkerer-crank", 13500],
];
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:5173/town.html", { waitUntil: "networkidle" });
const t0 = Date.now();
for (const [name, at] of shots) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await page.screenshot({ path: `/tmp/beat-${name}.png` });
  console.log("shot", name);
}
await browser.close();
