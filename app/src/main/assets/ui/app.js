"use strict";
// promptpipe chat UI. Talks to the app over /api (see Server.kt):
// plugins and profiles, the AI page, chat files and git.

// ---------- helpers ----------
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k in e && typeof v !== "string") e[k] = v;
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};

const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "bad answer from the app (" + r.status + ")" }));
  if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
  return j;
};

const toast = (msg, kind = "info") => {
  const t = h("div", { class: "toast " + kind, role: kind === "error" ? "alert" : "status" }, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), kind === "error" ? 8000 : 3500);
};

const iso = () => new Date().toISOString();
const slug = (s) => (s || "chat").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "chat";
const sameUrl = (a, b) => (a || "").replace(/[?#].*$/, "").replace(/\/$/, "") === (b || "").replace(/[?#].*$/, "").replace(/\/$/, "");
const local = (key, val) => {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem("pp:" + key));
    localStorage.setItem("pp:" + key, JSON.stringify(val));
  } catch (e) {
    return null;
  }
};

// ---------- state ----------
const S = {
  app: {},
  config: null,
  plugins: new Map(), // id -> { id, manifest, source, def, error }
  chats: [], // { path, meta, mtime }
  folders: [],
  tags: { counters: {}, tags: [] },
  chat: null,
  folder: "", // where new chats go
  openFolders: new Set(local("openFolders") || []),
  siteChats: [],
  site: { connected: false, url: "", title: "" },
  busy: false,
  progress: "",
  drawer: false,
  sheet: null, // { title, render }
  advOpen: !!local("advOpen"),
  query: "",
  traces: new WeakMap(), // turn -> full trace (this session only)
  openTurns: new WeakSet(), // turns whose options are unfolded
};

const DEFAULT_CONFIG = () => ({
  profiles: [
    {
      // The site is filled in with the first site plugin you install.
      id: "p1",
      name: "Default",
      site: "",
      plugins: [
        { id: "base64", on: false, settings: {} },
        { id: "system-prompt", on: false, settings: {} },
      ],
    },
  ],
  activeProfile: "p1",
  lastChat: "",
  git: { enabled: true, name: "", email: "", remote: "", autoPush: false },
  api: { folder: "api" },
  ui: { scale: 1, theme: "", enterSends: false },
  // Minutes to wait for a reply; 0 = no limit (Stop waiting is always there).
  wait: { idleMin: 0, maxMin: 0 },
});

let configTimer = 0;
const saveConfig = () => {
  clearTimeout(configTimer);
  configTimer = setTimeout(() => api("/api/config", S.config).catch((e) => toast("Settings not saved: " + e.message, "error")), 400);
};

// ---------- plugins ----------
// A plugin's main.js calls PP.plugin({...hooks}). See /docs/PLUGINS.md.
let loadingId = null;
const PP = (window.PP = {
  plugin(def) {
    const p = S.plugins.get(loadingId);
    if (p) p.def = def;
  },
  h,
  api,
  toast,
  md: (text) => mdToHtml(text),
  get chat() {
    return S.chat;
  },
  get profile() {
    return profile();
  },
  site: (cmd, extra) => siteCmd(cmd, extra),
});

const loadScript = (src) =>
  new Promise((ok, fail) => {
    const s = h("script", { src });
    s.onload = ok;
    s.onerror = () => fail(new Error("could not load " + src));
    document.head.append(s);
  });

const loadPlugins = async () => {
  const { plugins } = await api("/api/plugins");
  S.plugins.clear();
  window.onerror = (msg, src, line) => {
    const p = S.plugins.get(loadingId);
    if (p && src && src.includes("/plugins/" + p.id + "/")) p.error = `${msg} (line ${line})`;
  };
  for (const p of plugins) {
    S.plugins.set(p.id, { ...p, def: null });
    if (p.manifest && p.manifest.siteScript) {
      try {
        const r = await fetch(`/plugins/${encodeURIComponent(p.id)}/${p.manifest.siteScript}?t=${Date.now()}`);
        if (!r.ok) throw new Error(p.manifest.siteScript + " not found");
        S.plugins.get(p.id).siteScript = await r.text();
      } catch (e) {
        S.plugins.get(p.id).error = e.message;
      }
    }
    const main = p.manifest && p.manifest.main;
    if (!main) continue;
    loadingId = p.id;
    try {
      await loadScript(`/plugins/${encodeURIComponent(p.id)}/${main}?t=${Date.now()}`);
      if (!S.plugins.get(p.id).def && !S.plugins.get(p.id).error) S.plugins.get(p.id).error = "main.js did not call PP.plugin({...})";
    } catch (e) {
      S.plugins.get(p.id).error = e.message;
    }
  }
  loadingId = null;
  syncProfiles();
};

const isSite = (p) => p && p.manifest && (p.manifest.kind === "site" || p.manifest.site);
const isTheme = (p) => p && p.manifest && p.manifest.kind === "theme";
const isStep = (p) => p && p.manifest && !isSite(p) && !isTheme(p);
const pluginName = (id) => S.plugins.get(id)?.manifest?.name || id;

