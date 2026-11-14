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

// The profile dropdown, as in the wireframe. Closed: the profile (and Edit
// beside it). Open: every profile (● is this one) with Edit, or Use where it
// isn't the active one, then + New, Import…, Export this, Export all.
const profileDropdown = ({ id, current, pick, sub, showEdit = true }) => {
  const open = !!S.dd[id];
  const head = h("button", { class: "it", "data-row": id === "edit" ? "plugins.cur" : "site.profile", "aria-expanded": String(open), onclick: () => ddToggle(id) },
    h("div", { class: "g" }, current.name, h("small", {}, sub || (current === profile() ? "Active profile · tap to switch or edit" : "Not the active profile"))),
    h("span", { class: "ch" }, svgIcon(open ? "up" : "down")));
  if (!open) return showEdit ? h("div", { class: "ddrow" }, head, h("button", { class: "pill", "aria-label": "Edit " + current.name, onclick: () => openProfileEditor(current.id) }, svgIcon("edit"), "Edit")) : head;
  const choose = (p) => ((S.dd[id] = false), pick(p));
  return h("div", { class: "dd" },
    head,
    h("div", { class: "dd-list", role: "listbox" }, S.config.profiles.map((p) =>
      h("div", { class: "it", role: "option", "aria-selected": String(p === current) },
        h("button", { onclick: () => choose(p) }, h("span", { class: "on" }, p === current ? "●" : "○"), h("span", { class: "g" }, p.name, p === profile() ? h("small", {}, "Active") : null)),
        showEdit
          ? h("button", { class: "pill", "aria-label": "Edit " + p.name, onclick: () => openProfileEditor(p.id) }, svgIcon("edit"), "Edit")
          : p !== profile() ? h("button", { class: "pill", onclick: () => (switchProfile(p.id), rerenderSheet()) }, "Use") : null))),
    h("div", { class: "chips" },
      h("button", { class: "pill", onclick: openNewProfile }, "+ New"),
      h("button", { class: "pill", onclick: openImportProfile }, "Import…"),
      h("button", { class: "pill", onclick: () => exportProfiles([current]) }, "Export this"),
      h("button", { class: "pill", onclick: () => exportProfiles(S.config.profiles) }, "Export all")));
};

