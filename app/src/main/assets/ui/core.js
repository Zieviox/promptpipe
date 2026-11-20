"use strict";
// promptpipe core: the small part of the app that isn't a plugin. It talks to
// the app over /api (served by the core, see core/), keeps the shared state, loads plugins and
// the core plugins (tag "core"; the one with "ui" too is the screen), and passes app events on.
// Everything else (sending, chat files, history, the screen) is a built-in
// plugin you can replace. See /docs/PLUGINS.md ("Core plugins").

// Safe mode (?safe=1): only built-in plugins load, so a broken plugin of yours
// can't lock you out. Turn it off from the banner or Settings.
const SAFE = new URLSearchParams(location.search).has("safe");
const FAILED = new URLSearchParams(location.search).get("failed") || "";
const pluginUrl = (id, file) => (SAFE ? "/builtin/" : "/plugins/") + encodeURIComponent(id) + "/" + file;
const restart = (safe = SAFE) => location.replace(location.pathname + (safe ? "?safe=1" : ""));

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
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};

const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "bad answer from the app (" + r.status + ")" }));
  if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
  return j;
};

// Copy through the app's clipboard module, which works after any wait (the
// browser's only right after a tap); the browser's is the fallback. Says so either way.
const copyText = async (text, done = "Copied") => {
  try {
    await api("/api/module", { module: "clipboard", call: "copy", args: { text: String(text ?? "") } });
  } catch (e) {
    try {
      await navigator.clipboard.writeText(String(text ?? ""));
    } catch (e2) {
      toast("Couldn't copy: " + e.message, "error");
      return false;
    }
  }
  if (done) toast(done);
  return true;
};

