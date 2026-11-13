"use strict";
// App part (chat screen): the Plugins screen. Two tabs: Profile (what goes with
// your message, in this profile) and Library (every plugin there is: installed,
// or on offer from a source). A plugin has a page of its own (update, go back to
// the earlier version, remove). Sources are repos with an index.json; the
// official one is always there. The Plugin guide helps write one with an AI.

const OFFICIAL = "Zieviox/promptpipe-plugins";
const KINDS = [["all", "All"], ["site", "AI sites"], ["message", "Message plugins"], ["theme", "Themes"], ["tool", "Tools"]];
const KIND_WORDS = { site: "AI site", message: "Message plugin", theme: "Theme", tool: "Tool", part: "App part" };

// What the screen remembers while it is open. Redraws never reset it.
const LIB = { tab: "profile", filter: "all", cat: new Map(), ticked: new Set(), done: {}, busy: false };

// ---------- pure: sources and the library list ----------

const srcKey = (s) => `${s.repo}@${s.branch || "main"}`;
const srcList = () => [{ repo: OFFICIAL, branch: "main", official: true }, ...(S.config.sources || [])];
// A source that is off offers nothing (the plugins installed from it stay).
const srcOn = (s) => (s.official ? !S.config.officialOff : !s.off);
const onSources = () => srcList().filter(srcOn);
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
// Where an installed plugin's updates come from: the source it was got from, and
// for the app's own plugins, the official source.
const fromSrc = (p, id, s) => fromKey(id) === srcKey(s) || (!fromKey(id) && p.source === "builtin" && !!s.official);
const catOf = (s) => LIB.cat.get(srcKey(s)) || { plugins: [], error: "", busy: false, loaded: false };

