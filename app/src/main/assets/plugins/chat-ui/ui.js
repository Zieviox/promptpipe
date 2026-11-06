"use strict";
// App part: the chat screen ("kind": "ui"). Everything you see: the header,
// messages, composer, drawer, sheets, search, command list and keys. It fills
// in the core's render, renderStatus, toast (optional), openSheet,
// rerenderSheet, closeDrawer, scrollDown, fillComposer and markUnseen.
// Replace it with your own UI plugin of id "chat-ui", or pick another
// "kind": "ui" plugin in Settings.

// ---------- look: UI scale and theme ----------
// Themes are plugins too ("kind": "theme" with a CSS file of colour variables).
const applyLook = () => {
  const ui = S.config.ui;
  document.body.style.zoom = String(ui.scale);
  document.documentElement.style.setProperty("--scale", String(ui.scale));
  let link = document.getElementById("theme-css");
  const p = S.plugins.get(ui.theme);
  const href = isTheme(p) && p.manifest.css ? pluginUrl(p.id, p.manifest.css) + "?t=" + Date.now() : "";
  if (!href) return link && link.remove();
  if (!link) document.head.append((link = h("link", { id: "theme-css", rel: "stylesheet" })));
  if (!link.href.startsWith(location.origin + href.split("?")[0])) link.href = href;
};
const setScale = (v) => {
  S.config.ui.scale = Math.round(Math.min(2, Math.max(0.6, v)) * 100) / 100;
  saveConfig();
  applyLook();
  rerenderSheet();
  toast("UI scale " + Math.round(S.config.ui.scale * 100) + "%");
};
const setTheme = (id) => {
  S.config.ui.theme = id;
  saveConfig();
  applyLook();
  render();
};

const openModels = () =>
  openSheet("Model", () => {
    const site = siteFor();
    const want = choicesFor();
    const box = h("div", { class: "models" }, h("p", { class: "muted" }, "Reading the site's model list…"));
    const draw = (r) => {
      const pick = async (m) => {
        want.model = m;
        saveConfig();
        try {
          const res = await siteCmd("setModel", { model: m });
          S.site.model = res.model;
          toast("Model: " + m);
        } catch (e) {
          toast(e.message, "error");
        }
        render();
      };
      box.replaceChildren(
        ...[r.models && r.models.length
          ? h("div", { class: "results" }, r.models.map((m) => h("button", { class: "menu-item" + (want.model === m ? " sel" : ""), onclick: () => pick(m) }, h("span", {}, m), r.model && r.model.includes(m) ? h("kbd", {}, "on page") : null)))
          : h("p", { class: "muted" }, "Couldn't read the model list from the site. Pick it on the site itself; the app then leaves the model alone."),
        h("p", { class: "muted" }, "On the page now: " + (r.model || "unknown")),
        h(
          "div",
          { class: "row" },
          h("button", { class: "small", title: "Show the AI page and pick the model there", onclick: () => ((want.model = ""), saveConfig(), closeSheet(), showSite()) }, "Choose on the site"),
          h("button", { class: "ghost", onclick: () => load() }, "Refresh"),
        ),
        want.model ? h("button", { class: "ghost", onclick: () => ((want.model = ""), saveConfig(), render()) }, "Don't choose a model (use whatever the site has)") : null,
        (site.switches || []).length ? h("h3", {}, "Switches") : null,
        ...(r.switches || []).map((sw) =>
          h(
            "label",
            { class: "field inline" },
            h("span", {}, sw.name + (sw.found ? "" : " (not found on page)")),
            h("input", {
              type: "checkbox",
              checked: sw.name in want.switches ? want.switches[sw.name] : sw.on,
              onchange: async (e) => {
                want.switches[sw.name] = e.target.checked;
                saveConfig();
                try {
                  await siteCmd("setSwitch", { name: sw.name, on: e.target.checked });
                } catch (err) {
                  toast(err.message, "error");
                }
              },
            }),
          ),
        ),
        h("p", { class: "muted" }, `Saved in profile “${profile().name}” and set on the page before each message.`),
        ].filter((x) => x != null),
      );
    };
    const load = () =>
      siteCmd("models")
        .then(draw)
        .catch((e) => siteCmd("info").then((r) => draw({ ...r, models: [], switches: (site.switches || []).map((x) => ({ name: x.name, found: true, on: false })) }), () => box.replaceChildren(h("p", { class: "error" }, e.message))));
    load();
    return [box];
  });


// Open a chat that exists on the AI site: its local file if there is one,
// otherwise a new local chat linked to it.
// Open any chat on the site by pasting its link.
const siteLinkRow = () => {
  const input = h("input", { class: "grow", type: "url", placeholder: "Paste a chat link", "data-keep": "sitelink", onkeydown: (e) => e.key === "Enter" && go() });
  const go = () => {
    const url = input.value.trim();
    if (!/^https?:\/\//.test(url)) return toast("Paste a chat link (https://…)", "error");
    openSiteChat({ url, title: S.siteChats.find((c) => sameUrl(c.url, url))?.title || url.replace(/^https?:\/\/[^/]+/, "") });
  };
  return h("div", { class: "row site-link" }, input, h("button", { class: "small", onclick: go }, "Open"));
};

const tagInput = (placeholder, onAdd, keep) =>
  h("input", {
    class: "tag-input",
    placeholder,
    list: "known-tags",
    "data-keep": keep,
    onkeydown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = e.target.value;
        e.target.value = "";
        onAdd(v).catch((err) => toast(err.message, "error"));
      } else if (e.key === "Escape") e.target.blur();
    },
  });

// ---------- rendering ----------

render = () => {
  const keepFocus = document.activeElement?.dataset?.keep;
  const draft = document.querySelector(".composer textarea")?.value;
  const listScroll = document.querySelector(".messages")?.scrollTop;
  const composer = renderComposer(draft);
  // Floats just above the composer; shows once you scroll up.
  composer.prepend(jumpButton());
  app.replaceChildren(...[safeBanner(), renderTop(), renderTagsRow(), renderMessages(), composer].filter(Boolean));
  if (S.drawer) app.append(h("div", { class: "scrim", onclick: closeDrawer }), renderDrawer());
  if (S.sheet) app.append(h("div", { class: "scrim", onclick: closeSheet }), renderSheet());
  if (listScroll != null) document.querySelector(".messages").scrollTop = listScroll;
  if (keepFocus) document.querySelector(`[data-keep="${keepFocus}"]`)?.focus();
};

const safeBanner = () =>
  SAFE ? h("div", { class: "safe-banner", role: "status" }, h("span", { class: "grow" }, "Safe mode: only built-in plugins are on."), h("button", { class: "small", onclick: () => restart(false) }, "Leave safe mode")) : null;

scrollDown = (smooth = false) => {
  const m = document.querySelector(".messages");
  if (m) m.scrollTo({ top: m.scrollHeight, behavior: smooth ? "smooth" : "auto" });
};
const nearBottom = () => {
  const m = document.querySelector(".messages");
  return !m || m.scrollHeight - m.scrollTop - m.clientHeight < 80;
};

