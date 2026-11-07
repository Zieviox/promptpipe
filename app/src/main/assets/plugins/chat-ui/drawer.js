"use strict";
// App part (chat screen): the chats drawer (burger).
// Pinned, folders and chats are ONE compact list. The list is data: rows are
// keys, "c:<path>" for a chat and "f:<folder>" for a folder. Every change (drop,
// move, rename, delete) is a pure plan built from a model of the list; one edge
// proc (applyPlan) sends it to the core and stores pins and order in the config.

// ---------- the list as data (pure) ----------
const dFolderOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const dBase = (p) => p.slice(p.lastIndexOf("/") + 1);
const cKey = (p) => "c:" + p;
const fKey = (f) => "f:" + f;
const kName = (k) => k.slice(2);
const isChatKey = (k) => k[0] === "c";
const under = (path, folder) => path.startsWith(folder + "/");

// What the list is made of right now: chat paths, folders, pins, saved order.
const dModel = () => ({
  chats: S.chats.map((c) => c.path),
  folders: [...new Set([...S.folders, ...S.chats.map((c) => dFolderOf(c.path)).filter(Boolean)])].sort(),
  pinned: (S.config.pinned || []).filter((p) => S.chats.some((c) => c.path === p)),
  order: S.config.order || [],
});

// Rows of one level (the top, or inside one folder): folders and the chats that
// are not pinned (pinned chats show only under Pinned), in the saved order. What
// was never placed keeps the default: folders by name, then chats newest first.
const levelRows = (m, level) => {
  const pins = new Set(m.pinned);
  const rows = [...m.folders.filter((f) => dFolderOf(f) === level).map(fKey), ...m.chats.filter((p) => dFolderOf(p) === level && !pins.has(p)).map(cKey)];
  const at = new Map(m.order.map((k, i) => [k, i]));
  return rows.sort((a, b) => (at.has(a) ? at.get(a) : 1e9) - (at.has(b) ? at.get(b) : 1e9));
};

const remapKeys = (keys, pathMap, folderMap) =>
  keys.map((k) => {
    if (isChatKey(k)) return pathMap[kName(k)] ? cKey(pathMap[kName(k)]) : k;
    const f = kName(k);
    for (const [from, to] of Object.entries(folderMap)) if (f === from || under(f, from)) return fKey(to + f.slice(from.length));
    return k;
  });

const insertAt = (list, items, anchor, where) => {
  const rest = list.filter((x) => !items.includes(x));
  const i = anchor == null ? -1 : rest.indexOf(anchor);
  const at = where === "start" ? 0 : i < 0 ? rest.length : where === "after" ? i + 1 : i;
  return [...rest.slice(0, at), ...items, ...rest.slice(at)];
};

// A drop: `keys` land on `tgt` ("P" = the Pinned header, "T" = the top level,
// a row key otherwise) at `pos` ("before" | "after" | "in"). Returns the plan or
// { error }, or null when the drop means nothing.
const planDrop = (m, keys, tgt, pos) => {
  const chatKeys = keys.filter(isChatKey);
  const oneFolder = keys.length === 1 && !isChatKey(keys[0]);
  if ((!chatKeys.length && !oneFolder) || keys.includes(tgt)) return null;
  const pinnedSet = new Set(m.pinned);
  const toPinned = tgt === "P" || (isChatKey(tgt) && pinnedSet.has(kName(tgt)));
  if (oneFolder && (toPinned || pos === "in" || tgt === "T")) return null;

  if (toPinned) {
    const paths = chatKeys.map(kName);
    const anchor = tgt === "P" ? null : kName(tgt);
    return { moves: [], pathMap: {}, folderMap: {}, pinned: insertAt(m.pinned, paths, anchor, tgt === "P" ? "start" : pos), order: m.order };
  }

  const level = tgt === "T" ? "" : pos === "in" ? kName(tgt) : dFolderOf(kName(tgt));
  const anchor = tgt === "T" || pos === "in" ? null : tgt;
  if (oneFolder && dFolderOf(kName(keys[0])) !== level) return null; // a folder only reorders at its own level

  const pathMap = {};
  for (const k of chatKeys) {
    const from = kName(k);
    const to = (level ? level + "/" : "") + dBase(from);
    if (to !== from) pathMap[from] = to;
  }
  const targets = Object.values(pathMap);
  const clash = targets.find((to, i) => targets.indexOf(to) !== i || m.chats.includes(to));
  if (clash) return { error: `"${clash}" already exists. Rename one of the chats first.` };

  const m2 = { ...m, chats: m.chats.map((p) => pathMap[p] || p), pinned: m.pinned.filter((p) => !pathMap[p] && !chatKeys.includes(cKey(p))) };
  const moved = keys.map((k) => (isChatKey(k) ? cKey(pathMap[kName(k)] || kName(k)) : k));
  const seq = insertAt(levelRows(m2, level), moved, anchor, anchor ? (pos === "after" ? "after" : "before") : "end");
  const inSeq = new Set(seq);
  const order = [...remapKeys(m.order, pathMap, {}).filter((k) => !inSeq.has(k)), ...seq];
  return { moves: Object.entries(pathMap).map(([from, to]) => ({ from, to })), pathMap, folderMap: {}, pinned: m2.pinned, order };
};

