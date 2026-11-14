// Qwen: fill the box the usual way, then press Send like a finger does
// (pointer + mouse events, not just a click). If Qwen still hasn't sent after
// a few seconds, type the text again keyboard-style and press once more.
// 1.4.0: exact selectors from a page report; the reply is only the answer
// part (no thinking card, no Copy/Translate labels).
// 1.6.0: no broad fallbacks; thinking only from this reply; gives up on an
// error toast or after the idle limit; model = first line of the model name.
// 1.6.1: the page report also lists reply versions to pick from and open drawers.
// 1.6.2: "didn't send" says what dialog or pop-up is on top of the chat.
// 1.6.3: closes the Models list Qwen opens by itself before and during a send.
// 1.6.4: a finished reply is recognised by its action row, not by waiting 10 s.
// 1.6.5: Stop ends the wait for the rest of the reply too.
// 1.6.6: a pause in the answer (long thinking, slow start) no longer ends the wait: it ends when the
// action row shows, or after 45 s with nothing changing (was 8 s).
const box = (site) => PP.first(site.input);
const boxText = (el) => (el ? (el.isContentEditable ? el.innerText : el.value || "").trim() : "");

// Only the real Send button; without it Enter is pressed (never a guessed button).
const sendButton = (site) => {
  const b = PP.first(site.send);
  return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
};

// Qwen shows refusals ("You do not have permission…", rate limits) as a
// toast or alert. Pass that text on instead of waiting.
const siteError = () => {
  for (const el of document.querySelectorAll(".qwen-chat-v2-toast-container, [role=alert]")) {
    const t = PP.textOf(el);
    if (t && el.getClientRects().length && /permission|denied|limit|too many|try again|error|failed|login|log in/i.test(t)) return t.split("\n")[0].slice(0, 200);
  }
  return "";
};
// Something on top of the chat (a dialog, drawer or pop-up, e.g. a choice Qwen waits on) and
// what it says, for the errors below: "didn't send" is usually this.
const blocker = () => {
  for (const el of document.querySelectorAll("[role=dialog], .ant-drawer-open, .ant-modal-wrap, [class*='popup' i], [class*='modal' i]")) {
    const t = PP.textOf(el).replace(/\s+/g, " ").trim();
    if (el.getClientRects().length && t) return ` The page shows: "${t.slice(0, 160)}".`;
  }
  return "";
};
const stopIfError = () => {
  const e = siteError();
  if (e) throw new Error(`Qwen said: "${e}"`);
};

const tap = (b) => {
  const r = b.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 };
  b.dispatchEvent(new PointerEvent("pointerdown", at));
  b.dispatchEvent(new MouseEvent("mousedown", at));
  b.dispatchEvent(new PointerEvent("pointerup", at));
  b.dispatchEvent(new MouseEvent("mouseup", at));
  b.click();
};

const fillNative = (el, text) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const fillKeyboard = (el, text) => {
  el.focus();
  if (el.select) el.select();
  else document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);
};