// Replies never move the chat: you scroll. A new reply shows on the jump
// button ("1 new reply"); tapping it goes to the start of that reply.
S.unseen = [];
markUnseen = (chat, turn) => {
  if (S.chat !== chat) return;
  const i = chat.turns.indexOf(turn);
  if (i >= 0 && !S.unseen.includes(i)) S.unseen.push(i);
};
const jumpButton = () => {
  const n = S.unseen.length;
  return h(
    "button",
    {
      class: "jump" + (n ? " new show" : ""),
      title: n ? "Go to the new reply" : "Jump to the newest message",
      "aria-label": n ? `${n} new ${n === 1 ? "reply" : "replies"}` : "Jump to bottom",
      onclick: () => {
        if (S.unseen.length) {
          const i = Math.min(...S.unseen);
          S.unseen = [];
          document.getElementById("turn-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.querySelector(".jump")?.replaceWith(jumpButton());
        } else scrollDown(true);
      },
    },
    n ? `↓ ${n} new` : "↓",
  );
};
// Seen = scrolled into view.
const checkSeen = (box) => {
  if (!S.unseen.length) return;
  const bottom = box.getBoundingClientRect().bottom;
  const before = S.unseen.length;
  S.unseen = S.unseen.filter((i) => {
    const el = document.getElementById("turn-" + i)?.querySelector(".msg.ai");
    return !el || el.getBoundingClientRect().top > bottom - 60;
  });
  if (S.unseen.length !== before) document.querySelector(".jump")?.replaceWith(jumpButton());
};

renderStatus = () => {
  const el = document.querySelector(".site-dot");
  if (el) el.replaceWith(siteDot());
  const pr = document.querySelector(".composer .progress-text");
  if (pr) pr.textContent = composerProgress();
  renderLive();
};
// Under the message box: other work, and replies coming in other chats.
const composerProgress = () => {
  const others = Object.values(S.pageTurns).filter((t) => !S.chat?.turns.includes(t)).length;
  return [S.progress, others ? `${others} ${others === 1 ? "reply" : "replies"} coming in other chats` : ""].filter(Boolean).join(" · ");
};

// The waiting message: thinking (open) and the reply so far, as the page shows them.
const liveParts = (t) => {
  const L = t.live || {};
  return [
    L.thinking ? h("details", { class: "thinking live", open: true }, h("summary", {}, L.reply ? "Thought" : "Thinking…"), h("div", { class: "md", html: mdToHtml(L.thinking) })) : null,
    L.reply ? h("div", { class: "text md" }, h("div", { html: mdToHtml(L.reply) })) : null,
    h(
      "div",
      { class: "text muted progress-line" },
      t.progress || "…",
      t.page != null ? h("button", { class: "ghost small", title: "Stop waiting for this reply", onclick: () => api("/api/site", { cmd: "cancel", page: t.page }).catch((e) => toast(e.message, "error")) }, "Stop waiting") : null,
    ),
  ];
};
const renderLive = () => {
  if (!S.chat) return;
  document.querySelectorAll(".live-box").forEach((box) => {
    const t = S.chat.turns[+box.dataset.turn];
    if (!t || !t.pending) return;
    const wasOpen = box.querySelector("details.live")?.open;
    box.replaceChildren(...liveParts(t).filter(Boolean));
    const d = box.querySelector("details.live");
    if (d && wasOpen === false) d.open = false;
  });
};

const siteDot = () =>
  h(
    "button",
    { class: "site-dot " + (S.site.connected ? "on" : "off"), title: (S.site.url || "AI page") + " · Alt+S shows it", onclick: showSite },
    h("span", { class: "dot" }),
    siteFor()?.name || "No site",
  );

const renderTop = () => {
  const c = S.chat;
  const prof = profile();
  // Plugins that are on, minus one the profile is already named after.
  const active = activePlugins(prof).map((e) => pluginName(e.id)).filter((n) => n.toLowerCase() !== prof.name.toLowerCase());
  return h(
    "header",
    { class: "top" },
    h("button", { class: "icon", title: "Chats · Ctrl+B", "aria-label": "Chats", onclick: openDrawer }, h("span", { class: "burger" })),
    h(
      "div",
      { class: "titlebox" },
      h("button", { class: "title", title: "Chat info, tags, history · F2", onclick: renameChat }, c.meta.title || "New chat"),
      h(
        "div",
        { class: "sub" },
        siteDot(),
        h("button", { class: "model", title: "Choose model", onclick: openModels }, (choicesFor(prof).model || S.site.model || "Model") + " ▾"),
        h("span", { class: "sep" }, "·"),
        h("button", { class: "profile", title: "Profile · Ctrl+P switches", onclick: openProfileMenu }, prof.name, active.length ? h("span", { class: "faint" }, " " + active.join(" + ")) : null),
      ),
    ),
    ...topBlocks(),
    h("button", { class: "icon", title: "Search all chats · Ctrl+F", "aria-label": "Search", onclick: openSearch }, svgIcon("search")),
    h("button", { class: "icon", title: "Menu · Ctrl+K for commands", "aria-label": "Menu", onclick: openMenu }, svgIcon("more")),
  );
};

// Line icons, drawn with the text colour.
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  send: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
};
const svgIcon = (name) => {
  const span = h("span", { class: "svg", "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
};

const tagChip = (t, { onRemove, onBump, dim } = {}) =>
  h(
    "span",
    { class: "tag" + (counterOf(t) || t.endsWith("#") ? " counter" : "") + (dim ? " dim" : ""), title: dim ? "From the chat tags" : t.endsWith("#") ? "Each new message gets the next number" : "" },
    "#" + (t.endsWith("#") ? t + "n" : t),
    onBump && h("button", { title: "Next number", onclick: () => onBump().catch((e) => toast(e.message, "error")) }, "+1"),
    onRemove && h("button", { title: "Remove tag", "aria-label": "Remove " + t, onclick: () => onRemove().catch((e) => toast(e.message, "error")) }, "✕"),
  );

const renderTagsRow = () => {
  const c = S.chat;
  if (!c.meta.tags.length) return h("div", { class: "tags-row empty-row" });
  return h(
    "div",
    { class: "tags-row" },
    c.meta.tags.map((t) => tagChip(t, { onRemove: () => removeChatTag(c, t) })),
    tagInput("+ tag", (v) => addChatTag(c, v), "tag"),
    h("datalist", { id: "known-tags" }, knownTags().map((t) => h("option", { value: t }))),
  );
};

const renderMessages = () => {
  const c = S.chat;
  const box = h("main", { class: "messages" });
  if (!c.turns.length) {
    box.append(
      h(
        "div",
        { class: "empty" },
        siteFor()
          ? null
          : h(
              "div",
              { class: "no-site" },
              h("p", {}, "No AI site plugin yet. promptpipe drives the AI chat site you log in to, through a site plugin."),
              h("div", { class: "row" }, h("button", { class: "small primary", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file"), h("button", { class: "small", onclick: openPlugins }, "Install from a link"), h("button", { class: "small", onclick: openQuickStart }, "Quick start")),
            ),
        h("p", {}, c.meta.source ? "Linked to " + c.meta.source + ". Your message continues that chat." : "New chat"),
        c.meta.source ? h("button", { class: "small", onclick: importHistory }, "Import its earlier messages") : null,
        (local("recent") || []).length
          ? h("div", { class: "recent" }, h("p", { class: "faint" }, "Recent prompts"), (local("recent") || []).slice(0, 3).map((t) => h("button", { class: "recent-item", onclick: () => fillComposer(t) }, t.split("\n")[0].slice(0, 80))))
          : null,
        h("p", { class: "faint" }, "Keyboard: Ctrl+Enter send · Ctrl+K commands · Ctrl+B chats · Alt+S AI page"),
      ),
    );
  }
  c.turns.forEach((t, i) => {
    const extra = pluginTurnParts(c, t, i);
    box.append(...extra.before, renderTurn(c, t, i), ...extra.after);
  });
  (c.failed || []).forEach((f, i) =>
    box.append(
      h(
        "article",
        { class: "turn failed" },
        h("div", { class: "msg you" }, h("div", { class: "text" }, f.you)),
        h(
          "div",
          { class: "msg ai has-error" },
          h("div", { class: "error" }, "✕ Not sent: " + f.error),
          h(
            "div",
            { class: "msg-actions" },
            h("button", { class: "small primary", title: "The site may be answering anyway: wait for that reply and keep it", onclick: () => (c.failed.splice(i, 1), checkFailed(c, f)) }, "Check"),
            h("button", { class: "small", onclick: () => (c.failed.splice(i, 1), send(f.you)) }, "Retry"),
            h("button", { class: "ghost", onclick: () => (c.failed.splice(i, 1), render(), fillComposer(f.you)) }, "Edit"),
            h("button", { class: "ghost", onclick: () => (c.failed.splice(i, 1), render()) }, "Dismiss"),
          ),
        ),
      ),
    ),
  );
  // Queued: waiting for the message before them to be answered.
  const queued = c.queued || [];
  queued.forEach((q, i) =>
    box.append(
      h(
        "article",
        { class: "turn queued" },
        h("div", { class: "msg you" }, h("div", { class: "text" }, q.you)),
        h(
          "div",
          { class: "msg-actions queued-actions" },
          h("span", { class: "faint" }, `Queued ${i + 1} of ${queued.length} · goes out after the reply above`),
          i > 0 ? h("button", { class: "small", "aria-label": "Send earlier", onclick: () => ([queued[i - 1].you, q.you] = [q.you, queued[i - 1].you], render()) }, "↑") : null,
          h("button", { class: "small", onclick: () => (queued.splice(i, 1), render(), fillComposer(q.you)) }, "Edit"),
          h("button", { class: "ghost", onclick: () => (queued.splice(i, 1), render()) }, "Remove"),
        ),
      ),
    ),
  );
  box.addEventListener("scroll", () => {
    const far = box.scrollHeight - box.scrollTop - box.clientHeight > 300;
    document.querySelector(".jump")?.classList.toggle("show", far || S.unseen.length > 0);
    checkSeen(box);
  }, { passive: true });
  return box;
};

// renderTurn hook: a plugin draws something above or under a message (e.g. a
// divider). It returns a node / list of nodes (drawn above), or
// { before, after }. Errors show on the plugin, never break the chat.
const pluginTurnParts = (c, t, i) => {
  const out = { before: [], after: [] };
  const list = (x) => [].concat(x || []).filter((n) => n instanceof Node);
  for (const e of activePlugins()) {
    const p = S.plugins.get(e.id);
    if (typeof p.def.renderTurn !== "function") continue;
    try {
      const r = p.def.renderTurn(t, i, { chat: c, settings: settingsFor(e.id), turnData: t.data?.[e.id], h, render });
      if (r instanceof Node || Array.isArray(r)) out.before.push(...list(r));
      else if (r) out.before.push(...list(r.before)), out.after.push(...list(r.after));
    } catch (err) {
      p.error = "renderTurn: " + err.message;
    }
  }
  return out;
};

const renderTurn = (c, t, i) => {
  const transformed = t.sent !== t.you || t.raw !== t.reply;
  const trace = S.traces.get(t);
  const details = h(
    "details",
    { class: "trace" },
    h("summary", {}, "Trace"),
    ...(trace || [
      { label: "You", text: t.you },
      { label: "Sent", text: t.sent },
      { label: "Raw reply", text: t.raw },
      { label: "Shown", text: t.reply },
    ]).map((s) => h("div", { class: "stage" + (s.error ? " err" : "") }, h("b", {}, s.label + (s.notes && s.notes.length ? " (" + s.notes.join("; ") + ")" : "")), h("pre", {}, s.text))),
    t.notes && t.notes.length ? h("p", { class: "muted" }, t.notes.join(" · ")) : null,
  );
  const actions = [];
  for (const p of S.plugins.values()) {
    for (const a of p.def?.messageActions || []) {
      actions.push(
        h("button", {
          class: "ghost",
          onclick: async () => {
            const notes = [];
            try {
              t.reply = await a.run(t.raw, { chat: c, turn: t, settings: settingsFor(p.id), note: (m) => notes.push(m) });
              t.notes = [...(t.notes || []), ...notes.map((n) => `${pluginName(p.id)}: ${n}`)];
              delete t.error;
              render();
              if (c.path) await saveChat(c, `${a.label}: ${c.meta.title} (#${i + 1})`);
            } catch (e) {
              toast(a.label + ": " + e.message, "error");
            }
          },
        }, a.label),
      );
    }
  }
  const own = t.tags || [];
  const inherited = ChatFile.messageTags(c.meta, t).filter((x) => !own.includes(x));
  // Options under a reply are folded: one quiet line with its tags, time and ⋯.
  const open = S.openTurns.has(t);
  const toggleOpen = () => {
    open ? S.openTurns.delete(t) : S.openTurns.add(t);
    render();
  };
  const foot = t.pending
    ? null
    : h(
        "div",
        { class: "msg-foot" },
        open
          ? own.map((x) => tagChip(x, { onRemove: () => removeMessageTag(c, t, x), onBump: counterOf(x) ? () => addMessageTag(c, t, counterOf(x)[1] + "#") : null }))
          : own.map((x) => h("span", { class: "tag-text" + (counterOf(x) ? " counter" : "") }, "#" + x)),
        inherited.map((x) => h("span", { class: "tag-text dim", title: "From the chat tags" }, "#" + x)),
        open ? tagInput("+ tag", (v) => addMessageTag(c, t, v), "mtag" + i) : null,
        h("span", { class: "time" }, ChatFile.stamp(t.at)),
        h("button", { class: "ghost more" + (open ? " open" : ""), title: open ? "Fold options" : "Copy, trace, tags, plugin actions", "aria-expanded": String(open), "aria-label": "Message options", onclick: toggleOpen }, svgIcon("more")),
      );
  const you = h("div", { class: "msg you", title: ChatFile.stamp(t.at) }, h("div", { class: "text" }, t.you));
  const art = h(
    "article",
    { class: "turn" + (S.highlight === i ? " hit" : ""), id: "turn-" + i },
    you,
    h(
      "div",
      { class: "msg ai" + (t.error ? " has-error" : "") },
      h("div", { class: "who" }, c.meta.ai || "AI", transformed ? h("span", { class: "piped", title: "Went through plugins; see Trace" }, "piped") : null, t.profile ? h("span", { class: "faint" }, t.profile) : null),
      t.thinking
        ? h("details", { class: "thinking", open: S.thinkingOpen }, h("summary", { title: "Tap to fold or unfold · Ctrl+/ for all" }, t.secs != null ? `Thought for ${t.secs}s` : "Thinking"), h("div", { class: "md", html: mdToHtml(t.thinking) }))
        : null,
      t.pending
        ? h("div", { class: "live-box", "data-turn": i }, ...liveParts(t).filter(Boolean))
        : h("div", { class: "text md", html: mdToHtml(t.reply) }),
      t.error ? h("div", { class: "error" }, "✕ " + t.error) : null,
      foot,
      t.pending || !open
        ? null
        : h(
            "div",
            { class: "msg-actions" },
            h("button", { class: "ghost", onclick: () => navigator.clipboard.writeText(t.reply).then(() => toast("Copied")) }, "Copy"),
            h("button", { class: "ghost", title: "Open the text in a box where you can pick any part of it", onclick: () => openSelect(t) }, "Select text"),
            h("button", { class: "ghost", title: "Quote this reply in your next message (or swipe it right)", onclick: () => fillComposer(quote(t.reply), "append") }, "Reply"),
            i === c.turns.length - 1 ? h("button", { class: "ghost", title: "Put your message back in the box", onclick: editLast }, "Edit & resend") : null,
            t.thinking ? h("button", { class: "ghost", onclick: () => navigator.clipboard.writeText(t.thinking).then(() => toast("Copied")) }, "Copy thinking") : null,
            ...actions,
            details,
          ),
    ),
  );
  const ai = art.querySelector(".msg.ai");
  onSwipe(ai, (dir) => (dir > 0 ? fillComposer(quote(t.reply), "append") : navigator.clipboard.writeText(t.reply).then(() => toast("Copied"))));
  codeCopy(ai);
  return art;
};

// Swipe a reply right to quote it, left to copy it.
const onSwipe = (el, fn) => {
  let x0 = null, y0 = 0;
  const selecting = () => !!String(window.getSelection() || "").trim();
  el.addEventListener("touchstart", (e) => (selecting() ? (x0 = null) : ((x0 = e.touches[0].clientX), (y0 = e.touches[0].clientY))), { passive: true });
  el.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    if (selecting()) return void (x0 = null, (el.style.transform = ""));
    const dx = e.touches[0].clientX - x0;
    if (Math.abs(e.touches[0].clientY - y0) > 40) return void (x0 = null, (el.style.transform = ""));
    el.style.transform = `translateX(${Math.max(-60, Math.min(60, dx / 2))}px)`;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    const dx = x0 == null ? 0 : e.changedTouches[0].clientX - x0;
    el.style.transform = "";
    x0 = null;
    if (Math.abs(dx) > 90) fn(Math.sign(dx));
  });
};

const onLongPress = (el, fn) => {
  let timer = 0;
  const cancel = () => clearTimeout(timer);
  el.addEventListener("touchstart", () => (timer = setTimeout(fn, 550)), { passive: true });
  el.addEventListener("touchmove", cancel, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("contextmenu", (e) => (e.preventDefault(), fn()));
};

// Code blocks get a Copy button (long-press is left to text selection).
const codeCopy = (root) => {
  for (const pre of root.querySelectorAll(".md pre")) {
    const copy = () => navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent).then(() => toast("Code copied"));
    pre.prepend(h("button", { class: "code-copy", onclick: copy }, "Copy"));
  }
};

// Plugin blocks: a switch per plugin (its own block if it draws one).
// Blocks marked advanced sit in the Advanced row, which is folded but always shown.
const blockFor = (e, n) => {
  const p = S.plugins.get(e.id);
  const label = p.manifest.block?.label || p.manifest.name || p.id;
  const on = stepOn(e.id);
  const toggle = () => {
    setStepOn(e.id, !on);
    render();
  };
  const pill = (text) =>
    h(
      "span",
      { class: "pill " + (on ? "on" : "off") + (p.error ? " broken" : "") },
      h("button", { class: "pill-main", "aria-pressed": String(on), title: (n <= 9 ? `Alt+${n} toggles. ` : "") + (p.manifest.description || ""), onclick: toggle }, h("span", { class: "dot" }), text ?? label),
      h("button", { class: "pill-gear", title: "Settings", "aria-label": label + " settings", onclick: () => openPluginSettings(e.id) }, svgIcon("gear")),
    );
  if (p.def && typeof p.def.renderBlock === "function") {
    try {
      const el = p.def.renderBlock({ settings: settingsFor(e.id), set: (k, v) => setSetting(e.id, k, v), on, toggle, pill, openSettings: () => openPluginSettings(e.id), chat: S.chat });
      if (el instanceof Node) return el;
    } catch (err) {
      p.error = "renderBlock: " + err.message;
    }
  }
  return pill();
};

// In the order of the preset's rows (plugins without a row come last).
const blockEntries = (place) => {
  const rows = presetOf()?.rows || [];
  const at = (id) => {
    const i = rows.findIndex((r) => r.type === "step" && r.plugin === id);
    return i < 0 ? 1e9 : i;
  };
  return profile()
    .plugins.filter((e) => {
      const p = S.plugins.get(e.id);
      if (!isStep(p) || p.manifest.block === false) return false;
      return (p.manifest.block?.place || "toggles") === place;
    })
    .sort((a, b) => at(a.id) - at(b.id));
};

// The preset chip (opens the pipeline) and a chip per group (its switch).
const presetChips = () => {
  const pre = presetOf();
  if (!pre) return [];
  return [
    h("span", { class: "pill preset on" },
      h("button", { class: "pill-main", title: "The pipeline: what goes with your message", onclick: openPipeline }, svgIcon("layers"), pre.name)),
    ...(pre.groups || []).map((g) =>
      h("span", { class: "pill group " + (g.on !== false ? "on" : "off") },
        h("button", { class: "pill-main", "aria-pressed": String(g.on !== false), title: "Turns every row of this group on or off", onclick: () => ((g.on = g.on === false), saveConfig(), render()) }, h("span", { class: "dot" }), g.name))),
  ];
};

const topBlocks = () => blockEntries("top").map((e, i) => blockFor(e, 99));

const renderBlocks = () => {
  const entries = blockEntries("toggles");
  const main = entries.filter((e) => !S.plugins.get(e.id).manifest.advanced);
  const adv = entries.filter((e) => S.plugins.get(e.id).manifest.advanced);
  let n = 0;
  const row = h("div", { class: "blocks" }, presetChips(), main.map((e) => blockFor(e, ++n)));
  if (adv.length) {
    row.append(
      h("button", { class: "adv-toggle", "aria-expanded": String(S.advOpen), title: "Ctrl+Shift+A", onclick: toggleAdvanced }, `Advanced ${adv.length} ${S.advOpen ? "▾" : "▸"}`),
    );
  }
  const wrap = h("div", { class: "blocks-wrap" }, row);
  if (adv.length && S.advOpen) wrap.append(h("div", { class: "blocks adv" }, adv.map((e) => blockFor(e, ++n))));
  return wrap;
};

const toggleAdvanced = () => {
  S.advOpen = !S.advOpen;
  local("advOpen", S.advOpen);
  render();
};

const renderComposer = (draft) => {
  const ta = h("textarea", {
    "data-keep": "composer",
    placeholder: S.chat.turns.length ? "Message" : "Start a chat",
    rows: 1,
    value: draft ?? local("draft") ?? "",
    oninput: (e) => {
      local("draft", e.target.value);
      grow(e.target);
    },
    onkeydown: (e) => {
      const enterSends = S.config.ui.enterSends;
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey || (enterSends && !e.shiftKey))) {
        e.preventDefault();
        send();
      }
    },
  });
  setTimeout(() => grow(ta), 0);
  return h(
    "footer",
    { class: "composer" + (S.expanded ? " expanded" : "") },
    renderBlocks(),
    h(
      "div",
      { class: "inputbox" },
      ta,
      h("div", { class: "input-side" },
        h("button", { class: "ghost expand", onclick: toggleExpand, title: (S.expanded ? "Shrink" : "Expand") + " the message box · Ctrl+E", "aria-label": S.expanded ? "Shrink message box" : "Expand message box", "aria-pressed": String(!!S.expanded) }, S.expanded ? "⤡" : "⤢"),
        h("button", { class: "send", onclick: send, title: "Send · Ctrl+Enter", "aria-label": "Send" }, svgIcon("send"))),
    ),
    h(
      "div",
      { class: "progress" },
      h("span", { class: "progress-text" }, composerProgress()),
    ),
  );
};

// Expand mode: the message box takes most of the screen for long text.
const toggleExpand = () => {
  S.expanded = !S.expanded;
  render();
  const ta = document.querySelector(".composer textarea");
  if (ta) {
    ta.focus();
    grow(ta);
  }
};

const grow = (ta) => {
  if (S.expanded) return void (ta.style.height = "");
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + "px";
};

const send = async (retryText) => {
  const ta = document.querySelector(".composer textarea");
  const text = (typeof retryText === "string" ? retryText : ta.value).trim();
  if (!text) return toast("Type a message first");
  const chat = S.chat;
  if (typeof retryText !== "string") {
    ta.value = "";
    local("draft", "");
  }
  rememberPrompt(text);
  // Your own message: show it going out. The reply then waits for you to look.
  setTimeout(() => scrollDown(true), 0);
  try {
    await runChat(chat, text);
    if (S.chat === chat) render();
  } catch (e) {
    if (!e.quiet) toast("Not sent: " + e.message, "error");
    if (S.chat === chat) render();
  }
};

// Check: the send looked failed but the site is answering. Take that reply for this message.
const checkFailed = async (c, f) => {
  try {
    await runChat(c, f.you, profile(), true, f.page);
  } catch (e) {
    toast("Check: " + e.message, "error");
    if (S.chat === c) render();
  }
};

// Add the newest reply on the site page to this chat, as a message.
const addFromPage = async () => {
  try {
    await runChat(S.chat, "", profile(), true);
    toast("Added the page's newest reply");
  } catch (e) {
    toast(e.message, "error");
  }
};

// Put text into the message box (edit and resend, reply, recent prompts, share).
fillComposer = (text, mode = "replace") => {
  const ta = document.querySelector(".composer textarea");
  if (!ta) return;
  ta.value = mode === "append" && ta.value.trim() ? ta.value.replace(/\s+$/, "") + "\n\n" + text : text;
  local("draft", ta.value);
  grow(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
};
const quote = (text) => text.trim().split("\n").slice(0, 6).map((l) => "> " + l).join("\n") + (text.trim().split("\n").length > 6 ? "\n> …" : "") + "\n\n";
const editLast = () => {
  const c = S.chat;
  const last = c.failed?.length ? c.failed[c.failed.length - 1].you : c.turns[c.turns.length - 1]?.you;
  if (!last) return toast("No message to edit");
  fillComposer(last);
  toast("Edit it and send again (the site keeps the old one)");
};

// ---------- chat list (drawer) ----------
const openDrawer = () => {
  S.drawer = true;
  history.pushState({ layer: "drawer" }, "");
  render();
  setTimeout(() => document.querySelector(".drawer input")?.focus(), 0);
};
closeDrawer = () => {
  if (!S.drawer) return;
  S.drawer = false;
  if (history.state?.layer === "drawer") history.back();
  render();
};

const matches = (c) => {
  const q = S.query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((w) =>
    w.startsWith("#") ? c.meta.tags.some((t) => t.toLowerCase().startsWith(w.slice(1))) : (c.meta.title || "").toLowerCase().includes(w) || c.meta.tags.some((t) => t.toLowerCase().includes(w)),
  );
};

const isPinned = (path) => (S.config.pinned || []).includes(path);
const togglePin = (path) => {
  const p = new Set(S.config.pinned || []);
  p.has(path) ? p.delete(path) : p.add(path);
  S.config.pinned = [...p];
  saveConfig();
  render();
};
const dayGroup = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return isNaN(days) ? "Older" : days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "This week" : days < 31 ? "This month" : "Older";
};

const chatRow = (c) => {
  const row = h(
    "div",
    { class: "chat-row" + (S.chat.path === c.path ? " current" : "") },
    h(
      "button",
      { class: "chat-open", onclick: () => openChat(c.path).catch((e) => toast(e.message, "error")) },
      h("span", { class: "chat-title" }, (isPinned(c.path) ? "📌 " : "") + (c.meta.title || c.path)),
      h("span", { class: "chat-sub" }, [ChatFile.stamp(c.meta.updated), ...c.meta.tags.map((t) => "#" + t)].join("  ")),
    ),
    h("button", { class: "icon", title: "Chat actions (or long-press)", "aria-label": "Actions for " + c.meta.title, onclick: () => openChatActions(c) }, "⋯"),
  );
  onLongPress(row, () => openChatActions(c));
  return row;
};

const renderDrawer = () => {
  const list = h("div", { class: "chat-list" });
  const shown = S.chats.filter(matches);
  const folderOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const folders = [...new Set([...S.folders, ...S.chats.map((c) => folderOf(c.path)).filter(Boolean)])].sort();
  const searching = !!S.query.trim();
  // Pinned chats, then top level chats by day, then each folder (nested folders indent).
  const pinned = shown.filter((c) => isPinned(c.path));
  if (pinned.length) list.append(h("div", { class: "group" }, "Pinned"), ...pinned.map(chatRow));
  let group = "";
  for (const c of shown.filter((c) => !folderOf(c.path) && !isPinned(c.path))) {
    const g = dayGroup(c.meta.updated);
    if (g !== group) list.append(h("div", { class: "group" }, (group = g)));
    list.append(chatRow(c));
  }
  for (const f of folders) {
    const parent = folderOf(f);
    if (parent && !S.openFolders.has(parent) && !searching) continue;
    const inside = shown.filter((c) => folderOf(c.path) === f);
    if (searching && !inside.length) continue;
    const open = searching || S.openFolders.has(f);
    list.append(
      h(
        "div",
        { class: "folder-row", style: `padding-left:${(f.split("/").length - 1) * 14}px` },
        h(
          "button",
          {
            class: "folder" + (S.folder === f ? " current" : ""),
            "aria-expanded": String(open),
            onclick: () => {
              open ? S.openFolders.delete(f) : S.openFolders.add(f);
              S.folder = f;
              local("openFolders", [...S.openFolders]);
              render();
            },
          },
          (open ? "▾ " : "▸ ") + f.split("/").pop(),
          h("span", { class: "muted" }, ` ${inside.length}`),
        ),
        h("button", { class: "small", title: "New chat in this folder", onclick: () => startNewChat(f) }, "+"),
      ),
    );
    if (open) for (const c of inside) list.append(h("div", { style: `padding-left:${f.split("/").length * 14}px` }, chatRow(c)));
  }
  const siteList = h(
    "div",
    { class: "site-list" },
    h(
      "div",
      { class: "row" },
      h("b", {}, "On " + (siteFor()?.name || "the AI site")),
      h("button", { class: "small", onclick: refreshSiteChats }, "Refresh"),
    ),
    S.siteChats.length
      ? S.siteChats.map((c) => h("button", { class: "site-chat", onclick: () => openSiteChat(c) }, (S.chats.some((x) => sameUrl(x.meta.source, c.url)) ? "✓ " : "↗ ") + c.title))
      : h("p", { class: "muted" }, "Tap Refresh to list the chats from the site's sidebar."),
    siteLinkRow(),
  );
  return h(
    "aside",
    { class: "drawer", role: "dialog", "aria-label": "Chats" },
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", onclick: () => startNewChat(), title: "Ctrl+N" }, "+ New chat" + (S.folder ? " in " + S.folder : "")),
      h("button", { onclick: promptFolder }, "+ Folder"),
      h("button", { class: "icon", onclick: closeDrawer, "aria-label": "Close" }, "✕"),
    ),
    h("input", {
      type: "search",
      "data-keep": "search",
      placeholder: "Search titles, #tag",
      value: S.query,
      oninput: (e) => {
        S.query = e.target.value;
        render();
      },
      onkeydown: (e) => {
        if (e.key === "Enter") document.querySelector(".chat-list .chat-open")?.click();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          document.querySelector(".chat-list button")?.focus();
        }
      },
    }),
    h("div", { class: "row muted" }, "New chats go to: ", h("b", {}, S.folder || "top level"), S.folder ? h("button", { class: "small", onclick: () => ((S.folder = ""), render()) }, "use top level") : null),
    list,
    siteList,
  );
};

