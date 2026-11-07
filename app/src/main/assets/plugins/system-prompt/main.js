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
      h("div", { class: "row" },
        h("button", { class: "small", onclick: pickAndImport }, "Import…"),
        lib.prompts.length ? h("button", { class: "small", onclick: exportAll }, "Export all") : null),
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
                    h("button", { class: "small", onclick: () => exportOne(p) }, "Export"),
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
  // In Find: import and export without opening the library.
  menu: [
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