// Qwen folds the thinking into a card ("Thinking completed") and only puts the
// text on the page once the card is opened. Read it if it's there; otherwise
// open the card, read what appears, and close it again.
// Tap the innermost part (the title) so the tap bubbles up to whichever
// element listens for it.
const CARDS = [".qwen-chat-thinking-status-card-title-text", ".qwen-chat-thinking-status-card-title", ".qwen-chat-thinking-tool-status-card-wraper .qwen-chat-tool-status-card"];
const LABEL = /^thinking( completed)?$|^thought for/i;
const thinkIn = (site, msg) => {
  for (const s of site.thinking || []) {
    let els = [];
    try { els = [...msg.querySelectorAll(s)]; } catch (e) {}
    const t = els.map(PP.textOf).filter((x) => x && !LABEL.test(x));
    if (t.length) return t[t.length - 1];
  }
  return "";
};
// Any new text that showed up after opening the card, in the message or in a
// side panel: the longest new block that isn't just the card's label.
const newText = (root, seen) => {
  let best = "";
  for (const el of root.querySelectorAll("[class*='think' i], [class*='reason' i], [class*='markdown' i]")) {
    if (seen.has(el)) continue;
    const t = PP.textOf(el);
    if (t && !LABEL.test(t) && t.length > best.length) best = t;
  }
  return best;
};
// Tapping the card opens a bottom drawer with the thinking as titled steps.
const STEPS = ".qwen-chat-thinking-and-sources-content-thinking-container";
// While thinking, the message shows the current step's title (and a Skip button we never touch).
const LIVE = ".qwen-chat-mobile-chat-status-label";
const md = (el) => PP.toMarkdown(el);
const stepsText = (box) =>
  [...box.querySelectorAll(".qwen-chat-thinking-status-card")]
    .map((card) => {
      const title = PP.textOf(card.querySelector(".qwen-chat-thinking-status-card-title-text"));
      const body = card.querySelector(".qwen-markdown");
      const text = body ? md(body) : "";
      if (!text && LABEL.test(title)) return "";
      return (title && !LABEL.test(title) ? `**${title}**\n\n` : "") + text;
    })
    .filter(Boolean)
    .join("\n\n");
const openSteps = () => [...document.querySelectorAll(STEPS)].filter((x) => x.getClientRects().length).pop();
const closeDrawer = async () => {
  const x = document.querySelector(".qwen-chat-thinking-and-sources-header-close") || document.querySelector(".ant-drawer-open .ant-drawer-close");
  if (x) tap(x);
  await PP.sleep(300);
};
// Qwen sometimes opens its "Models" list by itself (on a phone it is a bottom drawer over the
// chat) and waits for a pick; nothing sends until it is closed. Close it with its own Close button
// and keep the model that was selected. True if one was open.
const dismissModels = async () => {
  const pop = [...document.querySelectorAll(".mms-popup")].find((x) => x.getClientRects().length);
  if (!pop) return false;
  const x = pop.querySelector(".ant-drawer-close") || (pop.closest(".ant-drawer-open") || document).querySelector(".ant-drawer-close");
  if (x) tap(x);
  else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  PP.status("Qwen opened its model list; closing it…");
  await PP.sleep(400);
  return true;
};
const newestMsg = () => {
  const all = document.querySelectorAll(".qwen-chat-message-assistant, .chat-response-message");
  return all[all.length - 1];
};

// Live: open the steps drawer once Qwen starts thinking and pass the steps on as they grow.
const watchThinking = () => {
  let stop = false, opened = false, last = "";
  (async () => {
    while (!stop) {
      await PP.sleep(700);
      if (stop) break;
      const box = openSteps();
      if (box) {
        const t = stepsText(box);
        if (t && t !== last) {
          last = t;
          PP.status(`thinking… ${t.length} chars`, { thinking: t });
        }
        continue;
      }
      const label = newestMsg()?.querySelector(LIVE);
      if (label && !opened) {
        opened = true;
        tap(label);
      } else if (label && PP.textOf(label) !== last) {
        last = PP.textOf(label);
        PP.status("thinking…", { thinking: "*" + last + "*" });
      }
    }
  })();
  return { stop: () => (stop = true), opened: () => opened };
};

// ownDrawer: the steps drawer now open was opened for this reply (by the live
// watcher). Any other open drawer may belong to an older message: closed first.
const readThinking = async (site, replyEl, ownDrawer) => {
  let box = openSteps();
  if (box && !ownDrawer) {
    await closeDrawer();
    box = null;
  }
  if (!box) {
    const msg = replyEl && (replyEl.closest(".qwen-chat-message") || replyEl.closest(".chat-response-message"));
    const card = msg && CARDS.map((c) => msg.querySelector(c)).find(Boolean);
    if (!card) return msg ? thinkIn(site, msg) : "";
    tap(card);
    for (let i = 0; i < 12 && !(box = openSteps()); i++) await PP.sleep(250);
    if (!box) return thinkIn(site, msg);
    await PP.sleep(400); // let the steps render
  }
  const text = stepsText(box);
  await closeDrawer();
  return text;
};