// Where a folder (and everything under it) goes when it is renamed or deleted.
const folderTree = (m, f) => m.folders.filter((g) => g === f || under(g, f));
const cleanup = (m, f) => ({
  files: [],
  delete: folderTree(m, f).sort((a, b) => b.length - a.length).flatMap((g) => [g + "/.gitkeep", g]),
});

const validName = (name) => {
  const parts = String(name).replace(/\\/g, "/").split("/").map((p) => p.trim()).filter(Boolean);
  return parts.length && parts.every((p) => p !== ".." && !p.startsWith(".")) ? parts.join("/") : "";
};

const planRename = (m, f, raw) => {
  const name = validName(raw);
  if (!name || name.includes("/")) return { error: "Type a folder name (a name only; use Move for another place)" };
  const nf = (dFolderOf(f) ? dFolderOf(f) + "/" : "") + name;
  if (nf === f) return null;
  if (m.folders.includes(nf)) return { error: `"${nf}" exists already` };
  const folderMap = { [f]: nf };
  const pathMap = Object.fromEntries(m.chats.filter((p) => under(p, f)).map((p) => [p, nf + p.slice(f.length)]));
  const tree = folderTree(m, f);
  return {
    moves: Object.entries(pathMap).map(([from, to]) => ({ from, to })),
    mkdir: tree.map((g) => nf + g.slice(f.length)),
    files: tree.map((g) => ({ path: nf + g.slice(f.length) + "/.gitkeep", text: "" })),
    delete: cleanup(m, f).delete,
    pathMap, folderMap,
    pinned: m.pinned.map((p) => pathMap[p] || p),
    order: remapKeys(m.order, pathMap, folderMap),
  };
};

const planDeleteFolder = (m, f) => {
  const inside = m.chats.filter((p) => under(p, f));
  const pathMap = Object.fromEntries(inside.map((p) => [p, dBase(p)]));
  const to = Object.values(pathMap);
  const clash = to.find((x, i) => to.indexOf(x) !== i || m.chats.includes(x));
  if (clash) return { error: `Can't empty the folder: "${clash}" already exists at the top level` };
  const gone = new Set(folderTree(m, f).map(fKey));
  return {
    moves: Object.entries(pathMap).map(([from, t]) => ({ from, to: t })),
    delete: cleanup(m, f).delete,
    pathMap, folderMap: {},
    pinned: m.pinned,
    order: remapKeys(m.order, pathMap, {}).filter((k) => !gone.has(k)),
  };
};

