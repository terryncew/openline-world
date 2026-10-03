import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
for (const [w, h, name] of [[390, 844, "390x844"], [430, 932, "430x932"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
  await page.goto("http://127.0.0.1:5173/town.html", { waitUntil: "networkidle" });
  await sleep(6000);
  await page.screenshot({ path: `/tmp/town-mobile-${name}.png` });
  console.log(name, "errors:", errs.length);
  await page.close();
}
await browser.close();
