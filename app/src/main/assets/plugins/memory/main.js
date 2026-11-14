// Memory plugin: before each send, put pinned facts and the earlier chat in
// front of the message. Under the max everything goes in full. Over it, older
// messages go in as summaries, made in a separate chat on the site (PP.ask).
//
// Levels of detail (LOD): level 0 is the chat file itself. Level 1 summarises
// fixed parts of `chunk` messages (1-10, 11-20, ...), level 2 summarises
// `chunk` level-1 parts, and so on. Parts are fixed and only added at the end,
// so each summary is made once. Each level is a Markdown file in the chat's
// own folder: .memory/<chat path without .md>/lod1.md (the app hides it and
// moves or deletes it with the chat). The oldest messages go in at the
// coarsest level, the middle at finer ones, the recent ones word for word.
//
// Sub-chats: every message notes which site chat it went to (turn data), so a
// new site chat always gets the memory, AI lines can say which site answered,
// and "Only what this site chat hasn't seen" can leave out what it already has.
const ID = "memory";
const PROMPTS = "system-prompts.json";
const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

// ---------- pure: turns, sites, lines ----------
const pick = (o, keys) => {
  for (const k of keys) if (typeof o[k] === "string" && o[k].trim()) return o[k].trim();
  return "";
};
const parseUrl = (u) => {
  try {
    return new URL(u);
  } catch (e) {
    return null;
  }
};
const sameUrl = (a, b) => {
  const x = parseUrl(a), y = parseUrl(b);
  return !!x && !!y && x.host === y.host && x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "");
};
const siteName = (u) => {
  const s = ((parseUrl(u) || {}).host || "").replace(/^(www|chat|chatgpt)\./, "").split(".")[0];
  return s ? s[0].toUpperCase() + s.slice(1) : "";
};
// The site chat a message went to: our own note, else Sub-chats' note.
const urlOf = (t) => (t && t.data && ((t.data[ID] && t.data[ID].url) || (t.data["sub-chats"] && t.data["sub-chats"].url))) || "";

// Turn shapes differ between app versions, so try the likely field names.
const readTurn = (t) => {
  if (!t || typeof t !== "object" || t.pending) return null;
  const url = urlOf(t);
  const user = pick(t, ["you", "user", "prompt", "sent"]);
  const ai = pick(t, ["reply", "shown", "assistant", "ai", "answer", "raw"]);
  if (user || ai) return { user, ai, url };
  const text = pick(t, ["text", "content"]);
  if (!text) return null;
  return t.role === "user" ? { user: text, ai: "", url } : { user: "", ai: text, url };
};
const turnsOf = (ctx, text) => {
  const turns = ((ctx.chat && ctx.chat.turns) || []).map(readTurn).filter(Boolean);
  // The message being sent may already be in the list: leave it out.
  if (turns.length && turns[turns.length - 1].user === text.trim() && !turns[turns.length - 1].ai) turns.pop();
  return turns;
};
// More than one site in the chat: AI lines say which one.
const manySites = (turns) => new Set(turns.map((t) => (parseUrl(t.url) || {}).host).filter(Boolean)).size > 1;
const clipTo = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)).trimEnd() + "…" : s);
const lineOf = (turn, max, names) => {
  const parts = [];
  if (turn.user) parts.push("User: " + (max ? clipTo(turn.user, max) : turn.user));
  if (turn.ai) parts.push(((names && siteName(turn.url)) || "AI") + ": " + (max ? clipTo(turn.ai, max) : turn.ai));
  return parts.join("\n");
};
// Which messages this site chat already has. Messages without a note (chats
// from before 2.2) went to the chat's link.
const seenBy = (turns, url, source) => turns.map((t) => !!url && (t.url ? sameUrl(t.url, url) : sameUrl(source || "", url)));

