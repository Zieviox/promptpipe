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
// The phone said no to a folder or file change in the chats folder: ask for the
// permission it needs (or point to the storage check). True when it was that.
const askStorageAccess = async (e) => {
  if (!/permission|denied/i.test((e && e.message) || "")) return false;
  if (!S.app.allFiles) {
    if (await askUser("The phone won't let PromptPipe change your chats folder. Allow all files access? Android opens its settings page: switch it on, come back, then restart the app.", { ok: "Allow" })) api("/api/app/action", { action: "grantFiles" });
  } else if (await askUser("The phone still refuses, even with all files access on. Run the storage check to see which step it refuses?", { ok: "Run the check" })) openStorageCheck();
  return true;
};

const applyPlan = async (plan, message) => {
  if (!plan) return false;
  if (plan.error) return toast(plan.error, "error"), false;
  try {
    const r = await api("/api/history/save", { moves: plan.moves, mkdir: plan.mkdir, files: plan.files, delete: plan.delete, message });
    if (r.gitError) toast("Not saved to git: " + r.gitError, "error");
  } catch (e) {
    if (!(await askStorageAccess(e))) toast("Couldn't do that: " + e.message, "error");
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
    if (S.selMode || e.target.closest(".pb, .grip")) return;
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
  const list = document.querySelector("#clist");
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

// ---------- rows (the wireframe's compact rows) ----------
const rbtn = (icon, label, onclick, extra = "") =>
  h("button", { class: "pb " + extra, "aria-label": label, title: label, onpointerdown: (e) => e.stopPropagation(), onclick: (e) => (e.stopPropagation(), onclick(e)) }, svgIcon(icon));
const gripBtn = (k) => h("button", { class: "grip", "aria-label": "Drag to move", title: "Drag to move", onpointerdown: (e) => (e.stopPropagation(), startDrag(e, k)), onclick: (e) => e.stopPropagation() }, svgIcon("grip"));
const checkBox = (on) => h("span", { class: "cb" + (on ? " on" : ""), "aria-hidden": "true" }, on ? svgIcon("check") : null);
// A row you tap (and reach with the keyboard).
const tapRow = (cls, k, onTap, kids, extra = {}) =>
  h("div", { class: cls, "data-ck": k, role: "button", tabindex: "0", onclick: onTap, onkeydown: (e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onTap()), ...extra }, kids);

// Whether a chat is being answered or has an answer you have not seen (parallel
// chats fill this in).
const chatStatus = (path) => (S.chatStatus && S.chatStatus[path]) || "";

const chatRowFor = (c, { depth = 0, drag = true, search = false } = {}) => {
  const k = cKey(c.path);
  const on = S.sel.has(k);
  const status = chatStatus(c.path);
  const row = tapRow(
    "cr" + (depth ? " ind" : "") + (S.chat.path === c.path ? " cur" : "") + (on ? " sel" : ""),
    k,
    () => (S.selMode ? toggleSel(k) : openChat(c.path).catch((e) => toast(e.message, "error"))),
    [
      S.selMode ? checkBox(on) : search && isPinned(c.path) ? h("span", { class: "ch" }, svgIcon("pin")) : null,
      h("span", { class: "ct" }, c.meta.title || dBase(c.path)),
      h("span", { class: "ctag" }, (c.meta.tags || []).filter((t) => !t.endsWith("#")).join(" ")),
      status ? h("span", { class: "cstat" + (status === "Reply ready" ? " on" : "") }, status) : null,
      S.selMode ? null : rbtn("pin", isPinned(c.path) ? "Unpin" : "Pin to top", () => togglePin(c.path), isPinned(c.path) ? "on" : ""),
      drag ? gripBtn(k) : null,
    ],
    depth > 1 ? { style: `margin-left:${depth * 16}px` } : {},
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
    { class: "search fpanel", style: "margin-left:16px" },
    input,
    h(
      "div",
      { class: "chips" },
      h("button", { class: "pill", onclick: rename }, "Rename"),
      h("button", { class: "pill", onclick: async () => {
        if (await askConfirm(`Delete the folder "${f}"? ${inside ? `Its ${inside} chat${inside === 1 ? "" : "s"} move${inside === 1 ? "s" : ""} to the top level.` : "It is empty."}`, "Delete folder")) {
          if (await applyPlan(planDeleteFolder(dModel(), f), `delete folder: ${f}`)) (S.fedit = null), render();
        }
      } }, svgIcon("trash"), "Delete"),
      h("button", { class: "pill", onclick: () => ((S.fedit = null), render()) }, "Cancel"),
    ),
  );
};

const folderRowFor = (m, f, depth) => {
  const k = fKey(f);
  const open = S.openFolders.has(f);
  const count = m.chats.filter((p) => under(p, f) && !m.pinned.includes(p)).length;
  const kids = S.chats.filter((c) => dFolderOf(c.path) === f && !isPinned(c.path)).map((c) => cKey(c.path));
  const all = kids.length && kids.every((x) => S.sel.has(x));
  const row = tapRow(
    "cr fr",
    k,
    () => {
      if (S.selMode) return toggleSel(k);
      open ? S.openFolders.delete(f) : S.openFolders.add(f);
      S.folder = f;
      local("openFolders", [...S.openFolders]);
      render();
    },
    [
      S.selMode ? checkBox(all) : h("span", { class: "ch" }, svgIcon(open ? "down" : "right")),
      h("span", { class: "ct" }, dBase(f)),
      h("span", { class: "ch" }, String(count)),
      S.selMode ? null : rbtn("edit", "Rename or delete folder " + dBase(f), () => ((S.fedit = S.fedit === f ? null : f), render())),
      gripBtn(k),
    ],
    { "aria-expanded": String(open), ...(depth ? { style: `margin-left:${depth * 16}px` } : {}) },
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
      if (out.length === n) out.push(h("div", { class: "sub2", style: `padding:2px 6px 2px ${(depth + 1) * 16 + 6}px` }, "Empty. Drag chats here."));
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

// Tag chips under the search, most used first: tap one to search for it.
const tagFilter = () => {
  const count = new Map();
  for (const c of S.chats) for (const t of c.meta.tags || []) if (!t.endsWith("#")) count.set(t, (count.get(t) || 0) + 1);
  if (!count.size) return null;
  const tags = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t]) => t).sort();
  return h("div", { class: "chips" }, tags.map((t) => h("button", { class: "pill" + (S.query.trim() === "#" + t ? " on" : ""), onclick: () => ((S.query = S.query.trim() === "#" + t ? "" : "#" + t), render()) }, "#" + t)));
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
      if (!(await askStorageAccess(e))) toast("Couldn't create the folder: " + e.message, "error");
    } finally {
      busy = false;
    }
  };
  input.onkeydown = (e) => e.key === "Enter" && go();
  setTimeout(() => input.focus(), 0);
  return h("div", { class: "search", style: "gap:6px" }, input, h("button", { class: "pill", onclick: go }, "Create"));
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
    h("div", { class: "sub2" }, `${n} selected. Drag one to move them all.`),
    S.selMove
      ? h("div", { class: "chips" },
          h("button", { class: "pill", onclick: () => moveChats(paths, "").then((ok) => ok && done("Moved to the top level")) }, "Top level"),
          folders.map((f) => h("button", { class: "pill", onclick: () => moveChats(paths, f).then((ok) => ok && done("Moved to " + f)) }, f)))
      : null,
    h(
      "div",
      { class: "chips" },
      h("button", { class: "pill", disabled: !n, onclick: () => (setPinned(paths, !allPinned), done()) }, svgIcon("pin"), allPinned ? "Unpin" : "Pin"),
      h("button", { class: "pill", disabled: !n, onclick: () => ((S.selMove = !S.selMove), render()) }, svgIcon("folder"), "Move…"),
      h("button", { class: "pill", disabled: !n, onclick: async () => {
        if (!(await askConfirm(`Delete ${n} chat${n === 1 ? "" : "s"}? They stay in git history.`))) return;
        await api("/api/history/save", { delete: paths, message: `delete: ${n} chats` }).catch((e) => toast(e.message, "error"));
        if (S.chat.path && paths.includes(S.chat.path)) S.chat = newChat();
        await loadTree();
        done(`Deleted ${n}`);
      } }, svgIcon("trash"), "Delete"),
      h("button", { class: "pill", onclick: () => done() }, "Done"),
    ),
  );
};

