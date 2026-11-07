"use strict";
// App part (chat screen): profiles. A profile is an ordered list of rows (system
// prompts and message plugins, with "Your message" anywhere between them) plus
// the plugins' settings. This file has the profile dropdown, the editor, adding
// rows, and importing and exporting profiles.

// ---------- dropdowns ----------
// Open dropdowns by id. They live in S, so a redraw keeps them as they are, and
// they close when another screen opens (openSheet clears them).
S.dd = {};
const ddToggle = (id) => ((S.dd[id] = !S.dd[id]), rerenderSheet());

// A list of options that opens in place (not the system's popup, which a redraw
// can close under your finger). options: [{ value, label }].
const dropdown = ({ id, value, options, onPick, label }) => {
  const open = !!S.dd[id];
  const cur = options.find((o) => o.value === value);
  return h(
    "div",
    { class: "dd" + (open ? " open" : "") },
    h("button", { class: "dd-main", "aria-expanded": String(open), "aria-label": label, onclick: () => ddToggle(id) }, h("span", { class: "grow" }, cur?.label ?? "(none)"), svgIcon(open ? "up" : "down")),
    open
      ? h("div", { class: "dd-list" }, options.map((o) =>
          h("button", { class: "dd-pick" + (o.value === value ? " current" : ""), onclick: () => ((S.dd[id] = false), onPick(o.value)) }, o.value === value ? svgIcon("check") : h("span", { class: "svg" }), o.label)))
      : null,
  );
};

// The profile dropdown: the current one with Edit; opened, every profile with its
// own Edit, then New, Import, Export this, Export all.
const profileDropdown = ({ id, current, pick, sub, showEdit = true }) => {
  const open = !!S.dd[id];
  const head = h("div", { class: "dd-head" },
    h("button", { class: "dd-main", "aria-expanded": String(open), "aria-label": "Profile", onclick: () => ddToggle(id) },
      h("span", { class: "grow g" }, current.name, h("small", {}, sub || (current === profile() ? "Active profile · tap to switch or edit" : "Not the active profile"))), svgIcon(open ? "up" : "down")),
    open || !showEdit ? null : h("button", { class: "chip", onclick: () => openProfileEditor(current.id) }, svgIcon("edit"), "Edit"));
  if (!open) return h("div", { class: "dd" }, head);
  return h(
    "div",
    { class: "dd open" },
    head,
    h("div", { class: "dd-list" }, S.config.profiles.map((p) =>
      h("div", { class: "dd-item" },
        h("button", { class: "dd-pick" + (p === current ? " current" : ""), onclick: () => ((S.dd[id] = false), pick(p)) }, p === current ? svgIcon("check") : h("span", { class: "svg" }), p.name),
        h("button", { class: "chip", "aria-label": "Edit " + p.name, onclick: () => openProfileEditor(p.id) }, svgIcon("edit"), "Edit")))),
    h("div", { class: "chips" },
      h("button", { class: "chip", onclick: openNewProfile }, "+ New"),
      h("button", { class: "chip", onclick: openImportProfile }, "Import…"),
      h("button", { class: "chip", onclick: () => exportProfiles([current]) }, "Export this"),
      h("button", { class: "chip", onclick: () => exportProfiles(S.config.profiles) }, "Export all")),
  );
};

// ---------- switching, making, removing ----------
const switchProfile = (id) => {
  S.config.activeProfile = id;
  saveConfig();
  render();
  toast("Profile: " + profile().name);
  warmSite();
};
const nextProfile = () => {
  const ps = S.config.profiles;
  switchProfile(ps[(ps.indexOf(profile()) + 1) % ps.length].id);
};
const profileById = (id) => S.config.profiles.find((p) => p.id === id) || profile();

const uniqueName = (name, taken = S.config.profiles.map((p) => p.name)) => {
  let n = name, i = 2;
  while (taken.includes(n)) n = `${name} (${i++})`;
  return n;
};

// "+ New": a name and a starter (Plain, RP, Writing feedback, Story writing).
const openNewProfile = () => {
  let name = "";
  let starter = "plain";
  openSheet("New profile", () => {
    const input = h("input", { placeholder: "Name", value: name, "aria-label": "Profile name", oninput: (e) => (name = e.target.value) });
    autofocus(input);
    const starters = PP.pipeline.presets();
    const go = () => {
      const p = PP.pipeline.makeProfile(uniqueName(name.trim() || "New profile"), starter);
      saveConfig();
      S.dd = {};
      openProfileEditor(p.id);
    };
    input.onkeydown = (e) => e.key === "Enter" && go();
    return [
      input,
      h("h3", {}, "Start from"),
      ...starters.map((t) => sheetRow({ label: t.name, sub: t.rows.filter((r) => r.type !== "message").length + " rows", onclick: () => ((starter = t.id), rerenderSheet()), right: starter === t.id ? svgIcon("check") : null })),
      h("div", { class: "row" }, h("button", { class: "primary grow", onclick: go }, "Make the profile")),
    ];
  });
};