// Page report (⋯ → Copy page report) for Qwen: opens the newest thinking card
// first, then lists what appeared, so the place Qwen shows thinking is visible.
const outline = (root, lines, depth = 0) => {
  if (lines.length > 500 || depth > 16) return;
  const cls = typeof root.className === "string" && root.className.trim() ? "." + root.className.trim().split(/\s+/).filter((c) => !/^css-/.test(c)).join(".") : "";
  const attrs = ["id", "role", "aria-label", "aria-expanded"].filter((a) => root.getAttribute(a)).map((a) => `[${a}=${root.getAttribute(a)}]`).join("");
  const own = [...root.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 50);
  lines.push("  ".repeat(depth) + root.tagName.toLowerCase() + cls + attrs + (own ? `  "${own}"` : ""));
  for (const c of root.children) if (!/^(svg|script|style|path)$/i.test(c.tagName)) outline(c, lines, depth + 1);
};
const qwenReport = async (site) => {
  const lines = [];
  const msgs = document.querySelectorAll(".chat-response-message");
  const msg = msgs[msgs.length - 1];
  const card = msg && [...CARDS, LIVE].map((c) => msg.querySelector(c)).find(Boolean);
  const before = new Set(document.querySelectorAll("body *"));
  if (card) {
    tap(card);
    await PP.sleep(1500);
  }
  lines.push(card ? "== thinking card tapped open ==" : "== no thinking card found ==");
  if (msg) outline(msg.closest(".qwen-chat-message") || msg, lines);
  // New elements anywhere (a side panel or drawer), outermost first.
  const fresh = [...document.querySelectorAll("body *")].filter((el) => !before.has(el) && el.getClientRects().length && !(msg && msg.contains(el)));
  const tops = fresh.filter((el) => !fresh.includes(el.parentElement));
  lines.push("", `== appeared elsewhere after the tap (${tops.length}) ==`);
  for (const el of tops.slice(0, 5)) outline(el, lines);
  const open = [...document.querySelectorAll("[role=dialog], [class*='drawer' i], [class*='panel' i], [class*='think' i]")].filter((el) => el.getClientRects().length && !(msg && msg.contains(el)) && PP.textOf(el).length > 20);
  lines.push("", `== panels and thinking outside the reply (${open.length}) ==`);
  for (const el of open.filter((el) => !open.includes(el.parentElement)).slice(0, 4)) outline(el, lines);
  if (card) await closeDrawer();
  // Qwen sometimes shows two versions of a reply to pick from and waits. List
  // how many replies the newest turn holds and anything that looks like the choice.
  const turn = msg && (msg.closest(".qwen-chat-message") || msg);
  const versions = turn ? turn.querySelectorAll(".response-message-content") : [];
  const ask = /prefer|which (one|response|answer|reply)|better|choose|pick|compare|version|option|选择|更喜欢|哪个/i;
  const picks = [...document.querySelectorAll("button, [role=button], [role=radio], [role=tab], [role=option], label")].filter((el) => el.getClientRects().length && ask.test(PP.textOf(el)) && PP.textOf(el).length < 120);
  lines.push("", `== reply versions in the newest turn: ${versions.length}; things that look like a choice: ${picks.length} ==`);
  for (const el of picks.slice(0, 6)) outline(el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement : el, lines);
  const openDrawers = document.querySelectorAll(".ant-drawer-open").length;
  lines.push("", `== drawers open before the model list: ${openDrawers} ==`);
  // The model list: open it, show what appeared, close it.
  const trigger = document.querySelector(".mms-trigger");
  if (trigger) {
    const was = new Set(document.querySelectorAll("body *"));
    tap(trigger);
    await PP.sleep(1200);
    const added = [...document.querySelectorAll("body *")].filter((el) => !was.has(el) && el.getClientRects().length);
    const roots = added.filter((el) => !added.includes(el.parentElement));
    lines.push("", `== model list after tapping the model name (${roots.length}) ==`);
    for (const el of roots.slice(0, 4)) outline(el, lines);
    const x = document.querySelector(".ant-drawer-open .ant-drawer-close");
    if (x) tap(x);
    else tap(trigger);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }
  return { url: location.href, report: lines.join("\n") };
};

