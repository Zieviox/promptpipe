// System prompt plugin: a stack of prompts from a library, sent in front of the message.
// The library (every prompt you save, pinned ones first) lives in
// history/system-prompts.json, so git keeps its history. The stack (which
// prompts, in which order) is per profile.
const FILE = "system-prompts.json";
let lib = { prompts: [] };
let loaded = false;
// Library entries start folded to one line; the ones you unfold stay unfolded while the sheet redraws.
const unfolded = new Set();
let newOpen = false;

const load = async () => {
  try {
    const r = await PP.api("/api/history/file?path=" + FILE);
    if (r.text) lib = { prompts: [], ...JSON.parse(r.text) };
  } catch (e) {}
  loaded = true;
};
const save = (message) => PP.api("/api/history/save", { files: [{ path: FILE, text: JSON.stringify(lib, null, 2) + "\n" }], message: "system prompts: " + message }).catch((e) => PP.toast("Couldn't save prompts: " + e.message, "error"));
const newId = () => "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const byId = (id) => lib.prompts.find((p) => p.id === id);
const nameOf = (p) => p.name || p.text.trim().split("\n")[0].slice(0, 40) || "(empty)";
const stackOf = (settings) => (Array.isArray(settings.stack) ? settings.stack : []).filter(byId);

// The old single prompt becomes the first library entry, stacked.
const migrate = async (ctx) => {
  const old = (ctx.settings.prompt || "").trim();
  if (!old) return;
  let p = lib.prompts.find((x) => x.text.trim() === old);
  if (!p) {
    p = { id: newId(), name: "", text: old, pinned: false, created: new Date().toISOString() };
    lib.prompts.unshift(p);
    await save("kept the old prompt");
  }
  ctx.set("stack", [...stackOf(ctx.settings).filter((id) => id !== p.id), p.id]);
  ctx.set("prompt", "");
};
load();