// ---------- the editor ----------
S.editProfile = "";
S.openRow = null; // the row whose details are unfolded (an object of the profile's rows)

// The Profile tab of the Plugins screen is the editor (as in the wireframe).
const openProfileEditor = (id, row = null) => {
  S.editProfile = id || S.editProfile || profile().id;
  S.openRow = row;
  openPlugins("profile");
};

const editorBody = () => {
  const prof = profileById(S.editProfile);
  const pre = prof.pipe;
  const P = PP.pipeline;
  const redraw = () => (saveConfig(), rerenderSheet(), render());
  const rowEls = () => [...document.querySelectorAll(".quick-list .qrow")];
  const groupSelect = (r) =>
    h("label", { class: "field" }, h("span", {}, "Group"),
      dropdown({ id: "grp" + (r.id || r.plugin + (r.part || "")), label: "Group", value: r.group || "", options: [{ value: "", label: "No group" }, ...(pre.groups || []).map((g) => ({ value: g.id, label: g.name }))], onPick: (v) => ((r.group = v), redraw()) }));

  const details = (r, i) => {
    if (r.type === "piece")
      return h("div", { class: "pipe-details" },
        h("label", { class: "field" }, h("span", {}, "Name"), h("input", { value: r.name || "", oninput: (e) => ((r.name = e.target.value), saveConfig()) })),
        h("label", { class: "field" }, h("span", {}, "Text"), h("textarea", { rows: 6, value: r.text || "", placeholder: "What to send. Empty rows aren't sent.", oninput: (e) => ((r.text = e.target.value), saveConfig()) })),
        h("label", { class: "field" }, h("span", {}, "Send it"),
          dropdown({ id: "when" + r.id, label: "Send it", value: r.when || "every", options: Object.entries(P.WHEN).map(([v, l]) => ({ value: v, label: l })), onPick: (v) => ((r.when = v), redraw()) })),
        r.when === "everyN" ? h("label", { class: "field" }, h("span", {}, "N (the first message of a site chat always gets it)"), h("input", { type: "number", min: 1, value: r.n || 5, oninput: (e) => ((r.n = Math.max(1, +e.target.value || 1)), saveConfig()) })) : null,
        r.when === "depth" ? h("label", { class: "field" }, h("span", {}, "N: how many messages up from the newest, inside the earlier chat Memory sends (0 = right after it). Without Memory's earlier messages it goes just before your message, and its place in this list doesn't matter."), h("input", { type: "number", min: 0, value: r.n ?? 0, oninput: (e) => ((r.n = Math.max(0, Math.round(+e.target.value || 0))), saveConfig()) })) : null,
        groupSelect(r),
        h("div", { class: "row" },
          h("button", { class: "small", onclick: () => copyText(r.text || "", "Copied") }, "Copy text"),
          h("button", { class: "small danger", onclick: async () => {
            if (!(await askConfirm(`Delete the system prompt “${P.rowName(r)}” from this profile?`))) return;
            pre.rows.splice(i, 1);
            S.openRow = null;
            redraw();
          } }, "Delete row")));
    if (r.type === "step") {
      const p = S.plugins.get(r.plugin);
      const own = r.part ? !!P.partOf(r) : p?.def && typeof p.def.piece === "function";
      return h("div", { class: "pipe-details" },
        h("p", { class: "muted" }, p ? p.manifest.description || "" : "This plugin isn't installed, so the row is skipped."),
        !r.part && p?.def && typeof p.def.beforeSend === "function" && !own
          ? h("label", { class: "field" }, h("span", {}, "It changes"),
              dropdown({ id: "scope" + r.plugin, label: "It changes", value: r.scope === "message" ? "message" : "above", options: [{ value: "above", label: "Everything above it" }, { value: "message", label: "Only your message" }], onPick: (v) => ((r.scope = v), redraw()) }))
          : own ? h("p", { class: "muted" }, "Its text goes where this row is.") : h("p", { class: "muted" }, "It doesn't change the message (it works on replies or chats), so its place doesn't matter."),
        groupSelect(r),
        h("div", { class: "row" },
          p ? h("button", { class: "small", onclick: () => openPluginSettings(r.plugin) }, "Plugin settings") : null,
          r.part ? h("button", { class: "small danger", onclick: async () => {
            if (!(await askConfirm(`Take “${P.rowName(r)}” out of this profile?`, "Take out"))) return;
            pre.rows.splice(i, 1);
            S.openRow = null;
            redraw();
          } }, "Take out") : null));
    }
    return h("div", { class: "pipe-details" }, h("p", { class: "muted" }, "Your message goes here. Move it to put rows before or after it."));
  };

  const rowEl = (r, i) => {
    const live = r.type === "message" || P.rowLive(pre, r);
    const g = r.group && (pre.groups || []).find((x) => x.id === r.group);
    const open = S.openRow === r;
    const sub = plainKind(r) + (r.type === "piece" ? " · " + P.whenLabel(r) + (!(r.text || "").trim() ? " · empty, not sent" : "") : "") + (g ? ` · ${g.name}${g.on === false ? " (off)" : ""}` : "");
    return h("div", { class: "prow" + (open ? " open" : "") },
      h("div", { class: "qrow" + (live ? "" : " off") + (r.type === "message" ? " anchor" : "") },
        h("button", { class: "rbtn grip", "aria-label": "Drag to reorder", title: "Drag to reorder", onpointerdown: (e) => reorderDrag(e, rowEls, i, (from, to) => (P.moveRowTo(pre, from, to), rerenderSheet(), render())), onclick: (e) => e.stopPropagation() }, svgIcon("grip")),
        h("button", { class: "ghost grow qname", "aria-expanded": String(open), onclick: () => ((S.openRow = open ? null : r), rerenderSheet()) }, h("b", {}, P.rowName(r)), h("small", { class: "muted" }, sub)),
        h("span", { class: "mv" },
          rbtn("up", "Move up", () => (P.moveRow(pre, i, -1), rerenderSheet(), render()), i === 0 ? "dis" : ""),
          rbtn("down", "Move down", () => (P.moveRow(pre, i, 1), rerenderSheet(), render()), i === pre.rows.length - 1 ? "dis" : "")),
        r.type === "message" ? h("span", { class: "sw-gap" }) : switchBtn(r.on !== false, P.rowName(r) + " on or off", (v) => ((r.on = v), redraw()))),
      open ? details(r, i) : null);
  };

  let first = true;
  const preview = h("pre", { class: "pipe-preview" });
  const showPreview = () => (preview.textContent = P.previewMessage(prof, { first }) || "(nothing)");
  const isActive = prof === profile();
  return [
    profileDropdown({ id: "edit", current: prof, sub: prof === profile() ? "Editing the active profile · tap to change" : "Editing · not the active profile", showEdit: false, pick: (p) => ((S.editProfile = p.id), (S.openRow = null), rerenderSheet()) }),
    h("h3", {}, "Sent top to bottom"),
    h("div", { class: "quick-list" }, pre.rows.map(rowEl)),
    item({ id: "profile.add", label: "Add a row", sub: "System prompts and message plugins", chev: true, onclick: openAddRow }),
    h("h3", {}, "This profile"),
    h("label", { class: "field" }, h("span", {}, "Name"), h("input", { value: prof.name, "aria-label": "Profile name", oninput: (e) => ((prof.name = e.target.value || prof.name), saveConfig()), onblur: () => render() })),
    h("div", { class: "row" },
      isActive ? h("span", { class: "muted grow" }, "This is the profile in use.") : h("button", { class: "small primary", onclick: () => (switchProfile(prof.id), rerenderSheet()) }, "Use this profile"),
      h("button", { class: "small", onclick: () => { const c = PP.pipeline.copyProfile(prof, uniqueName(prof.name + " copy")); S.editProfile = c.id; S.openRow = null; rerenderSheet(); } }, "Duplicate"),
      h("button", { class: "small danger", disabled: S.config.profiles.length < 2, onclick: async () => {
        if (!(await askConfirm(`Delete the profile “${prof.name}”?`))) return;
        S.config.profiles = S.config.profiles.filter((x) => x !== prof);
        if (S.config.activeProfile === prof.id) S.config.activeProfile = S.config.profiles[0].id;
        S.editProfile = S.config.activeProfile;
        redraw();
      } }, "Delete")),
    h("h3", {}, "Groups"),
    (pre.groups || []).length ? null : h("p", { class: "muted" }, "A group's switch turns all its rows on or off. Put a row in a group from its details."),
    ...(pre.groups || []).map((g) => h("div", { class: "plugin-row" },
      switchBtn(g.on !== false, g.name + " on or off", (v) => ((g.on = v), redraw())),
      h("input", { class: "grow", value: g.name, "aria-label": "Group name", oninput: (e) => ((g.name = e.target.value), saveConfig(), render()) }),
      h("small", { class: "muted" }, `${pre.rows.filter((r) => r.group === g.id).length} rows`),
      h("button", { class: "small danger", "aria-label": "Delete group", onclick: async () => (await askConfirm(`Delete the group “${g.name}”? Its rows stay, without a group.`)) && (P.removeGroup(pre, g), rerenderSheet(), render()) }, "✕"))),
    h("div", { class: "row" }, h("button", { class: "small", onclick: async () => { const n = await askText("Group name", "Group " + ((pre.groups || []).length + 1), "Add"); if (n) (P.addGroup(pre, n), rerenderSheet(), render()); } }, "Add group")),
    h("h3", {}, "What will be sent"),
    h("div", { class: "row" },
      h("label", { class: "field inline" }, h("span", {}, "As the first message of a site chat"), h("input", { type: "checkbox", checked: first, onchange: (e) => ((first = e.target.checked), showPreview()) })),
      h("button", { class: "small", onclick: showPreview }, "Show")),
    (showPreview(), preview),
  ];
};