const refreshSiteChats = async () => {
  try {
    const r = await siteCmd("list");
    S.siteChats = r.chats || [];
    if (!S.siteChats.length) toast("No chats found in the site's sidebar (open it once with Alt+S?)");
    render();
  } catch (e) {
    toast(e.message, "error");
  }
};

const promptFolder = () => {
  openSheet("New folder", () => {
    const input = h("input", { placeholder: "Folder name (use / for subfolders)", value: S.folder ? S.folder + "/" : "" });
    const go = () => makeFolder(input.value).then(closeSheet);
    input.onkeydown = (e) => e.key === "Enter" && go();
    autofocus(input);
    return [input, h("div", { class: "row" }, h("button", { class: "primary", onclick: go }, "Create"))];
  });
};

const openChatActions = (c) => {
  const folders = [...new Set(S.folders)].sort();
  openSheet(c.meta.title || c.path, () => {
    const sel = h("select", {}, h("option", { value: "" }, "(top level)"), folders.map((f) => h("option", { value: f, selected: c.path.startsWith(f + "/") && !c.path.slice(f.length + 1).includes("/") }, f)));
    return [
      h("p", { class: "muted" }, c.path),
      h("div", { class: "row" }, h("span", {}, "Move to"), sel, h("button", { onclick: () => moveChat(c, sel.value).then(closeSheet) }, "Move")),
      h(
        "div",
        { class: "row" },
        h("button", { onclick: () => openChat(c.path).then(closeSheet) }, "Open"),
        h("button", { onclick: () => (togglePin(c.path), closeSheet()) }, isPinned(c.path) ? "Unpin" : "Pin"),
        c.meta.source ? h("button", { onclick: () => api("/api/app/action", { action: "openUrl", url: c.meta.source }) }, "Open source in browser") : null,
        h(
          "button",
          {
            class: "danger",
            onclick: async () => {
              if (await askConfirm(`Delete "${c.meta.title}"? It stays in git history.`)) deleteChat(c.path).then(closeSheet);
            },
          },
          "Delete",
        ),
      ),
    ];
  });
};