// ---------- applying a plan (the edge) ----------
const applyPlan = async (plan, message) => {
  if (!plan) return false;
  if (plan.error) return toast(plan.error, "error"), false;
  try {
    const r = await api("/api/history/save", { moves: plan.moves, mkdir: plan.mkdir, files: plan.files, delete: plan.delete, message });
    if (r.gitError) toast("Not saved to git: " + r.gitError, "error");
  } catch (e) {
    toast("Couldn't do that: " + e.message, "error");
    await loadTree().catch(() => {});
    render();
    return false;
  }
  S.config.pinned = plan.pinned;
  S.config.order = plan.order;
  if (S.chat?.path && plan.pathMap[S.chat.path]) {
    S.chat.path = plan.pathMap[S.chat.path];
    S.chat.folder = dFolderOf(S.chat.path);
    S.config.lastChat = S.chat.path;
  }
  for (const [from, to] of Object.entries(plan.folderMap || {})) {
    for (const f of [...S.openFolders]) if (f === from || under(f, from)) S.openFolders.add(to + f.slice(from.length)), S.openFolders.delete(f);
    if (S.folder === from || under(S.folder, from)) S.folder = to + S.folder.slice(from.length);
  }
  await loadTree();
  if (S.folder && !S.folders.includes(S.folder)) S.folder = "";
  for (const f of [...S.openFolders]) if (!S.folders.includes(f)) S.openFolders.delete(f);
  local("openFolders", [...S.openFolders]);
  saveConfig();
  S.index = null;
  render();
  return true;
};

const moveChats = (paths, level) => applyPlan(planDrop(dModel(), paths.map(cKey), level ? fKey(level) : "T", "in"), `move: ${paths.length} chat${paths.length === 1 ? "" : "s"} -> ${level || "(top)"}`);

const setPinned = (paths, on) => {
  const m = dModel();
  const pinned = on ? [...new Set([...paths, ...m.pinned])] : m.pinned.filter((p) => !paths.includes(p));
  S.config.pinned = pinned;
  saveConfig();
  render();
};
const isPinned = (path) => (S.config.pinned || []).includes(path);
const togglePin = (path) => setPinned([path], !isPinned(path));

// ---------- selection ----------
S.sel = new Set(); // chat keys
S.selMode = false;
S.selMove = false;
S.fedit = null; // folder whose rename/delete panel is open
S.newFolderBox = false;
S.pinOpen = local("pinOpen") !== false;

const endSelect = () => {
  S.selMode = false;
  S.sel = new Set();
  S.selMove = false;
};
const beginSelect = () => {
  S.selMode = true;
  S.sel = new Set();
  S.selMove = false;
  S.drawer || openDrawer();
  render();
};
const toggleSel = (k) => {
  if (isChatKey(k)) S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k);
  else {
    // a folder row selects all the chats directly inside it
    const f = kName(k);
    const kids = S.chats.filter((c) => dFolderOf(c.path) === f && !isPinned(c.path)).map((c) => cKey(c.path));
    const all = kids.length && kids.every((x) => S.sel.has(x));
    kids.forEach((x) => (all ? S.sel.delete(x) : S.sel.add(x)));
  }
  render();
};
const selPaths = () => [...S.sel].map(kName);

// Press and hold a row to start selecting.
const holdToSelect = (el, k) => {
  el.addEventListener("pointerdown", (e) => {
    if (S.selMode || e.target.closest("button.rbtn")) return;
    const x = e.clientX, y = e.clientY;
    const timer = setTimeout(() => ((S.selMode = true), (S.sel = new Set()), toggleSel(k)), 450);
    const stop = () => {
      clearTimeout(timer);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
      el.removeEventListener("pointermove", move);
    };
    const move = (ev) => Math.abs(ev.clientX - x) + Math.abs(ev.clientY - y) > 8 && stop();
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
    el.addEventListener("pointermove", move);
  });
};

