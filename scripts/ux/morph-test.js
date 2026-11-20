// The patcher (chat-ui/morph.js) on its own: selection, typed text, focus, the keyboard's word in
// progress, folds, keyed lists, listeners, data-own, the focused field and forwarding, each through
// redraws. Builds elements with the core's own h() from ui/core.js.
//
//   node scripts/ux/morph-test.js       needs Playwright; PP_PLUGINS=<folder> as for standin.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "../..");
const REPO = process.env.PP_PLUGINS || path.join(ROOT, "../promptpipe-plugins");
const morphSrc = fs.readFileSync(path.join(REPO, "chat-ui/morph.js"), "utf8");
// The core's own h(), copied from ui/core.js so the test builds elements the same way.
const core = fs.readFileSync(path.join(ROOT, "app/src/main/assets/ui/core.js"), "utf8");
const hSrc = core.slice(core.indexOf("const h = "), core.indexOf("const api = "));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.setContent(`<!doctype html><body><div id="app"></div><script>${hSrc}; window.h = h;</script><script>${morphSrc}</script></body>`);
  await p.evaluate(() => {
    window.S = { items: ["a", "b", "c"], val: "", clicks: [], n: 0 };
    window.view = () => h("div", { class: "root" },
      h("p", { class: "text", "data-key": "text" }, "Hello there, this is a long line of text to select. Render " + "number stays the same."),
      h("textarea", { id: "box", value: S.val }),
      h("input", { id: "line" }),
      h("details", { "data-key": "fold" }, h("summary", {}, "More"), h("div", {}, "inside")),
      h("ul", { "data-key": "list" }, S.items.map((x) => h("li", { "data-key": "i-" + x, onclick: () => S.clicks.push(x + S.n) }, "item " + x))),
      h("button", { id: "btn", onclick: () => S.clicks.push("btn" + S.n) }, "go"));
    window.render = () => { S.n++; morph(document.getElementById("app"), [view()]); };
    render();
  });
  let failed = 0;
  const check = (name, ok, extra = "") => (ok || failed++, console.log((ok ? "PASS " : "FAIL ") + name + (extra && !ok ? "  " + extra : "")));

  // 1. A selection inside the text survives a redraw.
  await p.evaluate(() => { const t = document.querySelector(".text").firstChild; const r = document.createRange(); r.setStart(t, 6); r.setEnd(t, 11); getSelection().removeAllRanges(); getSelection().addRange(r); window.textNode = t; });
  await p.evaluate(() => { render(); render(); });
  check("selection survives redraws", await p.evaluate(() => String(getSelection()) === "there" && document.querySelector(".text").firstChild === textNode));

  // 2. Typed text survives; the app changing the value still applies.
  await p.click("#line"); await p.keyboard.type("typed by hand");
  await p.evaluate(() => render());
  check("typed text in an input survives", (await p.inputValue("#line")) === "typed by hand");
  check("focus stays in the input", await p.evaluate(() => document.activeElement.id === "line"));
  await p.evaluate(() => { S.val = "set by the app"; render(); });
  check("value the app changes is applied", (await p.inputValue("#box")) === "set by the app");
  await p.click("#box"); await p.keyboard.press("End"); await p.keyboard.type(" + more");
  await p.evaluate(() => render());
  check("typing after an app value survives", (await p.inputValue("#box")) === "set by the app + more");

  // 3. Listeners move: newest closure runs, once.
  await p.evaluate(() => { S.clicks = []; render(); render(); });
  await p.click("#btn");
  const clicks = await p.evaluate(() => S.clicks);
  check("listener moved, newest closure, no duplicates", clicks.length === 1 && clicks[0] === "btn" + (await p.evaluate(() => S.n)), JSON.stringify(clicks));

  // 4. Keyed reorder keeps the same elements; removing one moves nothing else.
  await p.evaluate(() => { window.liB = document.querySelector('[data-key="i-b"]'); window.liC = document.querySelector('[data-key="i-c"]'); S.items = ["c", "a", "b"]; render(); });
  check("keyed reorder keeps elements", await p.evaluate(() => document.querySelector('[data-key="i-b"]') === liB && [...document.querySelectorAll("li")].map((l) => l.textContent).join() === "item c,item a,item b"));
  await p.evaluate(() => { S.items = ["c", "b"]; render(); });
  check("removing an item keeps the rest", await p.evaluate(() => document.querySelector('[data-key="i-c"]') === liC && document.querySelectorAll("li").length === 2));

  // 5. A fold opened by hand stays open.
  await p.click("summary");
  await p.evaluate(() => render());
  check("opened <details> stays open", await p.evaluate(() => document.querySelector("details").open));

  // 6. The keyboard's word in progress (IME composition) isn't broken by redraws.
  await p.click("#line"); await p.keyboard.press("End");
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.imeSetComposition", { text: "wor", selectionStart: 3, selectionEnd: 3 });
  await p.evaluate(() => { window.compEnded = false; document.getElementById("line").addEventListener("compositionend", () => (compEnded = true)); render(); render(); });
  const mid = await p.evaluate(() => ({ v: document.getElementById("line").value, ended: compEnded }));
  await cdp.send("Input.insertText", { text: "word" });
  check("IME composition survives redraws", !mid.ended && mid.v.endsWith("wor") && (await p.inputValue("#line")).endsWith("word"), JSON.stringify(mid));

  // 7. A new tag in the same place replaces; data-own children are left alone.
  await p.evaluate(() => {
    const own = h("div", { "data-own": "", "data-key": "own" }, "first");
    morph(document.getElementById("app"), [view(), own]);
    document.querySelector('[data-key="own"]').textContent = "updated by its owner";
    morph(document.getElementById("app"), [view(), h("div", { "data-own": "", "data-key": "own" }, "from render")]);
  });
  check("data-own children are left to their owner", await p.evaluate(() => document.querySelector('[data-key="own"]').textContent === "updated by its owner"));

  // 8. A listener added to an element already on the page (mid-gesture) stays through redraws.
  await p.evaluate(() => { window.gest = 0; document.getElementById("btn").addEventListener("pointerup", () => gest++); render(); render(); document.getElementById("btn").dispatchEvent(new Event("pointerup")); });
  check("listener added on the page stays", await p.evaluate(() => gest === 1));

  // 9. A handler that reads the field it was built with gets what the person typed.
  await p.evaluate(() => {
    window.view2 = () => { const inp = h("input", { id: "f2" }); return h("div", {}, inp, h("button", { id: "read", onclick: () => (window.readBack = inp.value) }, "read")); };
    morph(document.getElementById("app"), [view2()]);
  });
  await p.click("#f2"); await p.keyboard.type("hello");
  await p.evaluate(() => morph(document.getElementById("app"), [view2()]));
  await p.click("#read");
  check("captured field forwards to the kept one", (await p.evaluate(() => readBack)) === "hello");

  // 10. The field being typed in isn't overwritten; the app's value lands once the focus has left.
  await p.evaluate(() => { window.v3 = "start"; window.view3 = () => h("div", {}, h("input", { id: "f3", value: v3 }), h("input", { id: "other" })); morph(document.getElementById("app"), [view3()]); });
  await p.click("#f3"); await p.keyboard.press("End"); await p.keyboard.type("!");
  await p.evaluate(() => { v3 = "from the app"; morph(document.getElementById("app"), [view3()]); });
  const during = await p.inputValue("#f3");
  await p.click("#other");
  await p.evaluate(() => morph(document.getElementById("app"), [view3()]));
  check("focused field not overwritten, applied after", during === "start!" && (await p.inputValue("#f3")) === "from the app", during);
  check("no page errors", !errors.length, errors.join(" | "));
  await b.close();
  process.exit(failed ? 1 : 0);
})();
