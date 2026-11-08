// Reply Guard: keeps the longest version of each reply.
//
// While the site writes, the app shows the reply so far (the "writing… N chars"
// line). This plugin saves the longest of those versions for each message. When
// the reply is done it compares: if the page's final reply is empty, clearly
// shorter (the page reloaded, the reply got cut off or re-rendered), or is the
// previous reply again (the wrong message was read), the longer version is kept
// as the final reply, and the page's version stays one tap away.
//
// Every version is also kept in a small store on the phone (⋯ → Reply Guard), so
// the reply of a send that failed halfway, or of a chat the site lost (not logged
// in, page reloaded), can still be copied or added to the chat.
//
//   PP.on("site")  saves what the page shows while it writes
//   afterReply     keeps the longer version when the final one is shorter
//   renderTurn     says so under the message, with a button to switch
//   messageActions Lock / unlock this reply
//   menu           Reply Guard: the saved replies
const ID = "reply-guard";
const STORE = "reply-guard"; // localStorage "pp:reply-guard"

// State that outlives a plugin reload (Reload plugins runs this file again).
const G = (window.__ppReplyGuard = window.__ppReplyGuard || { caps: new Map(), booted: false, timer: 0, saveTimer: 0 });

// ---------- pure helpers ----------
// The text without Markdown marks and extra spaces, to compare a reply read as
// Markdown (the final one) with one read as plain text (the one seen while writing).
const plain = (s) =>
  String(s || "")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const size = (s) => plain(s).length;