// ---------- pure: LOD files ----------
// A summary item covers one part. It is either two summaries, `user` and `ai`,
// each made from only that side's messages (so the sides can't be mixed up),
// or `both`: one summary of the whole part (the "together" setting, or a file
// from before 2.5 where the sides couldn't be told apart). `text` is what is
// sent, with the side named in front of each summary.
const SIDE = { user: "The user's side", ai: "The AI's side" };
const textOf = (it) => it.both || ["user", "ai"].filter((k) => it[k]).map((k) => SIDE[k] + ":\n" + it[k]).join("\n\n");
const mkItem = (from, to, at, body) => {
  const it = { from, to, at: at || "", user: (body.user || "").trim(), ai: (body.ai || "").trim(), both: (body.both || "").trim() };
  it.text = textOf(it);
  return it;
};
// What the AI wrote must never pose as structure: marker comments and
// "### User" / "### AI" heading lines are dropped.
const clean = (t) =>
  String(t || "")
    .split("\n")
    .filter((l) => !/^\s*<!--.*-->\s*$/.test(l) && !/^\s*#{1,4}\s*(user|ai)\s*:?\s*$/i.test(l))
    .join("\n")
    .trim();
const SIDE_MARK = /^<!-- pp:side (user|ai) -->[ \t]*$/m;
// Summaries made before 2.3 are in two parts by headings, if the AI wrote them.
const sidesOf = (text) => {
  const t = String(text || "");
  const u = /^#{2,4}\s*User\s*:?\s*$/im.exec(t);
  const a = /^#{2,4}\s*AI\s*:?\s*$/im.exec(t);
  if (!u || !a) return null;
  const cut = (m, other) => t.slice(m.index + m[0].length, other.index > m.index ? other.index : t.length).trim();
  return { user: cut(u, a), ai: cut(a, u) };
};
const bodyFromMd = (body) => {
  const parts = body.split(new RegExp(SIDE_MARK.source, "m"));
  if (parts.length > 1) {
    const o = { user: "", ai: "" };
    for (let i = 1; i < parts.length; i += 2) o[parts[i]] = (parts[i + 1] || "").trim();
    return o;
  }
  return sidesOf(body) || { both: body };
};
const bodyToMd = (it) => (it.both ? it.both : `<!-- pp:side user -->\n${it.user}\n<!-- pp:side ai -->\n${it.ai}`);
const lodDir = (chat) => (chat && chat.path ? ".memory/" + chat.path.replace(/\.md$/, "") + "/" : "");
const lodPath = (chat, L) => lodDir(chat) + `lod${L}.md`;
const lodToMd = (title, L, size, items) =>
  [
    `# ${title || "Chat"} · memory level ${L}`,
    "",
    `Summaries of ${size} messages each, made by the Memory plugin. You can edit the text; keep the marker lines.`,
    "",
    ...items.flatMap((it) => [`<!-- pp:lod ${JSON.stringify({ from: it.from, to: it.to, at: it.at })} -->`, `## Messages ${it.from + 1}-${it.to}`, "", bodyToMd(it), ""]),
  ].join("\n");
const lodFromMd = (text) => {
  const parts = String(text || "").split(/^<!-- pp:lod (.*?) -->[ \t]*$/m);
  const items = [];
  for (let i = 1; i < parts.length; i += 2) {
    try {
      const info = JSON.parse(parts[i]);
      const body = (parts[i + 1] || "").replace(/^\s*##[^\n]*\n/, "").trim();
      if (body && Number.isInteger(info.from) && Number.isInteger(info.to)) items.push(mkItem(info.from, info.to, info.at, bodyFromMd(body)));
    } catch (e) {}
  }
  return items.sort((a, b) => a.from - b.from);
};
const itemAt = (store, L, from, to) => (store[L] || []).find((it) => it.from === from && it.to === to);

// The plan: which messages go in at which level. b[L] = messages below it are
// covered at level L or coarser. Raises level 1 first (oldest first), then
// level 2 over level 1, and so on, until it fits. Returns the first missing
// summary it needed (`missing`), so it can be made and the plan run again.
const plan = (sizes, upTo, K, store, budget, fixed) => {
  const maxL = Math.max(1, ...Object.keys(store).map(Number).filter((L) => (store[L] || []).length), 1) + 1;
  const b = Array(maxL + 2).fill(0);
  const cost = () => {
    let c = fixed;
    for (let L = maxL; L >= 1; L--) {
      for (let f = b[L + 1]; f < b[L]; f += K ** L) c += itemAt(store, L, f, f + K ** L).text.length + 2;
    }
    for (let i = b[1]; i < sizes.length; i++) c += sizes[i];
    return c;
  };
  let missing = null;
  let total = cost();
  while (total > budget) {
    let moved = false;
    for (let L = 1; L <= maxL && !moved; L++) {
      const size = K ** L;
      const from = b[L];
      const upper = L === 1 ? upTo : b[L - 1];
      if (from + size > upper) continue;
      if (itemAt(store, L, from, from + size)) {
        b[L] = from + size;
        moved = true;
      } else if (!missing) missing = { L, from, to: from + size };
    }
    if (!moved) break;
    total = cost();
  }
  return { b, maxL, total, fits: total <= budget, missing };
};

// ---------- files ----------
const readJson = async (path, fallback) => {
  try {
    const r = await PP.api("/api/history/file?path=" + encodeURIComponent(path));
    return r.text ? JSON.parse(r.text) : fallback;
  } catch (e) {
    return fallback;
  }
};
const stores = new Map(); // chat path -> { [level]: [{ from, to, at, text }] }
const loadStore = async (chat) => {
  const key = chat && chat.path;
  if (!key) return {};
  if (stores.has(key)) return stores.get(key);
  const store = {};
  for (let L = 1; L <= 8; L++) {
    let text = null;
    try {
      text = (await PP.api("/api/history/file?path=" + encodeURIComponent(lodPath(chat, L)))).text;
    } catch (e) {}
    if (!text) break;
    store[L] = lodFromMd(text);
  }
  stores.set(key, store);
  return store;
};
const saveLevel = (chat, store, L, K, message) =>
  PP.api("/api/history/save", { files: [{ path: lodPath(chat, L), text: lodToMd(chat.meta && chat.meta.title, L, K ** L, store[L] || []) }], message: "memory: " + message });

// ---------- making summaries ----------
const summaryStack = async (s) => {
  const lib = await readJson(PROMPTS, { prompts: [] });
  const ids = s.stackMode === "own" ? s.stack || [] : s.stackMode === "none" ? [] : (PP.settings ? PP.settings("system-prompt").stack : []) || [];
  return ids.map((id) => lib.prompts.find((p) => p.id === id)).filter(Boolean);
};
// Each side is summarised on its own, from a request that holds only that
// side's messages, so the AI can't take its own words for the user's (or the
// other way round). The request says so, too.
const SIDE_ASK = {
  user: "Below are only the user's messages. The AI's replies are not included: do not guess or add them. Summarise what the user said, did, decided and wants. Write nothing the user did not say.",
  ai: "Below are only the AI's messages. The user's messages are not included. Summarise what the AI said and did: its characters, the story and the facts it gave. Do not credit any of it to the user.",
};
const WHAT = { user: "The user's messages", ai: "The AI's messages" };
const summaryRequest = async (s, parts, ofSummaries, side) => {
  const stack = (await summaryStack(s)).map((p) => p.text.trim()).filter(Boolean);
  const out = [];
  if (stack.length) out.push("[System instructions]\n" + stack.join("\n\n") + "\n[End of system instructions]");
  out.push(s.summaryPrompt.trim());
  if (side) out.push(SIDE_ASK[side]);
  const what = side ? WHAT[side] : "Conversation";
  out.push(ofSummaries ? `[Summaries of consecutive parts${side ? ", " + SIDE[side].toLowerCase() : ""}, oldest first]\n` + parts.join("\n\n---\n\n") + "\n[End of summaries]" : `[${what}]\n` + parts.join("\n\n") + `\n[End of ${what.toLowerCase()}]`);
  return out.join("\n\n");
};
// One side of a turn, as a line.
const sideLine = (t, side, names) => (side === "user" ? (t.user ? "User: " + t.user : "") : t.ai ? ((names && siteName(t.url)) || "AI") + ": " + t.ai : "");
const ask = async (ctx, request) => {
  const r = await PP.ask(request, { profile: ctx.profile && ctx.profile.name, hooks: !!ctx.settings.summaryHooks });
  const text = clean(r.reply);
  if (!text) throw new Error("the summary came back empty");
  return text;
};
const makeItem = async (ctx, store, turns, names, m, K) => {
  const s = ctx.settings;
  if (!PP.ask) throw new Error("this app version has no PP.ask (update the app)");
  // A part above level 1 is made from the level below it.
  const subs = m.L > 1 ? Array.from({ length: K }, (_, k) => itemAt(store, m.L - 1, m.from + k * K ** (m.L - 1), m.from + (k + 1) * K ** (m.L - 1))) : null;
  const mine = subs ? null : turns.slice(m.from, m.to);
  let body;
  // One summary of both sides: asked for, or the parts below can't be split.
  if (s.sides === "together" || (subs && subs.some((x) => x.both))) {
    body = { both: await ask(ctx, await summaryRequest(s, subs ? subs.map((x) => x.text) : mine.map((t) => lineOf(t, 0, names)), !!subs)) };
  } else {
    body = {};
    for (const side of ["user", "ai"]) {
      const parts = subs ? subs.map((x) => x[side]).filter(Boolean) : mine.map((t) => sideLine(t, side, names)).filter(Boolean);
      body[side] = parts.length ? await ask(ctx, await summaryRequest(s, parts, !!subs, side)) : "";
    }
  }
  store[m.L] = [...(store[m.L] || []).filter((it) => it.from !== m.from), mkItem(m.from, m.to, new Date().toISOString(), body)].sort((a, b) => a.from - b.from);
  await saveLevel(ctx.chat, store, m.L, K, `level ${m.L}, messages ${m.from + 1}-${m.to} (${(ctx.chat.meta && ctx.chat.meta.title) || ctx.chat.path})`);
};
// Make the summaries the plan is missing, one at a time, at most `limit`.
// One job per chat at a time; a second caller gets `false` and goes on without.
const busy = new Set();
const fill = async (ctx, turns, names, upTo, budget, fixed, sizes, limit) => {
  const key = ctx.chat && ctx.chat.path;
  if (!key || busy.has(key)) return false;
  busy.add(key);
  try {
    const K = Math.max(2, Math.round(num(ctx.settings.chunk, 10)));
    const store = await loadStore(ctx.chat);
    let made = 0;
    while (made < limit) {
      const p = plan(sizes, upTo, K, store, budget, fixed);
      if (p.fits || !p.missing) break;
      await makeItem(ctx, store, turns, names, p.missing, K);
      made++;
    }
    return made;
  } finally {
    busy.delete(key);
  }
};

// ---------- building the memory block ----------
const wrapMemory = (body) => "[Memory: context from earlier in this conversation. Use it, don't repeat it back.]\n\n" + body + "\n\n[End of memory]";
const block = (pinned, summaries, lines, note) => {
  if (!pinned && !summaries.length && !lines.length) return null;
  const out = [];
  if (pinned) out.push("Facts to remember:\n" + pinned);
  if (summaries.length) out.push("Summary of the earlier conversation, oldest first (each part says whose side it tells, the user's or the AI's):\n" + summaries.map((x) => x.text).join("\n\n"));
  if (lines.length) out.push((summaries.length ? "More recent messages" : "Earlier messages") + (note || "") + ":\n" + lines.join("\n\n"));
  return wrapMemory(out.join("\n\n"));
};
// The same memory as separate pieces (pinned facts, your side, the AI's side,
// recent messages). A summary of both sides in one ("together", or from before
// 2.5) goes with the first of the two, under a label that says so.
const PIECES = {
  pinned: "Pinned facts",
  you: "Your side (summaries)",
  ai: "AI side (summaries)",
  recent: "Recent messages",
};
// A piece on its own: "[Title]\n...\n[End of name]".
const labelled = (title, name, body) => `[${title}]\n${body}\n[End of ${name}]`;
const pieceOf = (m, part) => {
  if (part === "pinned") return m.pinned ? labelled("Facts to remember", "facts", m.pinned) : "";
  if (part === "recent") return m.lines.length ? labelled((m.summaries.length ? "More recent messages" : "Earlier messages") + (m.linesNote || ""), "messages", m.lines.join("\n\n")) : "";
  // Summaries that could not be split (together, or made before 2.5) say so
  // and go first, being the oldest; they never pose as one side.
  const both = m.summaries.filter((x) => x.both).map((x) => x.both);
  const one = m.summaries.filter((x) => !x.both).map((x) => x[part === "you" ? "user" : "ai"]).filter(Boolean);
  const out = [];
  if (both.length && part === "you") out.push(labelled("Earlier in this conversation, both sides together (summaries, oldest first)", "both sides", both.join("\n\n")));
  if (one.length) out.push(labelled(part === "you" ? "Earlier in this conversation, the user's side (summaries, oldest first)" : "Earlier in this conversation, the AI's side (summaries, oldest first)", part === "you" ? "the user's side" : "the AI's side", one.join("\n\n")));
  return out.join("\n\n");
};
const result = (pinned, summaries, lines, linesNote, note) => ({ text: block(pinned, summaries, lines, linesNote), pinned, summaries, lines, linesNote: linesNote || "", note });
// The pipeline's "at depth N" pieces: each goes N messages up from the end of
// the recent messages (0 = after the last one). Marks them used.
const withDepth = (m, depth) => {
  if (!depth || !depth.length || !m.lines.length) return m;
  const lines = [...m.lines];
  for (const d of [...depth].sort((a, b) => a.n - b.n)) lines.splice(Math.max(0, lines.length - d.n), 0, d.text);
  depth.used = true;
  return { ...m, lines, text: block(m.pinned, m.summaries, lines, m.linesNote) };
};

// Clip mode (and the fallback): older turns clipped, oldest dropped. `lines`
// are { turn, keep } in order; `recent` from the end stay in full.
const clipped = (items, s, budget, used0) => {
  const recent = Math.max(0, num(s.recent, 6));
  const clip = Math.max(20, num(s.clip, 200));
  let used = used0;
  const lines = [];
  let dropped = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const line = items.length - 1 - i >= recent ? lineOf(items[i].turn, clip, items[i].names) : items[i].line;
    if (used + line.length + 2 > budget) {
      dropped = i + 1;
      break;
    }
    used += line.length + 2;
    lines.unshift(line);
  }
  return { lines, dropped };
};

const WAIT = 2; // summaries made while a send waits; the rest in the background

const build = async (text, ctx) => {
  const s = ctx.settings;
  const turns = turnsOf(ctx, text);
  const names = s.names !== false && manySites(turns);
  const budget = Math.max(200, num(s.budget, 50000));
  const pinned = (s.pinned || "").trim();
  const seen = s.send === "unseen" ? seenBy(turns, ctx.url, ctx.chat && ctx.chat.meta && ctx.chat.meta.source) : turns.map(() => false);
  const lines = turns.map((t) => lineOf(t, 0, names));
  // A line the site chat already has costs nothing and isn't sent.
  const sizes = lines.map((l, i) => (seen[i] ? 0 : l.length + 2));
  const left = seen.filter(Boolean).length;
  const skipNote = left ? `, ${left} this site chat already has left out` : "";
  const raw = (from) => turns.map((t, i) => ({ turn: t, names, line: lines[i], i })).filter((x) => x.i >= from && !seen[x.i]);
  const fixed = pinned.length;
  const total = fixed + sizes.reduce((a, b) => a + b, 0);
  // Under the max nothing is cut or summarised.
  if (total <= budget) return result(pinned, [], raw(0).map((x) => x.line), "", `${turns.length - left} messages in full, ${total} chars${skipNote}`);

  const recent = Math.min(turns.length, Math.max(0, num(s.recent, 6)));
  const upTo = turns.length - recent;
  const K = Math.max(2, Math.round(num(s.chunk, 10)));
  if (s.overflow === "summary" && upTo >= K && ctx.chat && ctx.chat.path) {
    let note = "";
    try {
      const made = await fill(ctx, turns, names, upTo, budget, fixed, sizes, WAIT);
      if (made) note = `; made ${made} summar${made === 1 ? "y" : "ies"} now`;
    } catch (e) {
      note = `; a summary failed (${e.message})`;
    }
    const store = await loadStore(ctx.chat);
    const p = plan(sizes, upTo, K, store, budget, fixed);
    if (!p.fits && p.missing && !busy.has(ctx.chat.path)) {
      // The rest in the background, so this send doesn't wait any longer.
      setTimeout(() => fill(ctx, turns, names, upTo, budget, fixed, sizes, Infinity).then((n) => n && PP.toast(`Memory: ${n} more summaries ready`)).catch((e) => PP.toast("Memory: summary failed: " + e.message, "error")), 0);
      note += "; making the rest in the background";
    }
    const summaries = [];
    const used = [];
    for (let L = p.maxL; L >= 1; L--) {
      let n = 0;
      for (let f = p.b[L + 1]; f < p.b[L]; f += K ** L) summaries.push(itemAt(store, L, f, f + K ** L)), n++;
      if (n) used.push(`${n} at level ${L}`);
    }
    const c = clipped(raw(p.b[1]), s, budget, fixed + summaries.reduce((a, x) => a + x.text.length + 2, 0));
    return result(pinned, summaries, c.lines, c.dropped ? ` (${c.dropped} left out to fit)` : "", `messages 1-${p.b[1]} as summaries (${used.join(", ") || "none yet"}), ${c.lines.length} in full${skipNote}${note}`);
  }
  const c = clipped(raw(0), s, budget, fixed);
  return result(pinned, [], c.lines, c.dropped ? ` (${c.dropped} oldest left out)` : "", `over the max: older messages clipped${c.dropped ? `, ${c.dropped} dropped` : ""}${skipNote}`);
};

// ---------- summarising ahead ----------
// When the chat is within `ahead` average-sized messages of the max, make the
// missing summaries in the background after a reply, so they're ready in time.
const ahead = (ctx) => {
  const s = ctx.settings;
  const n = Math.max(0, num(s.ahead, 6));
  const key = ctx.chat && ctx.chat.path;
  if (!n || s.overflow !== "summary" || !key || busy.has(key)) return;
  const turns = turnsOf(ctx, "");
  if (!turns.length) return;
  const names = s.names !== false && manySites(turns);
  const budget = Math.max(200, num(s.budget, 50000));
  const sizes = turns.map((t) => lineOf(t, 0, names).length + 2);
  const fixed = (s.pinned || "").trim().length;
  const total = fixed + sizes.reduce((a, b) => a + b, 0);
  const last = sizes.slice(-10);
  const avg = last.reduce((a, b) => a + b, 0) / last.length;
  if (total + n * avg <= budget) return;
  const recent = Math.min(turns.length, Math.max(0, num(s.recent, 6)));
  const upTo = turns.length - recent;
  const K = Math.max(2, Math.round(num(s.chunk, 10)));
  if (upTo < K) return;
  ctx.note(`about ${Math.max(0, Math.floor((budget - total) / avg))} messages from the max; summarising ahead`);
  // Aim for the room `ahead` more messages will need.
  setTimeout(() => {
    fill(ctx, turns, names, upTo, Math.max(200, budget - n * avg), fixed, sizes, Infinity)
      .then((made) => made && PP.toast(`Memory: ${made} summar${made === 1 ? "y" : "ies"} ready`))
      .catch((e) => PP.toast("Memory: summary failed: " + e.message, "error"));
  }, 0);
};

// ---------- sheet: the summaries' prompts, this chat's summaries ----------
const openSheet = (ctx) => {
  const h = PP.h;
  let lib = { prompts: [] };
  let store = null;
  readJson(PROMPTS, { prompts: [] }).then((l) => ((lib = l), PP.render()));
  const chat = PP.chat;
  if (chat && chat.path) loadStore(chat).then((st) => ((store = st), PP.render()));
  const s = () => ctx.settings;
  const set = (k, v) => (ctx.set(k, v), (ctx.settings[k] = v), PP.render());
  const nameOf = (p) => p.name || p.text.trim().split("\n")[0].slice(0, 40);
  const forget = async () => {
    const paths = Object.keys(store || {}).map((L) => lodPath(chat, L));
    await PP.api("/api/history/save", { files: paths.map((path) => ({ path, text: "" })), message: "memory: forgot the summaries" });
    stores.delete(chat.path);
    store = {};
    PP.render();
  };
  const view = (L) => PP.sheet(`Memory level ${L}`, () => (store[L] || []).map((it) => h("div", {}, h("p", { class: "muted" }, `Messages ${it.from + 1}-${it.to}`), h("div", { class: "sp-text" }, it.text))));
  PP.sheet("Memory", () => {
    const mode = s().stackMode || "same";
    const own = (s().stack || []).filter((id) => lib.prompts.some((p) => p.id === id));
    const same = (PP.settings ? PP.settings("system-prompt").stack : []) || [];
    const levels = Object.keys(store || {}).map(Number).filter((L) => store[L].length).sort();
    const move = (i, d) => {
      const a = [...own];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      set("stack", a);
    };
    return [
      h("h3", {}, "This chat's summaries"),
      !chat || !chat.path
        ? h("p", { class: "muted" }, "None yet: summaries are kept once the chat is saved.")
        : levels.length
          ? h("div", {},
              ...levels.map((L) =>
                h("div", { class: "sp-row" },
                  h("span", { class: "sp-name grow" }, `Level ${L}: ${store[L].length} part${store[L].length === 1 ? "" : "s"} (messages 1-${store[L].at(-1).to})`),
                  h("button", { class: "small", onclick: () => view(L) }, "View"))),
              h("p", { class: "faint" }, "Files: " + lodDir(chat) + "lod1.md …"),
              h("div", { class: "row" }, h("button", { class: "small danger", onclick: forget }, "Forget them (made again when needed)")))
          : h("p", { class: "muted" }, "None yet. They're made when this chat's memory gets near the max."),
      h("h3", {}, "System prompts for the summary chat"),
      h("div", { class: "row" },
        ...[["same", "Same as System prompt"], ["own", "Own stack"], ["none", "None"]].map(([v, label]) =>
          h("button", { class: "small" + (mode === v ? " primary" : ""), onclick: () => set("stackMode", v) }, label))),
      mode === "same"
        ? h("p", { class: "muted" }, same.length ? "Uses: " + same.map((id) => lib.prompts.find((p) => p.id === id)).filter(Boolean).map(nameOf).join(" → ") : "The System prompt stack is empty for this profile.")
        : null,
      mode === "own"
        ? h("div", {},
            own.length ? null : h("p", { class: "muted" }, "Nothing stacked yet. Tap Use below."),
            ...own.map((id, i) => {
              const p = lib.prompts.find((x) => x.id === id);
              return h("div", { class: "sp-row" },
                h("span", { class: "sp-num" }, String(i + 1)),
                h("span", { class: "sp-name grow" }, nameOf(p)),
                h("button", { class: "small", "aria-label": "Move up", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
                h("button", { class: "small", "aria-label": "Move down", disabled: i === own.length - 1, onclick: () => move(i, 1) }, "↓"),
                h("button", { class: "small", onclick: () => set("stack", own.filter((x) => x !== id)) }, "Remove"));
            }),
            h("p", { class: "faint" }, "From your prompt library (System prompt › ☰):"),
            ...lib.prompts.filter((p) => !own.includes(p.id)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map((p) =>
              h("div", { class: "sp-row" }, h("span", { class: "sp-name grow" }, (p.pinned ? "📌 " : "") + nameOf(p)), h("button", { class: "small primary", onclick: () => set("stack", [...own, p.id]) }, "Use"))))
        : null,
      h("p", { class: "muted" }, "The summary request, the max, the part size and the recent messages are under the ⚙. Summaries run in their own chat on a free site page: with plugins inside a send, that needs Settings › Sites › Max replies at once at 2 or more (otherwise memory clips instead and says so in the trace)."),
      h("div", { class: "row" }, h("button", { class: "small", onclick: openGuide }, "Guide")),
    ];
  });
};
const openGuide = async () => {
  let text = "";
  try {
    text = await (await fetch("/plugins/memory/GUIDE.md")).text();
  } catch (e) {
    text = "The guide couldn't be loaded.";
  }
  PP.sheet("Memory guide", () => [PP.h("div", { class: "md", html: PP.md(text) })]);
};

// One memory per message, however many of its pieces the pipeline has
// (keyed by the message's notes list, which every piece of it shares).
const memo = new WeakMap();
// Sub-chats branched from a reply: that sub-chat sees the chat up to the reply and
// its own messages, so Memory works on that view of the chat. The view has its own
// folder of summaries (their positions differ from the whole chat's).
const branched = (ctx) => {
  const v = PP.subChats && PP.subChats.visible && ctx.chat && PP.subChats.visible(ctx.chat);
  if (!v) return ctx;
  const chat = ctx.chat;
  return { ...ctx, chat: { ...chat, turns: (chat.turns || []).filter(v.keep), path: chat.path ? chat.path.replace(/\.md$/, "") + "/" + v.key + ".md" : chat.path } };
};
const prepared = (ctx0) => {
  const key = ctx0.notes || ctx0.turn;
  if (key && memo.has(key)) return memo.get(key);
  const run = (async () => {
    const ctx = branched(ctx0);
    const text = ctx.message || "";
    const every = Math.max(1, Math.round(num(ctx.settings.every, 1)));
    const turns = turnsOf(ctx, text);
    const count = turns.length;
    // A site chat that has none of this chat yet (a new chat, a new sub-chat)
    // always gets the memory.
    const fresh = count > 0 && !seenBy(turns, ctx.url, ctx.chat && ctx.chat.meta && ctx.chat.meta.source).some(Boolean);
    if (!ctx.firstMessage && !fresh && count % every !== 0) {
      ctx.note("skipped (every " + every + ")");
      return null;
    }
    const m = await build(text, ctx);
    if (!m.text) {
      ctx.note("nothing to send");
      return null;
    }
    ctx.note(m.note + (fresh && count ? " (new site chat)" : ""));
    return withDepth(m, ctx.depth);
  })();
  if (key) memo.set(key, run);
  return run;
};

PP.plugin({
  afterReply(text, ctx) {
    // Note which site chat this message went to (for Sub-chats and "unseen").
    if (ctx.setTurnData && ctx.url) ctx.setTurnData({ url: ctx.url });
    // ctx.chat still holds this turn as pending; summarise what's already settled.
    try {
      ahead(branched(ctx));
    } catch (e) {}
    return text;
  },
  // In a pipeline, Memory is a piece: its text goes where its row is
  // (ctx.message is your message). Elsewhere it goes in front of the message.
  async piece(ctx) {
    const m = await prepared(ctx);
    return m ? m.text || "" : "";
  },
  // Or in parts, each its own row (Pipeline › Add plugin piece).
  pieces: Object.fromEntries(Object.entries(PIECES).map(([part, name]) => [part, { name, text: async (ctx) => {
    const m = await prepared(ctx);
    return m ? pieceOf(m, part) : "";
  } }])),
  async beforeSend(text, ctx) {
    const m = await this.piece({ ...ctx, message: text });
    return m ? m + "\n\n" + text : text;
  },
  renderBlock(ctx) {
    const el = ctx.pill();
    if (ctx.set) el.insertBefore(PP.h("button", { class: "pill-gear", title: "Summary prompts and this chat's summaries", "aria-label": "Memory summaries", onclick: () => openSheet(ctx) }, "☰"), el.lastChild);
    return el;
  },
});

// For tests and other plugins: the pure parts.
PP.memory = { plan, lodToMd, lodFromMd, lodPath, seenBy, lineOf, manySites, siteName, sidesOf, pieceOf, mkItem, clean, sideLine, summaryRequest };
