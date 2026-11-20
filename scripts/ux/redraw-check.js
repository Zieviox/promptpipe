// Checks, on the real chat screen, that a redraw never takes away what the person is doing:
// a selection, text being typed (with the keyboard's word in progress), focus, scroll positions,
// a swipe or a press in progress. Runs its own stand-in (port 7795, data in build/ux-check-data),
// drives a phone-sized browser, forces redraws in the middle of each action and prints PASS/FAIL.
//
//   node scripts/ux/redraw-check.js     needs Playwright (NODE_PATH=$(npm root -g) if it is global)
//
// PP_PLUGINS=<folder> as for standin.js (default: ../promptpipe-plugins next to this repo).
// Exit code 1 when a check fails. Screenshots of the end state go to build/ux-shots/redraw-*.png.
const { spawn } = require("child_process");
const path = require("path");
const { chromium, devices } = require("playwright");

const ROOT = path.join(__dirname, "../..");
const PORT = 7795;
const results = [];
let page = null;
const check = (name, ok, detail = "") => {
  results.push(ok);
  if (!ok && page) page.screenshot({ path: path.join(ROOT, "build/ux-shots/redraw-fail-" + results.length + ".png") }).catch(() => {});
  console.log((ok ? "PASS " : "FAIL ") + name + (detail && !ok ? "  (" + detail + ")" : ""));
};

