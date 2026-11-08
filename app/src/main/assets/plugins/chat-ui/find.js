"use strict";
// App part (chat screen): Find. One box that finds chats, messages, every
// function and every setting (Ctrl+K, F3, Ctrl+F, or the magnifier at the top).
// A result says where it lives ("Settings › Look") and its shortcut; picking it
// opens that screen and flashes the control.

// ---------- what can be found (data) ----------
// A function: { name, path, key, run }. Plugins add theirs through "menu".
const commands = () => [
  { name: "New chat", path: "Chats", key: "Ctrl+N", run: () => startNewChat() },
  { name: "Chats and folders", path: "Chats", key: "Ctrl+B", run: openDrawer },
  { name: "Select chats", path: "Chats", key: "", run: beginSelect },
  { name: "New folder", path: "Chats", key: "", run: () => ((S.newFolderBox = true), openDrawer()) },
  { name: "Previous chat", path: "Chats", key: "Alt+↑", run: () => stepChat(-1) },
  { name: "Next chat", path: "Chats", key: "Alt+↓", run: () => stepChat(1) },
  { name: "Show AI page", path: "Chats", key: "Alt+S", run: () => showSite() },
  { name: "Choose model", path: "Profile and site", key: "Ctrl+M", run: openModels },
  { name: "Link this chat to the open AI page", path: "Profile and site", key: "", run: linkToSite },
  { name: "Import messages from the linked site chat", path: "Profile and site", key: "", run: importHistory },
  { name: "Add the page's newest reply to this chat", path: "Profile and site", key: "", run: addFromPage },
  { name: "Decode newest reply on the AI page (preview)", path: "Profile and site", key: "", run: decodeLast },
  { name: "Chat: name, tags, move, export", path: "Chat", key: "F2", run: openChatSheet },
  { name: "Add chat tag", path: "Chat", key: "Ctrl+T", run: () => (openChatSheet(), setTimeout(() => document.querySelector(".in-sheet .tag-input")?.focus(), 50)) },
  { name: "Copy the whole chat", path: "Chat", key: "", run: () => copyChat() },
  { name: "Share or export the whole chat…", path: "Chat", key: "", run: () => shareChat() },
  { name: "Move chat to folder…", path: "Chat", key: "", run: openMoveSheet },
  { name: "Edit and resend last message", path: "Message bar", key: "↑ in empty box", run: editLast },
  { name: "Bigger or smaller message box", path: "Message bar", key: "Ctrl+E", run: toggleExpand },
  { name: "Fold or unfold all thinking", path: "Chat", key: "Ctrl+/", run: () => toggleThinking() },
  { name: "Edit this profile", path: "Profile", key: "Ctrl+Shift+L", run: () => openProfileEditor() },
  { name: "Profiles: new, import, export", path: "Profile", key: "", run: () => openProfileEditor() },
  { name: "Next profile", path: "Profile", key: "Ctrl+P", run: nextProfile },
  { name: "Quick edit and add", path: "Message bar", key: "", run: openQuick },
  { name: "Put a text file in the box", path: "Message bar", key: "", run: () => pickTextFiles(false) },
  { name: "Put several text files in the box", path: "Message bar", key: "", run: () => pickTextFiles(true) },
  { name: "Open a chat from the site", path: "Chats", key: "", run: openSiteChats },
  // The rows of the profile in use, and Add a row (as the wireframe finds them).
  ...profile().pipe.rows.map((r) => ({ name: rowTitle(r), path: "Settings › Plugins › Profile", key: "", run: () => ((S.editProfile = profile().id), openRowPage(r)) })),
  { name: "Add a row", path: "Settings › Plugins › Profile", key: "", run: () => ((S.editProfile = profile().id), openAddRow()) },
  // Every installed plugin has its page.
  ...[...S.plugins.values()].filter((p) => p.manifest && !isPart(p) && !isDriver(p)).map((p) => ({ name: (p.manifest.name || p.id) + " plugin", path: "Settings › Plugins › Library", key: "", run: () => openPluginPage(p.id) })),
  { name: "Get plugins", path: "Settings › Plugins › Library", key: "", run: () => openGetPlugins() },
  { name: "Add plugin source", path: "Settings › Plugins › Library", key: "", run: openAddSource },
  { name: "Install a plugin from a file or link", path: "Settings › Plugins › Library", key: "", run: openInstall },
  { name: "Plugins", path: "Settings", key: "Ctrl+Shift+P", run: () => openPlugins() },
  { name: "Reload plugins", path: "Settings › Plugins", key: "Ctrl+Shift+R", run: reloadPlugins },
  { name: "Plugin guide", path: "Settings › Plugins", key: "", run: openPluginGuide },
  { name: "Update plugins", path: "Settings › Plugins", key: "", run: () => openPlugins("library") },
  ...[...S.plugins.values()].flatMap((p) =>
    (p.def?.menu || []).map((m) => ({ name: m.label, path: "Plugins › " + (p.manifest?.name || p.id), key: "", run: () => Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error")) })),
  ),
  { name: "Storage check", path: "Settings › Chats and storage", key: "", run: openStorageCheck },
  { name: "Git history", path: "Settings › Chats and storage", key: "", run: openGit },
  { name: "Settings", path: "Settings", key: "Ctrl+,", run: openSettings },
  { name: "Accent", path: "Settings › Look", key: "", run: openAccent },
  { name: "Model and switches", path: "Profile and site", key: "", run: openModels },
  { name: "Bigger UI", path: "Settings › Look", key: "Ctrl+=", run: () => setScale(S.config.ui.scale + 0.05) },
  { name: "Smaller UI", path: "Settings › Look", key: "Ctrl+-", run: () => setScale(S.config.ui.scale - 0.05) },
  { name: "Shortcuts and help", path: "Help", key: "Ctrl+?", run: openHelp },
  { name: "Quick start", path: "Help", key: "", run: openQuickStartList },
];

// Settings pages are found by name; the controls on them by these labels (the
// text the control shows, flashed once its page is open).
const SETTING_CONTROLS = [
  ["Look", "Light or dark"], ["Look", "Accent"], ["Look", "UI scale"], ["Look", "Quick actions under replies"],
  ["Look", "Stay at the bottom while a reply comes in"], ["Look", "Enter sends"],
  ["Sites", "Max replies at once"], ["Sites", "Waiting for replies"],
  ["Chats and storage", "Chat folder"], ["Chats and storage", "Move all chats to another folder…"], ["Chats and storage", "Git history and backup"], ["Chats and storage", "Allow all files access"], ["Chats and storage", "Storage check"],
  ["Import and export", "Export all profiles"], ["Import and export", "Import a profile…"], ["Import and export", "Export all system prompts"], ["Import and export", "Import system prompts…"], ["Import and export", "Importing a name you already have"],
  ["Local API", "Address"], ["Local API", "API token"], ["Local API", "How apps use it"], ["Local API", "Folder for chats made through the API"],
  ["Advanced", "Reset to first launch"], ["Advanced", "App parts"], ["Advanced", "Safe mode"], ["Advanced", "Core log"], ["Advanced", "Stop background service"], ["Advanced", "Version"],
  ["Help", "Show the ? button"], ["Help", "Shortcuts"], ["Help", "Plugin guide"],
];

// Everything once (a name in the same place is one entry).
const findEntries = () => {
  const all = [
    ...commands(),
    ...SETTINGS.map(([title, sub, body]) => ({ name: title, path: "Settings", key: "", sub, run: () => openSettingsGroup(title, body) })),
    ...SETTING_CONTROLS.map(([page, label]) => {
      const [title, , body] = SETTINGS.find((s) => s[0] === page);
      return { name: label, path: "Settings › " + page, key: "", run: () => openSettingsGroup(title, body), flash: label };
    }),
    ...S.chats.map((c) => ({ name: c.meta.title || c.path, path: "Chat" + (dFolderOf(c.path) ? " in " + dFolderOf(c.path) : ""), key: "", chat: true, run: () => openChat(c.path).catch((e) => toast(e.message, "error")) })),
  ];
  const seenAt = new Map();
  for (const e of all) {
    const k = e.name.toLowerCase() + "|" + e.path;
    const had = seenAt.get(k);
    if (!had) seenAt.set(k, e);
    else if (!had.key && e.key) seenAt.set(k, { ...had, key: e.key });
  }
  return [...seenAt.values()];
};

// Every word must be in the name or the path; the name counts more.
const scoreEntry = (e, words) => {
  const name = e.name.toLowerCase(), path = e.path.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (name.startsWith(w)) score += 4;
    else if (name.includes(" " + w)) score += 3;
    else if (name.includes(w)) score += 2;
    else if (path.includes(w)) score += 1;
    else return 0;
  }
  return score;
};

const rankEntries = (entries, q) => {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w && !/^(#|in:|is:)/.test(w));
  if (!words.length) return [];
  return entries
    .map((e) => [e, scoreEntry(e, words)])
    .filter(([, s]) => s)
    .sort((a, b) => b[1] - a[1] || Number(!!a[0].chat) - Number(!!b[0].chat))
    .map(([e]) => e);
};

// Flash the control a result points at, once its screen is on.
const flashControl = (text) =>
  setTimeout(() => {
    const body = document.querySelector(".sheet .body");
    if (!body) return;
    const hit = [...body.querySelectorAll("*")].filter((el) => el.textContent.toLowerCase().includes(text.toLowerCase()) && ![...el.children].some((k) => k.textContent.toLowerCase().includes(text.toLowerCase()))).pop();
    const target = hit?.closest(".it, label, .row, button, .lbl") || hit;
    if (!target) return;
    target.classList.add("flash");
    target.scrollIntoView({ block: "center" });
    setTimeout(() => target.classList.remove("flash"), 2200);
  }, 60);

// ---------- messages of every chat ----------
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

const goToMessage = async (e) => {
  S.sheet = null;
  syncLayer();
  await openChat(e.path);
  if (e.n >= 0) {
    S.highlight = e.n;
    render();
    document.getElementById("turn-" + e.n)?.scrollIntoView({ block: "center" });
    setTimeout(() => ((S.highlight = null), render()), 2500);
  }
};

// ---------- the Find sheet ----------
const openFind = (initial) => {
  if (initial != null) S.lastFind = initial;
  openSheet("Find", () => {
    const input = h("input", { type: "search", "aria-label": "Find", placeholder: "Find chats and functions", title: 'Also "phrase", #tag, in:folder, is:you', value: S.lastFind || "", "data-keep": "find" });
    const list = h("div", { class: "results" });
    let sel = 0;
    let picks = []; // { run } in the order shown
    const pick = (e) => {
      if (!e.chat && e.name && e.run) S.config.findRecent = [e.name, ...(S.config.findRecent || []).filter((n) => n !== e.name)].slice(0, 3), saveConfig();
      const flash = e.flash;
      runFromSheet(e);
      if (flash) flashControl(flash);
    };
    let keys = false; // the arrows were used: show which row Enter opens
    const row = (e, i) =>
      h("button", { class: "it" + (keys && i === sel ? " sel" : ""), onclick: () => pick(e) },
        h("div", { class: "g" }, e.name, h("small", {}, e.path)), e.key ? h("kbd", {}, e.key) : null);
    const draw = async () => {
      const q = input.value;
      S.lastFind = q;
      if (!q.trim()) {
        // Nothing typed: the functions used lately, and words to try (as in the wireframe).
        const all = findEntries();
        const recent = (S.config.findRecent || []).map((n) => all.find((e) => e.name === n)).filter(Boolean);
        picks = recent;
        return list.replaceChildren(...[
          recent.length ? h("div", { class: "lbl" }, "Recent") : null,
          recent.length ? h("div", { class: "chips" }, recent.map((e) => h("button", { class: "pill", onclick: () => pick(e) }, e.name))) : null,
          h("div", { class: "lbl" }, "Try"),
          h("div", { class: "chips" }, ["model", "profile", "plugin", "prompt", "export", "folder"].map((w) => h("button", { class: "pill", onclick: () => ((input.value = w), (sel = 0), draw(), input.focus()) }, w))),
        ].filter(Boolean));
      }
      const ranked = rankEntries(findEntries(), q);
      const things = [...ranked.filter((e) => e.chat).slice(0, 8), ...ranked.filter((e) => !e.chat).slice(0, 25)]; // chats first, then functions
      const wantsMessages = q.trim().length >= 2;
      let hits = [];
      if (wantsMessages) {
        if (!S.index) {
          list.replaceChildren(...things.map(row), item({ label: "Reading chats…" }));
          try {
            await buildIndex();
          } catch (e) {
            return list.replaceChildren(item({ cls: "danger", label: "Couldn't read the chats", sub: e.message }));
          }
          if (input.value !== q) return; // typed on meanwhile; that draw handles it
        }
        hits = search(q);
      }
      sel = Math.min(sel, Math.max(0, things.length + hits.length - 1));
      const words = parseQuery(q).words;
      picks = [...things, ...hits.slice(0, 200).map((e) => ({ run: () => goToMessage(e) }))];
      list.replaceChildren(...[
        things.some((e) => e.chat) ? h("div", { class: "lbl" }, "Chats") : null,
        ...things.map((e, i) => [e.chat ? null : i === things.findIndex((x) => !x.chat) ? h("div", { class: "lbl" }, "Functions") : null, row(e, i)]).flat(),
        wantsMessages ? h("div", { class: "lbl" }, `Messages${hits.length ? " (" + hits.length + ")" : ""}`) : null,
        wantsMessages && !hits.length ? item({ label: "No message matches" }) : null,
        ...hits.slice(0, 200).map((e, j) => {
          const i = things.length + j;
          return h("button", { class: "it" + (keys && i === sel ? " sel" : ""), onclick: () => goToMessage(e) },
            h("div", { class: "g" }, h("span", {}, e.title, e.n >= 0 ? ` · #${e.n + 1}` : "", " · ", ChatFile.stamp(e.at), e.tags.length ? "  " + e.tags.map((t) => "#" + t).join(" ") : ""), h("small", {}, snippet(e, words))));
        }),
      ].filter(Boolean));
      list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
    };
    let timer = 0;
    input.oninput = () => {
      clearTimeout(timer);
      sel = 0;
      timer = setTimeout(draw, 120);
    };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown") ((sel = keys ? Math.min(sel + 1, picks.length - 1) : 0), (keys = true));
      else if (e.key === "ArrowUp") ((sel = Math.max(sel - 1, 0)), (keys = true));
      else if (e.key === "Enter" && picks[sel]) return void pick(picks[sel]);
      else return;
      e.preventDefault();
      draw();
    };
    draw();
    autofocus(input, true);
    return [h("label", { class: "search" }, svgIcon("search"), input), list];
  });
};
