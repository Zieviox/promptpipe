"use strict";
// App part: the chat screen ("kind": "ui"). Everything you see: the header,
// messages, composer, drawer, sheets, search, command list and keys. It fills
// in the core's render, renderStatus, toast (optional), openSheet,
// rerenderSheet, closeDrawer, scrollDown, fillComposer and markUnseen.
// Replace it with your own UI plugin of id "chat-ui", or pick another
// "kind": "ui" plugin in Settings.

// ---------- look: UI scale and theme ----------
// Themes are plugins too ("kind": "theme" with a CSS file of colour variables).
// ui.mode: "" follows the system, "dark", "light". ui.accent: "" (warm orange)
// or one of ACCENTS. ui.scale: the size of text and controls. A theme plugin sets its own colours.
const ACCENTS = { "": "Warm orange", blue: "Blue", green: "Green", rose: "Rose", violet: "Violet" };
const applyLook = () => {
  const ui = S.config.ui;
  const root = document.documentElement;
  document.body.style.zoom = String(ui.scale);
  root.style.setProperty("--scale", String(ui.scale));
  let link = document.getElementById("theme-css");
  const p = S.plugins.get(ui.theme);
  const href = isTheme(p) && p.manifest.css ? pluginUrl(p.id, p.manifest.css) + "?t=" + Date.now() : "";
  const mode = href ? "plugin" : ui.mode === "dark" || ui.mode === "light" ? ui.mode : "";
  if (mode) root.dataset.theme = mode;
  else delete root.dataset.theme;
  if (ui.accent && ACCENTS[ui.accent]) root.dataset.accent = ui.accent;
  else delete root.dataset.accent;
  if (!href) {
    link && link.remove();
    return syncNativeColors();
  }
  if (!link) document.head.append((link = h("link", { id: "theme-css", rel: "stylesheet" })));
  if (!link.href.startsWith(location.origin + href.split("?")[0])) link.href = href;
  link.onload = syncNativeColors;
  syncNativeColors();
};
// The Android shell draws behind and around the web page (system bars, the site bar,
// the first moment before the page loads). It takes the page's background and
// light/dark from here, so they follow the theme instead of staying dark. Harmless
// where the shell doesn't know the action.
let nativeColors = "";
const syncNativeColors = () => {
  setTimeout(() => {
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue("--bg").trim();
    if (!/^#[0-9a-f]{6}$/i.test(bg)) return;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    const dark = 0.299 * r + 0.587 * g + 0.114 * b < 140;
    if (nativeColors === bg + dark) return;
    nativeColors = bg + dark;
    api("/api/app/action", { action: "theme", bg, dark }).catch(() => {});
  }, 60);
};
if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => syncNativeColors());
const setScale = (v) => {
  S.config.ui.scale = Math.round(Math.min(2, Math.max(0.6, v)) * 100) / 100;
  saveConfig();
  applyLook();
  rerenderSheet();
  toast("UI scale " + Math.round(S.config.ui.scale * 100) + "%");
};
const setLook = (key, value) => {
  S.config.ui[key] = value;
  saveConfig();
  applyLook();
  render();
};
const setTheme = (id) => setLook("theme", id);

// Model and switches, as in the wireframe: the site's models as a radio list,
// then its switches. Read from the page; saved in the profile and set on the
// page before each message.
const MODELS = { r: null, error: "" }; // what the page said last
const openModels = () => {
  const load = () =>
    siteCmd("models")
      .then((r) => ((MODELS.r = r), (MODELS.error = "")))
      .catch((e) => siteCmd("info").then((r) => (MODELS.r = { ...r, models: [], switches: (siteFor()?.switches || []).map((x) => ({ name: x.name, found: true, on: false })) }), () => (MODELS.error = e.message)))
      .finally(rerenderSheet);
  MODELS.r = null;
  load();
  openSheet("Model and switches", () => {
    const want = choicesFor();
    const r = MODELS.r;
    const pick = async (m) => {
      want.model = m;
      saveConfig();
      rerenderSheet();
      try {
        S.site.model = (await siteCmd("setModel", { model: m })).model;
        toast("Model: " + m);
      } catch (e) {
        toast(e.message, "error");
      }
      render();
    };
    const flip = async (sw, on) => {
      want.switches[sw.name] = on;
      saveConfig();
      rerenderSheet();
      try {
        await siteCmd("setSwitch", { name: sw.name, on });
      } catch (e) {
        toast(e.message, "error");
      }
    };
    const cur = want.model || r?.model || "";
    if (MODELS.error) return [item({ cls: "danger", label: "Couldn't read the page", sub: MODELS.error + " · tap to try again", onclick: load })];
    if (!r) return [item({ label: "Reading the site's model list…" })];
    return [
      ...(r.models || []).map((m) => item({ id: "models.m" + m, label: m, sub: r.model && r.model.includes(m) ? "On the page now" : "", radio: cur === m || (!want.model && !!r.model && r.model.includes(m)), onclick: () => pick(m) })),
      (r.models || []).length ? null : item({ label: "Couldn't read the model list", sub: "Pick it on the site itself; the app then leaves the model alone. On the page now: " + (r.model || "unknown") }),
      (r.switches || []).length ? h("div", { class: "lbl" }, "Switches") : null,
      ...(r.switches || []).map((sw) => {
        const on = sw.name in want.switches ? want.switches[sw.name] : sw.on;
        return item({ id: "models.sw" + sw.name, label: sw.name, sub: sw.found ? "" : "Not found on the page", toggle: !!on, onclick: () => flip(sw, !on) });
      }),
      h("div", { class: "lbl" }, "More"),
      item({ label: "Choose on the site", sub: "Show the page and pick the model there", onclick: () => ((want.model = ""), saveConfig(), closeSheet(), showSite()) }),
      want.model ? item({ label: "Don't choose a model", sub: "Use whatever the site has", onclick: () => ((want.model = ""), saveConfig(), rerenderSheet(), render()) }) : null,
      item({ label: "Read the page again", onclick: () => ((MODELS.r = null), load(), rerenderSheet()) }),
      h("div", { class: "sub2" }, `Saved in the profile “${profile().name}” and set on the page before each message.`),
    ];
  }, { back: openSiteSheet });
};


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