// ---------- switching, making, removing ----------
// Rename; chats saved with the old name still find it (aka).
const renameProfile = async (prof) => {
  const n = (await askText("Rename the profile", prof.name, "Rename"))?.trim();
  if (!n || n === prof.name) return;
  if (S.config.profiles.some((p) => p !== prof && p.name === n)) return toast(`There is already a profile “${n}”`, "error");
  prof.aka = [...new Set([...(prof.aka || []), prof.name])].filter((x) => x !== n);
  if (S.chat && profileNamed(S.chat.meta.profile) === prof) S.chat.meta.profile = n;
  prof.name = n;
  saveConfig();
};
// Switching sets the open chat's profile (its own switches start over from the new
// profile's) and the one new chats start with.
const switchProfile = (id) => {
  S.config.activeProfile = id;
  const chat = S.chat;
  if (chat && profileNamed(chat.meta.profile)?.id !== id) {
    chat.meta.profile = profile().name;
    PP.pipeline?.clearChatSwitches(chat);
    saveSwitches(chat);
  }
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

// "+ New": a name and a starter (Plain, Writing feedback, Dialogue & Role play, Story & Prose).
const openNewProfile = () => {
  let name = "";
  let starter = "plain";
  openSheet("New profile", () => {
    const go = () => {
      const p = PP.pipeline.makeProfile(uniqueName(name.trim() || "New profile"), starter);
      saveConfig();
      S.dd = {};
      openProfileEditor(p.id);
    };
    const input = h("input", { placeholder: "Name", value: name, "aria-label": "Profile name", oninput: (e) => (name = e.target.value), onkeydown: (e) => e.key === "Enter" && go() });
    autofocus(input);
    return [
      h("div", { class: "lbl" }, "Name"),
      h("label", { class: "search" }, input),
      h("div", { class: "lbl" }, "Start from"),
      ...PP.pipeline.presets().map((t) => item({ label: t.name, sub: t.rows.filter((r) => r.type !== "message").length + " rows", radio: starter === t.id, onclick: () => ((starter = t.id), rerenderSheet()) })),
      item({ prim: true, label: "Make the profile", onclick: go }),
    ];
  }, { back: () => openPlugins("profile") });
};

// ---------- the editor ----------
S.editProfile = "";

// The Profile tab of the Plugins screen is the editor (as in the wireframe).
// row: open that row's page.
const openProfileEditor = (id, row = null) => {
  S.editProfile = id || S.editProfile || profile().id;
  if (row) return openRowPage(row);
  openPlugins("profile");
};
const editedProfile = () => profileById(S.editProfile);
const rowTitle = (r) => (r.type === "piece" ? "System prompt: " : "") + PP.pipeline.rowName(r);

// The rows top to bottom (grip, name, move, switch), then Add a row, then
// what else a profile has: use it, rename, duplicate, delete, groups, preview.
const editorBody = () => {
  const prof = editedProfile();
  const pre = prof.pipe;
  const P = PP.pipeline;
  const redraw = () => (saveConfig(), rerenderSheet(), render());
  const rowEls = () => [...document.querySelectorAll("[data-pipe]")];
  const rowEl = (r, i) => {
    const live = r.type === "message" || P.rowLive(pre, r);
    const g = r.group && (pre.groups || []).find((x) => x.id === r.group);
    const extra = [r.type === "piece" && r.when && r.when !== "every" ? P.whenLabel(r) : "", r.type === "piece" && !(r.text || "").trim() ? "empty, not sent" : "", g ? g.name + (g.on === false ? " (off)" : "") : ""].filter(Boolean);
    return h("div", { class: "it" + (live ? "" : " off"), "data-pipe": i, "data-row": "plugins.row" + i },
      h("button", { class: "grip", "aria-label": "Drag to reorder", title: "Drag to reorder", onpointerdown: (e) => reorderDrag(e, rowEls, i, (from, to) => (P.moveRowTo(pre, from, to), redraw())), onclick: (e) => e.stopPropagation() }, svgIcon("grip")),
      h("button", { class: "g", title: "Open this row", onclick: () => openRowPage(r) }, rowTitle(r), h("small", {}, [plainKind(r), ...extra].join(" · "))),
      moveBtns(i, pre.rows.length, (d) => (P.moveRow(pre, i, d), redraw())),
      r.type === "message" ? null : switchBtn(r.on !== false, rowTitle(r) + " on or off", (v) => ((r.on = v), redraw())));
  };
  const isActive = prof === profile();
  return [
    profileDropdown({ id: "edit", current: prof, showEdit: false, sub: isActive ? "Editing the active profile · tap to change" : "Editing · not the active profile", pick: (p) => ((S.editProfile = p.id), rerenderSheet()) }),
    h("div", { class: "lbl" }, "Sent top to bottom"),
    ...pre.rows.map(rowEl),
    item({ id: "plugins.add", label: "Add a row", sub: "System prompts and message plugins", chev: true, onclick: openAddRow }),
    h("div", { class: "lbl" }, "This profile"),
    isActive ? null : item({ id: "plugins.use", label: "Use this profile", sub: "Make it the active one", onclick: () => (switchProfile(prof.id), rerenderSheet()) }),
    item({ id: "plugins.rename", label: "Rename", sub: prof.name, onclick: () => renameProfile(prof).then(redraw) }),
    item({ id: "plugins.dup", label: "Duplicate", sub: "A copy to change", onclick: () => ((S.editProfile = PP.pipeline.copyProfile(prof, uniqueName(prof.name + " copy")).id), rerenderSheet()) }),
    item({ id: "plugins.groups", label: "Groups", sub: (pre.groups || []).length ? (pre.groups || []).map((g) => g.name).join(", ") : "One switch for several rows", chev: true, onclick: openGroups }),
    item({ id: "plugins.preview", label: "What will be sent", sub: "The message with these rows", chev: true, onclick: openPreview }),
    S.config.profiles.length > 1 ? item({ id: "plugins.delete", cls: "danger", label: "Delete this profile", onclick: async () => {
      if (!(await askConfirm(`Delete the profile “${prof.name}”?`))) return;
      S.config.profiles = S.config.profiles.filter((x) => x !== prof);
      if (S.config.activeProfile === prof.id) S.config.activeProfile = S.config.profiles[0].id;
      S.editProfile = S.config.activeProfile;
      redraw();
    } }) : null,
  ];
};

// One row's page: what it is and its choices, as rows.
const openRowPage = (r) =>
  openSheet(rowTitle(r), () => {
    const prof = editedProfile();
    const pre = prof.pipe;
    const P = PP.pipeline;
    const i = pre.rows.indexOf(r);
    if (i < 0) return [item({ label: "This row isn't in the profile any more" })];
    const redraw = () => (saveConfig(), rerenderSheet(), render());
    const groupRows = () => [
      h("div", { class: "lbl" }, "Group"),
      item({ label: "No group", radio: !r.group, onclick: () => ((r.group = ""), redraw()) }),
      ...(pre.groups || []).map((g) => item({ label: g.name, sub: g.on === false ? "Off" : "", radio: r.group === g.id, onclick: () => ((r.group = g.id), redraw()) })),
    ];
    const takeOut = (what) => item({ cls: "danger", label: what, onclick: async () => {
      if (!(await askConfirm(`Take “${P.rowName(r)}” out of this profile?`, "Take out"))) return;
      pre.rows.splice(pre.rows.indexOf(r), 1);
      saveConfig();
      render();
      openPlugins("profile");
    } });
    if (r.type === "message") return [item({ label: "Your message", sub: "Your text goes here. Move it to put rows before or after it." })];
    const onRow = item({ label: "On", sub: P.rowLive(pre, r) || r.on === false ? "" : "Its group is off", toggle: r.on !== false, onclick: () => ((r.on = r.on === false), redraw()) });
    if (r.type === "piece") {
      const n = r.when === "depth" ? r.n ?? 0 : r.n || 5;
      return [
        onRow,
        h("div", { class: "lbl" }, "Name"),
        h("label", { class: "search" }, h("input", { value: r.name || "", "aria-label": "Name", oninput: (e) => ((r.name = e.target.value), saveConfig()), onblur: () => render() })),
        h("div", { class: "lbl" }, "Text"),
        h("textarea", { class: "box", rows: 7, value: r.text || "", "aria-label": "Text", placeholder: "What to send. Empty rows aren't sent.", oninput: (e) => ((r.text = e.target.value), saveConfig()) }),
        h("div", { class: "lbl" }, "Send it"),
        ...Object.entries(P.WHEN).map(([v, l]) => item({ label: l, radio: (r.when || "every") === v, onclick: () => ((r.when = v), redraw()) })),
        r.when === "everyN" || r.when === "depth"
          ? item({ label: r.when === "depth" ? "Messages up from the newest" : "Every how many messages", sub: r.when === "depth" ? "Inside the earlier chat Memory sends (0 = right after it). Without it, just before your message." : "The first message of a site chat always gets it.", right: String(n), onclick: async () => {
              const v = await askText(r.when === "depth" ? "Messages up from the newest (0 or more)" : "Every how many messages (1 or more)", String(n), "Set");
              if (v != null && v !== "") ((r.n = r.when === "depth" ? Math.max(0, Math.round(+v || 0)) : Math.max(1, Math.round(+v || 1))), redraw());
            } })
          : null,
        ...groupRows(),
        h("div", { class: "lbl" }, "More"),
        item({ label: "Copy the text", onclick: () => copyText(r.text || "", "Copied") }),
        takeOut("Delete this system prompt"),
      ];
    }
    const p = S.plugins.get(r.plugin);
    const own = r.part ? !!P.partOf(r) : p?.def && typeof p.def.piece === "function";
    const scoped = !r.part && p?.def && typeof p.def.beforeSend === "function" && !own;
    return [
      onRow,
      item({ label: p ? p.manifest.name || p.id : r.plugin, sub: p ? p.manifest.description || plainKind(r) : "This plugin isn't installed, so the row is skipped." }),
      ...(scoped
        ? [h("div", { class: "lbl" }, "It changes"),
           item({ label: "Everything above it", radio: r.scope !== "message", onclick: () => ((r.scope = "above"), redraw()) }),
           item({ label: "Only your message", radio: r.scope === "message", onclick: () => ((r.scope = "message"), redraw()) }),
           item({ label: "Only the blocks I pick", sub: "Rows above it, and your message", radio: r.scope === "pick", onclick: () => ((r.scope = "pick"), (r.pick = r.pick || ["message"]), redraw()) }),
           ...(r.scope === "pick"
             ? P.pickable(pre, r).map((b) => item({ label: b.name, toggle: (r.pick || []).includes(b.key), onclick: () => ((r.pick = (r.pick || []).includes(b.key) ? r.pick.filter((k) => k !== b.key) : [...(r.pick || []), b.key]), redraw()) }))
             : [])]
        : [item({ label: own ? "Its text goes where this row is." : "It doesn't change the message (it works on replies or chats), so its place doesn't matter." })]),
      ...groupRows(),
      h("div", { class: "lbl" }, "More"),
      p ? item({ label: "Plugin settings", chev: true, onclick: () => openPluginSettings(r.plugin) }) : null,
      takeOut("Take it out of this profile"),
    ];
  }, { back: () => openPlugins("profile") });

// Groups: one switch turns all of a group's rows on or off.
const openGroups = () =>
  openSheet("Groups", () => {
    const pre = editedProfile().pipe;
    const P = PP.pipeline;
    const redraw = () => (saveConfig(), rerenderSheet(), render());
    return [
      h("div", { class: "sub2" }, "A group's switch turns all its rows on or off. Put a row in a group from its page."),
      ...(pre.groups || []).map((g) => h("div", { class: "it" },
        h("button", { class: "g", onclick: async () => { const n = await askText("Group name", g.name, "Rename"); if (n) ((g.name = n), redraw()); } }, g.name, h("small", {}, `${pre.rows.filter((r) => r.group === g.id).length} rows · tap to rename`)),
        h("button", { class: "act", "aria-label": "Delete group " + g.name, onclick: async () => (await askConfirm(`Delete the group “${g.name}”? Its rows stay, without a group.`)) && (P.removeGroup(pre, g), redraw()) }, svgIcon("close")),
        switchBtn(g.on !== false, g.name + " on or off", (v) => ((g.on = v), redraw())))),
      item({ label: "Add a group", onclick: async () => { const n = await askText("Group name", "Group " + ((pre.groups || []).length + 1), "Add"); if (n) (P.addGroup(pre, n), redraw()); } }),
    ];
  }, { back: () => openPlugins("profile") });

// What the rows make of a message, first message of a site chat or a later one.
const openPreview = () => {
  let first = true;
  openSheet("What will be sent", () => [
    h("div", { class: "seg wide" },
      h("button", { class: first ? "on" : "", onclick: () => ((first = true), rerenderSheet()) }, "First message"),
      h("button", { class: first ? "" : "on", onclick: () => ((first = false), rerenderSheet()) }, "A later one")),
    h("pre", { class: "pipe-preview" }, PP.pipeline.previewMessage(editedProfile(), { first }) || "(nothing)"),
  ], { back: () => openPlugins("profile") });
};

// "Add a row": a system prompt (new, or from the library) or a message plugin.
const openAddRow = () =>
  openSheet("Add a row", () => {
    const prof = editedProfile();
    const pre = prof.pipe;
    const P = PP.pipeline;
    const lib = S.promptLib || [];
    if (!S.promptLib) P.promptLibrary().then((l) => ((S.promptLib = l), rerenderSheet()));
    const put = (row, open) => {
      if (row.type === "piece") pre.rows.splice(Math.max(0, pre.rows.findIndex((r) => r.type === "message")), 0, row);
      else pre.rows.push(row);
      saveConfig();
      render();
      if (open) openRowPage(row);
      else (openPlugins("profile"), toast("Added to the profile"));
    };
    const has = (id, part) => pre.rows.some((r) => r.type === "step" && r.plugin === id && (r.part || "") === (part || ""));
    const steps = P.pipeSteps();
    const parts = P.pluginPieces();
    return [
      h("div", { class: "lbl" }, "System prompts"),
      item({ id: "addpiece.new", label: "New system prompt", sub: "Write one for this profile", onclick: () => put(P.piece("New system prompt", ""), true) }),
      ...lib.map((x) => item({ label: x.name || x.text.trim().split("\n")[0].slice(0, 40), onclick: () => put(P.piece(x.name || "", x.text)) })),
      h("div", { class: "lbl" }, "Message plugins"),
      ...steps.map((p) => item({ label: p.manifest.name || p.id, sub: has(p.id) ? "Already in this profile" : "", onclick: () => (has(p.id) ? toast("Already in this profile") : put(P.step(p.id, true, p.id === "base64" ? "message" : "above"))) })),
      ...parts.map((x) => item({ label: x.name, sub: has(x.plugin, x.part) ? "Already in this profile" : "", onclick: () => put(P.partRow(x.plugin, x.part)) })),
      steps.length || parts.length ? null : item({ label: "No message plugins yet", sub: "Get them in the Library", chev: true, onclick: () => openPlugins("library") }),
    ];
  }, { back: () => openPlugins("profile") });

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
      const prof = { id: "p" + Date.now().toString(36) + made.length, name: clash ? uniqueName(d.name) : d.name, plugins, pipe };
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
