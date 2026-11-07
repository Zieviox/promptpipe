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
// or one of ACCENTS. ui.text: body text size in px. A theme plugin sets its own colours.
const ACCENTS = { "": "Warm orange", blue: "Blue", green: "Green", rose: "Rose", violet: "Violet" };
const applyLook = () => {
  const ui = S.config.ui;
  const root = document.documentElement;
  document.body.style.zoom = String(ui.scale);
  root.style.setProperty("--scale", String(ui.scale));
  root.style.setProperty("--fs", (+ui.text || 16) + "px");
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

// STOPGAP, not the design: render() rebuilds the whole screen, so what the person
// is doing has to be carried over by hand. The real fix is a UI that updates in
// place (the live reply box already does, see syncLive); when the screens are
// reworked this whole block should go. What is carried over: where each list is scrolled, and what they have typed into a
// sheet's fields. Without this, lists jumped back to the top and sheets lost
// their text whenever anything in the background redrew.
const SCROLLERS = ".messages, .drawer, .chat-list, .sheet, .sheet-body, .pipe-preview, .core-log, .models, .tag-filter, .blocks";
// A sheet's fields have no ids, so each is named by what it is (tag, type, placeholder,
// label) plus its number among fields of the same name: it survives fields being added.
const fieldKey = (f, all) => {
  const name = [f.tagName, f.type, f.placeholder, f.name, f.getAttribute("aria-label"), f.dataset.keep].join("|");
  return name + "#" + all.filter((x) => x === f || [x.tagName, x.type, x.placeholder, x.name, x.getAttribute("aria-label"), x.dataset.keep].join("|") === name).indexOf(f);
};
const textLike = (f) => f.tagName === "TEXTAREA" || (f.tagName === "INPUT" && /^(text|search|url|password|email|number|)$/.test(f.type));
// A selection inside one text block of a message: which block, and where in its text.
const TEXT_BLOCK = ".msg .text, .msg .md, .thinking .md";
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
  const sameSheet = hadSheet && S.sheet?.title === v.sheet;
  const seen = {};
  for (const el of app.querySelectorAll(SCROLLERS)) {
    const k = el.className;
    const i = (seen[k] = (seen[k] ?? -1) + 1);
    // A different sheet opening starts at its top; the same sheet redrawn keeps its place.
    if (/\bsheet(-body)?\b/.test(k) && !sameSheet) continue;
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

render = () => {
  const keepFocus = document.activeElement?.dataset?.keep;
  const draft = document.querySelector(".composer textarea")?.value;
  const view = snapshotView();
  const hadSheet = !!document.querySelector(".sheet");
  const composer = renderComposer(draft);
  // Floats just above the composer; shows once you scroll up.
  composer.prepend(jumpButton());
  app.replaceChildren(...[safeBanner(), renderTop(), renderTagsRow(), renderMessages(), composer].filter(Boolean));
  if (S.drawer) app.append(h("div", { class: "scrim", onclick: closeDrawer }), renderDrawer());
  if (S.sheet) app.append(h("div", { class: "scrim", onclick: closeSheet }), renderSheet());
  restoreView(view, hadSheet);
  // Reading at the very bottom, you stay at the bottom as the chat grows; anywhere
  // above it, your place is never moved (new replies show on the jump button).
  if (view.pinned && followOn()) scrollDown();
  if (keepFocus) document.querySelector(`[data-keep="${keepFocus}"]`)?.focus({ preventScroll: true });
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
const followOn = () => S.config?.ui?.follow !== false;

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
  const el = document.querySelector(".top .site-btn");
  if (el) el.replaceWith(siteButton());
  const pr = document.querySelector(".composer .progress-text");
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
  return { key: "ready", words: "Ready" };
};

// "● site · model" in the header: the site, the model read from the page (or
// the one you picked, marked "wanted" until the page shows it) and the state.
const siteButton = (prof = profile()) => {
  const st = siteState();
  const want = choicesFor(prof).model;
  const onPage = S.site.model || "";
  const model = onPage || want;
  const mismatch = want && onPage && !onPage.toLowerCase().includes(want.toLowerCase());
  return h("button", { class: "site-btn " + st.key + (mismatch ? " mismatch" : ""), title: `${st.words}${mismatch ? ` · the page shows ${onPage}, you picked ${want}` : ""} · site, model and profile`, "aria-label": `Site: ${siteFor()?.name || "none"}, ${st.words}`, onclick: openSiteSheet },
    h("span", { class: "dot", "aria-hidden": "true" }),
    h("span", { class: "site-name" }, siteFor()?.name || "No site"),
    model ? h("span", { class: "site-model" }, " · " + model + (mismatch ? " ⚠" : "")) : null,
    st.key === "off" ? h("span", { class: "site-words" }, " · not open") : null);
};

const SAFETY = "Use a separate account on the AI site (a throwaway Gmail works), not an important one: promptpipe drives the site for you and isn't built for account security. You can also sign in by hand on the site.";

// ---------- first run ----------
// Welcome, the account warning, where chats go, site plugins, log in. Each
// step can be skipped; it never comes back once done (Settings has it all).
const openWelcome = () => {
  let stepNo = 0;
  const next = () => ((stepNo += 1), rerenderSheet());
  const finish = () => {
    S.config.welcomed = true;
    saveConfig();
    closeSheet();
  };
  const steps = [
    () => [
      h("p", {}, "promptpipe sends your messages to the free AI chat sites you log in to, puts your own pieces of text with them, and keeps every chat as a file of yours."),
      h("p", { class: "warn" }, SAFETY),
      h("div", { class: "row" }, h("button", { class: "primary grow", onclick: next }, "Continue")),
    ],
    () => [
      h("h3", {}, "Where chats are saved"),
      h("p", {}, h("code", {}, S.app.storage || "?")),
      S.app.allFiles
        ? h("p", { class: "muted" }, "Other apps (a file manager, Termux) can reach them there.")
        : h("p", { class: "muted" }, "They're in the app's own folder now. Allow all files access to keep them where other apps (a file manager, Termux) can reach them; restart the app after."),
      h("div", { class: "row" },
        S.app.allFiles ? null : h("button", { onclick: () => api("/api/app/action", { action: "grantFiles" }).catch((e) => toast(e.message, "error")) }, "Allow all files access"),
        h("button", { class: "primary grow", onclick: next }, "Continue")),
    ],
    () => [
      h("h3", {}, "AI sites"),
      h("p", { class: "muted" }, "Each AI site comes as a site plugin. The ticked ones are the tested ones."),
      ...siteTickView(),
      h("div", { class: "row" }, h("button", { class: "grow", onclick: next }, [...S.plugins.values()].some(isSite) ? "Continue" : "Skip for now")),
    ],
    () => {
      const site = siteFor();
      return [
        h("h3", {}, "Log in"),
        site
          ? h("p", {}, `Open ${site.name} and log in once; promptpipe uses that login from then on. Come back with the back button.`)
          : h("p", { class: "muted" }, "No site plugin yet: get one from the site button at the top (● No site) whenever you like."),
        h("div", { class: "row" },
          site ? h("button", { class: "primary", onclick: () => (showSite(), finish()) }, "Open " + site.name) : null,
          h("button", { class: site ? "" : "primary", onclick: finish }, site ? "Later" : "Start")),
        h("p", { class: "muted" }, "Then send a message. The layers button next to the box (Quick edit and add) is where you choose what goes with it; Profiles has the starters (RP, Story writing, Writing feedback, Plain)."),
      ];
    },
  ];
  openSheet("Welcome to promptpipe", () => [h("p", { class: "faint" }, `Step ${stepNo + 1} of ${steps.length}`), ...steps[stepNo]()]);
};

// In an empty chat: which profile is in use, and the way to its rows.
const presetPicker = () =>
  h("div", { class: "preset-picker" },
    h("p", { class: "faint" }, "Profile: " + profile().name + " (what goes with your message)"),
    h("div", { class: "row" },
      h("button", { class: "chip", onclick: openQuick }, svgIcon("stackadd"), "Quick edit"),
      h("button", { class: "chip ghost", onclick: () => openProfileEditor() }, "Edit profile")));

// The site sheet: everything about the site in one place.
const openSiteSheet = () =>
  openSheet("Site", () => {
    const prof = profile();
    const site = siteFor(prof);
    const st = siteState();
    const want = choicesFor(prof).model;
    const sites = [...S.plugins.values()].filter(isSite);
    const pr = S.plugins.get("page-report");
    return [
      h("div", { class: "site-status " + st.key },
        h("span", { class: "dot", "aria-hidden": "true" }),
        h("div", { class: "grow" }, h("b", {}, site ? site.name : "No AI site yet"), h("div", { class: "muted" }, st.words + (S.site.url ? " · " + S.site.url : ""))),
        site ? h("button", { class: "primary", onclick: showSite }, st.key === "off" ? "Open the page" : "Show the page") : h("button", { class: "primary", onclick: openGetSites }, "Get site plugins")),
      h("h3", {}, "Profile"),
      profileDropdown({ id: "site", current: prof, pick: (p) => (switchProfile(p.id), rerenderSheet()) }),
      sites.length > 1 ? h("label", { class: "field" }, h("span", {}, "Site of this profile"),
        dropdown({ id: "sitepick", label: "Site of this profile", value: prof.site, options: sites.map((x) => ({ value: x.id, label: x.manifest.name })), onPick: (v) => ((prof.site = v), saveConfig(), render(), rerenderSheet(), warmSite()) })) : null,
      site ? h("h3", {}, "Model") : null,
      site ? h("div", { class: "row" },
        h("div", { class: "grow" }, h("div", {}, S.site.model ? "On the page: " + S.site.model : "The page hasn't shown its model yet"), want ? h("div", { class: "muted" }, "You picked: " + want + (S.site.model && !S.site.model.toLowerCase().includes(want.toLowerCase()) ? " (not what the page shows)" : "")) : null),
        h("button", { class: "small", onclick: openModels }, "Model and switches")) : null,
      h("h3", {}, "This chat and the page"),
      h("div", { class: "row" },
        h("button", { class: "small", onclick: linkToSite }, "Link to the open page"),
        h("button", { class: "small", onclick: addFromPage }, "Take the newest reply"),
        h("button", { class: "small", onclick: importHistory }, "Import the site chat")),
      h("h3", {}, "Pages"),
      h("div", { class: "row stepper" },
        h("button", { class: "small", "aria-label": "Fewer pages", disabled: pageCount() <= 1, onclick: () => setPageCount(pageCount() - 1).then(rerenderSheet) }, "−"),
        h("strong", {}, `${pageCount()} ${pageCount() === 1 ? "page" : "pages"} at once`),
        h("button", { class: "small", "aria-label": "More pages", disabled: pageCount() >= 4, onclick: () => setPageCount(pageCount() + 1).then(rerenderSheet) }, "+")),
      h("h3", {}, "Site plugins"),
      h("div", { class: "row" },
        h("button", { class: "small", onclick: openGetSites }, "Get site plugins"),
        site ? h("button", { class: "small", onclick: () => openPluginSettings(prof.site) }, "Site plugin settings") : null),
      h("h3", {}, "Developer"),
      h("div", { class: "row" },
        ...((pr && pr.def && pr.def.menu) || []).map((m) => h("button", { class: "small", onclick: () => Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error")) }, m.label)),
        h("button", { class: "small", onclick: decodeLast }, "Decode the newest reply (preview)")),
    ];
  });

const renderTop = () => {
  const c = S.chat;
  const prof = profile();
  return h(
    "header",
    { class: "top" },
    h("button", { class: "icon", title: "Chats · Ctrl+B", "aria-label": "Chats", onclick: openDrawer }, h("span", { class: "burger" })),
    h(
      "div",
      { class: "titlebox" },
      h("button", { class: "title", title: "Chat: name, tags, move, export · F2", onclick: openChatSheet }, h("span", { class: "title-text" }, c.meta.title || "New chat"), h("span", { class: "chev", "aria-hidden": "true" }, "▾")),
    ),
    siteButton(prof),
    ...topBlocks(),
    h("button", { class: "icon find-btn", title: "Find chats, messages, functions and settings · Ctrl+K or F3", "aria-label": "Find", onclick: () => openFind() }, svgIcon("search")),
  );
};

// Line icons, drawn with the text colour.
const ICONS = {
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
              h("div", { class: "row" }, h("button", { class: "small primary", onclick: openGetSites }, "Get site plugins"), h("button", { class: "small", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file"), h("button", { class: "small", onclick: openQuickStart }, "Quick start")),
            ),
        presetPicker(),
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
  const item = (label, run, opts = {}) => h("button", { class: "menu-item" + (opts.danger ? " danger" : ""), onclick: run }, h("span", {}, label), opts.key ? h("kbd", {}, opts.key) : null);
  openSheet("Message", () => {
    const own = t.tags || [];
    const inherited = ChatFile.messageTags(c.meta, t).filter((x) => !own.includes(x));
    const plugin = [];
    for (const p of S.plugins.values()) for (const a of p.def?.messageActions || []) plugin.push(item(`${a.label} · ${pluginName(p.id)}`, () => (closeSheet(), runMessageAction(c, t, i, p, a))));
    return [
      h("blockquote", { class: "menu-quote" }, (t.reply || t.you || "").slice(0, 240) + ((t.reply || "").length > 240 ? "…" : "")),
      h("div", { class: "results" },
        item("Copy the reply", () => copyText(t.reply, "Copied"), { key: "swipe ←" }),
        item("Quote it in your next message", () => (closeSheet(), fillComposer(quote(t.reply), "append")), { key: "swipe →" }),
        item("Select text", () => openSelect(t)),
        item("Copy your message", () => copyText(t.you, "Copied")),
        t.thinking ? item("Copy the thinking", () => copyText(t.thinking, "Copied")) : null,
        item("Send your message again", () => (closeSheet(), send(t.you))),
        last ? item("Edit and send again", () => (closeSheet(), editLast()), { key: "↑" }) : null,
        ...plugin),
      h("h3", {}, "Tags"),
      h("div", { class: "msg-tags-edit" },
        own.map((x) => tagChip(x, { onRemove: () => (removeMessageTag(c, t, x), setTimeout(rerenderSheet, 50)), onBump: counterOf(x) ? () => addMessageTag(c, t, counterOf(x)[1] + "#") : null })),
        inherited.map((x) => tagChip(x, { dim: true })),
        tagInput("+ tag", (v) => (addMessageTag(c, t, v), setTimeout(rerenderSheet, 50)), "mtag-menu")),
      h("h3", {}, "What was sent"),
      h("details", { class: "trace" }, h("summary", {}, "Show the trace (what went out, what came back)"), ...traceOf(t)),
    ];
  });
};

const renderTurn = (c, t, i) => {
  const transformed = t.sent !== t.you || t.raw !== t.reply;
  const own = t.tags || [];
  const inherited = ChatFile.messageTags(c.meta, t).filter((x) => !own.includes(x));
  // The footer: tags and time; Copy and Quote on the newest reply and on one you tap; ⋯ for the menu.
  const newest = i === c.turns.findLastIndex((x) => !x.pending);
  const open = newest || S.openTurns.has(t);
  const menu = () => openMessageMenu(c, t, i);
  const foot = t.pending
    ? null
    : h(
        "div",
        { class: "msg-foot" },
        own.map((x) => h("span", { class: "tag-text" + (counterOf(x) ? " counter" : "") }, "#" + x)),
        inherited.map((x) => h("span", { class: "tag-text dim", title: "From the chat tags" }, "#" + x)),
        h("span", { class: "time" }, ChatFile.stamp(t.at)),
        open ? h("button", { class: "ghost foot-btn", onclick: () => copyText(t.reply, "Copied") }, "Copy") : null,
        open ? h("button", { class: "ghost foot-btn", onclick: () => fillComposer(quote(t.reply), "append") }, "Quote") : null,
        h("button", { class: "ghost more", title: "Message menu", "aria-label": "Message menu", onclick: menu }, svgIcon("more")),
      );
  // Your own message: tap it for Copy and Send again (a long-press is left to text selection).
  const youOpen = S.openYou.has(t);
  const you = h("div", { class: "msg you", title: ChatFile.stamp(t.at) }, h("div", { class: "text" }, t.you),
    youOpen ? h("div", { class: "msg-foot you-foot" },
      h("button", { class: "ghost foot-btn", onclick: () => copyText(t.you, "Copied") }, "Copy"),
      h("button", { class: "ghost foot-btn", onclick: () => send(t.you) }, "Send again"),
      h("button", { class: "ghost foot-btn", onclick: () => fillComposer(t.you) }, "Edit")) : null);
  you.addEventListener("click", (e) => {
    if (e.target.closest("a, button") || String(window.getSelection() || "").trim()) return;
    S.openYou.has(t) ? S.openYou.delete(t) : S.openYou.add(t);
    render();
  });
  const art = h(
    "article",
    { class: "turn" + (S.highlight === i ? " hit" : ""), id: "turn-" + i },
    you,
    h(
      "div",
      { class: "msg ai" + (t.error ? " has-error" : "") },
      h("div", { class: "who" }, c.meta.ai || "AI", transformed ? h("span", { class: "piped", title: "Went through the pipeline; the message menu shows what was sent" }, "piped") : null, t.profile ? h("span", { class: "faint" }, t.profile) : null),
      t.thinking
        ? h("details", { class: "thinking", open: S.thinkingOpen }, h("summary", { title: "Tap to fold or unfold · Ctrl+/ for all" }, t.secs != null ? `Thought for ${t.secs} s` : "Thought"), h("div", { class: "md", html: mdToHtml(t.thinking) }))
        : null,
      t.pending
        ? (() => { const box = h("div", { class: "live-box", "data-turn": i }); syncLive(box, t); return box; })()
        : h("div", { class: "text md", html: mdToHtml(t.reply) }),
      t.error ? h("div", { class: "error" }, "✕ " + t.error) : null,
      foot,
    ),
  );
  const ai = art.querySelector(".msg.ai");
  if (!t.pending) {
    // Tap a reply (not a link or a selection) to show its Copy and Quote.
    ai.addEventListener("click", (e) => {
      if (newest || e.target.closest("a, button, details, pre") || String(window.getSelection() || "").trim()) return;
      S.openTurns.has(t) ? S.openTurns.delete(t) : S.openTurns.add(t);
      render();
    });
    // Desktop right-click opens the menu. On a phone a long-press selects text, so the menu is the ⋯ button.
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

const renderComposer = (draft) => {
  const ta = h("textarea", {
    "data-keep": "composer",
    placeholder: S.chat.turns.length ? "Message" : "Start a chat",
    rows: 1,
    value: draft ?? local("draft") ?? "",
    oninput: (e) => {
      local("draft", e.target.value);
      grow(e.target);
      const b = document.querySelector(".composer .send");
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
  return h(
    "footer",
    { class: "composer" + (S.expanded ? " expanded" : "") },
    h(
      "div",
      { class: "inputbox" },
      h("button", { class: "plus", title: "Quick edit and add: switch rows on or off, put in a text file", "aria-label": "Quick edit and add", onclick: openQuick }, svgIcon("stackadd")),
      ta,
      h("div", { class: "input-side" },
        h("button", { class: "ghost expand", onclick: toggleExpand, title: (S.expanded ? "Smaller" : "Bigger") + " message box · Ctrl+E", "aria-label": S.expanded ? "Smaller message box" : "Bigger message box", "aria-pressed": String(!!S.expanded) }, svgIcon(S.expanded ? "shrink" : "expand")),
        sendButton(ta.value)),
    ),
    h(
      "div",
      { class: "progress" },
      h("span", { class: "progress-text" }, composerProgress()),
    ),
  );
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
  S.sheet = { title, render: renderFn };
  S.dd = {}; // dropdowns close when another screen opens
  syncLayer();
  render();
};
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
  syncLayer();
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
    isSite(p) ? null : h("label", { class: "field inline" }, h("span", {}, `On in the profile “${profile().name}”`), h("input", { type: "checkbox", checked: stepOn(id), onchange: (e) => (setStepOn(id, e.target.checked), render()) })),
    ...settingsForm(id),
    h("p", { class: "muted" }, "Settings are saved per profile; the switch and the order are the preset's (Pipeline)."),
  ]);
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
const openQuickStart = () => openDoc("QUICKSTART.md", "Quick start");

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
    h("div", { class: "field" }, h("span", {}, "Light or dark"),
      h("div", { class: "themes" }, [["", "Like the system"], ["dark", "Dark"], ["light", "Light"]].map(([v, l]) =>
        h("button", { class: "theme-pick" + ((S.config.ui.mode || "") === v ? " current" : ""), "aria-pressed": String((S.config.ui.mode || "") === v), disabled: !!S.config.ui.theme, onclick: () => setLook("mode", v) }, l)))),
    h("div", { class: "field" }, h("span", {}, "Accent"),
      h("div", { class: "themes" }, Object.entries(ACCENTS).map(([v, l]) =>
        h("button", { class: "theme-pick accent-pick" + ((S.config.ui.accent || "") === v ? " current" : ""), "data-swatch": v || "orange", "aria-pressed": String((S.config.ui.accent || "") === v), onclick: () => setLook("accent", v) }, h("span", { class: "swatch", "aria-hidden": "true" }), l)))),
    h("div", { class: "field" }, h("span", {}, "Text size"),
      h("div", { class: "row stepper" },
        h("button", { class: "small", "aria-label": "Smaller text", disabled: (+S.config.ui.text || 16) <= 13, onclick: () => setLook("text", (+S.config.ui.text || 16) - 1) }, "A−"),
        h("strong", {}, `${+S.config.ui.text || 16} px`),
        h("button", { class: "small", "aria-label": "Bigger text", disabled: (+S.config.ui.text || 16) >= 22, onclick: () => setLook("text", (+S.config.ui.text || 16) + 1) }, "A+"))),
    h("div", { class: "field" }, h("span", {}, "Theme (install more like plugins; a theme brings its own colours)"),
      h("div", { class: "themes" }, [{ id: "", manifest: { name: "Default", description: "Follows Light or dark and Accent above" } }, ...themes].map((t) =>
        h("button", { class: "theme-pick" + ((S.config.ui.theme || "") === t.id ? " current" : ""), title: t.manifest.description || "", onclick: () => setTheme(t.id) }, t.manifest.name)))),
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

// Settings: one page of groups, each a page of its own (‹ Settings goes back).
const settingsPage = (title, body) =>
  openSheet(title, () => [h("button", { class: "ghost back", onclick: openSettings }, "‹ Settings"), ...body()]);
const SETTINGS = [
  ["Look", "Light or dark, accent, text size, UI scale, theme, Enter sends", () => [
    ...lookControls(),
    h("h3", {}, "Chat"),
    h("label", { class: "field inline" }, h("span", {}, "Stay at the bottom while a reply comes in (only if you were already there; scrolled up, your place never moves)"), h("input", { type: "checkbox", checked: followOn(), onchange: (e) => ((S.config.ui.follow = e.target.checked), saveConfig()) })),
    h("h3", {}, "Keyboard"),
    h("label", { class: "field inline" }, h("span", {}, "Enter sends (Shift+Enter for a new line)"), h("input", { type: "checkbox", checked: !!S.config.ui.enterSends, onchange: (e) => ((S.config.ui.enterSends = e.target.checked), saveConfig()) })),
  ]],
  ["Chats and storage", "Where chats are saved, git history and backup", () => [
    h("h3", {}, "Storage"),
    h("p", {}, h("code", {}, S.app.storage || "?")),
    S.app.allFiles
      ? h("p", { class: "muted" }, "Plugins, config and history live here, so Termux and Neovim can reach them.")
      : h("p", { class: "warn" }, "The app can't use /sdcard yet, so files are in its own folder. ", h("button", { onclick: () => api("/api/app/action", { action: "grantFiles" }) }, "Allow all files access"), " then restart the app."),
    h("div", { class: "row" }, h("button", { onclick: openStorageCheck }, "Storage check")),
    h("h3", {}, "Git"),
    h("div", { class: "row" }, h("button", { onclick: openGit }, "Git history and backup")),
  ]],
  ["Sites", "Site plugins, pages at once, waiting for replies", () => [
    h("div", { class: "row" }, h("button", { class: "primary", onclick: openGetSites }, "Get site plugins"), h("button", { onclick: openSiteSheet }, "This profile's site")),
    h("h3", {}, "Site pages at once"),
    h("p", { class: "muted" }, "Each page is a separate copy of the site, so this many chats (yours, plugins' and other apps') get answered at the same time. More pages use more memory, and many messages at once on one account can look like a bot to the site."),
    h("div", { class: "row stepper" },
      h("button", { class: "small", "aria-label": "Fewer pages", disabled: pageCount() <= 1, onclick: () => setPageCount(pageCount() - 1).then(rerenderSheet) }, "−"),
      h("strong", {}, `${pageCount()} ${pageCount() === 1 ? "page" : "pages"}`),
      h("button", { class: "small", "aria-label": "More pages", disabled: pageCount() >= 4, onclick: () => setPageCount(pageCount() + 1).then(rerenderSheet) }, "+")),
    h("p", { class: "muted" }, "Log in once: all pages share the login. In the site view, Page 1/2 switches between them."),
    h("h3", {}, "Waiting for replies"),
    h("p", { class: "muted" }, "In minutes. 0 = no limit. Stop on a reply that's coming always works."),
    ...[["idleMin", "Give up after this long with no activity on the page"], ["maxMin", "Give up after this long in total"]].map(([k, label]) =>
      h("label", { class: "field inline" }, h("span", {}, label), h("input", { type: "number", min: "0", step: "1", style: "width:5em", value: String((S.config.wait || {})[k] || 0), oninput: (e) => ((S.config.wait = { ...(S.config.wait || {}), [k]: Math.max(0, +e.target.value || 0) }), saveConfig()) }))),
  ]],
  ["Plugins", "All plugins, install, updates, the profile", () => [
    h("div", { class: "row" }, h("button", { class: "primary", onclick: () => openPlugins() }, "Plugins"), h("button", { onclick: () => openProfileEditor() }, "Edit profile")),
  ]],
  ["Import and export", "Profiles, system prompts, names that already exist", () => {
    const menu = (label) => [...S.plugins.values()].flatMap((p) => p.def?.menu || []).find((m) => m.label === label);
    const spImport = menu("Import system prompts…"), spExport = menu("Export all system prompts");
    return [
      h("p", { class: "muted" }, "Exports are saved in ", h("code", {}, (S.app.storage || "the app folder") + "/export"), ", where other apps can reach them."),
      h("h3", {}, "Profiles"),
      h("div", { class: "row" }, h("button", { onclick: () => exportProfiles(S.config.profiles) }, "Export all profiles"), h("button", { onclick: openImportProfile }, "Import a profile…")),
      h("h3", {}, "System prompts"),
      h("div", { class: "row" }, spExport ? h("button", { onclick: () => spExport.run() }, "Export all system prompts") : null, spImport ? h("button", { onclick: () => spImport.run() }, "Import system prompts…") : null),
      spImport ? null : h("p", { class: "muted" }, "The System prompt plugin isn't installed."),
      h("h3", {}, "When a name already exists"),
      h("label", { class: "field" }, h("span", {}, "Importing a name you already have"),
        dropdown({ id: "clash", label: "Importing a name you already have", value: importMode(), options: [{ value: "ask", label: "Ask each time (keep both is preselected)" }, { value: "both", label: "Always keep both" }, { value: "replace", label: "Always replace" }], onPick: (v) => ((S.config.importClash = v), saveConfig(), rerenderSheet()) })),
    ];
  }],
  ["Local API", "For other apps: address, token, folder", () => [
    h("p", { class: "muted" }, "Apps that take an OpenAI API key: base URL below, model = a profile name, API key = the token below (always required). Each request becomes one new chat on the site, unless it adds \"chat\": \"<path>.md\" to continue a saved chat (then only its last message is sent). Every reply also says, under \"promptpipe\", which chat it went to and what was sent. Requests at the same time run in parallel on the site pages (see Sites), the rest wait their turn."),
    h("div", { class: "row" }, h("pre", { class: "grow" }, `http://127.0.0.1:${S.app.port}/v1`), h("button", { class: "small", onclick: () => copyText(`http://127.0.0.1:${S.app.port}/v1`, "Copied") }, "Copy")),
    h("label", { class: "field" }, h("span", {}, "API token (send it as: Authorization: Bearer <token>)"), h("div", { class: "row" },
      h("pre", { class: "grow" }, S.app.apiTokenValue || "?"),
      h("button", { class: "small", onclick: () => copyText(S.app.apiTokenValue || "", "Copied") }, "Copy"),
      h("button", { class: "small", onclick: async () => {
        await api("/api/secret", { key: "apiToken", value: "" });
        S.app = await api("/api/app");
        toast("New API token made: apps using the old one need the new one");
        rerenderSheet();
      } }, "New token"))),
    h("pre", {}, `curl -s 127.0.0.1:${S.app.port}/v1/chat/completions -H "Authorization: Bearer ${S.app.apiTokenValue || "TOKEN"}" -d '{"model":"${profile().name}","messages":[{"role":"user","content":"hi"}]}'`),
    h("label", { class: "field" }, h("span", {}, "Folder for chats made through the API"), h("input", { value: S.config.api.folder, oninput: (e) => ((S.config.api.folder = e.target.value), saveConfig()) })),
  ]],
  ["Advanced", "App parts, safe mode, background, core log", () => [
    h("h3", {}, "App parts"),
    ...appPartsControls(),
    h("h3", {}, "Background"),
    h("p", { class: "muted" }, "A notification keeps the AI page and the API alive while the app is in the background."),
    h("button", { onclick: () => api("/api/app/action", { action: "stopService" }) }, "Stop background service"),
    h("h3", {}, "Core log"),
    h("p", { class: "muted" }, "What the app's core printed, for reporting a problem."),
    h("button", { onclick: openCoreLog }, "Show core log"),
    h("h3", {}, "First run"),
    h("button", { onclick: openWelcome }, "Show the welcome again"),
  ]],
];
const openSettings = () =>
  openSheet("Settings", () => [
    h("div", { class: "results" }, SETTINGS.map(([title, sub, body]) =>
      h("button", { class: "menu-item settings-row", onclick: () => settingsPage(title, body) }, h("span", { class: "grow" }, h("b", {}, title), h("small", { class: "muted" }, sub)), h("span", { class: "chev", "aria-hidden": "true" }, "›")))),
    h("p", { class: "muted" }, "Version " + (S.app.version || "?") + (S.app.coreVersion ? " · core " + S.app.coreVersion : "")),
  ]);

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
    if (S.sheet) return run(closeSheet);
    if (S.drawer) return run(closeDrawer);
    const b = document.querySelector(".composer .send.stop");
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
  if (e.key === "ArrowUp" && !e.altKey && !ctrl && e.target.matches?.(".composer textarea") && !e.target.value) return run(editLast);
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
    if (document.activeElement?.closest?.(".composer") && nearBottom()) scrollDown();
  });
  fit();
}


on("start", () => applyLook());
on("ready", () => {
  render();
  scrollDown();
  // First run: no site plugin yet and never welcomed.
  if (!S.config.welcomed && ![...S.plugins.values()].some(isSite)) openWelcome();
});
// Text shared from another app starts a new chat with it in the box.
on("share", (ev) => {
  if (S.chat.turns.length) startNewChat();
  setTimeout(() => fillComposer(ev.text, "append"), 50);
});
