"use strict";
// App part (chat screen): Settings, one page of groups, each a page of its own.

// Settings: one page of groups, each a page of its own (‹ Settings goes back).
const settingsPage = (title, body) =>
  openSheet(title, () => [h("button", { class: "ghost back", onclick: openSettings }, "‹ Settings"), ...body()]);
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
const settingsBody = (title) => SETTINGS.find((g) => g[0] === title)[2];
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
    ...maxRepliesControls(),
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

