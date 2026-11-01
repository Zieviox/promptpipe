// Memory plugin: before each send, put pinned facts and the earlier chat in
// front of the message. Under the max everything goes in full. Over it, the
// older turns are summarised in a separate chat on the site (PP.ask) with the
// summary's own system prompt stack; the recent turns stay word for word.
// Summaries are kept per chat in memory-summaries.json (history folder, so git
// keeps them) and only extended with turns that newly fall out of "recent".
const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);
const SUMS = "memory-summaries.json";
const PROMPTS = "system-prompts.json";

const pick = (o, keys) => {
  for (const k of keys) if (typeof o[k] === "string" && o[k].trim()) return o[k].trim();
  return "";
};
// Turn shapes differ between app versions, so try the likely field names.
const readTurn = (t) => {
  if (!t || typeof t !== "object" || t.pending) return null;
  const user = pick(t, ["you", "user", "prompt", "sent"]);
  const ai = pick(t, ["reply", "shown", "assistant", "ai", "answer", "raw"]);
  if (user || ai) return { user, ai };
  const text = pick(t, ["text", "content"]);
  if (!text) return null;
  return t.role === "user" ? { user: text, ai: "" } : { user: "", ai: text };
};
const clipTo = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)).trimEnd() + "…" : s);
const lineOf = (turn, max) => {
  const parts = [];
  if (turn.user) parts.push("User: " + (max ? clipTo(turn.user, max) : turn.user));
  if (turn.ai) parts.push("AI: " + (max ? clipTo(turn.ai, max) : turn.ai));
  return parts.join("\n");
};
const turnsOf = (ctx, text) => {
  const turns = ((ctx.chat && ctx.chat.turns) || []).map(readTurn).filter(Boolean);
  // The message being sent may already be in the list: leave it out.
  if (turns.length && turns[turns.length - 1].user === text.trim() && !turns[turns.length - 1].ai) turns.pop();
  return turns;
};

// ---------- files ----------
const readJson = async (path, fallback) => {
  try {
    const r = await PP.api("/api/history/file?path=" + path);
    return r.text ? JSON.parse(r.text) : fallback;
  } catch (e) {
    return fallback;
  }
};
let sums = null; // chat path -> { upTo, text, at }
const loadSums = async () => (sums = sums || (await readJson(SUMS, {})));
const saveSums = (message) => PP.api("/api/history/save", { files: [{ path: SUMS, text: JSON.stringify(sums, null, 2) + "\n" }], message: "memory: " + message }).catch(() => {});
const keyOf = (ctx) => (ctx.chat && ctx.chat.path) || "";

// ---------- the summary's system prompts ----------
// "same": whatever the System prompt plugin stacks for this profile; "own": this plugin's list; "none".
const summaryStack = async (s) => {
  const lib = await readJson(PROMPTS, { prompts: [] });
  const ids = s.stackMode === "own" ? s.stack || [] : s.stackMode === "none" ? [] : (PP.settings ? PP.settings("system-prompt").stack : []) || [];
  return ids.map((id) => lib.prompts.find((p) => p.id === id)).filter(Boolean);
};
const summaryRequest = async (s, previous, lines) => {
  const stack = (await summaryStack(s)).map((p) => p.text.trim()).filter(Boolean);
  const parts = [];
  if (stack.length) parts.push("[System instructions]\n" + stack.join("\n\n") + "\n[End of system instructions]");
  parts.push(s.summaryPrompt.trim());
  if (previous) parts.push("[Summary so far]\n" + previous + "\n[End of summary so far]");
  parts.push("[Conversation" + (previous ? " since then" : "") + "]\n" + lines.join("\n\n") + "\n[End of conversation]");
  return parts.join("\n\n");
};

// Summary of turns[0..upTo), extending a saved one when it covers a prefix.
const summarise = async (ctx, turns, upTo, force = false) => {
  await loadSums();
  const key = keyOf(ctx);
  const saved = key && sums[key];
  if (!force && saved && saved.upTo === upTo && saved.text) return { text: saved.text, fresh: false };
  const from = !force && saved && saved.upTo < upTo && saved.text ? saved.upTo : 0;
  const previous = from ? saved.text : "";
  const lines = turns.slice(from, upTo).map((t) => lineOf(t, 0));
  if (!PP.ask) throw new Error("this app version has no PP.ask (update the app)");
  const s = ctx.settings;
  const r = await PP.ask(await summaryRequest(s, previous, lines), { profile: ctx.profile && ctx.profile.name, hooks: !!s.summaryHooks });
  const text = (r.reply || "").trim();
  if (!text) throw new Error("the summary came back empty");
  if (key) {
    sums[key] = { upTo, text, at: new Date().toISOString(), chat: ctx.chat.meta ? ctx.chat.meta.title : "" };
    await saveSums(`summary of ${upTo} turns (${sums[key].chat || key})`);
  }
  return { text, fresh: true, from };
};