// Installed plugins first (with the update on offer from the source they came
// from), then what the sources offer that isn't here (or is here from another source).
// "0.7.0-alpha43-local" -> [0, 7, 0, 43]. A build with no -alphaN is a stable release: newer than any alpha.
const appNum = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-alpha(\d+))?/.exec(String(v || ""));
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1e9 : +m[4]] : null;
};
// Does this app meet a plugin's "minApp"? No minApp, or a version we can't read: yes, so the plugin is tried.
const appAtLeast = (min) => {
  const need = appNum(min), have = appNum((S.app || {}).version);
  if (!need || !have) return true;
  for (let i = 0; i < 4; i++) if (have[i] !== need[i]) return have[i] > need[i];
  return true;
};
const libItems = () => {
  const items = [];
  const byId = new Map();
  for (const p of S.plugins.values()) {
    if (!p.manifest || isDriver(p)) continue;
    const it = { id: p.id, name: p.manifest.name || p.id, kind: isPart(p) ? "part" : kindOfPlugin(p), part: isPart(p), plugin: p, version: p.manifest.version, update: null };
    items.push(it);
    byId.set(p.id, it);
  }
  const offers = [];
  for (const s of onSources()) {
    for (const e of catOf(s).plugins) {
      const have = byId.get(e.id);
      const offer = { src: s, entry: e };
      if (have && fromSrc(have.plugin, e.id, s)) {
        if (verNewer(e.version, have.version)) {
          if (appAtLeast(e.minApp)) have.update = offer;
          else have.needsApp = e.minApp;
        }
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
  const next = { plugins: [], error: "", busy: false, loaded: true, checked: new Date() };
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
const loadSources = (force = false) => onSources().forEach((s) => (force || !LIB.cat.has(srcKey(s))) && loadSource(s));

// ---------- installing ----------

// One offered plugin. Asks first when the name is already taken by something
// from another source (or built in, or put there by you).
const installOffer = async ({ src, entry }) => {
  const have = S.plugins.get(entry.id);
  const from = fromKey(entry.id);
  if (have && !fromSrc(have, entry.id, src)) {
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
  // The release bundle is a fallback, off unless config.updates.bundle is true.
  const r = (S.config.updates || {}).bundle === true ? await updatePlugins({ quiet: list.length > 0 }) : null;
  if (list.length && !(r && r.updated)) toast(`Updated ${list.length} plugin${list.length === 1 ? "" : "s"}. Restart the app to use them.`);
};

// Check for updates: ask the sources again and say what there is.
const checkUpdates = async () => {
  toast("Checking for plugin updates…");
  await Promise.all(onSources().map((s) => loadSource(s)));
  const n = updateCount();
  toast(n ? `${n} update${n === 1 ? "" : "s"} available: tap Update all` : "Everything is up to date");
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

const THIRD_PARTY = "This source isn't checked by PromptPipe. A plugin can read your chats and run code in the AI site pages you are logged in to. Only use sources you trust.";
const KIND_CHIPS = [["all", "All"], ["site", "AI sites"], ["message", "Message plugins"], ["theme", "Themes"], ["tool", "Tools"]];
const filterChips = (list, cur, pick) =>
  h("div", { class: "chips" }, list.map(([k, l]) => h("button", { class: "pill" + (cur === k ? " on" : ""), "aria-pressed": String(cur === k), onclick: () => (pick(k), rerenderSheet()) }, l)));
const origin = (it) =>
  it.plugin.source === "builtin" ? (it.plugin.updated ? "updated with the app" : "") : fromKey(it.id) ? (srcOfKey(fromKey(it.id))?.official ? "" : "Third party") : it.plugin.overrides ? "your copy" : "yours";

// Library: an installed plugin's card. Its update shows as old → new.
const libRow = (it) =>
  item({ id: "library.pl" + it.id, label: it.name, sub: [KIND_WORDS[it.kind] || "Plugin", (it.version || "?") + (it.update ? " → " + it.update.entry.version : ""), it.needsApp ? "update needs app " + it.needsApp : "", origin(it)].filter(Boolean).join(" · "), badge: it.update ? "Update" : null, right: it.update ? null : "›", onclick: () => openPluginPage(it.id) });

// The Plugins screen's tabs; the Profile tab's dot says a plugin it uses has an update.
const tabs = () => {
  const upd = updateCount();
  const profUpd = editedProfile().pipe.rows.some((r) => r.type === "step" && libUpdate(r.plugin));
  return h("div", { class: "tabs" },
    [["profile", "Profile", profUpd ? "●" : ""], ["library", "Library", upd ? String(upd) : ""]].map(([t, l, b]) =>
      h("button", { class: LIB.tab === t ? "on" : "", "aria-pressed": String(LIB.tab === t), onclick: () => ((LIB.tab = t), (S.dd = {}), t === "library" && loadSources(), rerenderSheet()) }, l, b ? h("span", { class: "badge" }, b) : null)));
};
const libUpdate = (id) => updateItems().some((i) => i.id === id);

const libraryTab = () => {
  const n = updateCount();
  const busy = (S.updates || {}).busy;
  const items = libItems().filter((i) => i.plugin && (!i.part || i.update) && (LIB.filter === "all" || i.kind === LIB.filter)).sort((a, b) => !!b.update - !!a.update || a.name.localeCompare(b.name));
  const on = onSources();
  return [
    filterChips(KIND_CHIPS, LIB.filter, (k) => (LIB.filter = k)),
    n || busy ? item({ id: "library.updall", prim: true, label: busy ? "Checking…" : "Update all", sub: n + " update" + (n === 1 ? "" : "s") + " available", onclick: LIB.busy || SAFE ? null : updateAll }) : null,
    ...items.map(libRow),
    items.length ? null : item({ label: LIB.filter === "all" ? "Nothing installed yet" : "Nothing of this kind yet", sub: "Get plugins below", chev: true, onclick: () => openGetPlugins() }),
    h("div", { class: "lbl" }, "Manage"),
    item({ id: "library.reload", label: "Reload plugins", key: "Ctrl+Shift+R", onclick: reloadPlugins }),
    item({ id: "library.getp", label: "Get plugins", sub: "From " + on.length + (on.length === 1 ? " source" : " sources"), chev: true, onclick: () => openGetPlugins() }),
    item({ id: "library.inst", label: "Install from a file or link", chev: true, onclick: openInstall }),
    item({ id: "library.guide", label: "Plugin guide", sub: "Writing plugins, copy instructions for AI", chev: true, onclick: openPluginGuide }),
    item({ id: "library.appupd", label: "Check for app updates", sub: busy ? "Checking…" : (S.updates || {}).error ? "Last check: " + S.updates.error : "The app's own plugins and parts", onclick: checkUpdates }),
    h("div", { class: "lbl" }, "Sources"),
    ...srcList().map(sourceRow),
    item({ id: "library.addsrc", label: "Add a source", sub: "Another GitHub repo with plugins", chev: true, onclick: openAddSource }),
  ];
};

// A source: its name, how many plugins and when it was checked, remove (not the
// official one), and its switch.
const sourceRow = (s) => {
  const c = catOf(s);
  const k = srcKey(s);
  const state = !srcOn(s) ? "Off" : c.busy ? "Checking…" : c.error ? "Couldn't load: " + c.error : c.loaded ? `${c.plugins.length} plugin${c.plugins.length === 1 ? "" : "s"} · checked ${String(c.checked.getHours()).padStart(2, "0")}:${String(c.checked.getMinutes()).padStart(2, "0")}` : "Not checked yet";
  const flip = () => {
    if (s.official) S.config.officialOff = srcOn(s);
    else S.config.sources = (S.config.sources || []).map((x) => (srcKey(x) === k ? { ...x, off: !x.off } : x));
    saveConfig();
    if (srcOn(srcOfKey(k))) loadSource(srcOfKey(k));
    rerenderSheet();
    render();
  };
  return h("div", { class: "it", "data-row": "library.src" + k },
    h("button", { class: "g", title: "Check again", onclick: () => srcOn(s) && loadSource(s) }, s.repo + (s.branch && s.branch !== "main" ? " · " + s.branch : ""), h("small", {}, state + (s.official ? " · Official" : " · Third party"))),
    s.official ? null : h("button", { class: "act", "aria-label": "Remove source", onclick: () => removeSource(s) }, svgIcon("close")),
    switchBtn(srcOn(s), s.repo + " on or off", flip));
};
const removeSource = async (s) => {
  if (!(await askConfirm(`Remove ${s.repo}? Plugins you installed from it stay.`, "Remove"))) return;
  S.config.sources = (S.config.sources || []).filter((x) => srcKey(x) !== srcKey(s));
  LIB.cat.delete(srcKey(s));
  if (LIB.src === srcKey(s)) LIB.src = "all";
  saveConfig();
  rerenderSheet();
};

// Add a source: the repo, checked for its plugin catalogue before it is added.
let srcDraft = "";
const openAddSource = () =>
  openSheet("Add a source", () => {
    const add = async () => {
      const s = parseSource(srcDraft);
      if (!s) return toast("Give a GitHub repo like owner/name", "error");
      if (srcList().some((x) => srcKey(x) === srcKey(s))) return toast("That source is already here");
      try {
        const j = JSON.parse(await fetchText(rawOf(s, "index.json")));
        if (!Array.isArray(j.plugins)) throw new Error("index.json has no plugin list");
      } catch (e) {
        return toast("No plugin catalogue there: " + e.message, "error");
      }
      if (!(await askUser(`Add ${s.repo} as a plugin source?\n\n${THIRD_PARTY}`, { ok: "Add it" }))) return;
      S.config.sources = [...(S.config.sources || []), s];
      saveConfig();
      srcDraft = "";
      loadSource(s);
      toast("Added " + s.repo);
      openPlugins("library");
    };
    const input = h("input", { "aria-label": "GitHub repo or link", placeholder: "owner/repo or https://github.com/…", value: srcDraft, oninput: (e) => (srcDraft = e.target.value), onkeydown: (e) => e.key === "Enter" && (e.preventDefault(), add()) });
    autofocus(input);
    return [
      h("div", { class: "lbl" }, "GitHub repo or link"),
      h("label", { class: "search" }, input),
      item({ id: "addsource.go", prim: true, label: "Check and add", onclick: add }),
      item({ id: "addsource.hint", label: "The repo needs a plugin catalogue (index.json). The app checks this first." }),
    ];
  }, { back: () => openPlugins("library") });

// Get plugins: what the sources that are on offer, by source.
const openGetPlugins = (kind = "") => {
  LIB.kind = kind;
  loadSources();
  openSheet("Get plugins", () => {
    const on = onSources();
    if (LIB.src !== "all" && !on.some((s) => srcKey(s) === LIB.src)) LIB.src = "all";
    const offers = libItems().filter((i) => i.offer && (LIB.src === "all" || srcKey(i.offer.src) === LIB.src) && (!LIB.kind || i.kind === LIB.kind));
    const loading = on.some((s) => catOf(s).busy);
    const failed = on.filter((s) => catOf(s).error);
    return [
      filterChips([["all", "All sources"], ...on.map((s) => [srcKey(s), s.repo.split("/")[1]])], LIB.src, (k) => (LIB.src = k)),
      LIB.kind ? h("div", { class: "chips" }, h("button", { class: "pill on", onclick: () => ((LIB.kind = ""), rerenderSheet()) }, (KIND_WORDS[LIB.kind] || LIB.kind) + "s only ✕")) : null,
      ...offers.map(offerRow),
      loading ? item({ label: "Checking the sources…" }) : null,
      ...failed.map((s) => item({ label: "Couldn't load " + s.repo, sub: catOf(s).error + " · tap to try again", onclick: () => loadSource(s) })),
      !offers.length && !loading && !failed.length ? item({ label: "Nothing new to get", sub: "Everything the sources offer is installed" }) : null,
      item({ label: "Install from a file or link", chev: true, onclick: openInstall }),
    ];
  }, { back: () => openPlugins("library") });
};
LIB.src = "all";
const offerRow = (it) => {
  const o = it.offer;
  const mark = LIB.done[doneKey(o)];
  const bad = mark && !["ok", "…", ""].includes(mark);
  return h("div", { class: "it", "data-row": "getplugins.c" + it.id + srcKey(o.src) },
    h("button", { class: "g", onclick: () => openOfferPage(o) }, it.name,
      h("small", {}, [KIND_WORDS[it.kind] || "Plugin", o.entry.version, o.entry.note].filter(Boolean).join(" · ")),
      h("small", { class: bad ? "error" : "" }, bad ? mark : "From " + o.src.repo + (o.src.official ? " · Official" : " · Third party") + (it.installedElsewhere ? " · same name installed" : ""))),
    mark === "ok" ? h("span", { class: "ch" }, "Installed") : h("button", { class: "pill", disabled: LIB.busy, onclick: () => installOffers([o]) }, mark === "…" ? "…" : "Get"));
};

const openOfferPage = (offer) =>
  openSheet("Plugin", () => [
    item({ label: offer.entry.name || offer.entry.id, sub: `${KIND_WORDS[offer.entry.kind] || "Plugin"} · version ${offer.entry.version || "?"} · from ${offer.src.repo}` }),
    offer.entry.note ? item({ label: offer.entry.note }) : null,
    offer.src.official ? null : item({ cls: "warn", label: "Third party", sub: THIRD_PARTY }),
    offer.entry.kind === "site" ? item({ cls: "warn", label: "Use a spare account", sub: SAFETY }) : null,
    item({ prim: true, label: LIB.busy ? "Installing…" : "Get it", onclick: LIB.busy ? null : () => installOffers([offer]).then(() => S.plugins.has(offer.entry.id) && openPluginPage(offer.entry.id)) }),
  ], { back: () => openGetPlugins(LIB.kind) });

// Install from a file or link (a GitHub folder, plugin.json or .zip).
let linkDraft = "";
const installLink = async () => {
  try {
    const r = await api("/api/plugins/install", { url: linkDraft.trim() });
    if (r.id.startsWith("bundle:")) return emit("pluginBundle", { version: r.id.slice(7) });
    linkDraft = "";
    await loadPlugins();
    syncProfiles();
    toast("Installed " + r.id);
    render();
    openPluginPage(r.id);
  } catch (e) {
    toast("Install failed: " + e.message, "error");
  }
};
const openInstall = () =>
  openSheet("Install a plugin", () => [
    item({ id: "inst.file", label: "Pick a file…", sub: "A .zip or plugin.json", onclick: () => api("/api/app/action", { action: "pickPlugin" }) }),
    h("div", { class: "lbl" }, "Or a link"),
    h("label", { class: "search" }, h("input", { "aria-label": "Plugin link", placeholder: "GitHub folder, plugin.json or .zip", value: linkDraft, oninput: (e) => (linkDraft = e.target.value), onkeydown: (e) => e.key === "Enter" && installLink() })),
    item({ id: "inst.link", prim: true, label: "Install from the link", onclick: () => (linkDraft.trim() ? installLink() : toast("Paste a link first")) }),
    item({ id: "inst.ai", label: "Paste an AI's answer", sub: "Made with the Plugin guide", chev: true, onclick: openInstallResult }),
  ], { back: () => openPlugins("library") });

const openPlugins = (tab, filter) => {
  if (tab) LIB.tab = tab;
  if (filter) LIB.filter = filter;
  if (LIB.tab === "library") loadSources();
  S.editProfile = S.editProfile && S.config.profiles.some((x) => x.id === S.editProfile) ? S.editProfile : profile().id;
  openSheet("Plugins", () => [tabs(), ...(LIB.tab === "profile" ? editorBody() : libraryTab())], {
    back: openSettings,
    head: () => h("button", { class: "ic", "aria-label": "Quick start: plugins", title: "Quick start: plugins", onclick: () => startTour("plugins") }, svgIcon("play")),
  });
};
const openGetSites = () => openGetPlugins("site");

// ---------- one plugin ----------

const openPluginPage = (id) =>
  openSheet("Plugin", () => {
    const p = S.plugins.get(id);
    if (!p) return [item({ label: "This plugin isn't installed any more" })];
    const m = p.manifest || {};
    const prof = profile();
    const up = updateItems().find((i) => i.id === id)?.update;
    const where = p.source === "builtin" ? (p.updated ? "built in, updated with the app" : "built in") : fromKey(id) ? "from " + srcName(fromKey(id)) : p.overrides ? "your copy (it replaces the built-in one)" : "yours";
    const kind = kindOfPlugin(p);
    const hasSettings = Object.values(m.settings || {}).some((d) => d.type !== "hidden");
    return [
      item({ id: "plugin.pinfo", label: m.name || id, sub: `${KIND_WORDS[kind]} · version ${m.version || "?"}${up ? " · " + up.entry.version + " available" : ""}` }),
      p.error ? item({ cls: "danger", label: "It didn't load", sub: p.error }) : null,
      staleNote(p),
      up ? item({ id: "plugin.pupd", prim: true, label: "Update to " + up.entry.version, onclick: LIB.busy ? null : () => installOffers([up], { quiet: true }).then(() => (toast(`${m.name || id} updated`), rerenderSheet())) }) : null,
      kind === "site" ? item({ id: "plugin.puse", label: "Sites belong to chats", sub: "Pick it from the pill in the header. Profiles do not change the site." }) : null,
      kind === "message" ? item({ id: "plugin.pon", label: "On", sub: `In the profile “${prof.name}”`, toggle: stepOn(id, prof), onclick: () => (setStepOn(id, !stepOn(id, prof), prof), render(), rerenderSheet()) }) : null,
      kind === "theme" ? item({ id: "plugin.pon", label: "Use this theme", toggle: S.config.ui.theme === id, onclick: () => (setTheme(S.config.ui.theme === id ? "" : id), rerenderSheet()) }) : null,
      hasSettings ? item({ id: "plugin.pset", label: "Settings", sub: "This plugin's options", chev: true, onclick: () => openPluginSettings(id) }) : null,
      p.previous ? item({ id: "plugin.prb", label: verNewer(p.previous, m.version) ? `Go forward to version ${p.previous}` : `Roll back to the previous version`, sub: verNewer(p.previous, m.version) ? "" : "Version " + p.previous, onclick: () => rollBack(id) }) : null,
      p.source === "builtin" && !SAFE ? item({ id: "plugin.fork", label: "Copy to edit", sub: "Into your plugin folder; your copy replaces this one", onclick: () => forkPlugin(id).then(() => rerenderSheet()) }) : null,
      m.description ? item({ id: "plugin.about", cls: LIB.about === id ? "" : "clamp", label: "About", sub: m.description + " · " + where[0].toUpperCase() + where.slice(1) + (m.advanced ? " · advanced" : ""), onclick: () => ((LIB.about = LIB.about === id ? "" : id), rerenderSheet()) }) : null,
      p.source === "user" ? item({ id: "plugin.prm", cls: "danger", label: "Remove", onclick: () => removePlugin(p) }) : item({ id: "plugin.prm", label: "Built in", sub: "Built-in plugins can't be removed. Switch them off in a profile." }),
    ];
  }, { back: () => openPlugins("library") });

// ---------- the Plugin guide ----------

const REQUEST_HEAD = "I want a plugin for PromptPipe, an Android app that sends my messages to AI chat sites. Below is the guide for writing plugins. Read it, then write the plugin I ask for.";
const REQUEST_TAIL = "Reply with every file of the plugin. Write each file's name alone on the line before its code block (for example plugin.json, then the block), and always include plugin.json. Keep it small and simple. After the files, say in two sentences what it does.";
// Without a want, the AI asks for it first (you say it in the AI chat).
const aiInstructions = (guide, want) => `${REQUEST_HEAD}\n\n=== PromptPipe plugin guide ===\n${guide}\n=== end of guide ===\n\n${want ? "What I want the plugin to do:\n" + want : "First ask me what the plugin should do, then write it."}\n\n${REQUEST_TAIL}`;

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

// The Plugin guide, as in the wireframe: read it, copy it for an AI (with the
// request around it), install what the AI wrote.
const guideText = async () => {
  try {
    return await (await fetch("/docs/PLUGINS.md")).text();
  } catch (e) {
    return "";
  }
};
const openPluginGuide = () =>
  openSheet("Plugin guide", () => [
    item({ id: "guide.g1", label: "How a plugin is built", chev: true, onclick: openGuide }),
    item({ id: "guide.g2", label: "Copy instructions for AI", sub: "Guide + a request template to paste into any AI", onclick: async () => {
      const g = await guideText();
      if (!g) return toast("The guide wasn't found in the app", "error");
      copyText(aiInstructions(g, ""), "Copied. Paste it into an AI and say what you want");
    } }),
    item({ id: "guide.g3", label: "Install the result", sub: "From a file or link", chev: true, onclick: openInstall }),
  ], { back: () => openPlugins("library") });

const openInstallResult = () => {
  let answer = "";
  const status = h("div", { class: "sub2" }, "Paste the AI's whole answer. Each file needs its name on the line before its code block.");
  const check = () => {
    const files = Object.keys(filesFromAnswer(answer));
    status.textContent = !answer.trim() ? "Paste the AI's whole answer. Each file needs its name on the line before its code block." : files.includes("plugin.json") ? "Found: " + files.join(", ") : files.length ? "Found " + files.join(", ") + " but no plugin.json." : "No files found yet.";
    status.className = files.includes("plugin.json") || !answer.trim() ? "sub2" : "sub2 error";
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
  openSheet("Paste an AI's answer", () => [
    status,
    h("textarea", { class: "box", rows: 12, value: answer, "aria-label": "The AI's answer", oninput: (e) => ((answer = e.target.value), check()) }),
    item({ prim: true, label: "Install", onclick: install }),
  ], { back: openInstall });
  check();
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
