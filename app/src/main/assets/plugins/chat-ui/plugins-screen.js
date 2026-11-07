"use strict";
// App part (chat screen): the Plugins screen. Two tabs: Profile (what goes with
// your message, in this profile) and Library (every plugin there is: installed,
// or on offer from a source). A plugin has a page of its own (update, go back to
// the earlier version, remove). Sources are repos with an index.json; the
// official one is always there. The Plugin guide helps write one with an AI.

const OFFICIAL = "Zieviox/promptpipe-plugins";
const KINDS = [["all", "All"], ["site", "AI sites"], ["message", "Message plugins"], ["theme", "Themes"], ["tool", "Tools"]];
const KIND_WORDS = { site: "AI site", message: "Message plugin", theme: "Theme", tool: "Tool" };

// What the screen remembers while it is open. Redraws never reset it.
const LIB = { tab: "profile", filter: "all", cat: new Map(), ticked: new Set(), done: {}, busy: false };

// ---------- pure: sources and the library list ----------

const srcKey = (s) => `${s.repo}@${s.branch || "main"}`;
const srcList = () => [{ repo: OFFICIAL, branch: "main", official: true }, ...(S.config.sources || [])];
const srcOfKey = (k) => srcList().find((s) => srcKey(s) === k);
const srcName = (k) => {
  const s = srcOfKey(k);
  return s ? (s.official ? "the official source" : s.repo) : k.split("@")[0];
};
const rawOf = (s, path) => `https://raw.githubusercontent.com/${s.repo}/${s.branch || "main"}/${path}`;

// "owner/name", a GitHub link, or a link to a branch folder -> { repo, branch }.
const parseSource = (text) => {
  const parts = String(text || "").trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "").split("/");
  const ok = (x) => /^[\w.-]+$/.test(x || "");
  if (parts.length < 2 || !ok(parts[0]) || !ok(parts[1])) return null;
  return { repo: `${parts[0]}/${parts[1]}`, branch: parts[2] === "tree" && parts[3] ? parts.slice(3).join("/") : "main" };
};

const kindOfPlugin = (p) => (isSite(p) ? "site" : isTheme(p) ? "theme" : p.manifest.block === false ? "tool" : "message");
const fromKey = (id) => (S.config.pluginFrom || {})[id];
const catOf = (s) => LIB.cat.get(srcKey(s)) || { plugins: [], error: "", busy: false, loaded: false };

// Installed plugins first (with the update on offer from the source they came
// from), then what the sources offer that isn't here (or is here from another source).
const libItems = () => {
  const items = [];
  const byId = new Map();
  for (const p of S.plugins.values()) {
    if (!p.manifest || isPart(p) || isDriver(p)) continue;
    const it = { id: p.id, name: p.manifest.name || p.id, kind: kindOfPlugin(p), plugin: p, version: p.manifest.version, update: null };
    items.push(it);
    byId.set(p.id, it);
  }
  const offers = [];
  for (const s of srcList()) {
    for (const e of catOf(s).plugins) {
      const have = byId.get(e.id);
      const offer = { src: s, entry: e };
      if (have && fromKey(e.id) === srcKey(s)) {
        if (verNewer(e.version, have.version)) have.update = offer;
      } else offers.push({ id: e.id, name: e.name || e.id, kind: e.kind || "tool", plugin: null, version: e.version, offer, installedElsewhere: !!have });
    }
  }
  return [...items, ...offers];
};
const updateItems = () => libItems().filter((i) => i.update);
const updateCount = () => updateItems().length;

// ---------- reading the sources ----------