// ---------- building the memory block ----------
const block = (pinned, summary, lines, note) => {
  if (!pinned && !summary && !lines.length) return null;
  const out = ["[Memory: context from earlier in this conversation. Use it, don't repeat it back.]"];
  if (pinned) out.push("Facts to remember:\n" + pinned);
  if (summary) out.push("Summary of the earlier conversation:\n" + summary);
  if (lines.length) out.push((summary ? "Most recent messages" : "Earlier messages") + (note || "") + ":\n" + lines.join("\n\n"));
  out.push("[End of memory]");
  return out.join("\n\n");
};

// Clip mode (and the fallback when a summary can't be made): older turns clipped, oldest dropped.
const clipped = (turns, s, pinned, budget, used0 = 0) => {
  const recent = Math.max(0, num(s.recent, 6));
  const clip = Math.max(20, num(s.clip, 200));
  let used = pinned.length + used0;
  const lines = [];
  let dropped = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const line = turns.length - 1 - i >= recent ? lineOf(turns[i], clip) : lineOf(turns[i], 0);
    if (used + line.length + 2 > budget) {
      dropped = i + 1;
      break;
    }
    used += line.length + 2;
    lines.unshift(line);
  }
  return { lines, dropped, used };
};

const build = async (text, ctx) => {
  const s = ctx.settings;
  const turns = turnsOf(ctx, text);
  const budget = Math.max(200, num(s.budget, 50000));
  const pinned = (s.pinned || "").trim();
  const full = turns.map((t) => lineOf(t, 0));
  const total = pinned.length + full.reduce((n, l) => n + l.length + 2, 0);
  // Under the max nothing is cut or summarised.
  if (total <= budget) return { text: block(pinned, "", full), note: `${turns.length} turns in full, ${total} chars` };
  const recent = Math.min(turns.length, Math.max(0, num(s.recent, 6)));
  const upTo = turns.length - recent;
  if (s.overflow === "summary" && upTo > 0) {
    // A saved summary that covers part of it: use it now (the turns after it go
    // in as they are) and extend it in the background, so this send doesn't wait.
    await loadSums();
    const saved = keyOf(ctx) && sums[keyOf(ctx)];
    if (saved && saved.text && saved.upTo > 0 && saved.upTo < upTo) {
      const c = clipped(turns.slice(saved.upTo), { ...s, recent }, pinned, budget, saved.text.length);
      if (!busy.has(keyOf(ctx))) {
        const key = keyOf(ctx);
        busy.add(key);
        setTimeout(() => summarise(ctx, turns, upTo).catch(() => {}).finally(() => busy.delete(key)), 0);
      }
      return {
        text: block(pinned, saved.text, c.lines, c.dropped ? ` (${c.dropped} left out to fit)` : ""),
        note: `saved summary of ${saved.upTo} turns + ${c.lines.length} after it; extending the summary in the background`,
      };
    }
    try {
      const sum = await summarise(ctx, turns, upTo);
      const c = clipped(turns.slice(upTo), { ...s, recent }, pinned, budget, sum.text.length);
      return {
        text: block(pinned, sum.text, c.lines, c.dropped ? ` (${c.dropped} left out to fit)` : ""),
        note: `${upTo} older turns as a summary (${sum.fresh ? (sum.from ? "extended now" : "made now") : "saved"}), ${c.lines.length} recent in full`,
      };
    } catch (e) {
      const c = clipped(turns, s, pinned, budget);
      return { text: block(pinned, "", c.lines, c.dropped ? ` (${c.dropped} oldest left out)` : ""), note: `summary failed (${e.message}); clipped instead` };
    }
  }
  const c = clipped(turns, s, pinned, budget);
  return { text: block(pinned, "", c.lines, c.dropped ? ` (${c.dropped} oldest left out)` : ""), note: `over the max: older turns clipped${c.dropped ? `, ${c.dropped} dropped` : ""}` };
};