// "Add a row": a system prompt (new, or from the library) or a message plugin's part.
const openAddRow = () =>
  openSheet("Add a row", () => {
    const prof = profileById(S.editProfile);
    const pre = prof.pipe;
    const P = PP.pipeline;
    const lib = S.promptLib || [];
    if (!S.promptLib) P.promptLibrary().then((l) => ((S.promptLib = l), rerenderSheet()));
    const put = (row) => {
      const at = pre.rows.findIndex((r) => r.type === "message");
      pre.rows.splice(Math.max(0, at), 0, row);
      S.openRow = row;
      saveConfig();
      openProfileEditor(prof.id, row);
    };
    return [
      backRow("Edit profile", () => openProfileEditor(prof.id)),
      h("h3", {}, "System prompts"),
      sheetRow({ icon: "plus", label: "New system prompt", sub: "Write one for this profile", onclick: () => put(P.piece("New system prompt", "")) }),
      ...lib.map((x) => sheetRow({ icon: "chat", label: x.name || x.text.trim().split("\n")[0].slice(0, 40), sub: "From your library. A copy goes in.", onclick: () => put(P.piece(x.name || "", x.text)) })),
      h("h3", {}, "Message plugins"),
      ...(P.pluginPieces().length
        ? P.pluginPieces().map((x) => sheetRow({ icon: "layers", label: x.name, sub: pre.rows.some((r) => r.plugin === x.plugin && r.part === x.part) ? "Already in this profile" : "Adds text where it sits", onclick: () => put(P.partRow(x.plugin, x.part)) }))
        : [h("p", { class: "muted" }, "No plugin gives rows of its own. Plugins you switch on or off are in the list above.")]),
    ];
  });

