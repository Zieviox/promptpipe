"use strict";
// App part (chat screen): the message bar's "Quick edit and add" drawer, and the
// small parts other sheets share: a switch, and drag-to-reorder for a list.

// An on/off switch (a button, so it works with touch, keys and screen readers).
const switchBtn = (on, label, onchange) =>
  h("button", { class: "sw" + (on ? " on" : ""), role: "switch", "aria-checked": String(!!on), "aria-label": label, onclick: (e) => (e.stopPropagation(), onchange(!on)) });
// Move up / Move down, as in the wireframe.
const moveBtns = (i, n, move) =>
  h("div", { class: "mv" },
    h("button", { class: "act", "aria-label": "Move up", disabled: i === 0, onclick: (e) => (e.stopPropagation(), move(-1)) }, svgIcon("up")),
    h("button", { class: "act", "aria-label": "Move down", disabled: i >= n - 1, onclick: (e) => (e.stopPropagation(), move(1)) }, svgIcon("down")));

// Press a grip and move to reorder a list: a line shows where the row would land.
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

// What a row is, in a few words. short: the Quick edit drawer's words.
const plainKind = (r, short = false) => {
  if (r.type === "message") return short ? "Your text goes here" : "Your text goes here. Move it anywhere.";
  if (r.type === "piece") return short ? "System prompt" : "Adds text · system prompt";
  const p = S.plugins.get(r.plugin);
  if (!p) return "Plugin not installed";
  if (short) return "Message plugin";
  if (r.part || typeof p.def?.piece === "function") return "Adds text";
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

// A chat's own switches are saved in its file; a new chat keeps them until its first message.
const saveSwitches = (chat = S.chat) => chat.path && saveChat(chat, `switches: ${chat.meta.title || "chat"}`).catch((e) => toast(e.message, "error"));

// The message bar's Quick edit: the active profile's rows, switched on or off for this chat
// (the profile's switches are where a chat starts), reordered for the profile, and text files.
const openQuick = () => {
  openSheet(() => profileOf(S.chat).name, () => {
    const prof = profileOf(S.chat);
    const pre = presetOf(prof);
    const P = PP.pipeline;
    const mine = forChat(prof, S.chat).pipe; // the same rows, with this chat's switches
    const own = Object.keys(P.chatSwitches(S.chat)).length;
    const flip = (r, i, v) => (P.setChatSwitch(S.chat, P.rowKey(r), v, r.on !== false), saveSwitches(), rerenderSheet(), render());
    const rowEls = () => [...document.querySelectorAll("[data-qp]")];
    const row = (r, i) => {
      const m = mine.rows[i];
      const live = r.type === "message" || P.rowLive(mine, m);
      const g = r.group && (mine.groups || []).find((x) => x.id === r.group);
      return h(
        "div",
        { class: "it" + (live ? "" : " off"), "data-qp": i, "data-row": "plus." + rowName(r) },
        h("button", { class: "grip", "aria-label": "Drag to reorder", title: "Drag to reorder", onpointerdown: (e) => reorderDrag(e, rowEls, i, (from, to) => (P.moveRowTo(pre, from, to), rerenderSheet())), onclick: (e) => e.stopPropagation() }, svgIcon("grip")),
        h("div", { class: "g" }, rowName(r).replace(/^System prompt: /, ""), h("small", {}, plainKind(r, true) + (g && g.on === false ? " · its group is off" : ""))),
        moveBtns(i, pre.rows.length, (d) => (P.moveRow(pre, i, d), rerenderSheet())),
        r.type === "message" ? null : switchBtn(m.on !== false, rowName(r) + " on or off in this chat", (v) => flip(r, i, v)),
      );
    };
    const fileRow = (many) =>
      item({ icon: many ? "copy" : "quote", label: many ? "Several text files" : "Text file", sub: many ? "One after another, in the box" : "Put its text in the box", onclick: () => pickTextFiles(many) });
    return [
      profileDropdown({ id: "plus", current: prof, showEdit: false, sub: "This chat's profile · tap to switch", pick: (p) => (switchProfile(p.id), rerenderSheet()) }),
      h("div", { class: "sub2" }, "Switches are this chat's own; a new chat starts with the profile's. Drag to reorder the profile."),
      ...(pre ? pre.rows.map(row) : [h("p", { class: "sub2" }, "This profile has no rows yet.")]),
      own ? item({ id: "plus.reset", icon: "retry", label: "Use the profile's switches", sub: (own === 1 ? "1 switch differs" : own + " switches differ") + " in this chat", onclick: () => (P.clearChatSwitches(S.chat), saveSwitches(), rerenderSheet(), render()) }) : null,
      h("div", { class: "lbl" }, "Add to your message"),
      fileRow(false),
      fileRow(true),
      ...[...S.plugins.values()].flatMap((p) => (p.def?.menu || []).filter((m) => m.plus).map((m) => item({ label: m.label, onclick: () => (closeSheet(), Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error"))) }))),
    ];
  }, { id: "quick", short: true, sub: "Quick edit · tap the name to rename", onTitle: () => renameProfile(profileOf(S.chat)).then(() => (rerenderSheet(), render())), head: () => h("button", { class: "pill", onclick: () => openProfileEditor(profileOf(S.chat).id) }, svgIcon("edit"), "Edit profile") });
};