const openLibrary = (ctx) => {
  let query = "";
  let editing = null;
  let draft = { name: "", text: "" };
  const h = PP.h;
  const stack = () => stackOf(ctx.settings);
  const setStack = (ids) => {
    ctx.set("stack", ids);
    ctx.settings.stack = ids;
    PP.render();
  };
  const move = (id, d) => {
    const s = stack();
    const i = s.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    setStack(s);
  };
  const editor = (p) => {
    const name = h("input", { placeholder: "Name (optional)", value: p.name || "" });
    const text = h("textarea", { rows: 6, placeholder: "The prompt" }, p.text || "");
    return h("div", { class: "sp-edit", "data-editing": p.id ? "1" : null }, name, text, h("div", { class: "row" },
      h("button", { class: "primary", onclick: async () => {
        const t = text.value.trim();
        if (!t) return PP.toast("Write something first", "error");
        if (p.id) Object.assign(byId(p.id), { name: name.value.trim(), text: t, edited: new Date().toISOString() });
        else {
          const n = { id: newId(), name: name.value.trim(), text: t, pinned: false, created: new Date().toISOString() };
          lib.prompts.unshift(n);
          setStack([...stack(), n.id]);
          draft = { name: "", text: "" };
          newOpen = false;
        }
        editing = null;
        await save(p.id ? "edited " + nameOf(byId(p.id)) : "added " + nameOf(lib.prompts[0]));
        PP.render();
      } }, p.id ? "Save" : "Save and stack it"),
      p.id ? h("button", { onclick: () => ((editing = null), PP.render()) }, "Cancel") : null));
  };
  PP.sheet("System prompts", () => {
    const s = stack();
    const q = query.toLowerCase();
    const shown = lib.prompts
      .filter((p) => !q || (p.name + " " + p.text).toLowerCase().includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return [
      h("h3", {}, "Stack · sent in this order"),
      s.length
        ? h("div", { class: "sp-stack" }, s.map((id, i) => {
            const p = byId(id);
            return h("div", { class: "sp-row" },
              h("span", { class: "sp-num" }, String(i + 1)),
              h("span", { class: "sp-name grow" }, nameOf(p)),
              h("button", { class: "small", "aria-label": "Move up", disabled: i === 0, onclick: () => move(id, -1) }, "↑"),
              h("button", { class: "small", "aria-label": "Move down", disabled: i === s.length - 1, onclick: () => move(id, 1) }, "↓"),
              h("button", { class: "small", title: "Take it off the stack (stays in the library)", onclick: () => setStack(s.filter((x) => x !== id)) }, "Remove"));
          }))
        : h("p", { class: "muted" }, "Nothing stacked: messages go without a system prompt. Tap Use on a prompt below."),
      ctx.on ? null : h("p", { class: "warn" }, "The System prompt switch is off, so the stack isn't sent."),
      h("h3", {}, "New prompt"),
      newOpen || !lib.prompts.length ? editor(draft) : h("div", { class: "row" }, h("button", { class: "small primary", onclick: () => ((newOpen = true), PP.render()) }, "+ New prompt")),
      h("div", { class: "row" },
        h("h3", { class: "grow" }, `Library · ${lib.prompts.length}`),
        lib.prompts.length ? h("button", { class: "small", onclick: () => (unfolded.size ? unfolded.clear() : lib.prompts.forEach((p) => unfolded.add(p.id)), PP.render()) }, unfolded.size ? "Fold all" : "Unfold all") : null),
      lib.prompts.length > 4 ? h("input", { type: "search", placeholder: "Search prompts", value: query, oninput: (e) => ((query = e.target.value), PP.render()), "data-keep": "sp-search" }) : null,
      ...shown.map((p) => editing === p.id
        ? editor(p)
        : h("div", { class: "sp-item" + (p.pinned ? " pinned" : "") },
            h("div", { class: "sp-head" },
              h("button", { class: "ghost grow sp-fold", "aria-expanded": String(unfolded.has(p.id)), title: unfolded.has(p.id) ? "Fold" : "Unfold", onclick: () => (unfolded.has(p.id) ? unfolded.delete(p.id) : unfolded.add(p.id), PP.render()) },
                (unfolded.has(p.id) ? "▾ " : "▸ ") + (p.pinned ? "📌 " : "") + nameOf(p)),
              s.includes(p.id) ? h("span", { class: "muted" }, "in stack") : h("button", { class: "small primary", onclick: () => setStack([...s, p.id]) }, "Use")),
            unfolded.has(p.id)
              ? [
                  h("div", { class: "sp-text muted" }, p.text),
                  h("div", { class: "row" },
                    h("button", { class: "small", onclick: async () => ((p.pinned = !p.pinned), await save((p.pinned ? "pinned " : "unpinned ") + nameOf(p)), PP.render()) }, p.pinned ? "Unpin" : "Pin"),
                    h("button", { class: "small", onclick: () => {
                      editing = p.id;
                      PP.render();
                      // Bring the editor into view and put the cursor in it.
                      setTimeout(() => {
                        const ta = document.querySelector(".sheet .sp-edit[data-editing] textarea");
                        ta?.focus();
                        ta?.scrollIntoView({ block: "center" });
                      }, 0);
                    } }, "Edit"),
                    h("button", { class: "small", onclick: () => PP.copy(p.text) }, "Copy"),
                    h("button", { class: "small danger", onclick: async () => {
                      if (!(await PP.confirm(`Delete "${nameOf(p)}" from the library?`))) return;
                      lib.prompts = lib.prompts.filter((x) => x !== p);
                      unfolded.delete(p.id);
                      setStack(s.filter((x) => x !== p.id));
                      await save("deleted " + nameOf(p));
                    } }, "Delete")),
                ]
              : h("div", { class: "sp-text muted sp-one" }, p.text.replace(/\s+/g, " ").slice(0, 90) + (p.text.length > 90 ? "…" : "")))),
      h("p", { class: "muted" }, "Saved in your history folder as " + FILE + " (git keeps every version). The stack is per profile; Send it / wrapper are under the ⚙."),
    ];
  });
};

PP.plugin({
  beforeSend(text, ctx) {
    const s = ctx.settings;
    if (s.when === "first" && !ctx.firstMessage) return text;
    const parts = stackOf(s).map((id) => byId(id).text.trim()).filter(Boolean);
    if ((s.prompt || "").trim() && !parts.length) parts.push(s.prompt.trim()); // not migrated yet
    if (!parts.length) return text;
    const prompt = parts.join(s.joiner.replace(/\\n/g, "\n") || "\n\n");
    ctx.note(`system prompt: ${parts.length} part${parts.length > 1 ? "s" : ""}`);
    return s.wrap.replace("{prompt}", prompt).replace("{message}", text);
  },
  // The pill shows what's stacked; ☰ opens the library.
  renderBlock(ctx) {
    if (loaded && (ctx.settings.prompt || "").trim()) migrate(ctx).then(PP.render);
    const s = stackOf(ctx.settings);
    const label = s.length ? "System: " + (s.length === 1 ? nameOf(byId(s[0])).slice(0, 18) : `${s.length} stacked`) : "System prompt (none)";
    const el = ctx.pill(label);
    el.insertBefore(PP.h("button", { class: "pill-gear", title: "Prompt library and stack", "aria-label": "System prompts", onclick: () => openLibrary(ctx) }, "☰"), el.lastChild);
    return el;
  },
});