// Chat info (tap the title, F2): name, chat tags, file and its history.
const renameChat = () => {
  const c = S.chat;
  openSheet("Chat", () => {
    const input = h("input", { value: c.meta.title, "aria-label": "Chat name" });
    const save = async () => {
      const t = input.value.trim();
      if (!t || t === c.meta.title) return;
      c.meta.title = t;
      if (c.path) await saveChat(c, "rename: " + c.meta.title);
      render();
    };
    input.onkeydown = (e) => e.key === "Enter" && (e.preventDefault(), save());
    input.onblur = save;
    autofocus(input, true);
    const log = h("div", { class: "log muted" }, c.path ? "Loading…" : "Not saved yet.");
    if (c.path)
      api("/api/git/log?path=" + encodeURIComponent(c.path))
        .then((r) => log.replaceChildren(...(r.log.length ? r.log.map((x) => h("div", {}, h("code", {}, x.id), " ", ChatFile.stamp(new Date(x.time).toISOString()), " ", x.message)) : ["No commits yet."])))
        .catch((e) => (log.textContent = e.message));
    return [
      input,
      h("h3", {}, "Chat tags"),
      h("p", { class: "muted" }, "Every message in this chat gets these. name# gives each new message the next number."),
      h(
        "div",
        { class: "tags-row in-sheet" },
        c.meta.tags.map((t) => tagChip(t, { onRemove: () => removeChatTag(c, t).then(rerenderSheet) })),
        tagInput("+ tag", (v) => addChatTag(c, v).then(rerenderSheet), "sheet-tag"),
        h("datalist", { id: "known-tags" }, knownTags().map((t) => h("option", { value: t }))),
      ),
      h("h3", {}, "Source"),
      h("p", { class: "muted" }, c.meta.source ? h("a", { href: c.meta.source }, c.meta.source) : "Not linked to a site chat yet.", c.meta.ai ? ` · ${c.meta.ai}` : "", c.meta.model ? ` · ${c.meta.model}` : ""),
      h("h3", {}, "File"),
      h("p", { class: "muted" }, h("code", {}, c.path || "(saved after the first message)")),
      h("h3", {}, "History"),
      log,
    ];
  });
};

// ---------- asking ----------
// The app's own confirm and text prompt (the app's browser has none of its own).
// askUser(message, { value, ok, danger }) resolves to true / the text, or null on Cancel.
const askUser = (message, { value = null, ok = "OK", danger = false } = {}) =>
  new Promise((done) => {
    const input = value === null ? null : h("input", { value, "aria-label": message });
    const finish = (v) => (wrap.remove(), done(v));
    const yes = () => finish(input ? input.value.trim() || null : true);
    const wrap = h("div", { class: "ask-wrap" },
      h("div", { class: "scrim", onclick: () => finish(null) }),
      h("div", { class: "ask", role: "alertdialog", "aria-label": message },
        h("p", {}, message),
        input,
        h("div", { class: "row" },
          h("button", { class: "grow", onclick: () => finish(null) }, "Cancel"),
          h("button", { class: "grow " + (danger ? "danger" : "primary"), onclick: yes }, ok))));
    if (input) input.addEventListener("keydown", (e) => e.key === "Enter" && yes());
    wrap.addEventListener("keydown", (e) => e.key === "Escape" && finish(null));
    document.body.append(wrap);
    (input || wrap.querySelector(".ask button:last-child")).focus();
  });
const askConfirm = (message, ok = "Delete") => askUser(message, { ok, danger: true });
const askText = (message, value = "", ok = "OK") => askUser(message, { value, ok });
PP.confirm = askConfirm;
PP.askText = askText;

// ---------- sheets ----------
openSheet = (title, renderFn) => {
  if (history.state?.layer !== "sheet") history.pushState({ layer: "sheet" }, "");
  S.sheet = { title, render: renderFn };
  render();
};
const closeSheet = () => {
  if (!S.sheet) return;
  S.sheet = null;
  if (history.state?.layer === "sheet") history.back();
  render();
};
// Back (phone button or browser) closes the top layer: sheet, then drawer.
window.addEventListener("popstate", () => {
  const layer = history.state?.layer;
  const before = !!S.sheet + 2 * S.drawer;
  if (layer !== "sheet") S.sheet = null;
  if (layer !== "sheet" && layer !== "drawer") S.drawer = false;
  if (before !== !!S.sheet + 2 * S.drawer) render();
});

const renderSheet = () =>
  h(
    "section",
    { class: "sheet", role: "dialog", "aria-label": S.sheet.title },
    h("div", { class: "row sheet-head" }, h("h2", {}, S.sheet.title), h("button", { class: "icon", onclick: closeSheet, "aria-label": "Close (Esc)" }, "✕")),
    h("div", { class: "sheet-body" }, S.sheet.render()),
  );

rerenderSheet = () => S.sheet && render();

// Focus a sheet's field when the sheet opens, not again on later redraws.
const autofocus = (input, select) => {
  if (!S.sheet || S.sheet.focused) return;
  S.sheet.focused = true;
  setTimeout(() => (select ? input.select() : input.focus()), 0);
};

// Run a command picked in a sheet (menu, palette); it may open the next sheet.
const runFromSheet = (c) => {
  S.sheet = null;
  c.run();
  if (!S.sheet && history.state?.layer === "sheet") history.back();
  render();
};

// Settings form built from a plugin's manifest.
const settingsForm = (id) => {
  const man = S.plugins.get(id).manifest;
  const cur = settingsFor(id);
  const out = [];
  for (const [k, d] of Object.entries(man.settings || {})) {
    if (d.type === "hidden") continue; // kept by the plugin itself
    let input;
    const set = (v) => setSetting(id, k, v);
    if (d.type === "bool") input = h("input", { type: "checkbox", checked: !!cur[k], onchange: (e) => (set(e.target.checked), render()) });
    else if (d.type === "select") {
      const opts = Array.isArray(d.options) ? d.options.map((o) => [o, o]) : Object.entries(d.options || {});
      input = h("select", { onchange: (e) => set(e.target.value) }, opts.map(([v, l]) => h("option", { value: v, selected: v === cur[k] }, l)));
    } else if (d.type === "textarea") input = h("textarea", { rows: 5, value: cur[k] ?? "", oninput: (e) => set(e.target.value) });
    else input = h("input", { type: d.type === "number" ? "number" : "text", value: cur[k] ?? "", oninput: (e) => set(d.type === "number" ? Number(e.target.value) : e.target.value) });
    out.push(h("label", { class: "field" + (d.type === "bool" ? " inline" : "") }, h("span", {}, d.label || k), input, d.help ? h("small", { class: "muted" }, d.help) : null));
  }
  if (!out.length) out.push(h("p", { class: "muted" }, "This plugin has no settings."));
  return out;
};

const openPluginSettings = (id) => {
  const p = S.plugins.get(id);
  openSheet(`${p.manifest?.name || id} · ${profile().name}`, () => [
    h("p", { class: "muted" }, p.manifest?.description || ""),
    p.error ? h("p", { class: "error" }, "✕ " + p.error) : null,
    isSite(p) ? null : h("label", { class: "field inline" }, h("span", {}, `On in the preset “${presetOf()?.name || "?"}”`), h("input", { type: "checkbox", checked: stepOn(id), onchange: (e) => (setStepOn(id, e.target.checked), render()) })),
    ...settingsForm(id),
    h("p", { class: "muted" }, "Settings are saved per profile; the switch and the order are the preset's (Pipeline)."),
  ]);
};

