"use strict";
// Chat screen: the message bar's "Quick edit and add" drawer, and the
// small parts other sheets share: a switch, and drag-to-reorder for a list.

// An on/off switch (a button, so it works with touch, keys and screen readers).
const toggleBtn = (on, label, onchange) =>
  h("button", { class: "tgl" + (on ? " on" : ""), role: "switch", "aria-checked": String(!!on), "aria-label": label, onclick: (e) => (e.stopPropagation(), onchange(!on)) });
// Move up / Move down, as in the wireframe.
const moveBtns = (i, n, move) =>
  h("div", { class: "mv" },
    h("button", { class: "act", "aria-label": "Move up", disabled: i === 0, onclick: (e) => (e.stopPropagation(), move(-1)) }, svgIcon("up")),
    h("button", { class: "act", "aria-label": "Move down", disabled: i >= n - 1, onclick: (e) => (e.stopPropagation(), move(1)) }, svgIcon("down")));

// Press a grip and move to reorder a list: a line shows where the item would land.
// `rows()` gives the row elements in order; onDrop(from, to) does the move.
const reorderDrag = (e, rows, from, onDrop) => {
  e.preventDefault();
  const grip = e.currentTarget;
  grip.setPointerCapture(e.pointerId);
  const els = rows();
  const rects = els.map((r) => r.getBoundingClientRect());
  const src = els[from];
  const y0 = e.clientY;
  src.classList.add("dragging");
  let to = from;
  const move = (ev) => {
    src.style.transform = `translateY(${ev.clientY - y0}px)`;
    els.forEach((r) => r.classList.remove("dt", "db"));
    to = ev.clientY < rects[0].top ? 0 : ev.clientY > rects[rects.length - 1].bottom ? els.length - 1 : rects.findIndex((r) => ev.clientY >= r.top && ev.clientY <= r.bottom);
    if (to < 0) to = from;
    if (to !== from) els[to].classList.add(to > from ? "db" : "dt");
  };
  const end = (apply) => {
    els.forEach((r) => r.classList.remove("dt", "db"));
    src.classList.remove("dragging");
    src.style.transform = "";
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", cancel);
    if (apply && to !== from) onDrop(from, to);
    else rerenderSheet();
  };
  const up = () => end(true);
  const cancel = () => end(false);
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", cancel);
};

// What a block is, in a few words. short: the Quick edit drawer's words.
const blockType = (b, short = false) => {
  if (b.type === "message") return short ? "Your text goes here" : "Your text goes here. Move it anywhere.";
  if (b.type === "prompt") return (short ? "System prompt" : "Adds text · System prompt") + (b.link ? " · linked" : "");
  const p = S.plugins.get(b.plugin);
  if (!p) return "Plugin not installed";
  if (short) return "Plugin";
  if (b.textId || typeof p.def?.text === "function") return "Adds text";
  return typeof p.def?.beforeSend === "function" ? "Changes text" : "Works on replies";
};

// Put text files in the message box, one after another.
const pickTextFiles = (many) => {
  const input = h("input", { type: "file", multiple: many, accept: "text/*,.md,.txt,.json,.csv" });
  input.onchange = async () => {
    const files = [...(input.files || [])];
    if (!files.length) return;
    if (files.some((f) => f.size > 2_000_000)) return toast("A file is over 2 MB; paste the part you need", "error");
    const texts = await Promise.all(files.map((f) => f.text()));
    closeSheet();
    setTimeout(() => fillComposer(texts.join("\n\n"), "append"), 50);
    toast(files.length === 1 ? `Added ${files[0].name} (${texts[0].length} characters)` : `Added ${files.length} files`);
  };
  input.click();
};

// A chat's own toggles are saved in its file; a new chat keeps them until its first message.
const saveToggles = (chat = S.chat) => chat.path && saveChat(chat, `toggles: ${chat.meta.title || "chat"}`).catch((e) => toast(e.message, "error"));

// The message bar's Quick edit: the active profile's blocks, toggled on or off for this chat
// (the profile's toggles are where a chat starts), reordered for the profile, and text files.
const openQuick = () => {
  openSheet(() => profileOf(S.chat).name, () => {
    const prof = profileOf(S.chat);
    const P = PP.profiles;
    const mine = forChat(prof, S.chat); // the same blocks, with this chat's toggles
    const own = Object.keys(P.chatToggles(S.chat)).length;
    const flip = (b, v) => (P.setChatToggle(S.chat, P.blockKey(b), v, b.on !== false), saveToggles(), rerenderSheet(), render());
    const blockEls = () => [...document.querySelectorAll("[data-qp]")];
    const blockItem = (b, i) => {
      const m = mine.blocks[i];
      const live = b.type === "message" || P.blockLive(mine, m);
      const g = b.group && (mine.groups || []).find((x) => x.id === b.group);
      return h(
        "div",
        { class: "it" + (live ? "" : " off"), "data-qp": i, "data-row": "plus." + P.blockName(b), "data-key": "qp:" + P.blockKey(b) },
        h("button", { class: "grip", "aria-label": "Drag to reorder", title: "Drag to reorder", onpointerdown: (e) => reorderDrag(e, blockEls, i, (from, to) => (P.moveBlockTo(prof, from, to), rerenderSheet())), onclick: (e) => e.stopPropagation() }, svgIcon("grip")),
        h("div", { class: "g" }, P.blockName(b), h("small", {}, blockType(b, true) + (g && g.on === false ? " · its group is off" : ""))),
        moveBtns(i, prof.blocks.length, (d) => (P.moveBlock(prof, i, d), rerenderSheet())),
        b.type === "message" ? null : toggleBtn(m.on !== false, P.blockName(b) + " on or off in this chat", (v) => flip(b, v)),
      );
    };
    const fileRow = (many) =>
      item({ icon: many ? "copy" : "quote", label: many ? "Several text files" : "Text file", sub: many ? "One after another, in the box" : "Put its text in the box", onclick: () => pickTextFiles(many) });
    return [
      profileDropdown({ id: "plus", current: prof, showEdit: false, sub: "This chat's profile · tap to switch", pick: (p) => (switchProfile(p.id), rerenderSheet()) }),
      h("div", { class: "sub2" }, "Toggles are this chat's own; a new chat starts with the profile's. Drag to reorder the profile."),
      ...prof.blocks.map(blockItem),
      own ? item({ id: "plus.reset", icon: "retry", label: "Use the profile's toggles", sub: (own === 1 ? "1 toggle differs" : own + " toggles differ") + " in this chat", onclick: () => (P.clearChatToggles(S.chat), saveToggles(), rerenderSheet(), render()) }) : null,
      h("div", { class: "lbl" }, "Add to your message"),
      fileRow(false),
      fileRow(true),
      ...[...S.plugins.values()].flatMap((p) => (p.def?.menu || []).filter((m) => m.plus).map((m) => item({ label: m.label, onclick: () => (closeSheet(), Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error"))) }))),
    ];
  }, { id: "quick", short: true, sub: "Quick edit · tap the name to rename", onTitle: () => renameProfile(profileOf(S.chat)).then(() => (rerenderSheet(), render())), head: () => h("button", { class: "pill", onclick: () => openProfileEditor(profileOf(S.chat).id) }, svgIcon("edit"), "Edit profile") });
};