// Save a file for the user in <storage>/export/ (a folder other apps reach).
// Resolves its path, or null after saying why.
const exportFile = async (name, text) => {
  try {
    const r = await api("/api/export", { name, text });
    toast("Saved " + r.path);
    return r.path;
  } catch (e) {
    toast("Couldn't save the file: " + e.message, "error");
    return null;
  }
};
// Ask for text files; calls back with [{ name, text }] once they are read.
const pickFiles = (done, { multiple = false, accept = ".json,.md,.txt,text/*" } = {}) => {
  const input = h("input", { type: "file", multiple, accept });
  input.onchange = async () => {
    const files = [...(input.files || [])];
    if (!files.length) return;
    if (files.some((f) => f.size > 5_000_000)) return toast("A file is over 5 MB", "error");
    done(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
  };
  input.click();
};

// Replaceable by the screen (it may assign its own).
let toast = (msg, kind = "info") => {
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
  // Site pages (several = chats in parallel); page = the one the site view shows.
  pages: [],
  page: 0,
  pageTurns: {}, // page -> the message being answered there
  busy: false,
  progress: "",
  drawer: false,
  sheet: null, // { title, render }
  advOpen: !!local("advOpen"),
  query: "",
  traces: new WeakMap(), // turn -> full trace (this session only)
  openSent: new WeakSet(), // replies whose "Thought for / sent with" is unfolded
  openLong: new WeakSet(), // long messages of yours opened with "Show more"
  qaSet: new WeakMap(), // replies whose action row was opened or closed by hand
};

// S.site = the page the site view shows (most commands act on it).
const pg = (i) => (S.pages[i] = S.pages[i] || { connected: false, url: "", title: "", busy: false });
Object.defineProperty(S, "site", {
  get: () => pg(S.page),
  set: (v) => Object.assign(pg(S.page), v),
});

const DEFAULT_CONFIG = () => ({
  // A profile: its blocks (see core-profiles), its groups, and its plugins' settings.
  profiles: [{ id: "p1", name: "Default", blocks: [], groups: [], pluginSettings: {} }],
  // The provider new chats start on (the first one you install, then the last one picked).
  provider: "",
  activeProfile: "p1",
  lastChat: "",
  git: { enabled: true, name: "", email: "", remote: "", autoPush: false },
  api: { folder: "api" },
  ui: { scale: 1, theme: "", mode: "", accent: "", text: 16, enterSends: false },
  // Minutes to wait for a reply; 0 = no limit (Stop waiting is always there).
  wait: { idleMin: 0, maxMin: 0 },
  // Max replies at once: sends (yours, plugins', other apps') run in parallel up to this many
  // (5; 10 once moreReplies is on). Site pages open as they are needed.
  maxReplies: 5,
  moreReplies: false,
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
  // Copy text (the app's clipboard): resolves true, or false after saying why.
  copy: (text, done) => copyText(text, done),
  // Save a file for the user (<storage>/export/) and pick text files to read.
  exportFile,
  pickFiles,
  // What to do when an imported name already exists: "ask" | "both" | "replace" (Settings › Import and export).
  importMode: () => S.config.importClash || "ask",
  toast: (msg, kind) => toast(msg, kind),
  // App events (see "events" below): PP.on("job", fn), PP.emit("my-event", data).
  on: (type, fn) => on(type, fn),
  emit: (type, ev) => emit(type, ev),
  // Ask before something you can't undo: resolves to true or null. The screen
  // brings its own (the browser's confirm() may be switched off in the app).
  confirm: (msg) => Promise.resolve(window.confirm(msg) || null),
  askText: (msg, value = "") => Promise.resolve(window.prompt(msg, value) || null),
  // Change a plugin's setting for the active profile: PP.setSetting("id", "key", value).
  setSetting: (id, key, value) => setSetting(id, key, value),
  // True in safe mode (only built-in plugins are loaded).
  safe: SAFE,
  md: (text) => mdToHtml(text),
  get chat() {
    return S.chat;
  },
  get profile() {
    return profile();
  },
  site: (cmd, extra) => siteCmd(cmd, extra),
  // Ask the site something on the side (a fresh chat, not saved): resolves to { reply, thinking, url }.
  ask: (prompt, opts) => askSite(prompt, opts),
  // A sheet of the plugin's own: render() returns its elements and runs again on PP.render().
  sheet: (title, renderFn) => openSheet(title, renderFn),
  render: () => render(),
  // Add a System prompt block (its own copy of the text) to the active profile, before "Your message".
  addPromptBlock: (name, text) => {
    const prof = profile();
    const at = prof.blocks.findIndex((b) => b.type === "message");
    prof.blocks.splice(Math.max(0, at), 0, PP.profiles.promptBlock(name || "", text));
    saveConfig();
    render();
    toast("Added to " + prof.name);
  },
  // Another plugin's settings for the active profile (read only), e.g. PP.settings("memory").window.
  settings: (id) => settingsFor(id),
  // The provider of the open chat (its description: { name, url, input, ... }).
  get provider() {
    return providerFor();
  },
});

const loadPlugins = async () => {
  const { plugins } = await api("/api/plugins" + (SAFE ? "?builtin=1" : ""));
  S.plugins.clear();
  // Listeners from the plugins' last load go; core plugins' listeners stay.
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].owner) listeners.splice(i, 1);
  window.onerror = (msg, src, line) => {
    const p = S.plugins.get(loadingId);
    if (p && src && src.includes("/" + encodeURIComponent(p.id) + "/")) p.error = `${msg} (line ${line})`;
  };
  for (const p of plugins) {
    S.plugins.set(p.id, { ...p, def: null });
    if (p.manifest && p.manifest.contentScript) {
      try {
        const r = await fetch(pluginUrl(p.id, p.manifest.contentScript) + "?t=" + Date.now());
        if (!r.ok) throw new Error(p.manifest.contentScript + " not found");
        S.plugins.get(p.id).contentScript = await r.text();
      } catch (e) {
        S.plugins.get(p.id).error = e.message;
      }
    }
    const main = p.manifest && p.manifest.main;
    if (!main) continue;
    loadingId = p.id;
    try {
      // Each plugin runs in its own function scope, so reloading it (or two
      // plugins using the same top-level names) doesn't clash.
      const url = pluginUrl(p.id, main);
      const r = await fetch(url + "?t=" + Date.now());
      if (!r.ok) throw new Error(main + " not found");
      new Function("PP", (await r.text()) + "\n//# sourceURL=" + location.origin + url)(PP);
      if (!S.plugins.get(p.id).def && !S.plugins.get(p.id).error) S.plugins.get(p.id).error = "main.js did not call PP.plugin({...})";
    } catch (e) {
      S.plugins.get(p.id).error = e.message;
    }
  }
  loadingId = null;
  syncProfiles();
  await emit("plugins");
};

