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

// ---------- import and export ----------
const fileSlug = (t) => (t || "prompt").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "prompt";
const exportAll = () => PP.exportFile("system-prompts.json", JSON.stringify({ promptpipe: "system-prompts", version: 1, prompts: lib.prompts.map((p) => ({ name: p.name || "", text: p.text, pinned: !!p.pinned })) }, null, 2) + "\n");
const exportOne = (p) => PP.exportFile(fileSlug(nameOf(p)) + ".md", p.text.trim() + "\n");
// .md / .txt files (the name is the file's name) or a system-prompts.json from Export all.
const promptsFromFiles = (files) =>
  files.flatMap((f) => {
    if (!/\.json$/i.test(f.name)) return [{ name: f.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " "), text: f.text.trim() }];
    let j;
    try {
      j = JSON.parse(f.text);
    } catch (e) {}
    if (!j || j.promptpipe !== "system-prompts" || !Array.isArray(j.prompts)) throw new Error(f.name + " is not a system prompts file");
    return j.prompts.filter((p) => p && typeof p.text === "string");
  });
const importPrompts = (files) =>
  (async () => {
    const list = promptsFromFiles(files).filter((p) => p.text.trim());
    let added = 0, replaced = 0;
    for (const p of list) {
      const name = (p.name || "").trim();
      const clash = name && lib.prompts.find((x) => (x.name || "") === name);
      let replace = false;
      if (clash) replace = PP.importMode() === "replace" || (PP.importMode() === "ask" && (await PP.confirm(`A system prompt named “${name}” already exists. Replace it? (Cancel keeps both.)`, "Replace")));
      if (clash && replace) (Object.assign(clash, { text: p.text, edited: new Date().toISOString() }), replaced++);
      else {
        let n = name, i = 2;
        while (n && lib.prompts.some((x) => (x.name || "") === n)) n = `${name} (${i++})`;
        lib.prompts.unshift({ id: newId(), name: n, text: p.text, pinned: !!p.pinned, created: new Date().toISOString() });
        added++;
      }
    }
    if (added || replaced) await save(`imported ${added + replaced}`);
    PP.toast(added || replaced ? `Imported ${added} new${replaced ? `, replaced ${replaced}` : ""}` : "Nothing to import");
    PP.render();
  })().catch((e) => PP.toast(e.message, "error"));
const pickAndImport = () => PP.pickFiles(importPrompts, { multiple: true, accept: ".md,.markdown,.txt,.json,text/*" });

