"use strict";
// Chat screen: the prompt library. Every System prompt you save, in history/prompt-library.json
// (kept in git, see core-profiles). A profile uses one as a linked System prompt block: edit it
// here once and every profile that links it sends the new text. Pinned prompts come first.

const libNow = () => PP.profiles.library.prompts;
const libSnippet = (p) => p.text.replace(/\s+/g, " ").slice(0, 90) + (p.text.length > 90 ? "…" : "");
// The profiles whose blocks link this prompt.
const linkedBy = (id) => S.config.profiles.filter((prof) => (prof.blocks || []).some((b) => b.type === "prompt" && b.link === id));

// ---------- import and export ----------
const promptSlug = (t) => (t || "prompt").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "prompt";
const exportLibrary = () =>
  exportFile("prompt-library.json", JSON.stringify({ promptpipe: "prompt-library", version: 1, prompts: libNow().map((p) => ({ name: p.name || "", text: p.text, pinned: !!p.pinned })) }, null, 2) + "\n");
const exportLibPrompt = (p) => exportFile(promptSlug(PP.profiles.libName(p)) + ".md", p.text.trim() + "\n");
// .md / .txt files (the name is the file's name), or a prompt-library.json from Export all.
const promptsFromFiles = (files) =>
  files.flatMap((f) => {
    if (!/\.json$/i.test(f.name)) return [{ name: f.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " "), text: f.text.trim() }];
    let j;
    try {
      j = JSON.parse(f.text);
    } catch (e) {}
    const kinds = ["prompt-library", "system-prompts"]; // legacy: "system-prompts" files from the System prompt plugin
    if (!j || !kinds.includes(j.promptpipe) || !Array.isArray(j.prompts)) throw new Error(f.name + " is not a prompt library file");
    return j.prompts.filter((p) => p && typeof p.text === "string");
  });
const importLibrary = (files) =>
  (async () => {
    const list = promptsFromFiles(files).filter((p) => p.text.trim());
    let added = 0, replaced = 0;
    for (const p of list) {
      const name = (p.name || "").trim();
      const clash = name && libNow().find((x) => (x.name || "") === name);
      let replace = false;
      if (clash) replace = PP.importMode() === "replace" || (PP.importMode() === "ask" && (await askConfirm(`A prompt named “${name}” is already in the library. Replace it? (Cancel keeps both.)`, "Replace")));
      if (clash && replace) (Object.assign(clash, { text: p.text, edited: iso() }), replaced++);
      else {
        let n = name, i = 2;
        while (n && libNow().some((x) => (x.name || "") === n)) n = `${name} (${i++})`;
        libNow().unshift({ ...PP.profiles.newLibPrompt(n, p.text), pinned: !!p.pinned });
        added++;
      }
    }
    if (added || replaced) await PP.profiles.saveLibrary(`imported ${added + replaced}`);
    toast(added || replaced ? `Imported ${added} new${replaced ? `, replaced ${replaced}` : ""}` : "Nothing to import");
    rerenderSheet();
  })().catch((e) => toast(e.message, "error"));
const pickAndImportLibrary = () => pickFiles(importLibrary, { multiple: true, accept: ".md,.markdown,.txt,.json,text/*" });

