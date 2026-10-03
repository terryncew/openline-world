import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:5173/town.html", { waitUntil: "networkidle" });
await sleep(6000);
await page.screenshot({ path: "/tmp/town-v1.png" });
console.log("errors:", errs.length, errs.slice(0, 3));
await browser.close();