// The library as the wireframe has it: the prompts as rows, a page for each one, and Manage.
const openLibrary = (ctx) => {
  let view = null; // id of the prompt on show, or "new"
  let editing = false;
  let query = "";
  const h = PP.h;
  const item = (o) => PP.item(o);
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
  const snippet = (p) => p.text.replace(/\s+/g, " ").slice(0, 90) + (p.text.length > 90 ? "…" : "");
  const back = h("button", { class: "ghost back", onclick: () => ((view = null), (editing = false), PP.render()) }, "‹ System prompts");

  const editor = (p) => {
    const name = h("input", { placeholder: "Name (optional)", value: p.name || "", "aria-label": "Name" });
    const text = h("textarea", { rows: 8, placeholder: "The prompt", "aria-label": "The prompt" }, p.text || "");
    return h("div", { class: "sp-edit" }, name, text, h("div", { class: "row" },
      h("button", { class: "primary", onclick: async () => {
        const t = text.value.trim();
        if (!t) return PP.toast("Write something first", "error");
        if (p.id) {
          Object.assign(byId(p.id), { name: name.value.trim(), text: t, edited: new Date().toISOString() });
          await save("edited " + nameOf(byId(p.id)));
        } else {
          const n = { id: newId(), name: name.value.trim(), text: t, pinned: false, created: new Date().toISOString() };
          lib.prompts.unshift(n);
          view = n.id;
          await save("added " + nameOf(n));
        }
        editing = false;
        PP.render();
      } }, "Save"),
      h("button", { onclick: () => ((editing = false), p.id || (view = null), PP.render()) }, "Cancel")));
  };

  const promptPage = () => {
    if (view === "new") return [back, editor({ name: "", text: "" })];
    const p = byId(view);
    if (!p) return ((view = null), listPage());
    if (editing) return [back, editor(p)];
    return [
      back,
      item({ id: "sp.edit", label: nameOf(p), sub: snippet(p), chev: true, onclick: () => ((editing = true), PP.render()) }),
      h("h3", {}, "Use"),
      item({ id: "sp.add", label: "Add to this profile", sub: "A copy goes in as a row you can move anywhere", onclick: () => PP.addPromptRow(p.name || nameOf(p), p.text) }),
      item({ id: "sp.pin", label: p.pinned ? "Unpin" : "Pin to the top", onclick: async () => ((p.pinned = !p.pinned), await save((p.pinned ? "pinned " : "unpinned ") + nameOf(p)), PP.render()) }),
      item({ id: "sp.copy", label: "Copy the text", onclick: () => PP.copy(p.text) }),
      item({ id: "sp.exp", label: "Export as Markdown", onclick: () => exportOne(p) }),
      item({ id: "sp.del", label: "Delete", cls: "danger", onclick: async () => {
        if (!(await PP.confirm(`Delete "${nameOf(p)}" from the library? Profiles that use it keep their own copy.`))) return;
        lib.prompts = lib.prompts.filter((x) => x !== p);
        setStack(stack().filter((x) => x !== p.id));
        view = null;
        await save("deleted " + nameOf(p));
        PP.render();
      } }),
    ];
  };

  const listPage = () => {
    const q = query.toLowerCase();
    const shown = lib.prompts.filter((p) => !q || (p.name + " " + p.text).toLowerCase().includes(q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    const s = stack();
    return [
      PP.openSettings ? h("button", { class: "ghost back", onclick: () => PP.openSettings() }, "‹ Settings") : null,
      lib.prompts.length > 4 ? h("input", { type: "search", placeholder: "Search prompts", value: query, oninput: (e) => ((query = e.target.value), PP.render()), "data-keep": "sp-search" }) : null,
      ...shown.map((p) => item({ id: "sp." + p.id, label: (p.pinned ? "📌 " : "") + nameOf(p), sub: snippet(p), chev: true, onclick: () => ((view = p.id), PP.render()) })),
      lib.prompts.length ? null : h("p", { class: "muted" }, "No prompts yet. Write one below."),
      s.length ? h("h3", {}, "Stacked the older way (still sent, in this order)") : null,
      ...s.map((id, i) => h("div", { class: "it" },
        h("div", { class: "g" }, `${i + 1} · ${nameOf(byId(id))}`),
        h("button", { class: "small", "aria-label": "Move up", disabled: i === 0, onclick: () => move(id, -1) }, "↑"),
        h("button", { class: "small", "aria-label": "Move down", disabled: i === s.length - 1, onclick: () => move(id, 1) }, "↓"),
        h("button", { class: "small", title: "Take it off the stack (stays in the library)", onclick: () => setStack(s.filter((x) => x !== id)) }, "Remove"))),
      h("h3", {}, "Manage"),
      item({ id: "sp.new", label: "New system prompt", onclick: () => ((view = "new"), (editing = true), PP.render()) }),
      item({ id: "sp.imp", label: "Import system prompts…", onclick: pickAndImport }),
      lib.prompts.length ? item({ id: "sp.expall", label: "Export all system prompts", onclick: exportAll }) : null,
    ];
  };
  PP.sheet("System prompts", () => (view ? promptPage() : listPage()));
};

// What the library sheet needs when opened from Settings or Find (not from a profile row).
const libraryCtx = () => ({ settings: PP.settings("system-prompt"), set: (k, v) => PP.setSetting("system-prompt", k, v), on: true, note: () => {} });

PP.plugin({
  // In Find and Settings: the library, and import and export without opening the library.
  menu: [
    { label: "System prompts", run: async () => (await load(), openLibrary(libraryCtx())) },
    { label: "Import system prompts…", run: pickAndImport },
    { label: "Export all system prompts", run: async () => (await load(), lib.prompts.length ? exportAll() : PP.toast("No system prompts yet")) },
  ],
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