// ---------- screens ----------
const LIBQ = { query: "" };
const openPromptLibrary = () =>
  openSheet("Prompt library", () => {
    const q = LIBQ.query.toLowerCase();
    const all = libNow();
    const shown = all.filter((p) => !q || ((p.name || "") + " " + p.text).toLowerCase().includes(q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return [
      h("div", { class: "sub2" }, "System prompts you keep. A profile links one as a block: change it here and every profile that links it sends the new text."),
      all.length > 4 ? h("label", { class: "search" }, svgIcon("search"), h("input", { type: "search", placeholder: "Search prompts", "aria-label": "Search prompts", value: LIBQ.query, oninput: (e) => ((LIBQ.query = e.target.value), rerenderSheet()) })) : null,
      ...shown.map((p) => item({ id: "lib." + p.id, label: (p.pinned ? "📌 " : "") + PP.profiles.libName(p), sub: libSnippet(p), chev: true, onclick: () => openLibPrompt(p.id) })),
      all.length ? null : h("p", { class: "muted" }, "No prompts yet."),
      h("div", { class: "lbl" }, "Manage"),
      item({ id: "lib.new", label: "New system prompt", onclick: () => openLibEditor(null) }),
      item({ id: "lib.imp", label: "Import prompts…", sub: ".md or .txt files, or a library file", onclick: pickAndImportLibrary }),
      all.length ? item({ id: "lib.expall", label: "Export the whole library", onclick: exportLibrary }) : null,
    ];
  }, { back: openSettings });

const openLibPrompt = (id) =>
  openSheet(() => PP.profiles.libName(PP.profiles.libPrompt(id)) || "Prompt", () => {
    const p = PP.profiles.libPrompt(id);
    if (!p) return [item({ label: "This prompt isn't in the library any more" })];
    const users = linkedBy(id);
    const prof = editedProfile();
    const linkedHere = users.includes(prof);
    return [
      item({ id: "lib.edit", label: libSnippet(p), sub: "Tap to edit · every profile that links it changes", chev: true, onclick: () => openLibEditor(id) }),
      h("div", { class: "lbl" }, "Linked by"),
      users.length ? h("div", { class: "sub2" }, users.map((x) => x.name).join(", ")) : h("div", { class: "sub2" }, "No profile yet."),
      h("div", { class: "lbl" }, "Use"),
      item({ id: "lib.add", label: `Add to “${prof.name}”`, sub: linkedHere ? "Already linked there; adds it once more" : "As a linked block, before Your message", onclick: () => {
        const at = prof.blocks.findIndex((b) => b.type === "message");
        prof.blocks.splice(Math.max(0, at), 0, PP.profiles.linkedBlock(id));
        saveConfig();
        render();
        toast("Linked in " + prof.name);
      } }),
      item({ id: "lib.pin", label: p.pinned ? "Unpin" : "Pin to the top", onclick: async () => ((p.pinned = !p.pinned), await PP.profiles.saveLibrary((p.pinned ? "pinned " : "unpinned ") + PP.profiles.libName(p)), rerenderSheet()) }),
      item({ id: "lib.copy", label: "Copy the text", onclick: () => copyText(p.text, "Copied") }),
      item({ id: "lib.exp", label: "Export as Markdown", onclick: () => exportLibPrompt(p) }),
      item({ id: "lib.del", label: "Delete from the library", cls: "danger", onclick: async () => {
        const msg = users.length ? `Delete “${PP.profiles.libName(p)}” from the library? ${users.length} profile${users.length === 1 ? " links" : "s link"} it: they keep the text as their own copy.` : `Delete “${PP.profiles.libName(p)}” from the library?`;
        if (!(await askConfirm(msg))) return;
        // Linked blocks become their own copies, so no profile loses the text.
        for (const x of users) for (const b of x.blocks) if (b.type === "prompt" && b.link === id) Object.assign(b, { name: p.name || "", text: p.text }), delete b.link;
        PP.profiles.library.prompts = libNow().filter((x) => x !== p);
        await PP.profiles.saveLibrary("deleted " + PP.profiles.libName(p));
        saveConfig();
        openPromptLibrary();
      } }),
    ];
  }, { back: openPromptLibrary });

// New (id null) or edit. What is typed lives in `draft`, so redraws never lose it.
const openLibEditor = (id, after = null) => {
  const p = id ? PP.profiles.libPrompt(id) : null;
  const draft = { name: p ? p.name || "" : "", text: p ? p.text : "" };
  openSheet(p ? "Edit prompt" : "New system prompt", () => [
    h("div", { class: "lbl" }, "Name"),
    h("label", { class: "search" }, h("input", { placeholder: "Name (optional)", "aria-label": "Name", value: draft.name, oninput: (e) => (draft.name = e.target.value) })),
    h("div", { class: "lbl" }, "Text"),
    h("textarea", { class: "box", rows: 9, placeholder: "The prompt", "aria-label": "The prompt", value: draft.text, oninput: (e) => (draft.text = e.target.value) }),
    p && linkedBy(p.id).length ? h("div", { class: "sub2" }, `Linked by ${linkedBy(p.id).map((x) => x.name).join(", ")}: they send the new text.`) : null,
    item({ prim: true, label: "Save", onclick: async () => {
      const text = draft.text.trim();
      if (!text) return toast("Write something first", "error");
      let saved = p;
      if (p) Object.assign(p, { name: draft.name.trim(), text, edited: iso() });
      else libNow().unshift((saved = PP.profiles.newLibPrompt(draft.name.trim(), text)));
      await PP.profiles.saveLibrary((p ? "edited " : "added ") + PP.profiles.libName(saved));
      render();
      after ? after(saved) : openLibPrompt(saved.id);
    } }),
  ], { back: () => (p ? openLibPrompt(p.id) : openPromptLibrary()) });
};
