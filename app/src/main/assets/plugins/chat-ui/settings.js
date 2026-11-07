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
const maxRepliesControls = () => [
  h("h3", {}, "Max replies at once"),
  h("p", { class: "muted" }, "Chats (yours, plugins' and other apps') answered at the same time. Each one runs on its own copy of the site, which opens when a message has to wait; the rest wait their turn. All copies share your login. More use more memory, and many messages at once on one account can look like a bot to the site."),
  h("div", { class: "row stepper" },
    h("button", { class: "small", "aria-label": "Fewer", disabled: maxReplies() <= 1, onclick: () => ((S.config.maxReplies = maxReplies() - 1), saveConfig(), rerenderSheet()) }, "−"),
    h("strong", {}, `${maxReplies()} at once`),
    h("button", { class: "small", "aria-label": "More", disabled: maxReplies() >= (S.config.moreReplies ? 10 : 5), onclick: () => ((S.config.maxReplies = maxReplies() + 1), saveConfig(), rerenderSheet()) }, "+")),
  h("label", { class: "field inline" }, h("span", {}, "Allow up to 10"), switchBtn(!!S.config.moreReplies, "Allow up to 10", async (on) => {
    if (on && !(await askUser("Up to 10 replies at once can slow or crash the phone and look like a bot to the AI site. Allow it?", { ok: "Allow up to 10" }))) return;
    S.config.moreReplies = on;
    if (!on) S.config.maxReplies = Math.min(maxReplies(), 5);
    saveConfig();
    rerenderSheet();
  })),
];
// Back to the welcome, as on the first start (nothing the person made is touched).
const resetFirstLaunch = async () => {
  if (!(await askConfirm("Show the welcome again, as on the first start? Your chats, profiles, plugins and settings stay.", "Reset"))) return;
  S.config.welcomed = false;
  saveConfig();
  closeSheet();
  openWelcome();
};
const settingsBody = (title) => SETTINGS.find((g) => g[0] === title)[2];
const SETTINGS = [
  ["Plugins", "Install, update, roll back, sources, the profile", () => [
    h("div", { class: "row" }, h("button", { class: "primary", onclick: () => openPlugins() }, "Plugins", updateCount() ? h("span", { class: "udot", "aria-label": "Updates available" }) : null), h("button", { onclick: () => openProfileEditor() }, "Edit profile")),
    h("p", { class: "muted" }, updateCount() ? `${updateCount()} plugin update${updateCount() === 1 ? "" : "s"} waiting. Open Plugins, then Update all.` : "Plugins are up to date as far as the app knows (it checks the sources when it starts)."),
  ]],
  ["System prompts", "Your library of prompts, import and export", () => {
    const menu = (label) => [...S.plugins.values()].flatMap((p) => p.def?.menu || []).find((m) => m.label === label);
    const lib = menu("System prompts"), imp = menu("Import system prompts…"), exp = menu("Export all system prompts");
    return lib ? [
      h("p", { class: "muted" }, "The prompts you keep. Put them in a profile as rows (Edit profile › Add a row), or stack them with the System prompt plugin."),
      h("div", { class: "row" }, h("button", { class: "primary", onclick: () => lib.run() }, "Open the library")),
      h("div", { class: "row" }, imp ? h("button", { onclick: () => imp.run() }, "Import…") : null, exp ? h("button", { onclick: () => exp.run() }, "Export all") : null),
    ] : [h("p", { class: "muted" }, "The System prompt plugin isn't installed. Get it in Plugins.")];
  }],
  ["Look", "Light or dark, accent, text size, UI scale, theme, Enter sends", () => [
    ...lookControls(),
    h("h3", {}, "Chat"),
    h("label", { class: "field inline" }, h("span", {}, "Stay at the bottom while a reply comes in (only if you were already there; scrolled up, your place never moves)"), h("input", { type: "checkbox", checked: followOn(), onchange: (e) => ((S.config.ui.follow = e.target.checked), saveConfig()) })),
    h("h3", {}, "Keyboard"),
    h("label", { class: "field inline" }, h("span", {}, "Enter sends (Shift+Enter for a new line)"), h("input", { type: "checkbox", checked: !!S.config.ui.enterSends, onchange: (e) => ((S.config.ui.enterSends = e.target.checked), saveConfig()) })),
  ]],
  ["Sites", "Site plugins, pages at once, waiting for replies", () => [
    h("div", { class: "row" }, h("button", { class: "primary", onclick: openGetSites }, "Get site plugins"), h("button", { onclick: openSiteSheet }, "This profile's site")),
    ...maxRepliesControls(),
    h("h3", {}, "Waiting for replies"),
    h("p", { class: "muted" }, "In minutes. 0 = no limit. Stop on a reply that's coming always works."),
    ...[["idleMin", "Give up after this long with no activity on the page"], ["maxMin", "Give up after this long in total"]].map(([k, label]) =>
      h("label", { class: "field inline" }, h("span", {}, label), h("input", { type: "number", min: "0", step: "1", style: "width:5em", value: String((S.config.wait || {})[k] || 0), oninput: (e) => ((S.config.wait = { ...(S.config.wait || {}), [k]: Math.max(0, +e.target.value || 0) }), saveConfig()) }))),
  ]],
  ["Chats and storage", "The chats folder, where files are, git history and backup", () => {
    if (!FOLDER.info && !FOLDER.loading) loadFolderInfo();
    const f = FOLDER.info;
    return [
      h("h3", {}, "Chats folder"),
      f ? h("p", {}, h("code", {}, f.path)) : h("p", { class: "muted" }, "Checking…"),
      f ? h("p", { class: "muted" }, `${f.chats} chat${f.chats === 1 ? "" : "s"} · ${f.custom ? "a folder you chose" : "the default folder"}. Chats are Markdown files in a git repository, so other apps (a file manager, Termux) can reach them.`) : null,
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: openFolderPicker }, "Choose a folder…"),
        f && f.custom ? h("button", { onclick: () => useFolder("", true) }, "Use the default folder") : null),
      ...FOLDER.found.map((o) => h("div", { class: "card" },
        h("p", {}, h("strong", {}, `${o.chats} chat${o.chats === 1 ? "" : "s"} found in another folder`)),
        h("p", {}, h("code", {}, o.path)),
        h("div", { class: "row" },
          h("button", { class: "primary", onclick: () => useFolder(o.path, false) }, "Use that folder"),
          h("button", { onclick: () => copyOldChats(o.path) }, "Copy them here")))),
      h("h3", {}, "App folder"),
      h("p", {}, h("code", {}, S.app.storage || "?")),
      S.app.allFiles
        ? h("p", { class: "muted" }, "Plugins and settings live here, so Termux and Neovim can reach them.")
        : h("p", { class: "warn" }, "The app can't use /sdcard yet, so files are in its own folder. ", h("button", { onclick: () => api("/api/app/action", { action: "grantFiles" }) }, "Allow all files access"), " then restart the app."),
      h("div", { class: "row" }, h("button", { onclick: openStorageCheck }, "Storage check")),
      h("h3", {}, "Git"),
      h("div", { class: "row" }, h("button", { onclick: openGit }, "Git history and backup")),
    ];
  }],
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
    h("h3", {}, "First launch"),
    h("p", { class: "muted" }, "Shows the welcome again, as on the very first start. Your chats, profiles, plugins and settings stay."),
    h("button", { onclick: resetFirstLaunch }, "Reset to first launch"),
  ]],
  ["Help", "Shortcuts, gestures and what each control does", () => [
    h("div", { class: "row" }, h("button", { class: "primary", onclick: openHelp }, "Shortcuts and help")),
    h("p", { class: "muted" }, "Everything has a button or a gesture; keys are extras for a hardware keyboard."),
  ]],
];
const openSettings = () =>
  openSheet("Settings", () => [
    h("div", { class: "results" }, SETTINGS.map(([title, sub, body]) =>
      h("button", { class: "menu-item settings-row", onclick: () => settingsPage(title, body) }, h("span", { class: "grow" }, h("b", {}, title), h("small", { class: "muted" }, sub)), h("span", { class: "chev", "aria-hidden": "true" }, "›")))),
    h("p", { class: "muted" }, "Version " + (S.app.version || "?") + (S.app.coreVersion ? " · core " + S.app.coreVersion : "")),
  ]);