// Every plugin is a plugin; its "tags" say what else it is:
//   provider  drives one AI website (its "provider" description, maybe a contentScript)
//   theme     colours (its css)
//   core      part of the app itself (sending, history, ...); with "ui" too: the screen
//   driver    a contentScript with default page commands for every provider
//   passive   not a block: no toggle, it only adds menu entries (Page report)
// A plugin with none of these can be a block of a profile, with a toggle.
const hasTag = (p, tag) => !!(p && p.manifest && Array.isArray(p.manifest.tags) && p.manifest.tags.includes(tag));
const isProvider = (p) => hasTag(p, "provider");
const isTheme = (p) => hasTag(p, "theme");
// A driver replaces the default page commands for every provider; a provider's own contentScript still wins.
const isDriver = (p) => hasTag(p, "driver");
const isPassive = (p) => hasTag(p, "passive");
const isBlockPlugin = (p) => p && p.manifest && !isProvider(p) && !isTheme(p) && !isCore(p) && !isDriver(p) && !isPassive(p);
const pluginName = (id) => S.plugins.get(id)?.manifest?.name || id;

// Saved settings from before the rename of 2026-11-20 (legacy names) take the new names, once.
const migrateConfig = (c) => {
  if (c.provider == null && c.site != null) c.provider = c.site; // legacy: config.site
  if (c.siteSettings && !c.providerSettings) c.providerSettings = c.siteSettings; // legacy: config.siteSettings
  delete c.site;
  delete c.siteSettings;
  if (c.ui && c.ui.part && !c.ui.screen) c.ui.screen = c.ui.part; // legacy: ui.part
  if (c.ui) delete c.ui.part; // legacy
  for (const prof of c.profiles || []) {
    // legacy: prof.plugins = [{ id, on, settings }]; "on" is now the profile's blocks (core-profiles)
    if (Array.isArray(prof.plugins)) {
      prof.pluginSettings = { ...Object.fromEntries(prof.plugins.map((e) => [e.id, e.settings || {}])), ...(prof.pluginSettings || {}) };
      prof.legacyPluginsOn = Object.fromEntries(prof.plugins.map((e) => [e.id, !!e.on]));
      delete prof.plugins;
    }
    prof.pluginSettings = prof.pluginSettings || {};
    delete prof.site;
    delete prof.siteSettings;
  }
  return c;
};

// The provider new chats start on is one that is installed.
const syncProfiles = () => {
  const providers = [...S.plugins.values()].filter(isProvider);
  if (providers.length && !providers.some((p) => p.id === S.config.provider)) S.config.provider = providers[0].id;
};

const profile = () => S.config.profiles.find((p) => p.id === S.config.activeProfile) || S.config.profiles[0];
// A chat's profile: the one named in its file (a renamed profile keeps its old names in
// aka), else the active one. Opening a chat makes its profile the active one.
const profileNamed = (n) => (n ? S.config.profiles.find((p) => p.name === n || (p.aka || []).includes(n)) : null) || null;
const profileOf = (chat) => profileNamed(chat?.meta?.profile) || profile();
// A plugin's settings as the profile saved them.
const pluginSaved = (id, prof = profile()) => ((prof.pluginSettings = prof.pluginSettings || {})[id] = prof.pluginSettings[id] || {});

// A provider's own saved things (its settings, the model and options you
// picked): one per provider, whatever the profile.
const providerSaved = (id) => ((S.config.providerSettings = S.config.providerSettings || {})[id] = S.config.providerSettings[id] || {});
// Settings: what the profile saved (a provider's: what that provider saved), else the manifest's default.
const settingsFor = (id, prof = profile()) => {
  const man = S.plugins.get(id)?.manifest || {};
  const saved = isProvider(S.plugins.get(id)) ? providerSaved(id) : pluginSaved(id, prof);
  const out = {};
  for (const [k, d] of Object.entries(man.settings || {})) out[k] = k in saved ? saved[k] : d.default;
  return out;
};
const setSetting = (id, key, value, prof = profile()) => {
  if (isProvider(S.plugins.get(id))) providerSaved(id)[key] = value;
  else pluginSaved(id, prof)[key] = value;
  saveConfig();
};

// The provider a chat uses: its own (meta.provider), else the one its file names
// (older chats: meta.ai), else the default for new chats (the last one picked).
const providerIdOf = (chat = S.chat) => {
  const ok = (id) => !!id && isProvider(S.plugins.get(id));
  if (chat && ok(chat.meta.provider)) return chat.meta.provider;
  const byName = chat && chat.meta.ai && [...S.plugins.values()].find((p) => isProvider(p) && p.manifest.name === chat.meta.ai);
  if (byName) return byName.id;
  return ok(S.config.provider) ? S.config.provider : "";
};
// Pick the provider for a chat; new chats take it too from then on.
const setChatProvider = (id, chat = S.chat) => {
  chat.meta.provider = id;
  chat.meta.ai = pluginName(id);
  S.config.provider = id;
  saveConfig();
};

