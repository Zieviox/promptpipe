// Sub-chats: several site chats inside one promptpipe chat.
// A sub-chat (segment) is a run of messages that went to one site chat. Each
// message keeps { seg, url, profile, active } in its turn data, so the chat
// file alone says which sub-chat it belongs to. Everything is worked out from
// chat.turns by the pure functions below; the hooks only read and write that.
//
//   route       picks the site chat: a new one, an older one, or the current one.
//               The other profile only lends its site and model (plugins: "active"),
//               so the plugins of the profile picked at the top keep running.
//   afterReply  saves which sub-chat the message ended up in
//   renderTurn  draws the dividers and the "next message" note
const ID = "sub-chats";

// ---------- pure helpers ----------
const parse = (u) => {
  try {
    return new URL(u);
  } catch (e) {
    return null;
  }
};
const sameUrl = (a, b) => {
  const x = parse(a), y = parse(b);
  return !!x && !!y && x.host === y.host && x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "");
};
// "https://chat.qwen.ai/c/1" -> "qwen"
const siteLabel = (u) => ((parse(u) || {}).host || "").replace(/^(www|chat|chatgpt)\./, "").split(".")[0] || "site";
const dataOf = (t) => (t && t.data && t.data[ID]) || null;
const settled = (chat) => ((chat && chat.turns) || []).filter((t) => !t.pending);

// The sub-chat number of every settled message. A message without our data
// (older chats, or sent from a profile where Sub-chats is off) stays in the
// sub-chat of the message before it.
const segIndex = (turns) => {
  let cur = 0;
  return turns.map((t) => (dataOf(t) ? (cur = dataOf(t).seg) : cur));
};

// [{ seg, from, to, count, url, profile, at }] in order of first message.
const segments = (chat) => {
  const turns = settled(chat);
  const idx = segIndex(turns);
  const out = [];
  turns.forEach((t, i) => {
    const d = dataOf(t) || {};
    let s = out.find((x) => x.seg === idx[i]);
    if (!s) out.push((s = { seg: idx[i], from: i, to: i + 1, count: 0, url: "", profile: "", at: t.at }));
    s.to = i + 1;
    s.count++;
    if (d.url) s.url = d.url;
    s.profile = d.profile || t.profile || s.profile;
  });
  // A chat from before Sub-chats: its one site chat is the chat's link.
  if (out.length === 1 && !out[0].url) out[0].url = (chat.meta && chat.meta.source) || "";
  return out;
};
const nextSeg = (segs) => segs.reduce((m, s) => Math.max(m, s.seg + 1), 0);
const numberOf = (segs, seg) => segs.findIndex((s) => s.seg === seg) + 1;

// ---------- state (per open chat, not saved) ----------
const want = new WeakMap(); // chat -> { mode: "new", profile } | { mode: "go", seg }
const sending = new WeakMap(); // chat -> what route decided for the message on its way

const profiles = async () => {
  try {
    const c = await PP.api("/api/config");
    return (c.profiles || []).map((p) => p.name);
  } catch (e) {
    return PP.profile ? [PP.profile.name] : [];
  }
};

const startNew = (chat, profile) => {
  want.set(chat, { mode: "new", profile });
  PP.toast(`Next message starts a sub-chat on ${profile}`);
  PP.render();
};
const goTo = (chat, seg) => {
  const segs = segments(chat);
  want.set(chat, { mode: "go", seg });
  PP.toast(`Next message goes to sub-chat ${numberOf(segs, seg)}`);
  PP.render();
};
const cancel = (chat) => (want.delete(chat), PP.render());
const openGuide = async () => {
  let text = "";
  try {
    text = await (await fetch("/plugins/sub-chats/GUIDE.md")).text();
  } catch (e) {
    text = "The guide couldn't be loaded.";
  }
  PP.sheet("Sub-chats guide", () => [PP.h("div", { class: "md", html: PP.md(text) })]);
};
const openLink = (url) => PP.api("/api/app/action", { action: "openUrl", url }).catch((e) => PP.toast(e.message, "error"));

// ---------- sheet ----------
const openSheet = (chat) => {
  if (!chat) return PP.toast("Open a chat first");
  const h = PP.h;
  let names = [];
  profiles().then((n) => ((names = n), PP.render()));
  PP.sheet("Sub-chats", () => {
    const segs = segments(chat);
    const w = want.get(chat);
    const last = segIndex(settled(chat)).at(-1);
    return [
      h("h3", {}, "New sub-chat here"),
      h("p", { class: "muted" }, "Your next message opens a fresh chat on the profile you pick. Memory sends it what came before."),
      h("div", { class: "row" },
        ...(names.length ? names : ["…"]).map((n) =>
          h("button", { class: "small" + (w && w.mode === "new" && w.profile === n ? " primary" : ""), onclick: () => startNew(chat, n) }, n))),
      w ? h("div", { class: "row" }, h("span", { class: "muted grow" }, w.mode === "new" ? `Next message: new sub-chat on ${w.profile}` : `Next message: back to sub-chat ${numberOf(segs, w.seg)}`), h("button", { class: "small", onclick: () => cancel(chat) }, "Cancel")) : null,
      h("h3", {}, "Sub-chats in this chat"),
      segs.length
        ? h("div", {}, ...segs.map((s, k) =>
            h("div", { class: "sp-row" },
              h("span", { class: "sp-num" }, String(k + 1)),
              h("span", { class: "sp-name grow" }, `${siteLabel(s.url)} · ${s.profile || "?"} · ${s.count} message${s.count === 1 ? "" : "s"}${s.seg === last ? " · now" : ""}`),
              s.url ? h("button", { class: "small", onclick: () => openLink(s.url) }, "Open") : null,
              s.seg !== last && s.url ? h("button", { class: "small primary", onclick: () => goTo(chat, s.seg) }, "Continue there") : null)))
        : h("p", { class: "muted" }, "None yet: the first message makes sub-chat 1."),
      h("div", { class: "row" }, h("button", { class: "small", onclick: openGuide }, "Guide")),
    ];
  });
};