// ---------- drag and drop ----------
// Press the grip and move: rows show where it would land (a line above or below,
// or a frame for "into this folder / pin it"), and letting go applies the plan.
// Dragging a selected row moves all the selected chats.
const startDrag = (e, k) => {
  e.preventDefault();
  const grip = e.currentTarget;
  grip.setPointerCapture(e.pointerId);
  const list = document.querySelector(".chat-list");
  const rows = () => [...list.querySelectorAll("[data-ck]")];
  const src = list.querySelector(`[data-ck="${CSS.escape(k)}"]`);
  const y0 = e.clientY;
  const scroll0 = list.scrollTop;
  src.classList.add("dragging");
  let tgt = null, pos = null, y = e.clientY, raf = 0;
  const clear = () => rows().forEach((r) => r.classList.remove("dt", "db", "di"));
  const aim = () => {
    clear();
    tgt = null;
    src.style.transform = `translateY(${y - y0 + (list.scrollTop - scroll0)}px)`;
    for (const r of rows()) {
      if (r === src) continue;
      const b = r.getBoundingClientRect();
      if (y < b.top || y > b.bottom) continue;
      const f = (y - b.top) / b.height, rk = r.dataset.ck;
      if (rk === "P" && isChatKey(k)) pos = "in", r.classList.add("di");
      else if (rk[0] === "f" && isChatKey(k) && f > 0.25) pos = "in", r.classList.add("di");
      else if (f < 0.5) pos = "before", r.classList.add("dt");
      else pos = "after", r.classList.add("db");
      tgt = rk;
      break;
    }
  };
  // Near the top or bottom of the list it scrolls, so far rows can be reached.
  const tick = () => {
    const b = list.getBoundingClientRect();
    const d = y < b.top + 36 ? -9 : y > b.bottom - 36 ? 9 : 0;
    if (d) (list.scrollTop += d), aim();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const move = (ev) => ((y = ev.clientY), aim());
  const end = (apply) => {
    cancelAnimationFrame(raf);
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", cancel);
    const keys = S.selMode && S.sel.has(k) ? [...S.sel] : [k];
    if (apply && tgt) {
      if (pos === "in" && tgt[0] === "f") S.openFolders.add(kName(tgt)); // so you see where it went
      applyPlan(planDrop(dModel(), keys, tgt, pos), "move: " + keys.map(kName).join(", "));
    } else render();
  };
  const up = () => end(true);
  const cancel = () => end(false);
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", cancel);
};

// ---------- rows ----------
const rbtn = (icon, label, onclick, extra = "") =>
  h("button", { class: "rbtn " + extra, "aria-label": label, title: label, onpointerdown: (e) => e.stopPropagation(), onclick: (e) => (e.stopPropagation(), onclick(e)) }, svgIcon(icon));
const gripBtn = (k) => h("button", { class: "rbtn grip", "aria-label": "Drag to move", title: "Drag to move", onpointerdown: (e) => (e.stopPropagation(), startDrag(e, k)), onclick: (e) => e.stopPropagation() }, svgIcon("grip"));
const checkBox = (on) => h("span", { class: "cb" + (on ? " on" : ""), "aria-hidden": "true" }, on ? svgIcon("check") : null);

// Whether a chat is being answered or has an answer you have not seen (parallel
// chats fill this in; nothing yet).
const chatStatus = (path) => (S.chatStatus && S.chatStatus[path]) || "";

const chatRowFor = (c, { depth = 0, drag = true } = {}) => {
  const k = cKey(c.path);
  const on = S.sel.has(k);
  const tags = (c.meta.tags || []).filter((t) => !t.endsWith("#")).slice(0, 2).map((t) => "#" + t).join(" ");
  const status = chatStatus(c.path);
  const row = h(
    "div",
    { class: "crow" + (S.chat.path === c.path ? " current" : "") + (on ? " sel" : ""), "data-ck": k, style: depth ? `padding-left:${depth * 16}px` : null },
    S.selMode ? checkBox(on) : null,
    h(
      "button",
      { class: "cmain", onclick: () => (S.selMode ? toggleSel(k) : openChat(c.path).catch((e) => toast(e.message, "error"))) },
      h("span", { class: "ct" }, c.meta.title || dBase(c.path)),
      tags ? h("span", { class: "ctag" }, tags) : null,
      status ? h("span", { class: "cstat " + (status === "Reply ready" ? "ready" : "") }, status) : null,
    ),
    S.selMode ? null : rbtn("pin", isPinned(c.path) ? "Unpin" : "Pin to top", () => togglePin(c.path), isPinned(c.path) ? "on" : ""),
    S.selMode || !drag ? null : gripBtn(k),
  );
  holdToSelect(row, k);
  return row;
};

const folderPanel = (f) => {
  const input = h("input", { value: dBase(f), "aria-label": "Folder name", "data-keep": "folder-name" });
  const inside = S.chats.filter((c) => under(c.path, f)).length;
  const rename = () => applyPlan(planRename(dModel(), f, input.value), `rename folder: ${f}`).then((ok) => ok && ((S.fedit = null), render()));
  input.onkeydown = (e) => e.key === "Enter" && rename();
  return h(
    "div",
    { class: "fpanel" },
    input,
    h(
      "div",
      { class: "row" },
      h("button", { class: "small primary", onclick: rename }, "Rename"),
      h("button", { class: "small danger", onclick: async () => {
        if (await askConfirm(`Delete the folder "${f}"? ${inside ? `Its ${inside} chat${inside === 1 ? "" : "s"} move${inside === 1 ? "s" : ""} to the top level.` : "It is empty."}`, "Delete folder")) {
          if (await applyPlan(planDeleteFolder(dModel(), f), `delete folder: ${f}`)) (S.fedit = null), render();
        }
      } }, "Delete"),
      h("button", { class: "small", onclick: () => ((S.fedit = null), render()) }, "Cancel"),
    ),
  );
};

const folderRowFor = (m, f, depth) => {
  const k = fKey(f);
  const open = S.openFolders.has(f);
  const count = m.chats.filter((p) => under(p, f) && !m.pinned.includes(p)).length;
  const kids = S.chats.filter((c) => dFolderOf(c.path) === f && !isPinned(c.path)).map((c) => cKey(c.path));
  const all = kids.length && kids.every((x) => S.sel.has(x));
  const row = h(
    "div",
    { class: "crow frow" + (S.folder === f ? " current" : ""), "data-ck": k, style: depth ? `padding-left:${depth * 16}px` : null },
    S.selMode ? checkBox(all) : null,
    h(
      "button",
      {
        class: "cmain",
        "aria-expanded": String(open),
        onclick: () => {
          if (S.selMode) return toggleSel(k);
          open ? S.openFolders.delete(f) : S.openFolders.add(f);
          S.folder = f;
          local("openFolders", [...S.openFolders]);
          render();
        },
      },
      S.selMode ? null : h("span", { class: "chev" }, svgIcon(open ? "down" : "right")),
      h("span", { class: "ct" }, dBase(f)),
      h("span", { class: "ccount" }, String(count)),
    ),
    S.selMode ? null : rbtn("edit", "Rename or delete the folder " + dBase(f), () => ((S.fedit = S.fedit === f ? null : f), render())),
    S.selMode ? null : gripBtn(k),
  );
  holdToSelect(row, k);
  return row;
};

const treeRows = (m, level, depth, out) => {
  for (const k of levelRows(m, level)) {
    if (isChatKey(k)) {
      const c = S.chats.find((x) => x.path === kName(k));
      if (c) out.push(chatRowFor(c, { depth }));
      continue;
    }
    const f = kName(k);
    out.push(folderRowFor(m, f, depth));
    if (S.fedit === f) out.push(folderPanel(f));
    if (S.openFolders.has(f)) {
      const n = out.length;
      treeRows(m, f, depth + 1, out);
      if (out.length === n) out.push(h("div", { class: "empty-note", style: `padding-left:${(depth + 1) * 16 + 8}px` }, "Empty. Drag chats here."));
    }
  }
  return out;
};

// ---------- search ----------
const matches = (c) => {
  const q = S.query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((w) =>
    w.startsWith("#") ? c.meta.tags.some((t) => t.toLowerCase().startsWith(w.slice(1))) : (c.meta.title || "").toLowerCase().includes(w) || c.meta.tags.some((t) => t.toLowerCase().includes(w)),
  );
};

// Tag chips under the search, most used first: tap one to show only its chats.
const tagFilter = () => {
  const count = new Map();
  for (const c of S.chats) for (const t of c.meta.tags || []) count.set(t, (count.get(t) || 0) + 1);
  if (!count.size) return null;
  const words = S.query.trim().split(/\s+/).filter(Boolean);
  const on = (t) => words.includes("#" + t);
  const toggle = (t) => {
    S.query = (on(t) ? words.filter((w) => w !== "#" + t) : [...words, "#" + t]).join(" ");
    render();
  };
  const tags = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  return h("div", { class: "tag-filter", role: "group", "aria-label": "Filter by tag" },
    tags.map(([t, n]) => h("button", { class: "tag-chip" + (on(t) ? " on" : ""), "aria-pressed": String(on(t)), onclick: () => toggle(t) }, "#" + t, h("span", { class: "n" }, String(n)))));
};

// ---------- the drawer ----------
const openDrawer = () => {
  S.drawer = true;
  syncLayer();
  render();
};
closeDrawer = () => {
  if (!S.drawer) return;
  S.drawer = false;
  endSelect();
  S.fedit = null;
  syncLayer();
  render();
};

const makeFolderBox = () => {
  const input = h("input", { placeholder: "Folder name (use / for a subfolder)", "aria-label": "New folder name", "data-keep": "new-folder", value: S.folder ? S.folder + "/" : "" });
  let busy = false;
  const go = async () => {
    if (busy) return;
    busy = true;
    try {
      const name = validName(input.value);
      if (await makeFolder(input.value)) {
        // a new folder goes first at its level
        S.config.order = [fKey(name), ...(S.config.order || []).filter((k) => k !== fKey(name))];
        saveConfig();
        S.newFolderBox = false;
        render();
      }
    } catch (e) {
      toast("Couldn't create the folder: " + e.message, "error");
    } finally {
      busy = false;
    }
  };
  input.onkeydown = (e) => e.key === "Enter" && go();
  setTimeout(() => input.focus(), 0);
  return h("div", { class: "row folder-box" }, input, h("button", { class: "small primary", onclick: go }, "Create"), h("button", { class: "small", onclick: () => ((S.newFolderBox = false), render()) }, "Cancel"));
};

const selectBar = (m) => {
  const paths = selPaths();
  const n = paths.length;
  const allPinned = n && paths.every(isPinned);
  const done = (msg) => (endSelect(), render(), msg && toast(msg));
  const folders = m.folders;
  return h(
    "div",
    { class: "selbar" },
    h("div", { class: "muted" }, `${n} selected. Drag one to move them all.`),
    S.selMove
      ? h("div", { class: "chips" },
          h("button", { class: "chip", onclick: () => moveChats(paths, "").then((ok) => ok && done("Moved to the top level")) }, "Top level"),
          folders.map((f) => h("button", { class: "chip", onclick: () => moveChats(paths, f).then((ok) => ok && done("Moved to " + f)) }, f)))
      : null,
    h(
      "div",
      { class: "chips" },
      h("button", { class: "chip", disabled: !n, onclick: () => (setPinned(paths, !allPinned), done()) }, svgIcon("pin"), allPinned ? "Unpin" : "Pin"),
      h("button", { class: "chip", disabled: !n, onclick: () => ((S.selMove = !S.selMove), render()) }, svgIcon("folder"), "Move…"),
      h("button", { class: "chip danger", disabled: !n, onclick: async () => {
        if (!(await askConfirm(`Delete ${n} chat${n === 1 ? "" : "s"}? They stay in git history.`))) return;
        await api("/api/history/save", { delete: paths, message: `delete: ${n} chats` }).catch((e) => toast(e.message, "error"));
        if (S.chat.path && paths.includes(S.chat.path)) S.chat = newChat();
        await loadTree();
        done(`Deleted ${n}`);
      } }, svgIcon("trash"), "Delete"),
      h("button", { class: "chip", onclick: () => done() }, "Done"),
    ),
  );
};

const siteSection = () =>
  h(
    "div",
    { class: "site-list" },
    h("button", { class: "site-head", "aria-expanded": String(!!S.siteListOpen), onclick: () => ((S.siteListOpen = !S.siteListOpen), render()) }, svgIcon(S.siteListOpen ? "down" : "right"), "On " + (siteFor()?.name || "the AI site")),
    S.siteListOpen
      ? [
          h("div", { class: "row" }, h("button", { class: "small", onclick: refreshSiteChats }, "Refresh the list")),
          S.siteChats.length
            ? S.siteChats.map((c) => h("button", { class: "site-chat", onclick: () => openSiteChat(c) }, (S.chats.some((x) => sameUrl(x.meta.source, c.url)) ? "✓ " : "↗ ") + c.title))
            : h("p", { class: "muted" }, "Tap Refresh to list the chats from the site's sidebar."),
          siteLinkRow(),
        ]
      : null,
  );

const renderDrawer = () => {
  const m = dModel();
  const searching = !!S.query.trim();
  const rows = [];
  if (searching) {
    const shown = S.chats.filter(matches);
    rows.push(...(shown.length ? shown.map((c) => chatRowFor(c, { drag: false })) : [h("div", { class: "empty-note" }, "No chats match.")]));
  } else {
    const pins = m.pinned.map((p) => S.chats.find((c) => c.path === p)).filter(Boolean);
    rows.push(
      h(
        "div",
        { class: "crow frow phead", "data-ck": "P" },
        h("button", { class: "cmain", "aria-expanded": String(S.pinOpen), onclick: () => ((S.pinOpen = !S.pinOpen), local("pinOpen", S.pinOpen), render()) },
          h("span", { class: "chev" }, svgIcon(S.pinOpen ? "down" : "right")), h("span", { class: "ct" }, "Pinned"), h("span", { class: "ccount" }, String(pins.length))),
      ),
    );
    if (S.pinOpen) {
      rows.push(...pins.map((c) => chatRowFor(c)));
      if (!pins.length) rows.push(h("div", { class: "empty-note" }, "Drag chats here to pin them."));
    }
    treeRows(m, "", 0, rows);
  }
  return h(
    "aside",
    { class: "drawer" + (S.selMode ? " selecting" : ""), role: "dialog", "aria-label": "Chats" },
    h(
      "div",
      { class: "drawer-head" },
      h("h2", {}, "Chats"),
      rbtn("check", S.selMode ? "Done selecting" : "Select chats", () => (S.selMode ? (endSelect(), render()) : beginSelect()), S.selMode ? "on" : ""),
      rbtn("close", "Close", closeDrawer),
    ),
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary grow", onclick: () => startNewChat(), title: "Ctrl+N" }, "+ New chat" + (S.folder ? " in " + dBase(S.folder) : "")),
      h("button", { "aria-label": "New folder", onclick: () => ((S.newFolderBox = !S.newFolderBox), render()) }, "+ Folder"),
    ),
    S.folder ? h("div", { class: "row muted" }, "New chats go to ", h("b", {}, S.folder), h("button", { class: "small", onclick: () => ((S.folder = ""), render()) }, "use top level")) : null,
    S.newFolderBox ? makeFolderBox() : null,
    h("input", {
      type: "search",
      "data-keep": "search",
      placeholder: "Search chats, #tag",
      value: S.query,
      oninput: (e) => ((S.query = e.target.value), render()),
      onkeydown: (e) => {
        if (e.key === "Enter") document.querySelector(".chat-list .cmain")?.click();
        if (e.key === "ArrowDown") (e.preventDefault(), document.querySelector(".chat-list button")?.focus());
      },
    }),
    tagFilter(),
    h("div", { class: "chat-list" }, rows, searching ? null : siteSection()),
    S.selMode ? selectBar(m) : null,
    h("button", { class: "settings-pill", "aria-label": "Settings", onclick: () => (closeDrawer(), openSettings()) }, svgIcon("settings"), "Settings"),
  );
};

const refreshSiteChats = async () => {
  try {
    const r = await siteCmd("list");
    S.siteChats = r.chats || [];
    if (!S.siteChats.length) toast("No chats found in the site's sidebar (open it once with Alt+S?)");
    render();
  } catch (e) {
    toast(e.message, "error");
  }
};
