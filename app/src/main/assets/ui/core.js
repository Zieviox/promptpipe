"use strict";
// promptpipe core: the small part of the app that isn't a plugin. It talks to
// the app over /api (see Server.kt), keeps the shared state, loads plugins and
// the app parts ("kind": "core" / "ui" plugins), and passes app events on.
// Everything else (sending, chat files, history, the screen) is a built-in
// plugin you can replace. See /docs/PLUGINS.md ("App parts").

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
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};

const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "bad answer from the app (" + r.status + ")" }));
  if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
  return j;
};

// Replaceable by the UI part (it may assign its own).
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
  openTurns: new WeakSet(), // turns whose options are unfolded
};

// S.site = the page the site view shows (most commands act on it).
const pg = (i) => (S.pages[i] = S.pages[i] || { connected: false, url: "", title: "", busy: false });
Object.defineProperty(S, "site", {
  get: () => pg(S.page),
  set: (v) => Object.assign(pg(S.page), v),
});

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
  // Site pages at once: sends (yours, plugins', other apps') run in parallel up to this many.
  pages: 1,
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
  toast: (msg, kind) => toast(msg, kind),
  // App events (see "events" below): PP.on("job", fn), PP.emit("my-event", data).
  on: (type, fn) => on(type, fn),
  emit: (type, ev) => emit(type, ev),
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
  // Another plugin's settings for the active profile (read only), e.g. PP.settings("system-prompt").stack.
  settings: (id) => settingsFor(id),
  // The site plugin of the active profile ({ name, url, ... }).
  get sitePlugin() {
    return siteFor();
  },
});

const loadPlugins = async () => {
  const { plugins } = await api("/api/plugins" + (SAFE ? "?builtin=1" : ""));
  S.plugins.clear();
  // Listeners from the plugins' last load go; parts' listeners stay.
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].owner) listeners.splice(i, 1);
  window.onerror = (msg, src, line) => {
    const p = S.plugins.get(loadingId);
    if (p && src && src.includes("/" + encodeURIComponent(p.id) + "/")) p.error = `${msg} (line ${line})`;
  };
  for (const p of plugins) {
    S.plugins.set(p.id, { ...p, def: null });
    if (p.manifest && p.manifest.siteScript) {
      try {
        const r = await fetch(pluginUrl(p.id, p.manifest.siteScript) + "?t=" + Date.now());
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

const isSite = (p) => p && p.manifest && (p.manifest.kind === "site" || p.manifest.site);
const isTheme = (p) => p && p.manifest && p.manifest.kind === "theme";
// A driver ("kind": "driver" with a "siteScript") replaces the default page
// commands for every AI site; a site plugin's own script still wins.
const isDriver = (p) => p && p.manifest && p.manifest.kind === "driver";
const isStep = (p) => p && p.manifest && !isSite(p) && !isTheme(p) && !isPart(p) && !isDriver(p);
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
  const drivers = [...S.plugins.values()].filter((d) => isDriver(d) && d.siteScript && d.manifest.enabled !== false);
  if (drivers.length) site.drivers = drivers.map((d) => d.siteScript);
  return site;
};

// route hook: before a message goes out, a plugin may pick the profile and the
// site chat: return { profile: "name or id", url: "https://..." | "new" }, or
// nothing. The first plugin (in profile order) that answers wins.
const runRoute = async (ctx, prof) => {
  for (const e of activePlugins(prof)) {
    const def = S.plugins.get(e.id).def;
    if (typeof def.route !== "function") continue;
    const r = await def.route({ ...ctx, settings: settingsFor(e.id, prof), turnData: undefined });
    if (r && (r.profile || r.url)) return { ...r, by: e.id };
  }
  return null;
};

const activePlugins = (prof = profile()) => prof.plugins.filter((e) => e.on && S.plugins.get(e.id)?.def);

const runHooks = async (hook, text, ctx, trace, prof) => {
  for (const e of activePlugins(prof)) {
    const def = S.plugins.get(e.id).def;
    if (typeof def[hook] !== "function") continue;
    const notes = [];
    const out = await def[hook](text, {
      ...ctx,
      settings: settingsFor(e.id, prof),
      note: (m) => notes.push(m),
      // This plugin's own notes on the message, saved in the chat file.
      turnData: ctx.turn?.data?.[e.id],
      setTurnData: (v) => ctx.turn && ((ctx.turn.data = ctx.turn.data || {})[e.id] = v),
    });
    if (typeof out === "string") text = out;
    trace.push({ label: `${pluginName(e.id)} · ${hook === "beforeSend" ? "before" : "after"}`, text, notes });
    ctx.notes.push(...notes.map((n) => `${pluginName(e.id)}: ${n}`));
  }
  return text;
};

// ---------- AI page ----------
const siteCmd = (cmd, extra = {}) => api("/api/site", { cmd, site: siteFor(), page: S.page, ...extra });
const openSite = async (url, page = S.page, turn = null) => {
  if (turn) turn.progress = "Opening " + url;
  else S.progress = "Opening " + url;
  render();
  const r = await api("/api/site/open", { url, page });
  Object.assign(pg(page), { connected: true, url: r.url, title: r.title });
  return r;
};

// ---------- the UI part fills these in ----------
// The UI plugin ("kind": "ui", built-in: chat-ui) assigns its own versions; the
// other parts call them. Until then (or without a UI) they do the minimum.
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
              // Empty parts don't wipe what a site script already showed.
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
          entryFor(ev.id).on = true;
          saveConfig();
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

// ---------- app parts ----------
// "kind": "core" plugins (and the one "kind": "ui" plugin) are scripts loaded
// in "order", before start, sharing one scope: what one part declares at top
// level the others (and the next parts) can use. A plugin of yours with the
// same id replaces the built-in part. If yours fails to load, the app
// restarts in safe mode and says which one.
let loadingPart = null;
let partError = "";
window.addEventListener("error", (e) => {
  if (loadingPart && (e.filename || "").includes("/" + encodeURIComponent(loadingPart.id) + "/")) partError = `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`;
});
const loadScript = (src) =>
  new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(src.split("?")[0] + " not found"));
    document.body.append(s);
  });
