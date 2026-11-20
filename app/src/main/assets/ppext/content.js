// Runs inside the AI chat page. The app sends commands over a native port:
//   send  {provider, text}  type the text, send it, wait for the finished reply
//   last  {provider}        newest reply on the page
//   list  {provider}        chats listed in the site's sidebar
//   info  {provider}        current address, title and model
// `provider` is the provider plugin's description: its selectors and options (see docs/PLUGINS.md, "Providers").
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

  const snapshot = (provider) => {
    const snap = {};
    for (const s of provider.reply || []) {
      const els = all(s);
      snap[s] = { count: els.length, last: textOf(els[els.length - 1]) };
    }
    return snap;
  };

  // Thinking (reasoning) shown by some models: the newest element matching
  // provider.thinking that appeared since `before`. If it sits inside the reply,
  // it is left out of the reply text.
  const thinkCount = (provider) => (provider.thinking || []).reduce((n, s) => n + all(s).length, 0);
  const lastThinking = (provider) => {
    for (const s of provider.thinking || []) {
      const els = all(s);
      if (els.length) return els[els.length - 1];
    }
    return null;
  };
  // A thinking block in the same message as the reply (up to 3 levels up).
  const nearThinking = (provider, replyEl) => {
    let box = replyEl;
    for (let up = 0; box && up < 3; up++, box = box.parentElement) {
      for (const s of provider.thinking || []) {
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
  const answerText = (provider, el) => {
    if (!el) return "";
    // "thinking" boxes and "strip" parts (e.g. source numbers like "-18") never belong in the reply text.
    const drop = [...(provider.thinking || []), ...(provider.strip || [])];
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
  const lastReplyEl = (provider) => {
    for (const s of provider.reply || []) {
      const els = all(s);
      if (els.length && textOf(els[els.length - 1])) return els[els.length - 1];
    }
    return null;
  };

  const lastReply = (provider) => {
    for (const s of provider.reply || []) {
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

  // A content script may say that the site refused the message (an error line instead of a reply, a
  // human check): its error(provider) returns nothing, a text, or { text, el } with the element showing it.
  // An error whose element was already showing before the send (`old`) belongs to an earlier message.
  const siteError = (provider, old) => {
    const fn = provider && scriptFor(provider).error;
    if (!fn) return null;
    let r;
    try {
      r = fn(provider);
    } catch (e) {
      return null;
    }
    if (typeof r === "string") r = { text: r };
    if (!r || !r.text || (r.el && old && old.has(r.el))) return null;
    return r;
  };
  // Before a send: errors on the page now are old ones, except one with no element (a human
  // check over the whole page), which stops the send at once.
  const oldErrors = (provider) => {
    const r = siteError(provider);
    if (r && !r.el) throw new Error(r.text);
    return new Set(r ? [r.el] : []);
  };

  const noBox = () => new Error("chat input box not found on the page after 15s (tap the site name to look" + (loggedOut() ? "; it shows a Log in button" : "") + ")");
  const typeInto = async (provider, text, snap, old) => {
    // The site may still be loading (it just opened or switched chats), so wait for the box.
    const el = await waitFor(() => first(provider.input), 15000);
    if (!el) throw noBox();
    if (!old) old = oldErrors(provider);
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
      const b = first(provider.send);
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
    const usersBefore = pickAll(provider.user).length;
    press();
    // Sent = the box emptied or was replaced, the page moved to a new chat, or
    // the stop button showed up. Try once more, then say so.
    const went = () => {
      const err = siteError(provider, old);
      if (err) throw new Error(err.text);
      const now = first(provider.input);
      const grew = (snap && (provider.reply || []).some((s) => all(s).length > (snap[s] || { count: 0 }).count)) || pickAll(provider.user).length > usersBefore;
      return grew || !el.isConnected || location.href !== startUrl || !boxText() || (now && now !== el && !(now.isContentEditable ? now.innerText : now.value || "").trim()) || !!first(provider.stop);
    };
    if (await waitFor(() => went() || null, 5000)) return;
    // Press again only while our text is clearly still waiting in the same box.
    if (el.isConnected && boxText()) press();
    if (!(await waitFor(() => went() || null, 10000))) {
      throw new Error("couldn't tell whether the site sent it. If the site is answering, tap Check; if not, ⋯ → Copy page report and send it to whoever maintains the provider plugin");
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
  // old: errors showing before the send (see oldErrors); without it every error the content script sees counts.
  const waitReply = async (provider, before, idleMs = 0, maxMs = 0, old = null) => {
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
    // How long the reply must stay unchanged, with no stop signal, before it counts as finished. A provider
    // whose stop signal is certain sets provider.settleMs lower; the default is the guess that fits any site.
    const settle = Number(provider.settleMs) > 0 ? Number(provider.settleMs) : 2000;
    // A stop signal that stays on while the reply sits unchanged for this long is taken as stuck (the site
    // changed its page): the reply that is there is used, instead of waiting for ever.
    const stuckMs = Number(provider.stuckMs) > 0 ? Number(provider.stuckMs) : 45000;
    let changedAt = Date.now();
    const timedOut = () => (maxMs > 0 && Date.now() - start >= maxMs) || (idleMs > 0 && Date.now() - lastActivity >= idleMs);
    while (!timedOut()) {
      // Stop keeps what has come in (the whole reply, or the part so far); with nothing yet there is nothing to keep.
      if (cancelled) {
        if (text) return done(text);
        throw new Error("stopped waiting before any reply came (if the site answers anyway, ⋯ → Add the page's newest reply)" + (Date.now() - start > 30000 ? ". Waited: " + watchOf(log, start) : ""));
      }
      await sleep(250);
      // The site refused the message: say so now instead of waiting for a reply that won't come.
      const err = siteError(provider, old);
      if (err) {
        lastWatch = Date.now() - start > 30000 ? watchOf(log, start) : "";
        throw new Error(err.text);
      }
      let now = "";
      let shown = 0; // reply elements on the page now (a virtual list shows only some)
      for (const s of provider.reply || []) {
        const els = all(s);
        shown = Math.max(shown, els.length);
        const last = textOf(els[els.length - 1]);
        const b = before[s] || { count: 0, last: "" };
        if (last && (els.length > b.count || last !== b.last)) {
          now = last;
          break;
        }
      }
      const busy = !!first(provider.stop);
      const th = textOf(lastThinking(provider));
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
    throw new Error((maxMs > 0 && Date.now() - start >= maxMs ? `no finished reply after ${Math.round(maxMs / 60000)} min (your limit in Settings)` : `no activity on the page for ${Math.round(idleMs / 60000)} min (your limit in Settings; or check the provider plugin's reply selectors)`) + ". Waited: " + lastWatch);
  };

  const info = (provider) => ({
    url: location.href,
    title: document.title,
    model: provider ? textOf(first(provider.model || [])) : "",
    input: provider ? !!first(provider.input || []) : false, // the chat box shows (logged in, or a guest the site lets in)
  });

  const list = (provider) => {
    const seen = new Set();
    const out = [];
    for (const a of all((provider.chatLinks || []).join(","))) {
      const url = a.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: textOf(a).split("\n")[0].slice(0, 120) || url });
    }
    return out;
  };

  // Model picker and the site's options (e.g. DeepThink). provider.modelPicker =
  // { open: [selectors of the button], items: [selectors of its menu items] };
  // provider.options = [{ name, selector, text }]: the element matching selector
  // whose text contains `text`.
  const pressEscape = () => {
    for (const t of [document.activeElement, document.body]) {
      if (t) t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    }
  };
  // Close the model list. Escape does not close a bottom drawer (Qwen on a phone), so if the
  // options are still showing, press the Close button of the list's own dialog.
  const closePicker = async (provider) => {
    pressEscape();
    await sleep(300);
    const opt = modelItems(provider)[0];
    if (!opt) return;
    const dialog = opt.el.closest("[role=dialog], .ant-drawer, [class*=popup i]");
    const x = dialog && [...dialog.querySelectorAll("[aria-label=Close i], [aria-label=close i], .ant-drawer-close, [class*=close i]")].find(visible);
    if (x) x.click();
    await sleep(300);
  };
  const modelItems = (provider) => {
    const seen = new Set();
    const out = [];
    for (const s of (provider.modelPicker && provider.modelPicker.items) || []) {
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
  const openPicker = async (provider) => {
    const btn = await waitFor(() => first((provider.modelPicker && provider.modelPicker.open) || []), 5000);
    if (!btn) throw new Error("model picker not found on the page (check the provider plugin's modelPicker selectors)");
    btn.click();
    for (let i = 0; i < 10 && !modelItems(provider).length; i++) await sleep(200);
  };
  const optionEl = (opt) => {
    const want = (opt.text || "").toLowerCase();
    const label = (el) => [textOf(el), el.getAttribute("aria-label"), el.getAttribute("title")].filter(Boolean).join(" ").toLowerCase();
    const ok = (el) => visible(el) && (!want || label(el).includes(want));
    return all(opt.selector || "button, [role=button]").find(ok) || (want ? all("button, [role=button], [role=switch], [role=checkbox], [role=menuitemcheckbox]").find(ok) : undefined);
  };
  const optionOn = (el) =>
    !!el && (el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-checked") === "true" || /(^|[\s_-])(active|selected|checked|on)([\s_-]|$)/i.test(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ""));
  const optionStates = (provider) => (provider.options || []).map((opt) => {
    const el = optionEl(opt);
    return { name: opt.name, found: !!el, on: optionOn(el) };
  });

  const builtin = {
    async models(m) {
      await openPicker(m.provider);
      const models = modelItems(m.provider).map((o) => o.name);
      await closePicker(m.provider);
      return { models, options: optionStates(m.provider), ...info(m.provider) };
    },
    async setModel(m) {
      await openPicker(m.provider);
      const want = m.model.toLowerCase();
      const item = modelItems(m.provider).find((o) => o.name.toLowerCase() === want) || modelItems(m.provider).find((o) => o.name.toLowerCase().includes(want));
      if (!item) {
        await closePicker(m.provider);
        throw new Error(`model "${m.model}" is not in the site's list`);
      }
      item.el.click();
      await sleep(600);
      if (modelItems(m.provider).length) await closePicker(m.provider); // a list that stays open covers the page
      return { options: optionStates(m.provider), ...info(m.provider) };
    },
    async setOption(m) {
      const opt = (m.provider.options || []).find((x) => x.name === m.name);
      const el = opt && optionEl(opt);
      if (!el) throw new Error(`option "${m.name}" not found on the page`);
      if (m.on === undefined || optionOn(el) !== !!m.on) el.click();
      await sleep(300);
      return { options: optionStates(m.provider), ...info(m.provider) };
    },
    info: (m) => info(m.provider),
    last: (m) => ({ raw: answerText(m.provider, lastReplyEl(m.provider)), thinking: mdOf(lastThinking(m.provider)), ...info(m.provider) }),
    list: (m) => ({ chats: list(m.provider), ...info(m.provider) }),
    // Page report: only a content script's own (the Page report plugin does the rest with "run").
    probe: () => ({}),
    // Run a plugin's code in the page: new Function("PP", "provider", code). Returns its object.
    run: async (m) => {
      const r = await new Function("PP", "provider", m.code)(helpers, m.provider);
      return r && typeof r === "object" ? r : { value: r };
    },
    cancel: () => ((cancelled = true), {}),
    // Earlier messages of the open chat, in page order: [{you, reply, thinking}].
    // The reply now on the page (or the one still coming): waits until it is finished.
    async follow(m) {
      const raw = await waitReply(m.provider, {}, m.idleMs || 0, m.maxMs || 0);
      const replyEl = lastReplyEl(m.provider);
      const thinkEl = nearThinking(m.provider, replyEl);
      const users = pickAll(m.provider.user);
      return { raw: answerText(m.provider, replyEl) || raw, thinking: mdOf(thinkEl), you: textOf(users[users.length - 1]), watch: lastWatch, ...info(m.provider) };
    },
    history: (m) => {
      const pick = pickAll;
      const users = pick(m.provider.user);
      const replies = pick(m.provider.reply).filter((r) => !users.some((u) => u.contains(r) || r.contains(u)));
      if (!users.length && !replies.length) throw new Error("no messages found on the page (the provider plugin may need 'user' selectors; try Copy page report)");
      const marks = [...users.map((el) => ({ el, you: true })), ...replies.map((el) => ({ el, you: false }))];
      marks.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const turns = [];
      for (const k of marks) {
        if (k.you) turns.push({ you: textOf(k.el), reply: "", thinking: "" });
        else {
          if (!turns.length || turns[turns.length - 1].reply) turns.push({ you: "", reply: "", thinking: "" });
          const t = turns[turns.length - 1];
          const th = nearThinking(m.provider, k.el);
          t.reply = answerText(m.provider, k.el);
          t.thinking = mdOf(th);
        }
      }
      return { turns, ...info(m.provider) };
    },
    async send(m) {
      const snap = snapshot(m.provider);
      const thinkBefore = thinkCount(m.provider);
      const old = oldErrors(m.provider);
      await typeInto(m.provider, m.text, snap, old);
      const raw = await waitReply(m.provider, snap, m.idleMs || 0, m.maxMs || 0, old);
      await sleep(300); // let the address update for a new chat
      const replyEl = lastReplyEl(m.provider);
      // Thinking: a new thinking block anywhere, or one sitting next to this reply.
      const thinkEl = thinkCount(m.provider) > thinkBefore ? lastThinking(m.provider) : nearThinking(m.provider, replyEl);
      return {
        raw: answerText(m.provider, replyEl) || raw,
        thinking: mdOf(thinkEl),
        watch: lastWatch,
        ...info(m.provider),
      };
    },
  };

  // A provider plugin may bring a script (its "contentScript" file). It runs here, in
  // the AI page, gets these helpers, and returns the commands it replaces:
  //   return { async send(text, provider) { ...; return { raw } }, last(provider), list(provider), info(provider) }
  // Commands it leaves out use the selector based defaults above.
  const helpers = { cancelled: () => cancelled, all, first, visible, sleep, textOf, typeInto, waitReply, snapshot, lastReply, lastReplyEl, lastThinking, answerText, toMarkdown: mdOf, list, info, status: (t, live) => status(t, live) };
  // Driver plugins (tag "driver") bring the same kind of script for every
  // provider (provider.drivers). Order: the provider's own script, then drivers (the last
  // installed wins), then the defaults above.
  const compiled = new Map(); // code -> commands
  const compile = (code) => {
    if (!compiled.has(code)) {
      if (compiled.size > 16) compiled.clear();
      compiled.set(code, new Function("PP", code)(helpers) || {});
    }
    return compiled.get(code);
  };
  const scriptFor = (provider) => {
    if (!provider) return {};
    const codes = [...(provider.drivers || []), ...(provider.contentScript ? [provider.contentScript] : [])];
    return codes.length ? Object.assign({}, ...codes.map(compile)) : {};
  };
  const handlers = {};
  for (const cmd of Object.keys(builtin)) {
    handlers[cmd] = async (m) => {
      const own = scriptFor(m.provider)[cmd];
      if (!own) return builtin[cmd](m);
      // A fresh chat may still be loading when the send arrives. The built-in send waits for the
      // box; a content script's own send asks for it at once, so wait here, once, for every provider.
      if (cmd === "send" && m.provider && m.provider.input && !(await waitFor(() => first(m.provider.input), 15000))) throw noBox();
      const r = cmd === "send" ? await own(m.text, m.provider, builtin.send.bind(null, m)) : await own(m.provider);
      if (cmd === "list") return { chats: Array.isArray(r) ? r : (r && r.chats) || [], ...info(m.provider) };
      return { ...info(m.provider), ...(r || {}) };
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