// STOPGAP, not the design: render() rebuilds the whole screen, so what the person
// is doing has to be carried over by hand. The real fix is a UI that updates in
// place (the live reply box already does, see syncLive); when the screens are
// reworked this whole block should go. What is carried over: where each list is scrolled, and what they have typed into a
// sheet's fields. Without this, lists jumped back to the top and sheets lost
// their text whenever anything in the background redrew.
const SCROLLERS = ".chat, .drawer, .sheet, .body, .pipe-preview, .core-log, .dd-list";
// A sheet's fields have no ids, so each is named by what it is (tag, type, placeholder,
// label) plus its number among fields of the same name: it survives fields being added.
const fieldKey = (f, all) => {
  const name = [f.tagName, f.type, f.placeholder, f.name, f.getAttribute("aria-label"), f.dataset.keep].join("|");
  return name + "#" + all.filter((x) => x === f || [x.tagName, x.type, x.placeholder, x.name, x.getAttribute("aria-label"), x.dataset.keep].join("|") === name).indexOf(f);
};
const textLike = (f) => f.tagName === "TEXTAREA" || (f.tagName === "INPUT" && /^(text|search|url|password|email|number|)$/.test(f.type));
// A selection inside one text block of a message: which block, and where in its text.
const TEXT_BLOCK = ".you, .ai .md, .thinbox .md, .live-box .md";
const selectionSpot = () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const host = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest?.(TEXT_BLOCK);
  const block = host(r.startContainer);
  const turn = block?.closest(".turn");
  if (!block || !turn || block !== host(r.endContainer)) return null;
  const at = (node, off) => {
    const pre = document.createRange();
    pre.selectNodeContents(block);
    pre.setEnd(node, off);
    return pre.toString().length;
  };
  return { turn: turn.id, n: [...turn.querySelectorAll(TEXT_BLOCK)].indexOf(block), from: at(r.startContainer, r.startOffset), to: at(r.endContainer, r.endOffset) };
};
const restoreSelection = (spot) => {
  const block = [...(document.getElementById(spot.turn)?.querySelectorAll(TEXT_BLOCK) || [])][spot.n];
  if (!block) return;
  const point = (off) => {
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node, left = off; (node = walk.nextNode()); ) {
      if (left <= node.length) return [node, left];
      left -= node.length;
    }
    return null;
  };
  const [a, b] = [point(spot.from), point(spot.to)];
  if (!a || !b) return;
  const r = document.createRange();
  r.setStart(...a);
  r.setEnd(...b);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
};
const snapshotView = () => {
  const spots = [];
  const seen = {};
  for (const el of app.querySelectorAll(SCROLLERS)) {
    const k = el.className;
    const i = (seen[k] = (seen[k] ?? -1) + 1);
    if (el.scrollTop || el.scrollLeft) spots.push({ k, i, top: el.scrollTop, left: el.scrollLeft });
  }
  const fields = [...app.querySelectorAll(".sheet input, .sheet textarea, .sheet select")];
  const typed = fields.filter((f) => f.dataset.edited && textLike(f)).map((f) => ({ key: fieldKey(f, fields), value: f.value }));
  const active = fields.includes(document.activeElement) ? document.activeElement : null;
  return {
    spots,
    typed,
    focus: active && fieldKey(active, fields),
    sel: active && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null,
    // The sheet on screen now, not S.sheet (already the next one when a new sheet opens).
    sheet: app.querySelector(".sheet")?.getAttribute("aria-label"),
    selection: selectionSpot(),
    pinned: nearBottom(),
  };
};
const restoreView = (v, hadSheet) => {
  const sameSheet = hadSheet && sheetTitle() === v.sheet;
  const seen = {};
  for (const el of app.querySelectorAll(SCROLLERS)) {
    const k = el.className;
    const i = (seen[k] = (seen[k] ?? -1) + 1);
    // A different sheet opening starts at its top; the same sheet redrawn keeps its place.
    if (/\b(sheet|body)\b/.test(k) && !sameSheet) continue;
    const spot = v.spots.find((x) => x.k === k && x.i === i);
    if (spot) (el.scrollTop = spot.top), (el.scrollLeft = spot.left);
  }
  if (sameSheet) {
    const fields = [...app.querySelectorAll(".sheet input, .sheet textarea, .sheet select")];
    const byKey = new Map(fields.map((f) => [fieldKey(f, fields), f]));
    for (const t of v.typed) {
      const f = byKey.get(t.key);
      if (f) (f.value = t.value), (f.dataset.edited = "1");
    }
    const f = v.focus && byKey.get(v.focus);
    if (f) {
      f.focus({ preventScroll: true });
      if (v.sel) try { f.setSelectionRange(v.sel[0], v.sel[1]); } catch (e) {}
    }
  }
  if (v.selection) restoreSelection(v.selection);
};
// A field counts as typed into once the person changed it.
document.addEventListener("input", (e) => {
  if (e.target?.closest?.(".sheet")) e.target.dataset.edited = "1";
}, true);

const withClass = (el, cls) => (cls && el.classList.add(cls.trim()), el);
render = () => {
  const keepFocus = document.activeElement?.dataset?.keep;
  const draft = document.querySelector("#msg")?.value;
  const view = snapshotView();
  const hadSheet = !!document.querySelector(".sheet");
  const hadDrawer = !!document.querySelector(".drawer");
  app.replaceChildren(...[safeBanner(), renderTop(), renderMessages(), jumpButton(), ...renderComposer(draft)].filter(Boolean));
  // A layer slides in only when it opens, never again on a redraw (that read as it
  // tucking away and reopening on every tap).
  const enter = (was) => (was ? "" : " enter");
  if (S.sv) app.append(svLayer());
  if (S.drawer) app.append(h("div", { class: "drawer-scrim", onclick: closeDrawer }), withClass(renderDrawer(), enter(hadDrawer)));
  if (S.siteMenu) app.append(siteMenu());
  if (S.sheet) app.append(withClass(renderSheet(), enter(hadSheet)));
  maybeTour();
  const tl = S.tour && tourLayer();
  if (tl) app.append(tl);
  if (S.help || S.helpCard) app.append(helpLayer());
  restoreView(view, hadSheet);
  if (S.tour) tourSpot();
  // Reading at the very bottom, you stay at the bottom as the chat grows; anywhere
  // above it, your place is never moved (new replies show on the jump button).
  if (view.pinned && followOn()) scrollDown();
  if (keepFocus) document.querySelector(`[data-keep="${keepFocus}"]`)?.focus({ preventScroll: true });
  syncSiteView();
};

const safeBanner = () =>
  SAFE ? h("div", { class: "safe-banner", role: "status" }, h("span", { class: "grow" }, "Safe mode: only built-in plugins are on."), h("button", { class: "small", onclick: () => restart(false) }, "Leave safe mode")) : null;

scrollDown = (smooth = false) => {
  const m = document.querySelector(".chat");
  if (m) m.scrollTo({ top: m.scrollHeight, behavior: smooth ? "smooth" : "auto" });
};
const nearBottom = () => {
  const m = document.querySelector(".chat");
  return !m || m.scrollHeight - m.scrollTop - m.clientHeight < 80;
};
const followOn = () => S.config?.ui?.follow !== false;