const providerFor = (chat = S.chat) => {
  const p = S.plugins.get(providerIdOf(chat));
  if (!p || !isProvider(p)) return null;
  const provider = JSON.parse(JSON.stringify(p.manifest.provider || {}));
  provider.id = p.id;
  provider.settings = settingsFor(p.id);
  if (provider.settings.replySelector) provider.reply = [provider.settings.replySelector, ...(provider.reply || [])];
  provider.name = p.manifest.name;
  if (p.contentScript) provider.contentScript = p.contentScript;
  const drivers = [...S.plugins.values()].filter((d) => isDriver(d) && d.contentScript && d.manifest.enabled !== false);
  if (drivers.length) provider.drivers = drivers.map((d) => d.contentScript);
  return provider;
};

// route hook: before a message goes out, a plugin may pick the profile and the
// site chat: return { profile: "name or id", url: "https://..." | "new" }, or
// nothing. The first plugin (in profile order) that answers wins.
const runRoute = async (ctx, prof) => {
  for (const id of activePlugins(prof)) {
    const def = S.plugins.get(id).def;
    if (typeof def.route !== "function") continue;
    const r = await def.route({ ...ctx, settings: settingsFor(id, prof), turnData: undefined });
    if (r && (r.profile || r.url)) return { ...r, by: id };
  }
  return null;
};

// Which plugins run, and whether one is on. The Profiles core plugin (core-profiles) replaces
// these with the profile's blocks; without it, no plugin runs.
let activePlugins = () => [];
let pluginOn = () => false;
// The profile as a chat uses it (with the chat's own toggles); without core-profiles, the profile.
let forChat = (prof) => prof;
let setPluginOn = () => {};

// What a plugin hook gets besides the text.
const hookCtx = (id, ctx, prof, notes) => ({
  ...ctx,
  settings: settingsFor(id, prof),
  note: (m) => notes.push(m),
  // This plugin's own notes on the message, saved in the chat file.
  turnData: ctx.turn?.data?.[id],
  setTurnData: (v) => ctx.turn && ((ctx.turn.data = ctx.turn.data || {})[id] = v),
});

const runHooks = async (hook, text, ctx, trace, prof) => {
  for (const id of activePlugins(prof)) {
    const def = S.plugins.get(id).def;
    if (typeof def[hook] !== "function") continue;
    const notes = [];
    const out = await def[hook](text, hookCtx(id, ctx, prof, notes));
    if (typeof out === "string") text = out;
    trace.push({ label: `${pluginName(id)} · ${hook === "beforeSend" ? "before" : "after"}`, text, notes });
    ctx.notes.push(...notes.map((n) => `${pluginName(id)}: ${n}`));
  }
  return text;
};

// The message that goes to the site: your text through the plugins' beforeSend.
// core-profiles replaces it (the profile's blocks, top to bottom).
let buildMessage = (prompt, ctx, trace, prof) => runHooks("beforeSend", prompt, ctx, trace, prof);

// ---------- AI page ----------
const siteCmd = (cmd, extra = {}) => api("/api/site", { cmd, provider: providerFor(), page: S.page, ...extra });
const openSite = async (url, page = S.page, turn = null) => {
  if (turn) turn.progress = "Opening " + url;
  else S.progress = "Opening " + url;
  render();
  const r = await api("/api/site/open", { url, page });
  Object.assign(pg(page), { connected: true, url: r.url, title: r.title });
  return r;
};

// ---------- the screen fills these in ----------
// The screen (the core plugin tagged "ui", built-in: chat-ui) assigns its own versions; the
// other core plugins call them. Until then (or without a screen) they do the minimum.
const app = document.getElementById("app");
let render = () => {
  app.replaceChildren(
    h("p", { class: "error boot" }, "No app UI is loaded." + (SAFE ? "" : " Safe mode loads the built-in one.")),
    SAFE ? h("button", { onclick: () => location.reload() }, "Retry") : h("button", { onclick: () => restart(true) }, "Open in safe mode"),
  );
};
let renderStatus = () => {};
let rerenderSheet = () => {};
let openSheet = (title) => toast(title + ": no UI loaded", "error");
let closeDrawer = () => {};
let scrollDown = () => {};
let fillComposer = () => {};
let markUnseen = () => {};

