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

// As in the wireframe: the name (tap to rename), the chat's tags, Actions, History.
const renameChat = async () => {
  const c = S.chat;
  const t = await askText("Rename the chat", c.meta.title, "Rename");
  if (!t || t === c.meta.title) return;
  c.meta.title = t;
  if (c.path) await saveChat(c, "rename: " + c.meta.title);
  render();
};
const addChatTagPrompt = async () => {
  const v = await askText("Tag for every message in this chat (name# numbers them)", "", "Add");
  if (v) addChatTag(S.chat, v).then(rerenderSheet).catch((e) => toast(e.message, "error"));
};
const radio = (on) => h("span", { class: "on" }, on ? "●" : "○");

const openChatSheet = () => {
  const c = S.chat;
  openSheet("Chat", () => {
    const sub = subChatsAction();
    const pinned = !!c.path && isPinned(c.path);
    const where = c.path ? (dFolderOf(c.path) ? "In " + dFolderOf(c.path) : "Top level") : c.folder ? "In " + c.folder : "Top level";
    return [
      item({ id: "chat.rename", label: c.meta.title || "New chat", sub: "Rename", onclick: renameChat }),
      h("div", { class: "chips" },
        c.meta.tags.map((t) => h("span", { class: "tag" + (counterOf(t) || t.endsWith("#") ? " counter" : "") }, "#" + t, h("button", { "aria-label": "Remove tag " + t, onclick: () => removeChatTag(c, t).then(rerenderSheet) }, "✕"))),
        h("button", { class: "tag", onclick: addChatTagPrompt }, "+ tag")),
      h("div", { class: "lbl" }, "Actions"),
      item({ id: "chat.copy", label: "Copy the whole chat", onclick: () => copyChat() }),
      item({ id: "chat.share", label: "Share or export…", onclick: () => shareChat() }),
      (() => {
        const row = item({ id: "chat.pin", label: "Pin to top", sub: pinned ? "Pinned" : "Not pinned", onclick: () => (c.path ? (togglePin(c.path), rerenderSheet()) : toast("Send a message first")) });
        row.append(radio(pinned));
        return row;
      })(),
      item({ id: "chat.move", label: "Move to folder…", sub: where, chev: true, onclick: openMoveSheet }),
      sub ? item({ id: "chat.sub", label: "Sub-chats", chev: true, onclick: () => Promise.resolve().then(() => sub.run()).catch((e) => toast(e.message, "error")) }) : null,
      h("div", { class: "lbl" }, "History"),
      item({ id: "chat.hist", label: c.path ? "Saved " + ChatFile.stamp(c.meta.updated).slice(11) + " · " + c.turns.length + (c.turns.length === 1 ? " message" : " messages") : "Not saved yet", chev: true, onclick: openHistorySheet }),
    ];
  });
};

// Move this chat: the folders as a radio list.
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
    const pick = (label, f) => {
      const row = item({ label, onclick: () => choose(f) });
      row.append(radio(here === f));
      return row;
    };
    return [
      pick("Top level (no folder)", ""),
      ...dModel().folders.map((f) => pick(f, f)),
      item({ label: "New folder…", onclick: () => ((S.newFolderBox = true), closeSheet(), openDrawer()) }),
    ];
  }, { back: openChatSheet });
};

// This chat's commits (read once when the screen opens).
const openHistorySheet = () => {
  const c = S.chat;
  if (c.path) loadGitLog(c.path);
  openSheet("History", () => (c.path ? gitLogRows() : [item({ label: "Not saved yet", sub: "Saved after the first message" })]), { back: openChatSheet, sub: c.path || "" });
};
