// Runs inside the AI chat page. The app sends commands over a native port:
//   send  {site, text}  type the text, send it, wait for the finished reply
//   last  {site}        newest reply on the page
//   list  {site}        chats listed in the site's sidebar
//   info  {site}        current address, title and model
// `site` is the site plugin's selectors (see docs/PLUGINS.md, "AI sites").
(() => {
  if (window.top !== window || window.__ppBridge) return;
  window.__ppBridge = true;

  const visible = (el) => !!el && el.getClientRects().length > 0;
  const all = (sel) => {
    try {
      return [...document.querySelectorAll(sel)];
    } catch (e) {
      return [];
    }
  };
  const first = (sels) => {
    for (const s of sels || []) {
      const el = all(s).find(visible);
      if (el) return el;
    }
    return null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (find, ms) => {
    const end = Date.now() + ms;
    for (;;) {
      const el = find();
      if (el || Date.now() > end) return el;
      await sleep(250);
    }
  };
  const textOf = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");

  // A reply's HTML as Markdown, so lists, headings, code and tables survive.
  const SKIP = /^(button|svg|style|script|noscript|template|textarea|input|select|nav|form)$/i;
  const BLOCK = /^(P|DIV|UL|OL|PRE|TABLE|BLOCKQUOTE|H[1-6]|HR|SECTION|ARTICLE|FIGURE|DETAILS|MAIN)$/;
  const toMarkdown = (root) => {
    if (!root) return "";
    const hidden = (el) => el.getAttribute("aria-hidden") === "true" || el.hidden || (el.isConnected && getComputedStyle(el).display === "none");
    const inline = (node) => {
      let out = "";
      for (const n of node.childNodes) {
        if (n.nodeType === 3) out += n.textContent.replace(/\s+/g, " ");
        else if (n.nodeType === 1) out += el2md(n, true);
      }
      return out;
    };
    const wrap = (s, m) => (s.trim() ? m + s.trim() + m : "");
    const codeText = (pre) => {
      const code = pre.querySelector("code") || pre;
      // Line-numbered and highlighted blocks: plain text without UI labels.
      const c = code.cloneNode(true);
      c.querySelectorAll("button, [class*='copy' i], [class*='line-number' i], [class*='linenumber' i]").forEach((x) => x.remove());
      return c.textContent.replace(/\n$/, "");
    };
    const lang = (pre) => {
      const code = pre.querySelector("code") || pre;
      const m = /(?:language|lang)-([\w+#-]+)/.exec((code.className || "") + " " + (pre.className || ""));
      return m ? m[1] : "";
    };
    // Nested content is indented under its item by the marker's width.
    const list = (el) => {
      const ordered = el.tagName === "OL";
      let i = +(el.getAttribute("start") || 1);
      let out = "";
      for (const li of el.children) {
        if (li.tagName !== "LI") continue;
        const mark = ordered ? `${i++}. ` : "- ";
        let body = "";
        for (const n of li.childNodes) {
          if (n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName)) body = body.replace(/\n+$/, "") + "\n" + list(n);
          else if (n.nodeType === 1 && BLOCK.test(n.tagName)) body += (body.trim() ? "\n" : "") + el2md(n, false).trim() + "\n";
          else body += n.nodeType === 3 ? n.textContent.replace(/\s+/g, " ") : el2md(n, true);
        }
        const lines = body.trim().split("\n").filter((l, k, a) => l.trim() || (k > 0 && a[k - 1].trim()));
        out += mark + [lines[0], ...lines.slice(1).map((l) => (l.trim() ? " ".repeat(mark.length) + l : l))].join("\n") + "\n";
      }
      return out;
    };
    const table = (el) => {
      const rows = [...el.querySelectorAll("tr")].map((tr) => [...tr.children].map((td) => inline(td).trim().replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const n = Math.max(...rows.map((r) => r.length));
      const line = (r) => "| " + [...r, ...Array(n - r.length).fill("")].join(" | ") + " |";
      return [line(rows[0]), "|" + " --- |".repeat(n), ...rows.slice(1).map(line)].join("\n") + "\n\n";
    };
    const el2md = (el, isInline) => {
      if (SKIP.test(el.tagName) || hidden(el)) return "";
      const t = el.tagName;
      switch (t) {
        case "BR": return "\n";
        case "STRONG": case "B": return wrap(inline(el), "**");
        case "EM": case "I": return wrap(inline(el), "*");
        case "DEL": case "S": return wrap(inline(el), "~~");
        case "CODE": return el.closest("pre") ? el.textContent : "`" + el.textContent + "`";
        case "A": { const x = inline(el).trim(); const href = el.getAttribute("href"); return href && x && !href.startsWith("javascript:") ? `[${x}](${el.href})` : x; }
        case "IMG": return el.alt || el.src ? `![${el.alt || ""}](${el.src})` : "";
      }
      if (!BLOCK.test(t)) return inline(el);
      // A code block's wrapper (language label, Copy button): just the code.
      if (t === "DIV") {
        const pres = el.querySelectorAll("pre");
        if (pres.length === 1 && el.textContent.length - pres[0].textContent.length < 40) return el2md(pres[0], false);
      }
      switch (t) {
        case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": return "#".repeat(+t[1]) + " " + inline(el).trim() + "\n\n";
        case "P": return inline(el).trim() + "\n\n";
        case "HR": return "---\n\n";
        case "PRE": return "```" + lang(el) + "\n" + codeText(el) + "\n```\n\n";
        case "UL": case "OL": return list(el) + "\n";
        case "TABLE": return table(el);
        case "BLOCKQUOTE": return blocks(el).trim().split("\n").map((l) => "> " + l).join("\n") + "\n\n";
      }
      return blocks(el);
    };
    // Block children: runs of inline content become one paragraph.
    const blocks = (el) => {
      let out = "", run = "";
      const flush = () => {
        if (run.trim()) out += run.trim() + "\n\n";
        run = "";
      };
      for (const n of el.childNodes) {
        if (n.nodeType === 3) run += n.textContent.replace(/\s+/g, " ");
        else if (n.nodeType === 1) {
          const md = el2md(n, false);
          if (/\n\n$/.test(md) || /^(DIV|SECTION|ARTICLE)$/.test(n.tagName)) {
            flush();
            out += md.endsWith("\n\n") || !md.trim() ? md : md.trim() + "\n\n";
          } else run += md;
        }
      }
      flush();
      return out;
    };
    return blocks(root).replace(/\n{3,}/g, "\n\n").trim();
  };
  // Markdown when it says more than plain text, otherwise the plain text.
  const mdOf = (el) => {
    if (!el) return "";
    try {
      return toMarkdown(el) || textOf(el);
    } catch (e) {
      return textOf(el);
    }
  };

  const snapshot = (site) => {
    const snap = {};
    for (const s of site.reply || []) {
      const els = all(s);
      snap[s] = { count: els.length, last: textOf(els[els.length - 1]) };
    }
    return snap;
  };

  // Thinking (reasoning) shown by some models: the newest element matching
  // site.thinking that appeared since `before`. If it sits inside the reply,
  // it is left out of the reply text.
  const thinkCount = (site) => (site.thinking || []).reduce((n, s) => n + all(s).length, 0);
  const lastThinking = (site) => {
    for (const s of site.thinking || []) {
      const els = all(s);
      if (els.length) return els[els.length - 1];
    }
    return null;
  };
  // A thinking block in the same message as the reply (up to 3 levels up).
  const nearThinking = (site, replyEl) => {
    let box = replyEl;
    for (let up = 0; box && up < 3; up++, box = box.parentElement) {
      for (const s of site.thinking || []) {
        let found = [];
        try {
          found = [...box.querySelectorAll(s)];
        } catch (e) {}
        const t = found.filter((n) => !n.contains(replyEl) && textOf(n));
        if (t.length) return t[t.length - 1];
      }
    }
    return null;
  };
  // All elements for the first selector that matches anything with text.
  const pickAll = (sels) => {
    for (const s of sels || []) {
      const els = all(s).filter((e) => textOf(e));
      if (els.length) return els;
    }
    return [];
  };

  // The reply as Markdown, without any thinking block inside it.
  const answerText = (site, el) => {
    if (!el) return "";
    // "thinking" boxes and "strip" parts (e.g. source numbers like "-18") never belong in the reply text.
    const drop = [...(site.thinking || []), ...(site.strip || [])];
    if (!drop.some((s) => { try { return el.querySelector(s); } catch (e) { return false; } })) return mdOf(el);
    // Hidden parts are judged on the live page; mark them before cloning.
    const clone = el.cloneNode(true);
    for (const s of drop) try { clone.querySelectorAll(s).forEach((n) => n.remove()); } catch (e) {}
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-99999px;top:0;width:800px";
    host.append(clone);
    document.body.append(host);
    try {
      return mdOf(clone) || mdOf(el);
    } finally {
      host.remove();
    }
  };
  const lastReplyEl = (site) => {
    for (const s of site.reply || []) {
      const els = all(s);
      if (els.length && textOf(els[els.length - 1])) return els[els.length - 1];
    }
    return null;
  };

  const lastReply = (site) => {
    for (const s of site.reply || []) {
      const els = all(s);
      const t = textOf(els[els.length - 1]);
      if (t) return t;
    }
    return "";
  };

  // A visible "Log in" / "Sign in" button (in common languages) means we're logged out.
  const loggedOut = () =>
    [...document.querySelectorAll("button, a, [role=button]")].some(
      (b) => visible(b) && /^\s*(log ?in|sign ?in|fazer login|entrar|iniciar sesi[oó]n|anmelden|se connecter|connexion|accedi|登录|ログイン)\s*$/i.test(textOf(b)),
    );

  const noBox = () => new Error("chat input box not found on the page after 15s (tap the site name to look" + (loggedOut() ? "; it shows a Log in button" : "") + ")");
  const typeInto = async (site, text, snap) => {
    // The site may still be loading (it just opened or switched chats), so wait for the box.
    const el = await waitFor(() => first(site.input), 15000);
    if (!el) throw noBox();
    el.focus();
    if (el.isContentEditable) {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } else {
      // Typing through the editor command fires the same events as a real
      // keyboard, which React/Vue apps listen to. Fall back to the native setter.
      el.select();
      const typed = document.execCommand("insertText", false, text) && el.value === text;
      if (!typed) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    // Long text can take the site a moment to accept: wait for an enabled send button.
    const enabled = (b) => b && !b.disabled && b.getAttribute("aria-disabled") !== "true";
    // No send selector matched (sites change, or use <div role=button>): the
    // last enabled button in the box's own area is almost always Send.
    const nearSend = () => {
      let box = el.parentElement;
      for (let up = 0; box && up < 6; up++, box = box.parentElement) {
        const btns = [...box.querySelectorAll("button, [role=button]")].filter((b) => visible(b) && !b.contains(el) && el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        // Send is the last one; while it's still disabled, wait rather than press a toggle.
        if (btns.length) return enabled(btns[btns.length - 1]) ? btns[btns.length - 1] : null;
      }
      return null;
    };
    const btn = await waitFor(() => {
      const b = first(site.send);
      return enabled(b) ? b : null;
    }, 1500) || await waitFor(nearSend, 2500);
    const boxText = () => (el.isContentEditable ? el.innerText : el.value || "").trim();
    const press = () => {
      if (btn) return btn.click();
      const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
      el.dispatchEvent(new KeyboardEvent("keydown", opts));
      el.dispatchEvent(new KeyboardEvent("keypress", opts));
      el.dispatchEvent(new KeyboardEvent("keyup", opts));
    };
    const startUrl = location.href;
    const usersBefore = pickAll(site.user).length;
    press();
    // Sent = the box emptied or was replaced, the page moved to a new chat, or
    // the stop button showed up. Try once more, then say so.
    const went = () => {
      const now = first(site.input);
      const grew = (snap && (site.reply || []).some((s) => all(s).length > (snap[s] || { count: 0 }).count)) || pickAll(site.user).length > usersBefore;
      return grew || !el.isConnected || location.href !== startUrl || !boxText() || (now && now !== el && !(now.isContentEditable ? now.innerText : now.value || "").trim()) || !!first(site.stop);
    };
    if (await waitFor(() => went() || null, 5000)) return;
    // Press again only while our text is clearly still waiting in the same box.
    if (el.isConnected && boxText()) press();
    if (!(await waitFor(() => went() || null, 10000))) {
      throw new Error("couldn't tell whether the site sent it. If the site is answering, tap Check; if not, ⋯ → Copy page report and send it to whoever maintains the site plugin");
    }
  };

  // Wait for a new reply that has stopped changing.
  // Set by the "cancel" command (Stop waiting in the app).
  let cancelled = false;
  // idleMs / maxMs: give up after that long with no activity / in total; 0 = never.
  // What the last wait saw, as numbers only (no message text): when the stop signal and the
  // lengths of the reply and the thinking changed. Shown in the message's notes for waits of 30 s+,
  // so a wait that never ends can be diagnosed without sharing a private chat.
  let lastWatch = "";
  const watchOf = (log, start) => `${Math.round((Date.now() - start) / 1000)} s in total; last changes: ${log.slice(-10).join(" | ")}`;
  const waitReply = async (site, before, idleMs = 0, maxMs = 0) => {
    const start = Date.now();
    const log = [];
    let sig = "";
    const done = (v) => ((lastWatch = Date.now() - start > 30000 ? watchOf(log, start) : ""), v);
    cancelled = false;
    let text = "";
    let stableSince = 0;
    // Activity = new reply text, new thinking text or a visible stop button.
    let lastActivity = Date.now();
    let thinkText = "";
    // How long the reply must stay unchanged, with no stop signal, before it counts as finished. A site
    // whose stop signal is certain sets site.settleMs lower; the default is the guess that fits any site.
    const settle = Number(site.settleMs) > 0 ? Number(site.settleMs) : 2000;
    // A stop signal that stays on while the reply sits unchanged for this long is taken as stuck (the site
    // changed its page): the reply that is there is used, instead of waiting for ever.
    const stuckMs = Number(site.stuckMs) > 0 ? Number(site.stuckMs) : 45000;
    let changedAt = Date.now();
    const timedOut = () => (maxMs > 0 && Date.now() - start >= maxMs) || (idleMs > 0 && Date.now() - lastActivity >= idleMs);
    while (!timedOut()) {
      // Stop keeps what has come in (the whole reply, or the part so far); with nothing yet there is nothing to keep.
      if (cancelled) {
        if (text) return done(text);
        throw new Error("stopped waiting before any reply came (if the site answers anyway, ⋯ → Add the page's newest reply)" + (Date.now() - start > 30000 ? ". Waited: " + watchOf(log, start) : ""));
      }
      await sleep(250);
      let now = "";
      let shown = 0; // reply elements on the page now (a virtual list shows only some)
      for (const s of site.reply || []) {
        const els = all(s);
        shown = Math.max(shown, els.length);
        const last = textOf(els[els.length - 1]);
        const b = before[s] || { count: 0, last: "" };
        if (last && (els.length > b.count || last !== b.last)) {
          now = last;
          break;
        }
      }
      const busy = !!first(site.stop);
      const th = textOf(lastThinking(site));
      // The page's own view size too: a page with no room on screen may show no messages at all.
      const now_sig = `${busy ? "stop on" : "stop off"}, reply ${now.length}, thinking ${th.length}, replies shown ${shown}, view ${innerWidth}x${innerHeight}${document.hidden ? " hidden" : ""}`;
      if (now_sig !== sig) (sig = now_sig), log.push(`${Math.round((Date.now() - start) / 1000)}s ${now_sig}`), log.length > 40 && log.shift();
      if (busy || th !== thinkText || now !== text) lastActivity = Date.now();
      if (th !== thinkText || now !== text) changedAt = Date.now();
      if (busy && now && now === text && Date.now() - changedAt > stuckMs) {
        status(`the site still shows it is writing, but the reply has not changed for ${Math.round(stuckMs / 1000)} s: using it`);
        return done(text);
      }
      // Show the thinking live in the app while the model is still thinking.
      if (th && th !== thinkText && !now) status(`thinking… ${th.length} chars`, { thinking: th });
      thinkText = th;
      if (now && now === text && !busy) {
        if (Date.now() - stableSince > settle) return done(text);
      } else {
        if (now !== text) status(`writing… ${now.length} chars`, { thinking: thinkText, reply: now });
        text = now;
        stableSince = Date.now();
      }
    }
    lastWatch = watchOf(log, start);
    throw new Error((maxMs > 0 && Date.now() - start >= maxMs ? `no finished reply after ${Math.round(maxMs / 60000)} min (your limit in Settings)` : `no activity on the page for ${Math.round(idleMs / 60000)} min (your limit in Settings; or check the site plugin's reply selectors)`) + ". Waited: " + lastWatch);
  };

  const info = (site) => ({
    url: location.href,
    title: document.title,
    model: site ? textOf(first(site.model || [])) : "",
    input: site ? !!first(site.input || []) : false, // the chat box shows (logged in, or a guest the site lets in)
  });

  const list = (site) => {
    const seen = new Set();
    const out = [];
    for (const a of all((site.chatLinks || []).join(","))) {
      const url = a.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: textOf(a).split("\n")[0].slice(0, 120) || url });
    }
    return out;
  };

  // Model picker and site switches (e.g. DeepThink). site.modelPicker =
  // { open: [selectors of the button], options: [selectors of menu items] };
  // site.switches = [{ name, selector, text }]: the element matching selector
  // whose text contains `text`.
  const pressEscape = () => {
    for (const t of [document.activeElement, document.body]) {
      if (t) t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    }
  };
  // Close the model list. Escape does not close a bottom drawer (Qwen on a phone), so if the
  // options are still showing, press the Close button of the list's own dialog.
  const closePicker = async (site) => {
    pressEscape();
    await sleep(300);
    const opt = optionEls(site)[0];
    if (!opt) return;
    const dialog = opt.el.closest("[role=dialog], .ant-drawer, [class*=popup i]");
    const x = dialog && [...dialog.querySelectorAll("[aria-label=Close i], [aria-label=close i], .ant-drawer-close, [class*=close i]")].find(visible);
    if (x) x.click();
    await sleep(300);
  };
  const optionEls = (site) => {
    const seen = new Set();
    const out = [];
    for (const s of (site.modelPicker && site.modelPicker.options) || []) {
      for (const el of all(s).filter(visible)) {
        const name = textOf(el).split("\n")[0].trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          out.push({ name, el });
        }
      }
      if (out.length) break;
    }
    return out;
  };
  const openPicker = async (site) => {
    const btn = await waitFor(() => first((site.modelPicker && site.modelPicker.open) || []), 5000);
    if (!btn) throw new Error("model picker not found on the page (check the site plugin's modelPicker selectors)");
    btn.click();
    for (let i = 0; i < 10 && !optionEls(site).length; i++) await sleep(200);
  };
  const switchEl = (sw) => {
    const want = (sw.text || "").toLowerCase();
    const label = (el) => [textOf(el), el.getAttribute("aria-label"), el.getAttribute("title")].filter(Boolean).join(" ").toLowerCase();
    const ok = (el) => visible(el) && (!want || label(el).includes(want));
    return all(sw.selector || "button, [role=button]").find(ok) || (want ? all("button, [role=button], [role=switch], [role=checkbox], [role=menuitemcheckbox]").find(ok) : undefined);
  };
  const switchOn = (el) =>
    !!el && (el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-checked") === "true" || /(^|[\s_-])(active|selected|checked|on)([\s_-]|$)/i.test(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ""));
  const switches = (site) => (site.switches || []).map((sw) => {
    const el = switchEl(sw);
    return { name: sw.name, found: !!el, on: switchOn(el) };
  });

  const builtin = {
    async models(m) {
      await openPicker(m.site);
      const models = optionEls(m.site).map((o) => o.name);
      await closePicker(m.site);
      return { models, switches: switches(m.site), ...info(m.site) };
    },
    async setModel(m) {
      await openPicker(m.site);
      const want = m.model.toLowerCase();
      const opt = optionEls(m.site).find((o) => o.name.toLowerCase() === want) || optionEls(m.site).find((o) => o.name.toLowerCase().includes(want));
      if (!opt) {
        await closePicker(m.site);
        throw new Error(`model "${m.model}" is not in the site's list`);
      }
      opt.el.click();
      await sleep(600);
      if (optionEls(m.site).length) await closePicker(m.site); // a list that stays open covers the page
      return { switches: switches(m.site), ...info(m.site) };
    },
    async setSwitch(m) {
      const sw = (m.site.switches || []).find((x) => x.name === m.name);
      const el = sw && switchEl(sw);
      if (!el) throw new Error(`switch "${m.name}" not found on the page`);
      if (m.on === undefined || switchOn(el) !== !!m.on) el.click();
      await sleep(300);
      return { switches: switches(m.site), ...info(m.site) };
    },
    info: (m) => info(m.site),
    last: (m) => ({ raw: answerText(m.site, lastReplyEl(m.site)), thinking: mdOf(lastThinking(m.site)), ...info(m.site) }),
    list: (m) => ({ chats: list(m.site), ...info(m.site) }),
    // Page report: only a site script's own (the Page report plugin does the rest with "run").
    probe: () => ({}),
    // Run a plugin's code in the page: new Function("PP", "site", code). Returns its object.
    run: async (m) => {
      const r = await new Function("PP", "site", m.code)(helpers, m.site);
      return r && typeof r === "object" ? r : { value: r };
    },
    cancel: () => ((cancelled = true), {}),
    // Earlier messages of the open chat, in page order: [{you, reply, thinking}].
    // The reply now on the page (or the one still coming): waits until it is finished.
    async follow(m) {
      const raw = await waitReply(m.site, {}, m.idleMs || 0, m.maxMs || 0);
      const replyEl = lastReplyEl(m.site);
      const thinkEl = nearThinking(m.site, replyEl);
      const users = pickAll(m.site.user);
      return { raw: answerText(m.site, replyEl) || raw, thinking: mdOf(thinkEl), you: textOf(users[users.length - 1]), watch: lastWatch, ...info(m.site) };
    },
    history: (m) => {
      const pick = pickAll;
      const users = pick(m.site.user);
      const replies = pick(m.site.reply).filter((r) => !users.some((u) => u.contains(r) || r.contains(u)));
      if (!users.length && !replies.length) throw new Error("no messages found on the page (the site plugin may need 'user' selectors; try Copy page report)");
      const marks = [...users.map((el) => ({ el, you: true })), ...replies.map((el) => ({ el, you: false }))];
      marks.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const turns = [];
      for (const k of marks) {
        if (k.you) turns.push({ you: textOf(k.el), reply: "", thinking: "" });
        else {
          if (!turns.length || turns[turns.length - 1].reply) turns.push({ you: "", reply: "", thinking: "" });
          const t = turns[turns.length - 1];
          const th = nearThinking(m.site, k.el);
          t.reply = answerText(m.site, k.el);
          t.thinking = mdOf(th);
        }
      }
      return { turns, ...info(m.site) };
    },
    async send(m) {
      const snap = snapshot(m.site);
      const thinkBefore = thinkCount(m.site);
      await typeInto(m.site, m.text, snap);
      const raw = await waitReply(m.site, snap, m.idleMs || 0, m.maxMs || 0);
      await sleep(300); // let the address update for a new chat
      const replyEl = lastReplyEl(m.site);
      // Thinking: a new thinking block anywhere, or one sitting next to this reply.
      const thinkEl = thinkCount(m.site) > thinkBefore ? lastThinking(m.site) : nearThinking(m.site, replyEl);
      return {
        raw: answerText(m.site, replyEl) || raw,
        thinking: mdOf(thinkEl),
        watch: lastWatch,
        ...info(m.site),
      };
    },
  };

  // A site plugin may bring a script (its "siteScript" file). It runs here, in
  // the AI page, gets these helpers, and returns the commands it replaces:
  //   return { async send(text, site) { ...; return { raw } }, last(site), list(site), info(site) }
  // Commands it leaves out use the selector based defaults above.
  const helpers = { cancelled: () => cancelled, all, first, visible, sleep, textOf, typeInto, waitReply, snapshot, lastReply, lastReplyEl, lastThinking, answerText, toMarkdown: mdOf, list, info, status: (t, live) => status(t, live) };
  // Driver plugins ("kind": "driver") bring the same kind of script for every
  // site (site.drivers). Order: the site's own script, then drivers (the last
  // installed wins), then the defaults above.
  const compiled = new Map(); // code -> commands
  const compile = (code) => {
    if (!compiled.has(code)) {
      if (compiled.size > 16) compiled.clear();
      compiled.set(code, new Function("PP", code)(helpers) || {});
    }
    return compiled.get(code);
  };
  const scriptFor = (site) => {
    if (!site) return {};
    const codes = [...(site.drivers || []), ...(site.script ? [site.script] : [])];
    return codes.length ? Object.assign({}, ...codes.map(compile)) : {};
  };
  const handlers = {};
  for (const cmd of Object.keys(builtin)) {
    handlers[cmd] = async (m) => {
      const own = scriptFor(m.site)[cmd];
      if (!own) return builtin[cmd](m);
      // A fresh chat may still be loading when the send arrives. The built-in send waits for the
      // box; a site script's own send asks for it at once, so wait here, once, for every site plugin.
      if (cmd === "send" && m.site && m.site.input && !(await waitFor(() => first(m.site.input), 15000))) throw noBox();
      const r = cmd === "send" ? await own(m.text, m.site, builtin.send.bind(null, m)) : await own(m.site);
      if (cmd === "list") return { chats: Array.isArray(r) ? r : (r && r.chats) || [], ...info(m.site) };
      return { ...info(m.site), ...(r || {}) };
    };
  }

  let port = null;
  let tries = 0;
  // live: { thinking, reply } so far, shown in the waiting message in the app.
  const status = (text, live) => port && port.postMessage({ type: "event", event: "progress", text, live: live || null });

  const connect = () => {
    try {
      port = browser.runtime.connectNative("pp");
    } catch (e) {
      return retry();
    }
    port.onDisconnect.addListener(() => {
      port = null;
      retry();
    });
    port.onMessage.addListener(async (m) => {
      if (m.type === "welcome") return void (tries = 0);
      const p = port;
      try {
        const fn = handlers[m.cmd];
        if (!fn) throw new Error("unknown command " + m.cmd);
        const result = await fn(m);
        p.postMessage({ type: "reply", id: m.id, ok: true, result });
      } catch (e) {
        p.postMessage({ type: "reply", id: m.id, ok: false, error: String((e && e.message) || e) });
      }
    });
    port.postMessage({ type: "hello", url: location.href, title: document.title });
  };
  // Pages other than the app's site page (popups) have no listener: give up after a while.
  const retry = () => {
    if (++tries < 40) setTimeout(connect, Math.min(500 * tries, 5000));
  };
  connect();

  // Single page apps change the address without reloading: report it.
  let lastUrl = location.href;
  setInterval(() => {
    if (port && location.href !== lastUrl) {
      lastUrl = location.href;
      port.postMessage({ type: "event", event: "url", url: lastUrl, title: document.title });
    }
  }, 1500);
})();