// ---------- sheet: the summary's prompts, this chat's summary ----------
const openSheet = (ctx) => {
  const h = PP.h;
  let lib = { prompts: [] };
  readJson(PROMPTS, { prompts: [] }).then((l) => ((lib = l), PP.render()));
  loadSums().then(() => PP.render());
  const s = () => ctx.settings;
  const set = (k, v) => (ctx.set(k, v), (ctx.settings[k] = v), PP.render());
  const nameOf = (p) => p.name || p.text.trim().split("\n")[0].slice(0, 40);
  PP.sheet("Memory", () => {
    const mode = s().stackMode || "same";
    const own = (s().stack || []).filter((id) => lib.prompts.some((p) => p.id === id));
    const same = (PP.settings ? PP.settings("system-prompt").stack : []) || [];
    const key = PP.chat && PP.chat.path;
    const saved = key && sums && sums[key];
    const move = (i, d) => {
      const a = [...own];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      set("stack", a);
    };
    return [
      h("h3", {}, "This chat's summary"),
      saved
        ? h("div", {}, h("p", { class: "muted" }, `Covers the first ${saved.upTo} turns · ${new Date(saved.at).toLocaleString()}`), h("div", { class: "sp-text" }, saved.text))
        : h("p", { class: "muted" }, "None yet. It's made when this chat's memory goes over the max."),
      saved
        ? h("div", { class: "row" },
            h("button", { class: "small", onclick: () => navigator.clipboard.writeText(saved.text).then(() => PP.toast("Copied")) }, "Copy"),
            h("button", { class: "small danger", onclick: async () => (delete sums[key], await saveSums("forgot a summary"), PP.render()) }, "Forget it (made again next time)"))
        : null,
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
      h("p", { class: "muted" }, "The summary request itself, the max and the recent turns are under the ⚙. Summaries run in their own chat on a free site page: with plugins inside a send, that needs Settings › Site pages at once at 2 or more (otherwise memory clips instead and says so in the trace)."),
    ];
  });
};

// ---------- summarising ahead ----------
// When the chat is within "ahead" average-sized messages of the max, make the
// summary in the background after a reply, so it's ready before it's needed.
const busy = new Set();
const ahead = (ctx) => {
  const s = ctx.settings;
  const n = Math.max(0, num(s.ahead, 6));
  if (!n || s.overflow !== "summary" || !keyOf(ctx) || busy.has(keyOf(ctx))) return;
  const turns = turnsOf(ctx, "");
  if (!turns.length) return;
  const budget = Math.max(200, num(s.budget, 50000));
  const sizes = turns.map((t) => lineOf(t, 0).length + 2);
  const total = (s.pinned || "").trim().length + sizes.reduce((a, b) => a + b, 0);
  const last = sizes.slice(-10);
  const avg = last.reduce((a, b) => a + b, 0) / last.length;
  if (total + n * avg <= budget) return;
  const recent = Math.min(turns.length, Math.max(0, num(s.recent, 6)));
  const upTo = turns.length - recent;
  if (upTo <= 0) return;
  ctx.note(`memory: about ${Math.max(0, Math.floor((budget - total) / avg))} messages from the max; summarising ahead`);
  const key = keyOf(ctx);
  busy.add(key);
  // After this reply is saved and its page is free again.
  setTimeout(() => {
    summarise(ctx, turns, upTo)
      .then((r) => r.fresh && PP.toast(`Memory: summary ready (${upTo} turns)`))
      .catch((e) => PP.toast("Memory: summary failed: " + e.message, "error"))
      .finally(() => busy.delete(key));
  }, 0);
};

PP.plugin({
  afterReply(text, ctx) {
    // ctx.chat still holds this turn as pending; summarise what's already settled.
    try {
      ahead(ctx);
    } catch (e) {}
    return text;
  },
  async beforeSend(text, ctx) {
    const every = Math.max(1, Math.round(num(ctx.settings.every, 1)));
    const count = ((ctx.chat && ctx.chat.turns) || []).length;
    if (!ctx.firstMessage && count % every !== 0) {
      ctx.note("memory: skipped (every " + every + ")");
      return text;
    }
    const m = await build(text, ctx);
    if (!m.text) {
      ctx.note("memory: nothing to send");
      return text;
    }
    ctx.note("memory: " + m.note);
    return m.text + "\n\n" + text;
  },
  renderBlock(ctx) {
    const el = ctx.pill();
    if (ctx.set) el.insertBefore(PP.h("button", { class: "pill-gear", title: "Summary prompts and this chat's summary", "aria-label": "Memory summary", onclick: () => openSheet(ctx) }, "☰"), el.lastChild);
    return el;
  },
});