// Replies never move the chat: you scroll. A new reply shows on the jump
// button ("1 new reply"); tapping it goes to the start of that reply.
S.unseen = [];
S.openTrace = new WeakSet(); // replies whose full sent text is open
// "+ tag" under a reply: a tag for that message only.
const addTagPrompt = async (c, t) => {
  const v = await askText("Tag for this message", "", "Add");
  if (v) addMessageTag(c, t, v).catch((e) => toast(e.message, "error"));
};
markUnseen = (chat, turn) => {
  if (S.chat !== chat) return;
  const i = chat.turns.indexOf(turn);
  if (i >= 0 && !S.unseen.includes(i)) S.unseen.push(i);
};
const jumpButton = () => {
  const n = S.unseen.length;
  const far = (() => {
    const m = document.querySelector(".chat");
    return !!m && m.scrollHeight - m.scrollTop - m.clientHeight > 60;
  })();
  return h(
    "button",
    {
      class: "jump" + (n ? " new" : ""),
      hidden: !(n || far),
      title: n ? "Go to the new reply" : "Jump to the newest message",
      onclick: () => {
        if (S.unseen.length) {
          const i = Math.min(...S.unseen);
          S.unseen = [];
          document.getElementById("turn-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.querySelector(".jump")?.replaceWith(jumpButton());
        } else scrollDown(true);
      },
    },
    n ? `${n} new ${n === 1 ? "reply" : "replies"} ↓` : "Jump to latest ↓",
  );
};
// Seen = scrolled into view.
const checkSeen = (box) => {
  if (!S.unseen.length) return;
  const bottom = box.getBoundingClientRect().bottom;
  const before = S.unseen.length;
  S.unseen = S.unseen.filter((i) => {
    const el = document.getElementById("turn-" + i)?.querySelector(".ai");
    return !el || el.getBoundingClientRect().top > bottom - 60;
  });
  if (S.unseen.length !== before) document.querySelector(".jump")?.replaceWith(jumpButton());
};

renderStatus = () => {
  const el = document.querySelector(".top .site-pill");
  if (el) el.replaceWith(siteButton());
  const pr = document.querySelector(".progress .progress-text");
  if (pr) pr.textContent = composerProgress();
  renderLive();
};
// Under the message box: other work, and replies coming in other chats.
const composerProgress = () => {
  const others = Object.values(S.pageTurns).filter((t) => !S.chat?.turns.includes(t)).length;
  return [S.progress, others ? `${others} ${others === 1 ? "reply" : "replies"} coming in other chats` : ""].filter(Boolean).join(" · ");
};

// The last line of the thinking so far, for the one-line "Thinking · …".
const lastLine = (text) => (String(text).trim().split("\n").filter((l) => l.trim()).pop() || "").replace(/[*_#`>]/g, "").slice(-120);
// The waiting message: thinking (one line, tap to unfold) and the reply so far, as the page shows them.
// A live box is built once and then UPDATED IN PLACE as the page's text grows: the
// nodes stay, so a fold you opened stays open, a scroll stays, and text you are
// selecting is not torn out from under your finger. (Rebuilding the box on every
// chunk collapsed the thinking and cleared selections within a tenth of a second.)
const setHtml = (el, html) => {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
};
const syncLive = (box, t) => {
  const L = t.live || {};
  let det = box.querySelector(":scope > details.live");
  let body = box.querySelector(":scope > .live-reply");
  let line = box.querySelector(":scope > .progress-line");
  if (!line) {
    line = h("div", { class: "text muted progress-line" }, h("span", { class: "live-progress-text" }));
    box.append(line);
  }
  if (L.thinking) {
    if (!det) {
      det = h("details", { class: "thinking live", open: t.liveOpen ?? !!S.thinkingOpen, ontoggle: (e) => (t.liveOpen = e.target.open) }, h("summary", {}), h("div", { class: "md" }));
      box.prepend(det);
    }
    const sum = det.firstChild;
    const key = L.reply ? "Thought" : "Thinking · " + lastLine(L.thinking);
    if (sum._key !== key) {
      sum._key = key;
      sum.replaceChildren(L.reply ? "Thought" : h("span", { class: "think-line" }, h("span", { class: "think-mark", "aria-hidden": "true" }), "Thinking", h("span", { class: "think-last" }, " · " + lastLine(L.thinking))));
    }
    setHtml(det.lastChild, mdToHtml(L.thinking));
  } else det?.remove();
  if (L.reply) {
    if (!body) {
      body = h("div", { class: "text md live-reply" }, h("div"));
      line.before(body);
    }
    setHtml(body.firstChild, mdToHtml(L.reply));
  } else body?.remove();
  line.firstChild.textContent = t.progress || "…";
  const stop = line.querySelector("button");
  if (t.page != null && !stop) line.append(h("button", { class: "ghost small", title: "Stop waiting for this reply", onclick: () => api("/api/site", { cmd: "cancel", page: t.page }).catch((e) => toast(e.message, "error")) }, "Stop waiting"));
  else if (t.page == null && stop) stop.remove();
};
// Text being selected inside a live box is left alone until the selection ends,
// then the box catches up.
const selectingIn = (box) => {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && !!sel.anchorNode && box.contains(sel.anchorNode);
};
const renderLive = () => {
  if (!S.chat) return;
  const pinned = nearBottom() && followOn();
  document.querySelectorAll(".live-box").forEach((box) => {
    const t = S.chat.turns[+box.dataset.turn];
    if (!t || !t.pending) return;
    if (selectingIn(box)) return void (box.dataset.stale = "1");
    delete box.dataset.stale;
    syncLive(box, t);
  });
  if (pinned) scrollDown();
};
document.addEventListener("selectionchange", () => {
  if (document.querySelector(".live-box[data-stale]")) renderLive();
});

// The site's state in plain words (one vocabulary for the dot, the header and the site sheet).
const siteState = () => {
  if (!siteFor()) return { key: "none", words: "No site plugin" };
  if ([...Array(pageCount()).keys()].some((i) => pg(i).busy)) return { key: "busy", words: "Busy" };
  if (!S.site.connected) return { key: "off", words: "Page not open" };
  if (S.site.url && !sameHost(S.site.url, siteFor().url)) return { key: "off", words: "Page on another site" };
  return { key: "ready", words: "Ready" };
};

// "● site · model" in the header: the site, the model read from the page (or
// the one you picked, marked "wanted" until the page shows it) and the state.
const siteButton = () => {
  const st = siteState();
  const want = siteIdOf() ? choicesFor().model : "";
  const onPage = S.site.model || "";
  const model = onPage || want;
  const mismatch = want && onPage && !onPage.toLowerCase().includes(want.toLowerCase());
  const site = siteFor();
  const short = site ? site.name.split(" ")[0] : "No site";
  const busy = Object.keys(S.pageTurns || {}).length;
  return h("button", { class: "pill site-pill " + st.key, title: `${st.words}${mismatch ? ` · the page shows ${onPage}, you picked ${want}` : ""} · switch site`, "aria-label": "Switch site", "aria-haspopup": "menu", "aria-expanded": String(!!S.siteMenu), onclick: () => ((S.siteMenu = !S.siteMenu), render()) },
    h("span", { class: "dot", "aria-hidden": "true" }),
    h("span", { class: "tx" }, short + (model ? " · " + shortModel(model) + (mismatch ? " ⚠" : "") : "") + (busy > 1 ? ` · ${busy} replying` : "")),
    h("span", { class: "ch", style: "margin-left:4px" }, svgIcon("down")),
    siteUpdate() ? h("span", { class: "pdot", title: "Update available" }) : null);
};
// "Qwen3-Max" -> "Max": the part after the name's own digits.
const shortModel = (m) => m.replace(/^[A-Za-z]+\d*[.\d]*-?/, "") || m;
// The open chat's site plugin has an update waiting (the pill gets a dot).
const siteUpdate = () => {
  const id = siteIdOf();
  return !!id && updateItems().some((i) => i.id === id);
};
// The pill's menu: each site with its model, then "Site, model and profile…".
// Picking a site switches the open chat to it (and new chats start on it).
const pickChatSite = async (id) => {
  S.siteMenu = false;
  if (id !== siteIdOf()) {
    setChatSite(id);
    if (S.chat.path) await saveChat(S.chat, "site: " + pluginName(id)).catch((e) => toast(e.message, "error"));
    toast("This chat uses " + pluginName(id));
  }
  render();
  warmSite();
};
const siteMenu = () => {
  const cur = siteIdOf();
  const sites = [...S.plugins.values()].filter(isSite);
  const close = () => ((S.siteMenu = false), render());
  return h("div", { class: "layer", style: "z-index:14" },
    h("div", { style: "position:absolute;inset:0", onclick: close }),
    h("div", { class: "sitemenu", role: "menu" },
      ...sites.map((x) => h("button", { role: "menuitemradio", "aria-checked": String(x.id === cur), class: "it", "data-row": "sitemenu." + x.id, onclick: () => pickChatSite(x.id) },
        h("span", { class: "on" }, x.id === cur ? "●" : "○"),
        h("div", { class: "g" }, x.manifest.name, h("small", {}, (x.id === cur ? S.site.model : "") || choicesFor(x.id).model || "Model: as the site has it")),
        h("span", { class: "dot", style: "margin:0" }))),
      sites.length ? h("div", { class: "sep" }) : null,
      h("button", { role: "menuitem", class: "it", "data-row": "sitemenu.more", onclick: () => ((S.siteMenu = false), openSiteSheet()) }, h("div", { class: "g" }, sites.length ? "Site, model and profile…" : "Get site plugins…"))));
};

const SAFETY = "Use a separate account on the AI site (a throwaway Gmail works), not an important one: promptpipe drives the site for you and isn't built for account security. You can also sign in by hand on the site.";


// The site sheet: everything about the site in one place.
const openSiteSheet = () =>
  openSheet("Profile and site", () => {
    const prof = profile();
    const site = siteFor();
    const st = siteState();
    const want = site ? choicesFor().model : "";
    const sites = [...S.plugins.values()].filter(isSite);
    const pr = S.plugins.get("page-report");
    const upd = site && updateItems().find((i) => i.id === site.id);
    const pageItem = (label, sub, fn, id) => item({ id: "site." + id, label, sub, onclick: fn });
    return [
      !site ? item({ id: "site.get", prim: true, label: "Get site plugins", sub: "No AI site yet", onclick: openGetSites }) : null,
      upd ? item({ id: "site.upd", prim: true, label: `${site.name} ${upd.update.entry.version} is available`, sub: "Updates on its own; tap to do it now", onclick: LIB.busy ? null : () => installOffers([upd.update], { quiet: true }).then(() => toast(`${site.name} updated to ${upd.update.entry.version}`)) }) : null,
      h("div", { class: "lbl" }, "Profile"),
      profileDropdown({ id: "site", current: prof, pick: (p) => (switchProfile(p.id), rerenderSheet()) }),
      site ? h("div", { class: "lbl" }, "AI site (for this chat)") : null,
      site ? item({ id: "site.sitesw", label: site.name, sub: sites.length > 1 ? "Switch site" : "The only site plugin installed", onclick: sites.length > 1 ? () => ((S.sheet = null), (S.siteMenu = true), syncLayer(), render()) : openGetSites }) : null,
      site ? pageItem("Show the page", `${site.name} · ${st.words}${S.site.url ? " · " + S.site.url : ""}`, () => showSite(), "show") : null,
      site ? item({ id: "site.model", label: S.site.model || want || "Choose a model", sub: "Model and switches" + (want && S.site.model && !S.site.model.toLowerCase().includes(want.toLowerCase()) ? " · you picked " + want : ""), key: "Ctrl+M", onclick: openModels }) : null,
      h("div", { class: "lbl" }, "This chat and the page"),
      pageItem("Link this chat to the open page", null, linkToSite, "link"),
      pageItem("Import messages from the site chat", null, importHistory, "import"),
      pageItem("Add the page's newest reply", null, addFromPage, "newest"),
      h("div", { class: "lbl" }, "Pages"),
      item({ id: "site.pages", label: `${maxReplies()} replies at once at most`, sub: `${pageCount()} ${pageCount() === 1 ? "page is" : "pages are"} open`, right: "Change", onclick: () => settingsPage("Sites", settingsBody("Sites")) }),
      h("div", { class: "lbl" }, "Site plugins"),
      item({ id: "site.getsites", label: "Get site plugins", chev: true, onclick: openGetSites }),
      site ? item({ id: "site.plugset", label: "Site plugin settings", chev: true, onclick: () => openPluginSettings(site.id) }) : null,
      h("div", { class: "lbl" }, "Developer"),
      ...((pr && pr.def && pr.def.menu) || []).map((m) => item({ id: "site.dev." + m.label, label: m.label, onclick: () => Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error")) })),
      item({ id: "site.decode", label: "Decode the newest reply (preview)", onclick: decodeLast }),
    ];
  });

const renderTop = () => {
  const c = S.chat;
  return h(
    "header",
    { class: "top" },
    h("button", { class: "ic", title: "Chats · Ctrl+B", "aria-label": "Chats", onclick: openDrawer }, svgIcon("menu"), Object.keys(S.chatStatus || {}).some((k) => S.chatStatus[k] === "Reply ready") ? h("span", { class: "pdot", style: "top:2px;right:2px" }) : null),
    h("button", { class: "t", title: "Chat actions · F2", "aria-label": "Chat title", onclick: openChatSheet }, (c.meta.title || "New chat") + " ▾"),
    siteButton(),
    ...topBlocks(),
    h("button", { class: "ic find", title: "Find chats and functions · Ctrl+K or F3", "aria-label": "Find chats and functions", onclick: () => openFind() }, svgIcon("search")),
    helpBtn(),
  );
};

// Line icons, drawn with the text colour.
const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  send: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  edit: '<path d="M5 19l1-4 9-9 3 3-9 9zM13.5 7.5l3 3"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  quote: '<path d="M10 8H6v5h4zM18 8h-4v5h4zM10 13c0 2-1 3-3 4M18 13c0 2-1 3-3 4"/>',
  stackadd: '<path d="M10 3l8 4-8 4-8-4z"/><path d="M2 12l8 4 8-4"/><path d="M19 15v6M16 18h6"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
  chat: '<path d="M5 6h14v9H10l-4 4v-4H5z"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 5v4h4M12 8v4l3 2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  plugins: '<path d="M9 4v4M15 4v4M7 8h10v4a5 5 0 0 1-10 0zM12 17v3"/>',
  prompt: '<path d="M5 6h14v10H9l-4 4z"/><path d="M9 10h6"/>',
  look: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  sites: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
  storage: '<path d="M4 7a8 3 0 0 1 16 0v10a8 3 0 0 1-16 0zM4 7a8 3 0 0 0 16 0M4 12a8 3 0 0 0 16 0"/>',
  impexp: '<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>',
  api: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  adv: '<path d="M12 4l7 4v8l-7 4-7-4V8z"/><circle cx="12" cy="12" r="2"/>',
  retry: '<path d="M19 12a7 7 0 1 1-2.1-5M19 5v4h-4"/>',
  select: '<path d="M5 7h14M5 12h9M5 17h12"/>',
};
const svgIcon = (name) => {
  const span = h("span", { class: "svg", "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
};

// One row of a sheet, as in the wireframe: a card with an optional icon, a label with a small
// second line, and at the end a key, a badge, a value, a switch, a dot or a chevron.
const item = (o) => {
  const on = (v) => (v == null ? null : v);
  return h(
    o.onclick ? "button" : "div",
    { class: "it" + (o.prim ? " prim" : "") + (o.cls ? " " + o.cls : ""), onclick: o.onclick, "data-row": o.id, "aria-label": o.aria },
    o.icon ? svgIcon(o.icon) : null,
    h("div", { class: "g" }, o.label, o.sub ? h("small", {}, o.sub) : null),
    o.key ? h("kbd", {}, o.key) : null,
    o.badge ? h("span", { class: "badge" }, o.badge) : null,
    o.right ? h("span", { class: "ch on" }, o.right) : null,
    on(o.toggle) != null ? h("span", { class: "sw" + (o.toggle ? " on" : "") }) : null,
    on(o.radio) != null ? h("span", { class: "on" }, o.radio ? "●" : "○") : null,
    o.chev ? h("span", { class: "ch" }, "›") : null,
  );
};

PP.item = (o) => item(o); // for plugins that draw sheets (same rows as the app)
const tagChip = (t, { onRemove, onBump, dim } = {}) =>
  h(
    "span",
    { class: "tag" + (counterOf(t) || t.endsWith("#") ? " counter" : "") + (dim ? " inh" : ""), title: dim ? "From the chat tags" : t.endsWith("#") ? "Each new message gets the next number" : "" },
    "#" + (t.endsWith("#") ? t + "n" : t),
    onBump && h("button", { title: "Next number", onclick: () => onBump().catch((e) => toast(e.message, "error")) }, "+1"),
    onRemove && h("button", { title: "Remove tag", "aria-label": "Remove " + t, onclick: () => onRemove().catch((e) => toast(e.message, "error")) }, "✕"),
  );

const renderMessages = () => {
  const c = S.chat;
  const box = h("main", { class: "chat" });
  if (!c.turns.length) {
    // A new chat is empty, as in the wireframe. Only what you need to start is said here.
    const lines = [];
    if (!siteFor())
      lines.push(
        h("p", {}, "No AI site yet. PromptPipe talks to the AI chat site you log in to, through a site plugin."),
        h("div", { class: "row" }, h("button", { class: "it prim", style: "width:auto", onclick: openGetSites }, "Get site plugins"), h("button", { class: "pill", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file")),
      );
    if (c.meta.source) lines.push(h("p", {}, "Linked to " + c.meta.source + ". Your message continues that chat."), h("div", { class: "row" }, h("button", { class: "pill", onclick: importHistory }, "Import its earlier messages")));
    if (lines.length) box.append(h("div", { class: "empty" }, lines));
  }
  c.turns.forEach((t, i) => {
    const extra = pluginTurnParts(c, t, i);
    box.append(...extra.before, renderTurn(c, t, i), ...extra.after);
  });
  (c.failed || []).forEach((f, i) =>
    box.append(
      h("article", { class: "turn failed" },
        h("div", { class: "youwrap" }, h("div", { class: "you" }, f.you)),
        h("div", { class: "ai" },
          h("div", { class: "error" }, "✕ Not sent: " + f.error),
          h("div", { class: "chips", style: "margin-top:6px" },
            h("button", { class: "pill on", title: "The site may be answering anyway: wait for that reply and keep it", onclick: () => (c.failed.splice(i, 1), checkFailed(c, f)) }, "Check"),
            h("button", { class: "pill", onclick: () => (c.failed.splice(i, 1), send(f.you)) }, "Retry"),
            h("button", { class: "pill", onclick: () => (c.failed.splice(i, 1), render(), fillComposer(f.you)) }, "Edit"),
            h("button", { class: "pill", onclick: () => (c.failed.splice(i, 1), render()) }, "Dismiss")))),
    ),
  );
  // Queued: waiting for the message before them to be answered.
  const queued = c.queued || [];
  queued.forEach((q, i) =>
    box.append(
      h("article", { class: "turn queued" },
        h("div", { class: "youwrap" }, h("div", { class: "you" }, q.you),
          h("div", { class: "foot" }, `Queued ${i + 1} of ${queued.length} · goes out after the reply above`),
          h("div", { class: "chips" },
            i > 0 ? h("button", { class: "pill", "aria-label": "Send earlier", onclick: () => ([queued[i - 1].you, q.you] = [q.you, queued[i - 1].you], render()) }, "↑") : null,
            h("button", { class: "pill", onclick: () => (queued.splice(i, 1), render(), fillComposer(q.you)) }, "Edit"),
            h("button", { class: "pill", onclick: () => (queued.splice(i, 1), render()) }, "Remove")))),
    ),
  );
  box.addEventListener("scroll", () => {
    const away = box.scrollHeight - box.scrollTop - box.clientHeight > 60;
    const j = document.querySelector(".jump");
    if (j) j.hidden = !(away || S.unseen.length > 0);
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
  for (const e of activePlugins(forChat(profile(), c))) {
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

// What a plugin's message action does to a reply (from the message menu).
const runMessageAction = async (c, t, i, p, a) => {
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
};

// The trace: what went out and what came back, step by step.
const traceOf = (t) => {
  const trace = S.traces.get(t);
  return [
    ...(trace || [
      { label: "You", text: t.you },
      { label: "Sent", text: t.sent },
      { label: "Raw reply", text: t.raw },
      { label: "Shown", text: t.reply },
    ]).map((s) => h("div", { class: "stage" + (s.error ? " err" : "") }, h("b", {}, s.label + (s.notes && s.notes.length ? " (" + s.notes.join("; ") + ")" : "")), h("pre", {}, s.text))),
    t.notes && t.notes.length ? h("p", { class: "muted" }, t.notes.join(" · ")) : null,
  ];
};

// One menu for every message: the message quoted at the top, then its actions.
const openMessageMenu = (c, t, i) => {
  const last = i === c.turns.length - 1;
  const item = (label, run, opts = {}) => h("button", { class: "it" + (opts.danger ? " danger" : ""), onclick: run }, h("div", { class: "g" }, label), opts.key ? h("kbd", {}, opts.key) : null);
  openSheet("Message", () => {
    const own = t.tags || [];
    const inherited = ChatFile.messageTags(c.meta, t).filter((x) => !own.includes(x));
    const plugin = [];
    for (const p of S.plugins.values()) for (const a of p.def?.messageActions || []) plugin.push(item(`${a.label} · ${pluginName(p.id)}`, () => (closeSheet(), runMessageAction(c, t, i, p, a))));
    return [
      h("blockquote", { class: "menu-quote" }, (t.reply || t.you || "").slice(0, 240) + ((t.reply || "").length > 240 ? "…" : "")),
      h("div", { class: "body", style: "padding:0;overflow:visible" },
        item("Copy the reply", () => copyText(t.reply, "Copied"), { key: "swipe ←" }),
        item("Quote it in your next message", () => (closeSheet(), fillComposer(quote(t.reply), "append")), { key: "swipe →" }),
        item("Select text", () => openSelect(t)),
        item("Copy your message", () => copyText(t.you, "Copied")),
        t.thinking ? item("Copy the thinking", () => copyText(t.thinking, "Copied")) : null,
        item("Send your message again", () => (closeSheet(), send(t.you))),
        last ? item("Edit and send again", () => (closeSheet(), editLast()), { key: "↑" }) : null,
        ...plugin),
      h("h3", {}, "Tags"),
      h("div", { class: "chips" },
        own.map((x) => tagChip(x, { onRemove: () => (removeMessageTag(c, t, x), setTimeout(rerenderSheet, 50)), onBump: counterOf(x) ? () => addMessageTag(c, t, counterOf(x)[1] + "#") : null })),
        inherited.map((x) => tagChip(x, { dim: true })),
        tagInput("+ tag", (v) => (addMessageTag(c, t, v), setTimeout(rerenderSheet, 50)), "mtag-menu")),
      h("h3", {}, "What was sent"),
      h("details", { class: "trace" }, h("summary", {}, "Show the trace (what went out, what came back)"), ...traceOf(t)),
    ];
  });
};

// Quick actions under a reply: "newest" (default), "every" or "off" (collapsed). A tap on the
// toggle overrides it for that reply.
const qaMode = () => S.config.quickActions || "newest";
const qaOpen = (t, newest) => (S.qaSet.has(t) ? S.qaSet.get(t) : qaMode() === "every" || (qaMode() === "newest" && newest));
// What went out with a reply: the profile's rows that were on, then your message.
const sentWith = (t, c = S.chat) => {
  const prof = forChat(S.config.profiles.find((p) => p.name === t.profile), c);
  const rows = prof ? prof.pipe.rows.filter((r) => r.type !== "message" && r.on !== false && PP.pipeline.rowLive(prof.pipe, r)).map((r) => PP.pipeline.rowName(r)) : [];
  return { prof, rows };
};

// Long: more than 8 lines or 600 characters.
const isLongText = (text) => String(text || "").length > 600 || String(text || "").split("\n").length > 8;
const renderTurn = (c, t, i) => {
  const own = t.tags || [];
  const inherited = ChatFile.messageTags(c.meta, t).filter((x) => !own.includes(x));
  const newest = i === c.turns.findLastIndex((x) => !x.pending);
  const open = qaOpen(t, newest);
  const menu = () => openMessageMenu(c, t, i);
  const act = (icon, label, run) => h("button", { class: "act", "aria-label": label, title: label, onclick: run }, svgIcon(icon));
  const toggleQa = () => (S.qaSet.set(t, !open), render());
  const plugActs = [...S.plugins.values()].flatMap((p) => p.def?.messageActions || []);
  // The footer: ⋯ and the time (and how many tags); opened: Copy, Quote, Send again, Select text, More, and the tags.
  const foot = t.pending
    ? null
    : !open
      ? h("div", { class: "foot" }, act("more", "Show actions", toggleQa), h("span", { class: "time" }, ChatFile.stamp(t.at).slice(11)), own.length ? h("span", { class: "tg", title: "Message tags" }, "#" + own.length) : null)
      : h("div", { class: "exp" },
          h("div", { class: "foot" }, act("up", "Hide actions", toggleQa), h("span", { class: "time" }, ChatFile.stamp(t.at).slice(11))),
          h("div", { class: "acts" },
            act("copy", "Copy", () => copyText(t.reply, "Copied")),
            act("quote", "Quote", () => fillComposer(quote(t.reply), "append")),
            act("retry", "Send again", () => send(t.you)),
            act("select", "Select text", () => openSelect(t)),
            plugActs.length ? act("more", "More: what was sent, plugin actions", menu) : null),
          h("div", { class: "chips" },
            own.map((x) => h("span", { class: "tag" + (counterOf(x) ? " counter" : "") }, "#" + x)),
            inherited.map((x) => h("span", { class: "tag inh", title: "From the chat tags" }, "#" + x)),
            h("button", { class: "pill", onclick: () => addTagPrompt(c, t) }, "+ tag")));
  // Your own message, with Copy and Edit and send again under it. A long one (a paste) is
  // tucked to a few lines; Show more opens it, and it stays open across redraws.
  const long = isLongText(t.you);
  const tucked = long && !S.openLong.has(t);
  const you = h("div", { class: "youwrap" },
    h("div", { class: "you" + (tucked ? " tuck" : ""), title: ChatFile.stamp(t.at) }, t.you),
    long ? h("button", { class: "thin", "aria-expanded": String(!tucked), onclick: () => (tucked ? S.openLong.add(t) : S.openLong.delete(t), render()) }, svgIcon(tucked ? "down" : "up"), tucked ? "Show more" : "Show less") : null,
    h("div", { class: "acts right" }, act("copy", "Copy your message", () => copyText(t.you, "Copied")), act("edit", "Edit and send again", () => fillComposer(t.you))));
  // "Thought for N s · sent with N": folded; opened it shows the thinking, what was sent with it, and the full trace.
  const sw = sentWith(t, c);
  const sentOpen = S.openSent.has(t);
  const thin = t.pending ? null : h("button", { class: "thin", "aria-expanded": String(sentOpen), onclick: () => (S.openSent.has(t) ? S.openSent.delete(t) : S.openSent.add(t), render()) },
    svgIcon(sentOpen ? "up" : "down"), t.thinking ? (t.secs != null ? `Thought for ${t.secs} s` : "Thought") : "Sent with", h("span", { class: "dim2" }, (t.thinking ? " · sent with " : " ") + (sw.rows.length + 1)));
  const thinBox = !sentOpen || t.pending ? null : h("div", { class: "thinbox" },
    t.thinking ? [h("div", { class: "lbl" }, "Thinking"), h("div", { class: "md", html: mdToHtml(t.thinking) })] : null,
    h("div", { class: "lbl" }, "Sent with"),
    h("div", { class: "sentlist" }, h("div", {}, "Profile: " + (t.profile || "?") + (c.meta.model ? " · " + c.meta.model : "")), ...sw.rows.map((r) => h("div", {}, "· " + r)), h("div", {}, "· Your message")),
    S.openTrace.has(t)
      ? h("details", { class: "trace", open: true, ontoggle: (e) => !e.target.open && (S.openTrace.delete(t), render()) }, h("summary", {}, "The full text that was sent"), ...traceOf(t))
      : h("button", { class: "pill", onclick: () => (S.openTrace.add(t), render()) }, "Show the full text"));
  const art = h(
    "article",
    { class: "turn" + (S.highlight === i ? " hit" : ""), id: "turn-" + i },
    you,
    h(
      "div",
      { class: "ai" + (t.error ? " has-error" : "") },
      h("small", { class: "who" }, [c.meta.ai || "AI", c.meta.model].filter(Boolean).join(" · ")),
      t.pending
        ? (() => { const box = h("div", { class: "live-box", "data-turn": i }); syncLive(box, t); return box; })()
        : h("div", { class: "md", html: mdToHtml(t.reply) }),
      t.error ? h("div", { class: "error" }, "✕ " + t.error) : null,
      thin,
      thinBox,
      foot,
    ),
  );
  const ai = art.querySelector(".ai");
  if (!t.pending) {
    // Desktop right-click opens the menu. On a phone a long-press selects text, so the menu is the ⋯ buttons.
    ai.addEventListener("contextmenu", (e) => {
      if (!matchMedia("(pointer: fine)").matches) return;
      e.preventDefault();
      menu();
    });
  }
  onSwipe(ai, (dir) => (dir > 0 ? fillComposer(quote(t.reply), "append") : copyText(t.reply, "Copied")));
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
    const copy = () => copyText(pre.querySelector("code")?.textContent ?? pre.textContent, "Code copied");
    pre.prepend(h("button", { class: "code-copy", onclick: copy }, "Copy"));
  }
};

// Plugin blocks: a switch per plugin (its own block if it draws one).
// Blocks marked advanced sit in the Advanced row, which is folded but always shown.
const blockFor = (e, n) => {
  const p = S.plugins.get(e.id);
  const label = p.manifest.block?.label || p.manifest.name || p.id;
  // The switch is this chat's own (the profile's is the default it starts from).
  const on = stepOn(e.id, forChat(profile(), S.chat));
  const toggle = () => {
    const P = PP.pipeline;
    if (P) P.setChatSwitch(S.chat, e.id, !on, stepOn(e.id));
    else setStepOn(e.id, !on);
    saveSwitches();
    render();
  };
  const pill = (text) =>
    h(
      "span",
      { class: "pill " + (on ? "on" : "off") + (p.error ? " broken" : "") },
      h("button", { class: "pill-main", "aria-pressed": String(on), title: (n <= 9 ? `Alt+${n} toggles. ` : "") + (p.manifest.description || ""), onclick: toggle }, h("span", { class: "dot" }), text ?? label),
      h("button", { class: "pill-gear", title: "Settings", "aria-label": label + " settings", onclick: () => openPluginSettings(e.id) }, svgIcon("settings")),
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

const topBlocks = () => blockEntries("top").map((e, i) => blockFor(e, 99));

// The message bar, as in the wireframe: Quick edit, the box, bigger box, Send. A line under it
// says what else is going on (other chats being answered).
const renderComposer = (draft) => {
  const big = !!S.expanded;
  const ta = h("textarea", {
    id: "msg",
    "data-keep": "composer",
    placeholder: "Message",
    "aria-label": "Message",
    rows: 1,
    value: draft ?? local("draft") ?? "",
    oninput: (e) => {
      local("draft", e.target.value);
      grow(e.target);
      const b = document.querySelector(".comp .send");
      if (b && b.classList.contains("stop") !== !!(waitingTurn() && !e.target.value.trim())) b.replaceWith(sendButton(e.target.value));
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
  return [
    h("div", { class: "comp" + (big ? " big" : "") },
      h("button", { class: "ic", title: "Quick edit and add", "aria-label": "Quick edit and add", onclick: openQuick }, svgIcon("stackadd")),
      ta,
      h("button", { class: "ic", onclick: toggleExpand, title: (big ? "Smaller" : "Bigger") + " message box (Ctrl+E)", "aria-label": big ? "Smaller message box" : "Bigger message box" }, svgIcon(big ? "shrink" : "expand")),
      sendButton(ta.value)),
    h("div", { class: "progress" }, h("span", { class: "progress-text" }, composerProgress())),
  ];
};

// The reply this chat is waiting for (on a site page), if any.
const waitingTurn = () => S.chat?.turns.find((t) => t.pending && t.page != null);
// Send, or Stop while a reply is coming and the box is empty (type to queue a message instead).
const sendButton = (text = "") => {
  const t = waitingTurn();
  if (t && !text.trim())
    return h("button", { class: "send stop", title: "Stop waiting for the reply · Esc", "aria-label": "Stop", onclick: () => api("/api/site", { cmd: "cancel", page: t.page }).then(() => toast("Stopped waiting"), (e) => toast(e.message, "error")) }, svgIcon("stop"));
  return h("button", { class: "send", onclick: send, title: "Send · Ctrl+Enter" + (t ? " (it waits its turn)" : ""), "aria-label": "Send" }, svgIcon("send"));
};

// Expand mode: the message box takes most of the screen for long text.
const toggleExpand = () => {
  S.expanded = !S.expanded;
  render();
  const ta = document.querySelector("#msg");
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
  const ta = document.querySelector("#msg");
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
    await runChat(chat, text, profileOf(chat));
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
  const ta = document.querySelector("#msg");
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
// ---------- asking ----------
// The app's own confirm and text prompt (the app's browser has none of its own).
// askUser(message, { value, ok, danger }) resolves to true / the text, or null on Cancel.
// As in the wireframe: a sheet over everything. A question gets "Are you sure?" with Yes
// and Cancel; asking for text shows the question, a box, and OK / Cancel.
const askUser = (message, { value = null, ok = "OK", danger = false } = {}) =>
  new Promise((done) => {
    const input = value === null ? null : h("input", { value, "aria-label": message });
    const finish = (v) => (wrap.remove(), done(v));
    const yes = () => finish(input ? input.value.trim() : true); // "" when emptied; null only on Cancel
    const wrap = h("div", { class: "layer ask-wrap" },
      h("div", { class: "dim", onclick: () => finish(null) }),
      h("section", { class: "sheet", role: "alertdialog", "aria-label": message, style: "min-height:0" },
        h("div", { class: "sh" }, input ? message : "Are you sure?"),
        input ? h("div", { class: "field" }, input) : h("p", { style: "margin:0 0 8px" }, message),
        h("div", { class: "chips" },
          h("button", { class: "it prim", style: "width:auto" + (danger ? ";background:var(--err)!important" : ""), onclick: yes }, input ? ok : danger && ok !== "OK" ? ok : "Yes"),
          h("button", { class: "it", style: "width:auto", onclick: () => finish(null) }, "Cancel"))));
    if (input) input.addEventListener("keydown", (e) => e.key === "Enter" && yes());
    wrap.addEventListener("keydown", (e) => e.key === "Escape" && finish(null));
    document.body.append(wrap);
    (input || wrap.querySelector(".prim")).focus();
  });
const askConfirm = (message, ok = "Delete") => askUser(message, { ok, danger: true });
const askText = (message, value = "", ok = "OK") => askUser(message, { value, ok });
PP.confirm = askConfirm;
PP.askText = askText;

// ---------- sheets ----------
// opts: short (not full height), sub (a small line under the title), head (more header
// buttons, a function), back (where ‹ goes; else a first child with class "back" moves up),
// onTitle (tapping the title does this, e.g. rename), id (which screen it is, for code). title may be a function (it can change).
openSheet = (title, renderFn, opts = {}) => {
  S.sheet = { title, render: renderFn, short: !!opts.short, sub: opts.sub || "", head: opts.head || null, back: opts.back || null, onTitle: opts.onTitle || null, id: opts.id || "" };
  S.dd = {}; // dropdowns close when another screen opens
  syncLayer();
  render();
};
const sheetTitle = () => (typeof S.sheet?.title === "function" ? S.sheet.title() : S.sheet?.title);
const closeSheet = () => {
  if (!S.sheet) return;
  S.sheet = null;
  syncLayer();
  render();
};

// Back (phone button or browser) closes the top layer: sheet, then drawer.
// The sheet and the drawer share ONE history entry, which exists exactly while
// either is open. Closing is never a history.back() that can land after the
// next sheet has opened (that closed new menus at random): the entry is given
// back one tick later, and only if nothing is open by then.
let layerEntry = false; // our history entry exists
let layerBack = false; // a history.back() of ours is on its way
const syncLayer = () => {
  if (layerBack) return; // the popstate of that back calls this again
  const need = !!(S.sheet || S.drawer);
  if (need && !layerEntry) {
    history.pushState({ layer: true }, "");
    layerEntry = true;
  } else if (!need && layerEntry) {
    setTimeout(() => {
      if (layerBack || S.sheet || S.drawer || !layerEntry) return;
      layerEntry = false;
      layerBack = true;
      history.back();
    }, 0);
  }
};
window.addEventListener("popstate", () => {
  if (layerBack) {
    layerBack = false;
    syncLayer(); // something opened while we were going back: give it an entry
    return;
  }
  // The Back button took our entry: close the top layer.
  layerEntry = false;
  if (S.sheet) S.sheet = null;
  else S.drawer = false;
  syncLayer(); // a layer still open under it gets a fresh entry
  render();
});

// The sheet: ‹ back, the title, ? and ✕ on a card that rises from the bottom.
const renderSheet = () => {
  const body = h("div", { class: "body" }, S.sheet.render());
  const back = body.firstElementChild?.classList.contains("back") ? body.firstElementChild : null;
  if (back) back.remove();
  const goBack = S.sheet.back || (back ? () => back.click() : null);
  const sub = typeof S.sheet.sub === "function" ? S.sheet.sub() : S.sheet.sub;
  const title = sheetTitle();
  return h(
    "div",
    { class: "layer" },
    h("div", { class: "dim", onclick: closeSheet }),
    h(
      "section",
      { class: "sheet" + (S.sheet.short ? "" : " tall"), role: "dialog", "aria-label": title },
      h(
        "div",
        { class: "sh" },
        goBack ? h("button", { class: "ic", onclick: goBack, "aria-label": "Back" }, svgIcon("back")) : null,
        S.sheet.onTitle
          ? h("button", { class: "grow ttl", onclick: S.sheet.onTitle, title: "Tap to rename" }, title, sub ? h("small", {}, sub) : null)
          : h("span", { class: "grow" }, title, sub ? h("small", {}, sub) : null),
        ...(S.sheet.head ? [].concat(S.sheet.head()) : []),
        helpBtn(),
        h("button", { class: "ic", onclick: closeSheet, "aria-label": "Close", title: "Close (Esc)" }, svgIcon("close")),
      ),
      body,
    ),
  );
};

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
  syncLayer();
  render();
};

// Settings form built from a plugin's manifest.
// A plugin's settings as wireframe rows: a switch, a radio list, or a box.
const settingsForm = (id) => {
  const man = S.plugins.get(id).manifest;
  const cur = settingsFor(id);
  const out = [];
  for (const [k, d] of Object.entries(man.settings || {})) {
    if (d.type === "hidden") continue; // kept by the plugin itself
    const set = (v, redraw) => (setSetting(id, k, v), redraw && (rerenderSheet(), render()));
    const label = d.label || k;
    if (d.type === "bool") {
      out.push(item({ label, sub: d.help, toggle: !!cur[k], onclick: () => set(!cur[k], true) }));
      continue;
    }
    out.push(h("div", { class: "lbl" }, label));
    if (d.type === "select") {
      const opts = Array.isArray(d.options) ? d.options.map((o) => [o, o]) : Object.entries(d.options || {});
      out.push(...opts.map(([v, l]) => item({ label: l, radio: v === cur[k], onclick: () => set(v, true) })));
    } else if (d.type === "textarea") out.push(h("textarea", { class: "box", rows: 5, "aria-label": label, value: cur[k] ?? "", oninput: (e) => set(e.target.value) }));
    else out.push(h("label", { class: "search" }, h("input", { type: d.type === "number" ? "number" : "text", "aria-label": label, value: cur[k] ?? "", oninput: (e) => set(d.type === "number" ? Number(e.target.value) : e.target.value) })));
    if (d.help) out.push(h("div", { class: "sub2" }, d.help));
  }
  if (!out.length) out.push(item({ label: "This plugin has no settings" }));
  return out;
};

// Saved per site for site plugins, per profile for the others.
const openPluginSettings = (id) => {
  const p = S.plugins.get(id);
  openSheet("Settings", () => [
    p.error ? item({ cls: "danger", label: "It didn't load", sub: p.error }) : null,
    ...settingsForm(id),
  ], { sub: (p.manifest?.name || id) + (isSite(p) ? " · every chat on this site" : " · profile " + profile().name), back: () => openPluginPage(id) });
};

// A copy of yours with the same id replaces the app's plugin. When the app's own
// (or downloaded) one is newer, say so and offer to switch back to it.
const verNewer = (a, b) => {
  const n = (v) => String(v || "0").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
const isStale = (p) => p.source === "user" && p.overrides && p.shadows && verNewer(p.shadows, p.manifest?.version);
const useBuiltin = async (p) => {
  if (!(await askConfirm(`Remove your copy of ${p.manifest?.name || p.id} (v${p.manifest?.version || "?"}) and use the app's v${p.shadows}? Your copy's files are deleted.`, "Use the app's"))) return;
  try {
    await api("/api/plugins/remove", { id: p.id });
    toast(`Now using ${p.manifest?.name || p.id} v${p.shadows}`);
    await reloadPlugins();
    rerenderSheet();
  } catch (e) {
    toast(e.message, "error");
  }
};
const staleNote = (p) =>
  isStale(p)
    ? h("div", { class: "warn" }, `Your copy is v${p.manifest?.version || "?"}; the app's is v${p.shadows}, and yours is hiding it. `, h("button", { class: "small primary", onclick: () => useBuiltin(p) }, "Use the app's"))
    : null;

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
        copyText(part, part === ta.value ? "Copied all" : "Copied selection");
      } }, "Copy selection")), ta];
    };
    return [...box("Reply", t.reply || ""), ...(t.thinking ? box("Thinking", t.thinking) : []), ...box("Your message", t.you || "")];
  });
// The whole chat as Markdown (what its file holds): to copy, or to send to another app.
// `c` is the open chat, or a row of the chats list (read from its file).
const chatText = async (c) => {
  if (c.turns) return c.turns.length ? ChatFile.toMd(c) : "";
  return (await api("/api/history/file?path=" + encodeURIComponent(c.path))).text || "";
};
const copyChat = async (c = S.chat) => {
  try {
    const text = await chatText(c);
    if (!text.trim()) return toast("Nothing in this chat yet");
    await copyText(text, "Whole chat copied");
  } catch (e) {
    toast("Couldn't copy the chat: " + e.message, "error");
  }
};
const shareChat = async (c = S.chat) => {
  try {
    const text = await chatText(c);
    if (!text.trim()) return toast("Nothing in this chat yet");
    await api("/api/module", { module: "share", call: "text", args: { text } });
  } catch (e) {
    toast("Couldn't share the chat: " + e.message, "error");
  }
};
const openGuide = () => openDoc("PLUGINS.md", "Writing plugins");

// Git history, as in the wireframe: the commits, then backup (author, remote,
// token, push and pull). The log is read once when the screen opens.
const GIT = { log: null, error: "" };
const commitRow = (c) => item({ label: c.message, sub: ChatFile.stamp(new Date(c.time).toISOString()) + " · " + c.id });
const loadGitLog = (path = "") => {
  GIT.log = null;
  GIT.error = "";
  return api("/api/git/log" + (path ? "?path=" + encodeURIComponent(path) : ""))
    .then((r) => (GIT.log = r.log), (e) => (GIT.error = e.message))
    .finally(rerenderSheet);
};
const gitLogRows = () =>
  GIT.error ? [item({ label: "No history here", sub: GIT.error })] : !GIT.log ? [item({ label: "Loading…" })] : GIT.log.length ? GIT.log.map(commitRow) : [item({ label: "No commits yet" })];
const openGit = () => {
  loadGitLog();
  openSheet("Git history", () => {
    const g = S.config.git;
    const ask = (label, key, ph) => async () => {
      const v = await askText(label, g[key] || ph || "", "Save");
      if (v != null) ((g[key] = v.trim()), saveConfig(), rerenderSheet());
    };
    const run = (what) => async () => {
      try {
        const r = await api("/api/git/" + what, {});
        toast(what + ": " + (r.result || "ok"));
        loadGitLog();
      } catch (e) {
        toast(what + " failed: " + e.message, "error");
      }
    };
    return [
      ...gitLogRows(),
      h("div", { class: "lbl" }, "Backup"),
      item({ label: "Commit on every save", sub: "In " + (S.historyRoot || "history") + ". Git works there from Termux too.", toggle: !!g.enabled, onclick: () => ((g.enabled = !g.enabled), saveConfig(), rerenderSheet()) }),
      item({ label: "Author name", sub: g.name || "promptpipe", onclick: ask("Author name", "name", "promptpipe") }),
      item({ label: "Author email", sub: g.email || "promptpipe@localhost", onclick: ask("Author email", "email", "promptpipe@localhost") }),
      item({ label: "Remote URL", sub: g.remote || "None · for example https://github.com/you/chat-history.git", onclick: ask("Remote URL", "remote", "") }),
      item({ label: "Token", sub: (S.app.gitToken ? "Saved" : "Not set") + " · kept inside the app, not in the folder", onclick: async () => {
        const v = await askText("GitHub token with repo access (empty removes it)", "", "Save");
        if (v == null) return;
        await api("/api/secret", { key: "gitToken", value: v.trim() });
        S.app.gitToken = !!v.trim();
        toast(v.trim() ? "Token saved" : "Token removed");
        rerenderSheet();
      } }),
      item({ label: "Push after every commit", toggle: !!g.autoPush, onclick: () => ((g.autoPush = !g.autoPush), saveConfig(), rerenderSheet()) }),
      item({ label: "Push now", onclick: run("push") }),
      item({ label: "Pull now", onclick: run("pull") }),
    ];
  }, { back: () => openSettingsGroup("Chats and storage", settingsBody("Chats and storage")) });
};

// A switch between a few options, shown at the end of a row.
const seg = (opts, cur, pick, aria = "", disabled = false) =>
  h("div", { class: "seg" }, opts.map(([v, l]) => h("button", { class: v === cur ? "on" : "", "aria-pressed": String(v === cur), "aria-label": (aria ? aria + " " : "") + l, disabled, onclick: () => pick(v) }, l)));
const segRow = (id, label, sub, control) => h("div", { class: "it", "data-row": id }, h("div", { class: "g" }, label, sub ? h("small", {}, sub) : null), control);
// Look, as in the wireframe: light or dark, accent, UI scale. (Themes are
// plugins: Library › Themes.)
const lookControls = () => {
  const scale = Math.round(S.config.ui.scale * 100);
  const theme = S.config.ui.theme && S.plugins.get(S.config.ui.theme);
  return [
    segRow("look.mode", "Light or dark", theme ? "The theme " + (theme.manifest.name || theme.id) + " sets its own colours" : "", seg([["", "System"], ["dark", "Dark"], ["light", "Light"]], S.config.ui.mode || "", (v) => setLook("mode", v), "", !!theme)),
    item({ id: "look.acc", label: "Accent", sub: ACCENTS[S.config.ui.accent || ""], onclick: openAccent }),
    segRow("look.size", "UI scale", "Text and controls. Applies at once." + ([90, 100, 115, 130].includes(scale) ? "" : " Now " + scale + "%."), seg([[90, "90%"], [100, "100%"], [115, "115%"], [130, "130%"]], scale, (v) => (setScale(v / 100), rerenderSheet()), "UI scale")),
  ];
};
const openAccent = () =>
  openSheet("Accent", () => Object.entries(ACCENTS).map(([v, l]) => item({ label: l, radio: (S.config.ui.accent || "") === v, onclick: () => (setLook("accent", v), rerenderSheet()) })), { back: () => openSettingsGroup("Look", settingsBody("Look")) });


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
          staleNote(p),
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

// Tries what chats need (a folder, a file in it, a file beside it) and shows the phone's own answer.
const openStorageCheck = async () => {
  let r = null;
  const run = async () => {
    r = null;
    rerenderSheet();
    r = await api("/api/storage/check").catch((e) => ({ path: "", steps: [{ name: "reach the app's core", ok: false, why: e.message }] }));
    rerenderSheet();
  };
  const text = () => `Chats folder: ${r.path}\n` + r.steps.map((x) => `${x.ok ? "ok" : "FAILED"}: ${x.name}${x.why ? " (" + x.why + ")" : ""}`).join("\n");
  openSheet("Storage check", () => [
    backRow("Settings", openSettings),
    r ? h("p", {}, h("code", {}, r.path)) : h("p", { class: "muted" }, "Checking…"),
    ...(r ? r.steps.map((x) => h("p", { class: x.ok ? "" : "error" }, (x.ok ? "✓ " : "✕ ") + x.name + (x.why ? ": " + x.why : ""))) : []),
    r && r.steps.some((x) => !x.ok) ? h("p", { class: "muted" }, "The phone said no. If Allow all files access isn't on for this app, turn it on in Settings › Chats and storage and restart the app. Otherwise copy this and send it to whoever helps you.") : null,
    r ? h("div", { class: "row" }, h("button", { class: "primary", onclick: () => copyText(text(), "Copied") }, "Copy"), h("button", { onclick: run }, "Check again")) : null,
  ]);
  run();
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
      h("button", { class: "small primary", onclick: () => copyText(textOf(), "Log copied") }, "Copy"),
      h("button", { class: "small", onclick: async () => ((log = await read()), rerenderSheet(), toEnd()) }, "Refresh")),
    h("pre", { class: "pipe-preview core-log" }, textOf()),
  ]);
  toEnd();
};

const openHelp = () =>
  openSheet("Shortcuts & help", () => [
    h("p", { class: "muted" }, "Everything has a button or a gesture; keys are extras for a hardware keyboard."),
    h("h3", {}, "Touch"),
    ...[
      ["Swipe a reply right", "quote it in your message"],
      ["Swipe a reply left", "copy it"],
      ["Long-press any text", "select it (or Options › Select text)"],
      ["Press and hold a chat in the list", "start selecting chats (then Pin, Move…, Delete)"],
      ["Drag the ⋮⋮ grip of a row", "move it into a folder, reorder it, or onto Pinned to pin it"],
      ["Tap the title", "the Chat sheet: name, tags, copy, share, pin, move, history"],
      ["Tap the magnifier", "Find: chats, messages, every function and setting"],
      ["Tap \u201c\u25cf site \u00b7 model\u201d at the top", "the site sheet: status, model, profile, pages, site plugins"],
      ["⋯ under a reply, or long-press it", "the message menu: copy, quote, select, send again, tags, what was sent, plugin actions"],
      ["Tap a reply", "shows Copy and Quote under it"],
      ["The layers button next to the box", "quick edit and add: switch rows on or off, reorder them, put in a text file"],
      ["■ (Send while a reply is coming)", "stop waiting; type to queue a message instead"],
      ["⤢ next to Send", "big message box"],
    ].map(([a, b]) => h("div", { class: "menu-item" }, h("span", {}, a), h("kbd", {}, b))),
    h("h3", {}, "Keys"),
    h("div", { class: "menu-item" }, h("span", {}, "Find"), h("kbd", {}, "Ctrl+K · F3 · Ctrl+F")),
    ...commands().filter((c) => c.key).map((c) => h("div", { class: "menu-item" }, h("span", {}, c.name), h("kbd", {}, c.key))),
  ]);

const toggleThinking = () => {
  S.thinkingOpen = !S.thinkingOpen;
  for (const d of document.querySelectorAll("details.thinking")) d.open = S.thinkingOpen;
};

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
    S.chat.meta.site = siteIdOf();
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
      h("button", { onclick: () => copyText(out, "Copied") }, "Copy"),
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
    if (S.helpCard) return run(() => ((S.helpCard = null), render()));
    if (S.help) return run(() => ((S.help = false), render()));
    if (S.siteMenu) return run(() => ((S.siteMenu = false), render()));
    if (S.sheet) return run(closeSheet);
    if (S.drawer) return run(closeDrawer);
    const b = document.querySelector(".comp .send.stop");
    if (b) return run(() => b.click());
  }
  if (ctrl && !e.shiftKey && k === "k") return run(() => openFind());
  if (ctrl && !e.shiftKey && k === "n") return run(() => startNewChat());
  if (ctrl && !e.shiftKey && k === "f") return run(() => openFind());
  if (e.key === "F3") return run(() => openFind());
  if (ctrl && !e.shiftKey && k === "m") return run(openModels);
  if (ctrl && !e.shiftKey && k === "e") return run(toggleExpand);
  if (ctrl && e.key === "/") return run(toggleThinking);
  if (ctrl && e.key === "?") return run(openHelp);
  if (e.key === "ArrowUp" && !e.altKey && !ctrl && e.target.matches?.("#msg") && !e.target.value) return run(editLast);
  if (ctrl && !e.shiftKey && k === "b") return run(() => (S.drawer ? closeDrawer() : openDrawer()));
  if (ctrl && !e.shiftKey && k === "p") return run(nextProfile);
  if (ctrl && e.shiftKey && k === "p") return run(() => openPlugins());
  if (ctrl && e.shiftKey && k === "l") return run(() => openProfileEditor());
  if (ctrl && e.shiftKey && k === "r") return run(reloadPlugins);
  if (ctrl && !e.shiftKey && k === "t") return run(() => (openChatSheet(), setTimeout(() => document.querySelector(".in-sheet .tag-input")?.focus(), 50)));
  if (ctrl && e.key === ",") return run(openSettings);
  if (ctrl && (e.key === "=" || e.key === "+")) return run(() => setScale(S.config.ui.scale + 0.05));
  if (ctrl && e.key === "-") return run(() => setScale(S.config.ui.scale - 0.05));
  if (ctrl && e.key === "0") return run(() => setScale(1));
  if (e.key === "F2") return run(openChatSheet);
  if (e.altKey && e.key === "ArrowUp") return run(() => stepChat(-1));
  if (e.altKey && e.key === "ArrowDown") return run(() => stepChat(1));
});

// ---------- keyboard on screen ----------
// The app also pads for the keyboard natively; this keeps the layout to the
// visible area if a keyboard still overlaps it.
if (window.visualViewport) {
  const fit = () => document.documentElement.style.setProperty("--vvh", window.visualViewport.height + "px");
  window.visualViewport.addEventListener("resize", () => {
    fit();
    if (document.activeElement?.closest?.(".comp") && nearBottom()) scrollDown();
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