// The chats in the AI site's own sidebar, to open here (Find: "Open a chat from the site").
const openSiteChats = () =>
  openSheet("Chats on " + (siteFor()?.name || "the AI site"), () => [
    h("div", { class: "chips" }, h("button", { class: "pill", onclick: refreshSiteChats }, svgIcon("retry"), "Refresh the list")),
    ...(S.siteChats.length
      ? S.siteChats.map((c) => item({ label: c.title, sub: S.chats.some((x) => sameUrl(x.meta.source, c.url)) ? "Already here · opens it" : "Opens it here, linked to the site chat", onclick: () => (closeSheet(), openSiteChat(c)) }))
      : [h("p", { class: "sub2" }, "Tap Refresh to list the chats from the site's sidebar.")]),
    h("h3", {}, "Or paste a link"),
    siteLinkRow(),
  ]);

const renderDrawer = () => {
  const m = dModel();
  const searching = !!S.query.trim();
  const rows = [];
  if (searching) {
    const shown = S.chats.filter(matches);
    rows.push(...(shown.length ? shown.map((c) => chatRowFor(c, { drag: false, search: true })) : [h("div", { class: "sub2" }, "No chats match.")]));
  } else {
    const pins = m.pinned.map((p) => S.chats.find((c) => c.path === p)).filter(Boolean);
    rows.push(tapRow("cr fr", "P", () => ((S.pinOpen = !S.pinOpen), local("pinOpen", S.pinOpen), render()),
      [h("span", { class: "ch" }, svgIcon(S.pinOpen ? "down" : "right")), h("span", { class: "ct" }, "Pinned"), h("span", { class: "ch" }, String(pins.length)), h("span", { class: "ch" }, svgIcon("pin"))],
      { "aria-expanded": String(S.pinOpen) }));
    if (S.pinOpen) {
      rows.push(...pins.map((c) => chatRowFor(c)));
      if (!pins.length) rows.push(h("div", { class: "sub2", style: "padding:2px 6px 2px 22px" }, "Drag chats here to pin them."));
    }
    treeRows(m, "", 0, rows);
  }
  return h(
    "aside",
    { class: "drawer", role: "dialog", "aria-label": "Chats" },
    h("div", { class: "sh" },
      h("span", { class: "grow" }, "Chats"),
      h("button", { class: "ic", "aria-label": S.selMode ? "Done selecting" : "Select chats", style: S.selMode ? "color:var(--accent)" : null, onclick: () => (S.selMode ? (endSelect(), render()) : beginSelect()) }, svgIcon("check")),
      helpBtn(),
      h("button", { class: "ic", "aria-label": "Close", onclick: closeDrawer }, svgIcon("close"))),
    h("div", { style: "display:flex;gap:6px" },
      h("button", { class: "it newchat", onclick: () => startNewChat(), title: "Ctrl+N" }, "+ New chat" + (S.folder ? " in " + dBase(S.folder) : "")),
      h("button", { class: "it newfolder", "aria-label": "New folder", onclick: () => ((S.newFolderBox = !S.newFolderBox), render()) }, "+ Folder")),
    S.folder ? h("div", { class: "sub2" }, "New chats go to ", h("b", {}, S.folder), " · ", h("button", { style: "color:var(--accent)", onclick: () => ((S.folder = ""), render()) }, "use the top level")) : null,
    S.newFolderBox ? makeFolderBox() : null,
    h("label", { class: "search" }, h("span", { class: "ch" }, svgIcon("search")), h("input", {
      id: "cs",
      "data-keep": "search",
      placeholder: "Search chats, #tag",
      value: S.query,
      oninput: (e) => ((S.query = e.target.value), render()),
      onkeydown: (e) => {
        if (e.key === "Enter") document.querySelector("#clist .cr:not(.fr)")?.click();
        if (e.key === "ArrowDown") (e.preventDefault(), document.querySelector("#clist .cr")?.focus());
      },
    })),
    tagFilter(),
    h("div", { id: "clist" }, rows),
    h("div", { style: "flex:1" }),
    S.selMode ? selectBar(m) : null,
    h("div", { class: "tail" },
      h("button", { class: "it foot-pill", "aria-label": "Settings", onclick: () => (closeDrawer(), openSettings()) }, svgIcon("settings"), "Settings", updateCount() ? h("span", { class: "badge" }, String(updateCount())) : null),
      h("button", { class: "it foot-pill", "aria-label": "Quick start tutorial", title: "Quick start tutorial", onclick: () => (closeDrawer(), openQuickStartList()) }, svgIcon("play"), "Quick start")),
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
