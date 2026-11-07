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
  { name: "Show AI page", path: "Chats", key: "Alt+S", run: showSite },
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
  ...profile().plugins
    .filter((e) => isStep(S.plugins.get(e.id)))
    .map((e) => ({ name: `Toggle ${pluginName(e.id)} (${stepOn(e.id) ? "on" : "off"})`, path: "Profile", key: "", run: () => (setStepOn(e.id, !stepOn(e.id)), render()) })),
  { name: "Plugins", path: "Settings", key: "Ctrl+Shift+P", run: () => openPlugins() },
  { name: "Reload plugins", path: "Settings › Plugins", key: "Ctrl+Shift+R", run: reloadPlugins },
  { name: "Plugin guide", path: "Settings › Plugins", key: "", run: openGuide },
  ...[...S.plugins.values()].flatMap((p) =>
    (p.def?.menu || []).map((m) => ({ name: m.label, path: "Plugins › " + (p.manifest?.name || p.id), key: "", run: () => Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error")) })),
  ),
  { name: "Storage check", path: "Settings › Chats and storage", key: "", run: openStorageCheck },
  { name: "Git history", path: "Settings › Chats and storage", key: "", run: openGit },
  { name: "Settings", path: "Settings", key: "Ctrl+,", run: openSettings },
  { name: "Look: scale and theme", path: "Settings › Look", key: "", run: () => openSheet("Look", lookControls) },
  { name: "Bigger UI", path: "Settings › Look", key: "Ctrl+=", run: () => setScale(S.config.ui.scale + 0.05) },
  { name: "Smaller UI", path: "Settings › Look", key: "Ctrl+-", run: () => setScale(S.config.ui.scale - 0.05) },
  { name: "Shortcuts and help", path: "Help", key: "Ctrl+?", run: openHelp },
  { name: "Quick start", path: "Help", key: "", run: openQuickStart },
];

// Settings pages are found by name; the controls on them by these labels (the
// text the control shows, flashed once its page is open).
const SETTING_CONTROLS = [
  ["Look", "Light or dark"], ["Look", "Accent"], ["Look", "Text size"], ["Look", "UI scale"], ["Look", "Theme"],
  ["Look", "Stay at the bottom while a reply comes in"], ["Look", "Enter sends"],
  ["Chats and storage", "Where chats are saved"], ["Chats and storage", "Git history and backup"], ["Chats and storage", "Storage check"],
  ["Sites", "Get site plugins"], ["Sites", "Max replies at once"], ["Sites", "Waiting for replies"],
  ["Import and export", "Export all profiles"], ["Import and export", "Import a profile"], ["Import and export", "Importing a name you already have"],
  ["Local API", "API token"], ["Local API", "Folder for chats made through the API"],
  ["Advanced", "App parts"], ["Advanced", "Stop background service"], ["Advanced", "Core log"], ["Advanced", "Show the welcome again"],
];

const findEntries = () => [
  ...commands(),
  ...SETTINGS.map(([title, sub, body]) => ({ name: title, path: "Settings", key: "", sub, run: () => settingsPage(title, body) })),
  ...SETTING_CONTROLS.map(([page, label]) => {
    const [title, , body] = SETTINGS.find((s) => s[0] === page);
    return { name: label, path: "Settings › " + page, key: "", run: () => settingsPage(title, body), flash: label };
  }),
  ...S.chats.map((c) => ({ name: c.meta.title || c.path, path: "Chat" + (dFolderOf(c.path) ? " in " + dFolderOf(c.path) : ""), key: "", chat: true, run: () => openChat(c.path).catch((e) => toast(e.message, "error")) })),
];

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
    const body = document.querySelector(".sheet-body");
    if (!body) return;
    const hit = [...body.querySelectorAll("*")].filter((el) => el.textContent.toLowerCase().includes(text.toLowerCase()) && ![...el.children].some((k) => k.textContent.toLowerCase().includes(text.toLowerCase()))).pop();
    const target = hit?.closest("label, .row, .menu-item, button, h3, p") || hit;
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
    const input = h("input", { type: "search", "aria-label": "Find", placeholder: 'Chats, messages, functions, settings. Also "phrase", #tag, in:folder, is:you', value: S.lastFind || "", "data-keep": "find" });
    const list = h("div", { class: "results" });
    let sel = 0;
    let picks = []; // { run } in the order shown
    const pick = (e) => {
      const flash = e.flash;
      runFromSheet(e);
      if (flash) flashControl(flash);
    };
    const row = (e, i) =>
      h("button", { class: "result find-row" + (i === sel ? " sel" : ""), onclick: () => pick(e) },
        h("span", { class: "result-head" }, h("b", {}, e.name), e.key ? h("kbd", {}, e.key) : null),
        h("span", { class: "result-path" }, e.path));
    const draw = async () => {
      const q = input.value;
      S.lastFind = q;
      const things = q.trim() ? rankEntries(findEntries(), q).slice(0, 25) : findEntries().filter((e) => !e.chat).slice(0, 8);
      const wantsMessages = q.trim().length >= 2;
      let hits = [];
      if (wantsMessages) {
        if (!S.index) {
          list.replaceChildren(...things.map(row), h("p", { class: "muted" }, "Reading chats…"));
          try {
            await buildIndex();
          } catch (e) {
            return list.replaceChildren(h("p", { class: "error" }, e.message));
          }
          if (input.value !== q) return; // typed on meanwhile; that draw handles it
        }
        hits = search(q);
      }
      sel = Math.min(sel, Math.max(0, things.length + hits.length - 1));
      const words = parseQuery(q).words;
      picks = [...things, ...hits.slice(0, 200).map((e) => ({ run: () => goToMessage(e) }))];
      list.replaceChildren(...[
        things.length ? h("h3", {}, q.trim() ? "Chats, functions and settings" : "Try") : null,
        ...things.map(row),
        wantsMessages ? h("h3", {}, `Messages${hits.length ? " (" + hits.length + ")" : ""}`) : null,
        wantsMessages && !hits.length ? h("p", { class: "muted" }, "No message matches.") : null,
        ...hits.slice(0, 200).map((e, j) => {
          const i = things.length + j;
          return h("button", { class: "result" + (i === sel ? " sel" : ""), onclick: () => goToMessage(e) },
            h("span", { class: "result-head" }, h("b", {}, e.title), e.n >= 0 ? ` · #${e.n + 1}` : "", " · ", ChatFile.stamp(e.at), e.tags.length ? "  " + e.tags.map((t) => "#" + t).join(" ") : ""),
            h("span", { class: "result-text" }, snippet(e, words)));
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
      if (e.key === "ArrowDown") sel = Math.min(sel + 1, picks.length - 1);
      else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
      else if (e.key === "Enter" && picks[sel]) return void pick(picks[sel]);
      else return;
      e.preventDefault();
      draw();
    };
    draw();
    autofocus(input, true);
    return [input, list];
  });
};