// ---------- events ----------
// Parts and plugins listen with PP.on(type, fn). Types: every app event below
// (job, share, error, pluginInstalled, ...), plus "start" and "ready" at boot
// and "plugins" after plugins (re)load.
const listeners = [];
const on = (type, fn, owner = loadingId) => listeners.push({ type, fn, owner });
// strict: a listener's error stops the caller (used at start).
const emit = async (type, ev, strict = false) => {
  for (const l of listeners.filter((x) => x.type === type)) {
    try {
      await l.fn(ev);
    } catch (e) {
      if (strict) throw e;
      console.error(e);
      toast(`${l.owner ? pluginName(l.owner) : "App"} (${type}): ${e.message}`, "error");
    }
  }
};

const pollEvents = async () => {
  let after = 0;
  let first = true;
  for (;;) {
    try {
      const r = await api("/api/events?after=" + after);
      for (const ev of r.events) {
        if (ev.type === "site") {
          const p = pg(ev.page || 0);
          if (ev.event === "progress") {
            const t = S.pageTurns[ev.page || 0];
            if (t) {
              t.progress = ev.text;
              // Empty values don't wipe what a content script already showed.
              if (ev.live) for (const [k, v] of Object.entries(ev.live)) if (v) t.live = { ...t.live, [k]: v };
            } else if (S.progress) S.progress = ev.text;
          } else Object.assign(p, { connected: ev.connected !== false, url: ev.url || p.url, title: ev.title || p.title });
          renderStatus();
          emit("site", ev);
        } else if (ev.type === "shown") {
          // The site view now shows another page: commands like Check act on that one.
          S.page = ev.page || 0;
          render();
          emit("shown", ev);
        } else if (first) continue; // old events from before this page loaded
        else if (ev.type === "pluginInstalled") {
          await loadPlugins();
          setPluginOn(ev.id, true);
          toast("Installed " + ev.id);
          rerenderSheet();
          render();
          emit("pluginInstalled", ev);
        } else if (ev.type === "error") toast(ev.text, "error");
        else emit(ev.type, ev);
      }
      after = r.seq;
      first = false;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};

// ---------- core plugins ----------
// Plugins tagged "core" (and the one screen, tagged "ui" too) are scripts loaded
// in "order", before start, sharing one scope: what one declares at top
// level the others (and the next ones) can use. A plugin of yours with the
// same id replaces the built-in one. If yours fails to load, the app
// restarts in safe mode and says which one.
let loadingCore = null;
let coreError = "";
window.addEventListener("error", (e) => {
  if (loadingCore && (e.filename || "").includes("/" + encodeURIComponent(loadingCore.id) + "/")) coreError = `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`;
});
const loadScript = (src) =>
  new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(src.split("?")[0] + " not found"));
    document.body.append(s);
  });
const isCore = (p) => hasTag(p, "core");
const isScreen = (p) => isCore(p) && hasTag(p, "ui");
const loadCore = async () => {
  const [{ plugins }, cfg] = await Promise.all([api("/api/plugins" + (SAFE ? "?builtin=1" : "")), api("/api/config").catch(() => ({}))]);
  const uiId = (cfg.ui && (cfg.ui.screen || cfg.ui.part)) || "chat-ui"; // legacy: ui.part
  const screens = plugins.filter(isScreen);
  const screen = screens.find((p) => p.id === uiId) || screens.find((p) => p.id === "chat-ui") || screens[0];
  const cores = plugins.filter((p) => isCore(p) && (!isScreen(p) || p === screen) && p.manifest.enabled !== false);
  cores.sort((a, b) => (a.manifest.order ?? 50) - (b.manifest.order ?? 50) || a.id.localeCompare(b.id));
  S.cores = cores.map((p) => ({ id: p.id, source: p.source, screen: isScreen(p) }));
  for (const p of cores) {
    loadingCore = p;
    coreError = "";
    try {
      for (const css of [].concat(p.manifest.css || [])) document.head.append(h("link", { rel: "stylesheet", href: pluginUrl(p.id, css) }));
      for (const js of [].concat(p.manifest.scripts || [])) {
        await loadScript(pluginUrl(p.id, js) + "?t=" + Date.now());
        if (coreError) throw new Error(coreError);
      }
    } catch (e) {
      loadingCore = null;
      if (!SAFE && p.source === "user") return location.replace(location.pathname + "?safe=1&failed=" + encodeURIComponent(p.id + ": " + e.message));
      throw new Error(`core plugin ${p.id}: ${e.message}`);
    }
  }
  loadingCore = null;
};