const fetchText = async (url) => {
  const r = await api("/api/fetch", { url });
  if (r.status && (r.status < 200 || r.status > 299)) throw new Error(`HTTP ${r.status} for ${url}`);
  const bin = atob(r.base64 || "");
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const doneKey = (o) => `${srcKey(o.src)}/${o.entry.id}`;
const loadSource = async (s) => {
  const k = srcKey(s);
  LIB.cat.set(k, { plugins: [], error: "", busy: true, loaded: false });
  rerenderSheet();
  const next = { plugins: [], error: "", busy: false, loaded: true };
  try {
    const j = JSON.parse(await fetchText(rawOf(s, "index.json")));
    next.plugins = (j.plugins || []).filter((p) => p && p.id && p.path);
    for (const e of next.plugins) if (e.default && !S.plugins.has(e.id)) LIB.ticked.add(doneKey({ src: s, entry: e }));
  } catch (e) {
    next.error = e.message;
  }
  LIB.cat.set(k, next);
  rerenderSheet();
  if (!S.sheet && S.drawer) render(); // the Settings badge
};
const loadSources = (force = false) => srcList().forEach((s) => (force || !LIB.cat.has(srcKey(s))) && loadSource(s));

// ---------- installing ----------

// One offered plugin. Asks first when the name is already taken by something
// from another source (or built in, or put there by you).
const installOffer = async ({ src, entry }) => {
  const have = S.plugins.get(entry.id);
  const from = fromKey(entry.id);
  if (have && from !== srcKey(src)) {
    const where = from ? `from ${srcName(from)}` : have.source === "builtin" ? "built into the app" : "put there by you";
    const sure = await askUser(`${entry.name || entry.id} is already here (${where}). Replace it with the one from ${srcName(srcKey(src))}?`, { ok: "Replace" });
    if (!sure) return null;
  }
  const r = await api("/api/plugins/install", { url: rawOf(src, entry.path.replace(/\/$/, "") + "/plugin.json") });
  S.config.pluginFrom = { ...(S.config.pluginFrom || {}), [r.id]: srcKey(src) };
  return { id: r.id, fresh: !have };
};

const installOffers = async (offers, { quiet = false } = {}) => {
  LIB.busy = true;
  const made = [];
  for (const o of offers) {
    LIB.done[doneKey(o)] = "…";
    rerenderSheet();
    try {
      const r = await installOffer(o);
      LIB.done[doneKey(o)] = r ? "ok" : "";
      if (r) made.push({ ...r, kind: o.entry.kind });
    } catch (e) {
      LIB.done[doneKey(o)] = e.message;
    }
  }
  await loadPlugins();
  for (const m of made) if (m.fresh && S.plugins.get(m.id) && kindOfPlugin(S.plugins.get(m.id)) === "message") setStepOn(m.id, true);
  syncProfiles();
  saveConfig();
  LIB.busy = false;
  const bad = offers.filter((o) => LIB.done[doneKey(o)] && !["ok", "…"].includes(LIB.done[doneKey(o)])).length;
  if (!quiet) toast(bad ? `Installed ${made.length} of ${offers.length}; the others say why` : made.length ? `Installed or updated ${made.length} plugin${made.length === 1 ? "" : "s"}` : "Nothing installed", bad ? "error" : "info");
  render();
  rerenderSheet();
  warmSite();
  return made.length;
};

// Everything that has an update: plugins from sources, then the app's own bundle.
const updateAll = async () => {
  const list = updateItems().map((i) => i.update);
  if (list.length) await installOffers(list, { quiet: true });
  const r = await updatePlugins({ quiet: list.length > 0 });
  if (list.length && !(r && r.updated)) toast(`Updated ${list.length} plugin${list.length === 1 ? "" : "s"}`);
};

const rollBack = async (id) => {
  try {
    const r = await api("/api/plugins/rollback", { id });
    toast(`Now on v${r.version}`);
    await loadPlugins();
    render();
    openPluginPage(id);
  } catch (e) {
    toast(e.message, "error");
  }
};

const removePlugin = async (p) => {
  const hides = p.overrides ? ` The app's own v${p.shadows} comes back.` : "";
  if (!(await askConfirm(`Remove ${p.manifest?.name || p.id}?${hides}`, "Remove"))) return;
  try {
    await api("/api/plugins/remove", { id: p.id });
    const { [p.id]: gone, ...rest } = S.config.pluginFrom || {};
    S.config.pluginFrom = rest;
    await loadPlugins();
    saveConfig();
    toast("Removed " + (p.manifest?.name || p.id));
    render();
    openPlugins("library");
  } catch (e) {
    toast(e.message, "error");
  }
};

// ---------- the screen ----------

const dot = (title) => h("span", { class: "udot", title, "aria-label": title });

const libRow = (it) => {
  const mark = LIB.done[it.offer ? doneKey(it.offer) : ""];
  const kind = KIND_WORDS[it.kind] || "Plugin";
  const origin = it.plugin
    ? it.plugin.source === "builtin" ? (it.plugin.updated ? "updated with the app" : "built in") : fromKey(it.id) ? "from " + srcName(fromKey(it.id)) : it.plugin.overrides ? "your copy" : "yours"
    : "from " + srcName(srcKey(it.offer.src)) + (it.installedElsewhere ? " · same name is installed" : "");
  const ver = it.update ? `v${it.version || "?"} → v${it.update.entry.version}` : it.version ? "v" + it.version : "";
  const sub = [kind, ver, origin].filter(Boolean).join(" · ");
  const row = item({ id: "lib." + it.id, cls: "lib-row", label: it.name, sub, badge: it.update ? "Update" : null, chev: !!it.plugin, onclick: () => (it.plugin ? openPluginPage(it.id) : openOfferPage(it.offer)) });
  if (!it.plugin) row.append(h("button", { class: "small primary", disabled: LIB.busy, onclick: (e) => (e.stopPropagation(), installOffers([it.offer])) }, mark === "…" ? "…" : mark === "ok" ? "✓" : "Get"));
  return row;
};

const openOfferPage = (offer) =>
  openSheet(offer.entry.name || offer.entry.id, () => [
    backRow("Plugins", () => openPlugins("library")),
    h("p", { class: "muted" }, `${KIND_WORDS[offer.entry.kind] || "Plugin"} · v${offer.entry.version || "?"} · from ${srcName(srcKey(offer.src))}`),
    offer.entry.note ? h("p", {}, offer.entry.note) : null,
    offer.src.official ? null : h("p", { class: "warn" }, THIRD_PARTY),
    offer.entry.kind === "site" ? h("p", { class: "warn" }, SAFETY) : null,
    LIB.done[doneKey(offer)] && !["ok", "…", ""].includes(LIB.done[doneKey(offer)]) ? h("p", { class: "error" }, LIB.done[doneKey(offer)]) : null,
    h("div", { class: "row" }, h("button", { class: "primary", disabled: LIB.busy, onclick: () => installOffers([offer]).then(() => S.plugins.has(offer.entry.id) && openPluginPage(offer.entry.id)) }, LIB.busy ? "Installing…" : "Get it")),
  ]);

const THIRD_PARTY = "This source isn't checked by PromptPipe. A plugin can read your chats and run code in the AI site pages you are logged in to. Only use sources you trust.";

const tabs = () =>
  h("div", { class: "tabs" },
    ["profile", "library"].map((t) => h("button", { class: LIB.tab === t ? "on" : "", "aria-pressed": String(LIB.tab === t), onclick: () => ((LIB.tab = t), t === "library" && loadSources(), rerenderSheet()) },
      t === "profile" ? "Profile" : "Library", t === "library" && updateCount() ? h("span", { class: "badge" }, String(updateCount())) : null)));

const profileTab = () => {
  S.editProfile = S.editProfile && S.config.profiles.some((x) => x.id === S.editProfile) ? S.editProfile : profile().id;
  const prof = profileById(S.editProfile);
  const sites = [...S.plugins.values()].filter(isSite);
  return [
    ...editorBody(),
    h("h3", {}, "AI site of this profile"),
    sites.length ? null : h("p", { class: "muted" }, "No site plugin yet."),
    ...sites.map((p) => h("div", { class: "plugin-row" },
      h("input", { type: "radio", name: "site", checked: prof.site === p.id, "aria-label": "Use " + (p.manifest.name || p.id), onchange: () => ((prof.site = p.id), saveConfig(), render()) }),
      h("button", { class: "lib-main", onclick: () => openPluginPage(p.id) }, h("span", { class: "grow" }, h("b", {}, p.manifest.name || p.id), libUpdate(p.id) ? dot("Update available") : null)),
      h("button", { class: "small", "aria-label": "Settings", onclick: () => openPluginSettings(p.id) }, svgIcon("settings")))),
    h("div", { class: "row" }, h("button", { onclick: () => ((LIB.tab = "library"), (LIB.filter = "site"), loadSources(), rerenderSheet()) }, "Get more AI sites")),
  ];
};
const libUpdate = (id) => updateItems().some((i) => i.id === id);

const libraryTab = () => {
  const items = libItems().filter((i) => LIB.filter === "all" || i.kind === LIB.filter);
  const url = h("input", { placeholder: "Plugin link: GitHub folder, plugin.json or .zip", "aria-label": "Plugin link" });
  const install = async () => {
    try {
      const r = await api("/api/plugins/install", { url: url.value });
      if (r.id.startsWith("bundle:")) return emit("pluginBundle", { version: r.id.slice(7) });
      await loadPlugins();
      toast("Installed " + r.id);
      render();
      openPluginPage(r.id);
    } catch (e) {
      toast("Install failed: " + e.message, "error");
    }
  };
  return [
    items.length ? null : h("p", { class: "muted" }, LIB.filter === "all" ? "Nothing here yet." : "Nothing of this kind yet."),
    ...items.map(libRow),
    h("h3", {}, "Install your own"),
    h("div", { class: "row" }, url, h("button", { onclick: install }, "Install")),
    h("div", { class: "row" },
      h("button", { onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file (.zip or plugin.json)"),
      h("button", { onclick: openPluginGuide }, "Plugin guide")),
    h("h3", {}, "Sources"),
    h("p", { class: "muted" }, "Where the Library gets plugins from: repos on GitHub with an index.json."),
    ...srcList().map(sourceRow),
    sourceAdder(),
    h("div", { class: "row" }, h("button", { class: "small", onclick: () => loadSources(true) }, "Check the sources again"), h("button", { class: "small", title: "Ctrl+Shift+R", onclick: reloadPlugins }, "Reload plugins")),
  ];
};

const sourceRow = (s) => {
  const c = catOf(s);
  return h("div", { class: "plugin-row src-row" },
    h("div", { class: "grow" },
      h("span", {}, h("b", {}, s.repo), s.official ? h("small", { class: "badge" }, "Official") : null),
      h("small", { class: c.error ? "error" : "muted" }, c.busy ? "Loading…" : c.error ? "Couldn't load: " + c.error : c.loaded ? `${c.plugins.length} plugin${c.plugins.length === 1 ? "" : "s"}${s.branch && s.branch !== "main" ? " · branch " + s.branch : ""}` : "Not loaded yet"),
      s.official ? null : h("small", { class: "warn" }, THIRD_PARTY)),
    s.official ? null : h("button", { class: "small danger", onclick: () => removeSource(s) }, "Remove"));
};
const sourceAdder = () => {
  const input = h("input", { placeholder: "owner/name or a GitHub link", "aria-label": "Add a source" });
  const add = async () => {
    const s = parseSource(input.value);
    if (!s) return toast("Give a GitHub repo like owner/name", "error");
    if (srcList().some((x) => srcKey(x) === srcKey(s))) return toast("That source is already here");
    if (!(await askUser(`Add ${s.repo} as a plugin source?\n\n${THIRD_PARTY}`, { ok: "Add it" }))) return;
    S.config.sources = [...(S.config.sources || []), s];
    saveConfig();
    loadSource(s);
  };
  input.onkeydown = (e) => e.key === "Enter" && (e.preventDefault(), add());
  return h("div", { class: "row" }, input, h("button", { onclick: add }, "Add"));
};
const removeSource = async (s) => {
  if (!(await askConfirm(`Remove the source ${s.repo}? Plugins already installed from it stay.`, "Remove"))) return;
  S.config.sources = (S.config.sources || []).filter((x) => srcKey(x) !== srcKey(s));
  LIB.cat.delete(srcKey(s));
  saveConfig();
  rerenderSheet();
};

const openPlugins = (tab, filter) => {
  if (tab) LIB.tab = tab;
  if (filter) LIB.filter = filter;
  if (LIB.tab === "library") loadSources();
  openSheet("Plugins", () => {
    const n = updateCount();
    return [
      backRow("Settings", openSettings),
      tabs(),
      LIB.tab === "library" ? h("div", { class: "chips" }, KINDS.map(([k, l]) => h("button", { class: "chip" + (LIB.filter === k ? " current" : ""), "aria-pressed": String(LIB.filter === k), onclick: () => ((LIB.filter = k), rerenderSheet()) }, l))) : null,
      LIB.tab === "library" && (n || (S.updates || {}).busy)
        ? item({ id: "updall", prim: true, label: (S.updates || {}).busy ? "Checking…" : "Update all", sub: n + " update" + (n === 1 ? "" : "s") + " available", onclick: LIB.busy || SAFE ? null : updateAll })
        : null,
      (S.updates || {}).error ? h("p", { class: "error" }, "✕ " + S.updates.error + ". Download the zip, then install it from the file.") : null,
      ...(LIB.tab === "profile" ? profileTab() : libraryTab()),
    ];
  });
};
const openGetSites = () => openPlugins("library", "site");

// ---------- one plugin ----------

const openPluginPage = (id) =>
  openSheet(S.plugins.get(id)?.manifest?.name || id, () => {
    const p = S.plugins.get(id);
    if (!p) return [backRow("Plugins", () => openPlugins()), h("p", { class: "muted" }, "This plugin isn't installed any more.")];
    const m = p.manifest || {};
    const prof = profile();
    const up = updateItems().find((i) => i.id === id)?.update;
    const where = p.source === "builtin" ? (p.updated ? "Built in, updated with the app" : "Built in") : fromKey(id) ? "From " + srcName(fromKey(id)) : p.overrides ? "Your copy (it replaces the built-in one)" : "Yours";
    const kind = kindOfPlugin(p);
    return [
      backRow("Plugins", () => openPlugins()),
      h("p", { class: "muted" }, `${KIND_WORDS[kind]} · v${m.version || "?"} · ${where}${m.advanced ? " · advanced" : ""}`),
      m.description ? h("p", {}, m.description) : null,
      p.error ? h("p", { class: "error" }, "✕ " + p.error) : null,
      staleNote(p),
      kind === "message" ? h("div", { class: "plugin-row" }, switchBtn(stepOn(id, prof), "On in this profile", (on) => (setStepOn(id, on, prof), render(), rerenderSheet())), h("span", { class: "grow" }, `On in the profile “${prof.name}”`)) : null,
      kind === "site" ? h("div", { class: "row" }, h("button", { disabled: prof.site === id, onclick: () => ((prof.site = id), saveConfig(), render(), rerenderSheet()) }, prof.site === id ? "Used by this profile" : `Use in “${prof.name}”`)) : null,
      kind === "theme" ? h("div", { class: "row" }, h("button", { disabled: S.config.ui.theme === id, onclick: () => (setTheme(id), rerenderSheet()) }, S.config.ui.theme === id ? "In use" : "Use this theme")) : null,
      up ? h("div", { class: "row" }, h("button", { class: "primary grow", disabled: LIB.busy, onclick: () => installOffers([up], { quiet: true }).then(() => (toast(`Updated to v${up.entry.version}`), rerenderSheet())) }, `Update to v${up.entry.version}`)) : null,
      Object.values(m.settings || {}).some((d) => d.type !== "hidden") ? h("div", { class: "row" }, h("button", { onclick: () => openPluginSettings(id) }, "Settings")) : null,
      p.previous ? h("div", { class: "row" }, h("button", { onclick: () => rollBack(id) }, verNewer(p.previous, m.version) ? `Go forward to v${p.previous}` : `Roll back to v${p.previous}`)) : null,
      p.source === "builtin" && !SAFE ? h("div", { class: "row" }, h("button", { title: "Copy into your plugin folder to edit it", onclick: () => forkPlugin(id).then(() => rerenderSheet()) }, "Copy to edit")) : null,
      p.source === "user" ? h("div", { class: "row" }, h("button", { class: "danger", onclick: () => removePlugin(p) }, "Remove")) : h("p", { class: "muted" }, "Built-in plugins can't be removed. Switch them off in a profile."),
    ];
  });

// ---------- the Plugin guide ----------

const REQUEST_HEAD = "I want a plugin for PromptPipe, an Android app that sends my messages to AI chat sites. Below is the guide for writing plugins. Read it, then write the plugin I ask for.";
const REQUEST_TAIL = "Reply with every file of the plugin. Write each file's name alone on the line before its code block (for example plugin.json, then the block), and always include plugin.json. Keep it small and simple. After the files, say in two sentences what it does.";
const aiInstructions = (guide, want) => `${REQUEST_HEAD}\n\n=== PromptPipe plugin guide ===\n${guide}\n=== end of guide ===\n\nWhat I want the plugin to do:\n${want || "(write it here)"}\n\n${REQUEST_TAIL}`;

// An AI's answer -> its files: each fenced block belongs to the file name on the line before it.
const filesFromAnswer = (text) => {
  const out = {};
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let name = "", body = null;
  for (const line of lines) {
    if (body === null) {
      if (/^\s*```/.test(line)) body = [];
      else {
        const t = line.replace(/[*`#]/g, "").replace(/^\s*(file|filename|name)\s*:\s*/i, "").replace(/:\s*$/, "").trim();
        if (/^[\w./-]+\.\w+$/.test(t)) name = t;
      }
    } else if (/^\s*```\s*$/.test(line)) {
      if (name) out[name.replace(/^\.?\//, "")] = body.join("\n");
      name = "";
      body = null;
    } else body.push(line);
  }
  return out;
};

const openPluginGuide = async () => {
  let guide = "";
  try {
    guide = await (await fetch("/docs/PLUGINS.md")).text();
  } catch (e) {
    guide = "";
  }
  let want = "";
  openSheet("Plugin guide", () => [
    backRow("Plugins", () => openPlugins("library")),
    h("p", {}, "A plugin is a few small files. Write one by hand with the guide, or let an AI write it: say what you want, copy the instructions into an AI chat, then bring the answer back here."),
    h("label", { class: "field" }, h("span", {}, "What should the plugin do?"), h("textarea", { rows: 4, value: want, placeholder: "For example: add today's date to the start of every message", oninput: (e) => (want = e.target.value) })),
    h("div", { class: "row" },
      h("button", { class: "primary", disabled: !guide, onclick: () => copyText(aiInstructions(guide, want), "Instructions copied: paste them into an AI chat") }, "Copy instructions for AI"),
      h("button", { onclick: openInstallResult }, "Install the result")),
    guide ? null : h("p", { class: "error" }, "The guide wasn't found in the app."),
    h("div", { class: "row" }, h("button", { class: "small", onclick: openGuide }, "Read the guide")),
  ]);
};

const openInstallResult = () => {
  let answer = "";
  const status = h("p", { class: "muted" }, "Paste the AI's whole answer. Each file needs its name on the line before its code block.");
  const check = () => {
    const files = Object.keys(filesFromAnswer(answer));
    status.textContent = !answer.trim() ? "Paste the AI's whole answer. Each file needs its name on the line before its code block." : files.includes("plugin.json") ? "Found: " + files.join(", ") : files.length ? "Found " + files.join(", ") + " but no plugin.json." : "No files found yet.";
    status.className = files.includes("plugin.json") || !answer.trim() ? "muted" : "error";
  };
  const install = async () => {
    const files = filesFromAnswer(answer);
    if (!files["plugin.json"]) return toast("No plugin.json in that answer", "error");
    try {
      const r = await api("/api/plugins/install", { files });
      await loadPlugins();
      syncProfiles();
      toast("Installed " + r.id);
      render();
      openPluginPage(r.id);
    } catch (e) {
      toast("Install failed: " + e.message, "error");
    }
  };
  openSheet("Install the result", () => [
    backRow("Plugin guide", openPluginGuide),
    status,
    h("textarea", { rows: 12, value: answer, "aria-label": "The AI's answer", oninput: (e) => ((answer = e.target.value), check()) }),
    h("div", { class: "row" }, h("button", { class: "primary", onclick: install }, "Install"), h("button", { onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Pick a .zip or plugin.json instead")),
  ]);
  check();
};

// ---------- the welcome step: pick site plugins ----------

const siteTickView = () => {
  const src = srcList()[0];
  const c = catOf(src);
  if (!c.loaded && !c.busy) loadSource(src);
  if (c.busy || !c.loaded) return [h("p", { class: "muted" }, "Loading the list of site plugins…")];
  if (c.error)
    return [
      h("p", { class: "error" }, "Couldn't load the list: " + c.error),
      h("p", { class: "muted" }, "Without a connection, download a site plugin's zip and use Install from a file."),
      h("div", { class: "row" }, h("button", { class: "small primary", onclick: () => loadSource(src) }, "Try again"), h("button", { class: "small", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }, "Install from a file")),
    ];
  const sites = c.plugins.filter((e) => e.kind === "site").map((entry) => ({ src, entry }));
  const ticked = sites.filter((o) => LIB.ticked.has(doneKey(o)));
  return [
    ...sites.map((o) => {
      const mark = LIB.done[doneKey(o)];
      return h("label", { class: "plugin-row" },
        h("input", { type: "checkbox", checked: LIB.ticked.has(doneKey(o)), disabled: LIB.busy, onchange: (e) => (e.target.checked ? LIB.ticked.add(doneKey(o)) : LIB.ticked.delete(doneKey(o)), rerenderSheet()) }),
        h("div", { class: "grow" },
          h("b", {}, o.entry.name || o.entry.id), " ", h("small", { class: "muted" }, (o.entry.version ? "v" + o.entry.version : "") + (o.entry.default ? "" : " · opt in") + (S.plugins.has(o.entry.id) ? ` · installed v${S.plugins.get(o.entry.id).manifest?.version || "?"}` : "")),
          o.entry.note ? h("div", { class: "muted" }, o.entry.note) : null,
          mark && !["ok", "…", ""].includes(mark) ? h("div", { class: "error" }, mark) : null),
        mark === "ok" ? h("span", { class: "ok-mark" }, "✓") : mark === "…" ? h("span", { class: "muted" }, "…") : null);
    }),
    h("div", { class: "row" }, h("button", { class: "primary", disabled: !ticked.length || LIB.busy, onclick: () => installOffers(ticked) }, LIB.busy ? "Installing…" : "Get the ticked ones")),
  ];
};

// The old setting for one custom repo becomes a source of its own.
on("ready", () => {
  const old = S.config.sites;
  if (old && old.repo && old.repo.toLowerCase() !== OFFICIAL.toLowerCase()) {
    const s = { repo: old.repo, branch: old.branch || "main" };
    if (!(S.config.sources || []).some((x) => srcKey(x) === srcKey(s))) S.config.sources = [...(S.config.sources || []), s];
  }
  if (old) {
    delete S.config.sites;
    saveConfig();
  }
  if (!SAFE && (S.config.updates || {}).auto !== false) loadSources();
});