// Every profile lists every non-site plugin once (new ones are added switched off).
const syncProfiles = () => {
  // A profile whose site isn't installed takes the first site that is.
  const sites = [...S.plugins.values()].filter(isSite);
  for (const prof of S.config.profiles) {
    if (sites.length && !sites.some((p) => p.id === prof.site)) prof.site = sites[0].id;
  }
  for (const prof of S.config.profiles) {
    prof.plugins = prof.plugins.filter((e) => !S.plugins.has(e.id) || isStep(S.plugins.get(e.id)));
    for (const p of S.plugins.values()) {
      if (isStep(p) && !prof.plugins.some((e) => e.id === p.id)) prof.plugins.push({ id: p.id, on: false, settings: {} });
    }
  }
};

const profile = () => S.config.profiles.find((p) => p.id === S.config.activeProfile) || S.config.profiles[0];
const entryFor = (id, prof = profile()) => {
  let e = prof.plugins.find((x) => x.id === id);
  if (!e) prof.plugins.push((e = { id, on: false, settings: {} }));
  return e;
};

// Settings: what the profile saved, else the manifest's default.
const settingsFor = (id, prof = profile()) => {
  const man = S.plugins.get(id)?.manifest || {};
  const saved = id === prof.site ? prof.siteSettings || {} : entryFor(id, prof).settings;
  const out = {};
  for (const [k, d] of Object.entries(man.settings || {})) out[k] = k in saved ? saved[k] : d.default;
  return out;
};
const setSetting = (id, key, value, prof = profile()) => {
  if (id === prof.site) (prof.siteSettings = prof.siteSettings || {})[key] = value;
  else entryFor(id, prof).settings[key] = value;
  saveConfig();
};

const siteFor = (prof = profile()) => {
  const p = S.plugins.get(prof.site);
  if (!p || !isSite(p)) return null;
  const site = JSON.parse(JSON.stringify(p.manifest.site));
  site.settings = settingsFor(p.id, prof);
  if (site.settings.replySelector) site.reply = [site.settings.replySelector, ...site.reply];
  site.name = p.manifest.name;
  if (p.siteScript) site.script = p.siteScript;
  return site;
};

const activePlugins = (prof = profile()) => prof.plugins.filter((e) => e.on && S.plugins.get(e.id)?.def);

const runHooks = async (hook, text, ctx, trace, prof) => {
  for (const e of activePlugins(prof)) {
    const def = S.plugins.get(e.id).def;
    if (typeof def[hook] !== "function") continue;
    const notes = [];
    const out = await def[hook](text, { ...ctx, settings: settingsFor(e.id, prof), note: (m) => notes.push(m) });
    if (typeof out === "string") text = out;
    trace.push({ label: `${pluginName(e.id)} · ${hook === "beforeSend" ? "before" : "after"}`, text, notes });
    ctx.notes.push(...notes.map((n) => `${pluginName(e.id)}: ${n}`));
  }
  return text;
};