// ---------- plugin updates ----------
// Each release has a plugin bundle (promptpipe-plugins-<version>.zip). The app
// downloads it (on start, at most once a day, and from Update in Settings);
// newer plugins in it replace the built-in ones from the next start. If the
// download fails, download the zip yourself and pick it with Install from a
// file. Your own plugins folder always wins; safe mode ignores updates.
const updateRepo = () => (S.config.updates && S.config.updates.repo) || "Zieviox/promptpipe";
const releasePage = () => `https://github.com/${updateRepo()}/releases/latest`;
const updatePlugins = async ({ quiet = false, force = false } = {}) => {
  S.updates = { ...(S.updates || {}), busy: true, error: "" };
  if (!quiet) toast("Checking for plugin updates…");
  rerenderSheet();
  try {
    // Tried today, even if it fails (it tries again tomorrow, or on Update).
    S.config.updates = { ...(S.config.updates || {}), checked: iso() };
    saveConfig();
    const r = await api("/api/plugins/update", { repo: updateRepo(), force });
    S.updates = { busy: false, error: "", bundle: await api("/api/plugins/bundle").catch(() => ({})) };
    if (r.updated) toast(`Plugins updated to ${r.version} (${(r.plugins || []).length}). Restart the app to use them.`);
    else if (!quiet) toast("Plugins are up to date (" + r.version + ")");
    return r;
  } catch (e) {
    S.updates = { ...S.updates, busy: false, error: e.message };
    // The automatic daily check fails quietly (Settings › Core plugins and Plugins › Library show
    // "Last check: …"); a check you started says so here.
    if (!quiet) toast("Plugin update failed: " + e.message + ". Settings › Core plugins has the zip to install by hand.", "error");
  } finally {
    rerenderSheet();
  }
};
on("ready", async () => {
  S.updates = { bundle: await api("/api/plugins/bundle").catch(() => ({})) };
  const u = S.config.updates || {};
  if (SAFE || u.auto === false) return;
  if (u.checked && Date.now() - Date.parse(u.checked) < 20 * 3600000) return;
  updatePlugins({ quiet: true });
});
on("pluginBundle", (ev) => {
  toast(`Plugin bundle ${ev.version} installed. Restart the app to use it.`);
  api("/api/plugins/bundle").then((b) => ((S.updates = { ...(S.updates || {}), bundle: b, error: "" }), rerenderSheet()), () => {});
});

// ---------- start ----------
// The screen before the screen plugin is there: a small spinner while it starts, the reason if it can't.
const bootScreen = (msg, error) => {
  app.replaceChildren(
    ...[
      h("p", { class: (error ? "error" : "muted") + " boot", role: error ? "alert" : "status" }, error ? null : h("span", { class: "spinner", "aria-hidden": "true" }), msg),
      error ? h("div", { class: "row" }, h("button", { onclick: () => location.reload() }, "Retry"), SAFE ? null : h("button", { onclick: () => restart(true) }, "Open in safe mode")) : null,
    ].filter(Boolean),
  );
};
const boot = async () => {
  bootScreen("Starting…");
  try {
    await loadCore();
    S.app = await api("/api/app");
    for (const p of S.app.pages || []) Object.assign(pg(p.page), { connected: p.connected, url: p.url, title: p.title });
    const cfg = await api("/api/config");
    const def = DEFAULT_CONFIG();
    S.config = Object.assign(def, migrateConfig(cfg));
    for (const k of ["git", "api", "ui", "wait"]) S.config[k] = Object.assign(DEFAULT_CONFIG()[k], cfg[k] || {});
    S.pluginFolder = (await api("/api/plugins")).folder;
    await loadPlugins();
    // Each core plugin loads what it needs (chat list, pages, look), in order.
    await emit("start", null, true);
    saveConfig();
    await emit("ready", null, true);
    if (FAILED) toast("Safe mode: your plugin “" + FAILED + "” didn't load, so only built-in plugins are on.", "error");
  } catch (e) {
    console.error(e);
    bootScreen("Could not start: " + e.message, true);
    return;
  }
  pollEvents();
};

boot();
