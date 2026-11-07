"use strict";
// App part (chat screen): the message bar's "Quick edit and add" drawer, and the
// small parts other sheets share: a switch, and drag-to-reorder for a list.

// An on/off switch (a button, so it works with touch, keys and screen readers).
const switchBtn = (on, label, onchange) =>
  h("button", { class: "sw" + (on ? " on" : ""), role: "switch", "aria-checked": String(!!on), "aria-label": label, onclick: (e) => (e.stopPropagation(), onchange(!on)) }, h("span", { class: "knob" }));

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

const plainKind = (r) => {
  if (r.type === "message") return "Your text goes here. Move it anywhere.";
  if (r.type === "piece") return "System prompt";
  const p = S.plugins.get(r.plugin);
  if (!p) return "Plugin not installed";
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

const openQuick = () => {
  const prof = profile();
  openSheet(prof.name, () => {
    const pre = presetOf(prof);
    const P = PP.pipeline;
    const rowEls = () => [...document.querySelectorAll(".quick-list .qrow")];
    const row = (r, i) => {
      const live = r.type === "message" || P.rowLive(pre, r);
      const g = r.group && (pre.groups || []).find((x) => x.id === r.group);
      return h(
        "div",
        { class: "qrow" + (live ? "" : " off") + (r.type === "message" ? " anchor" : "") },
        h("button", { class: "rbtn grip", "aria-label": "Drag to reorder", title: "Drag to reorder", onpointerdown: (e) => reorderDrag(e, rowEls, i, (from, to) => (P.moveRowTo(pre, from, to), rerenderSheet())), onclick: (e) => e.stopPropagation() }, svgIcon("grip")),
        h("span", { class: "grow qname" }, h("b", {}, rowName(r)), h("small", { class: "muted" }, plainKind(r) + (g && g.on === false ? " · its group is off" : ""))),
        h("span", { class: "mv" },
          rbtn("up", "Move up", () => (P.moveRow(pre, i, -1), rerenderSheet()), i === 0 ? "dis" : ""),
          rbtn("down", "Move down", () => (P.moveRow(pre, i, 1), rerenderSheet()), i === pre.rows.length - 1 ? "dis" : "")),
        r.type === "message" ? h("span", { class: "sw-gap" }) : switchBtn(r.on !== false, rowName(r) + " on or off", (v) => ((r.on = v), saveConfig(), rerenderSheet())),
      );
    };
    const fileRow = (many) =>
      sheetRow({ icon: many ? "copy" : "quote", label: many ? "Several text files" : "Text file", sub: many ? "One after another, in the box" : "Put its text in the box", onclick: () => pickTextFiles(many) });
    return [
      h("div", { class: "row quick-head" },
        h("span", { class: "grow muted" }, "Switch on or off, drag to reorder."),
        h("button", { class: "chip", onclick: () => openProfileEditor(prof.id) }, svgIcon("edit"), "Edit profile")),
      pre ? h("div", { class: "quick-list" }, pre.rows.map(row)) : h("p", { class: "muted" }, "This profile has no rows yet."),
      h("h3", {}, "Add to your message"),
      fileRow(false),
      fileRow(true),
      ...[...S.plugins.values()].flatMap((p) => (p.def?.menu || []).filter((m) => m.plus).map((m) => sheetRow({ label: m.label, onclick: () => (closeSheet(), Promise.resolve().then(() => m.run()).catch((e) => toast(e.message, "error"))) }))),
    ];
  }, { short: true });
};