// ---------- export and import ----------
const fileSlug = (s) => (s || "profile").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "profile";

// What a profile file holds: the rows, groups, per-plugin settings, and which
// plugins it needs (sites belong to chats, so the site is not in it).
const profileData = (prof) => ({
  name: prof.name,
  rows: prof.pipe.rows,
  groups: prof.pipe.groups || [],
  plugins: (prof.plugins || []).map((e) => ({ id: e.id, settings: e.settings || {} })),
  requires: [...new Set(prof.pipe.rows.filter((r) => r.type === "step").map((r) => r.plugin))],
});
const exportProfiles = async (list) => {
  const one = list.length === 1;
  const file = one ? { promptpipe: "profile", version: 1, profile: profileData(list[0]) } : { promptpipe: "profiles", version: 1, profiles: list.map(profileData) };
  const path = await exportFile(one ? fileSlug(list[0].name) + ".profile.json" : "profiles.json", JSON.stringify(file, null, 2) + "\n");
  if (path) S.lastExport = path;
};

// Reads a profile file's text into [{ ...profileData }] or throws why not.
const parseProfiles = (text) => {
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new Error("That is not a profile file (it isn't JSON)");
  }
  const list = j.promptpipe === "profile" ? [j.profile] : j.promptpipe === "profiles" ? j.profiles : null;
  if (!list || !list.length || list.some((p) => !p || !p.name || !Array.isArray(p.rows))) throw new Error("That is not a promptpipe profile file");
  return list;
};

