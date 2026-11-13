"use strict";
// App part: history. Chat files (open, save, move, delete, folders), git
// commits through /api/history, and tags.

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
  meta: { title: "New chat", source: "", site: "", ai: "", model: "", profile: profile().name, switches: {}, tags: [], created: iso(), updated: iso() },
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
  const prof = profileNamed(S.chat.meta.profile);
  if (prof) S.config.activeProfile = prof.id; // the chat's profile; new chats start with it too
  S.unseen = [];
  S.chat.folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  S.config.lastChat = path;
  saveConfig();
  closeDrawer();
  render();
  scrollDown();
};

const startNewChat = (folder) => {
  S.chat = newChat(folder ?? S.folder);
  S.unseen = [];
  closeDrawer();
  render();
  setTimeout(() => document.querySelector("#msg")?.focus(), 0);
};

const openSiteChat = async (c) => {
  const known = S.chats.find((x) => sameUrl(x.meta.source, c.url));
  if (known) return openChat(known.path);
  S.chat = newChat();
  S.chat.meta.title = c.title;
  S.chat.meta.source = c.url;
  S.chat.meta.site = siteIdOf();
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

// Makes the folder (a .gitkeep keeps it in git). Resolves true once it exists;
// says why in a toast and resolves false when the name won't do.
const makeFolder = async (name) => {
  const parts = name.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => p === ".." || p.startsWith("."))) {
    toast("Not a valid folder name (no empty parts, no dots at the start)", "error");
    return false;
  }
  name = parts.join("/");
  // The folder itself is what matters (mkdir says why if it can't be made). The
  // .gitkeep only lets git keep an empty folder, so a failure to write it is not an error.
  await api("/api/history/save", { mkdir: [name] });
  const r = await api("/api/history/save", { files: [{ path: name + "/.gitkeep", text: "" }], message: "folder: " + name }).catch((e) => ({ gitError: "", keepError: e.message }));
  // Open it and every folder around it, or a subfolder would stay out of sight.
  parts.forEach((_, i) => S.openFolders.add(parts.slice(0, i + 1).join("/")));
  local("openFolders", [...S.openFolders]);
  await loadTree();
  render();
  toast(`Folder "${name}" created`);
  if (r.gitError) toast("Not saved to git: " + r.gitError, "error");
  return true;
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


on("start", async () => {
  await Promise.all([loadTree(), loadTags()]);
  S.chat = newChat();
  if (S.config.lastChat && S.chats.some((c) => c.path === S.config.lastChat)) await openChat(S.config.lastChat).catch(() => {});
});
