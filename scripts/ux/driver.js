// Keeps one phone-sized browser page open on the app and runs small scripts sent to it.
// POST a function body to http://127.0.0.1:9333; it gets `page` (Playwright), `shot(name)`
// (a screenshot in build/ux-shots/), `look()` (every control on screen: label, size, place,
// and COVERED when something is on top of it) and `logs` (the page's errors so far).
//
//   node scripts/ux/standin.js &        the app screen on 127.0.0.1:7790
//   node scripts/ux/driver.js &         needs Playwright (NODE_PATH=$(npm root -g) if it is global)
//   curl -s -X POST 127.0.0.1:9333 --data 'await page.locator("#msg").tap();
//     await page.keyboard.type("hello"); await page.locator("button.send").tap();
//     await page.waitForTimeout(6000); await shot("reply"); return await look();'
//
// Use tap(), not click(): a click is a mouse, and the mouse-only help badge then shows.
// PP_URL=<address> to look at another address (the real core's /open?key=… link).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");
const SHOTS = path.join(__dirname, "../../build/ux-shots");
fs.mkdirSync(SHOTS, { recursive: true });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: devices["Pixel 7"].userAgent });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(m.type() + ": " + m.text().slice(0, 300)));
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 300)));
  await page.goto(process.env.PP_URL || "http://127.0.0.1:7790/");
  const shot = async (name) => {
    const f = path.join(SHOTS, name + ".png");
    await page.screenshot({ path: f });
    return f;
  };
  // What a person can tap right now: visible buttons, links and fields, with size.
  const look = () =>
    page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("button, a, input, textarea, select, [role=button], [role=tab], [onclick]")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const label = (el.getAttribute("aria-label") || el.innerText || el.placeholder || el.title || "").trim().replace(/\s+/g, " ").slice(0, 50);
        out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ")[0]} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}${top && (top === el || el.contains(top)) ? "" : " COVERED"}`);
      }
      return out;
    });
  http
    .createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      try {
        const fn = new (Object.getPrototypeOf(async function () {}).constructor)("page", "shot", "look", "logs", body);
        const r = await fn(page, shot, look, logs);
        res.end(typeof r === "string" ? r : JSON.stringify(r, null, 1));
      } catch (e) {
        res.end("ERROR " + String(e.message || e).slice(0, 600));
      }
    })
    .listen(9333, "127.0.0.1", () => console.log("driver ready"));
})();
