"use strict";
// App part (chat screen): the ? button and help mode. Tap ?, then tap anything: a card says
// what it does, with "Do it" to use it. A mouse also gets a small ? on whatever it hovers.

const helpOn = () => S.config.helpButton !== false;
const helpBtn = () =>
  helpOn()
    ? h("button", { class: "icon hq" + (S.help ? " on" : ""), "aria-label": "Help: explain things", "aria-pressed": String(!!S.help), title: "Help: tap, then tap anything", onclick: () => ((S.help = !S.help), (S.helpCard = null), render()) }, svgIcon("help"))
    : null;

const HELP_TEXT = {
  "chats": "Your chat list. Folders, pins and search live here.",
  "find": "Search your chats and every setting. It shows where each one lives and lights it up.",
  "quick edit and add": "Switch your profile's rows on or off, reorder them, or put a text file in your message.",
  "message": "Type your message here.",
  "send": "Sends your message, with your profile's rows added, to the site.",
  "stop": "Stops waiting for the reply.",
  "bigger message box": "Makes the box taller for long messages. Ctrl+E.",
  "smaller message box": "Makes the box small again. Ctrl+E.",
  "close (esc)": "Closes this screen.",
  "chat title": "Tap for rename, tags, pin, copy, export, folders and history.",
  "show actions": "Shows Copy, Quote, Send again, Select text and the tags for this reply.",
  "hide actions": "Folds the actions away.",
  "copy": "Copies the reply.",
  "quote": "Puts the reply in your message box as a quote.",
  "send again": "Sends your message again for a new reply.",
  "select text": "Opens the text so you can select a part of it.",
  "copy your message": "Copies what you wrote.",
  "edit and send again": "Puts your message back in the box so you can change it and send it again.",
  "drag to reorder": "Hold and drag to move this row. The arrows next to it do the same.",
  "move up": "Moves this row up. It is sent earlier.",
  "move down": "Moves this row down. It is sent later.",
};
const helpFor = (el) => {
  const row = el.closest("[data-row]");
  const label = el.getAttribute("aria-label") || el.getAttribute("title") || (el.classList.contains("title") ? "Chat title" : "") || el.textContent.trim().slice(0, 40);
  const key = label.toLowerCase().replace(/^help: .*/, "");
  const sub = (row || el).querySelector?.(".g small, small")?.textContent || "";
  const name = row?.querySelector(".g")?.firstChild?.textContent || label || "This";
  return { name, body: HELP_TEXT[key] || sub || "Tap it normally to use it. Its screen explains the options.", el };
};
const helpLayer = () => {
  const c = S.helpCard;
  const done = () => ((S.help = false), (S.helpCard = null), render());
  return h("div", { class: "layer helpl" },
    S.help ? h("div", { class: "helpbar" }, h("span", {}, "Help mode. Tap anything to see what it does."), h("span", { class: "row" }, h("button", { class: "chip", onclick: () => (done(), openQuickStart()) }, "Quick start"), h("button", { class: "chip", onclick: done }, "Done"))) : null,
    c ? h("section", { class: "sheet short helpcard", role: "dialog", "aria-label": "Help: " + c.name },
      h("div", { class: "row sheet-head" }, h("h2", {}, c.name)),
      h("div", { class: "sheet-body" }, h("p", {}, c.body),
        h("div", { class: "chips" },
          h("button", { class: "chip current", onclick: () => ((S.helpCard = null), render()) }, "Got it"),
          h("button", { class: "chip", onclick: () => { const el = c.el; S.help = false; S.helpCard = null; render(); (el.isConnected ? el : document.querySelector(`[aria-label="${el.getAttribute("aria-label")}"]`))?.click(); } }, "Do it")))) : null);
};
const HELP_SEL = "button, [role=button], .it, [data-row], input, textarea, .title, .cr";
// While help mode is on, a tap explains instead of acting.
document.addEventListener("pointerdown", (e) => { if (S.help && !e.target.closest(".helpl, .hq")) e.stopPropagation(); }, true);
document.addEventListener("click", (e) => {
  if (!S.help || e.target.closest(".helpl, .hq")) return;
  const el = e.target.closest(HELP_SEL);
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  S.helpCard = helpFor(el);
  render();
}, true);
// A mouse: a small ? on whatever it points at.
{
  const hb = h("button", { class: "hoverq", "aria-label": "What is this?", title: "What is this?", hidden: true }, "?");
  document.body.append(hb);
  let el = null, timer = 0;
  const hide = () => (clearTimeout(timer), (timer = setTimeout(() => (hb.hidden = true), 180)));
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || S.help || S.helpCard || !helpOn()) return;
    const t = e.target.closest?.(HELP_SEL);
    if (!t || t.closest(".helpl, .hq, .helpcard") || t === hb) return;
    clearTimeout(timer);
    el = t;
    const r = t.getBoundingClientRect();
    hb.style.left = Math.min(r.right - 12, innerWidth - 24) + "px";
    hb.style.top = Math.max(r.top - 8, 2) + "px";
    hb.hidden = false;
  });
  document.addEventListener("pointerout", (e) => e.pointerType === "mouse" && hide());
  hb.addEventListener("pointerenter", () => clearTimeout(timer));
  hb.addEventListener("pointerleave", hide);
  hb.addEventListener("click", (e) => { e.stopPropagation(); if (el?.isConnected) { S.helpCard = helpFor(el); hb.hidden = true; render(); } });
}