// The model the page shows: first line of the model name (no badges).
const model = (site) => PP.textOf(PP.first(site.model)).split("\n")[0].trim();

// Wait for the reply, but stop on an error toast or after idleMinutes with
// no activity (the app's own limits don't reach site scripts).
const waitOrError = (site, snap) => {
  const idleMs = (Number(site.settings && site.settings.idleMinutes) || 10) * 60000;
  let timer;
  const watch = new Promise((_, fail) => {
    timer = setInterval(() => {
      const e = siteError();
      if (e) fail(new Error(`Qwen said: "${e}"`));
    }, 1000);
  });
  return Promise.race([PP.waitReply(site, snap, idleMs, 0), watch]).finally(() => clearInterval(timer));
};

return {
  probe: (site) => qwenReport(site),
  info: (site) => ({ ...PP.info(site), model: model(site) }),
  async send(text, site) {
    await dismissModels();
    const el = box(site);
    if (!el) throw new Error("Qwen's message box wasn't found (tap the site name to look)" + blocker());
    const snap = PP.snapshot(site);
    const url = location.href;
    const went = () => !el.isConnected || location.href !== url || !boxText(el) || !!PP.first(site.stop);
    // A steps drawer left open (by you or an older reply) would be read as this reply's thinking.
    if (openSteps()) await closeDrawer();
    el.focus();
    if (el.isContentEditable) fillKeyboard(el, text);
    else fillNative(el, text);
    await PP.sleep(500);
    let b = sendButton(site);
    if (b) tap(b);
    else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    for (let i = 0; i < 16 && !went(); i++) { await PP.sleep(250); stopIfError(); }
    if (!went() && (await dismissModels())) {
      b = sendButton(site);
      if (b) tap(b);
      for (let i = 0; i < 16 && !went(); i++) { await PP.sleep(250); stopIfError(); }
    }
    if (!went()) {
      PP.status("Send didn't take; trying again…");
      if (!el.isContentEditable) fillKeyboard(el, text);
      await PP.sleep(500);
      b = sendButton(site);
      if (b) tap(b);
      else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      for (let i = 0; i < 40 && !went(); i++) { await PP.sleep(250); stopIfError(); }
      stopIfError();
      if (!went()) throw new Error("Qwen didn't send it." + blocker() + " If it's answering anyway, tap Check; if not, ⋯ → Copy page report and send it over");
    }
    const live = watchThinking();
    let raw;
    try {
      raw = await waitOrError(site, snap);
    } catch (e) {
      live.stop();
      throw e;
    }
    // Qwen pauses mid-stream (often right after thinking), which looks finished. The sure sign
    // is the action row (share, regenerate, copy) under the finished reply: once it is there, no
    // stop button shows and the text has held for a moment, it is done. Without that sign (the
    // page changed), fall back to waiting until the reply has not grown for 45 seconds.
    const finished = () => {
      const el = PP.lastReplyEl(site);
      const msg = el && el.closest(".chat-response-message");
      return !!(msg && msg.querySelector(".response-message-footer-actions"));
    };
    let still = Date.now();
    while (Date.now() - still < 45000) {
      await PP.sleep(250);
      stopIfError();
      if (PP.cancelled && PP.cancelled()) break; // Stop keeps the reply so far
      if (PP.first(site.stop) || newestMsg()?.querySelector(LIVE)) still = Date.now();
      const now = PP.textOf(PP.lastReplyEl(site));
      if (now && now !== raw) {
        raw = now;
        still = Date.now();
        PP.status(`still writing… ${raw.length} chars`);
      }
      if (Date.now() - still >= 1000 && finished()) break;
    }
    live.stop();
    const replyEl = PP.lastReplyEl(site);
    return { raw: PP.answerText(site, replyEl) || raw, thinking: await readThinking(site, replyEl, live.opened()), model: model(site) };
  },
};