const n = (x) => Number(x).toLocaleString();
const dataOf = (t) => (t && t.data && t.data[ID]) || null;
const firstLine = (s, max = 80) => {
  const l = String(s || "").trim().split("\n")[0];
  return l.length > max ? l.slice(0, max - 1) + "…" : l;
};
const ago = (at) => {
  const s = Math.round((Date.now() - Date.parse(at)) / 1000);
  if (!(s >= 0)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return new Date(at).toLocaleDateString();
};

// ---------- the store (on this phone) ----------
const readStore = () => {
  try {
    const v = JSON.parse(localStorage.getItem("pp:" + STORE));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
};
const writeStore = (list) => {
  // Too big for the browser's storage: drop the oldest until it fits.
  for (let k = list.length; k >= 0; k--) {
    try {
      localStorage.setItem("pp:" + STORE, JSON.stringify(list.slice(0, k)));
      return;
    } catch (e) {}
  }
};
const keepCount = () => Math.max(5, Math.round(+PP.settings(ID)?.keep || 40));
// Put a capture's latest state in the store (newest first).
const storeCap = (cap) => {
  const list = readStore().filter((e) => e.id !== cap.id);
  list.unshift({
    id: cap.id,
    at: cap.at,
    title: cap.chat?.meta?.title || "",
    path: cap.chat?.path || "",
    you: cap.you || "",
    text: cap.best,
    thinking: cap.thinking || "",
    chars: cap.bestLen,
    status: cap.status,
  });
  writeStore(list.slice(0, keepCount()));
};
// Saving on every "writing…" update would be a lot; once a second is plenty.
const storeSoon = (cap) => {
  cap.dirty = true;
  if (G.saveTimer) return;
  G.saveTimer = setTimeout(() => {
    G.saveTimer = 0;
    for (const c of G.caps.values()) if (c.dirty) (c.dirty = false), storeCap(c);
  }, 1000);
};

// ---------- watching the page while it writes ----------
const capFor = (turn, page) => {
  let cap = G.caps.get(turn);
  if (!cap) {
    const chat = S.chat?.turns.includes(turn) ? S.chat : null;
    cap = { id: "rg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), turn, chat, page, at: turn.at || iso(), you: turn.you, best: "", bestLen: 0, thinking: "", status: "writing" };
    G.caps.set(turn, cap);
  }
  if (!cap.chat) cap.chat = S.chat?.turns.includes(turn) ? S.chat : null;
  return cap;
};
const onSite = (ev) => {
  if (ev.event !== "progress" || !ev.live) return;
  const page = ev.page || 0;
  const turn = S.pageTurns?.[page];
  if (!turn) return; // a side request (PP.ask), not a message of a chat
  const cap = capFor(turn, page);
  const { reply, thinking } = ev.live;
  if (reply) {
    const len = size(reply);
    // The longest version wins; a reply that shrinks while writing doesn't replace it.
    if (len >= cap.bestLen) (cap.best = reply), (cap.bestLen = len), storeSoon(cap);
  }
  if (thinking && thinking.length >= (cap.thinking || "").length) (cap.thinking = thinking), storeSoon(cap);
};

// A message that is no longer on its way: done (no longer pending), or failed
// (still pending, but its page has let go of it: runChat moved it to the
// chat's failed list).
const isOn = () => {
  try {
    return typeof stepOn === "function" ? stepOn(ID, forChat(profile(), S.chat)) : true;
  } catch (e) {
    return true;
  }
};
const sweep = () => {
  for (const [turn, cap] of G.caps) {
    const onPage = Object.values(S.pageTurns || {}).includes(turn);
    if (onPage) continue;
    if (turn.pending) {
      if (cap.bestLen === 0) {
        G.caps.delete(turn);
        continue;
      }
      cap.status = "failed";
      storeCap(cap);
      if (isOn()) PP.toast(`Reply Guard kept ${n(cap.bestLen)} characters of a reply that didn't finish. ⋯ → Reply Guard`, "error");
    } else if (cap.status === "writing") {
      cap.status = "done";
      if (cap.bestLen > 0) storeCap(cap);
    }
    G.caps.delete(turn);
  }
};

// ---------- after the reply ----------
const prevTurn = (chat, turn) => {
  const turns = (chat?.turns || []).filter((t) => !t.pending || t === turn);
  const k = turns.indexOf(turn);
  return k > 0 ? turns[k - 1] : null;
};

const afterReply = (text, ctx) => {
  const turn = ctx.turn;
  if (!turn) return text;
  const s = ctx.settings;
  const cap = G.caps.get(turn);
  const live = cap?.best || "";
  const L = cap?.bestLen || 0;
  const pageRaw = turn.raw || "";
  const P = size(pageRaw);
  // Thinking the page no longer shows: keep what was seen.
  if (!turn.thinking && cap?.thinking) {
    turn.thinking = cap.thinking;
    ctx.note("thinking kept from while the site was writing");
  }
  const minChars = Math.max(0, +s.minChars || 0);
  const ratio = Math.min(100, Math.max(1, +s.ratio || 90)) / 100;
  const short = L > 0 && (P === 0 || (L - P >= minChars && P < L * ratio));
  const prev = prevTurn(ctx.chat, turn);
  const same = !!s.sameAsBefore && !!prev && P > 0 && plain(prev.raw) === plain(pageRaw) && (turn.you || "") !== (prev.you || "");
  const liveDiffers = L > 0 && plain(live) !== plain(prev?.raw);
  const mark = (status) => cap && ((cap.status = status), storeCap(cap));

  if (short || (same && liveDiffers)) {
    const reason = short ? (P === 0 ? "empty" : "short") : "same";
    const why = reason === "empty" ? "the page's reply was empty" : reason === "short" ? `the page's reply had ${n(P)} characters, ${n(L)} were seen while it was writing` : "the page handed back the previous reply";
    if (s.mode === "ask") {
      ctx.setTurnData({ ...(dataOf(turn) || {}), reason, kept: "page", other: live, pageChars: P, liveChars: L });
      ctx.note(`${why}; the longer version is one tap away under the message`);
      mark("offered");
      return text;
    }
    ctx.setTurnData({ ...(dataOf(turn) || {}), reason, kept: "live", other: pageRaw, pageChars: P, liveChars: L });
    ctx.note(`${why}; kept the version seen while it was writing`);
    mark("kept");
    // The steps before this one worked on the page's version: start again from the kept one.
    turn.raw = live;
    return live;
  }
  if (same) {
    ctx.setTurnData({ ...(dataOf(turn) || {}), reason: "same", kept: "page", pageChars: P, liveChars: 0 });
    ctx.note("this reply is the same as the one before (the site may have handed back the old answer)");
    mark("same");
    return text;
  }
  if (P === 0 && L === 0) ctx.note("the reply was empty, and nothing was seen while the site was writing");
  return text;
};

// ---------- under the message ----------
const chatOfTurn = (turn) => (S.chat?.turns.includes(turn) ? S.chat : null);
const save = (chat, what) => chat?.path && typeof saveChat === "function" && saveChat(chat, `Reply Guard: ${what}: ${chat.meta.title}`).catch((e) => PP.toast(e.message, "error"));

// Switch between the page's version and the longer one seen while writing.
const swap = (turn) => {
  const d = dataOf(turn);
  if (!d || d.other == null) return;
  const was = turn.raw;
  turn.raw = d.other;
  turn.reply = d.other;
  d.other = was;
  d.kept = d.kept === "live" ? "page" : "live";
  delete turn.error;
  render();
  save(chatOfTurn(turn), d.kept === "live" ? "kept the longer version" : "back to the page's version");
};
const lockToggle = (turn) => {
  const d = (turn.data = turn.data || {})[ID] || (turn.data[ID] = {});
  if (d.locked != null) delete d.locked;
  else d.locked = turn.reply;
  PP.toast(d.locked != null ? "Locked: nothing shorter will replace this reply" : "Unlocked");
  return turn.reply;
};

const renderTurn = (turn, i, ctx) => {
  const d = ctx.turnData;
  if (!d || turn.pending) return null;
  const h = ctx.h;
  const after = [];
  // A locked reply that something replaced with less: put it back.
  if (d.locked != null && size(turn.reply) < size(d.locked)) {
    turn.reply = d.locked;
    setTimeout(() => (render(), save(ctx.chat, "kept the locked reply")), 0);
  }
  const bar = (msg, ...buttons) => h("div", { class: "row", style: "align-items:center;gap:.5em;flex-wrap:wrap;opacity:.85;font-size:.85em;margin:.3em 0" }, h("span", { class: "muted" }, "🛡 " + msg), ...buttons);
  const btn = (label, fn) => h("button", { class: "small", onclick: fn }, label);
  if (d.reason && d.other != null) {
    if (d.kept === "live") {
      const pageSaid = d.reason === "same" ? "the page gave the previous reply again" : d.pageChars ? `the page gave ${n(d.pageChars)}` : "the page gave nothing";
      after.push(bar(`Kept the version seen while the site was writing (${n(d.liveChars)} characters); ${pageSaid}.`, btn("Use the page's version", () => swap(turn))));
    } else {
      after.push(bar(`A longer version (${n(d.liveChars)} characters) was seen while the site was writing.`, btn("Use the longer version", () => swap(turn))));
    }
  } else if (d.reason === "same") {
    after.push(bar("Same as the reply before: the site may have handed back the old answer. Look at the site, or ⋯ → Add the page's newest reply."));
  }
  if (d.locked != null) after.push(bar("Locked.", btn("Unlock", () => (lockToggle(turn), render(), save(ctx.chat, "unlocked")))));
  return after.length ? { after } : null;
};

// ---------- the saved replies ----------
const STATUS = { writing: "on its way", done: "finished", kept: "kept (page gave less)", offered: "longer version offered", same: "same as before", failed: "didn't finish", interrupted: "app closed while writing" };
const addToChat = async (e) => {
  const chat = S.chat;
  if (!chat) return PP.toast("Open a chat first", "error");
  chat.turns.push({ at: e.at || iso(), you: e.you || "(not saved)", sent: e.you || "", raw: e.text, reply: e.text, ...(e.thinking ? { thinking: e.thinking } : {}), profile: profile().name, tags: [], notes: ["added by Reply Guard"], data: {} });
  // It no longer needs to wait in the failed list.
  if (chat.failed) chat.failed = chat.failed.filter((f) => !(f.you === e.you && f.at === e.at));
  if (!chat.meta.title || chat.meta.title === "New chat") chat.meta.title = firstLine(e.you || e.title || "Saved reply", 60);
  render();
  try {
    await saveChat(chat, `Reply Guard: added a saved reply: ${chat.meta.title}`);
    PP.toast("Added to " + chat.meta.title);
  } catch (err) {
    PP.toast(err.message, "error");
  }
};
const removeEntry = (id) => (writeStore(readStore().filter((e) => e.id !== id)), PP.render());
const openStore = () => {
  let open = null;
  PP.sheet("Reply Guard", () => {
    const list = readStore();
    if (!list.length) return [PP.h("p", { class: "muted" }, "Nothing saved yet. Replies are saved here while the site writes them.")];
    return [
      PP.h("p", { class: "muted" }, "The longest version of each recent reply, saved on this phone while the site wrote it. Newest first."),
      ...list.map((e) =>
        PP.h("div", { style: "border-top:1px solid var(--hair);padding:.6em 0" },
          PP.h("div", { style: "font-size:.85em", class: e.status === "failed" || e.status === "interrupted" ? "" : "muted" },
            `${e.title || "Chat"} · ${ago(e.at)} · ${n(e.chars || 0)} characters · ${STATUS[e.status] || e.status}`),
          e.you ? PP.h("div", { style: "font-weight:600;margin:.2em 0" }, firstLine(e.you)) : null,
          open === e.id
            ? PP.h("div", { class: "md", style: "max-height:40vh;overflow:auto;border:1px solid var(--hair);border-radius:var(--r1, 6px);padding:.5em;margin:.3em 0", html: PP.md(e.text || "") })
            : PP.h("div", { class: "muted", style: "margin:.2em 0" }, firstLine(e.text, 140) || "(empty)"),
          PP.h("div", { class: "row", style: "gap:.4em;flex-wrap:wrap" },
            PP.h("button", { class: "small", onclick: () => ((open = open === e.id ? null : e.id), PP.render()) }, open === e.id ? "Hide" : "Show"),
            PP.h("button", { class: "small", onclick: () => PP.copy(e.text || "") }, "Copy"),
            PP.h("button", { class: "small", onclick: () => addToChat(e) }, "Add to the open chat"),
            PP.h("button", { class: "small", onclick: () => removeEntry(e.id) }, "Delete")))),
      PP.h("div", { class: "row", style: "margin-top:.8em;gap:.4em" },
        PP.h("button", { onclick: async () => (await PP.confirm("Delete every saved reply on this phone? Your chats are not touched.")) && (writeStore([]), PP.render()) }, "Delete all"),
        PP.h("button", { onclick: openGuide }, "Guide")),
    ];
  });
};
const openGuide = async () => {
  let text = "Loading…";
  PP.sheet("Reply Guard guide", () => [PP.h("div", { class: "md", html: PP.md(text) })]);
  try {
    const r = await fetch("/plugins/" + ID + "/GUIDE.md");
    text = r.ok ? await r.text() : "No guide found.";
  } catch (e) {
    text = "No guide found.";
  }
  PP.render();
};

// ---------- start ----------
// A reply that was on its way when the app closed can't finish now.
if (!G.booted) {
  G.booted = true;
  const list = readStore();
  if (list.some((e) => e.status === "writing")) writeStore(list.map((e) => (e.status === "writing" ? { ...e, status: "interrupted" } : e)));
}
clearInterval(G.timer);
G.timer = setInterval(sweep, 2000);
PP.on("site", onSite);

PP.plugin({
  afterReply,
  renderTurn,
  messageActions: [{ label: "Lock / unlock this reply", run: (raw, ctx) => lockToggle(ctx.turn) }],
  menu: [{ label: "Reply Guard: saved replies", run: openStore }],
});
