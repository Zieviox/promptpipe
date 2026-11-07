"use strict";
// App part (chat screen): Settings, one page of groups, each a page of its own.

// Settings: one page of groups, each a page of its own (‹ Settings goes back).
const settingsPage = (title, body) =>
  openSheet(title, () => [h("button", { class: "ghost back", onclick: openSettings }, "‹ Settings"), ...body()]);
// ---------- the chats folder ----------
const FOLDER = { info: null, loading: false, found: [], done: new Set() };
// The places the chats were kept before the app's folder changed (no "all files" access, then with it).
const OLD_CHAT_FOLDERS = [
  "/storage/emulated/0/PromptPipe/history",
  "/storage/emulated/0/Android/data/dev.zieviox.promptpipe/files/PromptPipe/history",
];
const sameFolder = (a, b) => a.replace(/^\/sdcard\//, "/storage/emulated/0/") === b.replace(/^\/sdcard\//, "/storage/emulated/0/");
const findOldChats = async (here) => {
  const found = await Promise.all(OLD_CHAT_FOLDERS.filter((p) => !sameFolder(p, here) && !FOLDER.done.has(p)).map((path) =>
    api("/api/storage/count?path=" + encodeURIComponent(path)).then((r) => ({ path, chats: r.chats }), () => ({ path, chats: 0 }))));
  FOLDER.found = found.filter((f) => f.chats > 0);
};
const loadFolderInfo = () => {
  FOLDER.loading = true;
  return api("/api/storage/folder")
    .then(async (i) => ((FOLDER.info = i), await findOldChats(i.path)), () => {})
    .finally(() => ((FOLDER.loading = false), rerenderSheet()));
};
const backToStorage = () => settingsPage("Chats and storage", settingsBody("Chats and storage"));
// Use `path` as the chats folder ("" = the default one); the chats in the old one are copied when asked.
const useFolder = async (path, copy) => {
  try {
    const r = await api("/api/storage/folder", { path, copy });
    FOLDER.info = null;
    await loadTree().catch(() => {});
    render();
    toast(`Chats folder: ${r.path}` + (r.copied ? ` (${r.copied} chats copied; the old folder is untouched)` : ""));
    backToStorage();
  } catch (e) {
    if (!(await askStorageAccess(e))) toast(e.message, "error");
  }
};
// Add the chats of an old folder to the one in use (existing chats are never overwritten).
const copyOldChats = async (from) => {
  try {
    const r = await api("/api/storage/copy", { from });
    FOLDER.done.add(from);
    FOLDER.info = null;
    await loadTree().catch(() => {});
    render();
    toast(`${r.copied} chat${r.copied === 1 ? "" : "s"} added here; the old folder is untouched`);
    backToStorage();
  } catch (e) {
    if (!(await askStorageAccess(e))) toast(e.message, "error");
  }
};
// Browse the phone's folders and pick one (or type a path).
const openFolderPicker = () => {
  const st = { path: "", dirs: [], parent: "", error: "", copy: true, typed: null };
  const go = async (path) => {
    try {
      Object.assign(st, await api("/api/storage/dirs?path=" + encodeURIComponent(path)), { error: "", typed: null });
    } catch (e) {
      st.error = e.message;
    }
    rerenderSheet();
  };
  openSheet("Chats folder", () => {
    const input = h("input", { value: st.typed ?? st.path, "aria-label": "Folder path", oninput: (e) => (st.typed = e.target.value), onkeydown: (e) => e.key === "Enter" && (e.preventDefault(), go(st.typed)) });
    return [
      backRow("Chats and storage", backToStorage),
      h("p", { class: "muted" }, "Pick the folder for your chats (and their git history). It can be a new folder: type its path, then Use this folder."),
      h("div", { class: "row" }, input, h("button", { class: "small", onclick: () => go(st.typed ?? st.path) }, "Go")),
      st.error ? h("p", { class: "error" }, st.error) : null,
      h("div", { class: "results" },
        st.path && st.path !== "/" ? sheetRow({ icon: "up", label: "Up", sub: st.parent || "/", onclick: () => go(st.parent || "/") }) : null,
        st.dirs.length ? st.dirs.map((d) => sheetRow({ icon: "folder", label: d, onclick: () => go((st.path === "/" ? "" : st.path) + "/" + d) })) : h("p", { class: "muted" }, "No folders in here.")),
      h("label", { class: "field inline" }, h("span", {}, "Copy my chats into it (the old folder stays as it is)"), switchBtn(st.copy, "Copy my chats", (on) => ((st.copy = on), rerenderSheet()))),
      h("div", { class: "row" }, h("button", { class: "primary grow", onclick: () => useFolder(st.typed ?? st.path, st.copy) }, "Use this folder")),
    ];
  });
  const here = (FOLDER.info && FOLDER.info.path) || "";
  go(here.includes("/") && here.lastIndexOf("/") > 0 ? here.slice(0, here.lastIndexOf("/")) : "/");
};

// Max replies at once: how many chats are answered at the same time (5; up to 10 when unlocked).
// Tap to step 1, 2, … up to the limit; past 5 it asks first (10 is the most).
const cycleMaxReplies = async () => {
  const cap = S.config.moreReplies ? 10 : 5, n = maxReplies();
  if (n >= cap) {
    if (!S.config.moreReplies) {
      if (!(await askUser("More than 5 replies at once uses a lot of memory, and many messages on one account can look like a bot to the site. Unlock up to 10?", { ok: "Unlock up to 10" }))) return;
      S.config.moreReplies = true;
      S.config.maxReplies = 6;
    } else S.config.maxReplies = 1;
  } else S.config.maxReplies = n + 1;
  saveConfig();
  rerenderSheet();
};
const maxRepliesControls = () => [
  item({ id: "sites.max", label: "Max replies at once: " + maxReplies(), sub: "How many chats can be answered at the same time. Memory and Sub-chats use extra ones. Tap to change.", onclick: cycleMaxReplies }),
];
// How long to wait for a reply before giving up.
const openWaiting = () =>
  openSheet("Waiting for replies", () => [
    backRow("Sites", () => settingsPage("Sites", settingsBody("Sites"))),
    h("p", { class: "muted" }, "In minutes. 0 = no limit. Stop on a reply that's coming always works."),
    ...[["idleMin", "Give up after this long with no activity on the page"], ["maxMin", "Give up after this long in total"]].map(([k, label]) =>
      h("label", { class: "it" }, h("div", { class: "g" }, label), h("input", { type: "number", min: "0", step: "1", style: "width:5em", value: String((S.config.wait || {})[k] || 0), oninput: (e) => ((S.config.wait = { ...(S.config.wait || {}), [k]: Math.max(0, +e.target.value || 0) }), saveConfig()) }))),
  ]);
// Back to the welcome, as on the first start (nothing the person made is touched).
const resetFirstLaunch = async () => {
  if (!(await askConfirm("Reset the app to first launch? Your chats, profiles, prompts and plugins stay.", "Reset"))) return;
  resetSeen();
  S.config.welcomed = false;
  closeSheet();
  startTour("setup");
};
// ---------- the local API ----------
const apiBase = () => `http://127.0.0.1:${S.app.port}/v1`;
const backToApi = () => openSettingsGroup("Local API", settingsBody("Local API"));
const openApiToken = () =>
  openSheet("API token", () => [
    item({ label: S.app.apiTokenValue || "?", sub: "Send it as: Authorization: Bearer <token>", cls: "mono" }),
    item({ prim: true, label: "Copy", onclick: () => copyText(S.app.apiTokenValue || "", "Copied") }),
    item({ label: "Make a new token", sub: "Apps using the old one need the new one", onclick: async () => {
      if (!(await askConfirm("Make a new API token? Apps using the old one stop working until you give them the new one.", "Make a new one"))) return;
      await api("/api/secret", { key: "apiToken", value: "" });
      S.app = await api("/api/app");
      toast("New API token made");
      rerenderSheet();
    } }),
  ], { back: backToApi });
const openApiHow = () =>
  openSheet("How apps use it", () => {
    const curl = `curl -s 127.0.0.1:${S.app.port}/v1/chat/completions -H "Authorization: Bearer ${S.app.apiTokenValue || "TOKEN"}" -d '{"model":"${profile().name}","messages":[{"role":"user","content":"hi"}]}'`;
    return [
      h("div", { class: "sub2" }, "Apps that take an OpenAI API key: base URL = the address, model = a profile name, API key = the token (always required). Each request becomes one new chat on the site, unless it adds \"chat\": \"<path>.md\" to continue a saved chat (then only its last message is sent). Every reply also says, under \"promptpipe\", which chat it went to and what was sent. Requests at the same time run in parallel on the site pages (see Sites); the rest wait their turn."),
      h("div", { class: "lbl" }, "Try it"),
      h("pre", { class: "pipe-preview" }, curl),
      item({ label: "Copy the command", onclick: () => copyText(curl, "Copied") }),
    ];
  }, { back: backToApi });
const settingsBody = (title) => SETTINGS.find((g) => g[0] === title)[2];
const SETTINGS = [
  ["Plugins", "Profile order and the plugin library", () => [
    item({ id: "plugins.open", label: "Plugins", sub: updateCount() ? `${updateCount()} update${updateCount() === 1 ? "" : "s"} waiting` : "Profile rows and the plugin library", badge: updateCount() ? String(updateCount()) : null, chev: !updateCount(), onclick: () => openPlugins() }),
  ]],
  ["System prompts", "Write, order, import, export", () => {
    const menu = (label) => [...S.plugins.values()].flatMap((p) => p.def?.menu || []).find((m) => m.label === label);
    const lib = menu("System prompts"), imp = menu("Import system prompts…"), exp = menu("Export all system prompts");
    return lib ? [
      h("p", { class: "muted" }, "The prompts you keep. Put them in a profile as rows (Edit profile › Add a row), or stack them with the System prompt plugin."),
      h("div", { class: "row" }, h("button", { class: "primary", onclick: () => lib.run() }, "Open the library")),
      h("div", { class: "row" }, imp ? h("button", { onclick: () => imp.run() }, "Import…") : null, exp ? h("button", { onclick: () => exp.run() }, "Export all") : null),
    ] : [h("p", { class: "muted" }, "The System prompt plugin isn't installed. Get it in Plugins.")];
  }],
  ["Look", "Theme, accent, quick actions", () => [
    ...lookControls(),
    item({ id: "look.qa", label: "Quick actions under replies", sub: { newest: "Newest reply only", every: "Every reply", off: "Collapsed" }[S.config.quickActions || "newest"], onclick: () => ((S.config.quickActions = { newest: "every", every: "off", off: "newest" }[S.config.quickActions || "newest"]), saveConfig(), rerenderSheet(), render()) }),
    h("div", { class: "lbl" }, "More"),
    item({ id: "look.follow", label: "Stay at the bottom while a reply comes in", sub: "Only if you were already there. Scrolled up, your place never moves.", toggle: followOn(), onclick: () => ((S.config.ui.follow = !followOn()), saveConfig(), rerenderSheet()) }),
    item({ id: "look.enter", label: "Enter sends", sub: "Shift+Enter makes a new line", toggle: !!S.config.ui.enterSends, onclick: () => ((S.config.ui.enterSends = !S.config.ui.enterSends), saveConfig(), rerenderSheet()) }),
  ]],
  ["Sites", "Pages at once, waiting for replies", () => [
    ...maxRepliesControls(),
    item({ id: "sites.wait", label: "Waiting for replies", sub: "Give up after…", chev: true, onclick: openWaiting }),
  ]],
  ["Chats and storage", "Chat folder, move chats, Git", () => {
    if (!FOLDER.info && !FOLDER.loading) loadFolderInfo();
    const f = FOLDER.info;
    return [
      item({ id: "storage.folder", label: "Chat folder", sub: f ? f.path : "Checking…", onclick: openFolderPicker }),
      item({ id: "storage.move", label: "Move all chats to another folder…", onclick: openFolderPicker }),
      f && f.custom ? item({ id: "storage.default", label: "Use the default folder", onclick: () => useFolder("", true) }) : null,
      ...FOLDER.found.map((o) => h("div", { class: "it" },
        h("div", { class: "g" }, `${o.chats} chat${o.chats === 1 ? "" : "s"} found in another folder`, h("small", {}, o.path)),
        h("button", { class: "pill", onclick: () => useFolder(o.path, false) }, "Use it"),
        h("button", { class: "pill", onclick: () => copyOldChats(o.path) }, "Copy here"))),
      item({ id: "git", label: "Git history and backup", chev: true, onclick: openGit }),
      h("div", { class: "lbl" }, "More"),
      f ? item({ id: "storage.count", label: `${f.chats} chat${f.chats === 1 ? "" : "s"} · ${f.custom ? "a folder you chose" : "the default folder"}`, sub: "Markdown files in a git repository, so other apps (a file manager, Termux) can reach them." }) : null,
      item({ id: "storage.app", label: "App folder", sub: (S.app.storage || "?") + " · " + (S.app.allFiles ? "Plugins and settings live here, so Termux and Neovim can reach them." : "The app can't use /sdcard yet, so files are in its own folder.") }),
      S.app.allFiles ? null : item({ id: "storage.grant", label: "Allow all files access", sub: "Then restart the app", onclick: () => api("/api/app/action", { action: "grantFiles" }) }),
      item({ id: "storage.check", label: "Storage check", chev: true, onclick: openStorageCheck }),
    ];
  }],
  ["Import and export", "Profiles, prompts, name clashes", () => {
    const menu = (label) => [...S.plugins.values()].flatMap((p) => p.def?.menu || []).find((m) => m.label === label);
    const spImport = menu("Import system prompts…"), spExport = menu("Export all system prompts");
    const clash = { ask: "Ask each time (keep both is preselected)", both: "Always keep both", replace: "Always replace" };
    return [
      h("h3", {}, "Profiles"),
      item({ id: "ie.exp", label: "Export all profiles", onclick: () => exportProfiles(S.config.profiles) }),
      item({ id: "ie.imp", label: "Import a profile…", onclick: openImportProfile }),
      h("h3", {}, "System prompts"),
      spExport ? item({ id: "ie.spexp", label: "Export all system prompts", onclick: () => spExport.run() }) : null,
      spImport ? item({ id: "ie.spimp", label: "Import system prompts…", onclick: () => spImport.run() }) : h("p", { class: "muted" }, "The System prompt plugin isn't installed."),
      h("h3", {}, "When a name already exists"),
      item({ id: "ie.clash", label: "Importing a name you already have", sub: clash[importMode()], onclick: () => ((S.config.importClash = { ask: "both", both: "replace", replace: "ask" }[importMode()]), saveConfig(), rerenderSheet()) }),
    ];
  }],
  ["Local API", "Address, token, folder", () => [
    item({ id: "api.a1", label: "Address", sub: apiBase(), onclick: () => copyText(apiBase(), "Copied") }),
    item({ id: "api.a2", label: "API token", sub: "Copy or make a new one", onclick: openApiToken }),
    h("div", { class: "lbl" }, "More"),
    item({ id: "api.how", label: "How apps use it", sub: "OpenAI-style: base URL, model = a profile name", chev: true, onclick: openApiHow }),
    item({ id: "api.folder", label: "Folder for chats made through the API", sub: S.config.api.folder || "Top level", onclick: async () => {
      const v = await askText("Folder for chats made through the API (empty = top level)", S.config.api.folder || "", "Save");
      if (v != null) ((S.config.api.folder = v.trim()), saveConfig(), rerenderSheet());
    } }),
  ]],
  ["Advanced", "Reset, safe mode, core log", () => [
    item({ id: "adv.reset", label: "Reset to first launch", sub: "Shows the welcome again. Chats, profiles and plugins stay.", onclick: resetFirstLaunch }),
    item({ id: "adv.parts", label: "App parts", chev: true, onclick: () => settingsPage("App parts", appPartsControls) }),
    item({ id: "adv.safe", label: "Safe mode", sub: SAFE ? "On: only built-in plugins" : "", onclick: () => restart(true) }),
    item({ id: "adv.log", label: "Core log", chev: true, onclick: openCoreLog }),
    item({ id: "adv.bg", label: "Stop background service", sub: "A notification keeps the AI page and the API alive in the background", onclick: () => api("/api/app/action", { action: "stopService" }) }),
    item({ id: "adv.ver", label: "Version", sub: (S.app.version || "?") + (S.app.coreVersion ? " · core " + S.app.coreVersion : ""), onclick: () => copyText((S.app.version || "?") + " · core " + (S.app.coreVersion || "?"), "Copied") }),
  ]],
  ["Help", "Shortcuts, quick start", () => [
    item({ id: "help.q", label: "Show the ? button", sub: "Tap ?, then tap anything to see what it does", toggle: S.config.helpButton !== false, onclick: () => ((S.config.helpButton = S.config.helpButton === false), saveConfig(), rerenderSheet(), render()) }),
    item({ id: "help.keys", label: "Shortcuts", sub: "Keyboard and touch", chev: true, onclick: openHelp }),
    item({ id: "help.qs", label: "Quick start", sub: "Short guides, three steps each. Replay any time.", chev: true, onclick: openQuickStartList }),
    item({ id: "help.pg", label: "Plugin guide", chev: true, onclick: openPluginGuide }),
  ]],
];
const SETTING_ICONS = { Plugins: "plugins", "System prompts": "prompt", Look: "look", Sites: "sites", "Chats and storage": "storage", "Import and export": "impexp", "Local API": "api", Advanced: "adv", Help: "help" };
PP.openSettings = () => openSettings();
// System prompts opens the library at once; Plugins opens the Plugins screen (as in the wireframe).
const openSettingsGroup = (title, body) => {
  const lib = title === "System prompts" && [...S.plugins.values()].flatMap((p) => p.def?.menu || []).find((m) => m.label === "System prompts");
  if (lib) return lib.run();
  if (title === "Plugins") return openPlugins();
  settingsPage(title, body);
};
const openSettings = () =>
  openSheet("Settings", () => [
    ...SETTINGS.map(([title, sub, body]) =>
      item({ id: "settings." + title, icon: SETTING_ICONS[title], label: title, sub, chev: title !== "Plugins" || !updateCount(), badge: title === "Plugins" && updateCount() ? String(updateCount()) : null, onclick: () => openSettingsGroup(title, body) })),
  ]);