// ---------- hooks ----------
PP.plugin({
  route(ctx) {
    const chat = ctx.chat;
    const active = ctx.profile.name;
    const segs = segments(chat);
    const w = want.get(chat);
    if (w && w.mode === "new") {
      sending.set(chat, { active, mode: "new" });
      return { profile: w.profile || active, url: "new", plugins: "active" };
    }
    const go = w && w.mode === "go" && segs.find((s) => s.seg === w.seg && s.url);
    if (go) {
      sending.set(chat, { active, mode: "go" });
      return { profile: go.profile || active, url: go.url, plugins: "active" };
    }
    sending.set(chat, { active });
    // Stay in the current sub-chat (with its profile) until you pick another
    // profile yourself; then the app's default applies: same site, same site
    // chat; another site, a fresh one (which becomes a new sub-chat).
    const turns = settled(chat);
    const d = dataOf(turns.at(-1));
    if (!d || d.active !== active) return null;
    const cur = segs.find((s) => s.seg === d.seg);
    if (!cur || !cur.url) return null;
    if (cur.profile === active && sameUrl(cur.url, (chat.meta && chat.meta.source) || "")) return null; // already there
    return { profile: cur.profile || active, url: cur.url, plugins: "active" };
  },

  afterReply(text, ctx) {
    const chat = ctx.chat;
    if (!chat || !ctx.turn) return text;
    const st = sending.get(chat) || {};
    sending.delete(chat);
    const segs = segments({ ...chat, turns: settled(chat).filter((t) => t !== ctx.turn) });
    let seg;
    if (st.mode === "new") seg = nextSeg(segs);
    else if (!segs.length) seg = 0;
    else {
      const hit = segs.find((s) => s.url && sameUrl(s.url, ctx.url));
      seg = hit ? hit.seg : nextSeg(segs); // a site chat we haven't had: the app started fresh
    }
    if (st.mode) want.delete(chat);
    // ctx.siteProfile: the profile the site and model came from (app 0.6.1+);
    // ctx.profile: the one whose plugins ran (the profile picked at the top).
    const site = ctx.siteProfile || ctx.profile;
    ctx.setTurnData({ seg, url: ctx.url || "", profile: site.name, active: st.active || ctx.profile.name });
    if (segs.length && !segs.some((s) => s.seg === seg)) ctx.note(`sub-chat ${segs.length + 1} started (${siteLabel(ctx.url)})`);
    return text;
  },

  renderTurn(turn, i, ctx) {
    const chat = ctx.chat;
    const turns = settled(chat);
    const k = turns.indexOf(turn);
    if (k < 0) return null;
    const idx = segIndex(turns);
    const segs = segments(chat);
    const h = ctx.h;
    const out = { before: [], after: [] };
    if (segs.length > 1 && (k === 0 || idx[k] !== idx[k - 1])) {
      const s = segs.find((x) => x.seg === idx[k]);
      out.before.push(
        h("button", { class: "ghost", style: "display:block;width:100%;text-align:center;opacity:.75;font-size:.85em;margin:.6em 0;border-top:1px solid var(--hair);border-radius:0;padding-top:.5em", title: "Sub-chats", onclick: () => openSheet(chat) },
          `Sub-chat ${numberOf(segs, s.seg)} · ${siteLabel(s.url)} · ${s.profile || ""}`));
    }
    const w = want.get(chat);
    if (w && k === turns.length - 1) {
      out.after.push(
        h("div", { class: "row", style: "justify-content:center;opacity:.8;font-size:.85em;margin:.4em 0" },
          h("span", { class: "muted" }, w.mode === "new" ? `Next message: new sub-chat on ${w.profile}` : `Next message: back to sub-chat ${numberOf(segs, w.seg)}`),
          h("button", { class: "small", onclick: () => cancel(chat) }, "Cancel")));
    }
    return out;
  },

  // Under every reply and in the ⋯ menu, so it's one tap on the phone.
  messageActions: [{ label: "New sub-chat here", run: (raw, ctx) => (openSheet(ctx.chat), ctx.turn.reply) }],
  menu: [{ label: "Sub-chats", run: () => openSheet(PP.chat) }],

  renderBlock(ctx) {
    const el = ctx.pill();
    el.insertBefore(PP.h("button", { class: "pill-gear", title: "Sub-chats of this chat", "aria-label": "Sub-chats", onclick: () => openSheet(PP.chat) }, "☰"), el.lastChild);
    return el;
  },
});

// For other plugins (Memory reads the turn data directly; this is a convenience).
PP.subChats = { segments, segIndex, siteLabel, sameUrl };