(async () => {
  const standin = spawn(process.execPath, [path.join(__dirname, "standin.js")], {
    env: { ...process.env, PP_PORT: String(PORT), PP_DATA: path.join(ROOT, "build/ux-check-data") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((ok) => standin.stdout.on("data", (d) => String(d).includes("stand-in on") && ok()));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: devices["Pixel 7"].userAgent });
  page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  const wait = (ms) => page.waitForTimeout(ms);
  const redraw = (n = 5) => page.evaluate((n) => { for (let i = 0; i < n; i++) render(); }, n);
  const until = async (fn, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await page.evaluate(fn).catch(() => false)) return true;
      await wait(200);
    }
    return false;
  };
  const skipGuides = async () => {
    for (let i = 0; i < 3; i++) {
      const s = page.getByText("Skip guide");
      if (!(await s.count())) break;
      await s.first().tap();
      await wait(300);
    }
  };
  // Select `phrase` inside the first element matching `sel` that contains it.
  const selectIn = (sel, phrase) =>
    page.evaluate(([sel, phrase]) => {
      for (const root of document.querySelectorAll(sel)) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode()); ) {
          const i = n.data.indexOf(phrase);
          if (i < 0) continue;
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + phrase.length);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          return true;
        }
      }
      return false;
    }, [sel, phrase]);
  const selection = () => page.evaluate(() => String(getSelection()));
  const typeInto = async (sel, text) => {
    await page.locator(sel).first().tap();
    await page.keyboard.type(text);
  };
  const focusedState = (sel) => page.evaluate((sel) => ({ value: document.querySelector(sel)?.value, focused: document.activeElement === document.querySelector(sel) }), sel);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await wait(2500);
    await skipGuides();
    check("the screen starts with no errors", !errors.length, errors.join(" | "));

    // A site plugin, then a first message and its reply.
    await page.getByText("Get site plugins").first().tap();
    await until(() => [...document.querySelectorAll(".sheet button.pill")].some((b) => b.textContent === "Get"));
    await page.locator(".sheet button.pill", { hasText: "Get" }).first().tap();
    await until(() => [...S.plugins.values()].some((p) => p.manifest?.kind === "site"));
    await page.getByLabel("Close").first().tap();
    await wait(300);
    await skipGuides();
    await typeInto("#msg", "hello there");
    await page.locator("button.send").tap();
    check("a reply arrives", await until(() => document.querySelector(".turn .ai .md")?.textContent.includes("short plan")));

    // While a slow reply streams in.
    await typeInto("#msg", "slow reply please");
    await page.locator("button.send").tap();
    check("the waiting reply shows live", await until(() => (document.querySelector(".live-box")?.innerText.length || 0) > 20));
    await selectIn(".turn .ai .md", "short plan");
    await wait(1500); // streaming updates
    await redraw();
    check("a selection in a reply survives streaming and redraws", (await selection()) === "short plan", await selection());
    await typeInto("#msg", "next ");
    await cdp.send("Input.imeSetComposition", { text: "wor", selectionStart: 3, selectionEnd: 3 });
    await page.evaluate(() => { window.__compEnd = 0; document.getElementById("msg").addEventListener("compositionend", () => __compEnd++); });
    await redraw();
    await wait(1000);
    const mid = await page.evaluate(() => ({ v: document.getElementById("msg").value, ended: __compEnd, focused: document.activeElement.id }));
    await cdp.send("Input.insertText", { text: "words" });
    check("the keyboard's word in progress survives redraws", mid.v === "next wor" && !mid.ended && mid.focused === "msg", JSON.stringify(mid));
    check("typing goes on after it", (await page.inputValue("#msg")) === "next words", await page.inputValue("#msg"));
    const scrolled = await page.evaluate(() => { const m = document.querySelector(".chat"); m.scrollTop = 120; return m.scrollTop; });
    await redraw(3);
    check("the chat's scroll position survives redraws", (await page.evaluate(() => document.querySelector(".chat").scrollTop)) === scrolled);
    check("the slow reply finishes", await until(() => !document.querySelector(".live-box") && document.querySelectorAll(".turn .ai .md").length === 2, 40000));
    check("text typed while it came in is still in the box", (await page.inputValue("#msg")) === "next words", await page.inputValue("#msg"));
    await page.evaluate(() => { document.getElementById("msg").value = ""; });

    // A swipe right with a redraw in the middle quotes the reply (no swipe while text is selected).
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.evaluate(() => document.querySelector(".turn .ai .md").scrollIntoView({ block: "start" }));
    const box = await page.locator(".turn .ai").first().boundingBox();
    const y = Math.max(box.y, 80) + 40;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 30, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 90, y }] });
    await redraw(2);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 160, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(200);
    check("a swipe survives a redraw in the middle", (await page.inputValue("#msg")).startsWith("> "), JSON.stringify(await page.inputValue("#msg")));
    check("the swiped reply is back in place", await page.evaluate(() => !document.querySelector(".turn .ai").style.transform));
    await page.evaluate(() => { document.getElementById("msg").value = ""; });

    // The chats list: the search box, and a tap (not a hold) on a row.
    await page.getByLabel("Chats").first().tap();
    await wait(300);
    await skipGuides();
    await typeInto("#cs", "hel");
    await redraw();
    const cs = await focusedState("#cs");
    check("the chats search keeps its text and focus", cs.value === "hel" && cs.focused, JSON.stringify(cs));
    await page.evaluate(() => { const row = document.querySelector("#clist .cr:not(.fr)"); row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5 })); render(); render(); document.querySelector("#clist .cr:not(.fr)").dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); });
    await wait(700);
    check("a tap on a chat with a redraw during it is not a hold", !(await page.evaluate(() => S.selMode)));
    await page.evaluate(() => document.querySelector("#clist .cr:not(.fr)").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5 })));
    await wait(700);
    check("a hold on a chat still starts selecting", await page.evaluate(() => S.selMode));
    await page.evaluate(() => { endSelect(); closeDrawer(); });

    // Find: results follow the typing, and the box keeps it through redraws.
    await page.evaluate(() => openFind(""));
    await wait(300);
    await page.keyboard.type("mod");
    await wait(400);
    check("Find shows results for what is typed", await page.evaluate(() => [...document.querySelectorAll(".sheet .results .it")].some((b) => /model/i.test(b.textContent))));
    await redraw();
    const fd = await focusedState(".sheet .search input");
    check("Find keeps the typed text and focus through redraws", fd.value === "mod" && fd.focused, JSON.stringify(fd));
    await page.keyboard.press("ArrowDown");
    check("arrow keys mark a result", await page.evaluate(() => !!document.querySelector(".sheet .results .sel")));
    await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
    await page.keyboard.type("short");
    check("Find searches the messages", await until(() => [...document.querySelectorAll(".sheet .results .it")].some((b) => b.textContent.includes("hello there")), 5000));
    await page.evaluate(() => closeSheet());

    // A sheet's field: a site plugin setting, typed while the screen redraws.
    await page.evaluate(() => openPluginSettings([...S.plugins.values()].find((p) => p.manifest?.kind === "site").id));
    await wait(300);
    await typeInto(".sheet input", ".my-reply");
    await redraw();
    const st = await focusedState(".sheet input");
    check("a setting being typed keeps its text and focus", st.value === ".my-reply" && st.focused, JSON.stringify(st));
    await page.evaluate(() => closeSheet());

    // The message menu's tag box.
    await page.evaluate(() => openMessageMenu(S.chat, S.chat.turns[0], 0));
    await wait(300);
    await skipGuides();
    await typeInto(".sheet .tag-input", "idea");
    await redraw();
    const tg = await focusedState(".sheet .tag-input");
    check("the tag box keeps its text and focus", tg.value === "idea" && tg.focused, JSON.stringify(tg));
    await page.evaluate(() => closeSheet());

    // The site view's address bar, while the page reports a new address.
    await page.evaluate(() => { S.sv = true; render(); });
    await wait(300);
    await page.locator("#url").tap();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("example.org/abc");
    await page.evaluate(() => { pg(0).url = "https://chat.deepseek.com/a/chat/s/new"; render(); render(); });
    const url = await focusedState("#url");
    check("the address bar keeps what is typed while the page moves", url.value === "example.org/abc" && url.focused, JSON.stringify(url));
    await page.evaluate(() => { S.sv = false; render(); });

    check("no page errors on the way", !errors.length, errors.join(" | "));
    await page.screenshot({ path: path.join(ROOT, "build/ux-shots/redraw-end.png") });
  } catch (e) {
    check("the run itself", false, String(e.message || e).slice(0, 400));
  } finally {
    await browser.close();
    standin.kill();
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