const isPart = (p) => p && p.manifest && ["core", "ui"].includes(p.manifest.kind);
const loadParts = async () => {
  const [{ plugins }, cfg] = await Promise.all([api("/api/plugins" + (SAFE ? "?builtin=1" : "")), api("/api/config").catch(() => ({}))]);
  const uiId = (cfg.ui && cfg.ui.part) || "chat-ui";
  const uis = plugins.filter((p) => isPart(p) && p.manifest.kind === "ui");
  const ui = uis.find((p) => p.id === uiId) || uis.find((p) => p.id === "chat-ui") || uis[0];
  const parts = plugins.filter((p) => isPart(p) && (p.manifest.kind === "core" || p === ui) && p.manifest.enabled !== false);
  parts.sort((a, b) => (a.manifest.order ?? 50) - (b.manifest.order ?? 50) || a.id.localeCompare(b.id));
  S.parts = parts.map((p) => ({ id: p.id, source: p.source, kind: p.manifest.kind }));
  for (const p of parts) {
    loadingPart = p;
    partError = "";
    try {
      for (const css of [].concat(p.manifest.css || [])) document.head.append(h("link", { rel: "stylesheet", href: pluginUrl(p.id, css) }));
      for (const js of [].concat(p.manifest.scripts || [])) {
        await loadScript(pluginUrl(p.id, js) + "?t=" + Date.now());
        if (partError) throw new Error(partError);
      }
    } catch (e) {
      loadingPart = null;
      if (!SAFE && p.source === "user") return location.replace(location.pathname + "?safe=1&failed=" + encodeURIComponent(p.id + ": " + e.message));
      throw new Error(`app part ${p.id}: ${e.message}`);
    }
  }
  loadingPart = null;
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
    toast("Plugin update failed: " + e.message + ". Settings › App parts has the zip to install by hand.", "error");
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
const bootScreen = (msg, error) => {
  app.replaceChildren(
    h("p", { class: (error ? "error" : "muted") + " boot" }, msg),
    error ? h("div", { class: "row" }, h("button", { onclick: () => location.reload() }, "Retry"), SAFE ? null : h("button", { onclick: () => restart(true) }, "Open in safe mode")) : null,
  );
};
const boot = async () => {
  bootScreen("Starting…");
  try {
    await loadParts();
    S.app = await api("/api/app");
    for (const p of S.app.pages || []) Object.assign(pg(p.page), { connected: p.connected, url: p.url, title: p.title });
    const cfg = await api("/api/config");
    const def = DEFAULT_CONFIG();
    S.config = Object.assign(def, cfg);
    for (const k of ["git", "api", "ui", "wait"]) S.config[k] = Object.assign(DEFAULT_CONFIG()[k], cfg[k] || {});
    S.pluginFolder = (await api("/api/plugins")).folder;
    await loadPlugins();
    // Each part loads what it needs (chat list, pages, look), in part order.
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