// Add the profiles. mode on a name that exists: both (add "Name (2)"), replace, skip.
const importProfiles = (list, mode) => {
  const made = []; // the profile objects added or replaced
  for (const d of list) {
    const clash = S.config.profiles.find((p) => p.name === d.name);
    if (clash && mode === "skip") continue;
    const pipe = PP.pipeline.clonePipe({ groups: d.groups || [], rows: d.rows });
    PP.pipeline.syncRows(pipe);
    const plugins = (d.plugins || []).map((e) => ({ id: e.id, on: false, settings: e.settings || {} }));
    if (clash && mode === "replace") (Object.assign(clash, { pipe, plugins }), made.push(clash));
    else {
      const prof = { id: "p" + Date.now().toString(36) + made.length, name: clash ? uniqueName(d.name) : d.name, site: profile().site || "", plugins, pipe };
      S.config.profiles.push(prof);
      made.push(prof);
    }
  }
  saveConfig();
  return made;
};

const importMode = () => S.config.importClash || "ask"; // ask | both | replace

// The screen after a file is read: what it holds, whether the plugins are here,
// and (if a name exists) what to do about it.
const openImportReview = (list) => {
  let pick = "both";
  let dontAsk = false;
  openSheet("Import", () => {
    const clashes = list.filter((d) => S.config.profiles.some((p) => p.name === d.name));
    const need = [...new Set(list.flatMap((d) => d.requires || []))];
    const go = () => {
      const mode = clashes.length ? (importMode() === "ask" ? pick : importMode()) : "both";
      if (clashes.length && importMode() === "ask" && dontAsk) (S.config.importClash = "both"), saveConfig();
      const made = importProfiles(list, mode);
      closeSheet();
      if (made.length) openProfileEditor(made[0].id);
      toast(made.length ? `Imported ${made.length} profile${made.length === 1 ? "" : "s"}` : "Nothing imported");
    };
    return [
      h("h3", {}, list.length === 1 ? "Profile" : `${list.length} profiles`),
      ...list.map((d) => sheetRow({ icon: "layers", label: d.name, sub: `${d.rows.filter((r) => r.type !== "message").length} rows` + (S.config.profiles.some((p) => p.name === d.name) ? " · the name exists" : "") })),
      need.length ? h("h3", {}, "Plugins it uses") : null,
      ...need.map((id) => sheetRow({ icon: "plugins", label: S.plugins.get(id)?.manifest?.name || id, sub: S.plugins.get(id) ? "Installed" : "Not installed: its row stays, and does nothing until you get the plugin" })),
      ...(clashes.length && importMode() === "ask"
        ? [
            h("h3", {}, `A profile named “${clashes[0].name}” already exists`),
            ...[["both", "Keep both", "Adds the new one as “Name (2)”"], ["replace", "Replace it", "Overwrites the existing one"], ["skip", "Skip", "Imports nothing for the names that exist"]].map(([k, l, sub]) => sheetRow({ label: l, sub, onclick: () => ((pick = k), rerenderSheet()), right: pick === k ? svgIcon("check") : null })),
            h("label", { class: "field inline" }, h("span", {}, "Don't ask again (keep both every time; change it in Settings › Import and export)"), h("input", { type: "checkbox", checked: dontAsk, onchange: (e) => (dontAsk = e.target.checked) })),
          ]
        : []),
      h("div", { class: "row" }, h("button", { class: "primary grow", onclick: go }, "Import")),
    ];
  });
};

const openImportProfile = () =>
  openSheet("Import a profile", () => {
    const paste = h("textarea", { rows: 5, placeholder: "Or paste the file's text here", "aria-label": "Profile text" });
    const read = (text) => {
      try {
        openImportReview(parseProfiles(text));
      } catch (e) {
        toast(e.message, "error");
      }
    };
    return [
      sheetRow({ icon: "folder", label: "Pick a file…", sub: "A .profile.json or profiles.json from Export", onclick: () => pickFiles((files) => read(files[0].text), { accept: ".json,application/json,text/*" }) }),
      paste,
      h("div", { class: "row" }, h("button", { class: "small primary", onclick: () => paste.value.trim() && read(paste.value) }, "Import the pasted text")),
    ];
  });
