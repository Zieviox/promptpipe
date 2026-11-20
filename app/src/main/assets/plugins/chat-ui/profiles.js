"use strict";
// Chat screen: profiles. A profile is an ordered list of blocks (System prompts
// and plugins, with "Your message" anywhere between them) plus the plugins'
// settings. This file has the profile dropdown, the editor, adding blocks, and
// importing and exporting profiles.

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
// Switching sets the open chat's profile (its own toggles start over from the new
// profile's) and the one new chats start with.
const switchProfile = (id) => {
  S.config.activeProfile = id;
  const chat = S.chat;
  if (chat && profileNamed(chat.meta.profile)?.id !== id) {
    chat.meta.profile = profile().name;
    PP.profiles?.clearChatToggles(chat);
    saveToggles(chat);
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

// "+ New": a name and a template (Plain, Writing feedback, Dialogue & Role play, Story & Prose).
const openNewProfile = () => {
  let name = "";
  let template = "plain";
  openSheet("New profile", () => {
    const go = () => {
      const p = PP.profiles.makeProfile(uniqueName(name.trim() || "New profile"), template);
      saveConfig();
      S.dd = {};
      openProfileEditor(p.id);
    };
    const input = h("input", { placeholder: "Name", value: name, "aria-label": "Profile name", oninput: (e) => (name = e.target.value), onkeydown: (e) => e.key === "Enter" && go() });
    autofocus(input);
    return [
      h("div", { class: "lbl" }, "Name"),
      h("label", { class: "search" }, input),
      h("div", { class: "lbl" }, "Template"),
      ...PP.profiles.templates().map((t) => item({ id: "tpl." + t.id, label: t.name, sub: t.blocks.filter((b) => b.type !== "message").length + " blocks", radio: template === t.id, onclick: () => ((template = t.id), rerenderSheet()) })),
      item({ prim: true, label: "Make the profile", onclick: go }),
    ];
  }, { back: () => openPlugins("profile") });
};

// ---------- the editor ----------
S.editProfile = "";

// The Profile tab of the Plugins screen is the editor (as in the wireframe).
// block: open that block's page.
const openProfileEditor = (id, block = null) => {
  S.editProfile = id || S.editProfile || profile().id;
  if (block) return openBlockPage(block);
  openPlugins("profile");
};
const editedProfile = () => profileById(S.editProfile);
const blockTitle = (b) => PP.profiles.blockName(b);

// The blocks top to bottom (grip, name, move, toggle), then Add a block, then
// what else a profile has: use it, rename, duplicate, delete, groups, preview.
const editorBody = () => {
  const prof = editedProfile();
  const P = PP.profiles;
  const redraw = () => (saveConfig(), rerenderSheet(), render());
  const blockEls = () => [...document.querySelectorAll("[data-blk]")];
  const blockEl = (b, i) => {
    const live = b.type === "message" || P.blockLive(prof, b);
    const g = b.group && (prof.groups || []).find((x) => x.id === b.group);
    const extra = [b.type === "prompt" && b.when && b.when !== "every" ? P.whenLabel(b) : "", b.type === "prompt" && !P.promptText(b).trim() ? "empty, not sent" : "", g ? g.name + (g.on === false ? " (off)" : "") : ""].filter(Boolean);
    return h("div", { class: "it" + (live ? "" : " off"), "data-blk": i, "data-row": "plugins.block" + i, "data-key": "blk:" + P.blockKey(b) },
      h("button", { class: "grip", "aria-label": "Drag to reorder", title: "Drag to reorder", onpointerdown: (e) => reorderDrag(e, blockEls, i, (from, to) => (P.moveBlockTo(prof, from, to), redraw())), onclick: (e) => e.stopPropagation() }, svgIcon("grip")),
      h("button", { class: "g", title: "Open this block", onclick: () => openBlockPage(b) }, blockTitle(b), h("small", {}, [blockType(b), ...extra].join(" · "))),
      moveBtns(i, prof.blocks.length, (d) => (P.moveBlock(prof, i, d), redraw())),
      b.type === "message" ? null : toggleBtn(b.on !== false, blockTitle(b) + " on or off", (v) => ((b.on = v), redraw())));
  };
  const isActive = prof === profile();
  return [
    profileDropdown({ id: "edit", current: prof, showEdit: false, sub: isActive ? "Editing the active profile · tap to change" : "Editing · not the active profile", pick: (p) => ((S.editProfile = p.id), rerenderSheet()) }),
    h("div", { class: "lbl" }, "Sent top to bottom"),
    ...prof.blocks.map(blockEl),
    item({ id: "plugins.add", label: "Add a block", sub: "System prompts and plugins", chev: true, onclick: openAddBlock }),
    h("div", { class: "lbl" }, "This profile"),
    isActive ? null : item({ id: "plugins.use", label: "Use this profile", sub: "Make it the active one", onclick: () => (switchProfile(prof.id), rerenderSheet()) }),
    item({ id: "plugins.rename", label: "Rename", sub: prof.name, onclick: () => renameProfile(prof).then(redraw) }),
    item({ id: "plugins.dup", label: "Duplicate", sub: "A copy to change", onclick: () => ((S.editProfile = P.copyProfile(prof, uniqueName(prof.name + " copy")).id), rerenderSheet()) }),
    item({ id: "plugins.groups", label: "Groups", sub: (prof.groups || []).length ? prof.groups.map((g) => g.name).join(", ") : "One toggle for several blocks", chev: true, onclick: openGroups }),
    item({ id: "plugins.preview", label: "What will be sent", sub: "The message these blocks make", chev: true, onclick: openPreview }),
    S.config.profiles.length > 1 ? item({ id: "plugins.delete", cls: "danger", label: "Delete this profile", onclick: async () => {
      if (!(await askConfirm(`Delete the profile “${prof.name}”?`))) return;
      S.config.profiles = S.config.profiles.filter((x) => x !== prof);
      if (S.config.activeProfile === prof.id) S.config.activeProfile = S.config.profiles[0].id;
      S.editProfile = S.config.activeProfile;
      redraw();
    } }) : null,
  ];
};

// One block's page: what it is and its choices, as rows of the sheet.
const openBlockPage = (b) =>
  openSheet(() => blockTitle(b), () => {
    const prof = editedProfile();
    const P = PP.profiles;
    if (!prof.blocks.includes(b)) return [item({ label: "This block isn't in the profile any more" })];
    const redraw = () => (saveConfig(), rerenderSheet(), render());
    const groupItems = () => [
      h("div", { class: "lbl" }, "Group"),
      item({ id: "blk.nogroup", label: "No group", radio: !b.group, onclick: () => ((b.group = ""), redraw()) }),
      ...(prof.groups || []).map((g) => item({ id: "blk.g" + g.id, label: g.name, sub: g.on === false ? "Off" : "", radio: b.group === g.id, onclick: () => ((b.group = g.id), redraw()) })),
    ];
    const takeOut = (what) => item({ id: "blk.out", cls: "danger", label: what, onclick: async () => {
      if (!(await askConfirm(`Take “${P.blockName(b)}” out of this profile?`, "Take out"))) return;
      prof.blocks.splice(prof.blocks.indexOf(b), 1);
      saveConfig();
      render();
      openPlugins("profile");
    } });
    if (b.type === "message") return [item({ label: "Your message", sub: "Your text goes here. Move it to put blocks before or after it." })];
    const onItem = item({ id: "blk.on", label: "On", sub: P.blockLive(prof, b) || b.on === false ? "" : "Its group is off", toggle: b.on !== false, onclick: () => ((b.on = b.on === false), redraw()) });
    if (b.type === "prompt") {
      const n = b.when === "depth" ? b.n ?? 0 : b.n || 5;
      const lib = b.link ? P.libPrompt(b.link) : null;
      return [
        onItem,
        ...(b.link
          ? [
              h("div", { class: "lbl" }, "Linked from the prompt library"),
              lib
                ? item({ id: "blk.lib", label: P.libName(lib), sub: libSnippet(lib) + " · tap to edit it in the library (every profile that links it changes)", chev: true, onclick: () => openLibEditor(lib.id, () => openBlockPage(b)) })
                : item({ id: "blk.lib", cls: "danger", label: "No longer in the library", sub: "It sends nothing. Take it out, or link another prompt." }),
              lib ? item({ id: "blk.unlink", label: "Make it this profile's own copy", sub: "Unlinks it: later changes in the library don't reach it", onclick: () => (Object.assign(b, { name: lib.name || "", text: lib.text }), delete b.link, redraw()) }) : null,
            ]
          : [
              h("div", { class: "lbl" }, "Name"),
              h("label", { class: "search" }, h("input", { value: b.name || "", "aria-label": "Name", oninput: (e) => ((b.name = e.target.value), saveConfig()), onblur: () => render() })),
              h("div", { class: "lbl" }, "Text"),
              h("textarea", { class: "box", rows: 7, value: b.text || "", "aria-label": "Text", placeholder: "What to send. An empty one isn't sent.", oninput: (e) => ((b.text = e.target.value), saveConfig()) }),
              item({ id: "blk.save", label: "Save to the library and link it", sub: "Then other profiles can link it too, and one edit changes them all", onclick: async () => {
                if (!(b.text || "").trim()) return toast("Write something first", "error");
                const lp = P.newLibPrompt((b.name || "").trim(), b.text.trim());
                P.library.prompts.unshift(lp);
                await P.saveLibrary("added " + P.libName(lp));
                Object.assign(b, { link: lp.id });
                delete b.name;
                delete b.text;
                redraw();
              } }),
            ]),
        h("div", { class: "lbl" }, "Send it"),
        ...Object.entries(P.WHEN).map(([v, l]) => item({ id: "blk.when." + v, label: l, radio: (b.when || "every") === v, onclick: () => ((b.when = v), redraw()) })),
        b.when === "everyN" || b.when === "depth"
          ? item({ id: "blk.n", label: b.when === "depth" ? "Messages up from the newest" : "Every how many messages", sub: b.when === "depth" ? "Inside the earlier chat Memory sends (0 = right after it). Without it, just before your message." : "The first message of a site chat always gets it.", right: String(n), onclick: async () => {
              const v = await askText(b.when === "depth" ? "Messages up from the newest (0 or more)" : "Every how many messages (1 or more)", String(n), "Set");
              if (v != null && v !== "") ((b.n = b.when === "depth" ? Math.max(0, Math.round(+v || 0)) : Math.max(1, Math.round(+v || 1))), redraw());
            } })
          : null,
        ...groupItems(),
        h("div", { class: "lbl" }, "More"),
        item({ id: "blk.copy", label: "Copy the text", onclick: () => copyText(P.promptText(b), "Copied") }),
        takeOut("Take this System prompt out of the profile"),
      ];
    }
    const p = S.plugins.get(b.plugin);
    const own = b.textId ? !!P.textOfBlock(b) : p?.def && typeof p.def.text === "function";
    const scoped = !b.textId && p?.def && typeof p.def.beforeSend === "function" && !own;
    return [
      onItem,
      item({ label: p ? p.manifest.name || p.id : b.plugin, sub: p ? p.manifest.description || blockType(b) : "This plugin isn't installed, so the block is skipped." }),
      ...(scoped
        ? [h("div", { class: "lbl" }, "It changes"),
           item({ id: "blk.scope.above", label: "Everything above it", radio: b.scope !== "message" && b.scope !== "pick", onclick: () => ((b.scope = "above"), redraw()) }),
           item({ id: "blk.scope.message", label: "Only your message", radio: b.scope === "message", onclick: () => ((b.scope = "message"), redraw()) }),
           item({ id: "blk.scope.pick", label: "Only the blocks I pick", sub: "Blocks above it, and your message", radio: b.scope === "pick", onclick: () => ((b.scope = "pick"), (b.pick = b.pick || ["message"]), redraw()) }),
           ...(b.scope === "pick"
             ? P.pickable(prof, b).map((x) => item({ id: "blk.pick." + x.key, label: x.name, toggle: (b.pick || []).includes(x.key), onclick: () => ((b.pick = (b.pick || []).includes(x.key) ? b.pick.filter((k) => k !== x.key) : [...(b.pick || []), x.key]), redraw()) }))
             : [])]
        : [item({ label: own ? "Its text goes where this block is." : "It doesn't change the message (it works on replies or chats), so its place doesn't matter." })]),
      ...groupItems(),
      h("div", { class: "lbl" }, "More"),
      p ? item({ id: "blk.settings", label: "Plugin settings", chev: true, onclick: () => openPluginSettings(b.plugin) }) : null,
      takeOut("Take it out of this profile"),
    ];
  }, { back: () => openPlugins("profile") });

// Groups: one toggle turns all of a group's blocks on or off.
const openGroups = () =>
  openSheet("Groups", () => {
    const prof = editedProfile();
    const P = PP.profiles;
    const redraw = () => (saveConfig(), rerenderSheet(), render());
    return [
      h("div", { class: "sub2" }, "A group's toggle turns all its blocks on or off. Put a block in a group from its page."),
      ...(prof.groups || []).map((g) => h("div", { class: "it", "data-key": "grp:" + g.id },
        h("button", { class: "g", onclick: async () => { const n = await askText("Group name", g.name, "Rename"); if (n) ((g.name = n), redraw()); } }, g.name, h("small", {}, `${prof.blocks.filter((b) => b.group === g.id).length} blocks · tap to rename`)),
        h("button", { class: "act", "aria-label": "Delete group " + g.name, onclick: async () => (await askConfirm(`Delete the group “${g.name}”? Its blocks stay, without a group.`)) && (P.removeGroup(prof, g), redraw()) }, svgIcon("close")),
        toggleBtn(g.on !== false, g.name + " on or off", (v) => ((g.on = v), redraw())))),
      item({ id: "grp.add", label: "Add a group", onclick: async () => { const n = await askText("Group name", "Group " + ((prof.groups || []).length + 1), "Add"); if (n) (P.addGroup(prof, n), redraw()); } }),
    ];
  }, { back: () => openPlugins("profile") });

// What the blocks make of a message, first message of a site chat or a later one.
const openPreview = () => {
  let first = true;
  openSheet("What will be sent", () => [
    h("div", { class: "seg wide" },
      h("button", { class: first ? "on" : "", onclick: () => ((first = true), rerenderSheet()) }, "First message"),
      h("button", { class: first ? "" : "on", onclick: () => ((first = false), rerenderSheet()) }, "A later one")),
    h("pre", { class: "send-preview" }, PP.profiles.previewMessage(editedProfile(), { first }) || "(nothing)"),
  ], { back: () => openPlugins("profile") });
};

// "Add a block": a System prompt (new, or linked from the library) or a plugin.
const openAddBlock = () =>
  openSheet("Add a block", () => {
    const prof = editedProfile();
    const P = PP.profiles;
    const put = (b, open) => {
      if (b.type === "prompt") prof.blocks.splice(Math.max(0, prof.blocks.findIndex((x) => x.type === "message")), 0, b);
      else prof.blocks.push(b);
      saveConfig();
      render();
      if (open) openBlockPage(b);
      else (openPlugins("profile"), toast("Added to the profile"));
    };
    const has = (id, textId) => prof.blocks.some((x) => x.type === "plugin" && x.plugin === id && (x.textId || "") === (textId || ""));
    const plugins = P.blockPlugins();
    const texts = P.pluginTexts();
    const lib = [...P.library.prompts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return [
      h("div", { class: "lbl" }, "System prompts"),
      item({ id: "add.new", label: "New system prompt", sub: "Write one for this profile", onclick: () => put(P.promptBlock("New system prompt", ""), true) }),
      item({ id: "add.newlib", label: "New prompt in the library", sub: "Written once, linked here, ready for other profiles", onclick: () => openLibEditor(null, (lp) => put(P.linkedBlock(lp.id), true)) }),
      lib.length ? h("div", { class: "sub2" }, "From the prompt library (linked: edit it once, every profile changes):") : null,
      ...lib.map((x) => item({ id: "add.lib." + x.id, label: (x.pinned ? "📌 " : "") + P.libName(x), sub: libSnippet(x), onclick: () => put(P.linkedBlock(x.id)) })),
      h("div", { class: "lbl" }, "Plugins"),
      ...plugins.map((p) => item({ id: "add.pl." + p.id, label: p.manifest.name || p.id, sub: has(p.id) ? "Already in this profile" : "", onclick: () => (has(p.id) ? toast("Already in this profile") : put(P.pluginBlock(p.id, true, p.id === "base64" ? "message" : "above"))) })),
      ...texts.map((x) => item({ id: "add.tx." + x.plugin + "/" + x.textId, label: x.name, sub: has(x.plugin, x.textId) ? "Already in this profile" : "", onclick: () => put(P.textBlock(x.plugin, x.textId)) })),
      plugins.length || texts.length ? null : item({ id: "add.none", label: "No plugins yet", sub: "Get them in the Library", chev: true, onclick: () => openPlugins("library") }),
    ];
  }, { back: () => openPlugins("profile") });

// ---------- export and import ----------
const fileSlug = (s) => (s || "profile").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "profile";

// What a profile file holds (version 2): the blocks, groups, the plugins' settings, the library
// prompts its linked blocks use, and which plugins it needs (providers belong to chats, so none is in it).
const profileData = (prof) => ({
  name: prof.name,
  blocks: prof.blocks,
  groups: prof.groups || [],
  pluginSettings: prof.pluginSettings || {},
  library: [...new Set(prof.blocks.filter((b) => b.type === "prompt" && b.link).map((b) => b.link))].map((id) => PP.profiles.libPrompt(id)).filter(Boolean),
  requires: [...new Set(prof.blocks.filter((b) => b.type === "plugin").map((b) => b.plugin))],
});
const exportProfiles = async (list) => {
  const one = list.length === 1;
  const file = one ? { promptpipe: "profile", version: 2, profile: profileData(list[0]) } : { promptpipe: "profiles", version: 2, profiles: list.map(profileData) };
  const path = await exportFile(one ? fileSlug(list[0].name) + ".profile.json" : "profiles.json", JSON.stringify(file, null, 2) + "\n");
  if (path) S.lastExport = path;
};

// Reads a profile file's text into [{ ...profileData }] or throws why not.
// Version 1 files (legacy: rows) are read the old way and turned into blocks.
const parseProfiles = (text) => {
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new Error("That is not a profile file (it isn't JSON)");
  }
  const list = j.promptpipe === "profile" ? [j.profile] : j.promptpipe === "profiles" ? j.profiles : null;
  if (!list || !list.length || list.some((p) => !p || !p.name || !(Array.isArray(p.blocks) || Array.isArray(p.rows)))) /* legacy: rows */ throw new Error("That is not a promptpipe profile file");
  return list.map((p) => (Array.isArray(p.blocks) ? p : PP.profiles.legacyProfileData(p))); // legacy: version 1
};

// Add the profiles. mode on a name that exists: both (add "Name (2)"), replace, skip.
const importProfiles = async (list, mode) => {
  const made = []; // the profile objects added or replaced
  // The library prompts the files bring: added where the library doesn't have them (same id).
  const lib = PP.profiles.library.prompts;
  const adding = list.flatMap((d) => d.library || []).filter((x, i, a) => x && x.id && !lib.some((y) => y.id === x.id) && a.findIndex((y) => y.id === x.id) === i);
  if (adding.length) {
    lib.push(...adding);
    await PP.profiles.saveLibrary(`imported ${adding.length} with a profile`);
  }
  for (const d of list) {
    const clash = S.config.profiles.find((p) => p.name === d.name);
    if (clash && mode === "skip") continue;
    const blocks = PP.profiles.cloneBlocks({ groups: d.groups || [], blocks: d.blocks });
    const pluginSettings = JSON.parse(JSON.stringify(d.pluginSettings || {}));
    if (clash && mode === "replace") (Object.assign(clash, blocks, { pluginSettings }), PP.profiles.syncBlocks(clash), made.push(clash));
    else {
      const prof = { id: "p" + Date.now().toString(36) + made.length, name: clash ? uniqueName(d.name) : d.name, pluginSettings, ...blocks };
      PP.profiles.syncBlocks(prof);
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
    const go = async () => {
      const mode = clashes.length ? (importMode() === "ask" ? pick : importMode()) : "both";
      if (clashes.length && importMode() === "ask" && dontAsk) (S.config.importClash = "both"), saveConfig();
      const made = await importProfiles(list, mode);
      closeSheet();
      if (made.length) openProfileEditor(made[0].id);
      toast(made.length ? `Imported ${made.length} profile${made.length === 1 ? "" : "s"}` : "Nothing imported");
    };
    return [
      h("h3", {}, list.length === 1 ? "Profile" : `${list.length} profiles`),
      ...list.map((d) => sheetRow({ icon: "layers", label: d.name, sub: `${d.blocks.filter((b) => b.type !== "message").length} blocks` + (S.config.profiles.some((p) => p.name === d.name) ? " · the name exists" : "") })),
      need.length ? h("h3", {}, "Plugins it uses") : null,
      ...need.map((id) => sheetRow({ icon: "plugins", label: S.plugins.get(id)?.manifest?.name || id, sub: S.plugins.get(id) ? "Installed" : "Not installed: its block stays, and does nothing until you get the plugin" })),
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

const openImportProfile = () => {
  const draft = { text: "" };
  openSheet("Import a profile", () => {
    const read = (text) => {
      try {
        openImportReview(parseProfiles(text));
      } catch (e) {
        toast(e.message, "error");
      }
    };
    return [
      sheetRow({ icon: "folder", label: "Pick a file…", sub: "A .profile.json or profiles.json from Export", onclick: () => pickFiles((files) => read(files[0].text), { accept: ".json,application/json,text/*" }) }),
      h("textarea", { rows: 5, placeholder: "Or paste the file's text here", "aria-label": "Profile text", value: draft.text, oninput: (e) => (draft.text = e.target.value) }),
      h("div", { class: "row" }, h("button", { class: "small primary", onclick: () => draft.text.trim() && read(draft.text) }, "Import the pasted text")),
    ];
  });
};
