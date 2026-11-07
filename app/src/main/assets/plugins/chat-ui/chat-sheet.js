"use strict";
// App part (chat screen): the Chat sheet (tap the title, F2). Name, tags, and
// what you can do with this chat: copy, share, pin, move to a folder, sub-chats,
// history. Each action is one row; the longer ones open their own screen with a
// back row to here.

// One tappable row of a sheet: icon, label, a line under it, and a right side.
const sheetRow = ({ icon, label, sub, right, onclick, danger, cls = "" }) => {
  const row = item({ icon: null, label, sub, onclick, cls: (cls + (danger ? " danger" : "")).trim() });
  if (right) row.append(typeof right === "string" ? h("span", { class: "ch on" }, right) : h("span", { class: "ch" }, right));
  return row;
};
const backRow = (label, to) => h("button", { class: "ghost back", onclick: to }, "‹ " + label);

const subChatsAction = () => [...S.plugins.values()].flatMap((p) => p.def?.menu || []).find((m) => m.label === "Sub-chats");

const openChatSheet = () => {
  const c = S.chat;
  openSheet("Chat", () => {
    const input = h("input", { value: c.meta.title, "aria-label": "Chat name" });
    const save = async () => {
      const t = input.value.trim();
      if (!t || t === c.meta.title) return;
      c.meta.title = t;
      if (c.path) await saveChat(c, "rename: " + c.meta.title);
      render();
    };
    input.onkeydown = (e) => e.key === "Enter" && (e.preventDefault(), save());
    input.onblur = save;
    autofocus(input, true);
    const sub = subChatsAction();
    const where = c.path ? (dFolderOf(c.path) ? "In " + dFolderOf(c.path) : "Top level") : S.chat.folder ? "Will be saved in " + S.chat.folder : "Not saved yet";
    return [
      h("div", { class: "it rename" }, h("div", { class: "g" }, input, h("small", {}, "Rename"))),
      h(
        "div",
        { class: "tags-row in-sheet" },
        c.meta.tags.map((t) => tagChip(t, { onRemove: () => removeChatTag(c, t).then(rerenderSheet) })),
        tagInput("+ tag", (v) => addChatTag(c, v).then(rerenderSheet), "sheet-tag"),
        h("datalist", { id: "known-tags" }, knownTags().map((t) => h("option", { value: t }))),
      ),
      h("p", { class: "muted small-note" }, "Every message in this chat gets these tags. name# gives each new message the next number."),
      h("h3", {}, "Actions"),
      sheetRow({ icon: "copy", label: "Copy the whole chat", sub: "As Markdown", onclick: () => copyChat() }),
      sheetRow({ icon: "share", label: "Share or export…", onclick: () => shareChat() }),
      sheetRow({ icon: "pin", label: "Pin to top", sub: c.path ? (isPinned(c.path) ? "Pinned" : "Not pinned") : "Send a message first", onclick: () => (c.path ? (togglePin(c.path), rerenderSheet()) : toast("Send a message first")), right: c.path && isPinned(c.path) ? svgIcon("check") : null }),
      sheetRow({ icon: "folder", label: "Move to folder…", sub: where, onclick: openMoveSheet, right: svgIcon("right") }),
      sub ? sheetRow({ icon: "chat", label: "Sub-chats", onclick: () => Promise.resolve().then(() => sub.run()).catch((e) => toast(e.message, "error")), right: svgIcon("right") }) : null,
      h("h3", {}, "History"),
      sheetRow({ icon: "history", label: c.path ? "Saved " + ChatFile.stamp(c.meta.updated) + " · " + c.turns.length + (c.turns.length === 1 ? " message" : " messages") : "Not saved yet", sub: c.path, onclick: openHistorySheet, right: svgIcon("right") }),
      c.meta.source ? h("p", { class: "muted" }, "Linked site chat: ", h("a", { href: c.meta.source }, c.meta.source), c.meta.ai ? ` · ${c.meta.ai}` : "", c.meta.model ? ` · ${c.meta.model}` : "") : null,
    ];
  });
};

// Move this chat: the folders as a radio list (its folder is ticked).
const openMoveSheet = () => {
  const c = S.chat;
  openSheet("Move to folder", () => {
    const here = c.path ? dFolderOf(c.path) : c.folder || "";
    const choose = async (f) => {
      if (c.path) {
        if (await moveChats([c.path], f)) rerenderSheet();
      } else {
        c.folder = f; // an unsaved chat is saved there with its first message
        rerenderSheet();
      }
    };
    return [
      backRow("Chat", openChatSheet),
      sheetRow({ label: "Top level (no folder)", onclick: () => choose(""), right: here === "" ? svgIcon("check") : null }),
      ...dModel().folders.map((f) => sheetRow({ label: f, onclick: () => choose(f), right: here === f ? svgIcon("check") : null })),
      sheetRow({ icon: "plus", label: "New folder…", onclick: () => ((S.newFolderBox = true), closeSheet(), openDrawer()) }),
    ];
  });
};

const openHistorySheet = () => {
  const c = S.chat;
  openSheet("History", () => {
    const log = h("div", { class: "log muted" }, c.path ? "Loading…" : "Not saved yet.");
    if (c.path)
      api("/api/git/log?path=" + encodeURIComponent(c.path))
        .then((r) => log.replaceChildren(...(r.log.length ? r.log.map((x) => h("div", {}, h("code", {}, x.id), " ", ChatFile.stamp(new Date(x.time).toISOString()), " ", x.message)) : ["No commits yet."])))
        .catch((e) => (log.textContent = e.message));
    return [backRow("Chat", openChatSheet), h("p", { class: "muted" }, h("code", {}, c.path || "(saved after the first message)")), log];
  });
};