// ---------- look: UI scale and theme ----------
// Themes are plugins too ("kind": "theme" with a CSS file of colour variables).
const applyLook = () => {
  const ui = S.config.ui;
  document.body.style.zoom = String(ui.scale);
  document.documentElement.style.setProperty("--scale", String(ui.scale));
  let link = document.getElementById("theme-css");
  const p = S.plugins.get(ui.theme);
  const href = isTheme(p) && p.manifest.css ? `/plugins/${encodeURIComponent(p.id)}/${p.manifest.css}?t=${Date.now()}` : "";
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

// ---------- AI page ----------
const siteCmd = (cmd, extra = {}) => api("/api/site", { cmd, site: siteFor(), ...extra });
const openSite = async (url) => {
  S.progress = "Opening " + url;
  render();
  const r = await api("/api/site/open", { url });
  S.site = { connected: true, url: r.url, title: r.title };
  return r;
};
const sameHost = (a, b) => {
  try {
    return new URL(a).host === new URL(b).host;
  } catch (e) {
    return false;
  }
};
// Load the profile's site in the background (the app starts on a blank page),
// so it is ready to log in to or send to.
const warmSite = () => {
  const s = siteFor();
  if (!s || sameHost(S.site.url || "", s.url)) return Promise.resolve();
  const url = S.chat?.meta.source && sameHost(S.chat.meta.source, s.url) ? S.chat.meta.source : s.url;
  return api("/api/site/open", { url })
    .then((r) => {
      S.site = { connected: true, url: r.url, title: r.title };
      render();
    })
    .catch(() => {});
};
const showSite = () => {
  if (!siteFor()) return toast("Install an AI site plugin first (⋯ → Plugins)", "error");
  warmSite();
  return api("/api/app/action", { action: "site" }).catch((e) => toast(e.message, "error"));
};

// Model and switches chosen in the app (saved per profile) are set on the page
// before sending, when the page shows something else.
// Returns the profile's own object, so changes to it are saved with the profile.
const choicesFor = (prof = profile()) => {
  const ss = (prof.siteSettings = prof.siteSettings || {});
  ss.model = ss.model || "";
  ss.switches = ss.switches || {};
  return ss;
};
const applySiteChoices = async (site, prof) => {
  const want = choicesFor(prof);
  if (!want.model && !Object.keys(want.switches).length) return;
  const cur = await api("/api/site", { cmd: "info", site });
  if (want.model && !(cur.model || "").toLowerCase().includes(want.model.toLowerCase())) {
    S.progress = "Choosing " + want.model + "…";
    render();
    const r = await api("/api/site", { cmd: "setModel", site, model: want.model });
    S.site.model = r.model;
  }
  for (const [name, on] of Object.entries(want.switches)) {
    if ((site.switches || []).some((x) => x.name === name)) await api("/api/site", { cmd: "setSwitch", site, name, on });
  }
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

// A short vibration when a reply arrives, so you know without looking.
const haptic = () => api("/api/app/action", { action: "haptic" }).catch(() => {});

const rememberPrompt = (text) => {
  const list = (local("recent") || []).filter((t) => t !== text);
  list.unshift(text);
  local("recent", list.slice(0, 5));
};

// One AI request at a time (chat screen and other apps share the page).
let queue = Promise.resolve();
const exclusive = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

// Send one message in `chat` through the profile's plugins and save the turn.
// follow: don't send; take the reply the site is already giving (Check / Add from page).
const runChat = (chat, prompt, prof = profile(), follow = false) =>
  exclusive(async () => {
    const site = siteFor(prof);
    if (!site) throw new Error("this profile has no AI site plugin (Profiles sheet)");
    const turn = { at: iso(), you: prompt, sent: "", raw: "", reply: "", profile: prof.name, tags: [], notes: [], pending: true };
    chat.turns.push(turn);
    const trace = [{ label: "You", text: prompt, notes: [] }];
    S.traces.set(turn, trace);
    S.sending = true;
    render();
    try {
      // Be on this chat's page on the site, or on a fresh chat for a new one.
      // (When following, stay on whatever the page shows now.)
      if (follow) {
      } else if (chat.meta.source) {
        if (!sameUrl(S.site.url, chat.meta.source)) await openSite(chat.meta.source);
      } else if (!sameUrl(S.site.url, site.url)) await openSite(site.url);
      if (!follow) await applySiteChoices(site, prof);
      const ctx = { chat, profile: prof, firstMessage: chat.turns.length === 1, notes: turn.notes };
      turn.sent = prompt ? await runHooks("beforeSend", prompt, ctx, trace, prof) : "";
      S.progress = (follow ? "Reading the reply on " : "Sending to ") + site.name + "…";
      render();
      const started = Date.now();
      const w = S.config.wait || {};
      const idleMs = (+w.idleMin || 0) * 60000;
      const maxMs = (+w.maxMin || 0) * 60000;
      // The app itself waits as long as the page may (a week when there is no limit).
      const r = await api("/api/site", { cmd: follow ? "follow" : "send", site, text: turn.sent, idleMs, maxMs, timeout: maxMs ? maxMs + 60000 : 7 * 86400000 });
      if (follow && !prompt) {
        // Added from the page: your side is whatever the page shows, decoded like a reply.
        turn.sent = r.you || "";
        turn.you = r.you ? await runHooks("afterReply", r.you, { ...ctx, notes: [] }, [], prof).catch(() => r.you) : "(from the page)";
        turn.notes.push("added from the page");
      }
      turn.secs = Math.max(1, Math.round((Date.now() - started) / 1000));
      turn.raw = r.raw;
      if (r.thinking) turn.thinking = r.thinking;
      trace.push({ label: "Raw reply", text: r.raw, notes: [] });
      try {
        turn.reply = await runHooks("afterReply", r.raw, ctx, trace, prof);
      } catch (e) {
        turn.reply = r.raw;
        turn.error = e.message;
        trace.push({ label: "Error", text: e.message, error: true, notes: [] });
      }
      S.site = { connected: true, url: r.url, title: r.title, model: r.model };
      if (!sameUrl(r.url, site.url)) chat.meta.source = r.url;
      chat.meta.ai = site.name;
      if (r.model) chat.meta.model = r.model;
      chat.meta.profile = prof.name;
      if (!chat.meta.title || chat.meta.title === "New chat") chat.meta.title = (turn.you || "Chat").split("\n")[0].slice(0, 60);
      delete turn.pending;
      turn.tags = tagsForNewMessage(chat);
      await saveChat(chat, `chat: ${chat.meta.title} (#${chat.turns.length})`, [tagsFile()]);
      haptic();
      return turn;
    } catch (e) {
      // Nothing came back: the message moves to the chat's failed list (not
      // saved to the file), where it can be retried or edited.
      chat.turns.splice(chat.turns.indexOf(turn), 1);
      (chat.failed = chat.failed || []).push({ you: prompt, error: e.message, at: turn.at });
      throw e;
    } finally {
      S.sending = false;
      S.progress = "";
      render();
    }
  });

// ---------- history (chat files + git) ----------
const loadTree = async () => {
  const t = await api("/api/history/tree");
  S.historyRoot = t.root;
  S.folders = t.folders.filter((f) => !f.split("/").some((p) => p.startsWith(".")));
  S.chats = t.files.map((f) => ({ path: f.path, meta: ChatFile.parseFront(f.head), mtime: f.mtime }));
  S.chats.sort((a, b) => (b.meta.updated || "").localeCompare(a.meta.updated || ""));
};

const loadTags = async () => {
  try {
    const r = await api("/api/history/file?path=tags.json");
    if (r.text) S.tags = { counters: {}, tags: [], ...JSON.parse(r.text) };
  } catch (e) {}
};
const tagsFile = () => ({ path: "tags.json", text: JSON.stringify(S.tags, null, 2) + "\n" });

const newChat = (folder = S.folder) => ({
  path: null,
  folder,
  meta: { title: "New chat", source: "", ai: "", model: "", profile: profile().name, tags: [], created: iso(), updated: iso() },
  turns: [],
});

const saveChat = async (chat, message, extra = []) => {
  if (!chat.path) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const name = `${slug(chat.meta.title)}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.md`;
    chat.path = (chat.folder ? chat.folder + "/" : "") + name;
  }
  chat.meta.updated = iso();
  const res = await api("/api/history/save", { files: [{ path: chat.path, text: ChatFile.toMd(chat) }, ...extra], message });
  if (res.gitError) toast("Saved, but git failed: " + res.gitError, "error");
  S.index = null; // search index is rebuilt on the next search
  S.config.lastChat = chat.path;
  saveConfig();
  await loadTree();
  return res;
};

const openChat = async (path) => {
  const r = await api("/api/history/file?path=" + encodeURIComponent(path));
  if (r.text == null) throw new Error("chat file not found: " + path);
  S.chat = ChatFile.fromMd(path, r.text);
  S.chat.folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  S.config.lastChat = path;
  saveConfig();
  closeDrawer();
  render();
  scrollDown();
};

const startNewChat = (folder) => {
  S.chat = newChat(folder ?? S.folder);
  closeDrawer();
  render();
  setTimeout(() => document.querySelector(".composer textarea")?.focus(), 0);
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

// Copies an outline of the AI page's newest message, to send when something isn't detected.
const copyPageReport = async () => {
  try {
    const r = await siteCmd("probe");
    await navigator.clipboard.writeText(`Page report for ${siteFor()?.name} (${r.url})\n\n${r.report}`);
    toast("Page report copied. Paste it to whoever fixes the site plugin.");
  } catch (e) {
    toast(e.message, "error");
  }
};

const openSiteChat = async (c) => {
  const known = S.chats.find((x) => sameUrl(x.meta.source, c.url));
  if (known) return openChat(known.path);
  S.chat = newChat();
  S.chat.meta.title = c.title;
  S.chat.meta.source = c.url;
  S.chat.meta.ai = siteFor()?.name || "";
  closeDrawer();
  render();
  toast("Linked to the site chat. Your next message continues it there.");
};

const moveChat = async (chat, folder) => {
  if (!chat.path) return toast("Send a message first, then move it", "error");
  const name = chat.path.split("/").pop();
  const to = (folder ? folder + "/" : "") + name;
  if (to === chat.path) return;
  await api("/api/history/save", { moves: [{ from: chat.path, to }], message: `move: ${chat.meta.title} -> ${folder || "(top)"}` });
  if (S.chat && S.chat.path === chat.path) {
    S.chat.path = to;
    S.chat.folder = folder;
  }
  await loadTree();
  render();
  toast("Moved to " + (folder || "top level"));
};

const deleteChat = async (path) => {
  await api("/api/history/save", { delete: [path], message: "delete: " + path });
  if (S.chat && S.chat.path === path) S.chat = newChat();
  await loadTree();
  render();
};

const makeFolder = async (name) => {
  name = name.trim().replace(/^\/+|\/+$/g, "");
  if (!name || name.split("/").some((p) => p === ".." || p.startsWith("."))) return toast("Not a valid folder name", "error");
  await api("/api/history/save", { files: [{ path: name + "/.gitkeep", text: "" }], message: "folder: " + name });
  S.openFolders.add(name);
  await loadTree();
  render();
};

// ---------- tags ----------
// Tags live on messages. Chat tags are defaults that every message of the chat
// gets. Counter tags: "draft#" takes the next number (draft#1, draft#2, ...);
// as a chat tag, each new message gets its own next number. A message holds one
// value per counter; +1 on its chip moves it to the next free number.
const counterOf = (tag) => /^(.+)#(\d+)$/.exec(tag);
const cleanTag = (raw) => raw.trim().replace(/\s+/g, "-");
const nextCount = (name) => (S.tags.counters[name] = (S.tags.counters[name] || 0) + 1);

const knownTags = () => {
  const set = new Set(S.tags.tags);
  for (const k of Object.keys(S.tags.counters)) set.add(k + "#");
  for (const c of S.chats) for (const t of c.meta.tags || []) set.add(t);
  return [...set].sort();
};
const remember = (tag) => {
  if (!counterOf(tag) && !tag.endsWith("#") && !S.tags.tags.includes(tag)) S.tags.tags.push(tag);
};

// Tags a new message starts with: the chat's tags, counters numbered.
const tagsForNewMessage = (chat) => chat.meta.tags.map((t) => (t.endsWith("#") ? `${t.slice(0, -1)}#${nextCount(t.slice(0, -1))}` : t));

const addChatTag = async (chat, raw) => {
  let tag = cleanTag(raw);
  if (!tag) return;
  if (counterOf(tag)) tag = counterOf(tag)[1] + "#"; // chat tags hold the counter, not a number
  if (tag.endsWith("#")) S.tags.counters[tag.slice(0, -1)] ??= 0;
  remember(tag);
  if (!chat.meta.tags.includes(tag)) chat.meta.tags.push(tag);
  await persist(chat, `tag: ${chat.meta.title} +${tag} (chat)`);
};

const removeChatTag = async (chat, tag) => {
  chat.meta.tags = chat.meta.tags.filter((t) => t !== tag);
  await persist(chat, `tag: ${chat.meta.title} -${tag} (chat)`);
};

const addMessageTag = async (chat, turn, raw) => {
  let tag = cleanTag(raw);
  if (!tag) return;
  const counter = tag.endsWith("#") ? tag.slice(0, -1) : counterOf(tag)?.[1];
  turn.tags = turn.tags || [];
  if (counter) {
    const n = tag.endsWith("#") ? nextCount(counter) : Number(counterOf(tag)[2]);
    S.tags.counters[counter] = Math.max(S.tags.counters[counter] || 0, n);
    tag = `${counter}#${n}`;
    turn.tags = turn.tags.filter((t) => counterOf(t)?.[1] !== counter);
  }
  remember(tag);
  if (!turn.tags.includes(tag)) turn.tags.push(tag);
  await persist(chat, `tag: ${chat.meta.title} #${chat.turns.indexOf(turn) + 1} +${tag}`);
};

const removeMessageTag = async (chat, turn, tag) => {
  turn.tags = (turn.tags || []).filter((t) => t !== tag);
  await persist(chat, `tag: ${chat.meta.title} #${chat.turns.indexOf(turn) + 1} -${tag}`);
};

// Tag changes of a chat that has no file yet are kept until its first message.
const persist = async (chat, message) => {
  if (chat.path) await saveChat(chat, message, [tagsFile()]);
  else await api("/api/history/save", { files: [tagsFile()], message: "tags" }).catch(() => {});
  render();
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

// ---------- external jobs (other apps via /api/v1/chat) ----------
const runJob = async (ev) => {
  const req = ev.req || {};
  try {
    const prof = S.config.profiles.find((p) => (req.profile && p.name.toLowerCase() === String(req.profile).toLowerCase()) || p.id === req.profile) || profile();
    let chat;
    if (req.chat === "current" && S.chat) chat = S.chat;
    else if (req.chat && req.chat !== "new") chat = ChatFile.fromMd(req.chat, (await api("/api/history/file?path=" + encodeURIComponent(req.chat))).text || "");
    else chat = newChat(req.folder ?? S.config.api.folder ?? "api");
    if (!chat.meta.tags) chat.meta.tags = [];
    const turn = await runChat(chat, req.prompt, prof);
    await api("/api/jobs/done", { id: ev.id, result: { reply: turn.reply, thinking: turn.thinking || "", raw: turn.raw, sent: turn.sent, chat: chat.path, source: chat.meta.source, error: turn.error } });
    if (S.chat && S.chat.path === chat.path) render();
  } catch (e) {
    api("/api/jobs/done", { id: ev.id, error: e.message }).catch(() => {});
  }
};

// ---------- events from the app ----------
const pollEvents = async () => {
  let after = 0;
  let first = true;
  for (;;) {
    try {
      const r = await api("/api/events?after=" + after);
      for (const ev of r.events) {
        if (ev.type === "site") {
          if (ev.event === "progress") S.progress = S.sending ? ev.text : "";
          else S.site = { ...S.site, connected: ev.connected !== false, url: ev.url || S.site.url, title: ev.title || S.site.title };
          renderStatus();
        } else if (first) continue; // old events from before this page loaded
        else if (ev.type === "job") runJob(ev);
        else if (ev.type === "share") {
          // Text shared from another app starts a new chat with it in the box.
          if (S.chat.turns.length) startNewChat();
          setTimeout(() => fillComposer(ev.text, "append"), 50);
        } else if (ev.type === "pluginInstalled") {
          await loadPlugins();
          entryFor(ev.id).on = true;
          saveConfig();
          toast("Installed " + ev.id);
          warmSite();
          rerenderSheet();
          render();
        } else if (ev.type === "error") toast(ev.text, "error");
      }
      after = r.seq;
      first = false;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};

// ---------- rendering ----------
const app = document.getElementById("app");

const render = () => {
  const keepFocus = document.activeElement?.dataset?.keep;
  const draft = document.querySelector(".composer textarea")?.value;
  const listScroll = document.querySelector(".messages")?.scrollTop;
  const composer = renderComposer(draft);
  // Floats just above the composer; shows once you scroll up.
  composer.prepend(h("button", { class: "jump", title: "Jump to the newest message", "aria-label": "Jump to bottom", onclick: scrollDown }, "↓"));
  app.replaceChildren(renderTop(), renderTagsRow(), renderMessages(), composer);
  if (S.drawer) app.append(h("div", { class: "scrim", onclick: closeDrawer }), renderDrawer());
  if (S.sheet) app.append(h("div", { class: "scrim", onclick: closeSheet }), renderSheet());
  if (listScroll != null) document.querySelector(".messages").scrollTop = listScroll;
  if (keepFocus) document.querySelector(`[data-keep="${keepFocus}"]`)?.focus();
};

const scrollDown = () => {
  const m = document.querySelector(".messages");
  if (m) m.scrollTop = m.scrollHeight;
};

const renderStatus = () => {
  const el = document.querySelector(".site-dot");
  if (el) el.replaceWith(siteDot());
  const pr = document.querySelector(".progress");
  if (pr) pr.textContent = S.progress;
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
  c.turns.forEach((t, i) => box.append(renderTurn(c, t, i)));
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
  box.addEventListener("scroll", () => {
    const far = box.scrollHeight - box.scrollTop - box.clientHeight > 300;
    document.querySelector(".jump")?.classList.toggle("show", far);
  });
  return box;
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
  if (i === c.turns.length - 1) onLongPress(you, editLast);
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
        ? h("div", { class: "text muted progress" }, S.progress || "…")
        : h("div", { class: "text md", html: mdToHtml(t.reply) }),
      t.error ? h("div", { class: "error" }, "✕ " + t.error) : null,
      foot,
      t.pending || !open
        ? null
        : h(
            "div",
            { class: "msg-actions" },
            h("button", { class: "ghost", onclick: () => navigator.clipboard.writeText(t.reply).then(() => toast("Copied")) }, "Copy"),
            h("button", { class: "ghost", title: "Quote this reply in your next message (or swipe it right)", onclick: () => fillComposer(quote(t.reply), "append") }, "Reply"),
            i === c.turns.length - 1 ? h("button", { class: "ghost", title: "Put your message back in the box (or long-press it)", onclick: editLast }, "Edit & resend") : null,
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
  el.addEventListener("touchstart", (e) => ((x0 = e.touches[0].clientX), (y0 = e.touches[0].clientY)), { passive: true });
  el.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
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

// Code blocks get a Copy button; long-press copies too.
const codeCopy = (root) => {
  for (const pre of root.querySelectorAll(".md pre")) {
    const copy = () => navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent).then(() => toast("Code copied"));
    pre.prepend(h("button", { class: "code-copy", onclick: copy }, "Copy"));
    onLongPress(pre, copy);
  }
};

// Plugin blocks: a switch per plugin (its own block if it draws one).
// Blocks marked advanced sit in the Advanced row, which is folded but always shown.
const blockFor = (e, n) => {
  const p = S.plugins.get(e.id);
  const label = p.manifest.block?.label || p.manifest.name || p.id;
  const toggle = () => {
    e.on = !e.on;
    saveConfig();
    render();
  };
  const pill = (text) =>
    h(
      "span",
      { class: "pill " + (e.on ? "on" : "off") + (p.error ? " broken" : "") },
      h("button", { class: "pill-main", "aria-pressed": String(e.on), title: (n <= 9 ? `Alt+${n} toggles. ` : "") + (p.manifest.description || ""), onclick: toggle }, h("span", { class: "dot" }), text ?? label),
      h("button", { class: "pill-gear", title: "Settings", "aria-label": label + " settings", onclick: () => openPluginSettings(e.id) }, svgIcon("gear")),
    );
  if (p.def && typeof p.def.renderBlock === "function") {
    try {
      const el = p.def.renderBlock({ settings: settingsFor(e.id), on: e.on, toggle, pill, openSettings: () => openPluginSettings(e.id), chat: S.chat });
      if (el instanceof Node) return el;
    } catch (err) {
      p.error = "renderBlock: " + err.message;
    }
  }
  return pill();
};

const blockEntries = (place) =>
  profile().plugins.filter((e) => {
    const p = S.plugins.get(e.id);
    if (!isStep(p) || p.manifest.block === false) return false;
    return (p.manifest.block?.place || "toggles") === place;
  });

const topBlocks = () => blockEntries("top").map((e, i) => blockFor(e, 99));

const renderBlocks = () => {
  const entries = blockEntries("toggles");
  const main = entries.filter((e) => !S.plugins.get(e.id).manifest.advanced);
  const adv = entries.filter((e) => S.plugins.get(e.id).manifest.advanced);
  let n = 0;
  const row = h("div", { class: "blocks" }, main.map((e) => blockFor(e, ++n)));
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
      S.progress,
      S.sending ? h("button", { class: "ghost", title: "Stop waiting for this reply", onclick: () => siteCmd("cancel").catch((e) => toast(e.message, "error")) }, "Stop waiting") : null,
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
  setTimeout(scrollDown, 0);
  try {
    await runChat(chat, text);
    if (S.chat === chat) render();
    setTimeout(scrollDown, 0);
  } catch (e) {
    toast("Not sent: " + e.message, "error");
    if (S.chat === chat) render();
  }
};

// Check: the send looked failed but the site is answering. Take that reply for this message.
const checkFailed = async (c, f) => {
  try {
    await runChat(c, f.you, profile(), true);
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
const fillComposer = (text, mode = "replace") => {
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
const closeDrawer = () => {
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
            onclick: () => {
              if (confirm(`Delete "${c.meta.title}"? It stays in git history.`)) deleteChat(c.path).then(closeSheet);
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

// ---------- sheets ----------
const openSheet = (title, renderFn) => {
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

const rerenderSheet = () => S.sheet && render();

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
    isSite(p) ? null : h("label", { class: "field inline" }, h("span", {}, "On in this profile"), h("input", { type: "checkbox", checked: entryFor(id).on, onchange: (e) => ((entryFor(id).on = e.target.checked), saveConfig(), render()) })),
    ...settingsForm(id),
    h("p", { class: "muted" }, "Settings are saved per profile."),
  ]);
};

const openPlugins = () =>
  openSheet("Plugins", () => {
    const prof = profile();
    const url = h("input", { placeholder: "Plugin URL: GitHub folder, plugin.json or .zip" });
    const install = async () => {
      try {
        const r = await api("/api/plugins/install", { url: url.value });
        toast("Installed " + r.id);
        await loadPlugins();
        entryFor(r.id).on = true;
        saveConfig();
        rerenderSheet();
      } catch (e) {
        toast("Install failed: " + e.message, "error");
      }
    };
    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= prof.plugins.length) return;
      [prof.plugins[i], prof.plugins[j]] = [prof.plugins[j], prof.plugins[i]];
      saveConfig();
      render();
    };
    const badge = (p) => (p.source === "builtin" ? "built-in" : p.overrides ? "your copy (overrides built-in)" : "your folder");
    return [
      h("div", { class: "row" }, h("button", { class: "primary", onclick: reloadPlugins, title: "Ctrl+Shift+R" }, "Reload plugins"), h("button", { onclick: openGuide }, "How to write one")),
      h("p", { class: "muted" }, "Your plugin folder: ", h("code", {}, S.pluginFolder || "?")),
      h("div", { class: "row" }, url, h("button", { onclick: install }, "Install")),
      h("div", { class: "row" }, h("button", { class: "small", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file (.zip or plugin.json)")),
      h("h3", {}, `Order and switches for profile “${prof.name}”`),
      h("p", { class: "muted" }, "Before-send hooks run top to bottom; after-reply hooks too."),
      ...prof.plugins.map((e, i) => {
        if (S.plugins.get(e.id) && !isStep(S.plugins.get(e.id))) return null;
        const p = S.plugins.get(e.id);
        if (!p) return h("div", { class: "plugin-row missing" }, `${e.id} (not installed)`);
        return h(
          "div",
          { class: "plugin-row" },
          h("input", { type: "checkbox", checked: e.on, "aria-label": "On", onchange: (ev) => ((e.on = ev.target.checked), saveConfig(), render()) }),
          h(
            "div",
            { class: "grow" },
            h("b", {}, p.manifest?.name || p.id),
            " ",
            h("small", { class: "muted" }, `v${p.manifest?.version || "?"} · ${badge(p)}${p.manifest?.advanced ? " · advanced" : ""}`),
            p.error ? h("div", { class: "error" }, "✕ " + p.error) : null,
          ),
          h("button", { class: "small", onclick: () => move(i, -1), "aria-label": "Move up" }, "↑"),
          h("button", { class: "small", onclick: () => move(i, 1), "aria-label": "Move down" }, "↓"),
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
const openGuide = () => openDoc("PLUGINS.md", "Writing plugins");
const openQuickStart = () => openDoc("QUICKSTART.md", "Quick start");

const openProfileMenu = () =>
  openSheet("Profiles", () => {
    const prof = profile();
    const sites = [...S.plugins.values()].filter(isSite);
    return [
      h("p", { class: "muted" }, "A profile is a set of plugins with their settings, plus the AI site. Ctrl+P switches to the next one."),
      ...S.config.profiles.map((p) =>
        h(
          "div",
          { class: "plugin-row" + (p === prof ? " current" : "") },
          h("input", { type: "radio", name: "prof", checked: p === prof, onchange: () => switchProfile(p.id) }),
          h("input", { class: "grow", value: p.name, "aria-label": "Profile name", oninput: (e) => ((p.name = e.target.value), saveConfig()) }),
          h("select", { "aria-label": "AI site", onchange: (e) => ((p.site = e.target.value), saveConfig(), render()) }, sites.map((s) => h("option", { value: s.id, selected: s.id === p.site }, s.manifest.name))),
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
        h("button", { onclick: openPlugins }, "Plugins of this profile"),
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

const openSettings = () =>
  openSheet("Settings", () => {
    const tok = h("input", { type: "password", placeholder: S.app.apiToken ? "token set (type to replace, empty to clear)" : "optional" });
    return [
      ...lookControls(),
      h("h3", {}, "Keyboard"),
      h("h3", {}, "Waiting for replies"),
      h("p", { class: "muted" }, "In minutes. 0 = no limit. Stop waiting under the message box always works."),
      ...[["idleMin", "Give up after this long with no activity on the page"], ["maxMin", "Give up after this long in total"]].map(([k, label]) =>
        h("label", { class: "field inline" }, h("span", {}, label), h("input", { type: "number", min: "0", step: "1", style: "width:5em", value: String((S.config.wait || {})[k] || 0), oninput: (e) => ((S.config.wait = { ...(S.config.wait || {}), [k]: Math.max(0, +e.target.value || 0) }), saveConfig()) })),
      ),
      h("label", { class: "field inline" }, h("span", {}, "Enter sends (Shift+Enter for a new line)"), h("input", { type: "checkbox", checked: !!S.config.ui.enterSends, onchange: (e) => ((S.config.ui.enterSends = e.target.checked), saveConfig()) })),
      h("details", { class: "advanced-settings" }, h("summary", {}, "Advanced: storage, local API, background"),
      h("h3", {}, "Storage"),
      h("p", {}, h("code", {}, S.app.storage || "?")),
      S.app.allFiles
        ? h("p", { class: "muted" }, "Plugins, config and history live here, so Termux and Neovim can reach them.")
        : h("p", { class: "warn" }, "The app can't use /sdcard yet, so files are in its own folder. ", h("button", { onclick: () => api("/api/app/action", { action: "grantFiles" }) }, "Allow all files access"), " then restart the app."),
      h("h3", {}, "Local API for other apps"),
      h("p", { class: "muted" }, `POST http://127.0.0.1:${S.app.port}/api/v1/chat with {"prompt": "..."} returns the decoded reply. Optional: "profile", "chat" ("new", "current" or a file path), "folder".`),
      h("pre", {}, `curl -s 127.0.0.1:${S.app.port}/api/v1/chat -d '{"prompt":"hi"}'`),
      h("p", { class: "muted" }, "Apps that take an OpenAI API key: base URL below, model = a profile name, API key = the token (any key while no token is set). Each request becomes one new chat on the site."),
      h("div", { class: "row" }, h("pre", { class: "grow" }, `http://127.0.0.1:${S.app.port}/v1`), h("button", { class: "small", onclick: () => navigator.clipboard.writeText(`http://127.0.0.1:${S.app.port}/v1`).then(() => toast("Copied")) }, "Copy")),
      h("label", { class: "field" }, h("span", {}, "API token (then send: Authorization: Bearer <token>)"), h("div", { class: "row" }, tok, h("button", {
        onclick: async () => {
          await api("/api/secret", { key: "apiToken", value: tok.value });
          S.app.apiToken = !!tok.value;
          toast(tok.value ? "API token set" : "API token cleared");
          tok.value = "";
        },
      }, "Save"))),
      h("label", { class: "field" }, h("span", {}, "Folder for chats made through the API"), h("input", { value: S.config.api.folder, oninput: (e) => ((S.config.api.folder = e.target.value), saveConfig()) })),
      h("h3", {}, "Background"),
      h("p", { class: "muted" }, "A notification keeps the AI page and the API alive while the app is in the background."),
      h("button", { onclick: () => api("/api/app/action", { action: "stopService" }) }, "Stop background service"),
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
  { name: "Copy page report (to fix a site)", key: "", run: copyPageReport, menu: true },
  { name: "Import messages from the linked site chat", key: "", run: importHistory, menu: true },
  { name: "Add the page's newest reply to this chat", key: "", run: addFromPage, menu: true },
  { name: "Decode newest reply on the AI page (preview)", key: "", run: decodeLast },
  { name: "Move chat to folder…", key: "", run: () => S.chat.path ? openChatActions(S.chats.find((c) => c.path === S.chat.path) || S.chat) : toast("Send a message first") },
  ...profile().plugins
    .filter((e) => isStep(S.plugins.get(e.id)))
    .map((e) => ({ name: `Toggle ${pluginName(e.id)} (${e.on ? "on" : "off"})`, run: () => ((e.on = !e.on), saveConfig(), render()) })),
];

const openHelp = () =>
  openSheet("Shortcuts & help", () => [
    h("p", { class: "muted" }, "Everything has a button or a gesture; keys are extras for a hardware keyboard."),
    h("h3", {}, "Touch"),
    ...[
      ["Swipe a reply right", "quote it in your message"],
      ["Swipe a reply left", "copy it"],
      ["Long-press your last message", "edit and resend"],
      ["Long-press a code block", "copy the code"],
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
    const pills = document.querySelectorAll(".blocks .pill-main");
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
    if (document.activeElement?.closest?.(".composer")) scrollDown();
  });
  fit();
}

// ---------- start ----------
const boot = async () => {
  app.replaceChildren(h("p", { class: "muted boot" }, "Starting…"));
  try {
    S.app = await api("/api/app");
    if (S.app.site && S.app.site.url) S.site = { connected: true, url: S.app.site.url, title: S.app.site.title };
    const cfg = await api("/api/config");
    S.config = Object.assign(DEFAULT_CONFIG(), cfg);
    S.config.git = Object.assign(DEFAULT_CONFIG().git, cfg.git || {});
    S.config.api = Object.assign(DEFAULT_CONFIG().api, cfg.api || {});
    S.config.ui = Object.assign(DEFAULT_CONFIG().ui, cfg.ui || {});
    S.pluginFolder = (await api("/api/plugins")).folder;
    await loadPlugins();
    applyLook();
    await Promise.all([loadTree(), loadTags()]);
    S.chat = newChat();
    if (S.config.lastChat && S.chats.some((c) => c.path === S.config.lastChat)) await openChat(S.config.lastChat).catch(() => {});
    saveConfig();
    render();
    scrollDown();
    warmSite();
  } catch (e) {
    app.replaceChildren(h("p", { class: "error boot" }, "Could not start: " + e.message), h("button", { onclick: () => location.reload() }, "Retry"));
    return;
  }
  pollEvents();
};
boot();