// The pipeline: the profile's preset, its rows in the order they are sent,
// groups with one switch each, and a preview of what goes out.
let pipeOpen = null; // the row whose details are unfolded
const openPipeline = () =>
  openSheet("Pipeline", () => {
    const prof = profile();
    const pre = presetOf(prof);
    const P = PP.pipeline;
    if (!pre) return [h("p", { class: "muted" }, "No presets yet.")];
    const redraw = () => (saveConfig(), rerenderSheet(), render());
    const groupSelect = (r) =>
      h("label", { class: "field" }, h("span", {}, "Group"),
        h("select", { onchange: (e) => ((r.group = e.target.value), redraw()) },
          h("option", { value: "", selected: !r.group }, "No group"),
          (pre.groups || []).map((g) => h("option", { value: g.id, selected: r.group === g.id }, g.name))));
    const details = (r, i) => {
      if (r.type === "piece")
        return h("div", { class: "pipe-details" },
          h("label", { class: "field" }, h("span", {}, "Name"), h("input", { value: r.name || "", oninput: (e) => ((r.name = e.target.value), saveConfig()) })),
          h("label", { class: "field" }, h("span", {}, "Text"), h("textarea", { rows: 6, value: r.text || "", placeholder: "What to send. Empty pieces aren't sent.", oninput: (e) => ((r.text = e.target.value), saveConfig()) })),
          h("label", { class: "field" }, h("span", {}, "Send it"),
            h("select", { onchange: (e) => ((r.when = e.target.value), redraw()) }, Object.entries(P.WHEN).map(([v, l]) => h("option", { value: v, selected: (r.when || "every") === v }, l)))),
          r.when === "everyN" ? h("label", { class: "field" }, h("span", {}, "N (the first message of a site chat always gets it)"), h("input", { type: "number", min: 1, value: r.n || 5, oninput: (e) => ((r.n = Math.max(1, +e.target.value || 1)), saveConfig()) })) : null,
          groupSelect(r),
          h("div", { class: "row" },
            h("button", { class: "small", onclick: () => navigator.clipboard.writeText(r.text || "").then(() => toast("Copied")) }, "Copy text"),
            h("button", { class: "small danger", onclick: async () => {
              if (!(await askConfirm(`Delete the piece “${rowName(r)}”?`))) return;
              pre.rows.splice(i, 1);
              pipeOpen = null;
              redraw();
            } }, "Delete piece")));
      if (r.type === "step") {
        const p = S.plugins.get(r.plugin);
        const own = p?.def && typeof p.def.piece === "function";
        return h("div", { class: "pipe-details" },
          h("p", { class: "muted" }, p ? p.manifest.description || "" : "This plugin isn't installed, so the row is skipped."),
          p?.def && typeof p.def.beforeSend === "function" && !own
            ? h("label", { class: "field" }, h("span", {}, "It changes"),
                h("select", { onchange: (e) => ((r.scope = e.target.value), redraw()) },
                  h("option", { value: "above", selected: r.scope !== "message" }, "Everything above it"),
                  h("option", { value: "message", selected: r.scope === "message" }, "Only your message")))
            : own ? h("p", { class: "muted" }, "Its text goes where this row is.") : h("p", { class: "muted" }, "It doesn't change the message (it works on replies or chats), so its place doesn't matter."),
          groupSelect(r),
          p ? h("div", { class: "row" }, h("button", { class: "small", onclick: () => openPluginSettings(r.plugin) }, "Plugin settings")) : null);
      }
      return h("div", { class: "pipe-details" }, h("p", { class: "muted" }, "Your message goes here. Move it to put pieces before or after it."));
    };
    const rowEl = (r, i) => {
      const live = r.type === "message" || P.rowLive(pre, r);
      const g = r.group && (pre.groups || []).find((x) => x.id === r.group);
      const sub = r.type === "piece" ? whenLabel(r) + (!(r.text || "").trim() ? " · empty, not sent" : "")
        : r.type === "step" ? (S.plugins.get(r.plugin) ? "Step" + (r.scope === "message" ? " · your message only" : "") : "Step · not installed")
        : "Where your message goes";
      const open = pipeOpen === r;
      return h("div", { class: "pipe-row" + (r.type === "message" ? " anchor" : "") + (live ? "" : " off") + (open ? " open" : "") },
        h("div", { class: "pipe-head" },
          r.type === "message"
            ? h("span", { class: "pipe-anchor-dot", "aria-hidden": "true" })
            : h("input", { type: "checkbox", checked: r.on !== false, "aria-label": "On", onchange: (e) => ((r.on = e.target.checked), redraw()) }),
          h("button", { class: "ghost grow pipe-name", "aria-expanded": String(open), onclick: () => ((pipeOpen = open ? null : r), rerenderSheet()) },
            h("b", {}, rowName(r)), h("small", { class: "muted" }, sub + (g ? ` · ${g.name}${g.on === false ? " (off)" : ""}` : "")), h("span", { class: "chev" }, open ? "▾" : "›")),
          h("button", { class: "small", "aria-label": "Move up", disabled: i === 0, onclick: () => (P.moveRow(pre, i, -1), rerenderSheet(), render()) }, "↑"),
          h("button", { class: "small", "aria-label": "Move down", disabled: i === pre.rows.length - 1, onclick: () => (P.moveRow(pre, i, 1), rerenderSheet(), render()) }, "↓")),
        open ? details(r, i) : null);
    };
    const addPiece = (name = "", text = "") => {
      const at = pre.rows.findIndex((r) => r.type === "message");
      const r = P.piece(name || "New piece", text);
      pre.rows.splice(Math.max(0, at), 0, r);
      pipeOpen = r;
      redraw();
    };
    const fromLibrary = async () => {
      const lib = await P.promptLibrary();
      if (!lib.length) return toast("Your system prompt library is empty");
      openSheet("Add a piece from your library", () => [
        h("p", { class: "muted" }, "A copy goes into this preset, before your message."),
        ...lib.map((x) => h("div", { class: "plugin-row" },
          h("div", { class: "grow" }, h("b", {}, x.name || x.text.trim().split("\n")[0].slice(0, 40)), h("div", { class: "muted" }, x.text.length > 160 ? x.text.slice(0, 160) + "…" : x.text)),
          h("button", { class: "small primary", onclick: () => (closeSheet(), openPipeline(), addPiece(x.name || "", x.text)) }, "Add"))),
      ]);
    };
    let first = true;
    const preview = h("pre", { class: "pipe-preview" });
    const showPreview = () => (preview.textContent = P.previewMessage(prof, { first }) || "(nothing)");
    return [
      h("div", { class: "row" },
        h("label", { class: "field grow" }, h("span", {}, `Preset for “${prof.name}”`),
          h("select", { onchange: (e) => (P.usePreset(e.target.value, prof), (pipeOpen = null), rerenderSheet(), render()) }, P.presets().map((x) => h("option", { value: x.id, selected: x === pre }, x.name))))),
      h("div", { class: "row" },
        h("button", { class: "small", onclick: async () => { const n = await askText("Name of the new preset", "New preset", "Make it"); if (n) (P.usePreset(P.addPreset(n).id, prof), rerenderSheet(), render()); } }, "New"),
        h("button", { class: "small", onclick: async () => { const n = await askText("Name of the copy", pre.name + " copy", "Copy"); if (n) (P.usePreset(P.addPreset(n, pre).id, prof), rerenderSheet(), render()); } }, "Copy"),
        h("button", { class: "small", onclick: async () => { const n = await askText("Rename the preset", pre.name, "Rename"); if (n) ((pre.name = n), redraw()); } }, "Rename"),
        h("button", { class: "small danger", disabled: P.presets().length < 2, onclick: async () => (await askConfirm(`Delete the preset “${pre.name}”? Profiles using it move to the first preset.`)) && (P.removePreset(pre), rerenderSheet(), render()) }, "Delete")),
      h("p", { class: "muted" }, "Sent top to bottom. A step changes what is above it. Tap a row for its details. Presets are shared by profiles; the changes save at once."),
      h("div", { class: "pipe-list" }, pre.rows.map(rowEl)),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => addPiece() }, "Add piece"),
        h("button", { onclick: fromLibrary }, "Add from library")),
      h("h3", {}, "Groups"),
      (pre.groups || []).length ? null : h("p", { class: "muted" }, "A group's switch turns all its rows on or off. Put a row in a group from its details."),
      ...(pre.groups || []).map((g) => h("div", { class: "plugin-row" },
        h("input", { type: "checkbox", checked: g.on !== false, "aria-label": "Group on", onchange: (e) => ((g.on = e.target.checked), redraw()) }),
        h("input", { class: "grow", value: g.name, "aria-label": "Group name", oninput: (e) => ((g.name = e.target.value), saveConfig(), render()) }),
        h("small", { class: "muted" }, `${pre.rows.filter((r) => r.group === g.id).length} rows`),
        h("button", { class: "small danger", "aria-label": "Delete group", onclick: async () => (await askConfirm(`Delete the group “${g.name}”? Its rows stay, without a group.`)) && (P.removeGroup(pre, g), rerenderSheet(), render()) }, "✕"))),
      h("div", { class: "row" }, h("button", { class: "small", onclick: async () => { const n = await askText("Group name", "Group " + ((pre.groups || []).length + 1), "Add"); if (n) (P.addGroup(pre, n), rerenderSheet(), render()); } }, "Add group")),
      h("h3", {}, "What will be sent"),
      h("div", { class: "row" },
        h("label", { class: "field inline" }, h("span", {}, "As the first message of a site chat"), h("input", { type: "checkbox", checked: first, onchange: (e) => ((first = e.target.checked), showPreview()) })),
        h("button", { class: "small", onclick: showPreview }, "Show")),
      (showPreview(), preview),
    ];
  });

const openPlugins = () =>
  openSheet("Plugins", () => {
    const prof = profile();
    const url = h("input", { placeholder: "Plugin URL: GitHub folder, plugin.json or .zip" });
    const install = async () => {
      try {
        const r = await api("/api/plugins/install", { url: url.value });
        if (r.id.startsWith("bundle:")) return emit("pluginBundle", { version: r.id.slice(7) });
        toast("Installed " + r.id);
        await loadPlugins();
        setStepOn(r.id, true);
        rerenderSheet();
      } catch (e) {
        toast("Install failed: " + e.message, "error");
      }
    };
    const badge = (p) => (p.source === "builtin" ? (p.updated ? "updated" : "built-in") : p.overrides ? "your copy (overrides built-in)" : "your folder");
    return [
      h("div", { class: "row" }, h("button", { class: "primary", onclick: reloadPlugins, title: "Ctrl+Shift+R" }, "Reload plugins"), h("button", { onclick: openGuide }, "How to write one")),
      h("p", { class: "muted" }, "Your plugin folder: ", h("code", {}, S.pluginFolder || "?")),
      h("div", { class: "row" }, url, h("button", { onclick: install }, "Install")),
      h("div", { class: "row" }, h("button", { class: "primary", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file (.zip or plugin.json)")),
      h("h3", {}, `Plugins · switches of the preset “${presetOf(prof)?.name || "?"}”`),
      h("div", { class: "row" }, h("p", { class: "muted grow" }, "The order they run in, and your pieces of text, are in the pipeline."), h("button", { class: "small primary", onclick: openPipeline }, "Pipeline")),
      ...prof.plugins.map((e, i) => {
        if (S.plugins.get(e.id) && !isStep(S.plugins.get(e.id))) return null;
        const p = S.plugins.get(e.id);
        if (!p) return h("div", { class: "plugin-row missing" }, `${e.id} (not installed)`);
        return h(
          "div",
          { class: "plugin-row" },
          h("input", { type: "checkbox", checked: stepOn(e.id, prof), "aria-label": "On", onchange: (ev) => (setStepOn(e.id, ev.target.checked, prof), render()) }),
          h(
            "div",
            { class: "grow" },
            h("b", {}, p.manifest?.name || p.id),
            " ",
            h("small", { class: "muted" }, `v${p.manifest?.version || "?"} · ${badge(p)}${p.manifest?.advanced ? " · advanced" : ""}`),
            p.error ? h("div", { class: "error" }, "✕ " + p.error) : null,
          ),
          h("button", { class: "small", onclick: () => openPluginSettings(e.id), "aria-label": "Settings" }, "⚙"),
          p.source === "builtin" ? h("button", { class: "small", title: "Copy into your plugin folder to edit it", onclick: () => forkPlugin(p.id) }, "Copy") : null,
        );
      }),
      h("h3", {}, "Themes"),
      ...[...S.plugins.values()].filter(isTheme).map((p) =>
        h(
          "div",
          { class: "plugin-row" },
          h("input", { type: "radio", name: "theme", checked: S.config.ui.theme === p.id, onchange: () => setTheme(p.id) }),
          h("div", { class: "grow" }, h("b", {}, p.manifest.name), " ", h("small", { class: "muted" }, `v${p.manifest.version || "?"} · ${badge(p)}`)),
          p.source === "builtin" ? h("button", { class: "small", onclick: () => forkPlugin(p.id) }, "Copy") : null,
        ),
      ),
      h("h3", {}, "AI sites"),
      ...[...S.plugins.values()].filter(isSite).map((p) =>
        h(
          "div",
          { class: "plugin-row" },
          h("input", { type: "radio", name: "site", checked: prof.site === p.id, onchange: () => ((prof.site = p.id), saveConfig(), render()) }),
          h("div", { class: "grow" }, h("b", {}, p.manifest.name), " ", h("small", { class: "muted" }, `${p.manifest.site?.url || ""} · ${badge(p)}`)),
          h("button", { class: "small", onclick: () => openPluginSettings(p.id) }, "⚙"),
          p.source === "builtin" ? h("button", { class: "small", onclick: () => forkPlugin(p.id) }, "Copy") : null,
        ),
      ),
      h("h3", {}, "App parts"),
      ...appPartsControls(),
    ];
  });

const forkPlugin = async (id) => {
  try {
    const r = await api("/api/plugins/fork", { id });
    toast("Copied to " + r.path);
    await reloadPlugins();
  } catch (e) {
    toast(e.message, "error");
  }
};

const reloadPlugins = async () => {
  try {
    await loadPlugins();
    const broken = [...S.plugins.values()].filter((p) => p.error);
    toast(`Plugins reloaded (${S.plugins.size})` + (broken.length ? `, ${broken.length} with errors` : ""), broken.length ? "error" : "info");
    render();
  } catch (e) {
    toast(e.message, "error");
  }
};

const openDoc = async (file, title) => {
  let text = "";
  try {
    text = await (await fetch("/docs/" + file)).text();
  } catch (e) {
    text = "Guide not found.";
  }
  openSheet(title, () => [h("div", { class: "md doc", html: mdToHtml(text) })]);
};
// Plain text of a message in a box: drag the handles, select all, or copy a part.
const openSelect = (t) =>
  openSheet("Select text", () => {
    const box = (label, text) => {
      const ta = h("textarea", { class: "select-box", readonly: true }, text);
      return [h("div", { class: "row" }, h("strong", {}, label), h("button", { class: "small", onclick: () => (ta.focus(), ta.select()) }, "Select all"), h("button", { class: "small primary", onclick: () => {
        const part = ta.value.slice(ta.selectionStart, ta.selectionEnd) || ta.value;
        navigator.clipboard.writeText(part).then(() => toast(part === ta.value ? "Copied all" : "Copied selection"));
      } }, "Copy selection")), ta];
    };
    return [...box("Reply", t.reply || ""), ...(t.thinking ? box("Thinking", t.thinking) : []), ...box("Your message", t.you || "")];
  });
const openGuide = () => openDoc("PLUGINS.md", "Writing plugins");
const openQuickStart = () => openDoc("QUICKSTART.md", "Quick start");

const openProfileMenu = () =>
  openSheet("Profiles", () => {
    const prof = profile();
    const sites = [...S.plugins.values()].filter(isSite);
    return [
      h("p", { class: "muted" }, "A profile is an AI site, a preset (what goes with your message) and the plugins' settings. Ctrl+P switches to the next one."),
      ...S.config.profiles.map((p) =>
        h(
          "div",
          { class: "plugin-row" + (p === prof ? " current" : "") },
          h("input", { type: "radio", name: "prof", checked: p === prof, onchange: () => switchProfile(p.id) }),
          h("input", { class: "grow", value: p.name, "aria-label": "Profile name", oninput: (e) => ((p.name = e.target.value), saveConfig()) }),
          h("select", { "aria-label": "AI site", onchange: (e) => ((p.site = e.target.value), saveConfig(), render()) }, sites.map((s) => h("option", { value: s.id, selected: s.id === p.site }, s.manifest.name))),
          h("select", { "aria-label": "Preset", onchange: (e) => ((p.preset = e.target.value), saveConfig(), render()) }, PP.pipeline.presets().map((x) => h("option", { value: x.id, selected: x === presetOf(p) }, x.name))),
          S.config.profiles.length > 1
            ? h("button", { class: "small danger", "aria-label": "Delete profile", onclick: () => {
                S.config.profiles = S.config.profiles.filter((x) => x !== p);
                if (S.config.activeProfile === p.id) S.config.activeProfile = S.config.profiles[0].id;
                saveConfig();
                render();
              } }, "✕")
            : null,
        ),
      ),
      h(
        "div",
        { class: "row" },
        h("button", {
          onclick: () => {
            const copy = JSON.parse(JSON.stringify(prof));
            copy.id = "p" + Date.now();
            copy.name = prof.name + " copy";
            S.config.profiles.push(copy);
            switchProfile(copy.id);
          },
        }, "Duplicate current"),
        h("button", { onclick: openPipeline }, "Pipeline"),
        h("button", { onclick: openPlugins }, "Plugins"),
      ),
    ];
  });

const switchProfile = (id) => {
  S.config.activeProfile = id;
  saveConfig();
  render();
  toast("Profile: " + profile().name);
  warmSite();
};
const nextProfile = () => {
  const ps = S.config.profiles;
  switchProfile(ps[(ps.indexOf(profile()) + 1) % ps.length].id);
};

const openGit = () =>
  openSheet("Git history", () => {
    const g = S.config.git;
    const log = h("div", { class: "log muted" }, "Loading…");
    api("/api/git/log")
      .then((r) => log.replaceChildren(...(r.log.length ? r.log.map((c) => h("div", {}, h("code", {}, c.id), " ", ChatFile.stamp(new Date(c.time).toISOString()), " ", c.message)) : ["No commits yet."])))
      .catch((e) => (log.textContent = e.message));
    const field = (label, key, type = "text", ph = "") =>
      h("label", { class: "field" + (type === "checkbox" ? " inline" : "") }, h("span", {}, label), type === "checkbox"
        ? h("input", { type, checked: !!g[key], onchange: (e) => ((g[key] = e.target.checked), saveConfig()) })
        : h("input", { type, value: g[key] || "", placeholder: ph, oninput: (e) => ((g[key] = e.target.value), saveConfig()) }));
    const token = h("input", { type: "password", placeholder: S.app.gitToken ? "token saved (type to replace)" : "GitHub token with repo access" });
    const run = (what) => async () => {
      try {
        const r = await api("/api/git/" + what, {});
        toast(what + ": " + (r.result || "ok"));
        rerenderSheet();
      } catch (e) {
        toast(what + " failed: " + e.message, "error");
      }
    };
    return [
      h("p", { class: "muted" }, "Every chat save is a commit in ", h("code", {}, S.historyRoot || "history"), ". You can also use git there from Termux."),
      field("Commit on every save", "enabled", "checkbox"),
      field("Author name", "name", "text", "promptpipe"),
      field("Author email", "email", "text", "promptpipe@localhost"),
      field("Remote URL", "remote", "url", "https://github.com/you/chat-history.git"),
      h("label", { class: "field" }, h("span", {}, "Token (kept inside the app, not in the folder)"), h("div", { class: "row" }, token, h("button", {
        onclick: async () => {
          await api("/api/secret", { key: "gitToken", value: token.value });
          S.app.gitToken = !!token.value;
          token.value = "";
          toast("Token saved");
        },
      }, "Save token"))),
      field("Push after every commit", "autoPush", "checkbox"),
      h("div", { class: "row" }, h("button", { onclick: run("push") }, "Push"), h("button", { onclick: run("pull") }, "Pull")),
      h("h3", {}, "Recent commits"),
      log,
    ];
  });

const lookControls = () => {
  const themes = [...S.plugins.values()].filter(isTheme);
  return [
    h("h3", {}, "Look"),
    h(
      "div",
      { class: "field" },
      h("span", {}, "UI scale · Ctrl+= / Ctrl+- / Ctrl+0"),
      h(
        "div",
        { class: "row scale" },
        h("button", { class: "small", "aria-label": "Smaller", onclick: () => setScale(S.config.ui.scale - 0.05) }, "A−"),
        h("input", { type: "range", min: 60, max: 200, step: 5, value: Math.round(S.config.ui.scale * 100), class: "grow", "aria-label": "UI scale", onchange: (e) => setScale(e.target.value / 100) }),
        h("button", { class: "small", "aria-label": "Bigger", onclick: () => setScale(S.config.ui.scale + 0.05) }, "A+"),
        h("span", { class: "muted" }, Math.round(S.config.ui.scale * 100) + "%"),
      ),
    ),
    h(
      "div",
      { class: "field" },
      h("span", {}, "Theme (install more like plugins)"),
      h(
        "div",
        { class: "themes" },
        [{ id: "", manifest: { name: "Midnight", description: "Default dark theme" } }, ...themes].map((t) =>
          h("button", { class: "theme-pick" + ((S.config.ui.theme || "") === t.id ? " current" : ""), title: t.manifest.description || "", onclick: () => setTheme(t.id) }, t.manifest.name),
        ),
      ),
    ),
  ];
};

// App parts: the core/ui plugins the app is made of, which ones are yours, and
// a way out (safe mode) if one of yours breaks.
const appPartsControls = () => {
  const uis = [...S.plugins.values()].filter((p) => isPart(p) && p.manifest.kind === "ui");
  const loaded = new Map((S.parts || []).map((p) => [p.id, p]));
  const parts = [...S.plugins.values()].filter((p) => isPart(p) || isDriver(p));
  return [
    h("p", { class: "muted" }, "The app is made of plugins too: sending, chat files, history, the local API and this screen. Copy one to change it; your copy replaces the built-in one when the app restarts. If yours breaks, the app opens in safe mode with only built-in plugins."),
    ...parts.map((p) =>
      h(
        "div",
        { class: "plugin-row" },
        h(
          "div",
          { class: "grow" },
          h("b", {}, p.manifest.name || p.id),
          " ",
          h("small", { class: "muted" }, `${p.id} · v${p.manifest.version || "?"} · ${p.source === "builtin" ? (p.updated ? "updated" : "built-in") : p.overrides ? "your copy" : "yours"}${isDriver(p) ? " · site driver" : isPart(p) && !loaded.has(p.id) ? " · not loaded" : ""}`),
          p.error ? h("div", { class: "error" }, "✕ " + p.error) : null,
        ),
        p.source === "builtin" && !SAFE ? h("button", { class: "small", title: "Copy into your plugin folder to edit it", onclick: () => forkPlugin(p.id) }, "Copy") : null,
      ),
    ),
    uis.length > 1
      ? h(
          "label",
          { class: "field inline" },
          h("span", {}, "App screen (UI plugin)"),
          h("select", { onchange: (e) => ((S.config.ui.part = e.target.value), saveConfig(), toast("Restart the app to switch")) }, uis.map((p) => h("option", { value: p.id, selected: (S.config.ui.part || "chat-ui") === p.id }, p.manifest.name || p.id))),
        )
      : null,
    h("h3", {}, "Plugin updates"),
    (() => {
      const u = S.updates || {};
      const b = u.bundle || {};
      return h(
        "div",
        {},
        h("p", { class: "muted" }, b.version ? `Downloaded plugins: ${b.version} (${(b.plugins || []).length}). Newer ones than the app's are used.` : "No downloaded plugins yet: the ones built into the app are used.", (S.config.updates || {}).checked ? ` Last checked ${new Date(S.config.updates.checked).toLocaleString()}.` : ""),
        u.error ? h("p", { class: "error" }, "✕ " + u.error + ". Download the zip, then install it from the file.") : null,
        h(
          "div",
          { class: "row" },
          h("button", { class: "small primary", disabled: !!u.busy || SAFE, onclick: () => updatePlugins() }, u.busy ? "Checking…" : "Update plugins"),
          h("button", { class: "small", title: releasePage(), onclick: () => api("/api/app/action", { action: "openUrl", url: releasePage() }) }, "Download the zip"),
          h("button", { class: "small", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install the zip"),
        ),
        h("label", { class: "field inline" }, h("span", {}, "Check once a day when the app starts"), h("input", { type: "checkbox", checked: (S.config.updates || {}).auto !== false, onchange: (e) => ((S.config.updates = { ...(S.config.updates || {}), auto: e.target.checked }), saveConfig()) })),
      );
    })(),
    h(
      "div",
      { class: "row" },
      h("button", { class: "small", onclick: () => restart() }, "Restart app"),
      SAFE ? h("button", { class: "small primary", onclick: () => restart(false) }, "Leave safe mode") : h("button", { class: "small", title: "Start with only built-in plugins", onclick: () => restart(true) }, "Restart in safe mode"),
    ),
  ];
};

// The end of the core's log, to read or copy (Termux can't reach the app's files).
const openCoreLog = async () => {
  const read = () => api("/api/log").catch((e) => ({ exists: false, path: "", error: e.message }));
  let log = await read();
  const textOf = () => (log.error ? "Couldn't read the log: " + log.error : log.exists ? log.text || "(empty)" : "No log file yet.");
  const toEnd = () => setTimeout(() => document.querySelector(".core-log")?.scrollTo(0, 1e9), 50);
  openSheet("Core log", () => [
    h("p", { class: "muted" }, h("code", {}, log.path || "")),
    h("div", { class: "row" },
      h("button", { class: "small primary", onclick: () => navigator.clipboard.writeText(textOf()).then(() => toast("Log copied")) }, "Copy"),
      h("button", { class: "small", onclick: async () => ((log = await read()), rerenderSheet(), toEnd()) }, "Refresh")),
    h("pre", { class: "pipe-preview core-log" }, textOf()),
  ]);
  toEnd();
};

const openSettings = () =>
  openSheet("Settings", () => {
    return [
      ...lookControls(),
      h("h3", {}, "Site pages at once"),
      h("p", { class: "muted" }, "Each page is a separate copy of the site, so this many chats (yours, plugins' and other apps') get answered at the same time. More pages use more memory, and many messages at once on one account can look like a bot to the site."),
      h("div", { class: "row stepper" },
        h("button", { class: "small", "aria-label": "Fewer pages", disabled: pageCount() <= 1, onclick: () => setPageCount(pageCount() - 1).then(render) }, "−"),
        h("strong", {}, `${pageCount()} ${pageCount() === 1 ? "page" : "pages"}`),
        h("button", { class: "small", "aria-label": "More pages", disabled: pageCount() >= 4, onclick: () => setPageCount(pageCount() + 1).then(render) }, "+"),
      ),
      h("p", { class: "muted" }, "Log in once: all pages share the login. In the site view, Page 1/2 switches between them."),
      h("h3", {}, "Waiting for replies"),
      h("p", { class: "muted" }, "In minutes. 0 = no limit. Stop waiting on a reply that's coming always works."),
      ...[["idleMin", "Give up after this long with no activity on the page"], ["maxMin", "Give up after this long in total"]].map(([k, label]) =>
        h("label", { class: "field inline" }, h("span", {}, label), h("input", { type: "number", min: "0", step: "1", style: "width:5em", value: String((S.config.wait || {})[k] || 0), oninput: (e) => ((S.config.wait = { ...(S.config.wait || {}), [k]: Math.max(0, +e.target.value || 0) }), saveConfig()) })),
      ),
      h("h3", {}, "Keyboard"),
      h("label", { class: "field inline" }, h("span", {}, "Enter sends (Shift+Enter for a new line)"), h("input", { type: "checkbox", checked: !!S.config.ui.enterSends, onchange: (e) => ((S.config.ui.enterSends = e.target.checked), saveConfig()) })),
      h("h3", {}, "App parts"),
      ...appPartsControls(),
      h("details", { class: "advanced-settings" }, h("summary", {}, "Advanced: storage, local API, background"),
      h("h3", {}, "Storage"),
      h("p", {}, h("code", {}, S.app.storage || "?")),
      S.app.allFiles
        ? h("p", { class: "muted" }, "Plugins, config and history live here, so Termux and Neovim can reach them.")
        : h("p", { class: "warn" }, "The app can't use /sdcard yet, so files are in its own folder. ", h("button", { onclick: () => api("/api/app/action", { action: "grantFiles" }) }, "Allow all files access"), " then restart the app."),
      h("h3", {}, "Local API for other apps"),
      h("p", { class: "muted" }, "Apps that take an OpenAI API key: base URL below, model = a profile name, API key = the token below (always required). Each request becomes one new chat on the site, unless it adds \"chat\": \"<path>.md\" to continue a saved chat (then only its last message is sent). Every reply also says, under \"promptpipe\", which chat it went to and what was sent. Requests at the same time run in parallel on the site pages (see Site pages at once), the rest wait their turn."),
      h("div", { class: "row" }, h("pre", { class: "grow" }, `http://127.0.0.1:${S.app.port}/v1`), h("button", { class: "small", onclick: () => navigator.clipboard.writeText(`http://127.0.0.1:${S.app.port}/v1`).then(() => toast("Copied")) }, "Copy")),
      h("label", { class: "field" }, h("span", {}, "API token (send it as: Authorization: Bearer <token>)"), h("div", { class: "row" },
        h("pre", { class: "grow" }, S.app.apiTokenValue || "?"),
        h("button", { class: "small", onclick: () => navigator.clipboard.writeText(S.app.apiTokenValue || "").then(() => toast("Copied")) }, "Copy"),
        h("button", { class: "small", onclick: async () => {
          await api("/api/secret", { key: "apiToken", value: "" });
          S.app = await api("/api/app");
          toast("New API token made: apps using the old one need the new one");
          rerenderSheet();
        } }, "New token"))),
      h("pre", {}, `curl -s 127.0.0.1:${S.app.port}/v1/chat/completions -H "Authorization: Bearer ${S.app.apiTokenValue || "TOKEN"}" -d '{"model":"${profile().name}","messages":[{"role":"user","content":"hi"}]}'`),
      h("label", { class: "field" }, h("span", {}, "Folder for chats made through the API"), h("input", { value: S.config.api.folder, oninput: (e) => ((S.config.api.folder = e.target.value), saveConfig()) })),
      h("h3", {}, "Background"),
      h("p", { class: "muted" }, "A notification keeps the AI page and the API alive while the app is in the background."),
      h("button", { onclick: () => api("/api/app/action", { action: "stopService" }) }, "Stop background service"),
      h("h3", {}, "Core log"),
      h("p", { class: "muted" }, "What the app's core printed, for reporting a problem."),
      h("button", { onclick: openCoreLog }, "Show core log"),
      ),
      h("p", { class: "muted" }, "Version " + (S.app.version || "?")),
    ];
  });

// ---------- search (Ctrl+F) ----------
// Searches every message of every saved chat. Words must all match (any case);
// "exact phrase", #tag (prefix, message tags incl. chat tags), in:folder,
// is:you / is:ai to look only at your messages or the replies.
const buildIndex = async () => {
  const { files } = await api("/api/history/all");
  const out = [];
  for (const f of files) {
    const chat = ChatFile.fromMd(f.path, f.text);
    chat.turns.forEach((t, i) =>
      out.push({ path: f.path, title: chat.meta.title || f.path, n: i, at: t.at, you: t.you, reply: t.reply, tags: ChatFile.messageTags(chat.meta, t) }),
    );
    if (!chat.turns.length) out.push({ path: f.path, title: chat.meta.title || f.path, n: -1, at: chat.meta.updated, you: "", reply: "", tags: chat.meta.tags });
  }
  S.index = out;
};

const parseQuery = (q) => {
  const terms = { words: [], tags: [], folder: null, side: null };
  for (const m of q.matchAll(/"([^"]+)"|(\S+)/g)) {
    const w = (m[1] ?? m[2]).toLowerCase();
    if (m[1] != null) terms.words.push(w);
    else if (w.startsWith("#") && w.length > 1) terms.tags.push(w.slice(1));
    else if (w.startsWith("in:")) terms.folder = w.slice(3);
    else if (w === "is:you" || w === "is:ai") terms.side = w.slice(3);
    else terms.words.push(w);
  }
  return terms;
};

const search = (q) => {
  const t = parseQuery(q);
  if (!t.words.length && !t.tags.length && !t.folder) return [];
  return S.index
    .filter((e) => {
      if (t.folder && !e.path.toLowerCase().startsWith(t.folder.replace(/\/$/, "") + "/")) return false;
      if (!t.tags.every((tag) => e.tags.some((x) => x.toLowerCase().startsWith(tag)))) return false;
      const hay = (t.side === "you" ? e.you : t.side === "ai" ? e.reply : e.title + "\n" + e.you + "\n" + e.reply).toLowerCase();
      return t.words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
};

const snippet = (e, words) => {
  const text = (e.you + "  ⟶  " + e.reply).replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const at = words.length ? Math.max(0, lower.indexOf(words[0])) : 0;
  const part = (at > 40 ? "…" : "") + text.slice(Math.max(0, at - 40), at + 140);
  const frag = h("span", {});
  let rest = part;
  const re = words.length ? new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "i") : null;
  while (re && rest) {
    const m = re.exec(rest);
    if (!m) break;
    frag.append(rest.slice(0, m.index), h("mark", {}, m[0]));
    rest = rest.slice(m.index + m[0].length);
  }
  frag.append(rest);
  return frag;
};

const openSearch = () =>
  openSheet("Search all chats", () => {
    const input = h("input", { type: "search", placeholder: 'words, "exact phrase", #tag, in:folder, is:you, is:ai', value: S.lastSearch || "" });
    const list = h("div", { class: "results" });
    let sel = 0;
    let hits = [];
    const draw = async () => {
      if (!S.index) {
        list.replaceChildren(h("p", { class: "muted" }, "Reading chats…"));
        try {
          await buildIndex();
        } catch (e) {
          return list.replaceChildren(h("p", { class: "error" }, e.message));
        }
      }
      S.lastSearch = input.value;
      hits = search(input.value);
      sel = Math.min(sel, Math.max(0, hits.length - 1));
      const words = parseQuery(input.value).words;
      list.replaceChildren(
        h("p", { class: "muted" }, input.value.trim() ? `${hits.length} message${hits.length === 1 ? "" : "s"}` : `${S.index.length} messages in ${new Set(S.index.map((e) => e.path)).size} chats`),
        ...hits.slice(0, 200).map((e, i) =>
          h(
            "button",
            { class: "result" + (i === sel ? " sel" : ""), onclick: () => goTo(e) },
            h("span", { class: "result-head" }, h("b", {}, e.title), e.n >= 0 ? ` · #${e.n + 1}` : "", " · ", ChatFile.stamp(e.at), e.tags.length ? "  " + e.tags.map((t) => "#" + t).join(" ") : ""),
            h("span", { class: "result-text" }, snippet(e, words)),
          ),
        ),
      );
      list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
    };
    const goTo = async (e) => {
      S.sheet = null;
      if (history.state?.layer === "sheet") history.back();
      await openChat(e.path);
      if (e.n >= 0) {
        S.highlight = e.n;
        render();
        document.getElementById("turn-" + e.n)?.scrollIntoView({ block: "center" });
        setTimeout(() => ((S.highlight = null), render()), 2500);
      }
    };
    let timer = 0;
    input.oninput = () => {
      clearTimeout(timer);
      sel = 0;
      timer = setTimeout(draw, 150);
    };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown") sel = Math.min(sel + 1, hits.length - 1);
      else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
      else if (e.key === "Enter" && hits[sel]) return void goTo(hits[sel]);
      else return;
      e.preventDefault();
      draw();
    };
    draw();
    autofocus(input);
    return [input, list];
  });

const openMenu = () =>
  openSheet("Menu", () =>
    commands()
      .filter((c) => c.menu)
      .map((c) => h("button", { class: "menu-item", onclick: () => runFromSheet(c) }, h("span", {}, c.name), h("kbd", {}, c.key || ""))),
  );

// ---------- commands (Ctrl+K) ----------
const commands = () => [
  { name: "New chat", key: "Ctrl+N", run: () => startNewChat(), menu: true },
  { name: "All commands", key: "Ctrl+K", run: openPalette, menu: true },
  { name: "Shortcuts & help", key: "Ctrl+?", run: openHelp, menu: true },
  { name: "Quick start", key: "", run: openQuickStart, menu: true },
  { name: "Writing plugins", key: "", run: openGuide, menu: true },
  { name: "Edit and resend last message", key: "↑ in empty box", run: editLast },
  { name: "Fold or unfold all thinking", key: "Ctrl+/", run: () => toggleThinking() },
  { name: "Chats and folders", key: "Ctrl+B", run: openDrawer, menu: true },
  { name: "Search all chats", key: "Ctrl+F", run: openSearch, menu: true },
  { name: "Show AI page", key: "Alt+S", run: showSite, menu: true },
  { name: "Choose model", key: "Ctrl+M", run: openModels, menu: true },
  { name: "Expand or shrink the message box", key: "Ctrl+E", run: toggleExpand },
  { name: "Plugins", key: "Ctrl+Shift+P", run: openPlugins, menu: true },
  { name: "Pipeline: presets, pieces and order", key: "Ctrl+Shift+L", run: openPipeline, menu: true },
  { name: "Profiles", key: "", run: openProfileMenu, menu: true },
  { name: "Next profile", key: "Ctrl+P", run: nextProfile },
  { name: "Git history", key: "", run: openGit, menu: true },
  { name: "Settings", key: "Ctrl+,", run: openSettings, menu: true },
  { name: "Look: scale and theme", key: "", run: () => openSheet("Look", lookControls), menu: true },
  { name: "Bigger UI", key: "Ctrl+=", run: () => setScale(S.config.ui.scale + 0.05) },
  { name: "Smaller UI", key: "Ctrl+-", run: () => setScale(S.config.ui.scale - 0.05) },
  { name: "Plugin guide", key: "", run: openGuide, menu: true },
  { name: "Reload plugins", key: "Ctrl+Shift+R", run: reloadPlugins, menu: true },
  { name: "Toggle Advanced blocks", key: "Ctrl+Shift+A", run: toggleAdvanced },
  { name: "Chat info: name, tags, history", key: "F2", run: renameChat, menu: true },
  { name: "Add chat tag", key: "Ctrl+T", run: () => (renameChat(), setTimeout(() => document.querySelector(".in-sheet .tag-input")?.focus(), 50)) },
  { name: "Previous chat", key: "Alt+↑", run: () => stepChat(-1) },
  { name: "Next chat", key: "Alt+↓", run: () => stepChat(1) },
  { name: "Link this chat to the open AI page", key: "", run: linkToSite, menu: true },
  // Plugins' own menu entries.
  ...[...S.plugins.values()].flatMap((p) =>
    (p.def?.menu || []).map((m) => ({ name: m.label, key: "", menu: true, run: () => Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error")) })),
  ),
  { name: "Import messages from the linked site chat", key: "", run: importHistory, menu: true },
  { name: "Add the page's newest reply to this chat", key: "", run: addFromPage, menu: true },
  { name: "Decode newest reply on the AI page (preview)", key: "", run: decodeLast },
  { name: "Move chat to folder…", key: "", run: () => S.chat.path ? openChatActions(S.chats.find((c) => c.path === S.chat.path) || S.chat) : toast("Send a message first") },
  ...profile().plugins
    .filter((e) => isStep(S.plugins.get(e.id)))
    .map((e) => ({ name: `Toggle ${pluginName(e.id)} (${stepOn(e.id) ? "on" : "off"})`, run: () => (setStepOn(e.id, !stepOn(e.id)), render()) })),
];

const openHelp = () =>
  openSheet("Shortcuts & help", () => [
    h("p", { class: "muted" }, "Everything has a button or a gesture; keys are extras for a hardware keyboard."),
    h("h3", {}, "Touch"),
    ...[
      ["Swipe a reply right", "quote it in your message"],
      ["Swipe a reply left", "copy it"],
      ["Long-press any text", "select it (or Options › Select text)"],
      ["Long-press a chat in the list", "pin, move, delete"],
      ["Tap the title", "chat info, tags, history"],
      ["Tap the model name", "choose model and switches"],
      ["Tap the site name", "show the AI page"],
      ["⋯ under a reply", "copy, reply, trace, tags, plugin actions"],
      ["⤢ next to Send", "big message box"],
    ].map(([a, b]) => h("div", { class: "menu-item" }, h("span", {}, a), h("kbd", {}, b))),
    h("h3", {}, "Keys"),
    ...commands().filter((c) => c.key).map((c) => h("div", { class: "menu-item" }, h("span", {}, c.name), h("kbd", {}, c.key))),
  ]);

const toggleThinking = () => {
  S.thinkingOpen = !S.thinkingOpen;
  for (const d of document.querySelectorAll("details.thinking")) d.open = S.thinkingOpen;
};

const openPalette = () =>
  openSheet("Commands", () => {
    const list = h("div", { class: "palette" });
    const input = h("input", { placeholder: "Type to filter, Enter runs" });
    let sel = 0;
    const draw = () => {
      const q = input.value.toLowerCase();
      const items = commands().filter((c) => c.name.toLowerCase().includes(q));
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren(...items.map((c, i) => h("button", { class: "menu-item" + (i === sel ? " sel" : ""), onclick: () => runFromSheet(c) }, h("span", {}, c.name), h("kbd", {}, c.key || ""))));
      return items;
    };
    input.oninput = () => ((sel = 0), draw());
    input.onkeydown = (e) => {
      const items = draw();
      if (e.key === "ArrowDown") sel = Math.min(sel + 1, items.length - 1);
      else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
      else if (e.key === "Enter" && items[sel]) return runFromSheet(items[sel]); else return;
      e.preventDefault();
      draw();
    };
    draw();
    autofocus(input);
    return [input, list];
  });

const stepChat = (d) => {
  const list = S.chats.filter(matches);
  if (!list.length) return;
  const i = list.findIndex((c) => c.path === S.chat.path);
  const next = list[(i + d + list.length) % list.length];
  openChat(next.path).catch((e) => toast(e.message, "error"));
};

// Copy the messages already in the linked site chat into this chat (decoded by the after hooks).
const importHistory = async () => {
  const c = S.chat;
  if (!c.meta.source) return toast("Link this chat to a site chat first", "error");
  try {
    S.progress = "Reading the site chat…";
    render();
    if (!sameUrl(S.site.url, c.meta.source)) await openSite(c.meta.source);
    await new Promise((r) => setTimeout(r, 1500));
    const r = await siteCmd("history");
    const prof = profile();
    let added = 0;
    for (const t of r.turns.slice(c.turns.length)) {
      const ctx = { chat: c, profile: prof, firstMessage: false, notes: [] };
      const reply = t.reply ? await runHooks("afterReply", t.reply, ctx, [], prof) : "";
      // Messages sent through plugins (like base64) are decoded the same way.
      const you = t.you ? await runHooks("afterReply", t.you, { ...ctx, notes: [] }, [], prof) : "";
      c.turns.push({ at: new Date().toISOString(), profile: prof.name, tags: [], notes: ["imported from the site"], you, sent: t.you, raw: t.reply, reply, thinking: t.thinking || "" });
      added++;
    }
    if (!c.meta.title || c.meta.title === "New chat" || c.meta.title.startsWith("/")) c.meta.title = (c.turns[0]?.you || "Imported chat").slice(0, 60);
    if (added) await saveChat(c, `import: ${c.meta.title} (${added} messages)`);
    toast(added ? `Imported ${added} messages` : "Nothing new to import");
  } catch (e) {
    toast(e.message, "error");
  } finally {
    S.progress = "";
    render();
  }
};

const linkToSite = async () => {
  try {
    const r = await siteCmd("info");
    S.chat.meta.source = r.url;
    S.chat.meta.ai = siteFor()?.name || "";
    if (S.chat.path) await saveChat(S.chat, "link: " + S.chat.meta.title);
    render();
    toast("Linked to " + r.url);
  } catch (e) {
    toast(e.message, "error");
  }
};

// Run the after hooks on the newest reply on the page without sending anything.
const decodeLast = async () => {
  try {
    const r = await siteCmd("last");
    if (!r.raw) throw new Error("no reply found on the AI page");
    const trace = [{ label: "Reply on page", text: r.raw, notes: [] }];
    const ctx = { chat: S.chat, profile: profile(), firstMessage: false, notes: [] };
    const out = await runHooks("afterReply", r.raw, ctx, trace, profile());
    openSheet("Newest reply on the page", () => [
      h("div", { class: "md", html: mdToHtml(out) }),
      h("details", { class: "trace" }, h("summary", {}, "Trace"), trace.map((s) => h("div", { class: "stage" }, h("b", {}, s.label), h("pre", {}, s.text)))),
      h("button", { onclick: () => navigator.clipboard.writeText(out).then(() => toast("Copied")) }, "Copy"),
    ]);
  } catch (e) {
    toast(e.message, "error");
  }
};

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const run = (fn) => (e.preventDefault(), fn());
  if (e.key === "Escape") {
    if (S.sheet) return run(closeSheet);
    if (S.drawer) return run(closeDrawer);
  }
  if (ctrl && !e.shiftKey && k === "k") return run(openPalette);
  if (ctrl && !e.shiftKey && k === "n") return run(() => startNewChat());
  if (ctrl && !e.shiftKey && k === "f") return run(openSearch);
  if (ctrl && !e.shiftKey && k === "m") return run(openModels);
  if (ctrl && !e.shiftKey && k === "e") return run(toggleExpand);
  if (ctrl && e.key === "/") return run(toggleThinking);
  if (ctrl && e.key === "?") return run(openHelp);
  if (e.key === "ArrowUp" && !e.altKey && !ctrl && e.target.matches?.(".composer textarea") && !e.target.value) return run(editLast);
  if (ctrl && !e.shiftKey && k === "b") return run(() => (S.drawer ? closeDrawer() : openDrawer()));
  if (ctrl && !e.shiftKey && k === "p") return run(nextProfile);
  if (ctrl && e.shiftKey && k === "p") return run(openPlugins);
  if (ctrl && e.shiftKey && k === "l") return run(openPipeline);
  if (ctrl && e.shiftKey && k === "r") return run(reloadPlugins);
  if (ctrl && e.shiftKey && k === "a") return run(toggleAdvanced);
  if (ctrl && !e.shiftKey && k === "t") return run(() => (renameChat(), setTimeout(() => document.querySelector(".in-sheet .tag-input")?.focus(), 50)));
  if (ctrl && e.key === ",") return run(openSettings);
  if (ctrl && (e.key === "=" || e.key === "+")) return run(() => setScale(S.config.ui.scale + 0.05));
  if (ctrl && e.key === "-") return run(() => setScale(S.config.ui.scale - 0.05));
  if (ctrl && e.key === "0") return run(() => setScale(1));
  if (e.key === "F2") return run(renameChat);
  if (e.altKey && e.key === "ArrowUp") return run(() => stepChat(-1));
  if (e.altKey && e.key === "ArrowDown") return run(() => stepChat(1));
  if (e.altKey && /^[1-9]$/.test(e.key)) {
    const pills = document.querySelectorAll(".blocks .pill:not(.preset):not(.group) .pill-main");
    const b = pills[Number(e.key) - 1];
    if (b) return run(() => b.click());
  }
});

// ---------- keyboard on screen ----------
// The app also pads for the keyboard natively; this keeps the layout to the
// visible area if a keyboard still overlaps it.
if (window.visualViewport) {
  const fit = () => document.documentElement.style.setProperty("--vvh", window.visualViewport.height + "px");
  window.visualViewport.addEventListener("resize", () => {
    fit();
    if (document.activeElement?.closest?.(".composer") && nearBottom()) scrollDown();
  });
  fit();
}


on("start", () => applyLook());
on("ready", () => {
  render();
  scrollDown();
});
// Text shared from another app starts a new chat with it in the box.
on("share", (ev) => {
  if (S.chat.turns.length) startNewChat();
  setTimeout(() => fillComposer(ev.text, "append"), 50);
});
